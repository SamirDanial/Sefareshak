import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { AuthNavbar } from "@/components/AuthNavbar";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import {
  declarationService,
  Declaration,
} from "@/src/services/declarationService";
import { formatPrice, fetchCurrency, fetchPublicSettings } from "@/src/utils/currency";
import AppStatusNotice from "@/components/AppStatusNotice";
import ApiService from "@/src/services/apiService";
import branchService from "@/src/services/branchService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GrayscaleImage from "@/components/GrayscaleImage";
import { getDeviceTimeZone } from "@/src/utils/timezones";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/src/utils/mealAvailability";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/200x200?text=Food";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

const getDealTotal = (deal: any): number => {
  const components = Array.isArray(deal?.components) ? deal.components : [];
  return components.reduce((sum: number, c: any) => {
    const v = c?.effectivePrice ?? c?.price;
    const n = typeof v === "number" ? v : parseFloat(String(v || 0));
    const q = c?.quantity !== undefined && c?.quantity !== null ? Number(c.quantity) : 1;
    const qty = Number.isFinite(q) && q > 0 ? q : 1;
    return sum + (isNaN(n) ? 0 : n) * qty;
  }, 0);
};

export default function MenuScreen() {
  const { t } = useTranslation();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const { branch, customerLocation, customerOrganizationSlug, visibleBranches, setBranch } = useBranch();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'ios' ? insets.top : 0;
  const navbarHeight = 70; // Navbar height
  const headerHeight = statusBarHeight + navbarHeight;
  const { categoryId, fromFavorites, favoriteBranchId } = useLocalSearchParams<{ categoryId?: string; fromFavorites?: string; favoriteBranchId?: string }>();
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allMeals, setAllMeals] = useState<any[]>([]);

  const [dealCategory, setDealCategory] = useState<any>(null);
  const [dealItems, setDealItems] = useState<any[]>([]);
  const isDealMode = Boolean(dealCategory);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    categoryId || null
  );
  const [selectedDeclarations, setSelectedDeclarations] = useState<Set<string>>(
    new Set()
  );
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [declarationsLoading, setDeclarationsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const categoryScrollRef = useRef<ScrollView>(null);
  const declarationScrollRef = useRef<ScrollView>(null);
  const mealsScrollRef = useRef<ScrollView>(null);
  const lastScrollY = useRef(0);
  const dealFetchSeq = useRef(0);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const isFetchingRef = useRef(false);

  const isOrgScoped = Boolean(customerOrganizationSlug);

  // Dynamically and synchronously calculate whether to bypass location filtering
  // This is true ONLY if the context branch matches the favoriteBranchId passed via navigation params
  const shouldBypassLocation = fromFavorites === "true" && branch?.id === favoriteBranchId;

  const selectedBranch = useMemo(() => {
    return branch?.id
      ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
      : null;
  }, [branch?.id, visibleBranches]);

  const apiBranchId = branch?.id;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

  const selectedBranchFull = useMemo(() => {
    if (!branch?.id) return null;
    return (visibleBranches as any[])?.find((b: any) => b?.id === branch.id) ?? null;
  }, [branch?.id, visibleBranches]);

  const effectiveTimezone = useMemo(() => {
    const deviceTz = getDeviceTimeZone();
    const branchTz = (selectedBranchFull as any)?.timezone ?? null;
    const settingsTz =
      (selectedBranchFull as any)?.organization?.settings?.timezone ?? null;
    return getEffectiveTimezone({
      branchTimezone: branchTz,
      settingsTimezone: settingsTz,
      deviceTimezone: deviceTz,
    });
  }, [selectedBranchFull]);

  useEffect(() => {
    if (isOrganizationUnavailable) {
      setAppStatus(organizationAppStatus);
      setSettingsLoading(false);
      return;
    }

    setSettingsLoading(true);
    fetchPublicSettings().then((settings) => {
      setCurrency(settings.currency);
      setAppStatus(settings.appStatus);
      setSettingsLoading(false);
    });
  }, [branch?.id, isOrganizationUnavailable, organizationAppStatus]);

  const fetchData = async () => {
    // Prevent duplicate fetches
    if (isFetchingRef.current) {
      return;
    }
    
    isFetchingRef.current = true;
    
    try {
      if (isOrganizationUnavailable) {
        setAllCategories([]);
        setAllMeals([]);
        setDealCategory(null);
        setDealItems([]);
        return;
      }
      setLoading(true);
      const apiService = ApiService.getInstance();

      // Fetch categories, filtered by branch
      const categoriesResponse = await apiService.getCategories(false, apiBranchId, shouldBypassLocation);
      if (categoriesResponse.success) {
        const categoriesData = categoriesResponse.data || [];
        setAllCategories(categoriesData);

        // If we're routed with a categoryId that isn't a meal category, treat it as a deal category.
        // This keeps Menu usable when navigation passes deal category ids.
        // Skip deal category fetch when coming from favorites to avoid cross-org category errors
        if (categoryId && !shouldBypassLocation) {
          const isMealCategory = categoriesData.some((cat: any) => cat.id === categoryId);
          if (!isMealCategory) {
            try {
              const dealCategoryResponse = await apiService.getDealCategory(categoryId, apiBranchId, shouldBypassLocation);
              if (dealCategoryResponse?.success) {
                setDealCategory(dealCategoryResponse.data);
                setDealItems(dealCategoryResponse.data?.deals || []);
                setSelectedDeclarations(new Set());
              } else {
                setDealCategory(null);
                setDealItems([]);
              }
            } catch {
              setDealCategory(null);
              setDealItems([]);
            }
          } else {
            setDealCategory(null);
            setDealItems([]);
          }
        }

        // Set default category if needed
        if (categoriesData.length > 0) {
          // Always check AsyncStorage first for stored category (from navigation back)
          const storedCategoryId = await AsyncStorage.getItem('menu:selectedCategory');
          let shouldSetDefault = true;

          if (storedCategoryId) {
            // Verify the stored category exists in the fetched categories
            const categoryExists = categoriesData.some((cat: any) => cat.id === storedCategoryId);
            if (categoryExists) {
              setSelectedCategory(storedCategoryId);
              // Clear the stored category after using it
              await AsyncStorage.removeItem('menu:selectedCategory');
              shouldSetDefault = false; // Don't set default, we just restored the stored category
            } else {
              // Stored category doesn't exist in fetched categories, clear it
              await AsyncStorage.removeItem('menu:selectedCategory');
            }
          }

          // Only set default if no category is selected and we didn't just restore a stored category
          if (shouldSetDefault) {
            setSelectedCategory((prev) => {
              if (prev) return prev;
              if (categoryId) return categoryId;
              return categoriesData[0].id;
            });
          }
        }
      }

      // Fetch meals, filtered by branch
      const mealsParams: any = {
        branchId: apiBranchId,
        bypassLocationFilter: shouldBypassLocation,
      };
      const mealsResponse = await apiService.getMeals(mealsParams);
      if (mealsResponse.success) {
        setAllMeals(mealsResponse.data || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Filter categories based on selected branch
  const categories = useMemo<any[]>(() => {
    if (!apiBranchId) return allCategories;
    return allCategories.filter((category: any) => {
      const excludedBranches = (category as any).excludedBranches || [];
      return !excludedBranches.includes(apiBranchId);
    });
  }, [allCategories, apiBranchId]);

  // Filter meals based on selected branch
  // Exclude meal if:
  // 1. Branch is in meal.excludedBranches, OR
  // 2. Branch is in meal.category.excludedBranches
  const meals = useMemo<any[]>(() => {
    if (!apiBranchId) return allMeals;
    return allMeals.filter((meal: any) => {
      // Check if meal is excluded
      const mealExcludedBranches = (meal as any).excludedBranches || [];
      if (mealExcludedBranches.includes(apiBranchId)) {
        return false;
      }
      // Check if category is excluded (if category is excluded, all meals in it are excluded)
      const categoryExcludedBranches = (meal.category as any)?.excludedBranches || [];
      if (categoryExcludedBranches.includes(apiBranchId)) {
        return false;
      }
      return true;
    });
  }, [allMeals, apiBranchId]);

  // Get branch-specific price for a meal
  // The API returns effectiveBasePrice when branchId is provided
  const getMealPrice = (meal: any): number => {
    // Use effectiveBasePrice if available (set by API when branchId is provided)
    if (meal.effectiveBasePrice !== undefined && meal.effectiveBasePrice !== null) {
      return parseFloat(meal.effectiveBasePrice.toString());
    }
    // Fallback to base price
    return parseFloat(meal.basePrice || "0");
  };

  useFocusEffect(
    React.useCallback(() => {
      setIsScreenFocused(true);
      
      // Clear stale data only on initial focus, not on branch change
      setAllCategories([]);
      setAllMeals([]);
      setDealCategory(null);
      setDealItems([]);
      setSelectedDeclarations(new Set());
      setSelectedCategory(null);
      setLoading(true);
      
      fetchData();
      fetchDeclarations();

      return () => {
        setIsScreenFocused(false);
      };
    }, [categoryId, customerOrganizationSlug, isOrganizationUnavailable, apiBranchId, shouldBypassLocation])
  );

  // Update selected category when categoryId from URL changes
  // Clear categoryId when coming from favorites to avoid cross-org category errors
  useEffect(() => {
    if (shouldBypassLocation) {
      setSelectedCategory(null);
      return;
    }
    if (categoryId) {
      setSelectedCategory(categoryId);
    }
  }, [categoryId, shouldBypassLocation]);

  // Refetch data when branch changes (but don't clear state first)
  useEffect(() => {
    if (!isScreenFocused) return;
    
    fetchData();
  }, [apiBranchId, isScreenFocused, shouldBypassLocation]);

  const tryLoadDealCategory = async (id: string) => {
    if (!isScreenFocused) return false;
    const apiService = ApiService.getInstance();
    const seq = ++dealFetchSeq.current;
    try {
      const res = await apiService.getDealCategory(id, branch?.id, shouldBypassLocation);
      if (seq !== dealFetchSeq.current) return;
      if (res?.success && res?.data && Array.isArray(res.data?.deals)) {
        setDealCategory(res.data);
        setDealItems(res.data?.deals || []);
        setSelectedDeclarations(new Set());
        return true;
      }
    } catch {
      if (seq !== dealFetchSeq.current) return false;
    }

    if (seq === dealFetchSeq.current) {
      setDealCategory(null);
      setDealItems([]);
    }
    return false;
  };

  // If a category is selected via tab/param, and it corresponds to a deal category too,
  // allow Menu to switch into deal listing mode.
  // Skip deal category fetch when coming from favorites to avoid cross-org category errors
  useEffect(() => {
    if (!isScreenFocused) return;
    if (!selectedCategory) {
      setDealCategory(null);
      setDealItems([]);
      return;
    }

    // Skip deal category fetch when coming from favorites
    if (shouldBypassLocation) {
      setDealCategory(null);
      setDealItems([]);
      return;
    }

    // Only attempt after categories loaded (so meals mode still works)
    if (categories.length === 0) return;

    // If this category has meals, keep normal menu behavior and don't switch into deal mode.
    // This prevents the meal list from rendering briefly and then disappearing when the deal fetch completes.
    const hasMealsInCategory = meals.some((m: any) => m?.categoryId === selectedCategory);
    if (hasMealsInCategory) {
      setDealCategory(null);
      setDealItems([]);
      return;
    }

    // Fire and forget; internally guarded against races.
    tryLoadDealCategory(selectedCategory);
  }, [selectedCategory, branch?.id, categories.length, meals, customerOrganizationSlug, isScreenFocused, shouldBypassLocation]);

  // Clear deal/category state when branch or organization changes to avoid stale categoryId 404s
  useEffect(() => {
    if (!isScreenFocused) return;
    setDealCategory(null);
    setDealItems([]);
    setSelectedDeclarations(new Set());
  }, [branch?.id, customerOrganizationSlug, isScreenFocused]);

  // Show navbar when screen is focused (preserve scroll position)
  // Also restore selected category if it was stored
  useFocusEffect(
    React.useCallback(() => {
      // Show navbar when coming back to this page
      // React Navigation will preserve scroll position automatically
      setScrollDirection('up');
      
      // Restore selected category if it was stored when navigating to meal details
      // This runs immediately when the page is focused, before fetchData might run
      const restoreCategory = async () => {
        try {
          const storedCategoryId = await AsyncStorage.getItem('menu:selectedCategory');
          if (storedCategoryId && !selectedCategory) {
            // Only restore if no category is currently selected
            // This prevents overriding a category that was already set
            setSelectedCategory(storedCategoryId);
            // Don't clear here - let fetchData clear it after verifying it exists in the categories list
          }
        } catch (error) {
          console.error('Error restoring category:', error);
        }
      };
      
      restoreCategory();
      
      // Scroll to selected category after a delay to ensure categories are loaded
      if (selectedCategory && categories.length > 0) {
        const scrollTimer = setTimeout(() => {
          const categoryIndex = categories.findIndex(
            (cat: any) => cat.id === selectedCategory
          );
          if (categoryIndex !== -1 && categoryScrollRef.current) {
            const itemWidth = 100;
            const viewportWidth = 400;
            const categoryPosition = categoryIndex * itemWidth;
            const scrollToX = Math.max(0, categoryPosition - (viewportWidth / 2) + (itemWidth / 2));
            
            categoryScrollRef.current.scrollTo({
              x: scrollToX,
              animated: true,
            });
          }
        }, 200);
        
        return () => clearTimeout(scrollTimer);
      }
    }, [setScrollDirection, selectedCategory, categories.length])
  );

  // Scroll to selected category when it changes or categories are loaded
  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      // Use setTimeout to ensure the ScrollView is fully rendered
      const scrollTimer = setTimeout(() => {
        const categoryIndex = categories.findIndex(
          (cat: any) => cat.id === selectedCategory
        );
        if (categoryIndex !== -1 && categoryScrollRef.current) {
          // Calculate better scroll position to center the category in viewport
          // Each category tab is approximately 100px wide (padding + text)
          const itemWidth = 100;
          const viewportWidth = 400; // Approximate viewport width
          const categoryPosition = categoryIndex * itemWidth;
          // Center the category in the viewport
          const scrollToX = Math.max(0, categoryPosition - (viewportWidth / 2) + (itemWidth / 2));
          
          categoryScrollRef.current.scrollTo({
            x: scrollToX,
            animated: true,
          });
        }
      }, 100); // Small delay to ensure ScrollView is ready
      
      return () => clearTimeout(scrollTimer);
    }
  }, [selectedCategory, categories.length]);

  const fetchDeclarations = async () => {
    try {
      setDeclarationsLoading(true);
      const allDeclarations = await declarationService.getAllDeclarations();
      setDeclarations(allDeclarations);
    } catch (error) {
      console.error("Error fetching declarations:", error);
      setDeclarations([]);
    } finally {
      setDeclarationsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchData(), fetchDeclarations(), fetchCurrency().then(setCurrency)]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeclarationToggle = (declarationId: string) => {
    setSelectedDeclarations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(declarationId)) {
        newSet.delete(declarationId);
      } else {
        newSet.add(declarationId);
      }
      return newSet;
    });
  };

  const getFilteredMeals = () => {
    let filtered = meals;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(
        (meal: any) => meal.categoryId === selectedCategory
      );
    }

    // Filter by declarations (meals must have ALL selected declarations)
    if (selectedDeclarations.size > 0) {
      filtered = filtered.filter((meal: any) => {
        if (!meal.mealDeclarations || meal.mealDeclarations.length === 0) {
          return false;
        }
        const mealDeclarationIds = new Set(
          meal.mealDeclarations.map(
            (md: any) => md.declaration?.id || md.declarationId
          )
        );
        // Check if meal has ALL of the selected declarations (AND logic)
        return Array.from(selectedDeclarations).every((id) =>
          mealDeclarationIds.has(id)
        );
      });
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (meal: any) =>
          meal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          meal.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  };

  const filteredMeals = getFilteredMeals();

  const filteredDeals = useMemo(() => {
    if (!isDealMode) return [];
    let filtered = Array.isArray(dealItems) ? dealItems : [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (deal: any) =>
          String(deal?.name || "").toLowerCase().includes(q) ||
          String(deal?.description || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [dealItems, isDealMode, searchQuery]);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    // Determine scroll direction
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };

  const effectiveAppStatus = isOrganizationUnavailable ? organizationAppStatus : appStatus;
  const isAppUnavailable = (!settingsLoading || isOrganizationUnavailable) && effectiveAppStatus !== "LIVE";

  if (settingsLoading && !isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={[styles.mealsList, { paddingTop: headerHeight, flex: 1, justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={{ color: "#9CA3AF", marginTop: 16 }}>{t("appStatus.loading")}</Text>
        </View>
      </View>
    );
  }

  if (isAppUnavailable) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <AppStatusNotice status={effectiveAppStatus as any} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AuthNavbar />

      {/* Meals List with Filters */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
        </View>
      ) : (
        <ScrollView
          ref={mealsScrollRef}
          style={styles.mealsList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.mealsListContent,
            { paddingTop: headerHeight }, // Account for navbar
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#ec4899"
              colors={["#ec4899"]}
            />
          }
        >
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={t("menu.searchPlaceholder")}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {!isDealMode && (
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesContainer}
              contentContainerStyle={styles.categoriesContent}
              nestedScrollEnabled={true}
            >
              {categories.map((category: any) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryTab,
                    selectedCategory === category.id && styles.categoryTabActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(category.id);
                    // Immediately exit deal mode while we re-check selected category
                    setDealCategory(null);
                    setDealItems([]);
                    setSelectedDeclarations(new Set());
                  }}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      selectedCategory === category.id &&
                        styles.categoryTabTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {isDealMode && (
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesContainer}
              contentContainerStyle={styles.categoriesContent}
              nestedScrollEnabled={true}
            >
              {categories.map((category: any) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryTab,
                    selectedCategory === category.id && styles.categoryTabActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(category.id);
                    setDealCategory(null);
                    setDealItems([]);
                    setSelectedDeclarations(new Set());
                  }}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      selectedCategory === category.id &&
                        styles.categoryTabTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Category Description */}
          {!isDealMode
            ? (() => {
                const selectedCategoryData = categories.find(
                  (cat: any) => cat.id === selectedCategory
                );
                return selectedCategoryData?.description ? (
                  <View style={styles.categoryDescriptionContainer}>
                    <Text style={styles.categoryDescriptionText}>
                      {selectedCategoryData.description}
                    </Text>
                  </View>
                ) : null;
              })()
            : dealCategory?.description
              ? (
                  <View style={styles.categoryDescriptionContainer}>
                    <Text style={styles.categoryDescriptionText}>
                      {dealCategory.description}
                    </Text>
                  </View>
                )
              : null}

          {/* Declaration Filter */}
          {!isDealMode &&
            (() => {
              const visibleDeclarations = declarations.filter(
                (declaration) => declaration.shownInFilter !== false
              );
              return visibleDeclarations.length > 0 ? (
                <View style={styles.declarationFilterContainer}>
                  <Text style={styles.filterLabel}>
                    {t("menu.filterByDeclarationLabel")}
                  </Text>
                  <ScrollView
                    ref={declarationScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.declarationsContainer}
                    contentContainerStyle={styles.declarationsContent}
                    nestedScrollEnabled={true}
                  >
                    {visibleDeclarations.map((declaration) => {
                      const isSelected = selectedDeclarations.has(declaration.id);
                      return (
                        <TouchableOpacity
                          key={declaration.id}
                          style={[
                            styles.declarationTab,
                            isSelected && styles.declarationTabActive,
                          ]}
                          onPress={() => handleDeclarationToggle(declaration.id)}
                        >
                          {declaration.icon && (
                            <Text style={styles.declarationIcon}>
                              {declaration.icon}
                            </Text>
                          )}
                          <Text
                            style={[
                              styles.declarationTabText,
                              isSelected && styles.declarationTabTextActive,
                            ]}
                          >
                            {declaration.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null;
            })()}

          {(isDealMode ? filteredDeals.length === 0 : filteredMeals.length === 0) ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isDealMode
                  ? t("menu.noItemsFound")
                  : selectedCategory || selectedDeclarations.size > 0
                  ? t("menu.noItemsMatchFilters")
                  : t("menu.noItemsFound")}
              </Text>
              {!isDealMode && (selectedCategory || selectedDeclarations.size > 0) && (
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={() => {
                    setSelectedCategory(null);
                    setSelectedDeclarations(new Set());
                  }}
                >
                  <Text style={styles.clearFiltersText}>
                    {t("menu.clearFilters")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.mealsContainer}>
              {(isDealMode ? filteredDeals : filteredMeals).map((item: any) => {
                const isDeal = isDealMode;
                const price = isDeal ? getDealTotal(item) : getMealPrice(item);
                const image = isDeal ? item.image : item.image;
                return (
                  <View key={item.id} style={styles.mealCard}>
                    {isDeal ? (
                      <Image
                        source={{
                          uri: getImageUrl(image),
                        }}
                        style={styles.mealImage}
                      />
                    ) : (
                      (() => {
                        const availability = getMealAvailabilityNow({
                          meal: item,
                          branchId: branch?.id,
                          tz: effectiveTimezone,
                        });
                        const isAvailableNow = availability.isAvailableNow;
                        return (
                          <GrayscaleImage
                            uri={getImageUrl(image)}
                            width={140}
                            height={140}
                            grayscale={!isAvailableNow}
                          />
                        );
                      })()
                    )}
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealName}>{item.name}</Text>
                      <Text style={styles.mealDescription} numberOfLines={2}>
                        {item.description}
                      </Text>
                      <View style={styles.mealFooter}>
                        <Text style={styles.mealPrice}>{formatPrice(price, currency)}</Text>
                        <TouchableOpacity
                          style={styles.addButton}
                          onPress={async () => {
                            if (isDeal) {
                              router.push(`/deal/${item.id}`);
                              return;
                            }
                            // Store the current route and selected category before navigating
                            await AsyncStorage.setItem('mealDetails:previousRoute', '/(tabs)/menu');
                            if (selectedCategory) {
                              await AsyncStorage.setItem('menu:selectedCategory', selectedCategory);
                            }
                            router.push(`/meal/${item.id}`);
                          }}
                        >
                          <Text style={styles.addButtonText}>
                            {t("home.feedMe")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 2,
    backgroundColor: "#151718",
  },
  searchInput: {
    backgroundColor: "#262626",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
  },
  categoriesContainer: {
    backgroundColor: "#151718",
    paddingTop: 2,
    paddingBottom: 2,
    minHeight: 48,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    gap: 0,
    alignItems: "center",
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 4,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  categoryTabActive: {
  },
  categoryTabText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#cccccc",
    letterSpacing: 0.2,
  },
  categoryTabTextActive: {
    color: "#ec4899",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  mealsList: {
    flex: 1,
  },
  mealsListContent: {
    paddingBottom: 100,
  },
  mealsContainer: {
    paddingTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
  },
  mealCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: "hidden",
    flexDirection: "row",
    minHeight: 140,
  },
  mealImage: {
    width: 140,
    height: 140,
    backgroundColor: "#333",
  },
  mealInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  mealName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  mealDescription: {
    fontSize: 13,
    color: "#999",
    marginBottom: 8,
    flex: 1,
    lineHeight: 18,
  },
  mealFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealPrice: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  declarationFilterContainer: {
    backgroundColor: "#151718",
    paddingTop: 8,
    paddingBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    color: "#999",
    paddingHorizontal: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  declarationsContainer: {
    maxHeight: 50,
  },
  declarationsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  declarationTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: "#262626",
    borderWidth: 1,
    borderColor: "transparent",
    marginRight: 8,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  declarationTabActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  declarationIcon: {
    fontSize: 14,
  },
  declarationTabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ccc",
  },
  declarationTabTextActive: {
    color: "#fff",
    fontWeight: "bold",
  },
  clearFiltersButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#262626",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  clearFiltersText: {
    color: "#ec4899",
    fontSize: 14,
    fontWeight: "600",
  },
  categoryDescriptionContainer: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
  },
  categoryDescriptionText: {
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 20,
  },
});
