import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Pressable,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { categoryService, type Category } from "@/src/services/categoryService";
import { dealService, type Deal } from "@/src/services/dealService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getOptimizedImageUrl = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function DealManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string; categoryName?: string }>();
  const categoryId = params.categoryId;
  const categoryName = params.categoryName;
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const {
    canAny,
    isLoading: permissionsLoading,
    refreshPermissions,
    isSuperAdmin,
  } = usePermissions();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const isTabletLayout = windowWidth >= 700;

  const canCreateDeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.DEALS, action: ACTIONS.CREATE },
    ]);
  const canUpdateDeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.DEALS, action: ACTIONS.UPDATE },
    ]);
  const canDeleteDeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.DEALS, action: ACTIONS.DELETE },
    ]);
  const canToggleDeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.DEALS, action: ACTIONS.TOGGLE_ACTIVE },
    ]);

  const canDealCategoryOrdering =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);

  const canReorderCategoryDeals =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY }]);

  const hasDealActions = canUpdateDeal || canToggleDeal || canDeleteDeal;

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

  const [categories, setCategories] = useState<Category[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsDeal, setActionsDeal] = useState<Deal | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dealToDelete, setDealToDelete] = useState<Deal | null>(null);

  const orderingHeaderButtons = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: "row", gap: 8 }}
    >
      {!categoryId && canDealCategoryOrdering ? (
        <TouchableOpacity
          onPress={() => router.push("/(admin)/deal-category-ordering" as any)}
          style={styles.orderingButton}
        >
          <MaterialCommunityIcons name="format-list-bulleted-square" size={16} color="#ec4899" />
          <Text style={styles.orderingButtonText} numberOfLines={1}>
            {t("admin.dealCategoryOrdering.title", { defaultValue: "Deal Category Ordering" })}
          </Text>
        </TouchableOpacity>
      ) : null}

      {categoryId && canReorderCategoryDeals ? (
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/(admin)/category-deal-ordering?categoryId=${categoryId}` as any
            )
          }
          style={styles.orderingButton}
        >
          <MaterialCommunityIcons name="format-list-bulleted-square" size={16} color="#ec4899" />
          <Text style={styles.orderingButtonText} numberOfLines={1}>
            {t("admin.categoryDealOrdering.cta", { defaultValue: "Deals Ordering" })}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );

  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [createCategorySearchTerm, setCreateCategorySearchTerm] = useState("");

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const isInitialMount = useRef(true);
  const isSearchingRef = useRef(false);

  const showCategoriesView = !categoryId;

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (showCategoriesView) {
        loadCategories();
      } else {
        loadDeals();
      }
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) return;
    if (showCategoriesView) {
      setCategorySearchTerm("");
      loadCategories();
    } else {
      setCurrentPage(1);
      setSearchTerm("");
      loadDeals();
    }
  }, [categoryId]);

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissions();
      if (!isInitialMount.current) {
        if (showCategoriesView) loadCategories();
        else loadDeals();
      }
    }, [showCategoriesView, refreshPermissions])
  );

  useEffect(() => {
    if (isInitialMount.current) return;
    if (showCategoriesView) return;
    if (isSearchingRef.current) return;
    if (currentPage === 1) setFiltersLoading(true);
    loadDeals();
  }, [currentPage, selectedStatus, sortBy, sortOrder]);

  useEffect(() => {
    if (isInitialMount.current) return;
    if (showCategoriesView) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadDeals(true);
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const visibleDealCategories = useMemo(() => {
    const normalized = categorySearchTerm.trim().toLowerCase();
    const base = categories
      .filter((c) => c.isActive)
      .filter((c) => {
        const dealsCount = c._count?.deals ?? 0;
        const mealsCount = c._count?.meals ?? 0;
        const hasDeals = dealsCount > 0;
        const isEmpty = dealsCount === 0 && mealsCount === 0;
        if (showEmptyCategories) return isEmpty;
        return hasDeals;
      });

    if (!normalized) return base;
    return base.filter((c) => c.name.toLowerCase().includes(normalized));
  }, [categories, categorySearchTerm, showEmptyCategories]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const data = await categoryService.getCategories(1, 100, "", "name", "asc", token || undefined);
      setCategories(data.categories);
    } catch (e) {
      console.error("Error loading categories:", e);
      setToast({
        visible: true,
        message: t("admin.dealManagement.loadCategoriesError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isSuperAdmin) return;

    if (!selectedOrganizationId) {
      setCategories([]);
      setDeals([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      setRefreshing(false);
      setPaginationLoading(false);
      setFiltersLoading(false);
      return;
    }

    if (showCategoriesView) {
      loadCategories();
    } else {
      loadDeals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, isSuperAdmin, selectedOrganizationId]);

  const loadDeals = async (isSearch: boolean = false) => {
    try {
      if (currentPage === 1 && !isSearch) setLoading(true);
      else setPaginationLoading(true);

      const token = await getToken();
      const statusParam = selectedStatus || "";
      const data = await dealService.getDeals(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        categoryId || "",
        token || undefined,
        { status: statusParam }
      );

      setDeals(data.deals);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.totalCount || data.deals.length);
    } catch (e) {
      console.error("Error loading deals:", e);
      setToast({
        visible: true,
        message: t("admin.dealManagement.loadDealsError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setPaginationLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (showCategoriesView) loadCategories();
    else loadDeals();
  };

  const handleCategorySelect = (cat: Category) => {
    const categoryNameEncoded = encodeURIComponent(cat.name || "");
    router.push(`/(admin)/deals?categoryId=${cat.id}&categoryName=${categoryNameEncoded}` as any);
  };

  const handleCreateFromCategories = () => {
    if (!canCreateDeal) return;
    setShowCreateCategoryModal(true);
  };

  const closeCreateCategoryModal = () => {
    setShowCreateCategoryModal(false);
    setCreateCategorySearchTerm("");
  };

  const handleBackToCategories = () => {
    router.push("/(admin)/deals" as any);
    setDeals([]);
    setTotalCount(0);
    setTotalPages(1);
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const openActions = (deal: Deal) => {
    setActionsDeal(deal);
    setActionsModalVisible(true);
  };

  const handleCreate = () => {
    if (!canCreateDeal || !categoryId) return;
    router.push(`/(admin)/deal-form?categoryId=${categoryId}` as any);
  };

  const handleEdit = (deal: Deal) => {
    if (!canUpdateDeal) return;
    router.push(`/(admin)/deal-form?id=${deal.id}` as any);
  };

  const handleToggleStatus = async (deal: Deal) => {
    if (!canToggleDeal) return;
    try {
      const token = await getToken();
      await dealService.toggleDealStatus(deal.id, token || undefined);
      await loadDeals();
      setToast({
        visible: true,
        message: deal.isActive
          ? t("admin.dealManagement.dealDeactivated", { name: deal.name })
          : t("admin.dealManagement.dealActivated", { name: deal.name }),
        type: "success",
      });
    } catch (e) {
      console.error("Error toggling deal status:", e);
      setToast({ visible: true, message: t("admin.dealManagement.toggleStatusError"), type: "error" });
    }
  };

  const confirmDelete = (deal: Deal) => {
    setDealToDelete(deal);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!canDeleteDeal) return;
    if (!dealToDelete) return;

    try {
      const token = await getToken();
      await dealService.deleteDeal(dealToDelete.id, token || undefined);
      setShowDeleteModal(false);
      setDealToDelete(null);
      await loadDeals();
      setToast({ visible: true, message: t("admin.dealManagement.dealDeletedSuccess"), type: "success" });
    } catch (e) {
      console.error("Error deleting deal:", e);
      setToast({ visible: true, message: t("admin.dealManagement.deleteDealError"), type: "error" });
    }
  };

  if (loading && (showCategoriesView ? categories.length === 0 : deals.length === 0)) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  if (showCategoriesView) {
    return (
      <View style={styles.container}>
        <View style={styles.listContainer}>
          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingTop: 0 }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#ec4899"
                colors={["#ec4899"]}
                progressBackgroundColor="#f3f4f6"
              />
            }
          >
            <View style={styles.categoriesHeader}>
              <View style={styles.categoriesHeaderTopRow}>
                <Text style={styles.sectionTitle}>{t("admin.dealManagement.categoriesTitle")}</Text>
                <View style={styles.categoriesHeaderRight}>{orderingHeaderButtons}</View>
              </View>
              <Text style={styles.sectionDescription} numberOfLines={2}>
                {t("admin.dealManagement.subtitle")}
              </Text>
            </View>

            <View style={styles.categoriesSearchContainer}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.dealManagement.searchCategoriesPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={categorySearchTerm}
                  onChangeText={setCategorySearchTerm}
                />
              </View>
              <TouchableOpacity
                style={styles.toggleEmptyButton}
                onPress={() => setShowEmptyCategories((p) => !p)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={showEmptyCategories ? "checkbox-marked" : "checkbox-blank-outline"}
                  size={18}
                  color="#ec4899"
                />
                <Text style={styles.toggleEmptyText}>{t("admin.dealManagement.showEmptyCategories")}</Text>
              </TouchableOpacity>
            </View>

            {visibleDealCategories.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="package-variant" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>{t("admin.dealManagement.noCategoriesFound")}</Text>
              </View>
            ) : (
              <View style={styles.categoriesGrid}>
                {visibleDealCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={styles.categoryCard}
                    onPress={() => handleCategorySelect(category)}
                    activeOpacity={0.85}
                  >
                    {category.image ? (
                      <View style={styles.categoryImageContainer}>
                        <Image
                          source={{ uri: getOptimizedImageUrl(category.image) }}
                          style={styles.categoryImage}
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View style={styles.categoryImagePlaceholder}>
                        <MaterialCommunityIcons name="image" size={32} color="#6B7280" />
                      </View>
                    )}
                    <View style={styles.categoryCardContent}>
                      <Text style={styles.categoryCardName} numberOfLines={1}>
                        {category.name}
                      </Text>
                      <Text style={styles.categoryCardDescription} numberOfLines={2}>
                        {category.description || t("admin.menuCategories.noDescription")}
                      </Text>
                      <View style={styles.categoryCardFooter}>
                        <View style={styles.dealCountBadge}>
                          <MaterialCommunityIcons name="package-variant" size={12} color="#ec4899" />
                          <Text style={styles.dealCountText}>
                            {t("admin.dealManagement.dealCount", { count: category._count?.deals ?? 0 })}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#9CA3AF" />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>

        <RefreshSpinner visible={refreshing} topOffset={16} />
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast((p) => ({ ...p, visible: false }))} />

        <Modal
          visible={showCreateCategoryModal}
          transparent
          animationType="slide"
          onRequestClose={closeCreateCategoryModal}
        >
          <Pressable style={styles.sheetOverlay} onPress={closeCreateCategoryModal}>
            <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetHeaderLeft}>
                  <Text style={styles.sheetHeaderTitle}>{t("admin.dealManagement.selectCategoryToCreate")}</Text>
                </View>
                <TouchableOpacity style={styles.sheetCloseInline} onPress={closeCreateCategoryModal}>
                  <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <View style={styles.searchContainer}>
                  <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={t("admin.dealManagement.searchCategoriesPlaceholder")}
                    placeholderTextColor="#6B7280"
                    value={createCategorySearchTerm}
                    onChangeText={setCreateCategorySearchTerm}
                  />
                </View>
              </View>

              <ScrollView style={{ paddingHorizontal: 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
                {categories
                  .filter((c) => c.isActive)
                  .filter((c) => {
                    const normalized = createCategorySearchTerm.trim().toLowerCase();
                    if (!normalized) return true;
                    return c.name.toLowerCase().includes(normalized);
                  })
                  .map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.sheetItem}
                      onPress={() => {
                        closeCreateCategoryModal();
                        router.push(`/(admin)/deal-form?categoryId=${c.id}` as any);
                      }}
                    >
                      <MaterialCommunityIcons name="folder" size={16} color="#D1D5DB" />
                      <Text style={styles.sheetItemText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Floating Add Button */}
        {canCreateDeal && (
          <TouchableOpacity style={styles.fab} onPress={handleCreateFromCategories} activeOpacity={0.8}>
            <MaterialCommunityIcons name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.listContainer}>
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingTop: 0 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#ec4899"
              colors={["#ec4899"]}
              progressBackgroundColor="#f3f4f6"
            />
          }
        >
          <View style={styles.dealsHeader}>
            <View style={styles.dealsHeaderTopRow}>
              <TouchableOpacity onPress={handleBackToCategories} style={styles.backButton}>
                <MaterialCommunityIcons name="chevron-left" size={20} color="#9CA3AF" />
                <Text style={styles.backButtonText}>{t("admin.dealManagement.backToCategories")}</Text>
              </TouchableOpacity>
              <View style={styles.dealsHeaderRight}>{orderingHeaderButtons}</View>
            </View>
            <Text style={styles.sectionTitle}>{t("admin.dealManagement.dealsInCategory", { count: totalCount })}</Text>
            <Text style={styles.sectionDescription} numberOfLines={1}>
              {t("admin.dealManagement.subtitleWithCount", { count: totalCount })}
            </Text>
          </View>

          <View style={styles.filtersRow}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("admin.dealManagement.searchPlaceholder")}
                placeholderTextColor="#6B7280"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowStatusFilterModal(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="filter-variant" size={16} color="#ec4899" />
              <Text style={styles.filterButtonText}>{t("admin.dealManagement.status")}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>{t("admin.dealManagement.sortBy")}</Text>
            <TouchableOpacity
              style={[styles.sortChip, sortBy === "name" ? styles.sortChipActive : null]}
              onPress={() => handleSort("name")}
            >
              <Text style={[styles.sortChipText, sortBy === "name" ? styles.sortChipTextActive : null]}>
                {t("admin.dealManagement.nameAZ")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortChip, sortBy === "createdAt" ? styles.sortChipActive : null]}
              onPress={() => handleSort("createdAt")}
            >
              <Text
                style={[styles.sortChipText, sortBy === "createdAt" ? styles.sortChipTextActive : null]}
                numberOfLines={1}
              >
                {sortBy === "createdAt" && sortOrder === "asc"
                  ? t("admin.dealManagement.oldestFirst")
                  : t("admin.dealManagement.newestFirst")}
              </Text>
            </TouchableOpacity>
          </View>

          {filtersLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color="#ec4899" />
              <Text style={styles.inlineLoadingText}>{t("common.loading")}</Text>
            </View>
          ) : deals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="tag" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>{t("admin.dealManagement.noDealsFound")}</Text>
            </View>
          ) : (
            <View style={[styles.dealsGrid, isTabletLayout ? styles.dealsGridTablet : null]}>
              {deals.map((deal) => (
                <TouchableOpacity
                  key={deal.id}
                  style={[styles.dealCard, isTabletLayout ? styles.dealCardTablet : null]}
                  onPress={() => openActions(deal)}
                  activeOpacity={0.9}
                >
                  <View style={styles.dealCardHeader}>
                    <View style={styles.dealHeaderLeft}>
                      <Text style={styles.dealName} numberOfLines={1}>
                        {deal.name}
                      </Text>
                      <View style={styles.statusBadgeRow}>
                        <View style={[styles.statusBadge, deal.isActive ? styles.statusActive : styles.statusInactive]}>
                          <Text style={styles.statusBadgeText}>
                            {deal.isActive ? t("common.active") : t("common.inactive")}
                          </Text>
                        </View>
                        {deal.isFeatured ? (
                          <View style={styles.featuredBadge}>
                            <Text style={styles.featuredBadgeText}>{t("admin.dealManagement.featured")}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => openActions(deal)}
                      activeOpacity={0.9}
                      disabled={!hasDealActions}
                    >
                      {hasDealActions ? (
                        <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                      ) : null}
                    </TouchableOpacity>
                  </View>

                  {deal.image ? (
                    <Image
                      source={{ uri: getOptimizedImageUrl(deal.image) }}
                      style={styles.dealImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.dealImagePlaceholder}>
                      <MaterialCommunityIcons name="image" size={28} color="#6B7280" />
                    </View>
                  )}

                  <Text style={styles.dealDescription} numberOfLines={2}>
                    {deal.description || t("admin.dealManagement.noDescription")}
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.componentsCount}>
                      {t("admin.dealManagement.componentsCount", { count: deal.components?.length ?? 0 })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {totalPages > 1 ? (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={[styles.pageButton, currentPage <= 1 ? styles.pageButtonDisabled : null]}
              >
                <Text style={styles.pageButtonText}>{t("common.previous")}</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>
                {t("admin.dealManagement.pageOf", { current: currentPage, total: totalPages })}
              </Text>
              <TouchableOpacity
                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                style={[styles.pageButton, currentPage >= totalPages ? styles.pageButtonDisabled : null]}
              >
                <Text style={styles.pageButtonText}>{t("common.next")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {paginationLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color="#ec4899" />
              <Text style={styles.inlineLoadingText}>{t("common.loading")}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <RefreshSpinner visible={refreshing} topOffset={16} />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast((p) => ({ ...p, visible: false }))} />

      {/* Floating Add Button */}
      {canCreateDeal && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => (categoryId ? handleCreate() : handleCreateFromCategories())}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Status filter modal */}
      <Modal visible={showStatusFilterModal} transparent animationType="fade" onRequestClose={() => setShowStatusFilterModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowStatusFilterModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("admin.dealManagement.status")}</Text>
            {[
              { key: "", label: t("common.all") },
              { key: "ACTIVE", label: t("common.active") },
              { key: "INACTIVE", label: t("common.inactive") },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key || "all"}
                style={styles.modalItem}
                onPress={() => {
                  setSelectedStatus(opt.key);
                  setCurrentPage(1);
                  setShowStatusFilterModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{opt.label}</Text>
                {(selectedStatus || "") === opt.key ? (
                  <MaterialCommunityIcons name="check" size={18} color="#ec4899" />
                ) : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Actions bottom sheet */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setActionsModalVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setActionsDeal(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderLeft}>
                <MaterialCommunityIcons name="tag" size={16} color="#ec4899" />
                <Text style={styles.sheetHeaderTitle}>{actionsDeal?.name || ""}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setActionsModalVisible(false);
                  setActionsDeal(null);
                }}
                style={styles.sheetCloseInline}
              >
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetContent}>
              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  if (!actionsDeal) return;
                  setActionsModalVisible(false);
                  handleEdit(actionsDeal);
                }}
                disabled={!actionsDeal || !canUpdateDeal}
              >
                <MaterialCommunityIcons name="pencil" size={18} color={canUpdateDeal ? "#D1D5DB" : "#6B7280"} />
                <Text style={[styles.sheetItemText, !canUpdateDeal ? { color: "#6B7280" } : null]}>
                  {t("common.edit")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetItem}
                onPress={() => {
                  if (!actionsDeal) return;
                  setActionsModalVisible(false);
                  handleToggleStatus(actionsDeal);
                }}
                disabled={!actionsDeal || !canToggleDeal}
              >
                <MaterialCommunityIcons
                  name={actionsDeal?.isActive ? "eye-off" : "eye"}
                  size={18}
                  color={canToggleDeal ? "#D1D5DB" : "#6B7280"}
                />
                <Text style={[styles.sheetItemText, !canToggleDeal ? { color: "#6B7280" } : null]}>
                  {actionsDeal?.isActive ? t("common.deactivate") : t("common.activate")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetItem, styles.sheetItemDanger]}
                onPress={() => {
                  if (!actionsDeal) return;
                  setActionsModalVisible(false);
                  confirmDelete(actionsDeal);
                }}
                disabled={!actionsDeal || !canDeleteDeal}
              >
                <MaterialCommunityIcons name="trash-can" size={18} color={canDeleteDeal ? "#ef4444" : "#6B7280"} />
                <Text
                  style={[
                    styles.sheetItemText,
                    styles.sheetItemDangerText,
                    !canDeleteDeal ? { color: "#6B7280" } : null,
                  ]}
                >
                  {t("common.delete")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDeleteModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("admin.dealManagement.confirmDeleteTitle")}</Text>
            <Text style={styles.modalBody}>{t("admin.dealManagement.confirmDeleteBody")}</Text>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.modalButtonText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={handleDelete}>
                <Text style={[styles.modalButtonText, styles.modalButtonDangerText]}>{t("common.delete")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCreateCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={closeCreateCategoryModal}
      >
        <Pressable style={styles.sheetOverlay} onPress={closeCreateCategoryModal}>
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderLeft}>
                <Text style={styles.sheetHeaderTitle}>{t("admin.dealManagement.selectCategoryToCreate")}</Text>
              </View>
              <TouchableOpacity style={styles.sheetCloseInline} onPress={closeCreateCategoryModal}>
                <MaterialCommunityIcons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.dealManagement.searchCategoriesPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={createCategorySearchTerm}
                  onChangeText={setCreateCategorySearchTerm}
                />
              </View>
            </View>

            <ScrollView style={{ paddingHorizontal: 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
              {categories
                .filter((c) => c.isActive)
                .filter((c) => {
                  const normalized = createCategorySearchTerm.trim().toLowerCase();
                  if (!normalized) return true;
                  return c.name.toLowerCase().includes(normalized);
                })
                .map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.sheetItem}
                    onPress={() => {
                      closeCreateCategoryModal();
                      router.push(`/(admin)/deal-form?categoryId=${c.id}` as any);
                    }}
                  >
                    <MaterialCommunityIcons name="folder" size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  listContainer: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
  },
  categoriesHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  categoriesHeaderTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  categoriesHeaderRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  categoriesHeaderLeft: {
    flexDirection: "column",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  sectionDescription: {
    fontSize: 12,
    color: "#6b7280",
  },
  categoriesSearchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
  },
  toggleEmptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleEmptyText: {
    color: "#6b7280",
    fontSize: 12,
  },
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 12,
  },
  categoryCard: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  categoryImageContainer: {
    height: 110,
    backgroundColor: "#f3f4f6",
  },
  categoryImage: {
    width: "100%",
    height: "100%",
  },
  categoryImagePlaceholder: {
    height: 110,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCardContent: {
    padding: 10,
    gap: 6,
  },
  categoryCardName: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
  categoryCardDescription: {
    color: "#6b7280",
    fontSize: 11,
  },
  categoryCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  dealCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dealCountText: {
    color: "#6b7280",
    fontSize: 11,
  },
  orderingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "transparent",
  },
  orderingButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ec4899",
  },
  dealsHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 6,
  },
  dealsHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  menuButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backButtonText: {
    color: "#6b7280",
    fontSize: 12,
  },
  dealsHeaderRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  filtersRow: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 10,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignSelf: "flex-start",
  },
  filterButtonText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  sortRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  sortLabel: {
    color: "#6b7280",
    fontSize: 12,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  sortChipActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236,72,153,0.12)",
  },
  sortChipText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  sortChipTextActive: {
    color: "#ec4899",
  },
  dealsGrid: {
    flexDirection: "column",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  dealsGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  dealCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    padding: 10,
    gap: 8,
  },
  dealCardTablet: {
    width: "48%",
  },
  dealCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  dealHeaderLeft: {
    flex: 1,
    gap: 6,
  },
  dealName: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 14,
  },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusActive: {
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  statusInactive: {
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  statusBadgeText: {
    fontSize: 10,
    color: "#111827",
    fontWeight: "700",
  },
  featuredBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(234,179,8,0.2)",
  },
  featuredBadgeText: {
    fontSize: 10,
    color: "#111827",
    fontWeight: "700",
  },
  dealImage: {
    width: "100%",
    height: 90,
    borderRadius: 10,
  },
  dealImagePlaceholder: {
    width: "100%",
    height: 90,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  dealDescription: {
    color: "#6b7280",
    fontSize: 11,
    minHeight: 30,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  componentsCount: {
    color: "#6b7280",
    fontSize: 11,
  },
  inlineLoading: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  inlineLoadingText: {
    color: "#6b7280",
  },
  primaryCta: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryCtaText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pageButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageButtonText: {
    color: "#F9FAFB",
    fontSize: 12,
    fontWeight: "700",
  },
  pageInfo: {
    color: "#6b7280",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  modalBody: {
    color: "#6b7280",
    fontSize: 13,
  },
  modalItem: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  modalItemText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  modalItemDanger: {
    borderTopColor: "#e5e7eb",
  },
  modalItemDangerText: {
    color: "#ef4444",
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  modalButtonDanger: {
    backgroundColor: "rgba(239,68,68,0.16)",
    borderColor: "rgba(239,68,68,0.35)",
  },
  modalButtonDangerText: {
    color: "#ef4444",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginTop: 8,
    marginBottom: 8,
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sheetHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sheetHeaderTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  sheetCloseInline: {
    padding: 6,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemDangerText: {
    color: "#ef4444",
  },
});
