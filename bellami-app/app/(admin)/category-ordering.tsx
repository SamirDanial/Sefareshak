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
import {
  categoryService,
  type Category,
} from "@/src/services/categoryService";
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

const FALLBACK_CATEGORY_IMAGE = "https://placehold.co/120x120?text=Cat";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return FALLBACK_CATEGORY_IMAGE;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

interface CategoryItem {
  id: string;
  category: Category;
}

export default function CategoryOrderingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { getToken } = useAuthRole();
  const { canAny, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = React.useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const canCategoryOrdering =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canCategoryOrdering) {
      router.back();
    }
  }, [permissionsLoading, canCategoryOrdering, router]);

  const [orderingCategories, setOrderingCategories] = useState<Category[]>([]);
  const [orderingLoading, setOrderingLoading] = useState(true);
  const [featuredItems, setFeaturedItems] = useState<CategoryItem[]>([]);
  const [listItems, setListItems] = useState<CategoryItem[]>([]);
  const [initialFeaturedOrder, setInitialFeaturedOrder] = useState<string[]>(
    []
  );
  const [initialListOrder, setInitialListOrder] = useState<string[]>([]);
  const [isSavingFeaturedOrder, setIsSavingFeaturedOrder] = useState(false);
  const [isSavingListOrder, setIsSavingListOrder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const sortByOrder = useCallback(
    (data: Category[], field: "featuredOrder" | "listOrder") => {
      return [...data].sort((a, b) => {
        const orderA =
          typeof a[field] === "number" && (a[field] as number) > 0
            ? (a[field] as number)
            : Number.MAX_SAFE_INTEGER;
        const orderB =
          typeof b[field] === "number" && (b[field] as number) > 0
            ? (b[field] as number)
            : Number.MAX_SAFE_INTEGER;

        if (orderA === orderB) {
          return a.name.localeCompare(b.name);
        }

        return orderA - orderB;
      });
    },
    []
  );

  const loadOrderingCategories = useCallback(async () => {
    try {
      setOrderingLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(
        1,
        1000,
        "",
        "listOrder",
        "asc",
        token || undefined,
        undefined,
        { excludeDealCategories: true }
      );
      setOrderingCategories(response.categories);
    } catch (error) {
      console.error("Error loading category ordering:", error);
      setToast({
        visible: true,
        message: t("admin.categoryManagement.ordering.loadError"),
        type: "error",
      });
    } finally {
      setOrderingLoading(false);
      setRefreshing(false);
    }
  }, [getToken, t]);

  useEffect(() => {
    loadOrderingCategories();
  }, [loadOrderingCategories]);

  useFocusEffect(
    React.useCallback(() => {
      loadOrderingCategories();
    }, [loadOrderingCategories])
  );

  useEffect(() => {
    if (orderingLoading) return;
    const sortedFeatured = sortByOrder(
      orderingCategories.filter((category) => category.isFeatured),
      "featuredOrder"
    );
    const sortedList = sortByOrder(orderingCategories, "listOrder");
    const featuredIds = sortedFeatured.map((category) => category.id);
    const listIds = sortedList.map((category) => category.id);
    setInitialFeaturedOrder(featuredIds);
    setInitialListOrder(listIds);

    setFeaturedItems(
      sortedFeatured.map((cat) => ({ id: cat.id, category: cat }))
    );
    setListItems(sortedList.map((cat) => ({ id: cat.id, category: cat })));
  }, [orderingCategories, orderingLoading, sortByOrder]);

  const featuredHasChanges = useMemo(
    () =>
      !arraysEqual(
        featuredItems.map((item) => item.id),
        initialFeaturedOrder
      ),
    [featuredItems, initialFeaturedOrder]
  );

  const listHasChanges = useMemo(
    () =>
      !arraysEqual(
        listItems.map((item) => item.id),
        initialListOrder
      ),
    [listItems, initialListOrder]
  );

  const handleFeaturedDragEnd = useCallback(
    ({ data }: { data: CategoryItem[] }) => {
      setFeaturedItems(data);
    },
    []
  );

  const handleListDragEnd = useCallback(({ data }: { data: CategoryItem[] }) => {
    setListItems(data);
  }, []);

  const handleResetOrder = useCallback(
    (type: "featured" | "list") => {
      if (type === "featured") {
        const sortedFeatured = sortByOrder(
          orderingCategories.filter((category) => category.isFeatured),
          "featuredOrder"
        );
        setFeaturedItems(
          sortedFeatured.map((cat) => ({ id: cat.id, category: cat }))
        );
      } else {
        const sortedList = sortByOrder(orderingCategories, "listOrder");
        setListItems(sortedList.map((cat) => ({ id: cat.id, category: cat })));
      }
    },
    [orderingCategories, sortByOrder]
  );

  const handleSaveOrder = useCallback(
    async (type: "featured" | "list") => {
      try {
        if (type === "featured") setIsSavingFeaturedOrder(true);
        else setIsSavingListOrder(true);

        const token = await getToken();
        const orderSource =
          type === "featured"
            ? featuredItems.map((item) => item.id)
            : listItems.map((item) => item.id);
        const payload = orderSource.map((id, index) => ({
          id,
          order: index + 1,
        }));

        await categoryService.reorderCategories(
          type,
          payload,
          token || undefined
        );

        setToast({
          visible: true,
          message:
            type === "featured"
              ? t("admin.categoryManagement.ordering.featuredSaved")
              : t("admin.categoryManagement.ordering.listSaved"),
          type: "success",
        });

        if (type === "featured") {
          setInitialFeaturedOrder(orderSource.slice());
        } else {
          setInitialListOrder(orderSource.slice());
        }

        await loadOrderingCategories();
      } catch (error) {
        console.error("Error saving category order:", error);
        setToast({
          visible: true,
          message:
            type === "featured"
              ? t("admin.categoryManagement.ordering.featuredSaveError")
              : t("admin.categoryManagement.ordering.listSaveError"),
          type: "error",
        });
      } finally {
        if (type === "featured") setIsSavingFeaturedOrder(false);
        else setIsSavingListOrder(false);
      }
    },
    [featuredItems, listItems, getToken, loadOrderingCategories, t]
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrderingCategories();
  };

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

  const renderCategoryItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<CategoryItem>) => {
    const imageSrc = item.category.image
      ? getOptimizedImageUrl(item.category.image)
      : FALLBACK_CATEGORY_IMAGE;
    const index = getIndex ? (getIndex() ?? 0) : 0;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={drag}
          disabled={isActive}
          style={[
            styles.categoryItem,
            isActive && styles.categoryItemActive,
          ]}
        >
          <View style={styles.categoryItemContent}>
            <View style={styles.categoryItemLeft}>
              <TouchableOpacity
                onPressIn={drag}
                style={styles.dragHandle}
                disabled={isActive}
              >
                <MaterialCommunityIcons name="menu" size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <View style={styles.categoryImageContainer}>
                <Image
                  source={{ uri: imageSrc }}
                  style={styles.categoryImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {item.category.name}
                </Text>
                {item.category.description && (
                  <Text style={styles.categoryDescription} numberOfLines={1}>
                    {item.category.description}
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
    <View style={styles.container}>
      <AnimatedHeader
        title={t("admin.categoryManagement.ordering.title")}
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

        {orderingLoading && orderingCategories.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>
              {t("admin.categoryManagement.loading")}
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            {/* Featured Categories Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="star" size={18} color="#ec4899" />
                  <Text style={styles.sectionTitle}>
                    {t("admin.categoryManagement.ordering.featuredTitle")}
                  </Text>
                </View>
              </View>

              {featuredItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {t("admin.categoryManagement.ordering.emptyFeatured")}
                  </Text>
                </View>
              ) : (
                <DraggableFlatList
                  data={featuredItems}
                  onDragEnd={handleFeaturedDragEnd}
                  keyExtractor={(item) => item.id}
                  renderItem={renderCategoryItem}
                  scrollEnabled={false}
                />
              )}

              <View style={styles.sectionActions}>
                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    (!featuredHasChanges || isSavingFeaturedOrder) &&
                      styles.resetButtonDisabled,
                  ]}
                  onPress={() => handleResetOrder("featured")}
                  disabled={!featuredHasChanges || isSavingFeaturedOrder}
                >
                  <Text
                    style={[
                      styles.resetButtonText,
                      (!featuredHasChanges || isSavingFeaturedOrder) &&
                        styles.resetButtonTextDisabled,
                    ]}
                  >
                    {t("admin.categoryManagement.ordering.reset")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (!featuredHasChanges ||
                      isSavingFeaturedOrder ||
                      featuredItems.length === 0) &&
                      styles.saveButtonDisabled,
                  ]}
                  onPress={() => handleSaveOrder("featured")}
                  disabled={
                    !featuredHasChanges ||
                    isSavingFeaturedOrder ||
                    featuredItems.length === 0
                  }
                >
                  {isSavingFeaturedOrder ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="star" size={16} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {isSavingFeaturedOrder
                      ? t("admin.categoryManagement.ordering.saving")
                      : t("admin.categoryManagement.ordering.save")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List Categories Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons
                    name="format-list-bulleted-square"
                    size={18}
                    color="#ec4899"
                  />
                  <Text style={styles.sectionTitle}>
                    {t("admin.categoryManagement.ordering.listTitle")}
                  </Text>
                </View>
                <Text style={styles.sectionCount}>
                  {t("admin.categoryManagement.ordering.listCount", {
                    count: listItems.length,
                  })}
                </Text>
              </View>

              {listItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {t("admin.categoryManagement.ordering.emptyList")}
                  </Text>
                </View>
              ) : (
                <DraggableFlatList
                  data={listItems}
                  onDragEnd={handleListDragEnd}
                  keyExtractor={(item) => item.id}
                  renderItem={renderCategoryItem}
                  scrollEnabled={false}
                />
              )}

              <View style={styles.sectionActions}>
                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    (!listHasChanges || isSavingListOrder) &&
                      styles.resetButtonDisabled,
                  ]}
                  onPress={() => handleResetOrder("list")}
                  disabled={!listHasChanges || isSavingListOrder}
                >
                  <Text
                    style={[
                      styles.resetButtonText,
                      (!listHasChanges || isSavingListOrder) &&
                        styles.resetButtonTextDisabled,
                    ]}
                  >
                    {t("admin.categoryManagement.ordering.reset")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (!listHasChanges ||
                      isSavingListOrder ||
                      listItems.length === 0) &&
                      styles.saveButtonDisabled,
                  ]}
                  onPress={() => handleSaveOrder("list")}
                  disabled={
                    !listHasChanges || isSavingListOrder || listItems.length === 0
                  }
                >
                  {isSavingListOrder ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="format-list-bulleted-square" size={16} color="#fff" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {isSavingListOrder
                      ? t("admin.categoryManagement.ordering.saving")
                      : t("admin.categoryManagement.ordering.save")}
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
  sectionCount: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
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
  categoryItem: {
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  categoryItemActive: {
    opacity: 0.8,
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  categoryItemContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  dragHandle: {
    padding: 4,
  },
  categoryImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#262626",
  },
  categoryImage: {
    width: "100%",
    height: "100%",
  },
  categoryInfo: {
    flex: 1,
    gap: 4,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  categoryDescription: {
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
