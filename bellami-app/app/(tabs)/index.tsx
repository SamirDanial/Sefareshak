import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Linking,
  RefreshControl,
  findNodeHandle,
  UIManager,
  Alert,
} from "react-native";
import { AuthNavbar } from "@/components/AuthNavbar";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import SubscriptionDialog from "@/components/SubscriptionDialog";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useBranch } from "@/src/contexts/BranchContext";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import {
  heroSectionService,
  HeroSection,
} from "@/src/services/heroSectionService";
import AppStatusNotice from "@/components/AppStatusNotice";
import ServingHoursCard from "@/components/ServingHoursCard";
import ReservationHoursCard from "@/components/ReservationHoursCard";
import { FreeVersionBranchInfo } from "@/components/FreeVersionBranchInfo";
import GrayscaleImage from "@/components/GrayscaleImage";
import servingHoursService, {
  type DeliveryHours,
  type ServingHoursStatus,
} from "@/src/services/servingHoursService";
import { reservationService, type ReservationSettings } from "@/src/services/reservationService";
import ApiService from "@/src/services/apiService";
import branchService from "@/src/services/branchService";
import branchClickService from "@/src/services/branchClickService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceTimeZone } from "@/src/utils/timezones";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/src/utils/mealAvailability";
import { useCheckoutDraftStore } from "@/src/store/checkoutDraftStore";
import { useAuth } from "@/src/contexts/AuthContext";
import SubscriptionService from "@/src/services/subscriptionService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) return "https://placehold.co/80x80?text=Category";

  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  if (!imagePath.startsWith("/uploads/images/")) {
    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  }

  return `${API_BASE_URL}${imagePath}`;
};

// Function to truncate category name
const truncateCategoryName = (name: string): string => {
  if (name.length <= 12) {
    return name;
  }
  return name.substring(0, 9) + "...";
};

