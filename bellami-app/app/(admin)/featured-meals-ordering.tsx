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
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { mealService, type Meal } from "@/src/services/mealService";
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

export default function FeaturedMealsOrderingScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const [languageKey, setLanguageKey] = useState(i18n.language);

  const canReorderFeaturedMeals =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
      { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
    ]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canReorderFeaturedMeals) {
      router.back();
    }
  }, [permissionsLoading, canReorderFeaturedMeals, router]);
  
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

  const [featuredMeals, setFeaturedMeals] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const loadFeaturedMeals = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await mealService.getMeals(
        1,
        100,
        "",
        "featuredOrder",
        "asc",
        "",
        undefined,
        token || undefined,
        { isFeatured: true }
      );
      const meals = response.meals || [];
      setFeaturedMeals(meals.map((meal) => ({ id: meal.id, meal })));
      const ids = meals.map((meal) => meal.id);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading featured meals:", error);
      setToast({
        visible: true,
        message: t("admin.featuredMealsOrdering.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, t]);

  useEffect(() => {
    loadFeaturedMeals();
  }, [loadFeaturedMeals]);

  useFocusEffect(
    React.useCallback(() => {
      loadFeaturedMeals();
    }, [loadFeaturedMeals])
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
        featuredMeals.map((item) => item.id),
        initialOrder
      ),
    [featuredMeals, initialOrder]
  );

  const handleDragEnd = useCallback(({ data }: { data: MealItem[] }) => {
    setFeaturedMeals(data);
  }, []);

  const handleReset = useCallback(() => {
    const sortedMeals = [...featuredMeals].sort((a, b) => {
      const orderA =
        typeof a.meal.featuredOrder === "number" && a.meal.featuredOrder > 0
          ? a.meal.featuredOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.meal.featuredOrder === "number" && b.meal.featuredOrder > 0
          ? b.meal.featuredOrder
          : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return a.meal.name.localeCompare(b.meal.name);
      }
      return orderA - orderB;
    });
    setFeaturedMeals(sortedMeals);
  }, [featuredMeals]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const token = await getToken();
      const payload = featuredMeals.map((item, index) => ({
        id: item.id,
        order: index + 1,
      }));
      await mealService.reorderFeaturedMeals(payload, token || undefined);
      setToast({
        visible: true,
        message: t("admin.featuredMealsOrdering.saveSuccess"),
        type: "success",
      });
      setInitialOrder(featuredMeals.map((item) => item.id));
      await loadFeaturedMeals();
    } catch (error) {
      console.error("Error saving featured meal order:", error);
      setToast({
        visible: true,
        message: t("admin.featuredMealsOrdering.saveError"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [featuredMeals, getToken, loadFeaturedMeals, t]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeaturedMeals();
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
                {item.meal.category?.name && (
                  <Text style={styles.mealCategory} numberOfLines={1}>
                    {item.meal.category.name}
                  </Text>
                )}
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

  return (
    <View key={languageKey} style={styles.container}>
      <AnimatedHeader
        title={t("admin.featuredMealsOrdering.title")}
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
        {loading && featuredMeals.length === 0 ? (
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
                  <MaterialCommunityIcons name="star" size={18} color="#ec4899" />
                  <Text style={styles.sectionTitle}>
                    {t("admin.featuredMealsOrdering.listTitle")}
                  </Text>
                </View>
              </View>

              {featuredMeals.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {t("admin.featuredMealsOrdering.empty")}
                  </Text>
                </View>
              ) : (
                <DraggableFlatList
                  data={featuredMeals}
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
                    {t("admin.featuredMealsOrdering.reset")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (!hasChanges || saving || featuredMeals.length === 0) &&
                      styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={
                    !hasChanges || saving || featuredMeals.length === 0
                  }
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="star" size={16} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? t("admin.featuredMealsOrdering.saving")
                      : t("admin.featuredMealsOrdering.save")}
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
    backgroundColor: "#0a0a0a",
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
    color: "#9CA3AF",
  },
  content: {
    padding: 16,
    gap: 24,
  },
  section: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
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
    color: "#fff",
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  mealItem: {
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#262626",
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
    backgroundColor: "#262626",
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
    color: "#fff",
  },
  mealCategory: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  positionBadge: {
    backgroundColor: "#262626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
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
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "#262626",
  },
  resetButtonDisabled: {
    opacity: 0.5,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  resetButtonTextDisabled: {
    color: "#6B7280",
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
  saveButtonDisabled: {
    opacity: 0.5,
    backgroundColor: "#262626",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
