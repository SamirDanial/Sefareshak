import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { useCartStore, OptionalIngredient } from "@/src/store/cartStore";
import { MaterialIcons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import ApiService from "@/src/services/apiService";
import { getAddonPriceForMealSize, getNearestSmallerAddonSize, type SizeType } from "@/src/utils/sizeMatcher";
import { formatPrice, fetchCurrency, fetchPublicSettings } from "@/src/utils/currency";
import { useBranch } from "@/src/contexts/BranchContext";
import branchService from "@/src/services/branchService";
import { useGlobalToast } from "@/src/contexts/GlobalToastContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deliverableQuantityService, type PublicAvailableWeight } from "@/src/services/deliverableQuantityService";
import GrayscaleImage from "@/components/GrayscaleImage";
import { getDeviceTimeZone } from "@/src/utils/timezones";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/src/utils/mealAvailability";
import AppStatusNotice from "@/components/AppStatusNotice";

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

export default function MealCustomizationScreen() {
  const { t } = useTranslation();
  const { id, edit, cartItemId } = useLocalSearchParams<{
    id: string;
    edit?: string;
    cartItemId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const mealId = id;
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const [meal, setMeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedAddOns, setSelectedAddOns] = useState<any[]>([]);
  const [selectedOptionalIngredients, setSelectedOptionalIngredients] =
    useState<OptionalIngredient[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showDeclarationsModal, setShowDeclarationsModal] = useState(false);
  const [showAddOnsModal, setShowAddOnsModal] = useState(false);
  const [showOptionalIngredientsModal, setShowOptionalIngredientsModal] =
    useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [currency, setCurrency] = useState<string>("USD");
  const [availability, setAvailability] = useState<PublicAvailableWeight | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const { addItem, getTotalItems, getItemById, replaceItem, items: cartItems } = useCartStore();
  const { getToken, isSignedIn } = useAuth();
  const { branch, visibleBranches } = useBranch();
  const { showToast } = useGlobalToast();
  const totalItems = getTotalItems();
  const scrollViewRef = useRef<ScrollView>(null);
  const previousRouteRef = useRef<string | null>(null);

  const selectedBranch = branch?.id
    ? (visibleBranches as any[]).find((b: any) => b?.id === branch.id)
    : null;
  const organizationAppStatus = String(
    (selectedBranch as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase();
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";

  useEffect(() => {
    // Load the previous route from storage when component mounts
    const loadPreviousRoute = async () => {
      try {
        const stored = await AsyncStorage.getItem('mealDetails:previousRoute');
        if (stored) {
          previousRouteRef.current = stored;
        } else {
          // Default to menu if no previous route stored
          previousRouteRef.current = '/(tabs)/menu';
        }
      } catch (error) {
        console.error('Error loading previous route:', error);
        previousRouteRef.current = '/(tabs)/menu';
      }
    };
    
    loadPreviousRoute();
    
    // Fetch settings first, then meal (so we can apply settings when loading meal)
    fetchSettings().then(() => {
      fetchMeal();
    });
    fetchPublicSettings().then((settings) => {
      setCurrency(settings.currency);
    });
  }, []);
  
  // Clean up stored route when component unmounts
  useEffect(() => {
    return () => {
      AsyncStorage.removeItem('mealDetails:previousRoute').catch(() => {});
    };
  }, []);

  // Refetch meal and update currency when branch changes
  useEffect(() => {
    if (branch?.id) {
      fetchMeal();
      updateCurrencyFromBranch();
    }
  }, [branch?.id]);

  // Fetch availability when meal and branch are available
  const fetchAvailability = useCallback(async () => {
    if (!mealId || !branch?.id) {
      setAvailability(null);
      return;
    }

    try {
      setLoadingAvailability(true);
      const result = await deliverableQuantityService.getPublicAvailableWeight(
        branch.id,
        mealId
      );
      setAvailability(result);
    } catch (error) {
      console.error("Error fetching availability:", error);
      setAvailability(null);
    } finally {
      setLoadingAvailability(false);
    }
  }, [mealId, branch?.id]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Check if item can be added to cart based on deliverable limits
  const checkCanAddToCart = useCallback((): { canAdd: boolean; message: string | null } => {
    // If no availability data or no limit configured, allow adding
    if (!availability || availability.availableWeight === null) {
      return { canAdd: true, message: null };
    }

    // Get the size type of the selected size
    const selectedSizeObj = meal?.mealSizes?.find(
      (size: any) => size.id === selectedSize
    );
    const selectedSizeType = selectedSizeObj?.sizeType;

    if (!selectedSizeType) {
      return { canAdd: true, message: null };
    }

    // Get weight for the selected size
    const sizeWeight = availability.sizeWeights?.[selectedSizeType];
    
    // If no weight configured for this size, allow adding
    if (!sizeWeight) {
      return { canAdd: true, message: null };
    }

    // Calculate weight of items ALREADY in cart for the same meal
    const isEditing = edit === "1" && cartItemId;
    let cartWeightForThisMeal = 0;
    const cartItemsForMeal = cartItems.filter((item: any) => item.mealId === mealId);
    
    for (const cartItem of cartItemsForMeal) {
      // Skip the item being edited (we'll use the new quantity instead)
      if (isEditing && cartItem.id === cartItemId) {
        continue;
      }
      
      // Find the size type for this cart item
      const cartItemSizeObj = meal?.mealSizes?.find(
        (size: any) => size.id === cartItem.sizeId || size.name === cartItem.sizeName
      );
      const cartItemSizeType = cartItemSizeObj?.sizeType;
      
      if (cartItemSizeType) {
        const cartItemWeight = availability.sizeWeights?.[cartItemSizeType];
        if (cartItemWeight) {
          cartWeightForThisMeal += cartItemWeight * cartItem.quantity;
        }
      }
    }

    // Calculate total weight needed (cart + new selection)
    const newItemWeight = sizeWeight * quantity;
    const totalRequiredWeight = cartWeightForThisMeal + newItemWeight;
    
    const canAdd = totalRequiredWeight <= availability.availableWeight;

    if (!canAdd) {
      // Calculate how much more weight can be added
      const remainingWeight = availability.availableWeight - cartWeightForThisMeal;
      const maxQtyCanAdd = remainingWeight > 0 ? Math.floor(remainingWeight / sizeWeight) : 0;
      
      if (maxQtyCanAdd <= 0) {
        return {
          canAdd: false,
          message: t("mealCustomization.dailyLimitReached") || "Daily limit reached",
        };
      }
      return {
        canAdd: false,
        message: t("mealCustomization.canAddMax", { maxQty: maxQtyCanAdd }) || `Max ${maxQtyCanAdd} more allowed`,
      };
    }

    return { canAdd: true, message: null };
  }, [availability, meal?.mealSizes, selectedSize, quantity, t, cartItems, mealId, edit, cartItemId]);

  // Update availability message when selection changes
  useEffect(() => {
    const { message } = checkCanAddToCart();
    setAvailabilityMessage(message);
  }, [checkCanAddToCart]);

  // Scroll to top and show navbar when page is focused
  useFocusEffect(
    React.useCallback(() => {
      // Reset scroll state to show navbar
      setScrollPosition(0);
      setScrollDirection('up');
      
      // Scroll to top
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }
    }, [setScrollPosition, setScrollDirection])
  );


  // When settings change, ensure all ingredients are included if exclusion is disabled
  useEffect(() => {
    if (
      settings &&
      settings.allowExcludeOptionalIngredients === false &&
      selectedOptionalIngredients.length > 0
    ) {
      // Force all ingredients to be included
      setSelectedOptionalIngredients((prev) =>
        prev.map((ing) => ({ ...ing, isIncluded: true }))
      );
    }
  }, [settings, selectedOptionalIngredients.length]);

  const fetchSettings = async () => {
    try {
      const apiService = ApiService.getInstance();
      // Use public endpoint that doesn't require authentication
      const response = await apiService.getPublicSettings();
      if (response.success) {
        setSettings(response.data);
      } else {
        setSettings({ allowExcludeOptionalIngredients: true });
      }
    } catch (error) {
      console.error("Error fetching public settings:", error);
      // Default to allowing exclusion if fetch fails
      setSettings({ allowExcludeOptionalIngredients: true });
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

  const fetchMeal = async () => {
    try {
      const apiService = ApiService.getInstance();
      const mealData = await apiService.getMealById(mealId, branch?.id);
      
      if (!mealData) {
        setMeal(null);
        setLoading(false);
        return;
      }
      
      // Check if meal is excluded from the selected branch
      if (branch?.id) {
        const mealExcludedBranches = mealData.excludedBranches || [];
        const categoryExcludedBranches = mealData.category?.excludedBranches || [];
        
        if (
          mealExcludedBranches.includes(branch.id) ||
          categoryExcludedBranches.includes(branch.id)
        ) {
          // Meal is excluded from this branch, show error and redirect
          setMeal(null);
          setLoading(false);
          // You might want to show an alert or navigate back
          return;
        }
      }
      
      setMeal(mealData);
      // Initialize optional ingredients - all unselected by default
      const optionalIngredients: OptionalIngredient[] =
        mealData.mealOptionalIngredients?.map((moi: any) => ({
          id: moi.optionalIngredient.id,
          name: moi.optionalIngredient.name,
          isIncluded: false, // Default to unselected
        })) || [];

      if (edit === "1" && cartItemId) {
        const existing = getItemById(cartItemId);
        if (existing) {
          setSelectedSize(
            existing.sizeId ||
              (mealData.mealSizes && mealData.mealSizes[0]?.id) ||
              ""
          );
          setSelectedAddOns(existing.addOns || []);
          // If exclusion is not allowed, force all ingredients to be included
          const canExclude =
            settings?.allowExcludeOptionalIngredients !== false;
          if (!canExclude && existing.optionalIngredients) {
            // Force all to be included
            const forcedIngredients = existing.optionalIngredients.map(
              (ing) => ({ ...ing, isIncluded: true })
            );
            setSelectedOptionalIngredients(forcedIngredients);
          } else {
            setSelectedOptionalIngredients(
              existing.optionalIngredients || optionalIngredients
            );
          }
          setSpecialInstructions(existing.specialInstructions || "");
          setQuantity(existing.quantity || 1);
        } else if (mealData.mealSizes && mealData.mealSizes.length > 0) {
          setSelectedSize(mealData.mealSizes[0].id);
          setSelectedOptionalIngredients(optionalIngredients);
        }
      } else {
        if (mealData.mealSizes && mealData.mealSizes.length > 0) {
          setSelectedSize(mealData.mealSizes[0].id);
        }
        setSelectedOptionalIngredients(optionalIngredients);
      }
    } catch (error) {
      console.error("Error fetching meal:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get the sizeType of the currently selected meal size
  const selectedMealSizeType = meal?.mealSizes?.find(
    (size: any) => size.id === selectedSize
  )?.sizeType as SizeType | undefined;

  // Helper function to get the correct addon price and size type based on selected meal size
  const getAddonPriceAndSize = (addOn: any): { price: number; sizeType?: SizeType } => {
    // Get original base price (for calculating size price adjustments)
    const originalBasePrice = addOn.price ? parseFloat(addOn.price) : 0;
    // Use effectiveBasePrice if available (branch-specific), otherwise use original base price
    const branchBasePrice = addOn.effectiveBasePrice !== undefined && addOn.effectiveBasePrice !== null 
      ? addOn.effectiveBasePrice 
      : originalBasePrice;
    
    // If addon has size-based pricing, use that
    if (addOn.addonSizes && addOn.addonSizes.length > 0) {
      const availableSizes = addOn.addonSizes.map((s: any) => s.sizeType) as SizeType[];
      // Get the size type based on meal size
      const addonSizeType = getNearestSmallerAddonSize(selectedMealSizeType, availableSizes);
      
      // Get the original size price from database
      const originalSizePrice = getAddonPriceForMealSize(
        selectedMealSizeType,
        addOn.addonSizes.map((s: any) => ({
          sizeType: s.sizeType,
          price: parseFloat(s.price),
        }))
      );
      
      if (originalSizePrice !== null) {
        // If there's a branch-specific base price, adjust the size price
        // Formula: adjustedPrice = branchBasePrice + (originalSizePrice - originalBasePrice)
        // This preserves the size differential while applying the branch-specific base
        const sizePriceAdjustment = originalSizePrice - originalBasePrice;
        const adjustedSizePrice = branchBasePrice + sizePriceAdjustment;
        return { price: adjustedSizePrice, sizeType: addonSizeType || undefined };
      }
      
      return { price: 0, sizeType: addonSizeType || undefined };
    }
    
    // Use branch-specific price if available, otherwise fallback to deprecated price field
    // Always prefer effectiveBasePrice when it exists (even if it's 0, it means branch override exists)
    if (addOn.effectiveBasePrice !== undefined) {
      return { price: addOn.effectiveBasePrice };
    }
    return { price: originalBasePrice };
  };

  // Helper function to get the correct addon price based on selected meal size (for backward compatibility)
  const getAddonPrice = (addOn: any): number => {
    return getAddonPriceAndSize(addOn).price;
  };

  const handleAddOnToggle = (addOn: any) => {
    const addonPrice = getAddonPrice(addOn);
    const addOnWithPrice = { ...addOn, price: addonPrice };
    
    if (addOn.type === "QUANTITY") {
      setSelectedAddOns((prev) => {
        const existingAddOn = prev.find((a) => a.id === addOn.id);
        if (existingAddOn) {
          return prev.map((a) =>
            a.id === addOn.id ? { ...a, quantity: (a.quantity || 1) + 1, price: addonPrice } : a
          );
        } else {
          return [...prev, { ...addOnWithPrice, quantity: 1 }];
        }
      });
    } else {
      setSelectedAddOns((prev) =>
        prev.find((a) => a.id === addOn.id)
          ? prev.filter((a) => a.id !== addOn.id)
          : [...prev, { ...addOnWithPrice, quantity: 1 }]
      );
    }
  };

  const handleQuantityChange = (addOnId: string, change: number) => {
    setSelectedAddOns((prev) =>
      prev
        .map((addOn) => {
          if (addOn.id === addOnId) {
            const newQuantity = Math.max(0, (addOn.quantity || 1) + change);
            if (newQuantity === 0) {
              return null;
            }
            return { ...addOn, quantity: newQuantity };
          }
          return addOn;
        })
        .filter(Boolean)
    );
  };

  const toggleOptionalIngredient = (ingredientId: string) => {
    // Check if exclusion is explicitly disabled (false)
    // Default to true (allow exclusion) if settings not loaded or field is undefined
    const canExclude = settings?.allowExcludeOptionalIngredients !== false;

    if (!canExclude) {
      return; // Don't allow toggling if admin disabled it
    }

    setSelectedOptionalIngredients((prev) =>
      prev.map((ing) =>
        ing.id === ingredientId ? { ...ing, isIncluded: !ing.isIncluded } : ing
      )
    );
  };

  const calculateTotal = () => {
    if (!meal) return 0;

    const selectedSizeObj = meal.mealSizes?.find(
      (size: any) => size.id === selectedSize
    );
    // Use effectiveBasePrice if available (branch-specific), otherwise use basePrice
    const effectiveBasePrice = meal.effectiveBasePrice ?? parseFloat(meal.basePrice || "0");
    const basePrice = selectedSizeObj
      ? effectiveBasePrice + parseFloat(selectedSizeObj.price || "0")
      : effectiveBasePrice;

    // Calculate addon prices dynamically based on current meal size
    const addOnsTotal = selectedAddOns.reduce((sum, selectedAddOn) => {
      // Find the addon in meal data to get current price
      const mealAddOn = meal.mealAddOns?.find(
        (ma: any) => ma.addOn?.id === selectedAddOn.id
      );
      if (mealAddOn?.addOn) {
        const currentPrice = getAddonPrice(mealAddOn.addOn);
        return sum + currentPrice * (selectedAddOn.quantity || 1);
      }
      // Fallback to stored price
      return sum + parseFloat(selectedAddOn.price || 0) * (selectedAddOn.quantity || 1);
    }, 0);

    return (basePrice + addOnsTotal) * quantity;
  };

  const handleAddToCart = () => {
    if (!meal) return;

    const selectedBranchFull = branch?.id
      ? (visibleBranches as any[])?.find((b: any) => b?.id === branch.id) ?? null
      : null;
    const effectiveTimezone = getEffectiveTimezone({
      branchTimezone: (selectedBranchFull as any)?.timezone ?? null,
      settingsTimezone: (selectedBranchFull as any)?.organization?.settings?.timezone ?? null,
      deviceTimezone: getDeviceTimeZone(),
    });
    const branchAvailability = getMealAvailabilityNow({
      meal,
      branchId: branch?.id,
      tz: effectiveTimezone,
    });

    if (!branchAvailability.isAvailableNow) {
      showToast(
        branchAvailability.nextAvailableText
          ? t("mealCustomization.notAvailableRightNowToastWithNext", { next: branchAvailability.nextAvailableText })
          : t("mealCustomization.notAvailableRightNowToast"),
        "error"
      );
      return;
    }

    // Check availability before adding to cart
    const { canAdd, message } = checkCanAddToCart();
    if (!canAdd) {
      showToast(
        message || t("mealCustomization.dailyLimitReached") || "Daily limit reached for this item",
        "error"
      );
      return;
    }

    const selectedSizeObj = meal.mealSizes?.find(
      (size: any) => size.id === selectedSize
    );

    const isEditing = edit === "1" && cartItemId;
    const itemId = isEditing
      ? (cartItemId as string)
      : `${meal.id}-${selectedSize || "default"}-${Date.now()}`;

    // Use effectiveBasePrice if available (branch-specific), otherwise use basePrice
    const effectiveBasePrice = meal.effectiveBasePrice ?? parseFloat(meal.basePrice || "0");
    
    const cartItem = {
      id: itemId,
      mealId: meal.id,
      mealName: meal.name,
      mealImage: meal.image,
      sizeId: selectedSize || "",
      sizeName: selectedSizeObj?.name || meal.mealSizes?.[0]?.name || "Regular",
      quantity: quantity,
      basePrice: effectiveBasePrice,
      sizePrice: selectedSizeObj ? parseFloat(selectedSizeObj.price || "0") : 0,
      addOns: selectedAddOns.map((addOn) => {
        // Find the addon in meal data to get size type
        const mealAddOn = meal.mealAddOns?.find(
          (ma: any) => ma.addOn?.id === addOn.id
        );
        let addonSizeType: SizeType | undefined = undefined;
        
        if (mealAddOn?.addOn && mealAddOn.addOn.addonSizes && mealAddOn.addOn.addonSizes.length > 0) {
          const availableSizes = mealAddOn.addOn.addonSizes.map((s: any) => s.sizeType) as SizeType[];
          addonSizeType = getNearestSmallerAddonSize(selectedMealSizeType, availableSizes) || undefined;
        }
        
        return {
          id: addOn.id,
          name: addOn.name,
          price: parseFloat(addOn.price || "0"),
          quantity: addOn.quantity || 1,
          sizeType: addonSizeType,
        };
      }),
      optionalIngredients: selectedOptionalIngredients,
      specialInstructions,
      totalPrice: calculateTotal(),
    };

    try {
      if (isEditing) {
        replaceItem(itemId, cartItem as any);
        showToast(
          t("mealCustomization.cartUpdated") || "Item updated in cart",
          "success"
        );
      } else {
        addItem(cartItem as any);
        showToast(
          t("mealCustomization.addedToCart") || "Item added to cart",
          "success"
        );

        // After successfully adding to cart, go back to Menu and preselect the meal's category.
        // Menu already reads categoryId from the URL and auto-scrolls the horizontal list.
        if (meal.categoryId) {
          router.push(`/(tabs)/menu?categoryId=${encodeURIComponent(meal.categoryId)}` as any);
        } else {
          router.push("/(tabs)/menu" as any);
        }
      }
    } catch (error) {
      showToast(
        t("mealCustomization.failedToAdd") || "Failed to add item to cart",
        "error"
      );
    }
  };

  if (isOrganizationUnavailable) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title={t("mealCustomization.loadingTitle")}
          onBackPress={() => router.back()}
        />
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <AppStatusNotice status={organizationAppStatus as any} />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  if (!meal) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{t("mealCustomization.notFound")}</Text>
      </View>
    );
  }

  const mealImageUrl = getImageUrl(meal.image);

  const selectedBranchFull = branch?.id
    ? (visibleBranches as any[])?.find((b: any) => b?.id === branch.id) ?? null
    : null;
  const effectiveTimezone = getEffectiveTimezone({
    branchTimezone: (selectedBranchFull as any)?.timezone ?? null,
    settingsTimezone: (selectedBranchFull as any)?.organization?.settings?.timezone ?? null,
    deviceTimezone: getDeviceTimeZone(),
  });
  const branchAvailability = getMealAvailabilityNow({
    meal,
    branchId: branch?.id,
    tz: effectiveTimezone,
  });
  const isAvailableByBranchTiming = branchAvailability.isAvailableNow;

  return (
    <View style={styles.container}>
      <AnimatedHeader
        title={meal.name}
        onBackPress={async () => {
          // Navigate back to the previous page
          const previousRoute = previousRouteRef.current;
          if (previousRoute) {
            // Navigate to the stored previous route
            await AsyncStorage.removeItem('mealDetails:previousRoute');
            router.push(previousRoute as any);
          } else {
            // Fallback to menu if no previous route stored
            router.push('/(tabs)/menu');
          }
        }}
        rightContent={
          <TouchableOpacity
            style={styles.cartButton}
            onPress={() => router.push("/cart")}
          >
            <MaterialIcons name="shopping-cart" size={16} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        ref={scrollViewRef}
        style={[
          styles.scrollContent,
          {
            paddingTop: headerHeight, // Status bar + header content
          },
        ]}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const currentScrollY = event.nativeEvent.contentOffset.y;
          setScrollPosition(currentScrollY);
          
          // Determine scroll direction
          if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
            setScrollDirection('down');
          } else if (currentScrollY < lastScrollY.current) {
            setScrollDirection('up');
          }
          
          lastScrollY.current = currentScrollY;
        }}
        scrollEventThrottle={16}
      >
        {/* Meal Image */}
        <View style={styles.imageContainer}>
          <View style={styles.mealImageWrap}>
            <GrayscaleImage
              uri={mealImageUrl}
              width={Dimensions.get("window").width}
              height={250}
              grayscale={!isAvailableByBranchTiming}
            />
            {!isAvailableByBranchTiming && (
              <View style={styles.unavailableOverlay}>
                <View style={styles.unavailableRow}>
                  <MaterialCommunityIcons name="alert" size={18} color="#fbbf24" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unavailableTitle}>
                      {t("mealCustomization.notAvailableRightNow")}
                    </Text>
                    {branchAvailability.nextAvailableText ? (
                      <Text style={styles.unavailableText}>
                        {t("mealCustomization.nextAvailable", { next: branchAvailability.nextAvailableText })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
          </View>
          <View style={styles.imageOverlay}>
            <Text style={styles.description}>{meal.description}</Text>
          </View>
        </View>

        {/* Declarations */}
        {meal.mealDeclarations && meal.mealDeclarations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>
                {t("mealCustomization.declarations")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowDeclarationsModal(true)}
                style={styles.showMoreButtonHeader}
              >
                <Text style={styles.showMoreText}>
                  {t("mealCustomization.showMore")}
                </Text>
                <MaterialIcons name="chevron-right" size={20} color="#ec4899" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Size Selection */}
        {meal.mealSizes && meal.mealSizes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>
                {t("mealCustomization.chooseSize")}
              </Text>
            </View>
            <View style={styles.sizeGrid}>
              {meal.mealSizes.map((size: any) => {
                const isSelected = selectedSize === size.id;
                return (
                  <TouchableOpacity
                    key={size.id}
                    onPress={() => {
                      setSelectedSize(size.id);
                      // Update addon prices when meal size changes
                      setSelectedAddOns((prev) =>
                        prev.map((selectedAddOn) => {
                          const mealAddOn = meal.mealAddOns?.find(
                            (ma: any) => ma.addOn?.id === selectedAddOn.id
                          );
                          if (mealAddOn?.addOn) {
                            return {
                              ...selectedAddOn,
                              price: getAddonPrice(mealAddOn.addOn),
                            };
                          }
                          return selectedAddOn;
                        })
                      );
                    }}
                    style={[
                      styles.sizeButton,
                      isSelected && styles.sizeButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sizeName,
                        isSelected && styles.sizeNameActive,
                      ]}
                    >
                      {size.name}
                    </Text>
                    <Text
                      style={[
                        styles.sizePrice,
                        isSelected && styles.sizePriceActive,
                      ]}
                    >
                      {formatPrice(
                        (meal.effectiveBasePrice ?? parseFloat(meal.basePrice || "0")) + parseFloat(size.price || "0"),
                        currency
                      )}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Optional Ingredients */}
        {meal.mealOptionalIngredients &&
          meal.mealOptionalIngredients.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>
                  {settings?.allowExcludeOptionalIngredients !== false
                    ? t("mealCustomization.optionalIngredients")
                    : t("mealCustomization.requiredIngredients")}
                </Text>
                {meal.mealOptionalIngredients.length > 4 ? (
                  <TouchableOpacity
                    onPress={() => setShowOptionalIngredientsModal(true)}
                    style={styles.showMoreButtonHeader}
                  >
                    <Text style={styles.showMoreText}>
                      {t("mealCustomization.showMore")} (
                      {meal.mealOptionalIngredients.length - 4}{" "}
                      {t("mealCustomization.more")})
                    </Text>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#ec4899"
                    />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowOptionalIngredientsModal(true)}
                    style={styles.showMoreButtonHeader}
                  >
                    <Text style={styles.showMoreText}>
                      {t("mealCustomization.showMore")}
                    </Text>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#ec4899"
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.addOnsList}>
                {meal.mealOptionalIngredients.slice(0, 4).map((moi: any) => {
                  const ingredient = moi.optionalIngredient;
                  if (!ingredient) return null;

                  const selectedIngredient = selectedOptionalIngredients.find(
                    (si) => si.id === ingredient.id
                  );
                  const isIncluded = selectedIngredient
                    ? selectedIngredient.isIncluded
                    : false;

                  return (
                    <View
                      key={ingredient.id}
                      style={[
                        styles.addOnCard,
                        isIncluded && styles.addOnCardActive,
                      ]}
                    >
                      <View style={styles.addOnContent}>
                        <View style={styles.addOnInfo}>
                          <Text style={styles.addOnName}>
                            {ingredient.name}
                          </Text>
                          {ingredient.description && (
                            <Text style={styles.addOnDescription}>
                              {ingredient.description}
                            </Text>
                          )}
                        </View>

                        <View style={styles.addOnControls}>
                          <TouchableOpacity
                            onPress={() => {
                              const canExclude =
                                settings?.allowExcludeOptionalIngredients !==
                                false;
                              if (!canExclude) {
                                return;
                              }

                              if (!selectedIngredient) {
                                setSelectedOptionalIngredients((prev) => [
                                  ...prev,
                                  {
                                    id: ingredient.id,
                                    name: ingredient.name,
                                    isIncluded: false,
                                  },
                                ]);
                              } else {
                                toggleOptionalIngredient(ingredient.id);
                              }
                            }}
                            disabled={
                              settings?.allowExcludeOptionalIngredients ===
                              false
                            }
                            style={[
                              styles.checkbox,
                              isIncluded && styles.checkboxActive,
                              !(
                                settings?.allowExcludeOptionalIngredients ??
                                true
                              ) && styles.checkboxDisabled,
                            ]}
                          >
                            {isIncluded && (
                              <Text style={styles.checkmark}>✓</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

        {/* Add-ons */}
        {meal.mealAddOns && meal.mealAddOns.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>
                {t("mealCustomization.addExtras")}
              </Text>
              {meal.mealAddOns.length > 4 ? (
                <TouchableOpacity
                  onPress={() => setShowAddOnsModal(true)}
                  style={styles.showMoreButtonHeader}
                >
                  <Text style={styles.showMoreText}>
                    {t("mealCustomization.showMore")} (
                    {meal.mealAddOns.length - 4} {t("mealCustomization.more")})
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={20}
                    color="#ec4899"
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowAddOnsModal(true)}
                  style={styles.showMoreButtonHeader}
                >
                  <Text style={styles.showMoreText}>
                    {t("mealCustomization.showMore")}
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={20}
                    color="#ec4899"
                  />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.addOnsList}>
              {meal.mealAddOns.slice(0, 4).map((mealAddOn: any) => {
                const addOn = mealAddOn.addOn;
                if (!addOn) return null;

                const isBoolean = addOn.type === "BOOLEAN";
                const isQuantity = addOn.type === "QUANTITY";
                const selectedAddOn = selectedAddOns.find(
                  (a) => a.id === addOn.id
                );
                const isSelected = Boolean(selectedAddOn);
                const addOnQuantity = selectedAddOn?.quantity || 0;

                return (
                  <View
                    key={addOn.id}
                    style={[
                      styles.addOnCard,
                      isSelected && styles.addOnCardActive,
                    ]}
                  >
                    {addOn.image && (
                      <View style={styles.addOnImageContainer}>
                        <Image
                          source={{ uri: getImageUrl(addOn.image) }}
                          style={styles.addOnImage}
                        />
                      </View>
                    )}
                    <View style={styles.addOnContent}>
                      <View style={styles.addOnInfo}>
                        <Text style={styles.addOnName}>{addOn.name}</Text>
                        {addOn.description && (
                          <Text style={styles.addOnDescription}>
                            {addOn.description}
                          </Text>
                        )}
                        <Text style={styles.addOnPrice}>
                          {formatPrice(getAddonPrice(addOn), currency)}
                        </Text>
                      </View>

                      <View style={styles.addOnControls}>
                        {isBoolean && (
                          <TouchableOpacity
                            onPress={() => handleAddOnToggle(addOn)}
                            style={[
                              styles.checkbox,
                              isSelected && styles.checkboxActive,
                            ]}
                          >
                            {isSelected && (
                              <Text style={styles.checkmark}>✓</Text>
                            )}
                          </TouchableOpacity>
                        )}

                        {isQuantity && (
                          <>
                            {addOnQuantity === 0 ? (
                              <TouchableOpacity
                                onPress={() => handleAddOnToggle(addOn)}
                                style={styles.addButton}
                              >
                                <Text style={styles.addButtonText}>
                                  {t("mealCustomization.add")}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.quantityControls}>
                                <TouchableOpacity
                                  onPress={() =>
                                    handleQuantityChange(addOn.id, -1)
                                  }
                                  disabled={addOnQuantity <= 0}
                                  style={[
                                    styles.quantityButton,
                                    addOnQuantity <= 0 &&
                                      styles.quantityButtonDisabled,
                                  ]}
                                >
                                  <Text style={styles.quantityButtonText}>
                                    -
                                  </Text>
                                </TouchableOpacity>
                                <View style={{ marginHorizontal: 6 }}>
                                  <Text style={styles.quantityValue}>
                                    {addOnQuantity}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() =>
                                    handleQuantityChange(addOn.id, 1)
                                  }
                                  style={styles.quantityButton}
                                >
                                  <Text style={styles.quantityButtonText}>
                                    +
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        {/* Special Instructions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>
              {t("mealCustomization.specialInstructions")}
            </Text>
          </View>
          <TextInput
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            placeholder={t("mealCustomization.specialInstructionsPlaceholder")}
            placeholderTextColor="#666"
            style={styles.textInput}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Quantity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>
              {t("mealCustomization.quantity")}
            </Text>
          </View>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              style={styles.quantityButtonMain}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <View style={styles.quantityDisplay}>
              <Text style={styles.quantityText}>{quantity}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setQuantity(quantity + 1)}
              style={styles.quantityButtonMain}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Declarations Bottom Modal */}
      <Modal
        visible={showDeclarationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeclarationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowDeclarationsModal(false)}
          />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandleContainer}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("mealCustomization.declarations")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowDeclarationsModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.bottomSheetBody}
              contentContainerStyle={styles.bottomSheetBodyContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.declarationsModalContainer}>
                {meal.mealDeclarations.map((mealDeclaration: any) => {
                  const declaration = mealDeclaration.declaration;
                  if (!declaration) return null;
                  return (
                    <View
                      key={declaration.id}
                      style={styles.declarationBadgeModal}
                    >
                      {declaration.icon && (
                        <Text style={styles.declarationIconModal}>
                          {declaration.icon}
                        </Text>
                      )}
                      <View style={{ flex: 1, flexShrink: 1 }}>
                        <Text style={styles.declarationTextModal}>
                          {declaration.name}
                        </Text>
                        {declaration.description && (
                          <Text
                            style={styles.declarationDescription}
                            numberOfLines={1}
                          >
                            {declaration.description}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add-ons Bottom Modal */}
      <Modal
        visible={showAddOnsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddOnsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowAddOnsModal(false)}
          />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandleContainer}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <View style={styles.bottomSheetHeader}>
              <View>
                <Text style={styles.bottomSheetTitle}>
                  {t("mealCustomization.addExtras")}
                </Text>
                {selectedAddOns.length > 0 && (
                  <Text style={styles.bottomSheetSubtitle}>
                    {selectedAddOns.length} {t("mealCustomization.selected")}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowAddOnsModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.bottomSheetBody}
              contentContainerStyle={styles.bottomSheetBodyContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.addOnsModalList}>
                {meal.mealAddOns.map((mealAddOn: any) => {
                  const addOn = mealAddOn.addOn;
                  if (!addOn) return null;

                  const isBoolean = addOn.type === "BOOLEAN";
                  const isQuantity = addOn.type === "QUANTITY";
                  const selectedAddOn = selectedAddOns.find(
                    (a) => a.id === addOn.id
                  );
                  const isSelected = Boolean(selectedAddOn);
                  const addOnQuantity = selectedAddOn?.quantity || 0;

                  return (
                    <View
                      key={addOn.id}
                      style={[
                        styles.addOnCardModal,
                        isSelected && styles.addOnCardModalActive,
                      ]}
                    >
                      {addOn.image && (
                        <View style={styles.addOnImageContainerModal}>
                          <Image
                            source={{ uri: getImageUrl(addOn.image) }}
                            style={styles.addOnImageModal}
                          />
                        </View>
                      )}
                      <View style={styles.addOnContentModal}>
                        <View style={styles.addOnInfoModal}>
                          <Text style={styles.addOnNameModal}>
                            {addOn.name}
                          </Text>
                          {addOn.description && (
                            <Text style={styles.addOnDescriptionModal}>
                              {addOn.description}
                            </Text>
                          )}
                          <Text style={styles.addOnPriceModal}>
                            {formatPrice(getAddonPrice(addOn), currency)}
                          </Text>
                        </View>

                        <View style={styles.addOnControlsModal}>
                          {isBoolean && (
                            <TouchableOpacity
                              onPress={() => handleAddOnToggle(addOn)}
                              style={[
                                styles.checkboxModal,
                                isSelected && styles.checkboxModalActive,
                              ]}
                            >
                              {isSelected && (
                                <Text style={styles.checkmarkModal}>✓</Text>
                              )}
                            </TouchableOpacity>
                          )}

                          {isQuantity && (
                            <>
                              {addOnQuantity === 0 ? (
                                <TouchableOpacity
                                  onPress={() => handleAddOnToggle(addOn)}
                                  style={styles.addButtonModal}
                                >
                                  <Text style={styles.addButtonTextModal}>
                                    {t("mealCustomization.add")}
                                  </Text>
                                </TouchableOpacity>
                              ) : (
                                <View style={styles.quantityControlsModal}>
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleQuantityChange(addOn.id, -1)
                                    }
                                    disabled={addOnQuantity <= 0}
                                    style={[
                                      styles.quantityButtonModal,
                                      addOnQuantity <= 0 &&
                                        styles.quantityButtonModalDisabled,
                                    ]}
                                  >
                                    <Text
                                      style={styles.quantityButtonTextModal}
                                    >
                                      -
                                    </Text>
                                  </TouchableOpacity>
                                  <View style={{ marginHorizontal: 10 }}>
                                    <Text style={styles.quantityValueModal}>
                                      {addOnQuantity}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleQuantityChange(addOn.id, 1)
                                    }
                                    style={styles.quantityButtonModal}
                                  >
                                    <Text
                                      style={styles.quantityButtonTextModal}
                                    >
                                      +
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setShowAddOnsModal(false)}
              >
                <Text style={styles.modalDoneButtonText}>
                  {t("mealCustomization.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Optional Ingredients Bottom Modal */}
      <Modal
        visible={showOptionalIngredientsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionalIngredientsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowOptionalIngredientsModal(false)}
          />
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandleContainer}>
              <View style={styles.bottomSheetHandle} />
            </View>
            <View style={styles.bottomSheetHeader}>
              <View>
                <Text style={styles.bottomSheetTitle}>
                  {settings?.allowExcludeOptionalIngredients !== false
                    ? t("mealCustomization.optionalIngredients")
                    : t("mealCustomization.requiredIngredients")}
                </Text>
                {settings?.allowExcludeOptionalIngredients !== false && (
                  <Text style={styles.bottomSheetSubtitle}>
                    {
                      selectedOptionalIngredients.filter((i) => i.isIncluded)
                        .length
                    }{" "}
                    {t("mealCustomization.included")} /{" "}
                    {
                      selectedOptionalIngredients.filter((i) => !i.isIncluded)
                        .length
                    }{" "}
                    {t("mealCustomization.excluded")}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowOptionalIngredientsModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.bottomSheetBody}
              contentContainerStyle={styles.bottomSheetBodyContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <View style={styles.addOnsModalList}>
                {meal.mealOptionalIngredients?.length > 0 ? (
                  meal.mealOptionalIngredients.map((moi: any) => {
                    const ingredient = moi.optionalIngredient;
                    if (!ingredient) return null;

                    const selectedIngredient = selectedOptionalIngredients.find(
                      (si) => si.id === ingredient.id
                    );
                    const isIncluded = selectedIngredient?.isIncluded ?? false;

                    return (
                      <View
                        key={ingredient.id}
                        style={[
                          styles.addOnCardModal,
                          isIncluded && styles.addOnCardModalActive,
                        ]}
                      >
                        <View style={styles.addOnContentModal}>
                          <View style={styles.addOnInfoModal}>
                            <Text style={styles.addOnNameModal}>
                              {ingredient.name}
                            </Text>
                            {ingredient.description && (
                              <Text style={styles.addOnDescriptionModal}>
                                {ingredient.description}
                              </Text>
                            )}
                          </View>

                          <View style={styles.addOnControlsModal}>
                            <TouchableOpacity
                              onPress={() => {
                                // Check if exclusion is explicitly disabled (false)
                                // Default to true (allow exclusion) if settings not loaded or field is undefined
                                const canExclude =
                                  settings?.allowExcludeOptionalIngredients !==
                                  false;
                                if (!canExclude) {
                                  return; // Don't allow any changes if disabled
                                }
                                toggleOptionalIngredient(ingredient.id);
                              }}
                              disabled={
                                settings?.allowExcludeOptionalIngredients ===
                                false
                              }
                              style={[
                                styles.checkboxModal,
                                isIncluded && styles.checkboxModalActive,
                                settings?.allowExcludeOptionalIngredients ===
                                  false && styles.checkboxModalDisabled,
                              ]}
                            >
                              {isIncluded && (
                                <Text style={styles.checkmarkModal}>✓</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View
                    style={{
                      padding: 20,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#999", fontSize: 14 }}>
                      {t("mealCustomization.noOptionalIngredients")}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setShowOptionalIngredientsModal(false)}
              >
                <Text style={styles.modalDoneButtonText}>
                  {t("mealCustomization.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        {/* Availability Warning */}
        {availabilityMessage && (
          <View style={styles.availabilityWarning}>
            <MaterialIcons name="warning" size={16} color="#f59e0b" />
            <Text style={styles.availabilityWarningText} numberOfLines={2}>
              {availabilityMessage}
            </Text>
          </View>
        )}
        <View style={styles.actionBarContent}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>{t("mealCustomization.total")}</Text>
            <Text style={styles.totalPrice}>{formatPrice(calculateTotal(), currency)}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.addToCartButton,
              (!checkCanAddToCart().canAdd || loadingAvailability || !isAvailableByBranchTiming) && styles.addToCartButtonDisabled
            ]}
            onPress={handleAddToCart}
            disabled={!checkCanAddToCart().canAdd || loadingAvailability || !isAvailableByBranchTiming}
          >
            {loadingAvailability ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.addToCartText}>
                {!isAvailableByBranchTiming
                  ? t("mealCustomization.notAvailableNow")
                  : !checkCanAddToCart().canAdd
                  ? t("mealCustomization.unavailable")
                  : edit === "1"
                  ? t("mealCustomization.updateItem")
                  : t("mealCustomization.addToCart")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  statusBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    zIndex: 1001,
  },
  headerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#151718",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  backButtonIcon: {
    fontSize: 32,
    color: "#ec4899",
    fontWeight: "bold",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
    paddingTop: 6,
    paddingHorizontal: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartButton: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#fff",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#ec4899",
  },
  scrollContent: {
    flex: 1,
    backgroundColor: "#151718",
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  imageContainer: {
    width: "100%",
    height: 250,
    position: "relative",
  },
  mealImageWrap: {
    width: "100%",
    height: 250,
  },
  mealImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#333",
  },
  unavailableOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  unavailableRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  unavailableTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  unavailableText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: 16,
  },
  description: {
    color: "#ec4899",
    fontSize: 16,
    fontWeight: "600",
  },
  section: {
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    justifyContent: "space-between",
  },
  sectionIndicator: {
    width: 32,
    height: 4,
    backgroundColor: "#ec4899",
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
  },
  sizeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  sizeButton: {
    flex: 1,
    minWidth: "30%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
    backgroundColor: "#262626",
    alignItems: "center",
  },
  sizeButtonActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  sizeName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  sizeNameActive: {
    color: "#ec4899",
  },
  sizePrice: {
    fontSize: 14,
    color: "#999",
  },
  sizePriceActive: {
    color: "#ec4899",
  },
  addOnsList: {
    gap: 6,
  },
  addOnCard: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    overflow: "hidden",
    padding: 8,
  },
  addOnImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#333",
    marginRight: 10,
  },
  addOnImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  addOnCardActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  addOnContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addOnInfo: {
    flex: 1,
  },
  addOnName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  addOnDescription: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  addOnPrice: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addOnControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#666",
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  checkmark: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  addButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    backgroundColor: "#333",
  },
  quantityButtonMain: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  quantityValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ec4899",
    minWidth: 24,
    textAlign: "center",
  },
  textInput: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#333",
    minHeight: 80,
    textAlignVertical: "top",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  quantityDisplay: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 2,
    borderColor: "#ec4899",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  quantityText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ec4899",
  },
  actionBar: {
    backgroundColor: "#151718",
    borderTopWidth: 1,
    borderTopColor: "#333",
    padding: 16,
    paddingBottom: 30,
  },
  actionBarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  availabilityWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  availabilityWarningText: {
    flex: 1,
    fontSize: 12,
    color: "#f59e0b",
  },
  totalContainer: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 14,
    color: "#999",
    marginBottom: 4,
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addToCartButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 150,
  },
  addToCartButtonDisabled: {
    backgroundColor: "#666",
    opacity: 0.7,
  },
  addToCartText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#151718",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#151718",
  },
  errorText: {
    color: "#fff",
    fontSize: 16,
  },
  bottomSpacing: {
    height: 120,
  },
  declarationsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  declarationBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  declarationIcon: {
    fontSize: 16,
  },
  declarationText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  showMoreButton: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  showMoreButtonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  addOnsSectionButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
    backgroundColor: "#262626",
    padding: 16,
  },
  addOnsSectionBadge: {
    marginLeft: "auto",
    marginRight: 8,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addOnsSectionBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  chevronIcon: {
    marginLeft: 4,
  },
  selectedAddOnsPreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  selectedAddOnsPreviewText: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheetContent: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "85%",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  },
  bottomSheetHandleContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#666",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  bottomSheetSubtitle: {
    fontSize: 14,
    color: "#ec4899",
    marginTop: 4,
  },
  modalCloseButton: {
    padding: 4,
  },
  bottomSheetBody: {
    flex: 1,
  },
  bottomSheetBodyContent: {
    padding: 16,
    paddingBottom: 16,
  },
  // Declarations Modal Styles
  declarationsModalContainer: {
    flexDirection: "column",
  },
  declarationBadgeModal: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
    marginBottom: 10,
    width: "100%",
  },
  declarationIconModal: {
    fontSize: 22,
    marginRight: 12,
  },
  declarationTextModal: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  declarationDescription: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  // Add-ons Modal Styles
  addOnsModalList: {
    paddingBottom: 4,
  },
  addOnCardModal: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    overflow: "hidden",
    padding: 10,
  },
  addOnCardModalActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  addOnImageContainerModal: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#333",
    marginRight: 12,
  },
  addOnImageModal: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  addOnContentModal: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addOnInfoModal: {
    flex: 1,
  },
  addOnNameModal: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  addOnDescriptionModal: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  addOnPriceModal: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ec4899",
  },
  addOnControlsModal: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkboxModal: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#666",
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxModalActive: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  checkboxModalDisabled: {
    opacity: 0.5,
  },
  checkmarkModal: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  addButtonModal: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addButtonTextModal: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  quantityControlsModal: {
    flexDirection: "row",
    alignItems: "center",
  },
  quantityButtonModal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ec4899",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonModalDisabled: {
    backgroundColor: "#333",
  },
  quantityButtonTextModal: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  quantityValueModal: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#ec4899",
    minWidth: 28,
    textAlign: "center",
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  modalDoneButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  modalDoneButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
