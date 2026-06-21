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
import { dealService, type Deal } from "@/src/services/dealService";
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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";
const FALLBACK_DEAL_IMAGE = "https://placehold.co/120x120?text=Deal";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return FALLBACK_DEAL_IMAGE;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

interface DealItem {
  id: string;
  deal: Deal;
}

export default function CategoryDealOrderingScreen() {
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

  const canReorderCategoryDeals =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY }]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canReorderCategoryDeals) {
      router.back();
    }
  }, [permissionsLoading, canReorderCategoryDeals, router]);

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
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialOrder, setInitialOrder] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const loadCategoryDeals = useCallback(async () => {
    if (!categoryId) {
      router.back();
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      const [categoryResponse, dealsResponse] = await Promise.all([
        categoryService.getCategoryById(categoryId, token || undefined),
        dealService.getDeals(1, 500, "", "listOrder", "asc", categoryId, token || undefined),
      ]);

      setCategory(categoryResponse);
      const categoryDeals = dealsResponse.deals || [];
      setDeals(categoryDeals.map((deal) => ({ id: deal.id, deal })));
      const ids = categoryDeals.map((deal) => deal.id);
      setInitialOrder(ids);
    } catch (error) {
      console.error("Error loading category deals:", error);
      setToast({
        visible: true,
        message: t("admin.categoryDealOrdering.loadError", {
          defaultValue: "Failed to load deals",
        }),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId, getToken, router, t]);

  useEffect(() => {
    loadCategoryDeals();
  }, [loadCategoryDeals]);

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissions();
      loadCategoryDeals();
    }, [loadCategoryDeals, refreshPermissions])
  );

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  };

  const hasChanges = useMemo(
    () => !arraysEqual(deals.map((item) => item.id), initialOrder),
    [deals, initialOrder]
  );

  const handleDragEnd = useCallback(({ data }: { data: DealItem[] }) => {
    setDeals(data);
  }, []);

  const handleReset = useCallback(() => {
    const sortedDeals = [...deals].sort((a, b) => {
      const orderA =
        typeof a.deal.listOrder === "number" && a.deal.listOrder > 0
          ? a.deal.listOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.deal.listOrder === "number" && b.deal.listOrder > 0
          ? b.deal.listOrder
          : Number.MAX_SAFE_INTEGER;

      if (orderA === orderB) {
        return a.deal.name.localeCompare(b.deal.name);
      }

      return orderA - orderB;
    });

    setDeals(sortedDeals);
  }, [deals]);

  const handleSave = useCallback(async () => {
    if (!categoryId) return;

    try {
      setSaving(true);
      const token = await getToken();
      const payload = deals.map((item, index) => ({
        id: item.id,
        order: index + 1,
      }));

      await dealService.reorderCategoryDeals(categoryId, payload, token || undefined);

      setToast({
        visible: true,
        message: t("admin.categoryDealOrdering.saveSuccess", {
          defaultValue: "Deal order updated",
        }),
        type: "success",
      });

      setInitialOrder(deals.map((item) => item.id));
      await loadCategoryDeals();
    } catch (error) {
      console.error("Error saving category deal order:", error);
      setToast({
        visible: true,
        message: t("admin.categoryDealOrdering.saveError", {
          defaultValue: "Failed to save deal order",
        }),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [categoryId, deals, getToken, loadCategoryDeals, t]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCategoryDeals();
  };

  const renderDealItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<DealItem>) => {
    const index = getIndex ? (getIndex() ?? 0) : 0;
    const imageSrc = item.deal.image ? getOptimizedImageUrl(item.deal.image) : FALLBACK_DEAL_IMAGE;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={drag}
          disabled={isActive}
          style={[styles.dealItem, isActive && styles.dealItemActive]}
        >
          <View style={styles.dealItemContent}>
            <View style={styles.dealItemLeft}>
              <TouchableOpacity
                onPressIn={drag}
                style={styles.dragHandle}
                disabled={isActive}
              >
                <MaterialCommunityIcons name="menu" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <View style={styles.dealImageContainer}>
                <Image source={{ uri: imageSrc }} style={styles.dealImage} resizeMode="cover" />
              </View>
              <View style={styles.dealInfo}>
                <Text style={styles.dealName} numberOfLines={1}>
                  {item.deal.name}
                </Text>
                {item.deal.description ? (
                  <Text style={styles.dealDescription} numberOfLines={1}>
                    {item.deal.description}
                  </Text>
                ) : null}
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
          title={t("admin.categoryDealOrdering.title", {
            defaultValue: "Deal Ordering",
          })}
          onBackPress={() => router.back()}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.menuManagement.loading", { defaultValue: "Loading..." })}
          </Text>
        </View>
      </View>
    );
  }

  if (!category) {
    return (
      <View key={languageKey} style={styles.container}>
        <AnimatedHeader
          title={t("admin.categoryDealOrdering.title", {
            defaultValue: "Deal Ordering",
          })}
          onBackPress={() => router.back()}
        />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {t("admin.categoryDealOrdering.categoryNotFound", {
              defaultValue: "Category not found",
            })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View key={languageKey} style={styles.container}>
      <AnimatedHeader
        title={t("admin.categoryDealOrdering.title", {
          defaultValue: "Deal Ordering",
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
        {loading && deals.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("admin.menuManagement.loading", { defaultValue: "Loading..." })}
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="format-list-bulleted-square" size={18} color="#ec4899" />
                  <Text style={styles.sectionTitle}>
                    {t("admin.categoryDealOrdering.listTitle", {
                      defaultValue: "Deals ({{count}})",
                      count: deals.length,
                    })}
                  </Text>
                </View>
              </View>

              {deals.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {t("admin.categoryDealOrdering.emptyTitle", {
                      defaultValue: "No deals found",
                    })}
                  </Text>
                </View>
              ) : (
                <DraggableFlatList
                  data={deals}
                  onDragEnd={handleDragEnd}
                  keyExtractor={(item) => item.id}
                  renderItem={renderDealItem}
                  scrollEnabled={false}
                />
              )}

              <View style={styles.sectionActions}>
                <TouchableOpacity
                  style={[styles.resetButton, (!hasChanges || saving) && styles.resetButtonDisabled]}
                  onPress={handleReset}
                  disabled={!hasChanges || saving}
                >
                  <Text
                    style={[styles.resetButtonText, (!hasChanges || saving) && styles.resetButtonTextDisabled]}
                  >
                    {t("admin.categoryDealOrdering.reset", { defaultValue: "Reset" })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButton, (!hasChanges || saving || deals.length === 0) && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={!hasChanges || saving || deals.length === 0}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="content-save" size={16} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {saving
                      ? t("admin.categoryDealOrdering.saving", { defaultValue: "Saving..." })
                      : t("admin.categoryDealOrdering.save", { defaultValue: "Save" })}
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
  dealItem: {
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  dealItemActive: {
    opacity: 0.8,
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  dealItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  dealItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  dragHandle: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dealImageContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#262626",
  },
  dealImage: {
    width: "100%",
    height: "100%",
  },
  dealInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dealName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  dealDescription: {
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