// Helper function to get hero image URL
const getHeroImageUrl = (image: string | null | undefined): string => {
  if (!image) {
    // Fallback to default image if no hero section image
    return "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIws61_264w_QkhPKA3zfYWvd5iI7pEdLnLw&s";
  }
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }
  return getImageUrl(image);
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const { userId, getToken } = useAuth();
  const isSignedIn = Boolean(userId);
  const params = useLocalSearchParams();

  const { setScrollDirection, setScrollPosition } = useScroll();
  const {
    branch,
    branches,
    visibleBranches,
    loadingBranches,
    setBranch,
    customerLocation,
    customerServiceType,
    customerServiceMode,
    setCustomerServiceMode,
    customerOrganizationSlug,
    setForcedBranchId,
  } = useBranch();
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'ios' ? insets.top : 0;
  const navbarHeight = 70; // Navbar height
  const headerHeight = statusBarHeight + navbarHeight;
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [specialOfferDealCategories, setSpecialOfferDealCategories] = useState<any[]>([]);
  const [allMeals, setAllMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroSection, setHeroSection] = useState<HeroSection | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const [appStatus, setAppStatus] = useState<string>("LIVE");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [servingHours, setServingHours] = useState<DeliveryHours | null>(null);
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);
  const [reservationSettings, setReservationSettings] = useState<ReservationSettings | null>(null);
  const [reservationSettingsLoading, setReservationSettingsLoading] = useState(true);
  const [likedBranchIds, setLikedBranches] = useState<string[]>([]);
  const [isLikingInFlight, setIsLikingInFlight] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribingInFlight, setIsSubscribingInFlight] = useState(false);
  const [subscriptionDialogVisible, setSubscriptionDialogVisible] = useState(false);
  const [likeDialogVisible, setLikeDialogVisible] = useState(false);

  const fetchLikedBranches = async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await branchService.getLikedBranches(token);
      if (res && res.success && Array.isArray(res.data)) {
        setLikedBranches(res.data.map((b: any) => b.id));
      }
    } catch (err) {
      console.error("Error fetching liked branches:", err);
    }
  };

  const fetchSubscriptionStatus = async () => {
    if (!isSignedIn || !branch?.id) {
      setIsSubscribed(false);
      return;
    }
    try {
      const token = await getToken();
      const subscriptionService = SubscriptionService.getInstance();
      const result = await subscriptionService.getSubscriptionStatus(branch.id, token || undefined);
      setIsSubscribed(result.isSubscribed);
    } catch (err) {
      console.error("Error fetching subscription status:", err);
      setIsSubscribed(false);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchLikedBranches();
    } else {
      setLikedBranches([]);
    }
  }, [isSignedIn]);

  // Handle branchId from notification click
  useEffect(() => {
    const branchId = params?.branchId as string | undefined;
    if (branchId) {
      // Set forced branch ID to bypass radius filtering
      setForcedBranchId(branchId);
      
      // Find the branch in the full branches list (not just visibleBranches)
      const targetBranch = branches.find((b) => b.id === branchId);
      if (targetBranch && targetBranch.id !== branch?.id) {
        setBranch(targetBranch);
      }
      
      // Clear the branchId from params and forcedBranchId to prevent re-setting
      const router = useRouter();
      router.setParams({ branchId: undefined });
      setForcedBranchId(null);
    }
  }, [params?.branchId, branches, branch?.id, setBranch, setForcedBranchId]);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [branch?.id, isSignedIn]);

  const isCurrentBranchLiked = useMemo(() => {
    return branch?.id ? likedBranchIds.includes(branch.id) : false;
  }, [branch?.id, likedBranchIds]);

  const handleToggleLike = async () => {
    if (!isSignedIn) {
      router.push("/(auth)/sign-in");
      return;
    }
    if (!branch?.id || isLikingInFlight) return;

    try {
      setIsLikingInFlight(true);
      const token = await getToken();
      if (!token) return;

      if (isCurrentBranchLiked) {
        await branchService.unlikeBranch(branch.id, token);
        setLikedBranches((prev) => prev.filter((id) => id !== branch.id));
      } else {
        await branchService.likeBranch(branch.id, token);
        setLikedBranches((prev) => [...prev, branch.id]);
      }
    } catch (err) {
      console.error("Error toggling like branch:", err);
    } finally {
      setIsLikingInFlight(false);
    }
  };

  const handleToggleSubscription = async () => {
    if (!isSignedIn) {
      router.push("/(auth)/sign-in");
      return;
    }
    if (!branch?.id || isSubscribingInFlight) {
      return;
    }

    try {
      setIsSubscribingInFlight(true);
      const token = await getToken();
      const subscriptionService = SubscriptionService.getInstance();

      if (isSubscribed) {
        await subscriptionService.unsubscribeFromBranch(branch.id, token || undefined);
        setIsSubscribed(false);
      } else {
        await subscriptionService.subscribeToBranch(branch.id, token || undefined);
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error("[Index] Error toggling subscription:", err);
      Alert.alert(
        t("home.subscription.errorTitle", { defaultValue: "Fehler" }),
        t("home.subscription.errorMessage", { defaultValue: "Ein Fehler ist aufgetreten. Bitte versuche es erneut." })
      );
    } finally {
      setIsSubscribingInFlight(false);
    }
  };

  const router = useRouter();

  // Horizontal scroll state for categories
  const categoriesScrollRef = useRef<ScrollView>(null);
  const [categoriesCanScrollLeft, setCategoriesCanScrollLeft] = useState(false);
  const [categoriesCanScrollRight, setCategoriesCanScrollRight] = useState(false);
  const categoriesScrollX = useRef(0);

  // Horizontal scroll state for featured meals (per row)
  const featuredRowRefs = useRef<(ScrollView | null)[]>([]);
  const [featuredScrollStates, setFeaturedScrollStates] = useState<Record<number, { canScrollLeft: boolean; canScrollRight: boolean }>>({});
  const featuredScrollX = useRef<Record<number, number>>({});

  const isOrgScoped = Boolean(customerOrganizationSlug);

  const selectedBranch = branch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
    : null;
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

  const selectedBranchHasDelivery = useMemo(() => {
    const b: any = selectedBranchFull;
    if (!b) return false;
    const branchVal = b?.deliveryEnabled;
    const orgVal = b?.organization?.settings?.deliveryEnabled;
    return branchVal === true || orgVal === true;
  }, [selectedBranchFull]);

  const selectedBranchHasPickup = useMemo(() => {
    const b: any = selectedBranchFull;
    if (!b) return false;
    const branchVal = b?.pickupEnabled;
    return branchVal !== false;
  }, [selectedBranchFull]);

  useEffect(() => {
    if (isOrgScoped) return;
    if (loadingBranches) return;
    if (branch?.id) return;

    const first = visibleBranches?.[0];
    if (first?.id) {
      // Record branch click for automatic selection (non-blocking)
      branchClickService.recordBranchClick(first.id, userId).catch(() => {
        // Silently ignore errors - click tracking shouldn't block user experience
      });
      
      setBranch({ id: first.id, name: (first as any)?.name ?? null, distanceKm: null });
    }
  }, [branch?.id, isOrgScoped, loadingBranches, setBranch, visibleBranches]);

  const lastScrollY = React.useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const mealRefs = useRef<{ [key: string]: any }>({});
  const currentScrollY = React.useRef(0);
  const isRestoringScroll = React.useRef(false);
  // Refs for horizontal ScrollViews: section_mealId -> ScrollView ref
  const horizontalScrollRefs = useRef<{ [key: string]: ScrollView | null }>({});
  // Track horizontal scroll positions: section_mealId -> scrollX
  const horizontalScrollPositions = useRef<{ [key: string]: number }>({});

  // Filter categories based on selected branch
  const categories = useMemo(() => {
    if (!branch?.id) return allCategories;
    return allCategories.filter((category) => {
      const excludedBranches = (category as any).excludedBranches || [];
      return !excludedBranches.includes(branch.id);
    });
  }, [allCategories, branch?.id]);

  // Filter meals based on selected branch
  // Exclude meal if:
  // 1. Branch is in meal.excludedBranches, OR
  // 2. Branch is in meal.category.excludedBranches
  const meals = useMemo(() => {
    if (!branch?.id) return allMeals;
    return allMeals.filter((meal) => {
      // Check if meal is excluded
      const mealExcludedBranches = (meal as any).excludedBranches || [];
      if (mealExcludedBranches.includes(branch.id)) {
        return false;
      }
      // Check if category is excluded (if category is excluded, all meals in it are excluded)
      const categoryExcludedBranches = (meal.category as any)?.excludedBranches || [];
      if (categoryExcludedBranches.includes(branch.id)) {
        return false;
      }
      return true;
    });
  }, [allMeals, branch?.id]);

  // Sort featured meals by featuredOrder
  const featuredMeals = useMemo(() => {
    return meals
      .filter((m: any) => m.isFeatured)
      .sort((a: any, b: any) => {
        const orderA =
          typeof a.featuredOrder === "number" && a.featuredOrder > 0
            ? a.featuredOrder
            : Number.MAX_SAFE_INTEGER;
        const orderB =
          typeof b.featuredOrder === "number" && b.featuredOrder > 0
            ? b.featuredOrder
            : Number.MAX_SAFE_INTEGER;
        if (orderA === orderB) {
          return a.name.localeCompare(b.name);
        }
        return orderA - orderB;
      });
  }, [meals]);

  // Split featured meals into rows of 5
  const featuredRows = useMemo(() => {
    const rows: any[][] = [];
    for (let i = 0; i < featuredMeals.length; i += 5) {
      rows.push(featuredMeals.slice(i, i + 5));
    }
    return rows;
  }, [featuredMeals]);

  // Check scroll state for a specific row
  const checkFeaturedScroll = (rowIndex: number, event: any) => {
    const contentSize = event.nativeEvent.contentSize;
    const layoutMeasurement = event.nativeEvent.layoutMeasurement;
    if (contentSize && layoutMeasurement) {
      const scrollX = event.nativeEvent.contentOffset.x;
      featuredScrollX.current[rowIndex] = scrollX;
      const contentWidth = contentSize.width;
      const layoutWidth = layoutMeasurement.width;
      setFeaturedScrollStates(prev => ({
        ...prev,
        [rowIndex]: {
          canScrollLeft: scrollX > 5,
          canScrollRight: scrollX < contentWidth - layoutWidth - 5,
        },
      }));
    }
  };

  // Scroll left for a specific row
  const scrollFeaturedLeft = (rowIndex: number) => {
    const ref = featuredRowRefs.current[rowIndex];
    if (ref) {
      const currentX = featuredScrollX.current[rowIndex] || 0;
      ref.scrollTo({ x: Math.max(0, currentX - 176), animated: true });
    }
  };

  // Scroll right for a specific row
  const scrollFeaturedRight = (rowIndex: number) => {
    const ref = featuredRowRefs.current[rowIndex];
    if (ref) {
      const currentX = featuredScrollX.current[rowIndex] || 0;
      ref.scrollTo({ x: currentX + 176, animated: true });
    }
  };

  // Check initial scroll state for all rows on layout
  const handleFeaturedRowLayout = (rowIndex: number, event: any) => {
    const layoutWidth = event.nativeEvent.layout.width;
    if (layoutWidth) {
      setFeaturedScrollStates(prev => ({
        ...prev,
        [rowIndex]: {
          canScrollLeft: false,
          canScrollRight: featuredRows[rowIndex].length * 176 > layoutWidth,
        },
      }));
    }
  };

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

  useEffect(() => {
    if (!branch?.id) return;

    if (isOrganizationUnavailable) {
      setAppStatus(organizationAppStatus);
      setSettingsLoading(false);
      return;
    }

    void fetchCurrency();
  }, [branch?.id, isOrganizationUnavailable, organizationAppStatus]);

  // Calculate distance between two coordinates using Haversine formula (same as book reservation)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  // Get user's current location (same as book reservation)
  const getUserLocation = async (): Promise<{ latitude: number; longitude: number }> => {
    try {
      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        throw new Error("Location services are disabled");
      }

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location permission denied");
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error: any) {
      throw error;
    }
  };

  // Find nearest branch (same as book reservation)
  const findNearestBranch = async (branchesList: any[], userLat: number, userLon: number): Promise<string | null> => {
    const branchesWithDistance: Array<{ branch: any; distance: number }> = [];

    // Check each branch and calculate distance
    for (const branchItem of branchesList) {
      if (!branchItem.latitude || !branchItem.longitude) continue;

      const distance = calculateDistance(
        userLat,
        userLon,
        branchItem.latitude,
        branchItem.longitude
      );
      branchesWithDistance.push({ branch: branchItem, distance });
    }

    if (branchesWithDistance.length === 0) {
      return null;
    }

    // Sort by distance and return the nearest branch ID
    branchesWithDistance.sort((a, b) => a.distance - b.distance);
    return branchesWithDistance[0].branch.id;
  };

  useEffect(() => {
    fetchCurrency();
    fetchHeroSection();
  }, []);

  useEffect(() => {
    // Branch selection shouldn't trigger scroll restoration/jumps.
    // Only restore scroll when returning from meal details (keys are set there).
    if (!branch?.id) return;
    AsyncStorage.multiRemove([
      "home:scrollPosition",
      "home:selectedMealId",
      "home:selectedSection",
      "home:horizontalScroll",
    ]).catch(() => {});
  }, [branch?.id]);

  // Refetch data when branch changes
  useEffect(() => {
    if (!branch?.id) return;
    if (loadingBranches) return;
    fetchData();
    fetchServingHours();
    fetchReservationSettings();
  }, [branch?.id, loadingBranches]);

  // Refetch data when organization changes (to clear stale deal/category IDs)
  useEffect(() => {
    setAllCategories([]);
    setAllMeals([]);
    setSpecialOfferDealCategories([]);
    if (branch?.id && !loadingBranches) {
      fetchData();
    }
  }, [branch?.id, customerOrganizationSlug, loadingBranches]);

  useEffect(() => {
    // Keep hero section in sync with selected branch's organization (like web).
    // This also covers the case where branch is already selected but branches list loads later.
    void fetchHeroSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id, visibleBranches.length]);

  // Restore scroll position when content size changes (ensures ScrollView is ready)
  const handleContentSizeChange = React.useCallback(async () => {
    if (isRestoringScroll.current) return; // Prevent multiple restorations
    
    try {
      const storedScrollY = await AsyncStorage.getItem('home:scrollPosition');
      const storedMealId = await AsyncStorage.getItem('home:selectedMealId');
      const storedSection = await AsyncStorage.getItem('home:selectedSection');
      const storedHorizontalScroll = await AsyncStorage.getItem('home:horizontalScroll');
      
      // Only restore if we have stored values AND a selected meal id (coming back from meal details)
      // (Prevents accidental scroll jumps when switching branches.)
      if (storedScrollY && storedMealId && scrollViewRef.current) {
        isRestoringScroll.current = true;
        const scrollY = parseFloat(storedScrollY);
        
        // Restore vertical scroll position immediately
        scrollViewRef.current.scrollTo({
          y: scrollY,
          animated: false,
        });
        
        // If we have a meal ID, try to scroll to it after a short delay
        if (storedMealId) {
          setTimeout(() => {
            const mealRef = mealRefs.current[storedMealId];
            if (mealRef && scrollViewRef.current) {
              const scrollViewHandle = findNodeHandle(scrollViewRef.current);
              const mealHandle = findNodeHandle(mealRef);
              
              if (scrollViewHandle && mealHandle) {
                // Use UIManager.measureLayout for native components
                UIManager.measureLayout(
                  mealHandle,
                  scrollViewHandle,
                  () => {
                    // Clear stored values even if measureLayout fails
                    setTimeout(() => {
                      AsyncStorage.removeItem('home:scrollPosition').catch(() => {});
                      AsyncStorage.removeItem('home:selectedMealId').catch(() => {});
                      AsyncStorage.removeItem('home:selectedSection').catch(() => {});
                      AsyncStorage.removeItem('home:horizontalScroll').catch(() => {});
                      isRestoringScroll.current = false;
                    }, 100);
                  },
                  (x: number, y: number, width: number, height: number) => {
                    // Success callback
                    // Scroll to show the meal in viewport (center it vertically)
                    const viewportHeight = 800; // Approximate viewport height
                    const scrollToY = Math.max(0, y - (viewportHeight / 2) + (height / 2));
                    scrollViewRef.current?.scrollTo({
                      y: scrollToY,
                      animated: true,
                    });
                    
                    // Now restore horizontal scroll position if available
                    if (storedSection && storedMealId && storedHorizontalScroll) {
                      const horizontalScrollKey = `${storedSection}_${storedMealId}`;
                      const horizontalScrollRef = horizontalScrollRefs.current[horizontalScrollKey];
                      const storedHorizontalScrollX = parseFloat(storedHorizontalScroll);
                      
                      if (horizontalScrollRef) {
                        // Wait a bit more for the horizontal ScrollView to be ready
                        setTimeout(() => {
                          // Measure the meal's position within the horizontal ScrollView
                          const horizontalScrollHandle = findNodeHandle(horizontalScrollRef);
                          if (horizontalScrollHandle && mealHandle) {
                            UIManager.measureLayout(
                              mealHandle,
                              horizontalScrollHandle,
                              () => {
                                // If measureLayout fails, use stored horizontal scroll position
                                horizontalScrollRef.scrollTo({
                                  x: storedHorizontalScrollX,
                                  animated: true,
                                });
                              },
                              (mealX: number, mealY: number, mealWidth: number, mealHeight: number) => {
                                // Calculate scroll position to center the meal in horizontal viewport
                                const viewportWidth = 400; // Approximate viewport width
                                const scrollToX = Math.max(0, mealX - (viewportWidth / 2) + (mealWidth / 2));
                                horizontalScrollRef.scrollTo({
                                  x: scrollToX,
                                  animated: true,
                                });
                              }
                            );
                          } else {
                            // Fallback: use stored horizontal scroll position
                            horizontalScrollRef.scrollTo({
                              x: storedHorizontalScrollX,
                              animated: true,
                            });
                          }
                        }, 200);
                      }
                    }
                    
                    // Clear stored values after successful restoration
                    setTimeout(() => {
                      AsyncStorage.removeItem('home:scrollPosition').catch(() => {});
                      AsyncStorage.removeItem('home:selectedMealId').catch(() => {});
                      AsyncStorage.removeItem('home:selectedSection').catch(() => {});
                      AsyncStorage.removeItem('home:horizontalScroll').catch(() => {});
                      isRestoringScroll.current = false;
                    }, 500);
                  }
                );
              } else {
                // Clear stored values if we can't get handles
                AsyncStorage.removeItem('home:scrollPosition').catch(() => {});
                AsyncStorage.removeItem('home:selectedMealId').catch(() => {});
                AsyncStorage.removeItem('home:selectedSection').catch(() => {});
                AsyncStorage.removeItem('home:horizontalScroll').catch(() => {});
                isRestoringScroll.current = false;
              }
            } else {
              // Clear stored values if meal ref not found
              AsyncStorage.removeItem('home:scrollPosition').catch(() => {});
              AsyncStorage.removeItem('home:selectedMealId').catch(() => {});
              AsyncStorage.removeItem('home:selectedSection').catch(() => {});
              AsyncStorage.removeItem('home:horizontalScroll').catch(() => {});
              isRestoringScroll.current = false;
            }
          }, 300);
        } else {
          // No meal ID, just clear stored values after restoring scroll position
          setTimeout(() => {
            AsyncStorage.removeItem('home:scrollPosition').catch(() => {});
            AsyncStorage.removeItem('home:selectedMealId').catch(() => {});
            AsyncStorage.removeItem('home:selectedSection').catch(() => {});
            AsyncStorage.removeItem('home:horizontalScroll').catch(() => {});
            isRestoringScroll.current = false;
          }, 100);
        }
      }

      // If we have a stored scroll position but no meal id, treat it as stale and clear it.
      if (storedScrollY && !storedMealId) {
        AsyncStorage.removeItem('home:scrollPosition').catch(() => {});
      }
    } catch (error) {
      console.error('Error restoring scroll position:', error);
      isRestoringScroll.current = false;
    }
  }, []);

  const prevBranchIdRef = React.useRef<string | null>(null);
  const pendingBranchScrollRestoreRef = React.useRef<number | null>(null);

  useEffect(() => {
    const currentBranchId = branch?.id ?? null;
    const previousBranchId = prevBranchIdRef.current;

    if (previousBranchId !== null && currentBranchId !== null && currentBranchId !== previousBranchId) {
      const y = currentScrollY.current;
      if (y > 0) {
        pendingBranchScrollRestoreRef.current = y;
        setTimeout(() => {
          const target = pendingBranchScrollRestoreRef.current;
          if (target != null && scrollViewRef.current) {
            scrollViewRef.current.scrollTo({ y: target, animated: false });
          }
          pendingBranchScrollRestoreRef.current = null;
        }, 50);
      }
    }

    prevBranchIdRef.current = currentBranchId;
  }, [branch?.id]);

  // Show navbar when screen is focused (preserve scroll position)
  // Also restore scroll position and scroll to meal if needed
  useFocusEffect(
    React.useCallback(() => {
      // Show navbar when coming back to this page
      setScrollDirection('up');
      
      // Trigger scroll restoration after a delay to ensure content is rendered
      const timer = setTimeout(() => {
        handleContentSizeChange();
      }, 200);
      
      return () => {
        clearTimeout(timer);
      };
    }, [setScrollDirection, handleContentSizeChange])
  );

  // Fetch serving hours from selected branch
  const fetchServingHours = async () => {
    try {
      if (isOrganizationUnavailable) {
        setServingHours(null);
        setServingHoursStatus(null);
        setServingHoursLoading(false);
        return;
      }
      setServingHoursLoading(true);
      const response = await servingHoursService.getServingHours(branch?.id);
      if (response.success && response.data) {
        setServingHours(response.data.hours);
        setServingHoursStatus(response.data.currentStatus);
      }
    } catch (error) {
      console.error("Error fetching serving hours:", error);
    } finally {
      setServingHoursLoading(false);
    }
  };

  // Fetch reservation settings from selected branch (or global if no branch selected)
  const fetchReservationSettings = async () => {
    try {
      if (isOrganizationUnavailable) {
        setReservationSettings(null);
        setReservationSettingsLoading(false);
        return;
      }
      setReservationSettingsLoading(true);
      const settings = await reservationService.getSettings(undefined, branch?.id);
      if (settings && settings.isEnabled) {
        setReservationSettings(settings);
      } else {
        setReservationSettings(null);
      }
    } catch (error) {
      const err = error as any;
      const status = err?.status;
      if (status === 400 && branch?.id) {
        try {
          const settings = await reservationService.getSettings(undefined, undefined);
          if (settings && settings.isEnabled) {
            setReservationSettings(settings);
          } else {
            setReservationSettings(null);
          }
        } catch (inner) {
        }
        try {
          await setBranch(null);
        } catch (e) {
        }
        return;
      }
      console.error("Error fetching reservation settings:", error);
    } finally {
      setReservationSettingsLoading(false);
    }
  };

  // Update currency from branch settings
  const updateCurrencyFromBranch = async () => {
    try {
      if (!branch?.id) return;
      const branches = await branchService.getBranches();
      const selectedBranch = branches.find((b) => b.id === branch.id);
      if (selectedBranch?.currency) {
        setCurrency(selectedBranch.currency);
      }
    } catch (error) {
      console.error("Error fetching branch currency:", error);
    }
  };

  // Format price with currency
  const formatPrice = (amount: number): string => {
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
    }).format(amount);
  };

  // Fetch currency and app status from public settings
  const fetchCurrency = async () => {
    try {
      setSettingsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/user/settings/public`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        const settings = result?.data || {};
        if (settings.currency) {
          setCurrency(settings.currency);
        }
        if (settings.appStatus) {
          setAppStatus(settings.appStatus);
        }
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      // Keep defaults if fetch fails
    } finally {
      setSettingsLoading(false);
    }
  };

  // Fetch hero section
  const fetchHeroSection = async () => {
    try {
      setHeroLoading(true);
      const selectedBranch = branch?.id
        ? visibleBranches.find((b: any) => b?.id === branch.id)
        : null;
      const organizationId =
        (selectedBranch as any)?.organizationId ?? (selectedBranch as any)?.organization?.id ?? null;

      let orgHero: HeroSection | null = null;
      if (organizationId) {
        try {
          orgHero = await heroSectionService.getActiveHeroSection(organizationId);
        } catch {
          orgHero = null;
        }
      }

      if (orgHero) {
        setHeroSection(orgHero);
        return;
      }

      let appHero: HeroSection | null = null;
      try {
        appHero = await heroSectionService.getActiveHeroSection(null);
      } catch {
        appHero = null;
      }
      setHeroSection(appHero);
    } catch (error) {
      console.error("Error fetching hero section:", error);
      // If hero section fetch fails, use fallback (null will use default values)
    } finally {
      setHeroLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      if (isOrganizationUnavailable) {
        setAllCategories([]);
        setSpecialOfferDealCategories([]);
        setAllMeals([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const apiService = ApiService.getInstance();
      
      // Fetch only featured categories for home page, filtered by branch
      const categoriesParams = new URLSearchParams();
      categoriesParams.append("featured", "true");
      if (branch?.id) {
        categoriesParams.append("branchId", branch.id);
      }
      const categoriesResponse = await apiService.getCategories(true, branch?.id);
      if (categoriesResponse.success) {
        setAllCategories(categoriesResponse.data || []);
      }

      // Fetch featured deal categories (special offers), filtered by branch
      try {
        const dealCategoriesResponse = await apiService.getDealCategories(true, branch?.id);
        if (dealCategoriesResponse?.success) {
          setSpecialOfferDealCategories(dealCategoriesResponse.data || []);
        } else {
          setSpecialOfferDealCategories([]);
        }
      } catch (e) {
        setSpecialOfferDealCategories([]);
      }

      // Fetch meals, filtered by branch
      const mealsParams: any = {};
      if (branch?.id) {
        mealsParams.branchId = branch.id;
      }
      const mealsResponse = await apiService.getMeals(mealsParams);
      if (mealsResponse.success) {
        setAllMeals(mealsResponse.data || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchHeroSection(),
        fetchCurrency(),
        ...(isOrganizationUnavailable
          ? []
          : [fetchData(), fetchServingHours(), fetchReservationSettings()]),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleScroll = (event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    currentScrollY.current = scrollY;
    setScrollPosition(scrollY);
    
    // Determine scroll direction
    if (scrollY > lastScrollY.current && scrollY > 10) {
      setScrollDirection('down');
    } else if (scrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = scrollY;
  };

  const effectiveAppStatus = isOrganizationUnavailable ? organizationAppStatus : appStatus;

  // Show app status notice if app is unavailable
  const isAppUnavailable = (!settingsLoading || isOrganizationUnavailable) && effectiveAppStatus !== "LIVE";

  if (!isOrgScoped && !loadingBranches && visibleBranches.length === 0) {
    const serviceLabel =
      customerServiceType === "MEAT_SHOP"
        ? t("home.scope.services.meatShop", { defaultValue: "Meat Shop" })
        : customerServiceType === "BAKERY"
          ? t("home.scope.services.bakery", { defaultValue: "Bakery" })
          : customerServiceType === "FOOD_TRUCK"
            ? t("home.scope.services.foodTruck", { defaultValue: "Food Truck" })
            : t("home.scope.services.restaurant", { defaultValue: "Restaurant" });

    const modeLabel =
      customerServiceMode === "PICKUP"
        ? t("home.scope.modes.pickup", { defaultValue: "Pickup" })
        : customerServiceMode === "RESERVATION"
          ? t("home.scope.modes.reservation", { defaultValue: "Reservation" })
          : t("home.scope.modes.delivery", { defaultValue: "Delivery" });

    return (
      <View style={styles.container}>
        <AuthNavbar />
        <ScrollView
          style={[styles.scrollView, { paddingTop: headerHeight }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section (no CTA buttons when no branches) */}
          {heroLoading ? (
            <View style={styles.heroSection}>
              <View style={styles.heroOverlay}>
                <View style={styles.heroContent}>
                  <ActivityIndicator size="large" color="#ec4899" />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.heroSection}>
              <Image
                source={{
                  uri: heroSection?.backgroundImage
                    ? getHeroImageUrl(heroSection.backgroundImage)
                    : getHeroImageUrl(null),
                }}
                style={styles.heroImage}
              />
              <View style={styles.heroOverlay}>
                <View style={styles.heroContent}>
                  {(heroSection?.badgeText || !heroSection) && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {heroSection?.badgeText || t("home.hero.badge")}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.heroTitle}>
                    {heroSection?.title || t("home.hero.title")}
                  </Text>
                  {(heroSection?.subtitle || !heroSection) && (
                    <Text style={styles.heroSubtitle}>
                      {heroSection?.subtitle || t("home.hero.subtitle")}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          <View style={[styles.section, { paddingTop: 16 }]}>
            <View
              style={{
                backgroundColor: "#171717",
                borderColor: "#262626",
                borderWidth: 1,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                {t("home.noBranchesForScope.title", { defaultValue: "No branches available" })}
              </Text>
              <Text style={{ color: "#9CA3AF", marginTop: 6, fontSize: 13, lineHeight: 18 }}>
                {t("home.noBranchesForScope.subtitle", {
                  defaultValue:
                    "We couldn't find any branches that match your current scope ({{service}} • {{mode}}). Try changing your service, order method, or location.",
                  service: serviceLabel,
                  mode: modeLabel,
                })}
              </Text>

              <TouchableOpacity
                style={[styles.scopeButton, { marginTop: 12 }]}
                onPress={() => router.push("/(tabs)/scope?reset=1" as any)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="tune" size={16} color="#A7F3D0" />
                <Text style={styles.scopeButtonText}>
                  {t("home.changeServiceOrAddress", {
                    defaultValue: "Change service / address",
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (settingsLoading && !isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <AuthNavbar />
        <View style={[styles.scrollView, { paddingTop: headerHeight, flex: 1, justifyContent: "center", alignItems: "center" }]}>
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
          <View style={styles.branchSwitcherContainer}>
            <View style={styles.branchSwitcherRow}>
              <View style={styles.branchSwitcherWrapper}>
                <BranchSwitcher variant="carousel" showCarouselHeader={false} />
              </View>
            </View>

            <TouchableOpacity
              style={styles.scopeButton}
              onPress={() => router.push("/(tabs)/scope?reset=1" as any)}
              activeOpacity={0.85}
            >
              <MaterialIcons name="tune" size={16} color="#A7F3D0" />
              <Text style={styles.scopeButtonText}>
                {t("home.changeServiceOrAddress", {
                  defaultValue: "Change Service / Address",
                })}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <AppStatusNotice status={effectiveAppStatus as any} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AuthNavbar />
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { paddingTop: headerHeight }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
          />
        }
      >
        {/* Hero Section */}
        {heroLoading ? (
          <View style={styles.heroSection}>
            <View style={styles.heroOverlay}>
              <View style={styles.heroContent}>
                <ActivityIndicator size="large" color="#ec4899" />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.heroSection}>
            <Image
              source={{
                uri: heroSection?.backgroundImage
                  ? getHeroImageUrl(heroSection.backgroundImage)
                  : getHeroImageUrl(null),
              }}
              style={styles.heroImage}
            />
            {branch?.id && (
              <View style={[styles.heroButtonsContainer, Platform.OS === 'android' && { top: headerHeight + 16 - 35 }]}>
                <TouchableOpacity
                  style={styles.likeButton}
                  onPress={handleToggleLike}
                  disabled={isLikingInFlight}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={isCurrentBranchLiked ? "favorite" : "favorite-border"}
                    size={22}
                    color={isCurrentBranchLiked ? "#f43f5e" : "#fff"}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.subscribeButton}
                  onPress={handleToggleSubscription}
                  disabled={isSubscribingInFlight}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={isSubscribed ? "notifications" : "notifications-none"}
                    size={22}
                    color={isSubscribed ? "#ec4899" : "#fff"}
                  />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.heroOverlay}>
              <View style={styles.heroContent}>
                {(heroSection?.badgeText || !heroSection) && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {heroSection?.badgeText || t("home.hero.badge")}
                    </Text>
                  </View>
                )}
                <Text style={styles.heroTitle}>
                  {heroSection?.title || t("home.hero.title")}
                </Text>
                {(heroSection?.subtitle || !heroSection) && (
                  <Text style={styles.heroSubtitle}>
                    {heroSection?.subtitle || t("home.hero.subtitle")}
                  </Text>
                )}
                <View style={styles.heroButtonsWrap}>
                  <View style={styles.heroButtons}>
                    {(heroSection?.primaryButtonText || !heroSection) && (
                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => {
                          if (heroSection?.primaryButtonLink) {
                            // Handle external links
                            if (
                              heroSection.primaryButtonLink.startsWith(
                                "http://"
                              ) ||
                              heroSection.primaryButtonLink.startsWith("https://")
                            ) {
                              Linking.openURL(heroSection.primaryButtonLink);
                            } else {
                              // Handle internal navigation
                              router.push(heroSection.primaryButtonLink as any);
                            }
                          } else {
                            // Default action - navigate to menu
                            router.push("/(tabs)/menu");
                          }
                        }}
                      >
                        <Text style={styles.primaryButtonText}>
                          {heroSection?.primaryButtonText || t("home.hero.orderNow")}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {(heroSection?.secondaryButtonText || !heroSection) && (
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => {
                          if (heroSection?.secondaryButtonLink) {
                            // Handle external links
                            if (
                              heroSection.secondaryButtonLink.startsWith(
                                "http://"
                              ) ||
                              heroSection.secondaryButtonLink.startsWith(
                                "https://"
                              )
                            ) {
                              Linking.openURL(heroSection.secondaryButtonLink);
                            } else {
                              // Handle internal navigation
                              router.push(heroSection.secondaryButtonLink as any);
                            }
                          } else {
                            // Default action - navigate to menu
                            router.push("/(tabs)/menu");
                          }
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {heroSection?.secondaryButtonText || t("home.hero.viewMenu")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {branch?.id ? (
                    <View style={styles.modeButtons}>
                      {reservationSettings?.isEnabled === true ? (
                        <TouchableOpacity
                          style={
                            customerServiceMode === "RESERVATION"
                              ? [styles.modeButton, styles.modeButtonSelected]
                              : [styles.modeButton, styles.modeButtonOutline]
                          }
                          disabled={reservationSettingsLoading}
                          onPress={() => {
                            setCustomerServiceMode("RESERVATION");
                            router.push("/book-reservation");
                          }}
                        >
                          <Text
                            style={
                              customerServiceMode === "RESERVATION"
                                ? styles.modeButtonTextSelected
                                : styles.modeButtonText
                            }
                          >
                            {t("home.hero.mode.reservation", { defaultValue: "Reservation" })}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Branch Switcher and Find Branch */}
        <View style={styles.branchSwitcherContainer}>
          <View style={styles.branchSwitcherRow}>
            <View style={styles.branchSwitcherWrapper}>
              <BranchSwitcher variant="carousel" showCarouselHeader={false} />
            </View>
          </View>

		  <TouchableOpacity
		    style={styles.scopeButton}
		    onPress={() => router.push("/(tabs)/scope?reset=1" as any)}
		    activeOpacity={0.85}
		  >
		    <MaterialIcons name="tune" size={16} color="#A7F3D0" />
		    <Text style={styles.scopeButtonText}>
		      {t("home.changeServiceOrAddress", {
		        defaultValue: "Change Service / Address",
		      })}
		    </Text>
		  </TouchableOpacity>
        </View>

        {/* Free Version Branch Info or Regular Content */}
        {(() => {
          const fullBranch = visibleBranches.find((b: any) => b?.id === branch?.id);
          const isFreeVersion = fullBranch?.organization?.freeVersion;
          
          return isFreeVersion ? (
            <FreeVersionBranchInfo branch={fullBranch} />
          ) : (
            <>
              {/* Serving Hours Section */}
              {!servingHoursLoading && servingHours && servingHoursStatus && (
                <ServingHoursCard hours={servingHours} status={servingHoursStatus} effectiveTimezone={effectiveTimezone} />
              )}

              {/* Reservation Hours Section */}
              {!reservationSettingsLoading && reservationSettings && reservationSettings.isEnabled && (
                <ReservationHoursCard settings={reservationSettings} effectiveTimezone={effectiveTimezone} />
              )}

              {/* Categories Section */}
              {loading ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t("home.categories")}</Text>
                    <TouchableOpacity
                      onPress={() => router.push("/categories")}
                      style={styles.showAllButton}
                    >
                      <Text style={styles.showAllText}>{t("home.showAll")}</Text>
                    </TouchableOpacity>
                  </View>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : categories.length === 0 ? null : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("home.categories")}</Text>
              <TouchableOpacity
                onPress={() => router.push("/categories")}
                style={styles.showAllButton}
              >
                <Text style={styles.showAllText}>{t("home.showAll")}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.horizontalScrollContainer}>
              {categoriesCanScrollLeft && (
                <TouchableOpacity
                  style={styles.chevronLeft}
                  onPress={() => {
                    categoriesScrollRef.current?.scrollTo({ x: Math.max(0, categoriesScrollX.current - 136), animated: true });
                  }}
                >
                  <MaterialIcons name="chevron-left" size={28} color="#fff" />
                </TouchableOpacity>
              )}
              <ScrollView
                ref={categoriesScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoriesScroll}
                onScroll={(event) => {
                  const contentSize = event.nativeEvent.contentSize;
                  const layoutMeasurement = event.nativeEvent.layoutMeasurement;
                  if (contentSize && layoutMeasurement) {
                    const scrollX = event.nativeEvent.contentOffset.x;
                    categoriesScrollX.current = scrollX;
                    const contentWidth = contentSize.width;
                    const layoutWidth = layoutMeasurement.width;
                    setCategoriesCanScrollLeft(scrollX > 5);
                    setCategoriesCanScrollRight(scrollX < contentWidth - layoutWidth - 5);
                  }
                }}
                scrollEventThrottle={16}
                onLayout={(event) => {
                  const layoutWidth = event.nativeEvent.layout.width;
                  if (layoutWidth) {
                    setCategoriesCanScrollRight(categories.length * 136 > layoutWidth);
                  }
                }}
              >
                {categories.map((category: any) => (
                  <TouchableOpacity
                    key={category.id}
                    style={styles.categoryCard}
                    onPress={() => {
                      router.push(`/(tabs)/menu?categoryId=${category.id}`);
                    }}
                  >
                    <Image
                      source={{
                        uri: getImageUrl(category.image),
                      }}
                      style={styles.categoryImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.categoryName} numberOfLines={1} ellipsizeMode="tail">
                      {truncateCategoryName(category.name)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {categoriesCanScrollRight && (
                <TouchableOpacity
                  style={styles.chevronRight}
                  onPress={() => {
                    categoriesScrollRef.current?.scrollTo({ x: categoriesScrollX.current + 136, animated: true });
                  }}
                >
                  <MaterialIcons name="chevron-right" size={28} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Special Offer Categories Section */}
        {specialOfferDealCategories.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("home.specialOfferCategories")}</Text>
              <TouchableOpacity
                onPress={() => router.push("/deal-categories")}
                style={styles.showAllButton}
              >
                <Text style={styles.showAllText}>{t("home.showAll")}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
              {specialOfferDealCategories.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.categoryCard}
                  onPress={() => {
                    router.push(`/deal-category/${c.id}`);
                  }}
                >
                  <Image
                    source={{
                      uri: getImageUrl(c.image),
                    }}
                    style={styles.categoryImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.categoryName} numberOfLines={1} ellipsizeMode="tail">
                    {truncateCategoryName(c.name)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Featured Section */}
        {loading ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>{t("home.featured")}</Text>
            <ActivityIndicator size="small" color="#ec4899" />
          </View>
        ) : featuredMeals.length === 0 ? null : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>{t("home.featured")}</Text>
            <View style={{ gap: 12 }}>
              {featuredRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.horizontalScrollContainer}>
                  {featuredScrollStates[rowIndex]?.canScrollLeft && (
                    <TouchableOpacity
                      style={styles.chevronLeft}
                      onPress={() => scrollFeaturedLeft(rowIndex)}
                    >
                      <MaterialIcons name="chevron-left" size={28} color="#fff" />
                    </TouchableOpacity>
                  )}
                  <ScrollView
                    ref={(ref) => { featuredRowRefs.current[rowIndex] = ref; }}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.featuredScroll}
                    onScroll={(event) => checkFeaturedScroll(rowIndex, event)}
                    scrollEventThrottle={16}
                    onLayout={(event) => handleFeaturedRowLayout(rowIndex, event)}
                  >
                    {row.map((meal: any) => (
                      <View
                        key={meal.id}
                        ref={(ref) => {
                          if (ref) {
                            mealRefs.current[meal.id] = ref;
                          }
                        }}
                      >
                        <TouchableOpacity
                        style={styles.featuredCard}
                          onPress={async () => {
                            const scrollY = currentScrollY.current;
                            await AsyncStorage.setItem('mealDetails:previousRoute', '/(tabs)');
                            await AsyncStorage.setItem('home:scrollPosition', scrollY.toString());
                            await AsyncStorage.setItem('home:selectedMealId', meal.id);
                            await AsyncStorage.setItem('home:selectedSection', 'featured');
                            router.push(`/meal/${meal.id}`);
                          }}
                      >
                        {(() => {
                          const availability = getMealAvailabilityNow({
                            meal,
                            branchId: branch?.id,
                            tz: effectiveTimezone,
                          });
                          const isAvailableNow = availability.isAvailableNow;
                          const uri = getImageUrl(
                            meal.image || "https://placehold.co/200x200?text=Food"
                          );
                          return (
                            <GrayscaleImage
                              uri={uri}
                              width={160}
                              height={120}
                              grayscale={!isAvailableNow}
                            />
                          );
                        })()}
                        <View style={styles.featuredContent}>
                              <Text
                                style={styles.featuredName}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {meal.name}
                              </Text>
                              <Text style={styles.featuredPrice}>{formatPrice(getMealPrice(meal))}</Text>
                            </View>
                          </TouchableOpacity>
                          </View>
                        ))}
                    </ScrollView>
                    {featuredScrollStates[rowIndex]?.canScrollRight && (
                      <TouchableOpacity
                        style={styles.chevronRight}
                        onPress={() => scrollFeaturedRight(rowIndex)}
                      >
                        <MaterialIcons name="chevron-right" size={28} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
            </>
          );
        })()}

        {/* Bottom padding for tab bar */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Subscription Dialog */}
      <SubscriptionDialog
        visible={subscriptionDialogVisible}
        onClose={() => setSubscriptionDialogVisible(false)}
        onLogin={() => {
          setSubscriptionDialogVisible(false);
          router.push("/sign-in" as any);
        }}
      />

      {/* Like Dialog */}
      <SubscriptionDialog
        visible={likeDialogVisible}
        onClose={() => setLikeDialogVisible(false)}
        onLogin={() => {
          setLikeDialogVisible(false);
          router.push("/sign-in" as any);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  scrollView: {
    flex: 1,
    paddingTop: 70, // Space for absolute positioned navbar (will be updated dynamically)
  },
  branchSwitcherContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  branchSwitcherRow: {
    flexDirection: "column",
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  branchSwitcherWrapper: {
    width: "100%",
  },
  scopeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.60)",
    marginTop: 10,
  },
  scopeButtonText: {
    color: "#A7F3D0",
    fontSize: 13,
    fontWeight: "800",
  },
  heroSection: {
    position: "relative",
    height: 300,
    margin: 0,
    borderRadius: 0,
    overflow: "hidden",
    width: "100%",
  },
  likeButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  heroButtonsContainer: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 99,
    flexDirection: "row",
    gap: 8,
  },
  subscribeButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  heroContent: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "500",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    marginBottom: 16,
  },
  heroButtons: {
    flexDirection: "row",
    gap: 12,
  },
  heroButtonsWrap: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  modeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  modeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  modeButtonSelected: {
    backgroundColor: "#2563eb",
    borderColor: "#3b82f6",
  },
  modeButtonOutline: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderColor: "rgba(251, 113, 133, 0.55)",
  },
  modeButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  modeButtonTextSelected: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    marginBottom: 24,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  showAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  showAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  horizontalScrollContainer: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  chevronLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  chevronRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  categoriesScroll: {
    paddingLeft: 0,
  },
  categoriesScrollRow: {
    marginTop: 12,
  },
  categoryCard: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    backgroundColor: "#262626",
    borderRadius: 16,
    width: 120,
    overflow: "hidden",
  },
  categoryImage: {
    width: 120,
    height: 90,
    backgroundColor: "#333",
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    padding: 12,
    width: "100%",
  },
  featuredScroll: {
    paddingLeft: 0,
  },
  featuredScrollRow: {
    marginTop: 12,
  },
  featuredCard: {
    marginRight: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    width: 160,
  },
  featuredImage: {
    width: "100%",
    height: 120,
    resizeMode: "cover",
  },
  featuredContent: {
    padding: 12,
  },
  featuredName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    width: "100%",
  },
  featuredPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ec4899",
  },
  mostOrderedScroll: {
    paddingLeft: 0,
  },
  mostOrderedCard: {
    marginRight: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    width: 160,
  },
  mostOrderedImage: {
    width: "100%",
    height: 120,
    resizeMode: "cover",
  },
  mostOrderedContent: {
    padding: 12,
  },
  mostOrderedName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    width: "100%",
  },
  mostOrderedPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ec4899",
  },
  bottomPadding: {
    height: 100,
  },
  offerContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  offerBanner: {
    backgroundColor: "#764ba2",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
  },
  offerContent: {
    flex: 1,
  },
  offerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  offerText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    marginBottom: 12,
  },
  offerButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  offerButtonText: {
    color: "#764ba2",
    fontSize: 14,
    fontWeight: "bold",
  },
  offerEmoji: {
    fontSize: 60,
  },
  quickLinksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  quickLink: {
    width: "48%",
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  quickLinkIcon: {
    marginBottom: 8,
  },
  quickLinkEmoji: {
    fontSize: 32,
  },
  quickLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  trendingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  viewAllText: {
    color: "#ec4899",
    fontSize: 14,
    fontWeight: "600",
  },
  trendingScroll: {
    paddingLeft: 0,
  },
  trendingCard: {
    marginRight: 16,
    backgroundColor: "#262626",
    borderRadius: 12,
    overflow: "hidden",
    width: 180,
    position: "relative",
  },
  trendingBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#ec4899",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  trendingBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  trendingImage: {
    width: "100%",
    height: 120,
    resizeMode: "cover",
  },
  trendingContent: {
    padding: 12,
  },
  trendingName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
    width: "100%",
  },
  trendingPriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendingPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ec4899",
  },
  trendingOldPrice: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    textDecorationLine: "line-through",
  },
});
