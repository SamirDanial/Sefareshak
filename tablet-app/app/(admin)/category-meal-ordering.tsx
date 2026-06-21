import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { mealService, type Meal } from "@/src/services/mealService";
import { categoryService, type Category } from "@/src/services/categoryService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useScroll } from "@/src/contexts/ScrollContext";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const FALLBACK_MEAL_IMAGE = "https://placehold.co/160x160?text=Meal";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return FALLBACK_MEAL_IMAGE;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

interface MealItem {
  id: string;
  meal: Meal;
}

export default function CategoryMealOrderingScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = params.categoryId;
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading, refreshPermissions } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const [languageKey, setLanguageKey] = useState(i18n.language);

  const canReorderCategoryMeals =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
      { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
    ]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canReorderCategoryMeals) {
      router.back();
    }
  }, [permissionsLoading, canReorderCategoryMeals, router]);
  
  // Force re-render when language changes
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setLanguageKey(lng);
    };
    
    i18n.on("languageChanged", handleLanguageChanged);
    
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [i18n]);

  const [category, setCategory] = useState<Category | null>(null);
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const loadCategoryMeals = useCallback(async () => {
    if (!categoryId) {
      router.back();
      return;
    }
    try {
      setLoading(true);
      const token = await getToken();
      const [categoryResponse, mealsResponse] = await Promise.all([
        categoryService.getCategoryById(categoryId, token || undefined),
        mealService.getMeals(
          1,
          200,
          "",
          "listOrder",
          "asc",
          categoryId,
          undefined,
          token || undefined
        ),
      ]);

      setCategory(categoryResponse);
      const categoryMeals = mealsResponse.meals || [];
      setMeals(categoryMeals.map((meal) => ({ id: meal.id, meal })));
      const ids = categoryMeals.map((meal) => meal.id);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading category meals:", error);
      setToast({
        visible: true,
        message: t("admin.categoryMealOrdering.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId, getToken, router, t]);

  useEffect(() => {
    loadCategoryMeals();
  }, [loadCategoryMeals]);

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissions();
      loadCategoryMeals();
    }, [loadCategoryMeals, refreshPermissions])
  );

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };

  const hasChanges = useMemo(
    () =>
      !arraysEqual(
        meals.map((item) => item.id),
        initialOrder
      ),
    [meals, initialOrder]
  );

  const handleDragEnd = useCallback(({ data }: { data: MealItem[] }) => {
    setMeals(data);
  }, []);

  const handleReset = useCallback(() => {
    const sortedMeals = [...meals].sort((a, b) => {
      const orderA =
        typeof a.meal.listOrder === "number" && a.meal.listOrder > 0
          ? a.meal.listOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.meal.listOrder === "number" && b.meal.listOrder > 0
          ? b.meal.listOrder
          : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return a.meal.name.localeCompare(b.meal.name);
      }
      return orderA - orderB;
    });
    setMeals(sortedMeals);
  }, [meals]);

  const handleSave = useCallback(async () => {
    if (!categoryId) return;
    try {
      setSaving(true);
      const token = await getToken();
      const payload = meals.map((item, index) => ({
        id: item.id,
        order: index + 1,
      }));
      await mealService.reorderCategoryMeals(categoryId, payload, token || undefined);
      setToast({
        visible: true,
        message: t("admin.categoryMealOrdering.saveSuccess"),
        type: "success",
      });
      setInitialOrder(meals.map((item) => item.id));
      await loadCategoryMeals();
    } catch (error) {
      console.error("Error saving category meal order:", error);
      setToast({
        visible: true,
        message: t("admin.categoryMealOrdering.saveError"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [categoryId, meals, getToken, loadCategoryMeals, t]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCategoryMeals();
  };

  const renderMealItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<MealItem>) => {
    const imageSrc = item.meal.image
      ? getOptimizedImageUrl(item.meal.image)
      : FALLBACK_MEAL_IMAGE;
    const index = getIndex ? (getIndex() ?? 0) : 0;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.mealItem,
            isActive && styles.mealItemActive,
          ]}
        >
          <View style={styles.mealItemContent}>
            <View style={styles.mealItemLeft}>
              <TouchableOpacity
                onPressIn={drag}
                style={styles.dragHandle}
                disabled={isActive}
              >
                <MaterialCommunityIcons name="menu" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <View style={styles.mealImageContainer}>
                <Image
                  source={{ uri: imageSrc }}
                  style={styles.mealImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.mealInfo}>
                <Text style={styles.mealName} numberOfLines={1}>
                  {item.meal.name}
                </Text>
              </View>
            </View>
            <View style={styles.positionBadge}>
              <Text style={styles.positionBadgeText}>#{index + 1}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  if (loading && !category) {
    return (
      <View key={languageKey} style={styles.container}>
        <AnimatedHeader
          title={t("admin.categoryMealOrdering.title", {
            category: "...",
          })}
          onBackPress={() => router.back()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.menuManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  if (!category) {
    return (
      <View key={languageKey} style={styles.container}>
        <AnimatedHeader
          title={t("admin.categoryMealOrdering.title", {
            category: "",
          })}
          onBackPress={() => router.back()}
        />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {t("admin.categoryMealOrdering.categoryNotFound")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View key={languageKey} style={styles.container}>
      <AnimatedHeader
        title={t("admin.categoryMealOrdering.title", {
          category: category.name,
        })}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: headerHeight + 8 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
          />
        }
      >
        {loading && meals.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("admin.menuManagement.loading")}
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="format-list-bulleted-square" size={18} color="#ec4899" />
                  <Text style={styles.sectionTitle}>
                    {t("admin.categoryMealOrdering.listTitle", {
                      count: meals.length,
                    })}
                  </Text>
                </View>
              </View>

              {meals.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {t("admin.categoryMealOrdering.emptyTitle")}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {t("admin.categoryMealOrdering.emptyDescription")}
                  </Text>
                  <TouchableOpacity
                    style={styles.manageMealsButton}
                    onPress={() => {
                      router.push(`/(admin)/menu?categoryId=${categoryId}` as any);
                    }}
                  >
                    <Text style={styles.manageMealsButtonText}>
                      {t("admin.categoryMealOrdering.manageMeals")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <DraggableFlatList
                  data={meals}
                  onDragEnd={handleDragEnd}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMealItem}
                  scrollEnabled={false}
                />
              )}

              <View style={styles.sectionActions}>
                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    (!hasChanges || saving) && styles.resetButtonDisabled,
                  ]}
                  onPress={handleReset}
                  disabled={!hasChanges || saving}
                >
                  <Text
                    style={[
                      styles.resetButtonText,
                      (!hasChanges || saving) &&
                        styles.resetButtonTextDisabled,
                    ]}
                  >
                    {t("admin.categoryMealOrdering.reset")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (!hasChanges || saving || meals.length === 0) &&
                      styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!hasChanges || saving || meals.length === 0}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="format-list-bulleted-square" size={16} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? t("admin.categoryMealOrdering.saving")
                      : t("admin.categoryMealOrdering.save")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
  },
  content: {
    padding: 16,
    gap: 24,
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
  },
  manageMealsButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  manageMealsButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  mealItem: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  mealItemActive: {
    opacity: 0.8,
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  mealItemContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mealItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  dragHandle: {
    padding: 4,
  },
  mealImageContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  mealImage: {
    width: "100%",
    height: "100%",
  },
  mealInfo: {
    flex: 1,
    gap: 4,
  },
  mealName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  positionBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
  },
  sectionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  resetButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  resetButtonDisabled: {},
  resetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  resetButtonTextDisabled: {
    color: "#111827",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  saveButtonDisabled: {},
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
