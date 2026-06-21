import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { mealService, type Meal, type MealBranchPrice } from "@/src/services/mealService";
import { categoryService, type Category } from "@/src/services/categoryService";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import ApiService from "@/src/services/apiService";

import Constants from "expo-constants";

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

const formatDate = (dateInput: string | Date): string => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// formatCurrency will be defined inside the component to use the currency from settings

const parsePrice = (price: string | number): number => {
  if (typeof price === "number") return price;
  if (typeof price === "string") {
    const parsed = parseFloat(price);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const getOptimizedImageUrl = (imagePath: string): string => {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  return `${API_BASE_URL}/uploads/images/${imagePath}`;
};

export default function MenuManagementScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = params.categoryId;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTwoColumnMeals = true;
  const detailsBodyHeight = Math.min(520, Math.max(240, Math.floor(windowHeight * 0.55)));
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const {
    canAny,
    isLoading: permissionsLoading,
    isSuperAdmin,
    isBranchAdmin,
    assignedBranchIds,
    refreshPermissions,
  } = usePermissions();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [languageKey, setLanguageKey] = useState(i18n.language);
  const [currency, setCurrency] = useState<string>("USD");

  const canCreateMeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.CREATE },
      { resource: RESOURCES.MEALS, action: ACTIONS.CREATE },
    ]);
  const canUpdateMeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
      { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
    ]);
  const canDeleteMeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.DELETE },
      { resource: RESOURCES.MEALS, action: ACTIONS.DELETE },
    ]);
  const canToggleMeal =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.TOGGLE_ACTIVE },
      { resource: RESOURCES.MEALS, action: ACTIONS.TOGGLE_ACTIVE },
    ]);

  const canEditBranchAvailability =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
      { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
    ]);
  const canReorderCategoryMeals =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.REORDER_CATEGORY },
      { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_CATEGORY },
    ]);

  const canReorderFeaturedMeals =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
      { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
    ]);

  const canViewMeals =
    !permissionsLoading &&
    canAny([
      { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
      { resource: RESOURCES.MEALS, action: ACTIONS.VIEW },
    ]);

  const hasMealActions =
    canViewMeals || canUpdateMeal || canDeleteMeal || canToggleMeal;
  
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
  
  // Fetch settings to get currency
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = await getToken();
        const apiService = ApiService.getInstance();
        if (!token) return;
        const result = await apiService.getSettings(token);
        const settings = (result as any)?.data?.data ?? (result as any)?.data ?? (result as any);
        if (settings?.currency) {
          setCurrency(settings.currency);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
        // Keep default USD if fetch fails
      }
    };

    fetchSettings();
  }, [getToken]);
  
  // Format currency using the currency from settings
  const formatCurrency = (amount: number | string): string => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return formatCurrency(0);
    
    // Get locale based on currency for proper formatting
    const getLocaleForCurrency = (curr: string): string => {
      const currencyLocaleMap: { [key: string]: string } = {
        USD: "en-US",
        EUR: "de-DE",
        GBP: "en-GB",
        INR: "en-IN",
        AED: "ar-AE",
      };
      return currencyLocaleMap[curr] || "en-US";
    };

    return new Intl.NumberFormat(getLocaleForCurrency(currency), {
      style: "currency",
      currency: currency,
    }).format(numAmount);
  };
  
  const [meals, setMeals] = useState<Meal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCategoriesView, setShowCategoriesView] = useState(!categoryId);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

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
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionsMeal, setActionsMeal] = useState<any | null>(null);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [createCategorySearchTerm, setCreateCategorySearchTerm] = useState("");
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [detailsMeal, setDetailsMeal] = useState<Meal | null>(null);
  const [detailsBranchPrices, setDetailsBranchPrices] = useState<MealBranchPrice[]>([]);
  const [detailsBranchPricesLoading, setDetailsBranchPricesLoading] = useState(false);
  const [showCategoryFilterModal, setShowCategoryFilterModal] = useState(false);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });
  const [showFilters, setShowFilters] = useState(false);

  const isSearchingRef = useRef(false);
  const isInitialMount = useRef(true);
  // Keep ref in sync so loadData always reads the latest page even in stale closures
  const currentPageRef = useRef(currentPage);

  // Keep currentPageRef in sync with state
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Update view based on categoryId param
  useEffect(() => {
    if (categoryId) {
      setShowCategoriesView(false);
      setSelectedCategory(categoryId);
    } else {
      setShowCategoriesView(true);
      setSelectedCategory("");
    }
  }, [categoryId]);

  // Initial load on mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (!categoryId) {
        loadCategories();
      } else {
        loadData();
      }
    }
  }, []);

  // Reload when categoryId changes
  useEffect(() => {
    if (!isInitialMount.current) {
      if (categoryId) {
        setShowCategoriesView(false);
        setSelectedCategory(categoryId);
        setCurrentPage(1);
        setSearchTerm("");
        loadData();
      } else {
        setShowCategoriesView(true);
        setSelectedCategory("");
        loadCategories();
      }
    }
  }, [categoryId]);

  // Reload data when returning from meal form page
  useFocusEffect(
    React.useCallback(() => {
      refreshPermissions();
      if (!isInitialMount.current) {
        if (showCategoriesView) {
          loadCategories();
        } else {
          loadDataForPage(currentPageRef.current);
        }
      }
    }, [showCategoriesView, refreshPermissions])
  );

  // Load data for non-search operations
  useEffect(() => {
    if (isInitialMount.current) return;
    if (isSearchingRef.current) return;
    // Show filters loading when category or status changes (not pagination)
    if (
      (selectedCategory !== "" || selectedStatus !== "") &&
      currentPage === 1
    ) {
      setFiltersLoading(true);
    }
    loadData();
  }, [currentPage, selectedCategory, selectedStatus, sortBy, sortOrder]);

  // Debounced search effect
  useEffect(() => {
    if (isInitialMount.current) return;

    isSearchingRef.current = true;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadSearchResults();
      setTimeout(() => {
        isSearchingRef.current = false;
      }, 100);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const data = await categoryService.getCategories(
        1,
        100,
        "",
        "listOrder",
        "asc",
        token || undefined
      );
      // Show all categories (both active and inactive) in admin menu
      setCategories(data.categories);
    } catch (error) {
      console.error("Error loading categories:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    
    // For SUPER_ADMIN, require organization selection
    if (isSuperAdmin) {
      if (!selectedOrganizationId) {
        setMeals([]);
        setCategories([]);
        setTotalPages(1);
        setTotalCount(0);
        setLoading(false);
        setRefreshing(false);
        setPaginationLoading(false);
        setMenuItemsLoading(false);
        setFiltersLoading(false);
        return;
      }
    }

    if (showCategoriesView) {
      loadCategories();
    } else {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, isSuperAdmin, selectedOrganizationId]);

  const loadDataForPage = async (page: number) => {
    // Don't load meals if we're in categories view
    if (showCategoriesView && !categoryId) {
      return;
    }
    
    try {
      if (page === 1) {
        setLoading(true);
      } else {
        setPaginationLoading(true);
      }
      const token = await getToken();
      // When categoryId is in URL, always use it (don't allow filter override)
      // This ensures we only show meals for the selected category
      const categoryFilter = categoryId || selectedCategory || "";
      
      // When viewing a category's meals, use listOrder for sorting
      const effectiveSortBy = categoryId ? "listOrder" : sortBy;
      const effectiveSortOrder = categoryId ? "asc" : sortOrder;
      
      const [mealsData, categoriesData] = await Promise.all([
        mealService.getMeals(
          page,
          9,
          searchTerm,
          effectiveSortBy,
          effectiveSortOrder,
          categoryFilter,
          selectedStatus as any,
          token || undefined
        ),
        categoryService.getCategories(
          1,
          100,
          "",
          "createdAt",
          "desc",
          token || undefined
        ),
      ]);

      setMeals(mealsData.meals);
      setTotalPages(mealsData.pagination?.totalPages || 1);
      setTotalCount(mealsData.pagination?.totalCount || 0);
      setCategories(categoriesData.categories);
    } catch (error) {
      console.error("Error loading data:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setPaginationLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
    }
  };

  const loadData = () => loadDataForPage(currentPageRef.current);

  const loadSearchResults = async () => {
    try {
      setMenuItemsLoading(true);
      const token = await getToken();
      // When categoryId is in URL, always use it (don't allow filter override)
      const categoryFilter = categoryId || selectedCategory || "";
      const mealsData = await mealService.getMeals(
        currentPage,
        9,
        searchTerm,
        sortBy,
        sortOrder,
        categoryFilter,
        selectedStatus as any,
        token || undefined
      );

      setMeals(mealsData.meals);
      setTotalPages(mealsData.pagination?.totalPages || 1);
      setTotalCount(mealsData.pagination?.totalCount || 0);
    } catch (error) {
      console.error("Error loading search results:", error);
    } finally {
      setMenuItemsLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    if (showCategoriesView) {
      loadCategories();
    } else {
      loadData();
    }
  };

  const handleCategoryClick = (category: Category) => {
    router.push(`/(admin)/menu?categoryId=${category.id}` as any);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleCategoryFilter = (categoryIdFilter: string) => {
    if (categoryIdFilter === "all") {
      // Navigate back to categories view
      router.push("/(admin)/menu" as any);
      setSelectedCategory("");
    } else {
      // Navigate to the selected category's meals
      router.push(`/(admin)/menu?categoryId=${categoryIdFilter}` as any);
      setSelectedCategory(categoryIdFilter);
    }
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleCreate = () => {
    if (!canCreateMeal) return;
    if (!categoryId) {
      setShowCreateCategoryModal(true);
      return;
    }
    router.push(`/(admin)/meal-form?categoryId=${categoryId}` as any);
  };

  const handleCreateFromCategories = () => {
    if (!canCreateMeal) return;
    setShowCreateCategoryModal(true);
  };

  const closeCreateCategoryModal = () => {
    setShowCreateCategoryModal(false);
    setCreateCategorySearchTerm("");
  };

  const handleEdit = (meal: Meal) => {
    if (!canUpdateMeal) return;
    router.push(`/(admin)/meal-form?id=${meal.id}` as any);
  };

  const handleViewDetails = (meal: Meal) => {
    if (!canViewMeals) return;
    setDetailsMeal(meal);
    setDetailsModalVisible(true);
    loadDetailsBranchPrices(meal.id);
  };

  const loadDetailsBranchPrices = async (mealId: string) => {
    try {
      setDetailsBranchPricesLoading(true);
      const token = await getToken();
      const prices = await mealService.getMealBranchPrices(mealId, token || undefined);
      setDetailsBranchPrices(prices);
    } catch (error) {
      console.error("Failed to load meal branch prices:", error);
      setDetailsBranchPrices([]);
    } finally {
      setDetailsBranchPricesLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteMeal) return;
    if (!mealToDelete) return;

    try {
      const token = await getToken();
      await mealService.deleteMeal(mealToDelete.id, token || undefined);
      setShowDeleteModal(false);
      setMealToDelete(null);
      await loadData();
      setToast({
        visible: true,
        message: t("admin.menuManagement.mealDeletedSuccess"),
        type: "success",
      });
    } catch (error) {
      console.error("Error deleting meal:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.deleteMealError"),
        type: "error",
      });
    }
  };

  const handleToggleStatus = async (meal: Meal) => {
    if (!canToggleMeal) return;
    try {
      setShowActionsMenu(null);
      const token = await getToken();
      await mealService.toggleMealStatus(meal.id, token || undefined);
      await loadData();
      setToast({
        visible: true,
        message: meal.isActive
          ? t("admin.menuManagement.mealDeactivated", { name: meal.name })
          : t("admin.menuManagement.mealActivated", { name: meal.name }),
        type: "success",
      });
    } catch (error) {
      console.error("Error toggling meal status:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.toggleStatusError"),
        type: "error",
      });
    }
  };

  // Server-side filtering applied; use meals directly

  if (loading && (showCategoriesView ? categories.length === 0 : meals.length === 0)) {
    return (
      <View key={languageKey} style={styles.container}>
        {/* No on-page header */}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>
            {t("admin.menuManagement.loading")}
          </Text>
        </View>
      </View>
    );
  }

  // Show categories view if no categoryId
  if (showCategoriesView) {
    return (
      <View key={languageKey} style={styles.container}>
        <View style={styles.mealsListContainer}>
          <ScrollView
            style={styles.mealsList}
            contentContainerStyle={{ paddingTop: 0, paddingBottom: 24 }}
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
            {/* Header with Title, Description, and Action Buttons */}
            <View style={styles.categoriesHeader}>
              <View style={styles.categoriesHeaderLeft}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={styles.sectionTitle}>
                    {t("admin.menuCategories.title")}
                  </Text>
                  {canReorderFeaturedMeals && (
                    <TouchableOpacity
                      onPress={() => router.push("/(admin)/featured-meals-ordering" as any)}
                      style={[styles.orderingButton, { marginTop: 0 }]}
                    >
                      <MaterialCommunityIcons
                        name="format-list-bulleted-square"
                        size={16}
                        color="#ec4899"
                      />
                      <Text style={styles.orderingButtonText}>
                        {t("admin.featuredMealsOrdering.cta")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.sectionDescription} numberOfLines={1}>
                  {t("admin.menuCategories.description")}
                </Text>
              </View>
            </View>

            {/* Search */}
            <View style={styles.categoriesSearchContainer}>
              <View style={[styles.searchContainer, { flex: 1 }]}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.menuCategories.searchPlaceholder")}
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
                <Text style={styles.toggleEmptyText} numberOfLines={1}>
                  {t("admin.menuCategories.showEmptyCategories")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Categories Grid */}
            {(() => {
              const filteredCategories = categories.filter((category) => {
                if (!categorySearchTerm.trim()) return true;
                return category.name.toLowerCase().includes(categorySearchTerm.toLowerCase());
              }).filter((category) => {
                const mealCountRaw = category._count?.meals;
                const mealCount = typeof mealCountRaw === "number" ? mealCountRaw : -1;
                const dealsCountRaw = (category._count as any)?.deals;
                const dealsCount = typeof dealsCountRaw === "number" ? dealsCountRaw : 0;
                if (showEmptyCategories) return mealCount === 0 && dealsCount === 0;
                return mealCount > 0;
              });
              
              if (filteredCategories.length === 0) {
                return (
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="package-variant" size={48} color="#6B7280" />
                    <Text style={styles.emptyText}>
                      {categories.length === 0
                        ? t("admin.menuCategories.emptyTitle")
                        : t("admin.menuCategories.emptyTitle")}
                    </Text>
                    <Text style={styles.emptySubtext}>
                      {categories.length === 0
                        ? t("admin.menuCategories.emptyDescription")
                        : t("admin.menuCategories.emptyDescription")}
                    </Text>
                    {categorySearchTerm.trim() && (
                      <TouchableOpacity
                        onPress={() => setCategorySearchTerm("")}
                        style={styles.clearSearchButton}
                      >
                        <Text style={styles.clearSearchButtonText}>
                          {t("admin.menuCategories.clearSearch")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }
              
              return (
                <View style={styles.categoriesGrid}>
                  {filteredCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={styles.categoryCard}
                    onPress={() => handleCategoryClick(category)}
                    activeOpacity={0.8}
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
                      <View style={styles.categoryCardHeader}>
                        <Text style={styles.categoryCardName} numberOfLines={1}>
                          {category.name}
                        </Text>
                        {!category.isActive && (
                          <View style={styles.inactiveBadge}>
                            <Text style={styles.inactiveBadgeText}>Inactive</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.categoryCardDescription} numberOfLines={2}>
                        {category.description || t("admin.menuCategories.noDescription")}
                      </Text>
                      <View style={styles.categoryCardFooter}>
                        <View style={styles.mealCountBadge}>
                          <MaterialCommunityIcons name="package-variant" size={12} color="#ec4899" />
                          <Text style={styles.mealCountText}>
                            {t("admin.menuCategories.mealCount", {
                              count: category._count?.meals ?? 0,
                            })}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#9CA3AF" />
                      </View>
                    </View>
                  </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </View>

        {/* Refresh Loading Spinner */}
        <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />

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
                  <Text style={styles.sheetHeaderTitle}>{t("admin.menuManagement.selectCategoryToCreateMeal")}</Text>
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
                    placeholder={t("admin.menuCategories.searchPlaceholder")}
                    placeholderTextColor="#6B7280"
                    value={createCategorySearchTerm}
                    onChangeText={setCreateCategorySearchTerm}
                  />
                </View>
              </View>

              <ScrollView style={{ paddingHorizontal: 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
                {categories
                  .filter((c) => {
                    const normalized = createCategorySearchTerm.trim().toLowerCase();
                    if (!normalized) return true;
                    return c.name.toLowerCase().includes(normalized);
                  })
                  .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                  .map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.sheetItem}
                      onPress={() => {
                        closeCreateCategoryModal();
                        router.push(`/(admin)/meal-form?categoryId=${c.id}` as any);
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

        {canCreateMeal && (
          <TouchableOpacity style={styles.fab} onPress={handleCreateFromCategories}>
            <MaterialCommunityIcons name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View key={languageKey} style={styles.container}>
      {/* No on-page header */}

      {/* Meals Grid */}
      <View style={styles.mealsListContainer}>
        {(menuItemsLoading || filtersLoading) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingOverlayText}>
              {menuItemsLoading
                ? t("admin.menuManagement.searchingMeals")
                : t("admin.menuManagement.applyingFilters")}
            </Text>
          </View>
        )}
        {paginationLoading && (
          <View style={styles.paginationLoadingOverlay}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        )}
        <ScrollView
          style={styles.mealsList}
          contentContainerStyle={{ paddingTop: 0, paddingBottom: 160 }}
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
          {/* Back button, Ordering button, and Filters toggle */}
          <View style={{ paddingHorizontal: 16, paddingBottom: showFilters ? 4 : 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                router.push("/(admin)/menu" as any);
              }}
              style={styles.backButtonContainer}
            >
              <MaterialCommunityIcons name="chevron-left" size={16} color="#ec4899" />
              <Text style={styles.backButtonText}>
                {t("admin.menuManagement.backToCategories")}
              </Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              {categoryId && canReorderCategoryMeals && (
                <TouchableOpacity
                  onPress={() => {
                    if (!canReorderCategoryMeals) return;
                    router.push(`/(admin)/category-meal-ordering?categoryId=${categoryId}` as any);
                  }}
                  style={styles.orderingButton}
                  disabled={!canReorderCategoryMeals}
                >
                  <MaterialCommunityIcons name="format-list-bulleted-square" size={16} color="#ec4899" />
                  <Text style={styles.orderingButtonText}>
                    {t("admin.categoryMealOrdering.title", {
                      category: categories.find((c) => c.id === categoryId)?.name || "",
                    })}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowFilters((prev) => !prev)}
                style={styles.filterTextButtonContainer}
              >
                <Text style={styles.filterTextButton}>
                  {showFilters
                    ? t("admin.menuManagement.hideFilters")
                    : t("admin.menuManagement.showFilters")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search and Filters */}
          {showFilters && (
            <View style={styles.filtersContainer}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.menuManagement.searchPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={searchTerm}
                  onChangeText={handleSearch}
                />
              </View>

              {/* Filter Dropdowns */}
              <View style={styles.filterDropdownsRow}>
                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    (selectedCategory !== "" || categoryId) && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowCategoryFilterModal(true)}
                >
                  <MaterialCommunityIcons name="package-variant" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {categoryId || selectedCategory
                      ? categories.find((c) => c.id === (categoryId || selectedCategory))?.name ||
                        t("admin.menuManagement.category")
                      : t("admin.menuManagement.allCategories")}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.filterDropdown,
                    selectedStatus !== "" && styles.filterDropdownActive,
                  ]}
                  onPress={() => setShowStatusFilterModal(true)}
                >
                  <MaterialCommunityIcons name="eye" size={14} color="#9CA3AF" />
                  <Text style={styles.filterDropdownText}>
                    {selectedStatus === "ACTIVE"
                      ? t("admin.menuManagement.active")
                      : selectedStatus === "INACTIVE"
                      ? t("admin.menuManagement.inactive")
                      : t("admin.menuManagement.allStatus")}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>
                  {t("admin.menuManagement.sortBy")}:
                </Text>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "name" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("name")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "name" && styles.sortButtonTextActive,
                    ]}
                  >
                    {t("admin.menuManagement.sortName")}
                  </Text>
                  {sortBy === "name" && (
                    <MaterialCommunityIcons
                      name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                      size={12}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sortButton,
                    sortBy === "createdAt" && styles.sortButtonActive,
                  ]}
                  onPress={() => handleSort("createdAt")}
                >
                  <Text
                    style={[
                      styles.sortButtonText,
                      sortBy === "createdAt" && styles.sortButtonTextActive,
                    ]}
                  >
                    {sortBy === "createdAt"
                      ? sortOrder === "desc"
                        ? t("admin.menuManagement.newestFirst")
                        : t("admin.menuManagement.oldestFirst")
                      : t("admin.menuManagement.newestFirst")}
                  </Text>
                  {sortBy === "createdAt" && (
                    <MaterialCommunityIcons
                      name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
                      size={12}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          {meals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={48} color="#6B7280" />
              <Text style={styles.emptyText}>
                {t("admin.menuManagement.noMealsFound")}
              </Text>
              <Text style={styles.emptySubtext}>
                {t("admin.menuManagement.noMealsFoundSubtext")}
              </Text>
            </View>
          ) : (
            <View style={[styles.mealsGrid, isTwoColumnMeals && styles.mealsGridTwoColumn]}>
              {meals.map((meal) => (
                <View key={meal.id} style={[styles.mealCard, isTwoColumnMeals && styles.mealCardTwoColumn]}>
                  <View style={styles.mealCardHeader}>
                    <View style={styles.mealInfo}>
                      <View style={styles.mealIcon}>
                        <MaterialCommunityIcons
                          name="silverware-fork-knife"
                          size={20}
                          color="#ec4899"
                        />
                      </View>
                      <View style={styles.mealDetails}>
                        <View style={styles.mealNameRow}>
                          <Text style={styles.mealName} numberOfLines={1}>
                            {meal.name}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              meal.isActive
                                ? styles.statusBadgeActive
                                : styles.statusBadgeInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                meal.isActive
                                  ? styles.statusBadgeTextActive
                                  : styles.statusBadgeTextInactive,
                              ]}
                            >
                              {meal.isActive
                                ? t("admin.menuManagement.active")
                                : t("admin.menuManagement.inactive")}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.mealMetaRow}>
                          <Text style={styles.mealPrice}>
                            {formatCurrency(parsePrice(meal.basePrice))}
                          </Text>
                          <Text style={styles.mealCategory}>
                            {meal.category?.name}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => {
                        setActionsMeal(meal);
                        setShowActionsMenu(meal.id);
                        setActionsModalVisible(true);
                      }}
                      disabled={!hasMealActions}
                    >
                      {hasMealActions ? (
                        <MaterialCommunityIcons name="dots-vertical" size={18} color="#9CA3AF" />
                      ) : null}
                    </TouchableOpacity>
                  </View>

                  {/* Actions handled by bottom sheet */}

                  {meal.image && (
                    <View style={styles.mealImageContainer}>
                      <Image
                        source={{ uri: getOptimizedImageUrl(meal.image) }}
                        style={styles.mealImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {meal.description && (
                    <Text style={styles.mealDescription} numberOfLines={2}>
                      {meal.description}
                    </Text>
                  )}

                  <View style={styles.mealStats}>
                    <View style={styles.mealStatItem}>
                      <Text style={styles.mealStatLabel}>
                        {t("admin.menuManagement.size")}
                      </Text>
                      <Text style={styles.mealStatValue}>
                        {meal.mealSizes.length}
                      </Text>
                    </View>
                    <View style={styles.mealStatItem}>
                      <Text style={styles.mealStatLabel}>
                        {t("admin.menuManagement.addons")}
                      </Text>
                      <Text style={styles.mealStatValue}>
                        {meal.mealAddOns.length}
                      </Text>
                    </View>
                    <View style={styles.mealStatItem}>
                      <Text style={styles.mealStatLabel}>
                        {t("admin.menuManagement.orders")}
                      </Text>
                      <Text style={styles.mealStatValue}>
                        {meal._count.orderItems}
                      </Text>
                    </View>
                    <View style={styles.mealStatItem}>
                      <Text style={styles.mealStatLabel}>
                        {t("admin.menuManagement.date")}
                      </Text>
                      <Text style={styles.mealStatValue}>
                        {formatDate(meal.createdAt)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
      </View>

      {/* Floating Pagination */}
      {!showCategoriesView && (
        <View style={styles.floatingPagination}>
          <TouchableOpacity
            style={[
              styles.paginationButton,
              currentPage === 1 && styles.paginationButtonDisabled,
            ]}
            onPress={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1 || paginationLoading}
          >
            <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.paginationPageText}>
            {t("admin.menuManagement.pageOf", {
              current: currentPage,
              total: totalPages,
            })}
          </Text>
          <TouchableOpacity
            style={[
              styles.paginationButton,
              currentPage === totalPages && styles.paginationButtonDisabled,
            ]}
            onPress={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages || paginationLoading}
          >
            <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Actions Bottom Sheet Modal */}
      <Modal
        visible={actionsModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setActionsModalVisible(false);
          setShowActionsMenu(null);
          setActionsMeal(null);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setActionsModalVisible(false);
            setShowActionsMenu(null);
            setActionsMeal(null);
          }}
        >
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            {actionsMeal && (
              <View style={styles.sheetContent}>
                {canViewMeals && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleViewDetails(actionsMeal);
                      setShowActionsMenu(null);
                    }}
                  >
                    <MaterialCommunityIcons name="eye" size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.menuManagement.viewDetails", {
                        defaultValue: "View Details",
                      })}
                    </Text>
                  </TouchableOpacity>
                )}

                {canUpdateMeal && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleEdit(actionsMeal);
                      setShowActionsMenu(null);
                    }}
                  >
                    <EditIcon size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.menuManagement.edit")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canEditBranchAvailability && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      const meal = actionsMeal;
                      setActionsModalVisible(false);
                      setShowActionsMenu(null);
                      setActionsMeal(null);
                      setTimeout(() => {
                        if (!meal) return;
                        router.push(
                          `/(admin)/meal-branch-availability?mealId=${meal.id}&mealName=${encodeURIComponent(
                            meal.name || ""
                          )}` as any
                        );
                      }, 250);
                    }}
                  >
                    <MaterialCommunityIcons name="calendar-clock" size={16} color="#D1D5DB" />
                    <Text style={styles.sheetItemText}>
                      {t("admin.menuManagement.branchAvailability", { defaultValue: "Availability per branch" })}
                    </Text>
                  </TouchableOpacity>
                )}

                {canToggleMeal && (
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={() => {
                      setActionsModalVisible(false);
                      handleToggleStatus(actionsMeal);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={actionsMeal.isActive ? "eye-off" : "eye"}
                      size={16}
                      color="#D1D5DB"
                    />
                    <Text style={styles.sheetItemText}>
                      {actionsMeal.isActive
                        ? t("admin.menuManagement.deactivate")
                        : t("admin.menuManagement.activate")}
                    </Text>
                  </TouchableOpacity>
                )}

                {canDeleteMeal && (
                  <TouchableOpacity
                    style={[styles.sheetItem, styles.sheetItemDanger]}
                    onPress={() => {
                      setActionsModalVisible(false);
                      setMealToDelete(actionsMeal);
                      setShowDeleteModal(true);
                      setShowActionsMenu(null);
                    }}
                  >
                    <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                    <Text style={[styles.sheetItemText, styles.actionTextDanger]}>
                      {t("admin.menuManagement.delete")}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => {
                    setActionsModalVisible(false);
                    setShowActionsMenu(null);
                    setActionsMeal(null);
                  }}
                >
                  <Text style={styles.sheetCancelText}>
                    {t("admin.menuManagement.deleteMealCancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeleteModal(false)}
        >
          <View style={styles.deleteModalContent}>
            <Text style={styles.modalTitle}>
              {t("admin.menuManagement.deleteMeal")}
            </Text>
            <Text style={styles.modalDescription}>
              {t("admin.menuManagement.deleteMealDescription", {
                name: mealToDelete?.name,
              })}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalButtonCancelText}>
                  {t("admin.menuManagement.deleteMealCancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonDelete}
                onPress={handleDelete}
              >
                <Text style={styles.modalButtonDeleteText}>
                  {t("admin.menuManagement.deleteMealConfirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Category Filter Bottom Sheet */}
      <Modal
        visible={showCategoryFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowCategoryFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.menuManagement.selectCategory")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCategoryFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  (!categoryId && selectedCategory === "") && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleCategoryFilter("all");
                  setShowCategoryFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    (!categoryId && selectedCategory === "") &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.menuManagement.allCategories")}
                </Text>
                {(!categoryId && selectedCategory === "") && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              {categories.map((category) => {
                const isSelected = categoryId === category.id || selectedCategory === category.id;
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.bottomSheetOption,
                      isSelected && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      handleCategoryFilter(category.id);
                      setShowCategoryFilterModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isSelected &&
                          styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Status Filter Bottom Sheet */}
      <Modal
        visible={showStatusFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowStatusFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.menuManagement.selectStatus")}
              </Text>
              <TouchableOpacity onPress={() => setShowStatusFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedStatus === "" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleStatusFilter("all");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "" && styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.menuManagement.allStatus")}
                </Text>
                {selectedStatus === "" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedStatus === "ACTIVE" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleStatusFilter("ACTIVE");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "ACTIVE" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.menuManagement.active")}
                </Text>
                {selectedStatus === "ACTIVE" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  selectedStatus === "INACTIVE" &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleStatusFilter("INACTIVE");
                  setShowStatusFilterModal(false);
                }}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedStatus === "INACTIVE" &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {t("admin.menuManagement.inactive")}
                </Text>
                {selectedStatus === "INACTIVE" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Floating Add Button */}
      {canCreateMeal && (
        <TouchableOpacity style={styles.fab} onPress={handleCreate}>
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Meal Details Modal */}
      <Modal
        visible={detailsModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setDetailsModalVisible(false);
          setDetailsMeal(null);
          setDetailsBranchPrices([]);
        }}
      >
        <View style={[styles.modalOverlay, StyleSheet.absoluteFillObject]}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              setDetailsModalVisible(false);
              setDetailsMeal(null);
              setDetailsBranchPrices([]);
            }}
          />

          <View style={styles.detailsModalContent}>
            <View style={styles.detailsModalHeader}>
              <Text style={styles.detailsModalTitle}>
                {t("admin.menuManagement.viewDetails", {
                  defaultValue: "Meal Details",
                })}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setDetailsModalVisible(false);
                  setDetailsMeal(null);
                  setDetailsBranchPrices([]);
                }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={[styles.detailsModalBody, { height: detailsBodyHeight }]}
              contentContainerStyle={{ paddingBottom: 24 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              scrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {detailsMeal && (
                <View style={{ gap: 12 }}>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>
                      {t("admin.menuManagement.basePrice")}
                    </Text>
                    <Text style={styles.detailsValue}>
                      {formatCurrency(parsePrice(detailsMeal.basePrice))}
                    </Text>
                  </View>

                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>
                      {t("admin.menuManagement.taxPercentage")}
                    </Text>
                    <Text style={styles.detailsValue}>
                      {detailsMeal.taxPercentage != null ? `${detailsMeal.taxPercentage}%` : "-"}
                    </Text>
                  </View>

                  {detailsBranchPricesLoading ? (
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>
                        {t("admin.menuManagement.branchSpecificPrices")}
                      </Text>
                      <Text style={styles.detailsValue}>...</Text>
                    </View>
                  ) : Array.isArray(detailsBranchPrices) && detailsBranchPrices.length > 0 ? (
                    <View style={styles.detailsBlock}>
                      <Text style={styles.detailsLabel}>
                        {t("admin.menuManagement.branchSpecificPrices")}
                      </Text>
                      <View style={{ gap: 8 }}>
                        {detailsBranchPrices
                          .slice()
                          .sort((a, b) => (a.branch?.name || "").localeCompare(b.branch?.name || ""))
                          .map((bp) => {
                            const bpName = bp.branch?.name || "-";
                            const bpPrice = formatCurrency(parsePrice(bp.basePrice));
                            const bpTax = bp.taxPercentage != null ? `${bp.taxPercentage}%` : "-";
                            return (
                              <View key={bp.id || bp.branchId} style={styles.detailsRow}>
                                <Text style={styles.detailsLabel}>
                                  {bpName}
                                </Text>
                                <Text style={styles.detailsValue}>
                                  {bpPrice} · {bpTax}
                                </Text>
                              </View>
                            );
                          })}
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>{t("admin.menuManagement.mealName")}</Text>
                    <Text style={styles.detailsValue}>{detailsMeal.name}</Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>{t("admin.menuManagement.category")}</Text>
                    <Text style={styles.detailsValue}>
                      {detailsMeal.category?.name || "-"}
                    </Text>
                  </View>
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>{t("admin.menuManagement.status")}</Text>
                    <Text style={styles.detailsValue}>
                      {detailsMeal.isActive
                        ? t("admin.menuManagement.active")
                        : t("admin.menuManagement.inactive")}
                    </Text>
                  </View>
                  {detailsMeal.description ? (
                    <View style={styles.detailsBlock}>
                      <Text style={styles.detailsLabel}>{t("admin.menuManagement.descriptionLabel")}</Text>
                      <Text style={styles.detailsValue}>{detailsMeal.description}</Text>
                    </View>
                  ) : null}
                  {Array.isArray(detailsMeal.mealSizes) && detailsMeal.mealSizes.length > 0 ? (
                    <View style={styles.detailsBlock}>
                      <Text style={styles.detailsLabel}>{t("admin.menuManagement.mealSizes")}</Text>
                      <View style={{ gap: 8 }}>
                        {detailsMeal.mealSizes.map((s) => (
                          <View key={s.id} style={styles.sizeRow}>
                            <Text style={styles.sizeName}>{s.name}</Text>
                            <Text style={styles.sizePrice}>
                              {formatCurrency(parsePrice(s.price))}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {detailsMeal.image ? (
                    <View style={styles.detailsBlock}>
                      <Text style={styles.detailsLabel}>{t("admin.menuManagement.mealImage")}</Text>
                      <Image
                        source={{ uri: getOptimizedImageUrl(detailsMeal.image) }}
                        style={styles.detailsImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    padding: 0,
    height: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6b7280",
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
  },
  filtersContainer: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
    fontSize: 14,
    color: "#111827",
  },
  filterDropdownsRow: {
    flexDirection: "row",
    gap: 12,
  },
  filterDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
    backgroundColor: "#f9fafb",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
  },
  filterTextButtonContainer: {
    alignSelf: "flex-end",
  },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sortLabel: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sortButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  mealsListContainer: {
    flex: 1,
    position: "relative",
  },
  mealsList: {
    flex: 1,
    padding: 8,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    zIndex: 10,
  },
  loadingOverlayText: {
    fontSize: 14,
    color: "#ec4899",
    fontWeight: "500",
    marginTop: 4,
  },
  paginationLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
  },
  mealsGrid: {
    gap: 12,
  },
  mealCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  mealCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  mealInfo: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  mealDetails: {
    flex: 1,
    gap: 4,
  },
  mealNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  mealName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeActive: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  statusBadgeInactive: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusBadgeTextActive: {
    color: "#22c55e",
  },
  statusBadgeTextInactive: {
    color: "#ef4444",
  },
  mealMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mealPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  mealCategory: {
    fontSize: 12,
    color: "#6b7280",
  },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  actionsMenu: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  actionItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  actionText: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  actionTextDanger: {
    color: "#ef4444",
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sheetItemDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  sheetItemText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  sheetCancelText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
  },
  mealImageContainer: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#f3f4f6",
  },
  mealImage: {
    width: "100%",
    height: "100%",
  },
  mealDescription: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 16,
  },
  mealStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  mealStatItem: {
    alignItems: "center",
    gap: 4,
  },
  mealStatLabel: {
    fontSize: 10,
    color: "#6b7280",
  },
  mealStatValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  floatingPagination: {
    position: "absolute",
    right: 16,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  paginationButtonDisabled: {
    backgroundColor: "#e5e7eb",
    opacity: 0.5,
  },
  paginationPageText: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ec4899",
  },
  modalScroll: {
    maxHeight: 500,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  detailsModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  detailsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailsModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ec4899",
  },
  detailsModalBody: {
    width: "100%",
  },
  mealsGridTwoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  mealCardTwoColumn: {
    width: "48%",
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    flexShrink: 0,
  },
  detailsValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  detailsBlock: {
    gap: 6,
  },
  sizeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sizeName: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  sizePrice: {
    fontSize: 13,
    color: "#ec4899",
    fontWeight: "700",
  },
  detailsImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  modalDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalButtonCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  modalButtonDelete: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    backgroundColor: "#ef4444",
  },
  modalButtonDeleteText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  bottomSheetBody: {
    padding: 8,
    maxHeight: 400,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  bottomSheetOptionText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  categoriesHeader: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  categoriesHeaderLeft: {
    flex: 1,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  categoriesSearchContainer: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
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
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
  },
  clearSearchButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  clearSearchButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  backButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    justifyContent: "space-between",
  },
  categoryCard: {
    width: "48%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  categoryImageContainer: {
    width: "100%",
    height: 140,
    backgroundColor: "#f3f4f6",
    overflow: "hidden",
  },
  categoryImage: {
    width: "100%",
    height: "100%",
  },
  categoryImagePlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  categoryCardContent: {
    padding: 12,
  },
  categoryCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  categoryCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  inactiveBadge: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "600",
  },
  categoryCardDescription: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 16,
    marginBottom: 12,
  },
  categoryCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mealCountText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
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
    marginTop: 12,
  },
  orderingButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ec4899",
  },
});
