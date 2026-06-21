import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScroll } from "@/src/contexts/ScrollContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import branchService from "@/src/services/branchService";
import { useCartStore } from "@/src/store/cartStore";
import { useAuth } from "@clerk/clerk-expo";
import {
  useStripe,
  CardField,
  useConfirmPayment,
} from "@stripe/stripe-react-native";
import { MaterialIcons } from "@expo/vector-icons";
import ApiService from "@/src/services/apiService";
import EnhancedAddressSelector, {
  DetailedAddress,
} from "@/components/EnhancedAddressSelector";
import PickupLocationDisplay from "@/components/PickupLocationDisplay";
import DeliveryAvailabilityCheck from "@/components/DeliveryAvailabilityCheck";
import { Toast } from "@/components/Toast";
import { calculateTax } from "@/src/utils/taxCalculator";
import { getAddonPriceForMealSize, getNearestSmallerAddonSize, type SizeType } from "@/src/utils/sizeMatcher";
import type {
  Settings,
  Meal,
  Addon,
  TaxBreakdown,
} from "@/src/utils/taxCalculator";
import { reservationService } from "@/src/services/reservationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { EditIcon } from "@/components/ui/edit-icon";
import { formatPrice } from "@/src/utils/currency";
import servingHoursService, {
  type ServingHoursStatus,
} from "@/src/services/servingHoursService";
import { useBranch } from "@/src/contexts/BranchContext";
import PayPalPayment from "@/components/PayPalPayment";
import { PaymentService } from "@/src/services/paymentService";
import { deliverableQuantityService, type CartItemForValidation } from "@/src/services/deliverableQuantityService";
import { ScheduledOrderPicker } from "@/components/ScheduledOrderPicker";
import { useCheckoutDraftStore } from "@/src/store/checkoutDraftStore";

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

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const { items, clearCart } = useCartStore();
  const checkoutDraft = useCheckoutDraftStore();
  
  // Calculate subtotal fresh from cart items (like React frontend)
  // This ensures consistency with tax calculator which also uses basePrice + sizePrice + addOns
  const totalPrice = useMemo(() => {
    return items.reduce((total, item) => {
      const sizePrice = item.basePrice + (item.sizePrice || 0);
      const addOnPrice = (item.addOns || []).reduce((sum, addOn) => {
        const addOnQuantity = addOn.quantity || 1;
        return sum + (addOn.price || 0) * addOnQuantity;
      }, 0);
      return total + (sizePrice + addOnPrice) * item.quantity;
    }, 0);
  }, [items]);
  const apiService = ApiService.getInstance();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const { branch: branchSummary, availability, branches } = useBranch();
  const [lockedBranchId, setLockedBranchId] = useState<string | null>(null);
  
  // Helper to get value from branch first, then settings
  const getBranchOrSettingsValue = <T,>(branchValue: T | null | undefined, settingsValue: T | null | undefined, defaultValue: T): T => {
    return (branchValue !== null && branchValue !== undefined) ? branchValue : (settingsValue !== null && settingsValue !== undefined ? settingsValue : defaultValue);
  };
  const lastScrollY = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

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

  const { confirmPayment } = useConfirmPayment();
  const stripe = useStripe();
  const [isStripeReady, setIsStripeReady] = useState(false);
  // Reservation checkout state
  const [isReservationCheckout, setIsReservationCheckout] = useState(false);
  const [reservationData, setReservationData] = useState<any>(null);
  const [reservationSettings, setReservationSettings] = useState<any>(null);
  const [reservationSpecialRequests, setReservationSpecialRequests] = useState("");
  const [existingReservation, setExistingReservation] = useState<any>(null);
  const [reservationBranch, setReservationBranch] = useState<any>(null);

  // Use locked reservation branch when modifying; fallback to reservation data, then branch context
  const branchIdForPricing = useMemo(
    () =>
      lockedBranchId ||
      existingReservation?.branch?.id ||
      reservationData?.branchId ||
      branchSummary?.id ||
      undefined,
    [
      lockedBranchId,
      existingReservation?.branch?.id,
      reservationData?.branchId,
      branchSummary?.id,
    ]
  );
  useEffect(() => {
  }, [lockedBranchId, existingReservation?.branch?.id, reservationData?.branchId, branchSummary?.id, branchIdForPricing]);
  
  // Load locked branch (modification) from storage
  useEffect(() => {
    const loadLockedBranch = async () => {
      try {
        const modifyingReservationBranchId = await AsyncStorage.getItem(
          "modifyingReservationBranchId"
        );
        const modifyingOrderBranchId = await AsyncStorage.getItem(
          "modifyingOrderBranchId"
        );
        setLockedBranchId(modifyingReservationBranchId || modifyingOrderBranchId || null);
      } catch (err) {
        console.warn("Checkout: failed to load locked branch", err);
        setLockedBranchId(null);
      }
    };
    loadLockedBranch();
  }, []);

  // Refresh reservation settings, branch data, meals, addons when branchIdForPricing changes in reservation checkout
  useEffect(() => {
    const reloadBranchData = async () => {
      if (!isReservationCheckout || !branchIdForPricing) return;
      if (items.length === 0) return;
      setIsLoadingTaxData(true);
      try {
        const token = await getToken();
        if (!token) return;

        // Settings
        try {
          const settings = await reservationService.getSettings(token, branchIdForPricing);
          setReservationSettings(settings);
        } catch (err) {
          console.warn("Checkout: failed to load reservation settings for branch", branchIdForPricing, err);
        }

        // Branch info
        try {
          const branches = await branchService.getBranches(token);
          const branch = branches.find((b) => b.id === branchIdForPricing) || null;
          setReservationBranch(branch);
        } catch (err) {
          console.warn("Checkout: failed to load branch info", branchIdForPricing, err);
          setReservationBranch(null);
        }

        // Meals
        const mealIds = (
          [...new Set(items.map((item) => item.mealId).filter(Boolean))] as string[]
        ).filter(Boolean);
        if (mealIds.length > 0) {
          try {
            const mealsData = await Promise.all(
              mealIds.map((id) => apiService.getMealById(id, branchIdForPricing, token))
            );
            setMeals(mealsData);
          } catch (err) {
            console.warn("Checkout: failed to load meals for branch", branchIdForPricing, err);
          }
        }

        // Addons
        const addonIds = [
          ...new Set(items.flatMap((item) => item.addOns.map((a) => a.id))),
        ];
        if (addonIds.length > 0) {
          try {
            const addonsData = await Promise.all(
              addonIds.map((id) => apiService.getAddonById(id, token, branchIdForPricing))
            );
            setAddons(addonsData);
          } catch (err) {
            console.warn("Checkout: failed to load addons for branch", branchIdForPricing, err);
          }
        }
      } finally {
        setIsLoadingTaxData(false);
      }
    };
    reloadBranchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchIdForPricing, isReservationCheckout, items.length]);

  // Check if Stripe is ready
  useEffect(() => {
    if (stripe) {
      setIsStripeReady(true);
    }
  }, [stripe]);

  // Check for pending reservation on mount (only once)
  useEffect(() => {
    let isMounted = true;
    
    const checkReservationContext = async () => {
      try {
        // Check if modifying an existing reservation
        const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
        if (modifyingReservationId && isMounted) {
          // This is a modification scenario - fetch the original reservation
          const token = await getToken();
          if (token) {
            try {
              const response = await reservationService.getUserReservations(1, 100, undefined, token);
              const originalReservation = response.data.reservations?.find(
                (r: any) => r.id === modifyingReservationId
              );
              
              if (originalReservation && isMounted) {
                setIsReservationCheckout(true);
                setExistingReservation(originalReservation); // Store existing reservation for merging items
                const originalPaymentProvider =
                  originalReservation.reservationOrder?.payment?.paymentProvider;
                if (originalPaymentProvider) {
                  setIsPaymentMethodLocked(true);
                  setLockedPaymentProvider(originalPaymentProvider);
                  setPaymentMethod(
                    originalPaymentProvider === "PAYPAL" ? "paypal" : "card"
                  );
                }
                // Use original reservation data to preserve date/time
                const reservationDate = new Date(originalReservation.reservationDate);
                const year = reservationDate.getFullYear();
                const month = String(reservationDate.getMonth() + 1).padStart(2, "0");
                const day = String(reservationDate.getDate()).padStart(2, "0");
                const hours = String(reservationDate.getHours()).padStart(2, "0");
                const minutes = String(reservationDate.getMinutes()).padStart(2, "0");
                
                setReservationData({
                  ...originalReservation,
                  date: `${year}-${month}-${day}`,
                  time: `${hours}:${minutes}`,
                  type: "PRE_ORDER",
                });
                // Store the reservation ID for later use
                await AsyncStorage.setItem("modifyingReservationId", modifyingReservationId);
                // Skip delivery steps for reservations
                setShowDeliveryAvailability(false);
                setShowDeliveryAddress(false);
                setAvailabilityConfirmed(true);
                setCurrentStep(2); // Go directly to payment step
                // Load reservation settings for minimum order validation and payment settings
                try {
                  const settings = await reservationService.getSettings(token, branchIdForPricing);
                  if (isMounted) {
                    setReservationSettings(settings);
                  }
                  try {
                    const branches = await branchService.getBranches(token);
                  const branch = branches.find((b) => b.id === branchIdForPricing);
                    if (isMounted) {
                      setReservationBranch(branch || null);
                    }
                  } catch (branchErr) {
                    console.warn("Failed to load reservation branch data:", branchErr);
                    if (isMounted) setReservationBranch(null);
                  }
                } catch (error) {
                  // Failed to load reservation settings
                }
              }
            } catch (error) {
              // Error fetching reservation for modification
            }
          }
        } else {
          // Check for new pending reservation
          const pendingReservation = await AsyncStorage.getItem("pendingReservation");
          if (pendingReservation && isMounted) {
            const parsed = JSON.parse(pendingReservation);
            if (parsed.type === "PRE_ORDER" && isMounted) {
              setIsReservationCheckout(true);
              setReservationData(parsed);
              // Skip delivery steps for reservations
              setShowDeliveryAvailability(false);
              setShowDeliveryAddress(false);
              setAvailabilityConfirmed(true);
              setCurrentStep(2); // Go directly to payment step
              // Load reservation settings for minimum order validation and payment settings
              const token = await getToken();
              if (token && isMounted) {
                try {
                  const settings = await reservationService.getSettings(token, parsed.branchId);
                  if (isMounted) {
                    setReservationSettings(settings);
                  }
                try {
                  const branches = await branchService.getBranches(token);
                  const branch = branches.find((b) => b.id === parsed.branchId);
                  if (isMounted) {
                    setReservationBranch(branch || null);
                  }
                } catch (branchErr) {
                  console.warn("Failed to load reservation branch data:", branchErr);
                  if (isMounted) setReservationBranch(null);
                }
                } catch (error) {
                  // Failed to load reservation settings
                }
              }
            }
          }
        }
      } catch (error) {
        // Error checking reservation context
      }
    };
    
    checkReservationContext();
    
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // Redirect if not signed in for reservations
  useEffect(() => {
    if (isReservationCheckout && !isSignedIn) {
      showToast(
        t("reservations.checkout.signInRequired") || "Please sign in to complete your reservation",
        "error"
      );
      router.replace("/(tabs)/menu?reservation=pre-order");
    }
  }, [isReservationCheckout, isSignedIn, router]);

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      if (isReservationCheckout) {
        router.replace("/(tabs)/menu?reservation=pre-order");
      } else {
        router.replace("/cart");
      }
    }
  }, [items.length, router, isReservationCheckout]);

  // Load serving hours (only for regular orders, not reservations)
  useEffect(() => {
    if (isReservationCheckout) {
      setServingHoursLoading(false);
      return;
    }

    const loadServingHours = async () => {
      try {
        setServingHoursLoading(true);
        const response = await servingHoursService.getServingHours();
        if (response.success) {
          setServingHoursStatus(response.data.currentStatus);
          setAllowOrdersOutsideHours(response.data.allowOrdersOutsideHours);
        }
      } catch (error) {
        // Error fetching serving hours
      } finally {
        setServingHoursLoading(false);
      }
    };

    loadServingHours();
  }, [isReservationCheckout]);

  // Listen to keyboard show/hide events
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        setKeyboardVisible(true);
        setKeyboardHeight(event.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [deliveryInfo, setDeliveryInfo] = useState({
    address: "",
    streetAddress: "",
    postalCode: "",
    addressType: "HOUSE" as "HOUSE" | "BUILDING",
    houseNumber: "",
    building: "",
    floor: "",
    apartment: "",
    extraDetails: "",
    phone: "",
    notes: "",
  });
  const [pickupInfo, setPickupInfo] = useState({
    phone: "",
    notes: "",
  });
  const [detailedAddress, setDetailedAddress] = useState<DetailedAddress>({
    fullAddress: "",
  });
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const lastDistanceToastRef = useRef<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cod" | "paypal">("cod");
  const [appliedVoucher, setAppliedVoucher] = useState<any | null>(null);
  const [voucherCode, setVoucherCode] = useState<string>("");
  const [isValidatingVoucher, setIsValidatingVoucher] = useState<boolean>(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [isPaymentMethodLocked, setIsPaymentMethodLocked] = useState(false);
  const [lockedPaymentProvider, setLockedPaymentProvider] = useState<
    "STRIPE" | "PAYPAL" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardDetails, setCardDetails] = useState<any>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [taxBreakdown, setTaxBreakdown] = useState<TaxBreakdown | null>(null);
  const [isLoadingTaxData, setIsLoadingTaxData] = useState(true);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [mergeWithOrderId, setMergeWithOrderId] = useState<string | undefined>(
    undefined
  );
  const [hasDismissedMergePrompt, setHasDismissedMergePrompt] = useState(false);
  const [availabilityConfirmed, setAvailabilityConfirmed] = useState(false);
  const [showDeliveryAvailability, setShowDeliveryAvailability] =
    useState(true);
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [phoneError, setPhoneError] = useState<string>("");
  const didInitFromDraftRef = useRef(false);
  const prevBranchIdRef = useRef<string | null>(null);
  
  // Serving hours state
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [allowOrdersOutsideHours, setAllowOrdersOutsideHours] = useState(false);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);
  const isPickup = orderType === "PICKUP";
  
  // Scheduled order state
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);

  // Find the full branch object using the effective branch ID
  const fullBranch = branchIdForPricing
    ? branches.find((b) => b.id === branchIdForPricing)
    : null;

  // Hydrate checkout state from persisted draft once storage has loaded
  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    if (didInitFromDraftRef.current) return;

    didInitFromDraftRef.current = true;

    setOrderType(checkoutDraft.orderType);
    setDeliveryInfo((prev) => ({
      ...prev,
      ...checkoutDraft.deliveryInfo,
      address: checkoutDraft.deliveryInfo?.address || "",
      streetAddress: (checkoutDraft.deliveryInfo as any)?.streetAddress || "",
      postalCode: (checkoutDraft.deliveryInfo as any)?.postalCode || "",
      addressType: ((checkoutDraft.deliveryInfo as any)?.addressType || "HOUSE") as any,
      houseNumber: (checkoutDraft.deliveryInfo as any)?.houseNumber || "",
    }));
    setPickupInfo(checkoutDraft.pickupInfo);
    setDetailedAddress({
      fullAddress: checkoutDraft.detailedAddress.fullAddress || "",
      streetAddress: checkoutDraft.detailedAddress.streetAddress,
      postalCode: checkoutDraft.detailedAddress.postalCode,
      addressType: checkoutDraft.detailedAddress.addressType,
      houseNumber: checkoutDraft.detailedAddress.houseNumber,
      building: checkoutDraft.detailedAddress.building,
      floor: checkoutDraft.detailedAddress.floor,
      apartment: checkoutDraft.detailedAddress.apartment,
      extraDetails: checkoutDraft.detailedAddress.extraDetails,
    });
    setDeliveryDistance(checkoutDraft.deliveryDistance);

    if (
      checkoutDraft.orderType === "DELIVERY" &&
      checkoutDraft.deliveryAvailabilityConfirmed
    ) {
      setAvailabilityConfirmed(true);
      setShowDeliveryAvailability(false);
      setShowDeliveryAddress(true);
    }
  }, [checkoutDraft.hasHydrated]);

  // Persist orderType and form fields to draft
  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    useCheckoutDraftStore.getState().setOrderType(orderType);
  }, [orderType, checkoutDraft.hasHydrated]);

  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    useCheckoutDraftStore.getState().setDeliveryInfo(deliveryInfo);
  }, [deliveryInfo, checkoutDraft.hasHydrated]);

  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    useCheckoutDraftStore.getState().setPickupInfo(pickupInfo);
  }, [pickupInfo, checkoutDraft.hasHydrated]);

  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    useCheckoutDraftStore.getState().setDetailedAddress(detailedAddress);
  }, [detailedAddress, checkoutDraft.hasHydrated]);

  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    useCheckoutDraftStore.getState().setDeliveryDistance(deliveryDistance);
  }, [deliveryDistance, checkoutDraft.hasHydrated]);

  // Track branchId in draft; if branch changes, clear address+distance to avoid stale cross-branch calculations
  useEffect(() => {
    if (!checkoutDraft.hasHydrated) return;
    const currentBranchId = branchIdForPricing || null;
    const prev = prevBranchIdRef.current;

    useCheckoutDraftStore.getState().setBranchId(currentBranchId);

    if (prev && currentBranchId && prev !== currentBranchId) {
      setDeliveryInfo((p) => ({
        ...p,
        address: "",
        building: "",
        floor: "",
        apartment: "",
        extraDetails: "",
      }));
      setDetailedAddress({ fullAddress: "" });
      setDeliveryDistance(null);

      setAvailabilityConfirmed(false);
      setShowDeliveryAvailability(true);
      setShowDeliveryAddress(false);
      useCheckoutDraftStore.getState().setDeliveryAvailabilityConfirmed(false);
    }

    prevBranchIdRef.current = currentBranchId;
  }, [branchIdForPricing, checkoutDraft.hasHydrated]);

  const effectivePickupEnabled = getBranchOrSettingsValue(
    (fullBranch as any)?.pickupEnabled,
    (settings as any)?.pickupEnabled,
    true
  );
  const effectiveDeliveryEnabled = getBranchOrSettingsValue(
    (fullBranch as any)?.deliveryEnabled,
    (settings as any)?.deliveryEnabled,
    true
  );

  // Keep orderType consistent with enabled services
  useEffect(() => {
    if (isReservationCheckout) return;
    if (orderType === "PICKUP" && !effectivePickupEnabled && effectiveDeliveryEnabled) {
      setOrderType("DELIVERY");
      return;
    }
    if (orderType === "DELIVERY" && !effectiveDeliveryEnabled && effectivePickupEnabled) {
      setOrderType("PICKUP");
    }
  }, [isReservationCheckout, orderType, effectivePickupEnabled, effectiveDeliveryEnabled]);

  // Clear scheduled date if future order scheduling becomes unavailable
  useEffect(() => {
    const masterFutureOrdersEnabled =
      (fullBranch as any)?.futureOrdersEnabled ?? settings?.futureOrdersEnabled ?? false;

    const perTypeFutureEnabled =
      orderType === "PICKUP"
        ? ((fullBranch as any)?.enableFuturePickupOrders ?? settings?.enableFuturePickupOrders ?? false)
        : ((fullBranch as any)?.enableFutureDeliveryOrders ?? settings?.enableFutureDeliveryOrders ?? false);

    const isSchedulingAllowed = masterFutureOrdersEnabled && perTypeFutureEnabled;

    if (!isSchedulingAllowed && scheduledDate) {
      setScheduledDate(null);
    }
  }, [fullBranch, settings, orderType, scheduledDate]);

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    visible: false,
    message: "",
    type: "success",
  });

  // Load user phone number on mount
  useEffect(() => {
    const loadUserPhone = async () => {
      if (!isSignedIn) return;

      try {
        const token = await getToken();
        if (!token) return;

        const result = await apiService.getUserProfile(token);
        if (result.success && result.data?.phone) {
          setDeliveryInfo((prev) => ({
            ...prev,
            phone: result.data.phone,
          }));
          setPickupInfo((prev) => ({
            ...prev,
            phone: result.data.phone,
          }));
        }
      } catch (error) {
        // Failed to load user phone
      }
    };

    loadUserPhone();
  }, [isSignedIn]);

  // Toggle delivery/pickup flow state
  useEffect(() => {
    if (isPickup) {
      setShowDeliveryAvailability(false);
      setShowDeliveryAddress(false);
      setAvailabilityConfirmed(true);
      setDeliveryDistance(null);
      if (checkoutDraft.hasHydrated) {
        useCheckoutDraftStore.getState().setDeliveryAvailabilityConfirmed(true);
      }
    } else {
      if (checkoutDraft.hasHydrated && checkoutDraft.deliveryAvailabilityConfirmed) {
        setShowDeliveryAvailability(false);
        setShowDeliveryAddress(true);
        setAvailabilityConfirmed(true);
      } else {
        setShowDeliveryAvailability(true);
        setShowDeliveryAddress(false);
        setAvailabilityConfirmed(false);
      }
    }
  }, [isPickup, checkoutDraft.hasHydrated, checkoutDraft.deliveryAvailabilityConfirmed]);

  // Check for active order when checkout page loads (skip for reservations)
  useEffect(() => {
    const checkForReservation = async () => {
      // First check if there's a pending reservation - if so, skip active order check
      const pendingReservation = await AsyncStorage.getItem("pendingReservation");
      if (pendingReservation) {
        try {
          const parsed = JSON.parse(pendingReservation);
          if (parsed.type === "PRE_ORDER") {
            // This is a reservation checkout, don't check for active orders
            return;
          }
        } catch (error) {
          // Failed to parse, continue with check
        }
      }

      // Also check for modifying reservation
      const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
      if (modifyingReservationId) {
        // This is a reservation modification, don't check for active orders
        return;
      }

      // Check for active order when moving to step 2 OR when scheduled date changes
      // (but not if already merging or decided)
      if (
        isSignedIn &&
        !showMergeDialog &&
        !mergeWithOrderId &&
        !hasDismissedMergePrompt &&
        items.length > 0 &&
        !isReservationCheckout &&
        (currentStep === 2 || scheduledDate !== null)
      ) {
        checkActiveOrder();
      }
    };

    checkForReservation();
  }, [currentStep, isSignedIn, items.length, isReservationCheckout, showMergeDialog, mergeWithOrderId, hasDismissedMergePrompt, scheduledDate]);

  const checkActiveOrder = async () => {
    // Don't check for active orders during reservation checkout
    if (isReservationCheckout) {
      return;
    }

    // Double-check for pending reservation
    const pendingReservation = await AsyncStorage.getItem("pendingReservation");
    if (pendingReservation) {
      try {
        const parsed = JSON.parse(pendingReservation);
        if (parsed.type === "PRE_ORDER") {
          return;
        }
      } catch (error) {
        // Failed to parse, continue with check
      }
    }

    // Double-check for modifying reservation
    const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
    if (modifyingReservationId) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const result = await apiService.getActiveOrder(token);

      if (
        result.success &&
        result.data?.hasActiveOrder &&
        result.data?.activeOrder
      ) {
        const activeOrderData = result.data.activeOrder;

        // Only allow merge prompt when active order matches the current branch and order type
        if (!branchIdForPricing) {
          return;
        }
        if (activeOrderData.branchId && activeOrderData.branchId !== branchIdForPricing) {
          return;
        }
        if (activeOrderData.orderType) {
          const activeIsPickup = activeOrderData.orderType === "PICKUP";
          if (activeIsPickup !== isPickup) {
            return;
          }
        }

        // Get effective merge timeframe (branch override or global setting)
        const mergeTimeframeMinutes = getBranchOrSettingsValue(
          fullBranch?.orderMergeTimeframeMinutes,
          settings?.orderMergeTimeframeMinutes,
          10 // default 10 minutes
        );
        
        // If merge timeframe is 0, order merging is disabled
        if (mergeTimeframeMinutes === 0) {
          return;
        }

        // Scheduled vs ASAP compatibility
        const existingIsScheduled = Boolean(
          activeOrderData.isScheduledOrder && activeOrderData.scheduledDate
        );
        const newIsScheduled = scheduledDate !== null;

        // If one is scheduled and one is ASAP, they can't be merged
        if (existingIsScheduled !== newIsScheduled) {
          return;
        }

        // If both are scheduled, apply scheduled order merge rules
        if (existingIsScheduled && newIsScheduled) {
          const allowScheduledMerge = getBranchOrSettingsValue(
            (fullBranch as any)?.allowScheduledOrderMerge,
            (settings as any)?.allowScheduledOrderMerge,
            false
          );
          if (!allowScheduledMerge) {
            return;
          }

          // Same time slot (within 30 minutes)
          const existingScheduledDate = new Date(activeOrderData.scheduledDate);
          const timeDiff = Math.abs(
            existingScheduledDate.getTime() - (scheduledDate as Date).getTime()
          );
          const thirtyMinutesMs = 30 * 60 * 1000;
          if (timeDiff > thirtyMinutesMs) {
            return;
          }

          // Cutoff hours
          const cutoffHours = getBranchOrSettingsValue(
            (fullBranch as any)?.scheduledOrderMergeCutoffHours,
            (settings as any)?.scheduledOrderMergeCutoffHours,
            2
          );
          const now = new Date();
          const cutoffTime = new Date(
            existingScheduledDate.getTime() - cutoffHours * 60 * 60 * 1000
          );
          if (now >= cutoffTime) {
            return;
          }

          setActiveOrder(activeOrderData);
          setShowMergeDialog(true);
          return;
        }

        // Both are ASAP orders - use standard merge timeframe logic
        const orderCreatedAt = new Date(activeOrderData.createdAt);
        const now = new Date();
        const minutesSinceOrder =
          (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
        if (minutesSinceOrder <= mergeTimeframeMinutes) {
          setActiveOrder(activeOrderData);
          setShowMergeDialog(true);
        }
      }
    } catch (error) {
      // Failed to check active order
    }
  };

  // Create a stable identifier for items to prevent infinite loops
  const itemsKey = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          itemType: item.itemType || "MEAL",
          mealId: item.mealId,
          dealId: item.dealId,
          sizeId: item.sizeId,
          quantity: item.quantity,
          addOnIds: item.addOns.map((a) => a.id).sort(),
        }))
      ),
    [items]
  );

  // Load settings, meals, and addons for tax calculations
  useEffect(() => {
    const loadTaxData = async () => {
      if (!isSignedIn || items.length === 0) {
        setIsLoadingTaxData(false);
        return;
      }

      try {
        setIsLoadingTaxData(true);
        const token = await getToken();
        if (!token) {
          setIsLoadingTaxData(false);
          return;
        }

        // Load settings
        const settingsResponse = await apiService.getSettings(token);
        if (settingsResponse.success) {
          setSettings({
            taxPercentage: settingsResponse.data.taxPercentage || 8.5,
            deliveryTaxPercentage:
              settingsResponse.data.deliveryTaxPercentage || 0,
            taxInclusive: settingsResponse.data.taxInclusive || false,
            pickupEnabled: (settingsResponse.data as any).pickupEnabled ?? true,
            deliveryEnabled: (settingsResponse.data as any).deliveryEnabled ?? true,
            deliveryFee: settingsResponse.data.deliveryFee || 3.99,
            deliveryRadius: settingsResponse.data.deliveryRadius || 5,
            deliveryRatePerKilometer:
              settingsResponse.data.deliveryRatePerKilometer || 0,
            useDynamicDeliveryFee:
              settingsResponse.data.useDynamicDeliveryFee || false,
            useTieredDeliveryFee:
              settingsResponse.data.useTieredDeliveryFee || false,
            latitude: settingsResponse.data.latitude,
            longitude: settingsResponse.data.longitude,
            country: settingsResponse.data.country,
            state: settingsResponse.data.state,
            city: settingsResponse.data.city,
            businessAddress: settingsResponse.data.businessAddress,
            currency: settingsResponse.data.currency || "USD",
            orderMergeTimeframeMinutes: settingsResponse.data.orderMergeTimeframeMinutes,
            allowScheduledOrderMerge: (settingsResponse.data as any).allowScheduledOrderMerge,
            scheduledOrderMergeCutoffHours: (settingsResponse.data as any).scheduledOrderMergeCutoffHours,
            // Future order settings
            futureOrdersEnabled: settingsResponse.data.futureOrdersEnabled || false,
            enableFuturePickupOrders: settingsResponse.data.enableFuturePickupOrders || false,
            futurePickupOrderDays: settingsResponse.data.futurePickupOrderDays || 0,
            enableFutureDeliveryOrders: settingsResponse.data.enableFutureDeliveryOrders || false,
            futureDeliveryOrderDays: settingsResponse.data.futureDeliveryOrderDays || 0,
            scheduledOrderTimeSlotInterval: settingsResponse.data.scheduledOrderTimeSlotInterval || 30,
          });
        } else {
          // Use defaults
          setSettings({
            taxPercentage: 8.5,
            deliveryTaxPercentage: 0,
            taxInclusive: false,
            pickupEnabled: true,
            deliveryEnabled: true,
            deliveryFee: 3.99,
            deliveryRadius: 5,
            deliveryRatePerKilometer: 0,
            useDynamicDeliveryFee: false,
            useTieredDeliveryFee: false,
            orderMergeTimeframeMinutes: 10,
            allowScheduledOrderMerge: false,
            scheduledOrderMergeCutoffHours: 2,
            currency: "USD",
          });
        }

        // Load meals data with branch ID to get branch-specific tax and prices
        const mealIds = (
          [...new Set(items.map((item) => item.mealId).filter(Boolean))] as string[]
        ).filter(Boolean);
        const mealsData = await Promise.all(
          mealIds.map((id) => apiService.getMealById(id, branchIdForPricing, token))
        );
        setMeals(mealsData);

        // Load addons data with branch ID to get branch-specific tax and prices
        const addonIds = [
          ...new Set(items.flatMap((item) => item.addOns.map((a) => a.id))),
        ];
        if (addonIds.length > 0) {
          const addonsData = await Promise.all(
            addonIds.map((id) => apiService.getAddonById(id, token, branchIdForPricing))
          );
          setAddons(addonsData);
        }
      } catch (error) {
        // Failed to load tax data - use defaults if loading fails
        setSettings({
          taxPercentage: 8.5,
          deliveryTaxPercentage: 0,
          taxInclusive: false,
          pickupEnabled: true,
          deliveryEnabled: true,
          deliveryFee: 3.99,
          deliveryRadius: 5,
          deliveryRatePerKilometer: 0,
          useDynamicDeliveryFee: false,
          useTieredDeliveryFee: false,
          currency: "USD",
        });
        // Set empty arrays to prevent retrying
        setMeals([]);
        setAddons([]);
      } finally {
        setIsLoadingTaxData(false);
      }
    };

    loadTaxData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, itemsKey]);

  // Calculate tax breakdown when data is loaded
  useEffect(() => {
    const hasDealItems = items.some(
      (it: any) => it?.itemType === "DEAL" || Boolean(it?.dealId) || Array.isArray(it?.dealComponents)
    );

    if (settings && items.length > 0 && !isLoadingTaxData && (meals.length > 0 || hasDealItems)) {
      // Resolve effective branch for tax/price: locked/reservation branch wins
      const branchForCalc =
        (branchIdForPricing &&
          (reservationBranch ||
            branches.find((b: any) => b.id === branchIdForPricing) ||
            null)) ||
        fullBranch;

      const deriveAddonPriceForTax = (
        cartAddOn: any,
        addonData: any | undefined,
        mealSizeType: SizeType | null
      ): number => {
        const baseFromCart = Number(cartAddOn?.price || 0);
        if (!addonData) return baseFromCart;

        const originalBasePrice = addonData?.price ? Number(addonData.price) : 0;
        const branchBasePrice =
          (addonData as any).effectiveBasePrice !== null &&
          (addonData as any).effectiveBasePrice !== undefined
            ? Number((addonData as any).effectiveBasePrice)
            : originalBasePrice;

        const addonSizes = (addonData as any)?.addonSizes;
        if (!addonSizes || !Array.isArray(addonSizes) || addonSizes.length === 0) {
          return branchBasePrice;
        }

        const availableSizes: SizeType[] = addonSizes
          .map((s: any) => s?.sizeType)
          .filter(Boolean) as SizeType[];
        getNearestSmallerAddonSize(mealSizeType || "M", availableSizes);
        const originalSizePrice = getAddonPriceForMealSize(
          mealSizeType || "M",
          addonSizes.map((s: any) => ({
            sizeType: s.sizeType as SizeType,
            price: Number(s.price),
          }))
        );

        if (originalSizePrice === null) {
          return branchBasePrice;
        }

        const sizePriceAdjustment = originalSizePrice - originalBasePrice;
        const adjustedSizePrice = branchBasePrice + sizePriceAdjustment;
        return Number.isFinite(adjustedSizePrice) ? adjustedSizePrice : branchBasePrice;
      };

      const mapItemToCartItemForTax = (item: any) => {
        const isDealItem =
          item?.itemType === "DEAL" || Boolean(item?.dealId) || Array.isArray(item?.dealComponents);

        if (isDealItem) {
          const addOns = (item.addOns || []).map((addOn: any) => {
            const addonData = addons.find((a) => a.id === addOn.id);
            const derivedAddonPrice = deriveAddonPriceForTax(addOn, addonData as any, null);
            return {
              ...addOn,
              price: derivedAddonPrice,
            };
          });

          return {
            id: item.id,
            itemType: "DEAL" as const,
            mealId: item.mealId,
            dealId: item.dealId,
            size: "DEAL",
            basePrice: Number(item.basePrice || 0),
            quantity: Number(item.quantity || 1),
            dealComponents: Array.isArray(item.dealComponents) ? item.dealComponents : [],
            addOns,
          };
        }

        const mealData = meals.find((m) => m.id === item.mealId);
        const sizeObj =
          mealData?.mealSizes?.find(
            (s: any) =>
              s.id === item.sizeId ||
              s.name === item.sizeName ||
              s.name?.toLowerCase() === item.sizeName?.toLowerCase()
          ) || undefined;
        const mealSizeType = (sizeObj?.sizeType as SizeType | undefined) || "M";

        const derivedBasePrice =
          mealData && (mealData as any).effectiveBasePrice !== undefined && (mealData as any).effectiveBasePrice !== null
            ? Number((mealData as any).effectiveBasePrice)
            : item.basePrice;
        const derivedSizePrice =
          sizeObj && sizeObj.price !== undefined && sizeObj.price !== null
            ? Number(sizeObj.price)
            : item.sizePrice || 0;
        const addOns = (item.addOns || []).map((addOn: any) => {
          const addonData = addons.find((a) => a.id === addOn.id);
          const derivedAddonPrice = deriveAddonPriceForTax(addOn, addonData as any, mealSizeType);
          return {
            ...addOn,
            price: derivedAddonPrice,
          };
        });

        return {
          id: item.id,
          mealId: item.mealId,
          size: item.sizeName,
          sizeId: item.sizeId,
          basePrice: derivedBasePrice,
          sizePrice: derivedSizePrice,
          quantity: item.quantity,
          addOns,
        };
      };

      // For reservations, skip delivery fee calculation
      if (isReservationCheckout) {
        const cartItemsForTax = items.map(mapItemToCartItemForTax);

        // Create a settings-like object from branch data for calculateTax function
        const taxSettings = {
          taxPercentage: Number(getBranchOrSettingsValue(branchForCalc?.taxPercentage, settings?.taxPercentage, 8.5)),
          deliveryTaxPercentage: Number(getBranchOrSettingsValue(branchForCalc?.deliveryTaxPercentage, settings?.deliveryTaxPercentage, 0)),
          taxInclusive: getBranchOrSettingsValue(branchForCalc?.taxInclusive, settings?.taxInclusive, false),
        };

        const breakdown = calculateTax(
          cartItemsForTax,
          meals,
          addons,
          { ...settings, ...taxSettings }, // Merge branch tax settings with settings
          0 // No delivery fee for reservations
        );
        setTaxBreakdown(breakdown);
        return;
      }

      // For pickup orders, no delivery fee or delivery tax
      if (isPickup) {
        const cartItemsForTax = items.map(mapItemToCartItemForTax);

        const taxSettings = {
          taxPercentage: Number(getBranchOrSettingsValue(branchForCalc?.taxPercentage, settings?.taxPercentage, 8.5)),
          deliveryTaxPercentage: 0,
          taxInclusive: getBranchOrSettingsValue(branchForCalc?.taxInclusive, settings?.taxInclusive, false),
        };

        const breakdown = calculateTax(
          cartItemsForTax,
          meals,
          addons,
          { ...settings, ...taxSettings },
          0
        );
        setTaxBreakdown(breakdown);
        return;
      }

      // Calculate delivery fee based on distance if available
      // Use branch settings first, then fall back to settings
      const useDynamicDeliveryFee = getBranchOrSettingsValue(fullBranch?.useDynamicDeliveryFee, settings?.useDynamicDeliveryFee, false);
      const useTieredDeliveryFee = getBranchOrSettingsValue(fullBranch?.useTieredDeliveryFee, settings?.useTieredDeliveryFee, false);
      let baseDeliveryFee = Number(getBranchOrSettingsValue(fullBranch?.deliveryFee, settings?.deliveryFee, 3.99));

      if (useTieredDeliveryFee && deliveryDistance !== null) {
        const initialRange = Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryRange, settings?.initialDeliveryRange, 3.0));
        const initialPrice = Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryPrice, settings?.initialDeliveryPrice, 2.0));
        const standardRate = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
        const extendedThreshold = fullBranch?.extendedDeliveryThreshold !== null && fullBranch?.extendedDeliveryThreshold !== undefined
          ? Number(fullBranch.extendedDeliveryThreshold)
          : settings?.extendedDeliveryThreshold
          ? Number(settings.extendedDeliveryThreshold)
          : null;
        const extendedRate = fullBranch?.extendedDeliveryRate !== null && fullBranch?.extendedDeliveryRate !== undefined
          ? Number(fullBranch.extendedDeliveryRate)
          : settings?.extendedDeliveryRate
          ? Number(settings.extendedDeliveryRate)
          : null;

        const distance = deliveryDistance;

        if (distance <= initialRange) {
          baseDeliveryFee = initialPrice;
        } else {
          let fee = initialPrice;
          if (extendedThreshold && extendedRate && distance > extendedThreshold) {
            const standardRangeKm =
              Math.min(distance, extendedThreshold) - initialRange;
            const extendedRangeKm = distance - extendedThreshold;
            fee =
              initialPrice +
              standardRangeKm * standardRate +
              extendedRangeKm * extendedRate;
          } else {
            const additionalKm = distance - initialRange;
            fee = initialPrice + additionalKm * standardRate;
          }
          baseDeliveryFee = fee;
        }
      } else if (useDynamicDeliveryFee && deliveryDistance !== null) {
        const deliveryRatePerKm = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
        if (deliveryRatePerKm > 0) {
          baseDeliveryFee = deliveryDistance * deliveryRatePerKm;
        }
      }

      // Apply free delivery threshold (like React frontend)
      const enableFreeDelivery = getBranchOrSettingsValue(fullBranch?.enableFreeDelivery, settings?.enableFreeDelivery, false);
      const freeDeliveryThreshold = Number(getBranchOrSettingsValue(fullBranch?.freeDeliveryThreshold, settings?.freeDeliveryThreshold, 50.0));
      
      // Calculate current subtotal for free delivery check
      const currentSubtotal = items.reduce((total, item) => {
        const mealData = meals.find((m) => m.id === item.mealId);
        const sizeObj = mealData?.mealSizes?.find(
          (s: any) => s.id === item.sizeId || s.name === item.sizeName
        );
        const basePrice = mealData && (mealData as any).effectiveBasePrice !== undefined
          ? Number((mealData as any).effectiveBasePrice)
          : item.basePrice;
        const sizePrice = sizeObj && sizeObj.price !== undefined
          ? Number(sizeObj.price)
          : item.sizePrice || 0;
        const addOnPrice = (item.addOns || []).reduce((sum, addOn) => {
          const addonData = addons.find((a) => a.id === addOn.id);
          const price = addonData && (addonData as any).effectiveBasePrice !== undefined
            ? Number((addonData as any).effectiveBasePrice)
            : addOn.price || 0;
          return sum + price * (addOn.quantity || 1);
        }, 0);
        return total + (basePrice + sizePrice + addOnPrice) * item.quantity;
      }, 0);

      const deliveryFee = enableFreeDelivery && currentSubtotal >= freeDeliveryThreshold
        ? 0
        : baseDeliveryFee;

      // Transform cart items to match tax calculator format
      const cartItemsForTax = items.map(mapItemToCartItemForTax);

      // Create a settings-like object from branch data for calculateTax function
      const taxSettings = {
        taxPercentage: Number(getBranchOrSettingsValue(branchForCalc?.taxPercentage, settings?.taxPercentage, 8.5)),
        deliveryTaxPercentage: Number(getBranchOrSettingsValue(branchForCalc?.deliveryTaxPercentage, settings?.deliveryTaxPercentage, 0)),
        taxInclusive: getBranchOrSettingsValue(branchForCalc?.taxInclusive, settings?.taxInclusive, false),
      };

      // When merging orders, delivery fee/tax is 0 (already paid in original order)
      const deliveryFeeForTax = mergeWithOrderId ? 0 : deliveryFee;

      const breakdown = calculateTax(
        cartItemsForTax,
        meals,
        addons,
        { ...settings, ...taxSettings }, // Merge branch tax settings with settings
        deliveryFeeForTax
      );
      setTaxBreakdown(breakdown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, meals, addons, itemsKey, isLoadingTaxData, deliveryDistance, isReservationCheckout, fullBranch, reservationBranch, mergeWithOrderId]);

  // Calculate prices using tax breakdown if available
  const subtotal = totalPrice;
  
  // Calculate totals using branch settings (fallback to settings)
  const enableFreeDelivery = getBranchOrSettingsValue(fullBranch?.enableFreeDelivery, settings?.enableFreeDelivery, false);
  const freeDeliveryThreshold = Number(getBranchOrSettingsValue(fullBranch?.freeDeliveryThreshold, settings?.freeDeliveryThreshold, 50.0));
  const useDynamicDeliveryFee = getBranchOrSettingsValue(fullBranch?.useDynamicDeliveryFee, settings?.useDynamicDeliveryFee, false);
  const useTieredDeliveryFee = getBranchOrSettingsValue(fullBranch?.useTieredDeliveryFee, settings?.useTieredDeliveryFee, false);
  
  // Calculate delivery fee
  let baseDeliveryFee = isPickup
    ? 0
    : Number(getBranchOrSettingsValue(fullBranch?.deliveryFee, settings?.deliveryFee, 3.99));

  // If tiered delivery fee is enabled and distance is available, calculate using tiered pricing
  if (!isReservationCheckout && !isPickup && useTieredDeliveryFee && deliveryDistance !== null) {
    const initialRange = Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryRange, settings?.initialDeliveryRange, 3.0));
    const initialPrice = Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryPrice, settings?.initialDeliveryPrice, 2.0));
    const standardRate = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
    const extendedThreshold = fullBranch?.extendedDeliveryThreshold !== null && fullBranch?.extendedDeliveryThreshold !== undefined
      ? Number(fullBranch.extendedDeliveryThreshold)
      : settings?.extendedDeliveryThreshold
      ? Number(settings.extendedDeliveryThreshold)
      : null;
    const extendedRate = fullBranch?.extendedDeliveryRate !== null && fullBranch?.extendedDeliveryRate !== undefined
      ? Number(fullBranch.extendedDeliveryRate)
      : settings?.extendedDeliveryRate
      ? Number(settings.extendedDeliveryRate)
      : null;

    const distance = deliveryDistance;

    if (distance <= initialRange) {
      baseDeliveryFee = initialPrice;
    } else {
      let fee = initialPrice;
      if (extendedThreshold && extendedRate && distance > extendedThreshold) {
        const standardRangeKm =
          Math.min(distance, extendedThreshold) - initialRange;
        const extendedRangeKm = distance - extendedThreshold;
        fee =
          initialPrice +
          standardRangeKm * standardRate +
          extendedRangeKm * extendedRate;
      } else {
        const additionalKm = distance - initialRange;
        fee = initialPrice + additionalKm * standardRate;
      }
      baseDeliveryFee = fee;
    }
  }
  // If dynamic delivery fee is enabled and distance is available, calculate from distance
  else if (!isReservationCheckout && !isPickup && useDynamicDeliveryFee && deliveryDistance !== null) {
    const deliveryRatePerKm = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
    if (deliveryRatePerKm > 0) {
      baseDeliveryFee = deliveryDistance * deliveryRatePerKm;
    }
  }

  // Calculate delivery fee based on free delivery setting
  const deliveryFee = isReservationCheckout || isPickup
    ? 0 
    : (enableFreeDelivery && subtotal >= freeDeliveryThreshold
        ? 0
        : baseDeliveryFee);

  const branchForCalc = isReservationCheckout && reservationBranch ? reservationBranch : fullBranch;

  const taxPercentage = Number(getBranchOrSettingsValue(branchForCalc?.taxPercentage, settings?.taxPercentage, 8.5));
  const taxInclusive = getBranchOrSettingsValue(branchForCalc?.taxInclusive, settings?.taxInclusive, false);
  const currency = getBranchOrSettingsValue(branchForCalc?.currency, settings?.currency, "USD");

  const pickupTakeawayServiceFee = Number(
    getBranchOrSettingsValue(
      (branchForCalc as any)?.pickupTakeawayServiceFee,
      (settings as any)?.pickupTakeawayServiceFee,
      0
    )
  );

  const takeawayServiceTaxPercentage = Number(
    getBranchOrSettingsValue(
      (branchForCalc as any)?.serviceTaxPercentage,
      (settings as any)?.serviceTaxPercentage,
      0
    )
  );
  
  // Use detailed tax breakdown if available, otherwise fallback to simple calculation
  const itemTax = taxBreakdown?.itemTaxAmount || 0;
  const addonTax = taxBreakdown?.addonTaxAmount || 0;
  // When merging orders, delivery tax is 0 (already paid in original order)
  const deliveryTax = mergeWithOrderId ? 0 : (isPickup ? 0 : taxBreakdown?.deliveryTaxAmount || 0);

  const takeawayServiceFeeToAdd =
    isPickup ? (mergeWithOrderId ? 0 : pickupTakeawayServiceFee) : 0;

  const takeawayServiceTaxAmount = useMemo(() => {
    if (!isPickup) return 0;
    if (mergeWithOrderId) return 0;
    if (takeawayServiceFeeToAdd <= 0) return 0;
    if (!takeawayServiceTaxPercentage || takeawayServiceTaxPercentage <= 0) return 0;
    if (taxInclusive) return 0;
    return (takeawayServiceFeeToAdd * takeawayServiceTaxPercentage) / 100;
  }, [
    isPickup,
    mergeWithOrderId,
    takeawayServiceFeeToAdd,
    takeawayServiceTaxPercentage,
    taxInclusive,
  ]);

  const totalTax = mergeWithOrderId
    ? (itemTax + addonTax) // Only item and addon tax when merging
    : (taxBreakdown?.totalTaxAmount || (subtotal * taxPercentage) / 100);

  const totalTaxWithService = taxInclusive
    ? totalTax
    : (isPickup ? (itemTax + addonTax + takeawayServiceTaxAmount) : totalTax);

  // Check if we should show delivery fee and tax
  // If dynamic or tiered delivery fee is enabled, only show after address is selected
  const shouldShowDeliveryFeeAndTax =
    isPickup
      ? false
      : (!useDynamicDeliveryFee && !useTieredDeliveryFee) ||
        ((useDynamicDeliveryFee || useTieredDeliveryFee) &&
          deliveryInfo.address &&
          deliveryDistance !== null);

  const deliveryFeeInfoText = useMemo(() => {
    if (isReservationCheckout || isPickup) return null;
    if (!shouldShowDeliveryFeeAndTax) return null;

    if (enableFreeDelivery && subtotal >= freeDeliveryThreshold) {
      return t("checkout.step2.deliveryFeeInfo.freeDeliveryApplied", {
        threshold: formatPrice(freeDeliveryThreshold, currency),
        defaultValue: `Free delivery applied (orders over ${formatPrice(freeDeliveryThreshold, currency)})`,
      });
    }

    const distance = deliveryDistance;
    if ((useTieredDeliveryFee || useDynamicDeliveryFee) && (distance === null || distance === undefined)) {
      return null;
    }

    if (useTieredDeliveryFee) {
      const initialRange = Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryRange, settings?.initialDeliveryRange, 3.0));
      const initialPrice = Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryPrice, settings?.initialDeliveryPrice, 2.0));
      const standardRate = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
      const rounded = distance !== null ? Math.round(distance * 10) / 10 : null;
      return t("checkout.step2.deliveryFeeInfo.tiered", {
        distance: rounded ?? 0,
        initialRange,
        initialPrice: formatPrice(initialPrice, currency),
        rate: standardRate,
        defaultValue: `Based on distance ${rounded ?? "-"} km (first ${initialRange} km: ${formatPrice(initialPrice, currency)}, then ${standardRate}/km)`,
      });
    }

    if (useDynamicDeliveryFee) {
      const rate = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
      const rounded = distance !== null ? Math.round(distance * 10) / 10 : null;
      if (rate > 0) {
        return t("checkout.step2.deliveryFeeInfo.dynamic", {
          distance: rounded ?? 0,
          rate,
          defaultValue: `Based on distance ${rounded ?? "-"} km × ${rate}/km`,
        });
      }
    }

    // Flat fee
    return t("checkout.step2.deliveryFeeInfo.flat", {
      defaultValue: "Flat delivery fee",
    });
  }, [
    isReservationCheckout,
    isPickup,
    shouldShowDeliveryFeeAndTax,
    enableFreeDelivery,
    subtotal,
    freeDeliveryThreshold,
    deliveryDistance,
    useTieredDeliveryFee,
    useDynamicDeliveryFee,
    fullBranch,
    settings,
    currency,
    t,
  ]);

  // When taxInclusive=true, tax is already embedded in subtotal, so don't add it again
  // When taxInclusive=false, tax needs to be added on top
  // For pickup, reservation, or merged orders: only item + addon tax (no delivery tax)
  const taxToAdd = taxInclusive
    ? 0 // Tax already in subtotal
    : (isPickup || isReservationCheckout
        ? (itemTax + addonTax + (isPickup ? takeawayServiceTaxAmount : 0))
        : mergeWithOrderId
        ? (itemTax + addonTax) // Merged orders: no delivery tax
        : shouldShowDeliveryFeeAndTax
        ? totalTax
        : 0);

  // For merged orders, delivery fee is 0 (already paid in original order)
  const deliveryFeeToAdd = isPickup || isReservationCheckout || mergeWithOrderId
    ? 0
    : (shouldShowDeliveryFeeAndTax ? deliveryFee : 0);

  const finalTotal =
    subtotal +
    taxToAdd +
    deliveryFeeToAdd +
    takeawayServiceFeeToAdd;

  const voucherDeduction = useMemo(() => {
    if (!appliedVoucher) return 0;
    const voucherBalance = Number(appliedVoucher.currentAmount || appliedVoucher.voucherBalance || 0);
    if (isNaN(voucherBalance) || voucherBalance <= 0) return 0;

    if (appliedVoucher.voucherType === "MULTI_PURPOSE") {
      return Math.min(voucherBalance, finalTotal);
    }

    if (appliedVoucher.voucherType === "SINGLE_PURPOSE") {
      const lookupRate = Math.round(Number(appliedVoucher.vatRate || 0) * 100) / 100;
      let matchingTotal = 0;

      if (taxBreakdown) {
        // Sum matching items
        if (Array.isArray(taxBreakdown.itemBreakdown)) {
          for (const item of taxBreakdown.itemBreakdown) {
            const itemRate = Math.round(Number(item.taxPercentage || 0) * 100) / 100;
            if (itemRate === lookupRate) {
              matchingTotal += Number(item.basePrice || 0) * Number(item.quantity || 0);
            }
          }
        }
        // Sum matching addons
        if (Array.isArray(taxBreakdown.addonBreakdown)) {
          for (const addon of taxBreakdown.addonBreakdown) {
            const addonRate = Math.round(Number(addon.taxPercentage || 0) * 100) / 100;
            if (addonRate === lookupRate) {
              matchingTotal += Number(addon.price || 0) * Number(addon.quantity || 0) * Number(addon.itemQuantity || 0);
            }
          }
        }
        // Sum matching deal components if any
        if (Array.isArray(taxBreakdown.dealComponentBreakdown)) {
          for (const comp of taxBreakdown.dealComponentBreakdown) {
            const compRate = Math.round(Number(comp.taxPercentage || 0) * 100) / 100;
            if (compRate === lookupRate) {
              matchingTotal += Number(comp.unitPrice || 0) * Number(comp.componentQuantity || 0);
            }
          }
        }
      }

      return Math.min(voucherBalance, matchingTotal);
    }

    return 0;
  }, [appliedVoucher, finalTotal, taxBreakdown]);

  const remainingTotal = Math.max(0, finalTotal - voucherDeduction);
  
  // For reservations, check minimum order amount
  const preOrderMinAmount = isReservationCheckout && reservationSettings?.preOrderMinAmount 
    ? Number(reservationSettings.preOrderMinAmount) 
    : null;
  
  // Calculate combined total for reservation modifications (existing + new items) for validation only
  const combinedTotal = useMemo(() => {
    if (isReservationCheckout && existingReservation) {
      const existingTotal = existingReservation.reservationOrder?.totalAmount 
        ? Number(existingReservation.reservationOrder.totalAmount) 
        : 0;
      return existingTotal + finalTotal;
    }
    return finalTotal;
  }, [isReservationCheckout, existingReservation, finalTotal]);
  
  // For modifications, use combined total for validation; display/payment uses new items total
  const totalToCheck = isReservationCheckout && existingReservation ? combinedTotal : finalTotal;
  const isMinimumOrderMet = !preOrderMinAmount || totalToCheck >= preOrderMinAmount;

  // Deposit / allowed methods for reservations
  const depositPercentage = isReservationCheckout && reservationSettings?.depositPercentage !== undefined && reservationSettings?.depositPercentage !== null
    ? Number(reservationSettings.depositPercentage)
    : (isReservationCheckout ? 100 : undefined);
  
  // Get allowed payment methods from reservation settings
  // Only use default if field is completely missing (not null/empty array)
  const allowedPaymentMethods = isReservationCheckout && reservationSettings?.allowedPaymentMethods !== undefined
    ? (Array.isArray(reservationSettings.allowedPaymentMethods) ? reservationSettings.allowedPaymentMethods : [])
    : (isReservationCheckout ? ["ONLINE_CARD", "PAYPAL"] : undefined); // Only default if completely missing

  // Calculate payable amount for reservations (deposit) using only new items total
  const payableAmount = isReservationCheckout && depositPercentage !== undefined
    ? Math.max(0, Math.round((finalTotal * depositPercentage / 100) * 100) / 100)
    : finalTotal;
  
  const paymentRequired = isReservationCheckout 
    ? (payableAmount > 0.0001)
    : true;

  // Payment availability (delivery vs pickup)
  // Branch settings take precedence. If branch explicitly sets a payment method to false, it's disabled.
  // Only fall back to settings if branch value is null/undefined (not configured for that branch)
  // For PICKUP orders, use pickup payment settings; for DELIVERY, use delivery payment settings
  const acceptCash = isPickup
    ? (fullBranch?.pickupAcceptCash !== null && fullBranch?.pickupAcceptCash !== undefined 
        ? fullBranch.pickupAcceptCash 
        : (settings?.pickupAcceptCash ?? true))
    : (fullBranch?.acceptCash !== null && fullBranch?.acceptCash !== undefined 
        ? fullBranch.acceptCash 
        : (settings?.acceptCash ?? true));
  
  // For PICKUP: Show card/online payment if EITHER pickupAcceptCard OR pickupAcceptOnlinePayment is enabled
  // For DELIVERY: Use acceptOnlinePayment
  const acceptOnlinePayment = isPickup
    ? (() => {
        const pickupCard = fullBranch?.pickupAcceptCard !== null && fullBranch?.pickupAcceptCard !== undefined 
          ? fullBranch.pickupAcceptCard 
          : (settings?.pickupAcceptCard ?? true);
        const pickupOnline = fullBranch?.pickupAcceptOnlinePayment !== null && fullBranch?.pickupAcceptOnlinePayment !== undefined 
          ? fullBranch.pickupAcceptOnlinePayment 
          : (settings?.pickupAcceptOnlinePayment ?? true);
        // Show if either card or online payment is enabled for pickup
        return pickupCard || pickupOnline;
      })()
    : (fullBranch?.acceptOnlinePayment !== null && fullBranch?.acceptOnlinePayment !== undefined 
        ? fullBranch.acceptOnlinePayment 
        : (settings?.acceptOnlinePayment ?? true));
  
  const acceptPayPal = isPickup
    ? (() => {
        if ((branchForCalc as any)?.pickupAcceptPayPal !== null && (branchForCalc as any)?.pickupAcceptPayPal !== undefined) {
          return (branchForCalc as any).pickupAcceptPayPal;
        }
        if (fullBranch?.pickupAcceptPayPal !== null && fullBranch?.pickupAcceptPayPal !== undefined) {
          return fullBranch.pickupAcceptPayPal;
        }
        return settings?.pickupAcceptPayPal ?? false;
      })()
    : ((branchForCalc as any)?.acceptPayPal !== null && (branchForCalc as any)?.acceptPayPal !== undefined
        ? (branchForCalc as any).acceptPayPal
        : (settings?.acceptPayPal ?? false));

  // For reservations: Payment methods are allowed if they're in the reservation settings allowedPaymentMethods
  // AND the corresponding branch/global payment gateway is enabled
  const cardAllowed = isReservationCheckout
    ? (allowedPaymentMethods?.includes("ONLINE_CARD") && acceptOnlinePayment)
    : acceptOnlinePayment;
  const paypalAllowed = isReservationCheckout
    ? (allowedPaymentMethods?.includes("PAYPAL") && acceptPayPal)
    : (!isReservationCheckout && acceptPayPal);

  const isCardAvailable = isReservationCheckout ? cardAllowed : acceptOnlinePayment;
  const isCodAvailable = !isReservationCheckout && acceptCash;
  const isPayPalAvailable = isReservationCheckout ? paypalAllowed : (!isReservationCheckout && acceptPayPal);

  useEffect(() => {
    if (isReservationCheckout) {
      if (isPaymentMethodLocked && lockedPaymentProvider) {
        setPaymentMethod(lockedPaymentProvider === "PAYPAL" ? "paypal" : "card");
        return;
      }
      // For reservations, choose default payment method based on allowed options
      if (!paymentRequired) {
        setPaymentMethod("card");
        return;
      }
      
      // Determine which method should be active based on what's allowed
      if (cardAllowed && !paypalAllowed) {
        // Only card is allowed - force card
        setPaymentMethod("card");
      } else if (paypalAllowed && !cardAllowed) {
        // Only PayPal is allowed - force PayPal
        setPaymentMethod("paypal");
      } else if (cardAllowed && paypalAllowed) {
        // Both allowed - keep current selection if valid, otherwise default to card
        if (paymentMethod !== "card" && paymentMethod !== "paypal") {
          setPaymentMethod("card");
        }
        // If current method is not allowed, switch to the other
        if (paymentMethod === "paypal" && !paypalAllowed) {
          setPaymentMethod("card");
        } else if (paymentMethod === "card" && !cardAllowed) {
          setPaymentMethod("paypal");
        }
      } else {
        // Neither is allowed - set to card as fallback (will show error message)
        setPaymentMethod("card");
      }
      return;
    }
    const isCurrentAllowed =
      (paymentMethod === "card" && acceptOnlinePayment) ||
      (paymentMethod === "paypal" && acceptPayPal) ||
      (paymentMethod === "cod" && acceptCash);

    // Only set a default when the current selection is invalid.
    // Otherwise user selections get overridden (e.g. snapping back to card).
    if (isCurrentAllowed) return;

    if (acceptOnlinePayment) {
      setPaymentMethod("card");
    } else if (acceptPayPal) {
      setPaymentMethod("paypal");
    } else if (acceptCash) {
      setPaymentMethod("cod");
    }
  }, [isPickup, acceptCash, acceptOnlinePayment, acceptPayPal, isReservationCheckout, cardAllowed, paypalAllowed, paymentRequired, paymentMethod, isPaymentMethodLocked, lockedPaymentProvider]);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ visible: true, message, type });
  };

  const handleCancelReservation = async () => {
    clearCart();
    await AsyncStorage.removeItem("pendingReservation");
    await AsyncStorage.removeItem("modifyingReservationId");
    router.replace("/(tabs)/menu?reservation=pre-order");
    showToast(
      t("reservations.checkout.cancelReservation") || "Reservation cancelled",
      "info"
    );
  };

  const handleAddressChange = (address: DetailedAddress) => {
    const keepIfEmpty = (next: string | undefined, prev: string) =>
      next === undefined || next === null || next.trim() === "" ? prev : next;

    setDetailedAddress((prev) => ({
      ...prev,
      ...address,
      fullAddress: address.fullAddress || "",
      streetAddress: keepIfEmpty(address.streetAddress, (prev as any).streetAddress || ""),
      postalCode: keepIfEmpty(address.postalCode, (prev as any).postalCode || ""),
      addressType: (address.addressType || (prev as any).addressType || "HOUSE") as any,
      houseNumber: keepIfEmpty(address.houseNumber, (prev as any).houseNumber || ""),
      building: keepIfEmpty(address.building, prev.building || ""),
      floor: keepIfEmpty(address.floor, prev.floor || ""),
      apartment: keepIfEmpty(address.apartment, prev.apartment || ""),
      extraDetails: keepIfEmpty(address.extraDetails, prev.extraDetails || ""),
    }));

    setDeliveryInfo((prev) => ({
      ...prev,
      address: address.fullAddress || "",
      streetAddress: keepIfEmpty(address.streetAddress, (prev as any).streetAddress || ""),
      postalCode: keepIfEmpty(address.postalCode, (prev as any).postalCode || ""),
      addressType: (address.addressType || (prev as any).addressType || "HOUSE") as any,
      houseNumber: keepIfEmpty(address.houseNumber, (prev as any).houseNumber || ""),
      building: keepIfEmpty(address.building, prev.building),
      floor: keepIfEmpty(address.floor, prev.floor),
      apartment: keepIfEmpty(address.apartment, prev.apartment),
      extraDetails: keepIfEmpty(address.extraDetails, prev.extraDetails),
    }));
  };

  const handleDistanceCalculated = (distance: number | null) => {
    setDeliveryDistance(distance);

    // Show distance toast like React frontend when user selects an address.
    // Guard against repeated toasts from intermediate re-calculations.
    if (!distance || isPickup || isReservationCheckout) {
      lastDistanceToastRef.current = null;
      return;
    }

    const rounded = Math.round(distance * 10) / 10;
    const last = lastDistanceToastRef.current;
    if (last !== null && Math.abs(last - rounded) < 0.01) {
      return;
    }

    lastDistanceToastRef.current = rounded;
    showToast(
      t("checkout.step1.addressSelector.distanceToast", {
        distance: rounded,
        defaultValue: `Distance: ${rounded} km`,
      }),
      "info"
    );
  };

  const handleMergeOrder = () => {
    if (activeOrder) {
      setMergeWithOrderId(activeOrder.id);
      setHasDismissedMergePrompt(true);
      setDeliveryInfo((prev) => ({
        ...prev,
        address: activeOrder.deliveryAddress || prev.address || "",
        building: activeOrder.deliveryBuilding || prev.building || "",
        floor: activeOrder.deliveryFloor || prev.floor || "",
        apartment: activeOrder.deliveryApartment || prev.apartment || "",
        phone: activeOrder.deliveryPhone || prev.phone || "",
        notes: activeOrder.deliveryNotes || prev.notes || "",
      }));
      setPickupInfo((prev) => ({
        ...prev,
        phone: activeOrder.pickupPhone || prev.phone || "",
        notes: activeOrder.pickupNotes || prev.notes || "",
      }));
      setDetailedAddress({
        fullAddress: activeOrder.deliveryAddress || "",
        building: activeOrder.deliveryBuilding,
        floor: activeOrder.deliveryFloor,
        apartment: activeOrder.deliveryApartment,
        extraDetails: activeOrder.deliveryExtraDetails,
      });
      // Set payment method from previous order
      if (activeOrder.paymentMethod) {
        // Map backend payment method to frontend payment method
        if (activeOrder.paymentMethod === "ONLINE_PAYMENT") {
          setPaymentMethod("card");
        } else {
          // CASH_ON_DELIVERY or CARD_ON_DELIVERY -> cod
          setPaymentMethod("cod");
        }
      }
      // Skip delivery availability check and go directly to step 2
      setShowDeliveryAvailability(false);
      setShowDeliveryAddress(true);
      setAvailabilityConfirmed(true);
      setShowMergeDialog(false);
      setCurrentStep(2);
    }
  };

  const handleDontMerge = () => {
    setMergeWithOrderId(undefined);
    setHasDismissedMergePrompt(true);
    setShowMergeDialog(false);
  };

  const validateStep1 = (): boolean => {
    if (isPickup) {
      if (!branchIdForPricing) {
        showToast(
          t("checkout.pickup.selectBranch", "Please select a branch for pickup"),
          "error"
        );
        return false;
      }
      if (!pickupInfo.phone) {
        showToast(t("checkout.pickup.phoneRequired", "Phone number is required for pickup orders"), "error");
        return false;
      }
      const digitsOnly = pickupInfo.phone.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        showToast(
          t("checkout.step1.addressSelector.invalidPhoneNumber") ||
            "Please enter a valid phone number",
          "error"
        );
        return false;
      }
      return true;
    } else {
      const addrType = (deliveryInfo as any).addressType as "HOUSE" | "BUILDING" | undefined;
      const needsHouse = (addrType || "HOUSE") === "HOUSE";
      const needsBuilding = (addrType || "HOUSE") === "BUILDING";

      if (
        !deliveryInfo.address ||
        !(deliveryInfo as any).postalCode ||
        !(deliveryInfo as any).streetAddress ||
        (needsHouse && !(deliveryInfo as any).houseNumber) ||
        (needsBuilding && !deliveryInfo.building) ||
        !deliveryInfo.phone
      ) {
        showToast(t("checkout.step1.fillRequiredFields"), "error");
        return false;
      }
      return true;
    }
  };

  // Validate cart items against daily deliverable limits
  const validateCartLimits = async (): Promise<boolean> => {
    // Skip validation for reservation checkouts (they use different date)
    if (isReservationCheckout) {
      return true;
    }

    if (!branchIdForPricing || items.length === 0) {
      return true;
    }

    try {
      // Build cart items for validation
      const itemsForValidation: CartItemForValidation[] = items
        .filter((item) => item.itemType !== "DEAL" && !!item.mealId)
        .map((item) => {
        const mealId = item.mealId as string;
        // Get the meal to find the size type
        const meal = meals.find((m) => m.id === item.mealId);
        const mealSize = meal?.mealSizes?.find((s: any) => s.name === item.sizeName || s.id === item.sizeId);
        
        return {
          mealId,
          mealSizeType: mealSize?.sizeType || null,
          quantity: item.quantity,
        };
      });

      if (itemsForValidation.length === 0) {
        return true;
      }

      const result = await deliverableQuantityService.validateCart(
        branchIdForPricing,
        itemsForValidation
      );

      if (!result.valid) {
        // Show error toast for each validation error
        result.errors.forEach((error) => {
          showToast(error, "error");
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error validating cart limits:", error);
      // Don't block checkout on validation errors - backend will validate too
      return true;
    }
  };

  const handleNextStep = () => {
    if (validateStep1()) {
      setHasDismissedMergePrompt(true);
      setCurrentStep(2);
    }
  };

  const handlePreviousStep = () => {
    setCurrentStep(1);
  };

  // Scroll to top when step changes
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: 0,
        animated: true,
      });
    }
  }, [currentStep]);

  const getServingHoursMessage = (status: ServingHoursStatus): string => {
    if (status.isOff) {
      if (status.nextOpenDay && status.nextOpenTimeString) {
        return t("home.servingHours.closedTodayNextDay", {
          day: status.nextOpenDay,
          time: status.nextOpenTimeString,
        });
      }
      return t("home.servingHours.closedToday");
    }
    
    if (status.hoursUntilOpen !== undefined && status.minutesUntilOpen !== undefined) {
      let message = "";
      if (status.hoursUntilOpen > 0) {
        message = t("home.servingHours.willOpenIn", {
          hours: status.hoursUntilOpen,
          minutes: status.minutesUntilOpen || 0,
        });
      } else {
        message = t("home.servingHours.willOpenSoon", {
          minutes: status.minutesUntilOpen,
        });
      }
      if (status.nextOpenTimeString) {
        message += ` ${t("home.servingHours.orderWillBeServed", {
          time: status.nextOpenTimeString,
        })}`;
      }
      return message;
    }
    
    return status.message || t("home.servingHours.closed");
  };

  // Helper function to handle reservation checkout (with or without payment)
  const handleReservationCheckout = async (paymentIntentId: string, token: string) => {
    if (!reservationData) {
      showToast("Reservation data is missing", "error");
      setIsSubmitting(false);
      return;
    }

    // Check if this is a modification scenario
    const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");

    // For modifying reservations, calculate combined total (existing + new items)
    let combinedTotal = finalTotal;
    if (modifyingReservationId && existingReservation) {
      const existingTotal = existingReservation.reservationOrder?.totalAmount 
        ? Number(existingReservation.reservationOrder.totalAmount) 
        : 0;
      combinedTotal = existingTotal + finalTotal;
    }
    
    // Check minimum order amount before proceeding (use combined total for modifications)
    if (preOrderMinAmount && totalToCheck < preOrderMinAmount) {
      showToast(
        `Minimum order amount is ${formatPrice(preOrderMinAmount, currency)}. Current total: ${formatPrice(totalToCheck, currency)}`,
        "error"
      );
      setIsSubmitting(false);
      return;
    }

    // Prepare order items for reservation
    const orderItems = items
      .filter((item) => item.itemType !== "DEAL" && !!item.mealId)
      .map((item) => {
      const mealId = item.mealId as string;
      const meal = meals.find((m) => m.id === item.mealId);
      let mealSizeType: string | undefined = undefined;
      
      if (item.sizeName && meal) {
        const sizeName = item.sizeName;
        // Try exact match first
        let sizeObj = meal.mealSizes?.find((s) => s.name === sizeName);
        
        // If not found, try case-insensitive match
        if (!sizeObj) {
          sizeObj = meal.mealSizes?.find((s) => s.name.toLowerCase() === sizeName.toLowerCase());
        }
        
        // If still not found, try trimming whitespace
        if (!sizeObj) {
          sizeObj = meal.mealSizes?.find((s) => s.name.trim().toLowerCase() === sizeName.trim().toLowerCase());
        }
        
        if (sizeObj) {
          mealSizeType = sizeObj.sizeType;
        }
      }
      
      return {
        mealId,
        mealSizeType: mealSizeType || "M",
        quantity: item.quantity,
        addons: (item.addOns || []).map((addon) => {
          // Find addon details from loaded addons
          const addonData = addons.find((a) => a.id === addon.id);
          return {
            addonId: addon.id,
            name: addon.name || addonData?.name || "",
            quantity: addon.quantity || 1,
            price: addon.price,
            type: addonData?.type || "BOOLEAN",
            sizeType: addonData?.sizeType,
          };
        }),
        optionalIngredients: item.optionalIngredients || [],
        specialInstructions: item.specialInstructions || undefined,
      };
    });

    // Use the modifyingReservationId already retrieved above
    if (modifyingReservationId && existingReservation) {
      // Merge existing items with new items (like React frontend)
      const existingItems = existingReservation.reservationOrder?.items || [];
      const existingOrderItems = existingItems.map((item: any) => {
        const itemQuantity = item.quantity || 1;
        return {
          mealId: item.mealId,
          mealSizeType: item.mealSizeType || "M",
          quantity: itemQuantity,
          addons: (item.addons || []).map((addon: any) => {
            // The stored addon quantity is total (per-item × item quantity)
            // We need to convert it back to per-item quantity
            const storedAddonQuantity = addon.quantity || 1;
            const perItemAddonQuantity = Math.max(1, Math.round(storedAddonQuantity / itemQuantity));
            
            return {
              addonId: addon.addon_id || addon.addonId,
              name: addon.addOnName || addon.name,
              quantity: perItemAddonQuantity, // Per-item quantity
              price: Number(addon.addOnPrice || addon.price || 0),
              type: addon.addon_type || addon.type || "BOOLEAN",
              sizeType: addon.addonSizeType || addon.sizeType,
            };
          }),
          optionalIngredients: (item.optionalIngredients || []).map((ing: any) => ({
            id: ing.optionalIngredientId || ing.id,
            name: ing.ingredientName || ing.name,
            isIncluded: ing.isIncluded,
          })),
          specialInstructions: item.specialInstructions,
        };
      });

      // Combine existing and new items
      const allOrderItems = [...existingOrderItems, ...orderItems];

      // Modify the reservation with combined items and payment intent (if provided)
      await reservationService.modifyReservation(
        modifyingReservationId,
        {
          orderItems: allOrderItems, // Combined existing + new items
          ...(paymentIntentId && { paymentIntentId }), // Only include if payment was made
          ...(appliedVoucher?.voucherCode && { appliedVoucherCode: appliedVoucher.voucherCode }), // Include voucher code if applied
        },
        token
      );
      
      // Clear cart and modification data
      clearCart();
      await AsyncStorage.removeItem("modifyingReservationId");
      await AsyncStorage.removeItem("modifyingReservationBranchId");
      await AsyncStorage.removeItem("modifyingOrderId");
      await AsyncStorage.removeItem("modifyingOrderBranchId");
      await AsyncStorage.removeItem("pendingReservation");
      await AsyncStorage.removeItem("fromCheckout");
      
      showToast(
        paymentIntentId 
          ? "Reservation modified successfully! Payment confirmed." 
          : "Reservation modified successfully!",
        "success"
      );
      setTimeout(() => {
        router.push("/my-reservations");
      }, 1500);
      return;
    } else {
      // Create new pre-order reservation
      await reservationService.createPreOrderReservation(
        {
          reservationDate: reservationData.date,
          time: reservationData.time,
          numberOfGuests: reservationData.numberOfGuests,
          customerName: reservationData.customerName,
          customerEmail: reservationData.customerEmail,
          customerPhone: reservationData.customerPhone,
          specialRequests: reservationSpecialRequests || reservationData.specialRequests || undefined,
          preferredZone: reservationData.preferredZone || undefined,
          branchId: reservationData.branchId || undefined,
          zoneId: reservationData.zoneId || undefined,
          ...(reservationData.tableIds && reservationData.tableIds.length > 0 && { tableIds: reservationData.tableIds }),
          orderItems,
          ...(paymentIntentId && { paymentIntentId }), // Only include if payment was made
          ...(appliedVoucher?.voucherCode && { appliedVoucherCode: appliedVoucher.voucherCode }), // Include voucher code if applied
        },
        token
      );

      // Clear cart and reservation data
      clearCart();
      await AsyncStorage.removeItem("pendingReservation");
      await AsyncStorage.removeItem("fromCheckout");
      await AsyncStorage.removeItem("preOrderBranchLock");
      
      showToast(
        paymentIntentId 
          ? "Reservation created successfully! Payment confirmed." 
          : "Reservation created successfully!",
        "success"
      );
      setTimeout(() => {
        router.push("/my-reservations");
      }, 1500);
      return;
    }
  };

  const handlePlaceOrder = async () => {
    // For reservations, skip delivery validation and serving hours check
    if (!isReservationCheckout) {
      // Check serving hours - only block if not allowed
      if (servingHoursStatus && !servingHoursStatus.isOpen && !allowOrdersOutsideHours) {
        showToast(getServingHoursMessage(servingHoursStatus), "error");
        return;
      }

      // Validate required fields based on order type
      if (isPickup) {
        // For pickup orders, only validate phone number
        if (!pickupInfo.phone) {
          showToast(t("checkout.pickup.phoneRequired", "Phone number is required for pickup orders"), "error");
          return;
        }
        
        // Validate phone number format
        const digitsOnly = pickupInfo.phone.replace(/\D/g, "");
        if (digitsOnly.length < 7 || digitsOnly.length > 15) {
          showToast(
            t("checkout.step1.addressSelector.invalidPhoneNumber", "Please enter a valid phone number"),
            "error"
          );
          return;
        }
      } else {
        // For delivery orders, validate address and phone
        if (!deliveryInfo.address) {
          showToast("Please select or enter a delivery address", "error");
          return;
        }

        if (!deliveryInfo.phone) {
          showToast("Please enter your phone number", "error");
          return;
        }
        
        // Validate phone number format
        const digitsOnly = deliveryInfo.phone.replace(/\D/g, "");
        if (digitsOnly.length < 7 || digitsOnly.length > 15) {
          showToast(
            t("checkout.step1.addressSelector.invalidPhoneNumber", "Please enter a valid phone number"),
            "error"
          );
          return;
        }
      }
    }
    
    // Check minimum order for reservations (use combined total for modifications)
    if (isReservationCheckout && !isMinimumOrderMet && preOrderMinAmount) {
      showToast(
        `Minimum order amount is ${formatPrice(preOrderMinAmount, currency)}. Current total: ${formatPrice(totalToCheck, currency)}`,
        "error"
      );
      return;
    }

    // Handle reservations
    if (isReservationCheckout) {
      // If payment is not required (0% deposit), handle directly without payment
      if (!paymentRequired) {
        setIsSubmitting(true);
        try {
          const token = await getToken();
          if (!token) {
            showToast("Error: Authentication required", "error");
            setIsSubmitting(false);
            return;
          }
          await handleReservationCheckout("", token);
        } catch (error) {
          showToast(
            `Failed: ${error instanceof Error ? error.message : "Please try again"}`,
            "error"
          );
          setIsSubmitting(false);
        }
        return;
      }
      
      // Payment is required - check which method is selected and allowed
      if (paymentMethod === "card" && cardAllowed) {
        handleCardPayment();
      } else if (paymentMethod === "paypal" && paypalAllowed) {
        // PayPal payment is handled by the PayPalPayment component's onSuccess callback
        showToast("Please use the PayPal button to complete payment", "info");
      } else {
        // No valid payment method selected or allowed
        showToast("Please select a valid payment method", "error");
      }
      return;
    } else if (paymentMethod === "cod") {
      handleCODPayment();
    } else if (paymentMethod === "paypal") {
      // PayPal payment is handled by the PayPalPayment component's onSuccess callback
      // This should not be called directly - the PayPal button in the component handles it
      showToast("Please use the PayPal button to complete payment", "info");
    } else {
      handleCardPayment();
    }
  };

  const handleCardPayment = async () => {
    if (!isSignedIn) {
      showToast("Authentication required. Please login to continue.", "error");
      return;
    }

    if (!cardDetails?.complete) {
      showToast("Please enter complete card details", "error");
      return;
    }

    // Validate cart limits before proceeding (skip for reservations)
    const cartValid = await validateCartLimits();
    if (!cartValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (!token) {
        showToast("Error: Authentication required", "error");
        setIsSubmitting(false);
        return;
      }

      // Create payment intent with backend
      const response = await fetch(
        `${API_BASE_URL}/api/payment/create-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
            body: JSON.stringify({
              amount: isReservationCheckout ? payableAmount : remainingTotal, // Use payableAmount for reservations (deposit), remainingTotal for regular orders
              currency: currency.toLowerCase(), // Use branch currency (or settings fallback), convert to lowercase
              paymentMethodType: "card", // Explicitly request card payment for mobile CardField
            metadata: isReservationCheckout ? {
              reservationType: "PRE_ORDER",
              reservationDate: reservationData?.date,
              reservationTime: reservationData?.time,
              appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
            } : {
              orderType,
              deliveryAddress: isPickup ? undefined : deliveryInfo.address,
              deliveryPhone: isPickup ? undefined : deliveryInfo.phone,
              deliveryNotes: isPickup ? undefined : deliveryInfo.notes,
              pickupPhone: isPickup ? pickupInfo.phone : undefined,
              pickupNotes: isPickup ? pickupInfo.notes : undefined,
              appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
            },
          }),
        }
      );

      const paymentIntentData = await response.json();

      if (!paymentIntentData.success || !paymentIntentData.data?.clientSecret) {
        throw new Error("Failed to create payment intent");
      }

      // For CardField, we need to create a payment method first, then confirm
      // The confirmPayment hook is for PaymentSheet, not CardField
      if (!stripe) {
        throw new Error("Stripe is not initialized");
      }

      // Create payment method from CardField
      const { error: pmError, paymentMethod } =
        await stripe.createPaymentMethod({
          paymentMethodType: "Card",
        });

      if (pmError || !paymentMethod) {
        showToast(
          `Payment failed: ${
            pmError?.message ||
            "Failed to create payment method. Please check your card details."
          }`,
          "error"
        );
        setIsSubmitting(false);
        return;
      }

      const updateResponse = await fetch(
        `${API_BASE_URL}/api/payment/update-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntentData.data.paymentIntentId,
            paymentMethodId: paymentMethod.id,
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        showToast(
          `Payment failed: ${
            errorData.error || "Failed to attach payment method"
          }`,
          "error"
        );
        setIsSubmitting(false);
        return;
      }

      const updateResult = await updateResponse.json();

      if (!updateResult.success) {
        showToast(
          `Payment failed: ${
            updateResult.error || "Failed to confirm payment"
          }`,
          "error"
        );
        setIsSubmitting(false);
        return;
      }

      // Verify payment status
      if (updateResult.data.status !== "succeeded") {
        showToast(
          `Payment status: ${updateResult.data.status}. Please check your payment.`,
          "error"
        );
        setIsSubmitting(false);
        return;
      }

      const paymentIntentId = updateResult.data.paymentIntentId;
      
      // Handle reservation checkout differently
      if (isReservationCheckout && reservationData) {
        // Check if this is a modification scenario
        const modifyingReservationId = await AsyncStorage.getItem("modifyingReservationId");
        
        // For modifying reservations, calculate combined total (existing + new items)
        let combinedTotal = finalTotal;
        if (modifyingReservationId && existingReservation) {
          const existingTotal = existingReservation.reservationOrder?.totalAmount 
            ? Number(existingReservation.reservationOrder.totalAmount) 
            : 0;
          combinedTotal = existingTotal + finalTotal;
        }
        
        // Check minimum order amount before proceeding (use combined total for modifications)
        // Note: totalToCheck is already calculated above using useMemo, so we can use it directly
        if (preOrderMinAmount && totalToCheck < preOrderMinAmount) {
          showToast(
            `Minimum order amount is ${formatPrice(preOrderMinAmount, currency)}. Current total: ${formatPrice(totalToCheck, currency)}`,
            "error"
          );
          setIsSubmitting(false);
          return;
        }

        // Prepare order items for reservation
        const orderItems = items
          .filter((item) => item.itemType !== "DEAL" && !!item.mealId)
          .map((item) => {
          const mealId = item.mealId as string;
          const meal = meals.find((m) => m.id === item.mealId);
          let mealSizeType: string | undefined = undefined;
          
          if (item.sizeName && meal) {
            const sizeName = item.sizeName;
            // Try exact match first
            let sizeObj = meal.mealSizes?.find((s) => s.name === sizeName);
            
            // If not found, try case-insensitive match
            if (!sizeObj) {
              sizeObj = meal.mealSizes?.find((s) => s.name.toLowerCase() === sizeName.toLowerCase());
            }
            
            // If still not found, try trimming whitespace
            if (!sizeObj) {
              sizeObj = meal.mealSizes?.find((s) => s.name.trim().toLowerCase() === sizeName.trim().toLowerCase());
            }
            
            if (sizeObj) {
              mealSizeType = sizeObj.sizeType;
            }
          }
          
          return {
            mealId,
            mealSizeType: mealSizeType || "M",
            quantity: item.quantity,
            addons: (item.addOns || []).map((addon) => {
              // Find addon details from loaded addons
              const addonData = addons.find((a) => a.id === addon.id);
              return {
                addonId: addon.id,
                name: addon.name || addonData?.name || "",
                quantity: addon.quantity || 1,
                price: addon.price,
                type: addonData?.type || "BOOLEAN",
                sizeType: addonData?.sizeType,
              };
            }),
            optionalIngredients: item.optionalIngredients || [],
            specialInstructions: item.specialInstructions || undefined,
          };
        });

        // Use the modifyingReservationId already retrieved above
        if (modifyingReservationId && existingReservation) {
          // Merge existing items with new items (like React frontend)
          const existingItems = existingReservation.reservationOrder?.items || [];
          const existingOrderItems = existingItems.map((item: any) => {
            const itemQuantity = item.quantity || 1;
            return {
              mealId: item.mealId,
              mealSizeType: item.mealSizeType || "M",
              quantity: itemQuantity,
              addons: (item.addons || []).map((addon: any) => {
                // The stored addon quantity is total (per-item × item quantity)
                // We need to convert it back to per-item quantity
                const storedAddonQuantity = addon.quantity || 1;
                const perItemAddonQuantity = Math.max(1, Math.round(storedAddonQuantity / itemQuantity));
                
                return {
                  addonId: addon.addon_id || addon.addonId,
                  name: addon.addOnName || addon.name,
                  quantity: perItemAddonQuantity, // Per-item quantity
                  price: Number(addon.addOnPrice || addon.price || 0),
                  type: addon.addon_type || addon.type || "BOOLEAN",
                  sizeType: addon.addonSizeType || addon.sizeType,
                };
              }),
              optionalIngredients: (item.optionalIngredients || []).map((ing: any) => ({
                id: ing.optionalIngredientId || ing.id,
                name: ing.ingredientName || ing.name,
                isIncluded: ing.isIncluded,
              })),
              specialInstructions: item.specialInstructions,
            };
          });

          // Combine existing and new items
          const allOrderItems = [...existingOrderItems, ...orderItems];

          // Modify the reservation with combined items and payment intent
          await reservationService.modifyReservation(
            modifyingReservationId,
            {
              orderItems: allOrderItems, // Combined existing + new items
              paymentIntentId, // Pass the payment intent for new items
            },
            token
          );
          
          // Clear cart and modification data
          clearCart();
          await useCheckoutDraftStore.getState().clearDraft();
          await AsyncStorage.removeItem("modifyingReservationId");
          await AsyncStorage.removeItem("modifyingReservationBranchId");
          await AsyncStorage.removeItem("modifyingOrderId");
          await AsyncStorage.removeItem("modifyingOrderBranchId");
          await AsyncStorage.removeItem("pendingReservation");
          await AsyncStorage.removeItem("fromCheckout");
          
          showToast("Reservation modified successfully! Payment confirmed.", "success");
          setTimeout(() => {
            router.push("/my-reservations");
          }, 1500);
          return;
        } else {
          // Create new pre-order reservation
          await reservationService.createPreOrderReservation(
            {
              reservationDate: reservationData.date,
              time: reservationData.time,
              numberOfGuests: reservationData.numberOfGuests,
              customerName: reservationData.customerName,
              customerEmail: reservationData.customerEmail,
              customerPhone: reservationData.customerPhone,
              specialRequests: reservationSpecialRequests || reservationData.specialRequests || undefined,
              preferredZone: reservationData.preferredZone || undefined,
              branchId: reservationData.branchId || undefined,
              zoneId: reservationData.zoneId || undefined,
              ...(reservationData.tableIds && reservationData.tableIds.length > 0 && { tableIds: reservationData.tableIds }),
              orderItems,
              paymentIntentId,
            },
            token
          );

          // Clear cart and reservation data
          clearCart();
          await useCheckoutDraftStore.getState().clearDraft();
          await AsyncStorage.removeItem("pendingReservation");
          await AsyncStorage.removeItem("fromCheckout");
          await AsyncStorage.removeItem("preOrderBranchLock");
          
          showToast("Reservation created successfully! Payment confirmed.", "success");
          setTimeout(() => {
            router.push("/my-reservations");
          }, 1500);
          return;
        }
      }

      // Regular order checkout
      // Transform cart items to match backend format
      // Use loaded meal data to find the exact size name that matches the database
      const cartItems = items.map((item) => {
        if (item.itemType === "DEAL" || !!item.dealId) {
          return {
            id: item.id,
            itemType: "DEAL",
            dealId: item.dealId,
            quantity: item.quantity,
            basePrice: item.basePrice,
            size: "DEAL",
            specialInstructions: item.specialInstructions || "",
            addOns: (item.addOns || []).map((addOn) => ({
              id: addOn.id,
              name: addOn.name,
              price: addOn.price,
              quantity: addOn.quantity || 1,
            })),
            optionalIngredients: item.optionalIngredients || [],
          };
        }
        const meal = meals.find((m) => m.id === item.mealId);
        let exactSizeName = item.sizeName || "";
        
        // Try to find the exact size name from the database to ensure it matches
        if (meal && item.sizeId) {
          const mealSize = meal.mealSizes?.find((s: any) => s.id === item.sizeId);
          if (mealSize) {
            exactSizeName = mealSize.name;
          } else if (item.sizeName && meal.mealSizes) {
            const sizeName = item.sizeName;
            // Fallback: try to match by name (case-insensitive, trimmed)
            const matchedSize = meal.mealSizes.find(
              (s: any) => s.name.trim().toLowerCase() === sizeName.trim().toLowerCase()
            );
            if (matchedSize) {
              exactSizeName = matchedSize.name;
            }
          }
        }
        
        return {
          id: item.id,
          mealId: item.mealId,
          quantity: item.quantity,
          basePrice: item.basePrice + item.sizePrice,
          size: exactSizeName,
          specialInstructions: item.specialInstructions || "",
          addOns: (item.addOns || []).map((addOn) => ({
            id: addOn.id,
            name: addOn.name,
            price: addOn.price,
            quantity: addOn.quantity || 1,
            sizeType: addOn.sizeType,
          })),
          optionalIngredients: item.optionalIngredients || [],
        };
      });

      const replacesOrderId = (await AsyncStorage.getItem("modifyingOrderId")) || undefined;

      const orderData: any = {
        orderType,
        deliveryAddress: isPickup ? undefined : deliveryInfo.address,
        deliveryStreetAddress: isPickup ? undefined : (deliveryInfo as any).streetAddress || undefined,
        deliveryHouseNumber: isPickup ? undefined : (deliveryInfo as any).houseNumber || undefined,
        deliveryPostalCode: isPickup ? undefined : (deliveryInfo as any).postalCode || undefined,
        deliveryBuilding: isPickup ? undefined : deliveryInfo.building || undefined,
        deliveryFloor: isPickup ? undefined : deliveryInfo.floor || undefined,
        deliveryApartment: isPickup ? undefined : deliveryInfo.apartment || undefined,
        deliveryExtraDetails: isPickup ? undefined : deliveryInfo.extraDetails || undefined,
        deliveryPhone: isPickup ? undefined : deliveryInfo.phone,
        deliveryNotes: isPickup ? undefined : deliveryInfo.notes,
        pickupPhone: isPickup ? pickupInfo.phone : undefined,
        pickupNotes: isPickup ? pickupInfo.notes : undefined,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        tax: totalTaxWithService,
        totalAmount: finalTotal,
        branchId: branchIdForPricing,
        scheduledDate: scheduledDate ? scheduledDate.toISOString() : undefined,
        replacesOrderId,
      };

      const confirmResponse = await fetch(
        `${API_BASE_URL}/api/payment/confirm-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntentId,
            orderData,
            cartItems: cartItems,
            mergeWithOrderId: mergeWithOrderId,
          }),
        }
      );

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(
          errorData.error || "Failed to confirm payment with server"
        );
      }

      const confirmResult = await confirmResponse.json();

      if (!confirmResult.success) {
        throw new Error(confirmResult.error || "Failed to create order");
      }

      clearCart();
      await useCheckoutDraftStore.getState().clearDraft();
      await AsyncStorage.removeItem("modifyingOrderId");
      await AsyncStorage.removeItem("modifyingOrderBranchId");
      showToast("Payment successful! Your order is confirmed.", "success");
      setTimeout(() => {
        router.push("/(tabs)/orders");
      }, 1500);
    } catch (error) {
      showToast(
        `Payment failed: ${
          error instanceof Error ? error.message : "Please try again"
        }`,
        "error"
      );
      setIsSubmitting(false);
    }
  };

  const handlePayPalPayment = async (paypalOrderId: string) => {
    if (!isSignedIn) {
      showToast("Authentication required. Please login to continue.", "error");
      return;
    }

    // Validate cart limits before proceeding (skip for reservations)
    const cartValid = await validateCartLimits();
    if (!cartValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (!token) {
        showToast("Error: Authentication required", "error");
        setIsSubmitting(false);
        return;
      }

      const paymentService = new PaymentService(apiService);

      const replacesOrderId = (await AsyncStorage.getItem("modifyingOrderId")) || undefined;

      // Transform cart items to match backend format
      const cartItems = items.map((item) => {
        if (item.itemType === "DEAL" || !!item.dealId) {
          return {
            id: item.id,
            itemType: "DEAL",
            dealId: item.dealId,
            quantity: item.quantity,
            basePrice: item.basePrice,
            size: "DEAL",
            specialInstructions: item.specialInstructions || "",
            addOns: (item.addOns || []).map((addOn) => ({
              id: addOn.id,
              name: addOn.name,
              price: addOn.price,
              quantity: addOn.quantity || 1,
            })),
            optionalIngredients: item.optionalIngredients || [],
          };
        }

        const meal = meals.find((m) => m.id === item.mealId);
        let exactSizeName = item.sizeName || "";
        
        if (meal && item.sizeId) {
          const mealSize = meal.mealSizes?.find((s: any) => s.id === item.sizeId);
          if (mealSize) {
            exactSizeName = mealSize.name;
          } else if (item.sizeName && meal.mealSizes) {
            const sizeName = item.sizeName;
            const matchedSize = meal.mealSizes.find(
              (s: any) => s.name.trim().toLowerCase() === sizeName.trim().toLowerCase()
            );
            if (matchedSize) {
              exactSizeName = matchedSize.name;
            }
          }
        }
        
        return {
          id: item.id,
          mealId: item.mealId,
          quantity: item.quantity,
          basePrice: item.basePrice + item.sizePrice,
          size: exactSizeName,
          specialInstructions: item.specialInstructions || "",
          addOns: (item.addOns || []).map((addOn) => ({
            id: addOn.id,
            name: addOn.name,
            price: addOn.price,
            quantity: addOn.quantity || 1,
            sizeType: addOn.sizeType,
          })),
          optionalIngredients: item.optionalIngredients || [],
        };
      });

      // Capture PayPal order
      const payPalOrderData: any = {
        orderType,
        deliveryAddress: isPickup ? undefined : deliveryInfo.address,
        deliveryStreetAddress: isPickup ? undefined : (deliveryInfo as any).streetAddress || undefined,
        deliveryHouseNumber: isPickup ? undefined : (deliveryInfo as any).houseNumber || undefined,
        deliveryPostalCode: isPickup ? undefined : (deliveryInfo as any).postalCode || undefined,
        deliveryBuilding: isPickup ? undefined : deliveryInfo.building || undefined,
        deliveryFloor: isPickup ? undefined : deliveryInfo.floor || undefined,
        deliveryApartment: isPickup ? undefined : deliveryInfo.apartment || undefined,
        deliveryExtraDetails: isPickup ? undefined : deliveryInfo.extraDetails || undefined,
        deliveryPhone: isPickup ? undefined : deliveryInfo.phone,
        deliveryNotes: isPickup ? undefined : deliveryInfo.notes,
        pickupPhone: isPickup ? pickupInfo.phone : undefined,
        pickupNotes: isPickup ? pickupInfo.notes : undefined,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        tax: totalTaxWithService,
        totalAmount: isReservationCheckout ? finalTotal : finalTotal,
        depositPercentage: isReservationCheckout ? depositPercentage : undefined,
        payableAmount: isReservationCheckout ? payableAmount : undefined,
        branchId: branchIdForPricing,
        scheduledDate: scheduledDate ? scheduledDate.toISOString() : undefined,
        replacesOrderId,
      };

      const captureResult = await paymentService.capturePayPalOrder(token, {
        orderId: paypalOrderId,
        orderData: payPalOrderData,
        cartItems: cartItems,
        mergeWithOrderId: mergeWithOrderId,
      });

      if (!captureResult.success) {
        throw new Error(captureResult.error || "Failed to capture PayPal payment");
      }

      clearCart();
      await AsyncStorage.removeItem("modifyingOrderId");
      await AsyncStorage.removeItem("modifyingOrderBranchId");
      
      // Handle reservation checkout differently
      if (isReservationCheckout) {
        await AsyncStorage.removeItem("pendingReservation");
        await AsyncStorage.removeItem("fromCheckout");
        await AsyncStorage.removeItem("preOrderBranchLock");
        await useCheckoutDraftStore.getState().clearDraft();
        showToast("Reservation created successfully! Payment confirmed.", "success");
        setTimeout(() => {
          router.push("/my-reservations");
        }, 1500);
      } else {
        await useCheckoutDraftStore.getState().clearDraft();
        showToast("Payment successful! Your order is confirmed.", "success");
        setTimeout(() => {
          router.push("/(tabs)/orders");
        }, 1500);
      }
    } catch (error) {
      showToast(
        `Payment failed: ${
          error instanceof Error ? error.message : "Please try again"
        }`,
        "error"
      );
      setIsSubmitting(false);
    }
  };

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    setIsValidatingVoucher(true);
    setVoucherError(null);
    try {
      const token = isSignedIn ? await getToken() : null;
      const baseUrl = await apiService.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/vouchers/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ voucherCode: voucherCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gutschein konnte nicht validiert werden");
      }
      
      const voucher = data.data;
      if (voucher.voucherType === "SINGLE_PURPOSE") {
        const lookupRate = Math.round(Number(voucher.vatRate || 0) * 100) / 100;
        let hasMatchingItem = false;
        
        if (taxBreakdown) {
          if (Array.isArray(taxBreakdown.itemBreakdown)) {
            hasMatchingItem = taxBreakdown.itemBreakdown.some(
              (item: any) => Math.round(Number(item.taxPercentage || 0) * 100) / 100 === lookupRate
            );
          }
          if (!hasMatchingItem && Array.isArray(taxBreakdown.addonBreakdown)) {
            hasMatchingItem = taxBreakdown.addonBreakdown.some(
              (addon: any) => Math.round(Number(addon.taxPercentage || 0) * 100) / 100 === lookupRate
            );
          }
          if (!hasMatchingItem && Array.isArray(taxBreakdown.dealComponentBreakdown)) {
            hasMatchingItem = taxBreakdown.dealComponentBreakdown.some(
              (comp: any) => Math.round(Number(comp.taxPercentage || 0) * 100) / 100 === lookupRate
            );
          }
        }
        
        if (!hasMatchingItem) {
          throw new Error(
            t("checkout.voucher.vatMismatch", {
              defaultValue: `Dieser Einzweck-Gutschein gilt nur für Artikel mit {{vatRate}}% MwSt., aber es befinden sich keine passenden Artikel im Warenkorb.`,
              vatRate: voucher.vatRate,
            })
          );
        }
      }
      
      setAppliedVoucher(voucher);
    } catch (err: any) {
      setVoucherError(err?.message || "Fehler beim Einlösen des Gutscheins");
      showToast(err?.message || "Fehler beim Einlösen des Gutscheins", "error");
    } finally {
      setIsValidatingVoucher(false);
    }
  };

  const handleVoucherOnlyCheckout = async () => {
    if (!appliedVoucher) return;
    setIsPlacingOrder(true);
    try {
      const token = isSignedIn ? await getToken() : null;
      const baseUrl = await apiService.getBaseUrl();
      const replacesOrderId = (await AsyncStorage.getItem("modifyingOrderId")) || undefined;
      
      const cartItemsMapped = items.map((item) => {
        const meal = meals.find((m) => m.id === item.mealId);
        let exactSizeName = item.sizeName || "";
        
        if (meal && item.sizeId) {
          const mealSize = meal.mealSizes?.find((s: any) => s.id === item.sizeId);
          if (mealSize) {
            exactSizeName = mealSize.name;
          }
        }
        
        return {
          id: item.id,
          mealId: item.mealId,
          quantity: item.quantity,
          basePrice: item.basePrice + item.sizePrice,
          size: exactSizeName,
          specialInstructions: item.specialInstructions || "",
          addOns: (item.addOns || []).map((addOn) => ({
            id: addOn.id,
            name: addOn.name,
            price: addOn.price,
            quantity: addOn.quantity || 1,
            sizeType: addOn.sizeType,
          })),
          optionalIngredients: item.optionalIngredients || [],
        };
      });

      const res = await fetch(`${baseUrl}/api/order/create-cod`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderType: isPickup ? "PICKUP" : "DELIVERY",
          deliveryAddress: isPickup ? undefined : detailedAddress.fullAddress,
          deliveryStreetAddress: isPickup ? undefined : deliveryInfo.streetAddress || undefined,
          deliveryHouseNumber: isPickup ? undefined : deliveryInfo.houseNumber || undefined,
          deliveryPostalCode: isPickup ? undefined : deliveryInfo.postalCode || undefined,
          deliveryBuilding: isPickup ? undefined : deliveryInfo.building || undefined,
          deliveryFloor: isPickup ? undefined : deliveryInfo.floor || undefined,
          deliveryApartment: isPickup ? undefined : deliveryInfo.apartment || undefined,
          deliveryExtraDetails: isPickup ? undefined : deliveryInfo.extraDetails || undefined,
          deliveryPhone: isPickup ? undefined : deliveryInfo.phone,
          deliveryNotes: isPickup ? undefined : deliveryInfo.notes,
          pickupPhone: isPickup ? pickupInfo.phone : undefined,
          pickupNotes: isPickup ? pickupInfo.notes : undefined,
          subtotal: subtotal,
          deliveryFee: isPickup ? 0 : deliveryFee,
          tax: totalTaxWithService,
          totalAmount: finalTotal,
          deliveryDistanceKm: isPickup ? undefined : deliveryDistance ?? undefined,
          cartItems: cartItemsMapped,
          branchId: branchIdForPricing,
          scheduledDate: scheduledDate?.toISOString() || undefined,
          replacesOrderId: replacesOrderId || undefined,
          appliedVoucherCode: appliedVoucher.voucherCode,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Bestellung fehlgeschlagen");
      }
      
      showToast(t("checkout.step2.orderPlacedSuccess") || "Bestellung erfolgreich aufgegeben!", "success");
      clearCart();
      await useCheckoutDraftStore.getState().clearDraft();
      setTimeout(() => {
        router.push("/(tabs)/orders");
      }, 1500);
    } catch (err: any) {
      showToast(err?.message || "Fehler beim Aufgeben der Bestellung", "error");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleCODPayment = async () => {
    if (!isSignedIn) {
      showToast("Authentication required. Please login to continue.", "error");
      return;
    }

    // Validate cart limits before proceeding (skip for reservations)
    const cartValid = await validateCartLimits();
    if (!cartValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (!token) {
        showToast("Error: Authentication required", "error");
        setIsSubmitting(false);
        return;
      }

      // Validate phone number before proceeding
      const phoneToUse = isPickup ? pickupInfo.phone : deliveryInfo.phone;
      if (!phoneToUse) {
        showToast("Please enter your phone number", "error");
        setIsSubmitting(false);
        return;
      }
      
      const digitsOnly = phoneToUse.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        showToast(
          t("checkout.step1.addressSelector.invalidPhoneNumber") ||
            "Please enter a valid phone number",
          "error"
        );
        setIsSubmitting(false);
        return;
      }

      // Create COD order
      const replacesOrderId = (await AsyncStorage.getItem("modifyingOrderId")) || undefined;
      // Transform cart items to match backend format
      // Use loaded meal data to find the exact size name that matches the database
      const cartItems = items.map((item) => {
        if (item.itemType === "DEAL" || !!item.dealId) {
          return {
            id: item.id,
            itemType: "DEAL",
            dealId: item.dealId,
            quantity: item.quantity,
            basePrice: item.basePrice,
            size: "DEAL",
            specialInstructions: item.specialInstructions || "",
            addOns: (item.addOns || []).map((addOn) => ({
              id: addOn.id,
              name: addOn.name,
              price: addOn.price,
              quantity: addOn.quantity || 1,
              sizeType: addOn.sizeType,
            })),
            optionalIngredients: item.optionalIngredients || [],
          };
        }

        const meal = meals.find((m) => m.id === item.mealId);
        let exactSizeName = item.sizeName || "";
        
        // Try to find the exact size name from the database to ensure it matches
        if (meal && item.sizeId) {
          const mealSize = meal.mealSizes?.find((s: any) => s.id === item.sizeId);
          if (mealSize) {
            exactSizeName = mealSize.name;
          } else if (item.sizeName && meal.mealSizes) {
            const sizeName = item.sizeName;
            // Fallback: try to match by name (case-insensitive, trimmed)
            const matchedSize = meal.mealSizes.find(
              (s: any) => s.name.trim().toLowerCase() === sizeName.trim().toLowerCase()
            );
            if (matchedSize) {
              exactSizeName = matchedSize.name;
            }
          }
        }
        
        return {
        id: item.id,
        mealId: item.mealId,
        quantity: item.quantity,
        basePrice: item.basePrice + item.sizePrice,
          size: exactSizeName,
        specialInstructions: item.specialInstructions || "",
          addOns: (item.addOns || []).map((addOn) => ({
            id: addOn.id,
            name: addOn.name,
            price: addOn.price,
            quantity: addOn.quantity || 1,
            sizeType: addOn.sizeType,
          })),
        optionalIngredients: item.optionalIngredients || [],
        };
      });

      const response = await fetch(`${API_BASE_URL}/api/order/create-cod`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderType,
          deliveryAddress: isPickup ? undefined : deliveryInfo.address,
          deliveryStreetAddress: isPickup ? undefined : (deliveryInfo as any).streetAddress || undefined,
          deliveryHouseNumber: isPickup ? undefined : (deliveryInfo as any).houseNumber || undefined,
          deliveryPostalCode: isPickup ? undefined : (deliveryInfo as any).postalCode || undefined,
          deliveryBuilding: isPickup ? undefined : deliveryInfo.building || undefined,
          deliveryFloor: isPickup ? undefined : deliveryInfo.floor || undefined,
          deliveryApartment: isPickup ? undefined : deliveryInfo.apartment || undefined,
          deliveryExtraDetails: isPickup ? undefined : deliveryInfo.extraDetails || undefined,
          deliveryPhone: isPickup ? undefined : deliveryInfo.phone,
          deliveryNotes: isPickup ? undefined : deliveryInfo.notes,
          pickupPhone: isPickup ? pickupInfo.phone : undefined,
          pickupNotes: isPickup ? pickupInfo.notes : undefined,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          tax: totalTaxWithService,
          totalAmount: finalTotal,
          cartItems: cartItems,
          mergeWithOrderId: mergeWithOrderId,
          branchId: branchIdForPricing,
          scheduledDate: scheduledDate ? scheduledDate.toISOString() : undefined,
          replacesOrderId,
          appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        clearCart();
        await useCheckoutDraftStore.getState().clearDraft();
        await AsyncStorage.removeItem("modifyingOrderId");
        await AsyncStorage.removeItem("modifyingOrderBranchId");
        showToast(
          "Order placed successfully! Pay with cash on delivery.",
          "success"
        );
        setTimeout(() => {
          router.push("/(tabs)/orders");
        }, 1500);
      } else {
        throw new Error(result.error || "Failed to create order");
      }
    } catch (error) {
      Alert.alert(
        "Order Failed",
        error instanceof Error ? error.message : "Please try again"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Block checkout access if outside hours and not allowed (only for regular orders)
  if (!isReservationCheckout && !servingHoursLoading && servingHoursStatus !== null && !servingHoursStatus.isOpen && !allowOrdersOutsideHours) {
    return (
      <View style={styles.container}>
        <AnimatedHeader
          title="Checkout"
          onBackPress={() => router.back()}
        />
        <View style={[styles.blockedContainer, { paddingTop: headerHeight + 24 }]}>
          <View style={styles.blockedCard}>
            <MaterialCommunityIcons name="alert" size={48} color="#ef4444" />
            <Text style={styles.blockedTitle}>
              {t("checkout.servingHours.checkoutBlockedTitle") || "Orders Currently Unavailable"}
            </Text>
            <Text style={styles.blockedMessage}>
              {getServingHoursMessage(servingHoursStatus)}
            </Text>
            <TouchableOpacity
              style={styles.blockedButton}
              onPress={() => router.push("/cart")}
            >
              <Text style={styles.blockedButtonText}>
                {t("checkout.servingHours.backToCart") || "Back to Cart"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      <AnimatedHeader
        title={isReservationCheckout 
          ? (t("reservations.checkout.title") || "Complete Reservation")
          : "Checkout"}
        onBackPress={() => {
          if (isReservationCheckout) {
            router.push("/(tabs)/menu?reservation=pre-order");
          } else if (currentStep === 1) {
            router.back();
          } else {
            handlePreviousStep();
          }
        }}
      />

      {/* Merge Order Dialog - Never show for reservations */}
      <Modal visible={showMergeDialog && !isReservationCheckout} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setHasDismissedMergePrompt(true);
            setShowMergeDialog(false);
          }}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("checkout.mergeOrder.title")}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setHasDismissedMergePrompt(true);
                  setShowMergeDialog(false);
                }}
              >
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              {t("checkout.mergeOrder.description", {
                orderNumber: activeOrder?.orderNumber || "",
              })
                .replace(/<bold>/g, "")
                .replace(/<\/bold>/g, "")}
            </Text>
            <View style={styles.modalBenefits}>
              <View style={styles.modalBenefitItem}>
                <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                <Text style={styles.modalBenefitText}>
                  {t("checkout.mergeOrder.benefit1")}
                </Text>
              </View>
              <View style={styles.modalBenefitItem}>
                <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                <Text style={styles.modalBenefitText}>
                  {t("checkout.mergeOrder.benefit2")}
                </Text>
              </View>
              <View style={styles.modalBenefitItem}>
                <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                <Text style={styles.modalBenefitText}>
                  {t("checkout.mergeOrder.benefit3")}
                </Text>
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={handleDontMerge}
              >
                <Text style={styles.modalButtonSecondaryText}>
                  {t("checkout.mergeOrder.createNewOrder")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={handleMergeOrder}
              >
                <Text style={styles.modalButtonPrimaryText}>
                  {t("checkout.mergeOrder.mergeOrders")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={90}
        enabled={true}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: headerHeight + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* Reservation Details Section (hidden for modification flows) */}
          {isReservationCheckout && reservationData && !existingReservation && (
            <View style={styles.reservationDetailsCard}>
              <View style={styles.reservationDetailsHeader}>
                <MaterialCommunityIcons name="calendar" size={20} color="#ec4899" />
                <Text style={styles.reservationDetailsTitle}>
                  {t("reservations.checkout.reservationDetails") || "Reservation Details"}
                </Text>
              </View>
              <View style={styles.reservationDetailsContent}>
                <View style={styles.reservationDetailRow}>
                  <MaterialCommunityIcons name="calendar" size={16} color="#9CA3AF" />
                  <View style={styles.reservationDetailText}>
                    <Text style={styles.reservationDetailLabel}>
                      {t("reservations.checkout.date") || "Date"}
                    </Text>
                    <Text style={styles.reservationDetailValue}>
                      {reservationData.date
                        ? new Date(`${reservationData.date}T${reservationData.time || "12:00"}`).toLocaleDateString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "Not set"}
                    </Text>
                  </View>
                </View>
                <View style={styles.reservationDetailRow}>
                  <MaterialCommunityIcons name="clock" size={16} color="#9CA3AF" />
                  <View style={styles.reservationDetailText}>
                    <Text style={styles.reservationDetailLabel}>
                      {t("reservations.checkout.time") || "Time"}
                    </Text>
                    <Text style={styles.reservationDetailValue}>
                      {reservationData.time || "Not set"}
                    </Text>
                  </View>
                </View>
                <View style={styles.reservationDetailRow}>
                  <MaterialCommunityIcons name="account-group" size={16} color="#9CA3AF" />
                  <View style={styles.reservationDetailText}>
                    <Text style={styles.reservationDetailLabel}>
                      {t("reservations.checkout.guests") || "Guests"}
                    </Text>
                    <Text style={styles.reservationDetailValue}>
                      {reservationData.numberOfGuests} {reservationData.numberOfGuests === 1 
                        ? (t("reservations.checkout.guest") || "guest")
                        : (t("reservations.checkout.guests") || "guests")}
                    </Text>
                  </View>
                </View>
                {reservationData.zoneName && (
                  <View style={styles.reservationDetailRow}>
                    <MaterialCommunityIcons name="map-marker" size={16} color="#9CA3AF" />
                    <View style={styles.reservationDetailText}>
                      <Text style={styles.reservationDetailLabel}>
                        {t("reservations.checkout.zone") || "Zone"}
                      </Text>
                      <Text style={styles.reservationDetailValue}>
                        {reservationData.zoneName}
                      </Text>
                    </View>
                  </View>
                )}
                {reservationData.tableNumbers && reservationData.tableNumbers.length > 0 && (
                  <View style={styles.reservationDetailRow}>
                    <MaterialCommunityIcons name="table-furniture" size={16} color="#9CA3AF" />
                    <View style={styles.reservationDetailText}>
                      <Text style={styles.reservationDetailLabel}>
                        {reservationData.tableNumbers.length === 1 
                          ? (t("reservations.checkout.table") || "Table")
                          : (t("reservations.checkout.tables") || "Tables")}
                      </Text>
                      <Text style={styles.reservationDetailValue}>
                        {reservationData.tableNumbers.length === 1
                          ? `${t("reservations.booking.table") || "Table"} ${reservationData.tableNumbers[0]}`
                          : reservationData.tableNumbers.join(", ")}
                      </Text>
                    </View>
                  </View>
                )}
                {reservationData.preferredZone && !reservationData.zoneName && (
                  <View style={styles.reservationDetailRow}>
                    <MaterialCommunityIcons name="map-marker" size={16} color="#9CA3AF" />
                    <View style={styles.reservationDetailText}>
                      <Text style={styles.reservationDetailLabel}>
                        {t("reservations.checkout.preferredZone") || "Preferred Zone"}
                      </Text>
                      <Text style={styles.reservationDetailValue}>
                        {reservationData.preferredZone}
                      </Text>
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.modifyReservationButton}
                  onPress={async () => {
                    // Save current reservation data
                    if (reservationData) {
                      await AsyncStorage.setItem("pendingReservation", JSON.stringify(reservationData));
                      await AsyncStorage.setItem("fromCheckout", "true");
                    }
                    router.push("/book-reservation");
                  }}
                >
                  <EditIcon size={16} color="#ec4899" />
                  <Text style={styles.modifyReservationButtonText}>
                    {t("reservations.checkout.modifyDetails") || "Modify Details"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {currentStep === 1 && !isReservationCheckout ? (
            <>
              {/* Order Type Selection */}
              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>
                  {t("checkout.orderType.label", "Order Type")}
                </Text>
                <View style={styles.orderTypeRow}>
                  {effectiveDeliveryEnabled && (
                    <TouchableOpacity
                      style={[
                        styles.orderTypeOption,
                        orderType === "DELIVERY" && styles.orderTypeOptionSelected,
                      ]}
                      onPress={() => setOrderType("DELIVERY")}
                    >
                      <Text
                        style={[
                          styles.orderTypeLabel,
                          orderType === "DELIVERY" && styles.orderTypeLabelSelected,
                        ]}
                      >
                        {t("checkout.orderType.delivery", "Delivery")}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {effectivePickupEnabled && (
                    <TouchableOpacity
                      style={[
                        styles.orderTypeOption,
                        orderType === "PICKUP" && styles.orderTypeOptionSelected,
                      ]}
                      onPress={() => setOrderType("PICKUP")}
                    >
                      <Text
                        style={[
                          styles.orderTypeLabel,
                          orderType === "PICKUP" && styles.orderTypeLabelSelected,
                        ]}
                      >
                        {t("checkout.orderType.pickup", "Pickup")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!effectiveDeliveryEnabled && !effectivePickupEnabled && (
                  <Text style={styles.helpText}>
                    {t("checkout.orderType.unavailable", "Ordering is currently unavailable")}
                  </Text>
                )}
              </View>

              {/* Scheduled Order Picker */}
              {(() => {
                const masterFutureOrdersEnabled =
                  (fullBranch as any)?.futureOrdersEnabled ?? settings?.futureOrdersEnabled ?? false;
                const perTypeFutureEnabled =
                  orderType === "PICKUP"
                    ? ((fullBranch as any)?.enableFuturePickupOrders ?? settings?.enableFuturePickupOrders ?? false)
                    : ((fullBranch as any)?.enableFutureDeliveryOrders ?? settings?.enableFutureDeliveryOrders ?? false);
                const isSchedulingAllowed = masterFutureOrdersEnabled && perTypeFutureEnabled;
                const futureOrderMaxDays =
                  orderType === "PICKUP"
                    ? ((fullBranch as any)?.futurePickupOrderDays ?? settings?.futurePickupOrderDays ?? 0)
                    : ((fullBranch as any)?.futureDeliveryOrderDays ?? settings?.futureDeliveryOrderDays ?? 0);
                const timeSlotIntervalMinutes =
                  (fullBranch as any)?.scheduledOrderTimeSlotInterval ??
                  settings?.scheduledOrderTimeSlotInterval ??
                  30;

                return isSchedulingAllowed ? (
                  <ScheduledOrderPicker
                    orderType={orderType}
                    isEnabled={isSchedulingAllowed}
                    maxDays={futureOrderMaxDays}
                    timeSlotIntervalMinutes={timeSlotIntervalMinutes}
                    scheduledDate={scheduledDate}
                    onScheduledDateChange={setScheduledDate}
                    branchId={branchIdForPricing}
                  />
                ) : null;
              })()}

              {isPickup ? (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>
                    {t("checkout.pickup.title", "Pickup Information")}
                  </Text>
                  <PickupLocationDisplay branch={fullBranch || null} />
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                      {t("checkout.pickup.phone", "Pickup Phone")}{" "}
                      <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        phoneError && styles.inputError,
                      ]}
                      placeholder={
                        t("checkout.step1.phonePlaceholder", {
                          defaultValue: "Enter your phone number",
                        }) || "Enter your phone number"
                      }
                      placeholderTextColor="#9BA1A6"
                      value={pickupInfo.phone}
                      onChangeText={(text) => {
                        const phoneRegex = /^[\d\s\-\(\)\+]*$/;
                        if (text === "" || phoneRegex.test(text)) {
                          setPickupInfo({ ...pickupInfo, phone: text });
                          const digitsOnly = text.replace(/\D/g, "");
                          if (digitsOnly.length < 7 || digitsOnly.length > 15) {
                            setPhoneError(
                              t("checkout.step1.addressSelector.invalidPhoneNumber") ||
                                "Please enter a valid phone number"
                            );
                          } else {
                            setPhoneError("");
                          }
                        }
                      }}
                      keyboardType="phone-pad"
                    />
                    {phoneError && (
                      <Text style={styles.errorText}>{phoneError}</Text>
                    )}
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                      {t("checkout.pickup.notes", "Pickup Notes")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder={
                        t("checkout.step1.specialInstructionsPlaceholder", {
                          defaultValue: "Any special delivery instructions?",
                        }) || "Any special delivery instructions?"
                      }
                      placeholderTextColor="#9BA1A6"
                      value={pickupInfo.notes}
                      onChangeText={(text) =>
                        setPickupInfo({ ...pickupInfo, notes: text })
                      }
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </View>
              ) : (
                <>
                  {/* Step 1: Delivery Information */}
                  {settings && showDeliveryAvailability && (
                    <DeliveryAvailabilityCheck
                      settings={settings}
                      onAvailabilityConfirmed={() => {
                        setAvailabilityConfirmed(true);
                        setShowDeliveryAvailability(false);
                        setShowDeliveryAddress(true);
                        if (checkoutDraft.hasHydrated) {
                          useCheckoutDraftStore
                            .getState()
                            .setDeliveryAvailabilityConfirmed(true);
                        }
                      }}
                    />
                  )}

                  {settings && showDeliveryAddress && (
                    <EnhancedAddressSelector
                      settings={settings}
                      selectedAddress={
                        detailedAddress.fullAddress || deliveryInfo.address
                      }
                      selectedStreetAddress={(deliveryInfo as any).streetAddress || (detailedAddress as any).streetAddress || ""}
                      selectedPostalCode={(deliveryInfo as any).postalCode || (detailedAddress as any).postalCode || ""}
                      selectedAddressType={(deliveryInfo as any).addressType || (detailedAddress as any).addressType || "HOUSE"}
                      selectedHouseNumber={(deliveryInfo as any).houseNumber || (detailedAddress as any).houseNumber || ""}
                      selectedBuilding={
                        deliveryInfo.building || detailedAddress.building || ""
                      }
                      selectedFloor={
                        deliveryInfo.floor || detailedAddress.floor || ""
                      }
                      selectedApartment={
                        deliveryInfo.apartment || detailedAddress.apartment || ""
                      }
                      selectedExtraDetails={
                        deliveryInfo.extraDetails || detailedAddress.extraDetails || ""
                      }
                      onAddressChange={handleAddressChange}
                      onDistanceCalculated={handleDistanceCalculated}
                    />
                  )}

                  {showDeliveryAddress && (
                    <View style={styles.infoCard}>
                      <Text style={styles.cardTitle}>
                        {t("checkout.step1.contactInformation")}
                      </Text>

                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                          {t("checkout.step1.phoneNumber")}{" "}
                          <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            phoneError && styles.inputError,
                          ]}
                          placeholder={t("checkout.step1.phonePlaceholder")}
                          placeholderTextColor="#9BA1A6"
                          value={deliveryInfo.phone}
                          onChangeText={(text) => {
                            // Allow only digits, spaces, dashes, parentheses, and plus sign
                            const phoneRegex = /^[\d\s\-\(\)\+]*$/;
                            
                            if (text === "" || phoneRegex.test(text)) {
                              setDeliveryInfo({ ...deliveryInfo, phone: text });
                              
                              // Validate phone number format
                              if (text.trim() === "") {
                                setPhoneError("");
                              } else {
                                // Remove all non-digit characters for validation
                                const digitsOnly = text.replace(/\D/g, "");
                                // Check if it has at least 7 digits (minimum for a valid phone number)
                                // and at most 15 digits (ITU-T E.164 standard)
                                if (digitsOnly.length < 7) {
                                  setPhoneError(
                                    t("checkout.step1.addressSelector.phoneTooShort") ||
                                      "Phone number is too short (minimum 7 digits required)"
                                  );
                                } else if (digitsOnly.length > 15) {
                                  setPhoneError(
                                    t("checkout.step1.addressSelector.phoneTooLong") ||
                                      "Phone number cannot exceed 15 digits"
                                  );
                                } else {
                                  setPhoneError("");
                                }
                              }
                            }
                          }}
                          keyboardType="phone-pad"
                        />
                        {phoneError && (
                          <Text style={styles.errorText}>{phoneError}</Text>
                        )}
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                          {t("checkout.step1.specialInstructions")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          placeholder={t(
                            "checkout.step1.specialInstructionsPlaceholder"
                          )}
                          placeholderTextColor="#9BA1A6"
                          value={deliveryInfo.notes}
                          onChangeText={(text) =>
                            setDeliveryInfo({ ...deliveryInfo, notes: text })
                          }
                          multiline
                          numberOfLines={3}
                        />
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* Step 2: Order Summary and Payment */}
              {/* Order Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>
                  {t("checkout.orderSummary")}
                </Text>
                {items.map((item, itemIndex) => {
                  const isDealItem =
                    (item as any)?.itemType === "DEAL" ||
                    Boolean((item as any)?.dealId) ||
                    Array.isArray((item as any)?.dealComponents);
                  const dealKey = String(
                    (item as any)?.dealId || (item as any)?.mealId || (item as any)?.id
                  );

                  // Find item tax info from breakdown
                  const itemTaxInfo = taxBreakdown?.itemBreakdown?.find(
                    (breakdown) =>
                      breakdown.mealId ===
                        (isDealItem ? dealKey : item.mealId) &&
                      breakdown.size ===
                        (isDealItem ? "DEAL" : (item.sizeName || "")) &&
                      breakdown.quantity === item.quantity
                  );

                  // Find addon tax info for this item
                  let addonTaxInfoList: any[] = [];
                  if (taxBreakdown && item.addOns && item.addOns.length > 0) {
                    let addonStartIndex = 0;
                    for (let i = 0; i < itemIndex; i++) {
                      addonStartIndex += items[i].addOns?.length || 0;
                    }
                    addonTaxInfoList = taxBreakdown.addonBreakdown.slice(
                      addonStartIndex,
                      addonStartIndex + item.addOns.length
                    );
                  }
                  return (
                    <View key={item.id}>
                      <View style={styles.orderItem}>
                        {item.mealImage && (
                          <Image
                            source={{ uri: getImageUrl(item.mealImage) }}
                            style={styles.itemImage}
                          />
                        )}
                        <View style={styles.itemDetails}>
                          <Text style={styles.itemName}>{item.mealName}</Text>
                          <Text style={styles.itemSize}>
                            {t("checkout.step2.sizeQty", {
                              size: item.itemType === "DEAL" ? "DEAL" : (item.sizeName || ""),
                              quantity: item.quantity,
                            })}
                          </Text>
                          {item.addOns.length > 0 && (
                            <Text style={styles.itemAddOns}>
                              {t("cart.addons")}:{" "}
                              {item.addOns.map((a) => a.name).join(", ")}
                            </Text>
                          )}
                          {item.optionalIngredients &&
                            item.optionalIngredients.length > 0 && (
                              <View style={styles.optionalIngredientsContainer}>
                                {(() => {
                                  const included =
                                    item.optionalIngredients.filter(
                                      (ing) => ing.isIncluded
                                    );
                                  const excluded =
                                    item.optionalIngredients.filter(
                                      (ing) => !ing.isIncluded
                                    );

                                  return (
                                    <>
                                      {included.length > 0 && (
                                        <Text
                                          style={styles.optionalIngredientText}
                                        >
                                          <Text
                                            style={
                                              styles.optionalIngredientLabel
                                            }
                                          >
                                            {t(
                                              "mealCustomization.includedIngredients"
                                            )}
                                            :{" "}
                                          </Text>
                                          <Text
                                            style={
                                              styles.optionalIngredientValue
                                            }
                                          >
                                            {included
                                              .map((ing) => ing.name)
                                              .join(", ")}
                                          </Text>
                                        </Text>
                                      )}
                                      {excluded.length > 0 && (
                                        <Text
                                          style={styles.optionalIngredientText}
                                        >
                                          <Text
                                            style={
                                              styles.optionalIngredientLabel
                                            }
                                          >
                                            {t(
                                              "mealCustomization.excludedIngredients"
                                            )}
                                            :{" "}
                                          </Text>
                                          <Text
                                            style={
                                              styles.optionalIngredientValue
                                            }
                                          >
                                            {excluded
                                              .map((ing) => ing.name)
                                              .join(", ")}
                                          </Text>
                                        </Text>
                                      )}
                                    </>
                                  );
                                })()}
                              </View>
                            )}
                          {item.specialInstructions && (
                            <Text style={styles.itemNote} numberOfLines={1}>
                              {t("checkout.step2.note")}:{" "}
                              {item.specialInstructions}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.itemPrice}>
                          {formatPrice(item.totalPrice, currency)}
                        </Text>
                      </View>
                      {/* Detailed price and tax breakdown per item */}
                      {taxBreakdown && itemTaxInfo && (isDealItem || !taxInclusive) && (
                        <View style={styles.breakdownBox}>
                          <Text style={styles.breakdownTitle}>
                            {t("checkout.step2.taxBreakdown")}:
                          </Text>

                          <View style={styles.breakdownSection}>
                            {isDealItem ? (
                              <>
                                {(taxBreakdown?.dealComponentBreakdown || [])
                                  .filter((row: any) => String(row.dealId) === dealKey)
                                  .map((row: any, idx: number) => {
                                    const name = String(row?.name || row?.componentId || `Component ${idx + 1}`);
                                    const compQty = Number(row?.componentQuantity || 1);
                                    const taxPct = Number(row?.taxPercentage || 0);
                                    const label = `${name}${compQty > 1 ? ` x${compQty}` : ""} (${taxPct}%)`;

                                    return (
                                      <View key={`${name}-${idx}`} style={styles.rowBetween}>
                                        <Text style={styles.breakdownLabel}>{label}</Text>
                                        <Text style={styles.breakdownValue}>
                                          {formatPrice(Number(row?.taxAmount || 0), currency)}
                                        </Text>
                                      </View>
                                    );
                                  })}
                              </>
                            ) : (
                              <>
                                <View style={styles.rowBetween}>
                                  <Text style={styles.breakdownLabel}>
                                    {t("checkout.step2.mealBasePrice")}:
                                  </Text>
                                  <Text style={styles.breakdownValue}>
                                    {formatPrice(itemTaxInfo.basePrice, currency)}
                                  </Text>
                                </View>
                                <View style={styles.rowBetween}>
                                  <Text style={styles.breakdownSubLabel}>
                                    {t("checkout.step2.taxPercentage", {
                                      percentage: itemTaxInfo.taxPercentage,
                                    })}
                                    :
                                  </Text>
                                  <Text style={styles.breakdownValue}>
                                    {formatPrice(itemTaxInfo.taxAmount, currency)}
                                  </Text>
                                </View>
                              </>
                            )}
                          </View>

                          {item.addOns &&
                            item.addOns.length > 0 &&
                            addonTaxInfoList.length > 0 && (
                              <View style={styles.addonSection}>
                                {item.addOns.map((addon: any, idx: number) => {
                                  const addonTax = addonTaxInfoList[idx];
                                  if (!addonTax) return null;
                                  return (
                                    <View
                                      key={`${addon.id}-${idx}`}
                                      style={styles.rowBetween}
                                    >
                                      <Text style={styles.breakdownLabel}>
                                        {t("checkout.step2.addonTaxLabel", {
                                          name: addon.name,
                                          percentage: addonTax.taxPercentage,
                                        })}
                                        :
                                      </Text>
                                      <Text style={styles.breakdownValue}>
                                        {formatPrice(addonTax.taxAmount, currency)}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}

                          <View style={styles.rowBetweenTotal}>
                            <Text style={styles.itemTotalTaxLabel}>
                              {t("checkout.step2.itemTotalTax")}:
                            </Text>
                            <Text style={styles.itemTotalTaxValue}>
                              {formatPrice(
                                itemTaxInfo.taxAmount +
                                  addonTaxInfoList.reduce(
                                    (sum: number, tax: any) => sum + tax.taxAmount,
                                    0
                                  ),
                                currency
                              )}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}

                <View style={styles.divider} />
                <View style={styles.totalSection}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      {t("checkout.step2.subtotal")}:
                    </Text>
                    <Text style={styles.totalValue}>
                      {formatPrice(subtotal, currency)}
                    </Text>
                  </View>
                  {/* Hide delivery fee section when merging - already paid in original order */}
                  {!isReservationCheckout && !isPickup && !mergeWithOrderId && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>
                        {t("checkout.step2.deliveryFee")}:
                      </Text>
                      <View style={styles.deliveryFeeValueContainer}>
                        {enableFreeDelivery && subtotal >= freeDeliveryThreshold ? (
                          <View style={styles.deliveryFeeFreeContainer}>
                            <Text style={styles.deliveryFeeFreeText}>
                              {t("checkout.step2.free", { defaultValue: "FREE" })}
                            </Text>
                            <Text style={styles.deliveryFeeFreeSubtext}>
                              {t("checkout.step2.orderOverAmount", {
                                amount: formatPrice(freeDeliveryThreshold, currency),
                                defaultValue: `orders over ${formatPrice(freeDeliveryThreshold, currency)}`,
                              })}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.totalValue}>
                            {formatPrice(deliveryFee || 0, currency)}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                  {!isReservationCheckout && !isPickup && shouldShowDeliveryFeeAndTax && !mergeWithOrderId && (
                    <View style={styles.deliveryFeeDetailsContainer}>
                      {deliveryDistance !== null && deliveryDistance !== undefined && (
                        <View style={styles.deliveryFeeDetailRow}>
                          <Text style={styles.deliveryFeeDetailLabel}>
                            {t("checkout.step2.distanceFromRestaurant", {
                              defaultValue: "Distance from restaurant",
                            })}:
                          </Text>
                          <Text style={styles.deliveryFeeDetailValue}>
                            {deliveryDistance.toFixed(2)} km
                          </Text>
                        </View>
                      )}

                      {(useDynamicDeliveryFee || useTieredDeliveryFee) &&
                        deliveryDistance !== null &&
                        deliveryDistance !== undefined &&
                        Number(
                          getBranchOrSettingsValue(
                            fullBranch?.deliveryRatePerKilometer,
                            settings?.deliveryRatePerKilometer,
                            0
                          )
                        ) > 0 && (
                          <View style={styles.deliveryFeeDetailRow}>
                            <Text style={styles.deliveryFeeDetailLabel}>
                              {t("checkout.step2.standardRatePerKm", {
                                defaultValue: "Standard rate",
                              })}:
                            </Text>
                            <Text style={styles.deliveryFeeDetailValue}>
                              {formatPrice(
                                Number(
                                  getBranchOrSettingsValue(
                                    fullBranch?.deliveryRatePerKilometer,
                                    settings?.deliveryRatePerKilometer,
                                    0
                                  )
                                ),
                                currency
                              )} {t("checkout.step2.perKm", { defaultValue: "per km" })}
                            </Text>
                          </View>
                        )}

                      {useTieredDeliveryFee &&
                        deliveryDistance !== null &&
                        deliveryDistance !== undefined && (
                          <View style={styles.deliveryFeeDetailsContainer}>
                            <View style={styles.deliveryFeeDetailRow}>
                              <Text style={styles.deliveryFeeDetailLabel}>
                                {t("checkout.step2.initialRange", {
                                  defaultValue: "Initial range",
                                })}:
                              </Text>
                              <Text style={styles.deliveryFeeDetailValue}>
                                {Number(
                                  getBranchOrSettingsValue(
                                    fullBranch?.initialDeliveryRange,
                                    settings?.initialDeliveryRange,
                                    3.0
                                  )
                                ).toFixed(1)}{" "}
                                km - 
                                {formatPrice(
                                  Number(
                                    getBranchOrSettingsValue(
                                      fullBranch?.initialDeliveryPrice,
                                      settings?.initialDeliveryPrice,
                                      2.0
                                    )
                                  ),
                                  currency
                                )}
                              </Text>
                            </View>

                            {(getBranchOrSettingsValue(
                              fullBranch?.extendedDeliveryThreshold,
                              settings?.extendedDeliveryThreshold,
                              null as any
                            ) ||
                              getBranchOrSettingsValue(
                                fullBranch?.extendedDeliveryRate,
                                settings?.extendedDeliveryRate,
                                null as any
                              )) && (
                              <View style={styles.deliveryFeeDetailRow}>
                                <Text style={styles.deliveryFeeDetailLabel}>
                                  {t("checkout.step2.extendedRate", {
                                    threshold: Number(
                                      getBranchOrSettingsValue(
                                        fullBranch?.extendedDeliveryThreshold,
                                        settings?.extendedDeliveryThreshold,
                                        0
                                      )
                                    ).toFixed(1),
                                    defaultValue: `Extended rate (over ${Number(
                                      getBranchOrSettingsValue(
                                        fullBranch?.extendedDeliveryThreshold,
                                        settings?.extendedDeliveryThreshold,
                                        0
                                      )
                                    ).toFixed(1)} km)`,
                                  })}
                                </Text>
                                <Text style={styles.deliveryFeeDetailValue}>
                                  {formatPrice(
                                    Number(
                                      getBranchOrSettingsValue(
                                        fullBranch?.extendedDeliveryRate,
                                        settings?.extendedDeliveryRate,
                                        0
                                      )
                                    ),
                                    currency
                                  )} {t("checkout.step2.perKm", { defaultValue: "per km" })}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                    </View>
                  )}
                  {!taxInclusive && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>
                        {t("checkout.step2.tax")}:
                      </Text>
                      <Text style={styles.totalValue}>
                        {formatPrice(totalTaxWithService || 0, currency)}
                      </Text>
                    </View>
                  )}
                  {!taxInclusive && !!taxBreakdown && (
                    <View style={styles.taxDetailsContainer}>
                      <View style={styles.taxDetailRow}>
                        <Text style={styles.taxDetailLabel}>
                          {t("checkout.step2.itemTax", { defaultValue: "Item tax" })}:
                        </Text>
                        <Text style={styles.taxDetailValue}>
                          {formatPrice(itemTax || 0, currency)}
                        </Text>
                      </View>
                      <View style={styles.taxDetailRow}>
                        <Text style={styles.taxDetailLabel}>
                          {t("checkout.step2.addonTax", { defaultValue: "Addon tax" })}:
                        </Text>
                        <Text style={styles.taxDetailValue}>
                          {formatPrice(addonTax || 0, currency)}
                        </Text>
                      </View>
                      {!isReservationCheckout &&
                        !isPickup &&
                        shouldShowDeliveryFeeAndTax &&
                        !mergeWithOrderId && (
                        <View style={styles.taxDetailRow}>
                          <Text style={styles.taxDetailLabel}>
                            {t("checkout.step2.deliveryTax", { defaultValue: "Delivery tax" })}:
                          </Text>
                          <Text style={styles.taxDetailValue}>
                            {formatPrice(deliveryTax || 0, currency)}
                          </Text>
                        </View>
                      )}

                      {isPickup && !mergeWithOrderId && takeawayServiceTaxAmount > 0 && (
                        <View style={styles.taxDetailRow}>
                          <Text style={styles.taxDetailLabel}>
                            {t("checkout.step2.takeawayServiceTax", {
                              defaultValue: "Takeaway service tax",
                            })}
                            :
                          </Text>
                          <Text style={styles.taxDetailValue}>
                            {formatPrice(takeawayServiceTaxAmount, currency)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {isPickup && !mergeWithOrderId && takeawayServiceFeeToAdd > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>
                        {t("checkout.step2.takeawayServiceFee", {
                          defaultValue: "Takeaway service fee",
                        })}
                        :
                      </Text>
                      <Text style={styles.totalValue}>
                        {formatPrice(takeawayServiceFeeToAdd, currency)}
                      </Text>
                    </View>
                  )}

                  {/* Voucher Code Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                      {t("checkout.voucher.title", "Do you have a voucher?")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder={t("checkout.voucher.placeholder", "Voucher code")}
                      placeholderTextColor="#999"
                      value={voucherCode}
                      onChangeText={(text) => setVoucherCode(text.toUpperCase())}
                      editable={!isValidatingVoucher && !appliedVoucher}
                      autoCapitalize="characters"
                    />
                    <View style={{ marginTop: 10 }}>
                      {appliedVoucher ? (
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#ef4444",
                            height: 50,
                            justifyContent: "center",
                            alignItems: "center",
                            borderRadius: 8,
                          }}
                          onPress={() => {
                            setAppliedVoucher(null);
                            setVoucherCode("");
                            setVoucherError(null);
                          }}
                        >
                          <Text style={{ color: "#ffffff", fontWeight: "600" }}>
                            {t("common.remove", "Remove")}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#3b82f6",
                            height: 50,
                            justifyContent: "center",
                            alignItems: "center",
                            borderRadius: 8,
                            opacity: isValidatingVoucher || !voucherCode.trim() ? 0.6 : 1,
                          }}
                          onPress={handleApplyVoucher}
                          disabled={isValidatingVoucher || !voucherCode.trim()}
                        >
                          <Text style={{ color: "#ffffff", fontWeight: "600" }}>
                            {isValidatingVoucher ? t("common.loading", "Loading") : t("checkout.voucher.apply", "Redeem")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {voucherError && (
                      <Text style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{voucherError}</Text>
                    )}
                    {appliedVoucher && (
                      <Text style={{ color: "#10b981", fontSize: 12, marginTop: 4 }}>
                        {t("checkout.voucher.success", "Voucher successfully applied!")}
                      </Text>
                    )}
                  </View>

                  {voucherDeduction > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={{ fontSize: 14, color: "#10b981", fontWeight: "500" }}>
                        {t("checkout.voucher.discount", "Voucher discount")}:
                      </Text>
                      <Text style={{ fontSize: 14, color: "#10b981", fontWeight: "600" }}>
                        -{formatPrice(voucherDeduction, currency)}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.totalRow, styles.finalTotalRow]}>
                    <Text style={styles.finalTotalLabel}>
                      {t("checkout.step2.total")}:
                    </Text>
                    <Text style={styles.finalTotalValue}>
                      {formatPrice(isReservationCheckout ? remainingTotal : remainingTotal || 0, currency)}
                    </Text>
                  </View>
                  
                  {/* Deposit Information for Reservations */}
                  {isReservationCheckout && depositPercentage !== undefined && (
                    <View style={styles.depositSection}>
                      {depositPercentage === 0 ? (
                        <View style={styles.depositInfoBox}>
                          <Text style={styles.depositInfoTitle}>
                            {t("reservations.checkout.noDepositRequired", "No Deposit Required")}
                          </Text>
                          <Text style={styles.depositInfoText}>
                            {t("reservations.checkout.payAtRestaurant", "You will pay at the restaurant")}
                          </Text>
                        </View>
                      ) : depositPercentage < 100 ? (
                        <View style={styles.depositInfoBox}>
                          <Text style={styles.depositInfoTitle}>
                            {t("reservations.checkout.depositRequired", "Deposit Required")}
                          </Text>
                          <View style={styles.depositRow}>
                            <Text style={styles.depositLabel}>
                              {t("reservations.checkout.depositAmount", "Deposit")} ({depositPercentage}%):
                            </Text>
                            <Text style={styles.depositValue}>
                              {formatPrice(payableAmount, currency)}
                            </Text>
                          </View>
                          <View style={styles.depositRow}>
                            <Text style={styles.depositLabel}>
                              {t("reservations.checkout.remainingBalance", "Remaining Balance")}:
                            </Text>
                            <Text style={styles.depositValue}>
                              {formatPrice(Math.max(0, finalTotal - payableAmount), currency)}
                            </Text>
                          </View>
                          <Text style={styles.depositInfoText}>
                            {t("reservations.checkout.depositDescription", "You will pay the remaining balance at the restaurant")}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.depositInfoBox}>
                          <Text style={styles.depositInfoTitle}>
                            {t("reservations.checkout.fullPaymentRequired", "Full Payment Required")}
                          </Text>
                          <Text style={styles.depositInfoText}>
                            {t("reservations.checkout.fullPaymentDescription", "Full payment is required to confirm your reservation")}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>

              {/* Additional Notes for Reservations */}
              {isReservationCheckout && (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>
                    {t("reservations.checkout.additionalNotes") || "Additional Notes"}
                  </Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder={t("reservations.checkout.additionalNotesPlaceholder") || "Any special requests or dietary restrictions..."}
                    placeholderTextColor="#9BA1A6"
                    value={reservationSpecialRequests}
                    onChangeText={setReservationSpecialRequests}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* Delivery Information - Hide for reservations */}
              {!isReservationCheckout && (
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>
                    {isPickup
                      ? t("orders.pickupInformation", {
                          defaultValue: "Pickup Information",
                        })
                      : t("orders.deliveryInformation")}
                  </Text>
                  {isPickup ? (
                    <>
                      <Text style={styles.deliveryInfoText}>
                        {t("orders.phone")}: {pickupInfo.phone}
                      </Text>
                      {pickupInfo.notes ? (
                        <Text style={styles.deliveryInfoText}>
                          {t("orders.specialInstructions")}: {pickupInfo.notes}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={styles.deliveryInfoText}>
                        {t("orders.address")}: {deliveryInfo.address}
                      </Text>
                      {deliveryInfo.building && (
                        <Text style={styles.deliveryInfoText}>
                          {t("orders.building")}: {deliveryInfo.building}
                        </Text>
                      )}
                      {deliveryInfo.floor && (
                        <Text style={styles.deliveryInfoText}>
                          {t("orders.floor")}: {deliveryInfo.floor}
                        </Text>
                      )}
                      {deliveryInfo.apartment && (
                        <Text style={styles.deliveryInfoText}>
                          {t("orders.apartment")}: {deliveryInfo.apartment}
                        </Text>
                      )}
                      {deliveryInfo.extraDetails && (
                        <Text style={styles.deliveryInfoText}>
                          {t("checkout.step1.addressSelector.extraDetails")}: {deliveryInfo.extraDetails}
                        </Text>
                      )}
                      <Text style={styles.deliveryInfoText}>
                        {t("orders.phone")}: {deliveryInfo.phone}
                      </Text>
                      {deliveryInfo.notes && (
                        <Text style={styles.deliveryInfoText}>
                          {t("orders.specialInstructions")}: {deliveryInfo.notes}
                        </Text>
                      )}
                    </>
                  )}
              </View>
              )}

              {/* Minimum Order Warning for Reservations */}
              {isReservationCheckout && preOrderMinAmount && !isMinimumOrderMet && (
                <View style={styles.minimumOrderWarning}>
                  <MaterialCommunityIcons name="alert" size={20} color="#fbbf24" />
                  <View style={styles.minimumOrderWarningText}>
                    <Text style={styles.minimumOrderWarningTitle}>
                      {t("reservations.checkout.minimumOrderRequired") || "Minimum Order Required"}
                    </Text>
                    <Text style={styles.minimumOrderWarningMessage}>
                      {t("reservations.checkout.minimumOrderMessage", {
                        amount: formatPrice(preOrderMinAmount, currency),
                        current: formatPrice(totalToCheck, currency)
                      }) || `Minimum order amount is ${formatPrice(preOrderMinAmount, currency)}. Current total: ${formatPrice(totalToCheck, currency)}`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Payment Method */}
              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>
                  {t("checkout.step2.paymentMethod", "Payment Method")}
                </Text>

                {/* For reservations, show payment info if payment is required */}
                {isReservationCheckout && paymentRequired && (
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentInfoText}>
                      {t("reservations.checkout.onlinePaymentRequired") || "Online payment is required for pre-order reservations"}
                    </Text>
                  </View>
                )}

                {/* Payment Method Selection - Only show if both methods are allowed and not locked */}
                {isReservationCheckout && paymentRequired && cardAllowed && paypalAllowed && !isPaymentMethodLocked && (
                  <View style={styles.paymentMethodSelection}>
                    <Text style={styles.paymentMethodLabel}>
                      {t("checkout.step2.paymentMethod", "Payment Method")}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.paymentOption,
                        paymentMethod === "card" && styles.paymentOptionSelected,
                      ]}
                      onPress={() => {
                        setPaymentMethod("card");
                      }}
                    >
                      <View style={styles.radioButton}>
                        {paymentMethod === "card" && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <Text style={styles.paymentLabel}>
                        {t("checkout.step2.creditDebitCard", "Credit/Debit Card")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.paymentOption,
                        paymentMethod === "paypal" && styles.paymentOptionSelected,
                      ]}
                      onPress={() => {
                        setPaymentMethod("paypal");
                      }}
                    >
                      <View style={styles.radioButton}>
                        {paymentMethod === "paypal" && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <Text style={styles.paymentLabel}>
                        {t("checkout.step2.paypal", "PayPal")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isReservationCheckout && isPaymentMethodLocked && (
                  <View style={styles.lockedPaymentMessage}>
                    <Text style={styles.lockedPaymentText}>
                      {lockedPaymentProvider === "PAYPAL"
                        ? t(
                            "checkout.reservation.paymentMethodLockedPayPal",
                            "This reservation was paid with PayPal. Please use PayPal for modifications."
                          )
                        : t(
                            "checkout.reservation.paymentMethodLockedStripe",
                            "This reservation was paid with Stripe. Please use card payment for modifications."
                          )}
                    </Text>
                  </View>
                )}

                {/* For reservations: When only one payment method is allowed, show it directly (no selection UI) */}
                {/* Card Payment - Show directly when only card is allowed for reservations */}
                {isReservationCheckout && paymentRequired && cardAllowed && !paypalAllowed && (
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentInfoText}>
                      {t("checkout.step2.creditDebitCard", "Credit/Debit Card")}
                    </Text>
                  </View>
                )}

                {/* PayPal Payment - Show directly when only PayPal is allowed for reservations */}
                {isReservationCheckout && paymentRequired && paypalAllowed && !cardAllowed && (
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentInfoText}>
                      {t("checkout.step2.paypal", "PayPal")}
                    </Text>
                  </View>
                )}

                {/* Card Payment Option - Only show for regular orders */}
                {!isReservationCheckout && isCardAvailable && (
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      paymentMethod === "card" && styles.paymentOptionSelected,
                      (mergeWithOrderId && paymentMethod !== "card") &&
                        styles.paymentOptionDisabled,
                    ]}
                    onPress={() => {
                      if (!mergeWithOrderId || paymentMethod === "card") {
                        setPaymentMethod("card");
                      }
                    }}
                    disabled={
                      (!!mergeWithOrderId && paymentMethod !== "card")
                    }
                  >
                    <View
                      style={[
                        styles.radioButton,
                        (mergeWithOrderId && paymentMethod !== "card") &&
                          styles.radioButtonDisabled,
                      ]}
                    >
                      {paymentMethod === "card" && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.paymentLabel,
                        (mergeWithOrderId && paymentMethod !== "card") &&
                          styles.paymentLabelDisabled,
                      ]}
                    >
                      {t("checkout.step2.creditDebitCard", "Credit/Debit Card")}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* PayPal Payment Option - Only show for regular orders */}
                {!isReservationCheckout && isPayPalAvailable && (
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      paymentMethod === "paypal" && styles.paymentOptionSelected,
                      (mergeWithOrderId && paymentMethod !== "paypal") &&
                        styles.paymentOptionDisabled,
                    ]}
                    onPress={() => {
                      if (!mergeWithOrderId || paymentMethod === "paypal") {
                        setPaymentMethod("paypal");
                      }
                    }}
                    disabled={
                      (!!mergeWithOrderId && paymentMethod !== "paypal")
                    }
                  >
                    <View
                      style={[
                        styles.radioButton,
                        (mergeWithOrderId && paymentMethod !== "paypal") &&
                          styles.radioButtonDisabled,
                      ]}
                    >
                      {paymentMethod === "paypal" && (
                        <View style={styles.radioInner} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.paymentLabel,
                        (mergeWithOrderId && paymentMethod !== "paypal") &&
                          styles.paymentLabelDisabled,
                      ]}
                    >
                      {t("checkout.step2.paypal", "PayPal")}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* COD Payment Option - Only show if available and not reservation */}
                {!isReservationCheckout && isCodAvailable && (
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      paymentMethod === "cod" && styles.paymentOptionSelected,
                      (mergeWithOrderId && paymentMethod !== "cod") &&
                        styles.paymentOptionDisabled,
                    ]}
                    onPress={() => {
                      if (!mergeWithOrderId || paymentMethod === "cod") {
                        setPaymentMethod("cod");
                      }
                    }}
                    disabled={!!mergeWithOrderId && paymentMethod !== "cod"}
                  >
                  <View
                    style={[
                      styles.radioButton,
                      (mergeWithOrderId && paymentMethod !== "cod") &&
                        styles.radioButtonDisabled,
                    ]}
                  >
                    {paymentMethod === "cod" && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.paymentLabel,
                      (mergeWithOrderId && paymentMethod !== "cod") &&
                        styles.paymentLabelDisabled,
                    ]}
                  >
                    {isPickup
                      ? t("checkout.step2.cashOnPickup", "Cash on Pickup")
                      : t("checkout.step2.cashOnDelivery", "Cash on Delivery")}
                  </Text>
                </TouchableOpacity>
                )}

                {/* PayPal Payment Form - Show conditionally based on reservation status and allowed methods */}
                {paymentMethod === "paypal" && isPayPalAvailable && (
                  <View style={styles.cardInfoBox}>
                    {isReservationCheckout ? (
                      // For reservations, only show PayPal if payment is required and PayPal is allowed
                      paymentRequired && paypalAllowed ? (
                        <PayPalPayment
                          amount={payableAmount}
                          currency={currency}
                          onSuccess={handlePayPalPayment}
                          onError={(error) => {
                            showToast(error, "error");
                            setIsSubmitting(false);
                          }}
                          onCancel={() => {
                            setIsSubmitting(false);
                          }}
                          orderData={{
                            orderType,
                          }}
                          disabled={
                            isSubmitting ||
                            !isMinimumOrderMet
                          }
                        />
                      ) : null
                    ) : (
                      // For regular orders, always show PayPal if available
                      <PayPalPayment
                        amount={remainingTotal}
                        currency={currency}
                        onSuccess={handlePayPalPayment}
                        onError={(error) => {
                          showToast(error, "error");
                          setIsSubmitting(false);
                        }}
                        onCancel={() => {
                          setIsSubmitting(false);
                        }}
                        orderData={{
                          orderType,
                          appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
                        } as any}
                        disabled={
                          isSubmitting ||
                          (!acceptCash && !acceptOnlinePayment && !acceptPayPal)
                        }
                      />
                    )}
                  </View>
                )}

                {paymentMethod === "cod" && !isReservationCheckout && (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxTitle}>
                      {isPickup
                        ? t("checkout.step2.cashOnPickup", "Cash on Pickup")
                        : t("checkout.step2.cashOnDelivery", "Cash on Delivery")}
                    </Text>
                    <Text style={styles.infoBoxText}>
                      {isPickup
                        ? t("checkout.step2.codInfo1Pickup", "• Pay with cash when you pick up your order")
                        : t("checkout.step2.codInfo1", "• Pay with cash when your order is delivered")}
                    </Text>
                    <Text style={styles.infoBoxText}>
                      {isPickup
                        ? t("checkout.step2.codInfo2Pickup", "• Please have exact change ready")
                        : t("checkout.step2.codInfo2", "• Please have exact change ready")}
                    </Text>
                    <Text style={styles.infoBoxText}>
                      {isPickup
                        ? t("checkout.step2.codInfo3Pickup", "• No delivery fee for pickup orders")
                        : t("checkout.step2.codInfo3", {
                            fee: deliveryFee.toFixed(2),
                          })}
                    </Text>
                  </View>
                )}

                {/* Card Payment Form - Show for reservations only when card is selected and allowed */}
                {paymentMethod === "card" && (
                  <View style={styles.cardInfoBox}>
                    {isReservationCheckout ? (
                      // For reservations, only show card field if payment is required and card is allowed
                      paymentRequired && cardAllowed ? (
                        <>
                          <Text style={styles.cardInfoTitle}>
                            💳 {t("checkout.step2.enterCardDetails")}
                          </Text>
                          {isStripeReady ? (
                            <CardField
                              postalCodeEnabled={false}
                              placeholders={{
                                number: "4242 4242 4242 4242",
                              }}
                              cardStyle={{
                                backgroundColor: "#1a1a1a",
                                textColor: "#ffffff",
                                borderWidth: 1,
                                borderColor: "#404040",
                                borderRadius: 8,
                                fontSize: 16,
                                placeholderColor: "#666666",
                              }}
                              style={styles.cardField}
                              onCardChange={(cardDetails) => {
                                setCardDetails(cardDetails);
                              }}
                            />
                          ) : (
                            <View style={styles.cardFieldLoading}>
                              <ActivityIndicator size="small" color="#ec4899" />
                              <Text style={styles.cardFieldLoadingText}>
                                {t("checkout.step2.processing")}
                              </Text>
                            </View>
                          )}
                        </>
                      ) : null
                    ) : (
                      // For regular orders, always show card field
                      <>
                        <Text style={styles.cardInfoTitle}>
                          💳 {t("checkout.step2.enterCardDetails")}
                        </Text>
                        {isStripeReady ? (
                          <CardField
                            postalCodeEnabled={false}
                            placeholders={{
                              number: "4242 4242 4242 4242",
                            }}
                            cardStyle={{
                              backgroundColor: "#1a1a1a",
                              textColor: "#ffffff",
                              borderWidth: 1,
                              borderColor: "#404040",
                              borderRadius: 8,
                              fontSize: 16,
                              placeholderColor: "#666666",
                            }}
                            style={styles.cardField}
                            onCardChange={(cardDetails) => {
                              setCardDetails(cardDetails);
                            }}
                          />
                        ) : (
                          <View style={styles.cardFieldLoading}>
                            <ActivityIndicator size="small" color="#ec4899" />
                            <Text style={styles.cardFieldLoadingText}>
                              {t("checkout.step2.processing")}
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            </>
          )}

          <View style={styles.footerActions}>
            {isReservationCheckout && preOrderMinAmount && !isMinimumOrderMet && (
              <View style={styles.minimumOrderWarningFooter}>
                <Text style={styles.minimumOrderWarningFooterText}>
                  {t("reservations.checkout.minimumOrderRequired") || "Minimum Order Required"}: {formatPrice(preOrderMinAmount, currency)}
                </Text>
              </View>
            )}
            {currentStep === 1 && !isReservationCheckout ? (
              (isPickup || showDeliveryAddress) && (
                <TouchableOpacity
                  style={[
                    styles.checkoutButton,
                    (isPickup
                      ? !pickupInfo.phone || !!phoneError || !branchSummary?.id
                      : !deliveryInfo.address ||
                        !deliveryInfo.phone ||
                        !!phoneError ||
                        !branchSummary?.id ||
                        !availability?.available) &&
                      styles.checkoutButtonDisabled,
                  ]}
                  onPress={handleNextStep}
                  disabled={
                    isPickup
                      ? !pickupInfo.phone || !!phoneError || !branchSummary?.id
                      : !deliveryInfo.address ||
                        !deliveryInfo.phone ||
                        !!phoneError ||
                        !branchSummary?.id ||
                        !availability?.available
                  }
                >
                  <Text style={styles.checkoutButtonText}>
                    {t("checkout.actions.continueToPayment", "Continue to Payment")}
                  </Text>
                </TouchableOpacity>
              )
            ) : (
              <>
                {/* Voucher-only checkout when voucher fully covers the order */}
                {!isReservationCheckout && remainingTotal <= 0 && appliedVoucher ? (
                  <TouchableOpacity
                    style={[
                      styles.checkoutButton,
                      isPlacingOrder && styles.checkoutButtonDisabled,
                    ]}
                    onPress={handleVoucherOnlyCheckout}
                    disabled={isPlacingOrder}
                  >
                    {isPlacingOrder ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.checkoutButtonText}>
                        {t("checkout.voucher.checkoutWithVoucher", "Kostenpflichtig bestellen (Gutschein)")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    {/* For reservations with no payment required (0% deposit) */}
                    {isReservationCheckout && !paymentRequired ? (
                  <TouchableOpacity
                    style={[
                      styles.checkoutButton,
                      (isSubmitting || !isMinimumOrderMet) && styles.checkoutButtonDisabled,
                    ]}
                    onPress={async () => {
                      // Call handlePaymentSuccess with empty payment ID for no-payment reservations
                      if (!isSignedIn) {
                        showToast("Authentication required. Please login to continue.", "error");
                        return;
                      }
                      setIsSubmitting(true);
                      try {
                        const token = await getToken();
                        if (!token) {
                          showToast("Error: Authentication required", "error");
                          setIsSubmitting(false);
                          return;
                        }
                        // Handle reservation checkout with no payment
                        await handleReservationCheckout("", token);
                      } catch (error) {
                        showToast(
                          `Failed: ${error instanceof Error ? error.message : "Please try again"}`,
                          "error"
                        );
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isSubmitting || !isMinimumOrderMet}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.checkoutButtonText}>
                        {existingReservation
                          ? (t("reservations.checkout.addItemsToReservation") || "Add Items to Reservation")
                          : (t("reservations.checkout.placeReservation") || "Place Reservation")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    {/* Hide checkout button when PayPal is selected - PayPal component has its own button */}
                    {/* Also hide for reservations when payment is required and only PayPal is allowed (PayPal button handles it) */}
                    {paymentMethod !== "paypal" && !(isReservationCheckout && paymentRequired && paypalAllowed && !cardAllowed) && (
                      <TouchableOpacity
                        style={[
                          styles.checkoutButton,
                          (isSubmitting || (isReservationCheckout && !isMinimumOrderMet)) && styles.checkoutButtonDisabled,
                        ]}
                        onPress={handlePlaceOrder}
                        disabled={isSubmitting || (isReservationCheckout && !isMinimumOrderMet)}
                      >
                        {isSubmitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.checkoutButtonText}>
                            {isReservationCheckout
                              ? (existingReservation
                                ? (t("reservations.checkout.addItemsToReservation") || "Add Items to Reservation")
                                : (t("reservations.checkout.placeReservation") || "Place Reservation"))
                              : paymentMethod === "cod"
                              ? (isPickup
                                ? t("checkout.step2.cashOnPickup", "Cash on Pickup")
                                : t("checkout.step2.cashOnDelivery", "Cash on Delivery"))
                              : t("checkout.actions.continueToPayment", "Proceed to Payment")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

            {isReservationCheckout && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelReservation}
              >
                <Text style={styles.cancelButtonText}>
                  {t("reservations.checkout.cancelReservation") || "Cancel Reservation"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: keyboardVisible ? keyboardHeight : 0 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120, // Extra padding for absolute positioned button
  },
  summaryCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  orderTypeRow: {
    flexDirection: "row",
    gap: 12,
  },
  orderTypeOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#1a1a1a",
    alignItems: "center",
  },
  orderTypeOptionSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  orderTypeLabel: {
    color: "#e5e7eb",
    fontWeight: "600",
  },
  orderTypeLabelSelected: {
    color: "#ec4899",
  },
  helpText: {
    fontSize: 13,
    color: "#999",
    marginTop: 10,
  },
  orderItem: {
    flexDirection: "row",
    marginBottom: 16,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#333",
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  itemSize: {
    fontSize: 13,
    color: "#999",
    marginBottom: 2,
  },
  itemAddOns: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  optionalIngredientsContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  optionalIngredientText: {
    fontSize: 12,
    marginBottom: 2,
  },
  optionalIngredientLabel: {
    fontWeight: "600",
    color: "#ccc",
  },
  optionalIngredientValue: {
    color: "#999",
  },
  itemNote: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginBottom: 2,
  },
  itemQuantity: {
    fontSize: 13,
    color: "#ccc",
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ec4899",
    alignSelf: "flex-start",
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
  },
  totalSection: {
    paddingTop: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: "#ccc",
  },
  totalValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  deliveryFeeValueContainer: {
    alignItems: "flex-end",
  },
  deliveryFeeFreeContainer: {
    alignItems: "flex-end",
  },
  deliveryFeeFreeText: {
    fontSize: 14,
    color: "#10b981",
    fontWeight: "700",
  },
  deliveryFeeFreeSubtext: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  deliveryFeeDetailsContainer: {
    marginTop: 6,
    marginBottom: 10,
    paddingLeft: 16,
  },
  deliveryFeeDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  deliveryFeeDetailLabel: {
    color: "#9ca3af",
    fontSize: 12,
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 12,
  },
  deliveryFeeDetailValue: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 0,
    textAlign: "right",
  },
  taxDetailsContainer: {
    marginTop: 6,
    marginBottom: 10,
  },
  taxDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  taxDetailLabel: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  taxDetailValue: {
    fontSize: 12,
    color: "#E5E7EB",
    fontWeight: "500",
  },
  finalTotalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  finalTotalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  finalTotalValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ec4899",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 8,
  },
  required: {
    color: "#ff4444",
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#fff",
    minHeight: 50,
  },
  inputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  paymentOptionSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  paymentOptionDisabled: {
    opacity: 0.5,
    backgroundColor: "#0f0f0f",
    borderColor: "#1a1a1a",
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#999",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonDisabled: {
    borderColor: "#444",
    opacity: 0.5,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ec4899",
  },
  paymentLabel: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
  },
  paymentLabelDisabled: {
    color: "#666",
    opacity: 0.6,
  },
  infoBox: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#60a5fa",
    marginBottom: 8,
  },
  infoBoxText: {
    fontSize: 13,
    color: "#93c5fd",
    marginBottom: 4,
  },
  cardInfoBox: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "rgba(236, 72, 153, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  cardInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
    marginBottom: 8,
  },
  cardInfoText: {
    fontSize: 13,
    color: "#f9a8d4",
    marginBottom: 4,
  },
  cardField: {
    width: "100%",
    height: 50,
    marginVertical: 8,
  },
  cardFieldLoading: {
    width: "100%",
    height: 50,
    marginVertical: 8,
    backgroundColor: "#262626",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  cardFieldLoadingText: {
    color: "#9BA1A6",
    fontSize: 14,
  },
  footerActions: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  checkoutButton: {
    backgroundColor: "#ec4899",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#374151",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  cancelButtonText: {
    color: "#e5e7eb",
    fontSize: 15,
    fontWeight: "600",
  },
  bottomSpacing: {
    height: 20,
  },
  // Reservation checkout styles
  reservationDetailsCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  reservationDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  reservationDetailsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  reservationDetailsContent: {
    gap: 12,
  },
  reservationDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  reservationDetailText: {
    flex: 1,
  },
  reservationDetailLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  reservationDetailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modifyReservationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "transparent",
  },
  modifyReservationButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
  minimumOrderWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  minimumOrderWarningText: {
    flex: 1,
  },
  minimumOrderWarningTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fbbf24",
    marginBottom: 4,
  },
  minimumOrderWarningMessage: {
    fontSize: 13,
    color: "#fcd34d",
  },
  minimumOrderWarningFooter: {
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  minimumOrderWarningFooterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fbbf24",
    textAlign: "center",
  },
  paymentInfo: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  paymentInfoText: {
    fontSize: 13,
    color: "#f9a8d4",
    textAlign: "center",
  },
  lockedPaymentMessage: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  lockedPaymentText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  depositSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  depositInfoBox: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
    borderRadius: 8,
    padding: 12,
  },
  depositInfoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fbbf24",
    marginBottom: 8,
  },
  depositRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  depositLabel: {
    fontSize: 12,
    color: "#fcd34d",
  },
  depositValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fbbf24",
  },
  depositInfoText: {
    fontSize: 12,
    color: "#fcd34d",
    marginTop: 8,
  },
  paymentMethodSelection: {
    marginBottom: 12,
  },
  paymentMethodLabel: {
    fontSize: 13,
    color: "#9BA1A6",
    marginBottom: 8,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  // Breakdown styles
  breakdownBox: {
    marginTop: 8,
    backgroundColor: "rgba(154, 161, 166, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(154, 161, 166, 0.25)",
    borderRadius: 8,
    padding: 10,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
  },
  breakdownSection: {
    gap: 4,
  },
  addonSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#333",
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  rowBetweenTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  breakdownLabel: {
    fontSize: 12,
    color: "#9BA1A6",
  },
  breakdownSubLabel: {
    fontSize: 11,
    color: "#9BA1A6",
    fontStyle: "italic",
  },
  breakdownValue: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "500",
  },
  itemTotalTaxLabel: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  itemTotalTaxValue: {
    fontSize: 12,
    color: "#ec4899",
    fontWeight: "700",
  },
  // Step indicator styles
  stepIndicatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: "#151718",
  },
  stepIndicator: {
    alignItems: "center",
    flex: 1,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#262626",
    borderWidth: 2,
    borderColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#999",
  },
  stepLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
  },
  stepLabelActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#333",
    marginHorizontal: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#262626",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  modalDescription: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 20,
    lineHeight: 20,
  },
  modalBenefits: {
    marginBottom: 24,
  },
  modalBenefitItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  modalBenefitText: {
    fontSize: 14,
    color: "#fff",
  },
  modalFooter: {
    flexDirection: "row",
  },
  modalButtonSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#333",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#444",
    marginRight: 6,
  },
  modalButtonSecondaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  modalButtonPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ec4899",
    alignItems: "center",
    marginLeft: 6,
  },
  modalButtonPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  deliveryInfoText: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 8,
  },
  blockedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  blockedCard: {
    backgroundColor: "#262626",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    maxWidth: 400,
    width: "100%",
  },
  blockedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ef4444",
    marginTop: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  blockedMessage: {
    fontSize: 14,
    color: "#ccc",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  blockedButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  blockedButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
