import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import StripePaymentForm from "@/components/payment/StripePaymentForm";
import PayPalPaymentForm from "@/components/payment/PayPalPaymentForm";
import DeliveryAvailabilityCheck from "@/components/checkout/DeliveryAvailabilityCheck";
import EnhancedAddressSelector, {
  type DetailedAddress,
} from "@/components/checkout/EnhancedAddressSelector";
import branchService, { type Branch } from "@/services/branchService";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import ApiService from "@/services/apiService";
import { SettingsService, type Settings } from "@/services/settingsService";
import { reservationService } from "@/services/reservationService";
import { mealService, type Meal } from "@/services/mealService";
import { addonService, type Addon } from "@/services/addonService";
import { calculateTax } from "@/utils/taxCalculator";
import { calculateDistance } from "@/utils/distanceCalculator";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiArrowRight, mdiCheck, mdiCalendar, mdiAlert } from "@mdi/js";
import { ServingHoursService, type ServingHoursStatus } from "@/services/servingHoursService";
import { formatPrice } from "@/utils/currency";
import { useTranslation, Trans } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBranch } from "@/contexts/BranchContext";
import PickupLocationDisplay from "@/components/PickupLocationDisplay";
import { deliverableQuantityService } from "@/services/deliverableQuantityService";
import ScheduledOrderPicker from "../components/checkout/ScheduledOrderPicker";
import { useCheckoutDraftStore } from "@/store/checkoutDraftStore";
// CartValidationResult type imported but not currently used - kept for future use
// import type { CartValidationResult } from "@/services/deliverableQuantityService";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface CheckoutPageProps {
  cartItems?: CartItem[];
  totalAmount?: number;
}

const CheckoutPage: React.FC<CheckoutPageProps> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const checkoutDraft = useCheckoutDraftStore.getState();
  const {
    items: cartItems,
    getTotalPrice,
    clearCart,
    removeItem,
  } = useCartStore();
  const { isSignedIn, getToken } = useAuth();
  const { t } = useTranslation();
  const totalAmount = getTotalPrice();
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">(
    checkoutDraft.orderType
  );
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [replacesOrderId, setReplacesOrderId] = useState<string | null>(null);
  const [deliveryAvailabilityConfirmed, setDeliveryAvailabilityConfirmed] =
    useState(checkoutDraft.deliveryAvailabilityConfirmed);
  const [deliveryInfo, setDeliveryInfo] = useState(checkoutDraft.deliveryInfo);
  const [pickupInfo, setPickupInfo] = useState(checkoutDraft.pickupInfo);
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(
    checkoutDraft.deliveryDistance
  );
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cod" | "paypal">("card");
  const [appliedVoucher, setAppliedVoucher] = useState<any | null>(null);
  const [voucherCode, setVoucherCode] = useState<string>("");
  const [isValidatingVoucher, setIsValidatingVoucher] = useState<boolean>(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [isPaymentComplete, setIsPaymentComplete] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [dealsForTax, setDealsForTax] = useState<any[]>([]);
  const [taxBreakdown, setTaxBreakdown] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeWithOrderId, setMergeWithOrderId] = useState<string | undefined>(
    undefined
  );
  const [hasDecidedOnMerge, setHasDecidedOnMerge] = useState(false);
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [allowOrdersOutsideHours, setAllowOrdersOutsideHours] = useState(false);
  const [phoneError, setPhoneError] = useState<string>("");
  // Cart validation state - variables kept for future display to user
  const [, setCartValidationErrors] = useState<string[]>([]);
  const [, setIsValidatingCart] = useState(false);
  const { branch: branchSummary, availability, branches, customerServiceMode } = useBranch();

  // Checkout needs branch payment settings (incl. pickup payment methods).
  // BranchContext loads public branches (no token) which may omit these fields.
  const [secureBranches, setSecureBranches] = useState<Branch[] | null>(null);
  
  useEffect(() => {
    const loadSecureBranches = async () => {
      if (!isSignedIn) {
        setSecureBranches(null);
        return;
      }
      try {
        const token = await getToken();
        if (!token) {
          setSecureBranches(null);
          return;
        }
        const list = await branchService.getBranches(token);
        setSecureBranches(list);
      } catch {
        setSecureBranches(null);
      }
    };

    loadSecureBranches();
  }, [isSignedIn, getToken]);

  // Get the full branch object from branches array.
  // Prefer the authenticated branch list (includes pickup payment config).
  const fullBranch = branchSummary?.id
    ? (secureBranches?.find((b) => b.id === branchSummary.id) ||
        branches.find((b) => b.id === branchSummary.id) ||
        null)
    : null;

  // Persist checkout draft to Zustand (sessionStorage) so user doesn't lose form fields
  useEffect(() => {
    useCheckoutDraftStore.getState().setOrderType(orderType);
  }, [orderType]);

  useEffect(() => {
    const desired: "DELIVERY" | "PICKUP" = customerServiceMode === "PICKUP" ? "PICKUP" : "DELIVERY";
    if (orderType !== desired) {
      setOrderType(desired);
    }
    // Only on mount; checkout draft may later change as user interacts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    useCheckoutDraftStore.getState().setDeliveryInfo(deliveryInfo);
  }, [deliveryInfo]);

  useEffect(() => {
    useCheckoutDraftStore.getState().setPickupInfo(pickupInfo);
  }, [pickupInfo]);

  useEffect(() => {
    useCheckoutDraftStore.getState().setDeliveryDistance(deliveryDistance);
  }, [deliveryDistance]);

  useEffect(() => {
    useCheckoutDraftStore
      .getState()
      .setDeliveryAvailabilityConfirmed(deliveryAvailabilityConfirmed);
  }, [deliveryAvailabilityConfirmed]);

  // Track branchId in draft; if branch changes, clear address+distance to avoid stale cross-branch calculations
  useEffect(() => {
    const currentBranchId = branchSummary?.id || null;
    const prevBranchId = useCheckoutDraftStore.getState().branchId;

    useCheckoutDraftStore.getState().setBranchId(currentBranchId);

    if (prevBranchId && currentBranchId && prevBranchId !== currentBranchId) {
      setDeliveryInfo((prev) => ({
        ...prev,
        address: "",
        streetAddress: "",
        postalCode: "",
        addressType: "HOUSE",
        houseNumber: "",
        building: "",
        floor: "",
        apartment: "",
        extraDetails: "",
      }));
    }
    setDeliveryDistance(null);
    setDeliveryAvailabilityConfirmed(false);
    useCheckoutDraftStore.getState().setDeliveryAvailabilityConfirmed(false);
  }, [branchSummary?.id]);

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

  // Check if this is a pre-order reservation
  const isPreOrderReservation = React.useMemo(() => {
    try {
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      return !!pendingReservation;
    } catch {
      return false;
    }
  }, []);

  // Helper to get value from branch first, then settings
  const getBranchOrSettingsValue = <T,>(branchValue: T | null | undefined, settingsValue: T | null | undefined, defaultValue: T): T => {
    return (branchValue !== null && branchValue !== undefined) ? branchValue : (settingsValue !== null && settingsValue !== undefined ? settingsValue : defaultValue);
  };

  const effectivePickupEnabled = getBranchOrSettingsValue(
    fullBranch?.pickupEnabled,
    settings?.pickupEnabled,
    true
  );
  const effectiveDeliveryEnabled = getBranchOrSettingsValue(
    fullBranch?.deliveryEnabled,
    settings?.deliveryEnabled,
    true
  );

  // Keep orderType consistent with enabled services
  useEffect(() => {
    if (orderType === "PICKUP" && !effectivePickupEnabled && effectiveDeliveryEnabled) {
      setOrderType("DELIVERY");
      return;
    }
    if (orderType === "DELIVERY" && !effectiveDeliveryEnabled && effectivePickupEnabled) {
      setOrderType("PICKUP");
    }
  }, [orderType, effectivePickupEnabled, effectiveDeliveryEnabled]);

  // Load user profile data
  useEffect(() => {
    if (isSignedIn) {
      loadUserProfile();
      checkActiveOrder();
    }
  }, [isSignedIn]);

  // Prefill from navigation state (cancel+reorder flow)
  useEffect(() => {
    const state = (location.state || {}) as any;
    if (state?.replacesOrderId) {
      setReplacesOrderId(String(state.replacesOrderId));
    }
    if (state?.prefillOrderType) {
      setOrderType(state.prefillOrderType);
    }
    if (state?.prefillScheduledDate) {
      try {
        const d = new Date(state.prefillScheduledDate);
        if (!isNaN(d.getTime())) {
          setScheduledDate(d);
        }
      } catch {
        // ignore
      }
    }
    if (state?.prefillDeliveryInfo) {
      setDeliveryInfo((prev) => ({ ...prev, ...state.prefillDeliveryInfo }));
    }
    if (state?.prefillPickupInfo) {
      setPickupInfo((prev) => ({ ...prev, ...state.prefillPickupInfo }));
    }
  }, [location.state]);

  // Prefill from order modification mode (stored in sessionStorage)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("modifyingOrderPrefill");
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;

      if (parsed?.replacesOrderId) {
        setReplacesOrderId(String(parsed.replacesOrderId));
      } else {
        const modifyingOrderId = sessionStorage.getItem("modifyingOrderId");
        if (modifyingOrderId) {
          setReplacesOrderId(modifyingOrderId);
        }
      }

      if (parsed?.prefillOrderType) {
        setOrderType(parsed.prefillOrderType);
      }
      if (parsed?.prefillScheduledDate) {
        try {
          const d = new Date(parsed.prefillScheduledDate);
          if (!isNaN(d.getTime())) {
            setScheduledDate(d);
          }
        } catch {
          // ignore
        }
      }
      if (parsed?.prefillDeliveryInfo) {
        setDeliveryInfo((prev) => ({ ...prev, ...parsed.prefillDeliveryInfo }));
      }
      if (parsed?.prefillPickupInfo) {
        setPickupInfo((prev) => ({ ...prev, ...parsed.prefillPickupInfo }));
      }
    } catch {
      // ignore
    }
  }, []);

  const clearOrderModificationMode = () => {
    try {
      sessionStorage.removeItem("modifyingOrderId");
      sessionStorage.removeItem("modifyingOrderBranchId");
      sessionStorage.removeItem("modifyingOrderPrefill");
      window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderId" }));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "modifyingOrderBranchId" })
      );
      window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderPrefill" }));
    } catch {
      // ignore
    }
  };

  // Check for active order when moving to step 2 OR when scheduled date changes on step 1
  // (but not if already merging or decided)
  useEffect(() => {
    // Check when:
    // 1. Moving to step 2 (for ASAP orders)
    // 2. OR when scheduledDate is set (for scheduled orders on step 1)
    if (
      isSignedIn &&
      !showMergeDialog &&
      !mergeWithOrderId &&
      !hasDecidedOnMerge &&
      (currentStep === 2 || scheduledDate !== null)
    ) {
      checkActiveOrder();
    }
  }, [
    currentStep,
    isSignedIn,
    showMergeDialog,
    mergeWithOrderId,
    hasDecidedOnMerge,
    scheduledDate, // Re-check when scheduled date changes
  ]);

  const checkActiveOrder = async () => {
    // #region agent log
    // #endregion
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const result = await apiService.getActiveOrder(token);

      // #region agent log
      // #endregion

      if (
        result.success &&
        result.data?.hasActiveOrder &&
        result.data?.activeOrder
      ) {
        const activeOrderData = result.data.activeOrder;

        // Only allow merge prompt when active order matches the current branch and order type
        if (!branchSummary?.id) {
          return;
        }
        if (activeOrderData.branchId && activeOrderData.branchId !== branchSummary.id) {
          return;
        }
        if (activeOrderData.orderType && activeOrderData.orderType !== orderType) {
          return;
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

        // Check if either order is scheduled (use Boolean() to ensure proper comparison)
        const existingIsScheduled = Boolean(activeOrderData.isScheduledOrder && activeOrderData.scheduledDate);
        const newIsScheduled = scheduledDate !== null;

        // #region agent log
        // #endregion

        // If one is scheduled and one is ASAP, they can't be merged
        if (existingIsScheduled !== newIsScheduled) {
          // #endregion
          // Don't show merge dialog - orders are incompatible
          return;
        }

        // If both are scheduled, apply scheduled order merge rules
        if (existingIsScheduled && newIsScheduled) {
          // Check if scheduled order merge is allowed
          const allowScheduledMerge = getBranchOrSettingsValue(
            fullBranch?.allowScheduledOrderMerge,
            settings?.allowScheduledOrderMerge,
            false
          );

          
          if (!allowScheduledMerge) {
            // Scheduled order merging is disabled
            return;
          }

          // Check if scheduled for the same time slot (within 30 minutes)
          const existingScheduledDate = new Date(activeOrderData.scheduledDate);
          const timeDiff = Math.abs(existingScheduledDate.getTime() - scheduledDate.getTime());
          const thirtyMinutesMs = 30 * 60 * 1000;

          
          if (timeDiff > thirtyMinutesMs) {
            // Different time slots - can't merge
            return;
          }

          // Check if within cutoff period
          const cutoffHours = getBranchOrSettingsValue(
            fullBranch?.scheduledOrderMergeCutoffHours,
            settings?.scheduledOrderMergeCutoffHours,
            2
          );

          const now = new Date();
          const cutoffTime = new Date(
            existingScheduledDate.getTime() - cutoffHours * 60 * 60 * 1000
          );

          if (now >= cutoffTime) {
            // Past cutoff time - can't merge
            return;
          }

          // All scheduled merge conditions met - show merge dialog
          setActiveOrder(activeOrderData);
          setShowMergeDialog(true);
          return;
        }
        
        // Both are ASAP orders - use standard merge timeframe logic
        const orderCreatedAt = new Date(activeOrderData.createdAt);
        const now = new Date();
        const minutesSinceOrder = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
        
        if (minutesSinceOrder <= mergeTimeframeMinutes) {
          // Order is recent enough - show merge dialog
          setActiveOrder(activeOrderData);
          setShowMergeDialog(true);
        }
        // If order is too old, do nothing - proceed with new order creation
      }
    } catch (error) {
      console.error("Failed to check active order:", error);
    }
  };

  // Redirect if cart is empty
  useEffect(() => {
    if (cartItems.length === 0) {
      navigate("/cart");
    }
  }, [cartItems.length, navigate]);

  // Load serving hours from branch
  useEffect(() => {
    const loadServingHours = async () => {
      try {
        const response = await ServingHoursService.getServingHours(branchSummary?.id);
        if (response.success) {
          setServingHoursStatus(response.data.currentStatus);
          setAllowOrdersOutsideHours(response.data.allowOrdersOutsideHours);
          
          // Note: Blocking logic is handled in the component render, not here
        }
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      }
    };

    loadServingHours();
  }, [branchSummary?.id, navigate]);

  const getServingHoursMessage = (status: ServingHoursStatus): string => {
    if (status.isOff) {
      if (status.nextOpenDay && status.nextOpenTimeString) {
        return t("checkout.servingHours.closedTodayNextDay", {
          day: status.nextOpenDay,
          time: status.nextOpenTimeString,
        });
      }
      return t("checkout.servingHours.closedToday");
    }

    if (status.hoursUntilOpen !== undefined && status.minutesUntilOpen !== undefined) {
      const parts: string[] = [];
      
      if (status.hoursUntilOpen > 0) {
        const hourText = status.hoursUntilOpen === 1 
          ? t("checkout.servingHours.hour", { count: 1 })
          : t("checkout.servingHours.hours", { count: status.hoursUntilOpen });
        parts.push(`${status.hoursUntilOpen} ${hourText}`);
      }
      
      if (status.minutesUntilOpen > 0) {
        const minuteText = status.minutesUntilOpen === 1
          ? t("checkout.servingHours.minute", { count: 1 })
          : t("checkout.servingHours.minutes", { count: status.minutesUntilOpen });
        parts.push(`${status.minutesUntilOpen} ${minuteText}`);
      }

      let message = t("checkout.servingHours.currentlyClosed");
      if (parts.length > 0) {
        message += " " + t("checkout.servingHours.willOpenIn", {
          time: parts.join(" " + t("checkout.servingHours.and") + " "),
        });
      } else if (status.minutesUntilOpen === 0) {
        message += " " + t("checkout.servingHours.willOpenSoon");
      }

      if (status.nextOpenTimeString) {
        message += " " + t("checkout.servingHours.orderWillBeServed", {
          time: status.nextOpenTimeString,
        });
      }

      return message;
    }

    return status.message || t("checkout.servingHours.closed");
  };

  // Load settings, meals, and addons for tax calculations
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = (await getToken()) || undefined;

        // Load settings
        const settingsResponse = await SettingsService.getSettings(token);
        if (settingsResponse.success) {
          setSettings(settingsResponse.data);
        }

        // Load meals data with error handling (MEAL items only)
        const mealIds = [
          ...new Set(
            cartItems
              .filter((item) => (item.itemType || "MEAL") === "MEAL")
              .map((item) => item.mealId)
              .filter(Boolean)
          ),
        ] as string[];
        const mealsData = await Promise.allSettled(
          // Fetch via public endpoint to avoid authenticated requests being implicitly scoped
          // to a possibly different selected organization (which can make valid meals look missing).
          mealIds.map((id) => mealService.getMealById(id, undefined, branchSummary?.id))
        );

        // Filter successful results and track failed ones
        const validMeals: Meal[] = [];
        const invalidMealIds: string[] = [];

        mealsData.forEach((result, index) => {
          if (result.status === "fulfilled") {
            validMeals.push(result.value);
          } else {
            invalidMealIds.push(mealIds[index]);
            console.error(
              `Failed to fetch meal ${mealIds[index]}:`,
              result.reason
            );
          }
        });

        setMeals(validMeals);

        // Load deal details for tax breakdown (DEAL items only)
        const dealIds = [
          ...new Set(
            cartItems
              .filter((item: any) => (item.itemType || "MEAL") === "DEAL")
              .map((item: any) => item.dealId)
              .filter(Boolean)
          ),
        ] as string[];

        if (dealIds.length > 0) {
          const apiService = ApiService.getInstance();
          const dealResults = await Promise.allSettled(
            dealIds.map((id) => apiService.getDeal(id, branchSummary?.id))
          );

          const validDeals = dealResults
            .filter((r) => r.status === "fulfilled")
            .map((r) => (r as PromiseFulfilledResult<any>).value)
            .filter((res: any) => res?.success && res?.data)
            .map((res: any) => res.data);

          // Keep a minimal shape for taxCalculator (id + components)
          setDealsForTax(
            (validDeals || []).map((d: any) => ({
              id: d.id,
              components: Array.isArray(d.components) ? d.components : [],
            }))
          );
        } else {
          setDealsForTax([]);
        }

        // Remove invalid cart items from the cart
        if (invalidMealIds.length > 0) {
          const invalidItems = cartItems.filter(
            (item) =>
              (item.itemType || "MEAL") === "MEAL" &&
              item.mealId &&
              invalidMealIds.includes(item.mealId)
          );

          invalidItems.forEach((item) => {
            // Remove invalid items from cart
            removeItem(item.id);
          });

          toast.error(
            t("checkout.step2.mealsRemoved", {
              count: invalidItems.length,
            }) ||
              `${invalidItems.length} item(s) were removed from your cart because they are no longer available.`,
            {
              duration: 5000,
              style: {
                background: "rgba(239, 68, 68, 0.9)",
                color: "#ffffff",
                border: "1px solid rgba(239, 68, 68, 0.5)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
              },
            }
          );

          // Redirect to cart if all items were invalid
          if (validMeals.length === 0) {
            setTimeout(() => {
              navigate("/cart");
            }, 2000);
            return;
          }
        }

        // Load addons data with error handling
        const addonIds = [
          ...new Set(cartItems.flatMap((item) => item.addOns.map((a) => a.id)).filter((id) => id && id.length > 0)),
        ];
        if (addonIds.length > 0) {
          const addonsData = await Promise.allSettled(
            addonIds.map((id) => addonService.getAddonById(id, undefined, branchSummary?.id))
          );

          // Filter successful results
          const validAddons = addonsData
            .filter((result) => result.status === "fulfilled")
            .map((result) => (result as PromiseFulfilledResult<Addon>).value);

          setAddons(validAddons);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        // Use default values if settings fail to load
        setSettings({
          taxPercentage: 8.5,
          deliveryFee: 3.99,
          minimumOrderAmount: 15.0,
          currency: "USD",
          acceptCash: true,
          acceptOnlinePayment: true,
        } as Settings);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    if (isSignedIn && cartItems.length > 0) {
      loadData();
    }
  }, [isSignedIn, getToken, cartItems]);

  // Calculate tax breakdown when data is loaded or delivery fee changes
  useEffect(() => {
    if (settings && cartItems.length > 0) {
      const currentSubtotal = totalAmount; // Calculate subtotal here

      // Calculate delivery fee here (same logic as above)
      const useDynamicDeliveryFee = settings.useDynamicDeliveryFee || false;
      const useTieredDeliveryFee = settings.useTieredDeliveryFee || false;
      let baseDeliveryFee = Number(settings.deliveryFee || 3.99) || 3.99;

      // If tiered delivery fee is enabled and distance is available, calculate using tiered pricing
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

          if (
            extendedThreshold &&
            extendedRate &&
            distance > extendedThreshold
          ) {
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
      else if (useDynamicDeliveryFee && deliveryDistance !== null) {
        const deliveryRatePerKm = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
        if (deliveryRatePerKm > 0) {
          baseDeliveryFee = deliveryDistance * deliveryRatePerKm;
        }
      }

      const enableFreeDelivery = getBranchOrSettingsValue(fullBranch?.enableFreeDelivery, settings?.enableFreeDelivery, false);
      const freeDeliveryThreshold = Number(getBranchOrSettingsValue(fullBranch?.freeDeliveryThreshold, settings?.freeDeliveryThreshold, 50.0));

      const currentDeliveryFee =
        enableFreeDelivery && currentSubtotal >= freeDeliveryThreshold
          ? 0
          : baseDeliveryFee;

      // When merging orders, delivery fee should not be charged again (already counted in the original order)
      const deliveryFeeForTax =
        mergeWithOrderId
          ? 0
          : orderType === "PICKUP"
          ? 0
          : currentDeliveryFee;

      // Only calculate tax if we have delivery fee or if dynamic/tiered delivery fee is disabled
      // For dynamic/tiered delivery fee, we'll calculate tax once address is selected
      // For PICKUP orders, always calculate tax (no delivery fee needed)
      // For merged orders, delivery fee is treated as 0 so we can calculate tax without requiring deliveryDistance.
      const shouldCalculateTax =
        orderType === "PICKUP" ||
        !!mergeWithOrderId ||
        (!useDynamicDeliveryFee && !useTieredDeliveryFee) ||
        ((useDynamicDeliveryFee || useTieredDeliveryFee) &&
          deliveryDistance !== null);

      if (shouldCalculateTax) {
        // Create a settings-like object from branch data for calculateTax function
        const taxSettings = {
          taxPercentage: Number(getBranchOrSettingsValue(fullBranch?.taxPercentage, settings?.taxPercentage, 8.5)),
          deliveryTaxPercentage: Number(getBranchOrSettingsValue(fullBranch?.deliveryTaxPercentage, settings?.deliveryTaxPercentage, 8.5)),
          taxInclusive: getBranchOrSettingsValue(fullBranch?.taxInclusive, settings?.taxInclusive, false),
        };
        
        const breakdown = calculateTax(
          cartItems,
          meals as any, // May be empty when cart contains only deals
          addons,
          { ...settings, ...taxSettings }, // Merge branch tax settings with settings
          deliveryFeeForTax,
          dealsForTax
        );
        setTaxBreakdown(breakdown);
      } else {
        // Don't calculate tax yet if dynamic delivery fee is enabled but no address selected
        setTaxBreakdown(null);
      }
    }
  }, [settings, meals, addons, dealsForTax, cartItems, totalAmount, deliveryDistance, fullBranch, orderType, mergeWithOrderId]);

  // Scroll to top when navigating to step 2
  useEffect(() => {
    if (currentStep === 2) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep]);

  const loadUserProfile = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const result = await apiService.getUserProfile(token);

      if (result.success && result.data) {
        // Auto-populate phone number if available
        if (result.data.phone && !deliveryInfo.phone) {
          const phoneValue = result.data.phone;
          setDeliveryInfo((prev) => ({
            ...prev,
            phone: phoneValue,
          }));
          
          // Validate the auto-populated phone number
          const digitsOnly = phoneValue.replace(/\D/g, "");
          if (digitsOnly.length < 7) {
            setPhoneError(t("checkout.step1.addressSelector.phoneTooShort") || "Phone number is too short (minimum 7 digits required)");
          } else if (digitsOnly.length > 15) {
            setPhoneError(t("checkout.step1.addressSelector.phoneTooLong") || "Phone number cannot exceed 15 digits");
          } else {
            setPhoneError("");
          }
        }
      }
    } catch (error) {
      console.error("Failed to load user profile:", error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Calculate total with tax and delivery fee from branch (fallback to settings)
  const subtotal = totalAmount;
  
  const enableFreeDelivery = getBranchOrSettingsValue(fullBranch?.enableFreeDelivery, settings?.enableFreeDelivery, false);
  const freeDeliveryThreshold = Number(getBranchOrSettingsValue(fullBranch?.freeDeliveryThreshold, settings?.freeDeliveryThreshold, 50.0));
  const useDynamicDeliveryFee = getBranchOrSettingsValue(fullBranch?.useDynamicDeliveryFee, settings?.useDynamicDeliveryFee, false);
  const useTieredDeliveryFee = getBranchOrSettingsValue(fullBranch?.useTieredDeliveryFee, settings?.useTieredDeliveryFee, false);

  // Calculate delivery fee
  let baseDeliveryFee = Number(getBranchOrSettingsValue(fullBranch?.deliveryFee, settings?.deliveryFee, 3.99));

  // If tiered delivery fee is enabled and distance is available, calculate using tiered pricing
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
      // Within initial range: fixed price
      baseDeliveryFee = initialPrice;
    } else {
      // Beyond initial range: calculate tiered pricing
      let fee = initialPrice; // Start with initial fixed price

      if (extendedThreshold && extendedRate && distance > extendedThreshold) {
        // Beyond extended threshold: use extended rate
        const standardRangeKm =
          Math.min(distance, extendedThreshold) - initialRange;
        const extendedRangeKm = distance - extendedThreshold;

        fee =
          initialPrice +
          standardRangeKm * standardRate +
          extendedRangeKm * extendedRate;
      } else {
        // Between initial range and extended threshold (or no extended threshold): use standard rate
        const additionalKm = distance - initialRange;
        fee = initialPrice + additionalKm * standardRate;
      }

      baseDeliveryFee = fee;
    }
  }
  // If dynamic delivery fee is enabled and distance is available, calculate from distance
  else if (useDynamicDeliveryFee && deliveryDistance !== null) {
    const deliveryRatePerKm = Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0));
    if (deliveryRatePerKm > 0) {
      baseDeliveryFee = deliveryDistance * deliveryRatePerKm;
    }
  }

  // Calculate delivery fee based on free delivery setting
  // When merging orders, delivery fee is 0 (already paid in original order)
  const deliveryFee =
    mergeWithOrderId
      ? 0
      : orderType === "PICKUP"
      ? 0
      : enableFreeDelivery && subtotal >= freeDeliveryThreshold
      ? 0
      : baseDeliveryFee;

  const enableMinimumOrder = getBranchOrSettingsValue(fullBranch?.enableMinimumOrder, settings?.enableMinimumOrder, false);
  const minimumOrderAmount = Number(getBranchOrSettingsValue(fullBranch?.minimumOrderAmount, settings?.minimumOrderAmount, 15.0));
  const taxPercentage = Number(getBranchOrSettingsValue(fullBranch?.taxPercentage, settings?.taxPercentage, 8.5));
  const taxInclusive = Boolean(
    getBranchOrSettingsValue(fullBranch?.taxInclusive, settings?.taxInclusive, false)
  );
  const currency = getBranchOrSettingsValue(fullBranch?.currency, settings?.currency, "USD");

  const pickupTakeawayServiceFee = Number(
    getBranchOrSettingsValue(
      (fullBranch as any)?.pickupTakeawayServiceFee,
      (settings as any)?.pickupTakeawayServiceFee,
      0
    )
  );

  const takeawayServiceTaxPercentage = Number(
    getBranchOrSettingsValue(
      (fullBranch as any)?.serviceTaxPercentage,
      (settings as any)?.serviceTaxPercentage,
      0
    )
  );
  // Payment Settings - Branch settings take precedence. If branch explicitly sets a payment method to false, it's disabled.
  // Only fall back to settings if branch value is null/undefined (not configured for that branch)
  // For PICKUP orders, use pickup payment settings; for DELIVERY, use delivery payment settings
  const acceptCash = orderType === "PICKUP"
    ? (fullBranch?.pickupAcceptCash !== null && fullBranch?.pickupAcceptCash !== undefined 
        ? fullBranch.pickupAcceptCash 
        : (settings?.pickupAcceptCash ?? true))
    : (fullBranch?.acceptCash !== null && fullBranch?.acceptCash !== undefined 
        ? fullBranch.acceptCash 
        : (settings?.acceptCash ?? true));

  const orgOnlinePaymentsAllowed = fullBranch?.organization?.onlinePaymentsAllowed;
  const orgCardPaymentsAllowed = fullBranch?.organization?.cardPaymentsAllowed;
  const orgPayPalAllowed = fullBranch?.organization?.paypalAllowed;
  
  // For PICKUP: Show card/online payment if EITHER pickupAcceptCard OR pickupAcceptOnlinePayment is enabled
  // For DELIVERY: Use acceptOnlinePayment
  const acceptOnlinePaymentBase = orderType === "PICKUP"
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

  const acceptOnlinePayment =
    acceptOnlinePaymentBase && orgOnlinePaymentsAllowed !== false && orgCardPaymentsAllowed !== false;
  
  const acceptPayPalBase = orderType === "PICKUP"
    ? (() => {
        // For PICKUP: Check branch pickup PayPal setting first, then fall back to global settings
        if (fullBranch?.pickupAcceptPayPal !== null && fullBranch?.pickupAcceptPayPal !== undefined) {
          return fullBranch.pickupAcceptPayPal;
        }
        return settings?.pickupAcceptPayPal ?? false;
      })()
    : (fullBranch?.acceptPayPal !== null && fullBranch?.acceptPayPal !== undefined 
        ? fullBranch.acceptPayPal 
        : (settings?.acceptPayPal ?? false));

  const acceptPayPal = acceptPayPalBase && orgOnlinePaymentsAllowed !== false && orgPayPalAllowed !== false;

  const availablePaymentMethods = useMemo(() => {
    const methods: Array<"card" | "paypal" | "cod"> = [];
    if (acceptOnlinePayment) methods.push("card");
    if (acceptPayPal) methods.push("paypal");
    if (acceptCash) methods.push("cod");
    return methods;
  }, [acceptCash, acceptOnlinePayment, acceptPayPal]);

  // Keep selected payment method valid for the chosen branch + orderType.
  // This is especially important for PICKUP where allowed methods can differ per-branch
  // and can inherit from global settings.
  useEffect(() => {
    if (!settings) return;
    if (availablePaymentMethods.length === 0) return;

    if (!availablePaymentMethods.includes(paymentMethod)) {
      setPaymentMethod(availablePaymentMethods[0]);
    }
  }, [settings, availablePaymentMethods, paymentMethod]);

  useEffect(() => {
    if (!(import.meta as any)?.env?.DEV) return;
    console.log("[WebCheckout][TaxDebug] resolved", {
      branchId: (fullBranch as any)?.id,
      branchName: (fullBranch as any)?.name,
      branchTaxInclusive: (fullBranch as any)?.taxInclusive,
      settingsTaxInclusive: (settings as any)?.taxInclusive,
      taxInclusive,
      taxPercentage,
      orderType,
      mergeWithOrderId,
      hasTaxBreakdown: Boolean(taxBreakdown),
      shouldRenderTaxUi: !taxInclusive,
    });
  }, [
    fullBranch,
    settings,
    taxInclusive,
    taxPercentage,
    orderType,
    mergeWithOrderId,
    taxBreakdown,
  ]);

  // Use detailed tax breakdown if available, otherwise fallback to simple calculation
  const itemTax = taxBreakdown?.itemTaxAmount || 0;
  const addonTax = taxBreakdown?.addonTaxAmount || 0;
  // When merging orders, delivery tax is 0 (already paid in original order)
  const deliveryTax = mergeWithOrderId ? 0 : (taxBreakdown?.deliveryTaxAmount || 0);

  const takeawayServiceFeeToAdd =
    orderType === "PICKUP" ? (mergeWithOrderId ? 0 : pickupTakeawayServiceFee) : 0;

  const takeawayServiceTaxAmount = useMemo(() => {
    if (orderType !== "PICKUP") return 0;
    if (mergeWithOrderId) return 0;
    if (takeawayServiceFeeToAdd <= 0) return 0;
    if (!takeawayServiceTaxPercentage || takeawayServiceTaxPercentage <= 0) return 0;

    // When taxInclusive=true, the service fee is considered gross; we don't add or show it separately
    if (taxInclusive) return 0;

    return (takeawayServiceFeeToAdd * takeawayServiceTaxPercentage) / 100;
  }, [orderType, mergeWithOrderId, takeawayServiceFeeToAdd, takeawayServiceTaxPercentage, taxInclusive]);
  const totalTax = mergeWithOrderId
    ? (itemTax + addonTax) // Only item and addon tax when merging
    : (taxBreakdown?.totalTaxAmount || (subtotal * taxPercentage) / 100);

  // Check if we should show delivery fee and tax
  // If dynamic or tiered delivery fee is enabled, only show after address is selected
  const shouldShowDeliveryFeeAndTax =
    (!useDynamicDeliveryFee && !useTieredDeliveryFee) ||
    ((useDynamicDeliveryFee || useTieredDeliveryFee) &&
      deliveryInfo.address &&
      deliveryDistance !== null);

  // When taxInclusive=true, tax is already embedded in the item/addon prices, so we should not add it again
  const taxToAdd = taxInclusive
    ? 0
    : (orderType === "PICKUP"
        ? itemTax + addonTax + takeawayServiceTaxAmount
        : mergeWithOrderId
        ? itemTax + addonTax
        : shouldShowDeliveryFeeAndTax
        ? totalTax
        : 0);

  const deliveryFeeToAdd =
    orderType === "PICKUP" ? 0 : shouldShowDeliveryFeeAndTax ? deliveryFee : 0;

  const finalTotal =
    subtotal + taxToAdd + deliveryFeeToAdd + takeawayServiceFeeToAdd;

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
              matchingTotal += Number(comp.unitPrice || 0) * Number(comp.quantity || 0);
            }
          }
        }
      }

      return Math.min(voucherBalance, matchingTotal);
    }

    return 0;
  }, [appliedVoucher, finalTotal, taxBreakdown]);

  const remainingTotal = Math.max(0, finalTotal - voucherDeduction);

  // Validate step 1 before proceeding
  const validateStep1 = (): boolean => {
    if (orderType === "PICKUP") {
      if (!pickupInfo.phone) {
        toast.error(
          t("checkout.pickup.phoneRequired") ||
            "Phone number is required for pickup orders"
        );
        return false;
      }
      const digitsOnly = pickupInfo.phone.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        toast.error(
          t("checkout.step1.addressSelector.invalidPhoneNumber") ||
            "Please enter a valid phone number"
        );
        return false;
      }
      return true;
    }

    const isAddressTypeValid =
      deliveryInfo.addressType === "HOUSE" || deliveryInfo.addressType === "BUILDING";
    const isDeliveryAddressValid =
      !!deliveryInfo.address &&
      !!deliveryInfo.postalCode &&
      isAddressTypeValid &&
      (deliveryInfo.addressType === "HOUSE"
        ? !!deliveryInfo.houseNumber
        : !!deliveryInfo.building && !!deliveryInfo.floor && !!deliveryInfo.apartment);

    if (!isDeliveryAddressValid || !deliveryInfo.phone) {
      toast.error(t("checkout.step1.fillRequiredFields"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return false;
    }
    if (!availability?.available || !branchSummary?.id) {
      toast.error(
        (!availability?.available &&
          "message" in (availability as any) &&
          (availability as any).message) ||
          t("checkout.step1.addressGeocodingFailed"),
        {
          duration: 4000,
          style: {
            background: "rgba(239, 68, 68, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(239, 68, 68, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
          },
        }
      );
      return false;
    }
    return true;
  };

  // Validate cart against deliverable quantity limits
  const validateCartLimits = useCallback(async (): Promise<boolean> => {
    if (!branchSummary?.id || cartItems.length === 0) {
      return true;
    }

    try {
      setIsValidatingCart(true);
      setCartValidationErrors([]);

      // Build cart items for validation (MEAL items only)
      const itemsForValidation = cartItems
        .filter((item) => (item.itemType || "MEAL") === "MEAL")
        .map((item) => {
        // Get the meal to find the size type
        const meal = meals.find((m) => m.id === item.mealId);
        const mealSize = meal?.mealSizes?.find((s) => s.name === item.size);
        
        return {
          mealId: item.mealId || item.id.split("-")[0], // Extract mealId from id if not available
          mealSizeType: mealSize?.sizeType || null,
          quantity: item.quantity,
        };
      });

      const result = await deliverableQuantityService.validateCart(
        branchSummary.id,
        itemsForValidation
      );

      if (!result.valid) {
        setCartValidationErrors(result.errors);
        // Show error toast for each validation error
        result.errors.forEach((error) => {
          toast.error(error, {
            duration: 5000,
            style: {
              background: "rgba(239, 68, 68, 0.9)",
              color: "#ffffff",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
            },
          });
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error validating cart limits:", error);
      // Don't block checkout on validation errors - backend will validate too
      return true;
    } finally {
      setIsValidatingCart(false);
    }
  }, [branchSummary?.id, cartItems, meals]);

  const handleNextStep = async () => {
    if (!validateStep1()) {
      return;
    }

    // Validate minimum order amount for scheduled orders
    if (scheduledDate) {
      const scheduledOrderMinimumAmount = 
        fullBranch?.scheduledOrderMinimumAmount !== null && fullBranch?.scheduledOrderMinimumAmount !== undefined
          ? fullBranch.scheduledOrderMinimumAmount
          : settings?.scheduledOrderMinimumAmount ?? 0;

      if (scheduledOrderMinimumAmount > 0 && totalAmount < scheduledOrderMinimumAmount) {
        toast.error(
          t("checkout.step1.scheduledOrderMinimumNotMet", {
            minimum: formatPrice(scheduledOrderMinimumAmount, currency),
            current: formatPrice(totalAmount, currency),
          }) || `Minimum order amount for scheduled orders is ${formatPrice(scheduledOrderMinimumAmount, currency)}. Your current total is ${formatPrice(totalAmount, currency)}.`,
          {
            duration: 6000,
            style: {
              background: "rgba(239, 68, 68, 0.9)",
              color: "#ffffff",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
              fontSize: "16px",
              fontWeight: "500",
              padding: "16px 24px",
            },
          }
        );
        return;
      }
    }

    // Validate cart against deliverable quantity limits
    const cartValid = await validateCartLimits();
    if (!cartValid) {
      return;
    }

    setCurrentStep(2);
    // The useEffect will handle checking for active order when step changes
  };

  const handleMergeOrder = async () => {
    if (activeOrder) {
      setMergeWithOrderId(activeOrder.id);
      setHasDecidedOnMerge(true);

      // Pre-populate address fields from the previous order
      const newAddress = activeOrder.deliveryAddress || "";
      setDeliveryInfo((prev) => ({
        ...prev,
        address: newAddress || prev.address || "",
        // Existing orders may not have structured fields saved; keep defaults unless you can parse.
        streetAddress: prev.streetAddress || "",
        postalCode: prev.postalCode || "",
        addressType: prev.addressType || "HOUSE",
        houseNumber: prev.houseNumber || "",
        building: activeOrder.deliveryBuilding || prev.building || "",
        floor: activeOrder.deliveryFloor || prev.floor || "",
        apartment: activeOrder.deliveryApartment || prev.apartment || "",
        extraDetails: activeOrder.deliveryExtraDetails || prev.extraDetails || "",
        phone: activeOrder.deliveryPhone || prev.phone || "",
        notes: activeOrder.deliveryNotes || prev.notes || "",
      }));

      setPickupInfo((prev) => ({
        phone: activeOrder.pickupPhone || prev.phone || "",
        notes: activeOrder.pickupNotes || prev.notes || "",
      }));

      // Auto-select the payment method based on the existing order
      // User must use the same payment method they used for the original order
      if (activeOrder.paymentMethod === "ONLINE_PAYMENT") {
        // Check if it was PayPal or Stripe based on payment provider
        if (activeOrder.payment?.paymentProvider === "PAYPAL") {
          setPaymentMethod("paypal");
        } else {
          setPaymentMethod("card");
        }
      } else {
        setPaymentMethod("cod");
      }

      // For DELIVERY orders, calculate the delivery distance from the pre-populated address
      if (orderType === "DELIVERY" && newAddress && fullBranch?.latitude && fullBranch?.longitude) {
        try {
          // Check if Google Maps is loaded
          if (window.google?.maps?.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ address: newAddress }, (results: any, status: any) => {
              if (status === "OK" && results && results[0]) {
                const location = results[0].geometry.location;
                const addressLat = location.lat();
                const addressLon = location.lng();
                
                const branchLat =
                  typeof fullBranch.latitude === "string"
                    ? parseFloat(fullBranch.latitude)
                    : Number(fullBranch.latitude);
                const branchLon =
                  typeof fullBranch.longitude === "string"
                    ? parseFloat(fullBranch.longitude)
                    : Number(fullBranch.longitude);
                
                if (
                  typeof addressLat === "number" &&
                  typeof addressLon === "number" &&
                  !Number.isNaN(branchLat) &&
                  !Number.isNaN(branchLon)
                ) {
                  const distance = calculateDistance(
                    branchLat,
                    branchLon,
                    addressLat,
                    addressLon
                  );
                  setDeliveryDistance(distance);
                }
              }
            });
          }
        } catch (error) {
          console.error("Failed to calculate delivery distance:", error);
        }
      }

      setShowMergeDialog(false);
      // Move to step 2 directly if currently on step 1
      if (currentStep === 1) {
        setCurrentStep(2);
      }
    }
  };

  const handleDontMerge = () => {
    setMergeWithOrderId(undefined);
    setHasDecidedOnMerge(true);
    setShowMergeDialog(false);
  };

  const handlePreviousStep = () => {
    setCurrentStep(1);
  };

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    setIsPaymentComplete(true);
    
    // Check if this is a pre-order reservation
    const pendingReservation = sessionStorage.getItem("pendingReservation");
    
    if (pendingReservation) {
      try {
        const token = await getToken();
        const reservationData = JSON.parse(pendingReservation);
        
        // Wait a bit for the order to be created, then create pre-order reservation
        setTimeout(async () => {
          try {
            // Get the order that was just created (we'll need to fetch it or pass orderId)
            // For now, we'll create the reservation with the payment intent ID
            // The backend will link it to the order
            await reservationService.createPreOrderReservation(
              {
                reservationDate: reservationData.date,
                time: reservationData.time,
                numberOfGuests: reservationData.numberOfGuests,
                customerName: reservationData.customerName,
                customerEmail: reservationData.customerEmail,
                customerPhone: reservationData.customerPhone,
                specialRequests: reservationData.specialRequests || undefined,
                preferredZone: reservationData.preferredZone || undefined,
                orderItems: cartItems
                  .filter((item) => (item.itemType || "MEAL") === "MEAL")
                  .map((item) => ({
                    mealId: item.mealId,
                    mealSizeType: item.size,
                    quantity: item.quantity,
                    addons: item.addOns || [],
                    optionalIngredients: item.optionalIngredients || [],
                    specialInstructions: item.specialInstructions || undefined,
                  })),
                paymentIntentId,
              },
              token || undefined
            );
            
            // Clear reservation data from sessionStorage
            sessionStorage.removeItem("pendingReservation");
            clearCart();
            clearOrderModificationMode();
            useCheckoutDraftStore.getState().clearDraft();
            
            toast.success(t("reservations.checkout.createdSuccess"), {
              duration: 4000,
              style: {
                background: "rgba(34, 197, 94, 0.9)",
                color: "#ffffff",
                border: "1px solid rgba(34, 197, 94, 0.5)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
              },
            });
            
            // Redirect to my reservations page
            setTimeout(() => {
              navigate("/reservations/my-reservations");
            }, 2000);
          } catch (error: any) {
            console.error("Error creating pre-order reservation:", error);
            // Fall back to order confirmation if reservation creation fails
            clearCart();
            clearOrderModificationMode();
            sessionStorage.removeItem("pendingReservation");
            useCheckoutDraftStore.getState().clearDraft();
            navigate("/order-confirmation", {
              state: { paymentIntentId, orderTotal: finalTotal },
            });
          }
        }, 3000); // Wait 3 seconds for order to be created
      } catch (error) {
        console.error("Error processing pre-order reservation:", error);
        // Fall back to normal order flow
        clearCart();
        clearOrderModificationMode();
        sessionStorage.removeItem("pendingReservation");
        useCheckoutDraftStore.getState().clearDraft();
        navigate("/order-confirmation", {
          state: { paymentIntentId, orderTotal: finalTotal },
        });
      }
    } else {
      // Normal order flow
      clearCart();
      clearOrderModificationMode();
      useCheckoutDraftStore.getState().clearDraft();
      toast.success(t("checkout.step2.orderPlacedSuccess"), {
        duration: 4000,
        style: {
          background: "rgba(34, 197, 94, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
        },
      });

      // Redirect to order confirmation page after 2 seconds
      setTimeout(() => {
        navigate("/order-confirmation", {
          state: { paymentIntentId, orderTotal: finalTotal },
        });
      }, 2000);
    }
  };

  const handlePaymentError = (error: string) => {
    toast.error(t("checkout.step2.paymentFailed", { error }), {
      duration: 4000,
      style: {
        background: "rgba(239, 68, 68, 0.9)",
        color: "#ffffff",
        border: "1px solid rgba(239, 68, 68, 0.5)",
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
      },
    });
  };

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    setIsValidatingVoucher(true);
    setVoucherError(null);
    try {
      const token = isSignedIn ? await getToken() : null;
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/v1/vouchers/validate`, {
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
              defaultValue: `This single-purpose voucher is only for items with {{vatRate}}% VAT, but there are no matching items in your cart.`,
              vatRate: voucher.vatRate,
            })
          );
        }
      }
      
      setAppliedVoucher(voucher);
    } catch (err: any) {
      setVoucherError(err?.message || "Fehler beim Einlösen des Gutscheins");
      toast.error(err?.message || "Fehler beim Einlösen des Gutscheins");
    } finally {
      setIsValidatingVoucher(false);
    }
  };

  const handleVoucherOnlyCheckout = async () => {
    if (!appliedVoucher) return;
    setIsPlacingOrder(true);
    try {
      const token = isSignedIn ? await getToken() : null;
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/v1/orders/create-cod`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderType: orderType,
          deliveryAddress: orderType === "PICKUP" ? undefined : deliveryInfo.address,
          deliveryStreetAddress: orderType === "PICKUP" ? undefined : deliveryInfo.streetAddress,
          deliveryHouseNumber: orderType === "PICKUP" ? undefined : deliveryInfo.houseNumber,
          deliveryPostalCode: orderType === "PICKUP" ? undefined : deliveryInfo.postalCode,
          deliveryBuilding: orderType === "PICKUP" ? undefined : deliveryInfo.building,
          deliveryFloor: orderType === "PICKUP" ? undefined : deliveryInfo.floor,
          deliveryApartment: orderType === "PICKUP" ? undefined : deliveryInfo.apartment,
          deliveryExtraDetails: orderType === "PICKUP" ? undefined : deliveryInfo.extraDetails,
          deliveryPhone: orderType === "PICKUP" ? undefined : deliveryInfo.phone,
          deliveryNotes: orderType === "PICKUP" ? undefined : deliveryInfo.notes,
          pickupPhone: orderType === "PICKUP" ? pickupInfo.phone : undefined,
          pickupNotes: orderType === "PICKUP" ? pickupInfo.notes : undefined,
          subtotal: subtotal,
          deliveryFee: orderType === "PICKUP" ? 0 : deliveryFee,
          tax: totalTax,
          totalAmount: finalTotal,
          deliveryDistanceKm: orderType === "PICKUP" ? undefined : deliveryDistance ?? undefined,
          cartItems: cartItems,
          mergeWithOrderId: mergeWithOrderId,
          branchId: branchSummary?.id,
          scheduledDate: scheduledDate?.toISOString() || undefined,
          replacesOrderId: replacesOrderId || undefined,
          appliedVoucherCode: appliedVoucher.voucherCode,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Bestellung fehlgeschlagen");
      }
      
      toast.success(t("checkout.step2.orderPlacedSuccess") || "Bestellung erfolgreich aufgegeben!");
      clearCart();
      useCheckoutDraftStore.getState().clearDraft();
      navigate("/order-confirmation", {
        state: {
          paymentIntentId: result.data?.orderNumber || "VOUCHER-" + Date.now(),
          orderTotal: finalTotal,
          paymentMethod: "VOUCHER",
        },
      });
    } catch (err: any) {
      toast.error(err?.message || "Fehler beim Aufgeben der Bestellung");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleCODPayment = async () => {
    try {
      const token = await getToken();
      if (!token) {
        toast.error(t("checkout.step2.authenticationRequired"));
        return;
      }

      // Check serving hours - only block if not allowed and not a scheduled order
      if (servingHoursStatus && !servingHoursStatus.isOpen && !allowOrdersOutsideHours && !scheduledDate) {
        toast.error(
          getServingHoursMessage(servingHoursStatus),
          {
            duration: 6000,
            style: {
              background: "rgba(239, 68, 68, 0.9)",
              color: "#ffffff",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
            },
          }
        );
        return;
      }

      // Re-validate cart limits before placing order
      const cartValid = await validateCartLimits();
      if (!cartValid) {
        return;
      }

      // Validate minimum order amount if enabled
      if (enableMinimumOrder && subtotal < minimumOrderAmount) {
        toast.error(
          t("checkout.step2.minimumOrderAmountError", {
            amount: formatPrice(minimumOrderAmount, currency),
          })
        );
        return;
      }

      // Validate required fields based on order type
      if (orderType === "PICKUP") {
        if (!pickupInfo.phone) {
          toast.error(
            t("checkout.pickup.phoneRequired") ||
              "Phone number is required for pickup orders"
          );
          return;
        }
        const digitsOnlyPickup = pickupInfo.phone.replace(/\D/g, "");
        if (digitsOnlyPickup.length < 7 || digitsOnlyPickup.length > 15) {
          toast.error(
            t("checkout.step1.addressSelector.invalidPhoneNumber") ||
              "Please enter a valid phone number"
          );
          return;
        }
      } else {
        const isAddressTypeValid =
          deliveryInfo.addressType === "HOUSE" || deliveryInfo.addressType === "BUILDING";
        const isDeliveryAddressValid =
          !!deliveryInfo.address &&
          !!deliveryInfo.postalCode &&
          isAddressTypeValid &&
          (deliveryInfo.addressType === "HOUSE"
            ? !!deliveryInfo.houseNumber
            : !!deliveryInfo.building && !!deliveryInfo.floor && !!deliveryInfo.apartment);

        if (!isDeliveryAddressValid || !deliveryInfo.phone) {
          toast.error(t("checkout.step1.fillRequiredFields"));
          return;
        }
        const digitsOnlyDelivery = deliveryInfo.phone.replace(/\D/g, "");
        if (digitsOnlyDelivery.length < 7 || digitsOnlyDelivery.length > 15) {
          toast.error(
            t("checkout.step1.addressSelector.invalidPhoneNumber") ||
              "Please enter a valid phone number"
          );
          return;
        }
      }

      setIsPaymentComplete(true);

      // Create COD order directly
      const apiService = ApiService.getInstance();
      const result = await apiService.createCODOrder(token, {
        orderType,
        deliveryAddress: orderType === "PICKUP" ? undefined : deliveryInfo.address,
        deliveryStreetAddress:
          orderType === "PICKUP" ? undefined : deliveryInfo.streetAddress || undefined,
        deliveryHouseNumber:
          orderType === "PICKUP" ? undefined : deliveryInfo.houseNumber || undefined,
        deliveryPostalCode:
          orderType === "PICKUP" ? undefined : deliveryInfo.postalCode || undefined,
        deliveryBuilding: orderType === "PICKUP" ? undefined : deliveryInfo.building || undefined,
        deliveryFloor: orderType === "PICKUP" ? undefined : deliveryInfo.floor || undefined,
        deliveryApartment: orderType === "PICKUP" ? undefined : deliveryInfo.apartment || undefined,
        deliveryExtraDetails:
          orderType === "PICKUP" ? undefined : deliveryInfo.extraDetails || undefined,
        deliveryPhone: orderType === "PICKUP" ? undefined : deliveryInfo.phone,
        deliveryNotes: orderType === "PICKUP" ? undefined : deliveryInfo.notes,
        pickupPhone: orderType === "PICKUP" ? pickupInfo.phone : undefined,
        pickupNotes: orderType === "PICKUP" ? pickupInfo.notes : undefined,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        tax: totalTax,
        totalAmount: finalTotal,
        deliveryDistanceKm: orderType === "PICKUP" ? undefined : deliveryDistance ?? undefined,
        cartItems: cartItems,
        mergeWithOrderId: mergeWithOrderId,
        branchId: branchSummary?.id,
        scheduledDate: scheduledDate?.toISOString() || undefined,
        replacesOrderId: replacesOrderId || undefined,
        appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
      });

      if (result.success) {
        clearCart();
        clearOrderModificationMode();
        useCheckoutDraftStore.getState().clearDraft();
        toast.success(t("checkout.step2.orderPlacedSuccessCOD"), {
          duration: 4000,
          style: {
            background: "rgba(34, 197, 94, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(34, 197, 94, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          },
        });

        // Redirect to order confirmation page
        setTimeout(() => {
          navigate("/order-confirmation", {
            state: {
              paymentIntentId: result.data?.orderNumber || "COD-" + Date.now(),
              orderTotal: finalTotal,
              paymentMethod: "COD",
            },
          });
        }, 2000);
      } else {
        throw new Error(result.error || t("checkout.step2.failedToCreateOrder"));
      }
    } catch (error) {
      console.error("COD order error:", error);
      const errorMessage =
        error instanceof Error ? error.message : t("checkout.step2.orderFailed");
      toast.error(errorMessage, {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      setIsPaymentComplete(false);
    }
  };

  if (isPaymentComplete) {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-green-500 text-6xl mb-4">✓</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {t("checkout.step2.paymentSuccessful")}
              </h2>
              <p className="text-muted-foreground mb-4">
                {t("checkout.step2.orderConfirmed")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("checkout.step2.redirectingToConfirmation")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Block checkout access if outside hours and not allowed
  // Only block if we have loaded the serving hours data
  // This check must be AFTER all hooks are called
  // Skip this check for scheduled orders since they're for future delivery
  if (servingHoursStatus !== null && !servingHoursStatus.isOpen && !allowOrdersOutsideHours && !scheduledDate) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <Icon path={mdiAlert} size={2.00} className="text-red-600 dark:text-red-400" />
              <div>
                <h2 className="text-xl font-semibold text-red-900 dark:text-red-100 mb-2">
                  {t("checkout.servingHours.checkoutBlockedTitle")}
                </h2>
                <p className="text-sm text-red-800 dark:text-red-200 mb-4">
                  {getServingHoursMessage(servingHoursStatus)}
                </p>
                <Button
                  onClick={() => navigate("/cart")}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {t("checkout.servingHours.backToCart")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* Merge Order Dialog */}
      <Dialog
        open={showMergeDialog}
        onOpenChange={(open) => {
          if (!open) {
            // When dialog is closed (via X button or outside click), treat as "create new"
            handleDontMerge();
          } else {
            setShowMergeDialog(open);
          }
        }}
      >
        <DialogContent className="bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {t("checkout.mergeOrder.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              <Trans
                i18nKey="checkout.mergeOrder.description"
                values={{ orderNumber: activeOrder?.orderNumber }}
                components={{
                  bold: <span className="font-semibold text-foreground" />,
                }}
              />
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Icon path={mdiCheck} size={0.67} className="text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span>{t("checkout.mergeOrder.benefit1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon path={mdiCheck} size={0.67} className="text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span>{t("checkout.mergeOrder.benefit2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon path={mdiCheck} size={0.67} className="text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <span>{t("checkout.mergeOrder.benefit3")}</span>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDontMerge}
              className="border-border text-foreground hover:bg-accent hover:text-foreground bg-background"
            >
              {t("checkout.mergeOrder.createNewOrder")}
            </Button>
            <Button
              onClick={handleMergeOrder}
              className="bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-400 hover:to-rose-400"
            >
              {t("checkout.mergeOrder.mergeOrders")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (currentStep === 1) {
              navigate(-1);
            } else {
              handlePreviousStep();
            }
          }}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
        >
          <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
          {t("checkout.title")}
        </h1>
      </div>

      {/* Serving Hours Warning - only show for ASAP orders, not scheduled */}
      {servingHoursStatus && !servingHoursStatus.isOpen && !scheduledDate && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Icon path={mdiAlert} size={0.83} className="text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                  {t("checkout.servingHours.warningTitle")}
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  {getServingHoursMessage(servingHoursStatus)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div
        className={`gap-8 ${
          currentStep === 1
            ? "grid grid-cols-1"
            : "flex flex-col lg:grid lg:grid-cols-2"
        }`}
      >
        {/* Left Column - Step Content or Order Summary */}
        {currentStep === 1 ? (
          /* Step 1: Delivery Information */
          <div className="space-y-6">
            {isLoadingSettings ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ) : !settings ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    {t("checkout.step1.loadSettingsError")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Order Type Selector */}
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle>{t("checkout.orderType.title") || "Order Type"}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-3">
                    {effectiveDeliveryEnabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "flex-1 border border-border",
                          orderType === "DELIVERY" && "bg-pink-500 hover:bg-pink-600 text-white border-pink-500"
                        )}
                        onClick={() => setOrderType("DELIVERY")}
                      >
                        {t("checkout.orderType.delivery") || "Delivery"}
                      </Button>
                    )}
                    {effectivePickupEnabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "flex-1 border border-border",
                          orderType === "PICKUP" && "bg-pink-500 hover:bg-pink-600 text-white border-pink-500"
                        )}
                        onClick={() => setOrderType("PICKUP")}
                      >
                        {t("checkout.orderType.pickup") || "Pickup"}
                      </Button>
                    )}
                    {!effectiveDeliveryEnabled && !effectivePickupEnabled && (
                      <p className="text-sm text-muted-foreground">
                        {t("checkout.orderType.unavailable") || "Ordering is currently unavailable"}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Scheduled Order Picker */}
                {(() => {
                  // Get effective future order settings (branch override or global)
                  const masterFutureOrdersEnabled =
                    (fullBranch as any)?.futureOrdersEnabled ?? settings?.futureOrdersEnabled ?? false;

                  const perTypeFutureEnabled = orderType === "PICKUP"
                    ? ((fullBranch as any)?.enableFuturePickupOrders ?? settings?.enableFuturePickupOrders ?? false)
                    : ((fullBranch as any)?.enableFutureDeliveryOrders ?? settings?.enableFutureDeliveryOrders ?? false);

                  const isFutureOrderEnabled = masterFutureOrdersEnabled && perTypeFutureEnabled;
                  const futureOrderMaxDays = orderType === "PICKUP"
                    ? (fullBranch?.futurePickupOrderDays ?? settings?.futurePickupOrderDays ?? 0)
                    : (fullBranch?.futureDeliveryOrderDays ?? settings?.futureDeliveryOrderDays ?? 0);

                  const scheduledOrderTimeSlotInterval =
                    fullBranch?.scheduledOrderTimeSlotInterval ??
                    settings?.scheduledOrderTimeSlotInterval ??
                    30;
                  
                  return isFutureOrderEnabled && (
                    <Card className="mb-4">
                      <CardContent className="pt-6">
                        <ScheduledOrderPicker
                          orderType={orderType}
                          isEnabled={isFutureOrderEnabled}
                          maxDays={futureOrderMaxDays}
                          timeSlotIntervalMinutes={scheduledOrderTimeSlotInterval}
                          scheduledDate={scheduledDate}
                          onScheduledDateChange={(date) => setScheduledDate(date)}
                        />
                      </CardContent>
                    </Card>
                  );
                })()}

                {orderType === "PICKUP" ? (
                  <>
                    <PickupLocationDisplay branch={fullBranch || null} />
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("checkout.pickup.title") || "Pickup Information"}</CardTitle>
                      </CardHeader>
                    <CardContent className="space-y-4">
                      {settings?.businessPhone && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">{t("checkout.pickup.phone") || "Phone"}:</span> {settings.businessPhone}
                        </div>
                      )}
                      <div>
                        <Label htmlFor="pickupPhone">
                          {t("checkout.pickup.phone") || "Pickup Phone"}{" "}
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="pickupPhone"
                          type="tel"
                          value={pickupInfo.phone}
                          onChange={(e) =>
                            setPickupInfo((prev) => ({ ...prev, phone: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="pickupNotes">
                          {t("checkout.pickup.notes") || "Pickup Notes"}
                        </Label>
                        <Textarea
                          id="pickupNotes"
                          className="bg-transparent"
                          value={pickupInfo.notes}
                          onChange={(e) =>
                            setPickupInfo((prev) => ({ ...prev, notes: e.target.value }))
                          }
                        />
                      </div>
                      <Button
                        onClick={handleNextStep}
                        disabled={!pickupInfo.phone || !branchSummary?.id}
                        className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t("checkout.step1.continueToPayment")}
                        <Icon path={mdiArrowRight} size={0.67} className="ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                  </>
                ) : !deliveryAvailabilityConfirmed ? (
                  <DeliveryAvailabilityCheck
                    settings={settings}
                    onAvailabilityConfirmed={() => {
                      setDeliveryAvailabilityConfirmed(true);
                      useCheckoutDraftStore
                        .getState()
                        .setDeliveryAvailabilityConfirmed(true);
                    }}
                  />
                ) : (
                  <>
                    {settings && (
                      <EnhancedAddressSelector
                        settings={settings}
                        selectedAddress={deliveryInfo.address}
                        initialStreetAddress={deliveryInfo.streetAddress}
                        initialPostalCode={deliveryInfo.postalCode}
                        initialAddressType={deliveryInfo.addressType}
                        initialHouseNumber={deliveryInfo.houseNumber}
                        initialBuilding={deliveryInfo.building}
                        initialFloor={deliveryInfo.floor}
                        initialApartment={deliveryInfo.apartment}
                        initialExtraDetails={deliveryInfo.extraDetails}
                        onAddressChange={(address: DetailedAddress) =>
                          setDeliveryInfo((prev) => ({
                            ...prev,
                            address: address.fullAddress,
                            streetAddress: address.streetAddress || "",
                            postalCode: address.postalCode || "",
                            addressType: address.addressType || prev.addressType,
                            houseNumber: address.houseNumber || "",
                            building: address.building || "",
                            floor: address.floor || "",
                            apartment: address.apartment || "",
                            extraDetails: address.extraDetails || "",
                          }))
                        }
                        onDistanceCalculated={(distance) => {
                          setDeliveryDistance(distance);
                        }}
                      />
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {t("checkout.step1.contactInformation")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor="phone">
                            {t("checkout.step1.phoneNumber")}{" "}
                            <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder={
                              isLoadingProfile
                                ? t("common.loading")
                                : t("checkout.step1.phonePlaceholder")
                            }
                            value={deliveryInfo.phone}
                            onChange={(e) => {
                              const value = e.target.value;
                              const phoneRegex = /^[\d\s\-\(\)\+]*$/;
                              if (value === "" || phoneRegex.test(value)) {
                                setDeliveryInfo((prev) => ({
                                  ...prev,
                                  phone: value,
                                }));
                                const digitsOnly = value.replace(/\D/g, "");
                                if (value.trim() === "") {
                                  setPhoneError("");
                                } else if (digitsOnly.length < 7) {
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
                            }}
                            className={`mt-1 ${phoneError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                            disabled={isLoadingProfile}
                          />
                          {phoneError && (
                            <p className="text-xs text-red-500 mt-1">{phoneError}</p>
                          )}
                          {isLoadingProfile && !phoneError && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("checkout.step1.loadingPhone")}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="notes">
                            {t("checkout.step1.specialInstructions")}
                          </Label>
                          <Textarea
                            id="notes"
                            placeholder={t(
                              "checkout.step1.specialInstructionsPlaceholder"
                            )}
                            value={deliveryInfo.notes}
                            onChange={(e) =>
                              setDeliveryInfo((prev) => ({
                                ...prev,
                                notes: e.target.value,
                              }))
                            }
                            className="mt-1 bg-transparent"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Button
                      onClick={handleNextStep}
                      disabled={
                        !deliveryInfo.address ||
                        !deliveryInfo.postalCode ||
                        (deliveryInfo.addressType === "HOUSE"
                          ? !deliveryInfo.houseNumber
                          : !deliveryInfo.building || !deliveryInfo.floor || !deliveryInfo.apartment) ||
                        !deliveryInfo.phone ||
                        !!phoneError ||
                        !branchSummary?.id ||
                        !availability?.available
                      }
                      className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t("checkout.step1.continueToPayment")}
                      <Icon path={mdiArrowRight} size={0.67} className="ml-2" />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          /* Step 2: Payment Method Selection */
          <div className="space-y-6 order-2 lg:order-1">
            {/* Minimum Order Amount Warning */}
            {!isLoadingSettings &&
              enableMinimumOrder &&
              subtotal < minimumOrderAmount && (
                <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                  <CardContent className="pt-6">
                    <div className="flex items-center space-x-2 text-orange-800 dark:text-orange-200">
                      <svg
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="font-medium">
                        {t("checkout.step2.minimumOrderWarning", {
                          amount: formatPrice(minimumOrderAmount, currency),
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-orange-700 dark:text-orange-300">
                      {t("checkout.step2.addMoreToCart", {
                        amount: formatPrice(
                          minimumOrderAmount - subtotal,
                          currency
                        ),
                      })}
                    </p>
                  </CardContent>
                </Card>
              )}

            <Card>
              <CardHeader>
                <CardTitle>{t("checkout.step2.paymentMethod")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show message when merging with different payment method requirement */}
                {mergeWithOrderId && activeOrder && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {activeOrder.paymentMethod === "ONLINE_PAYMENT"
                        ? t("checkout.step2.mergeOrderOnlinePaymentOnly")
                        : t("checkout.step2.mergeOrderCashOnly")}
                    </p>
                  </div>
                )}
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value: string) => {
                    // Prevent changing payment method when merging
                    if (mergeWithOrderId && activeOrder) {
                      const requiredPaymentMethod =
                        activeOrder.paymentMethod === "ONLINE_PAYMENT"
                          ? "card"
                          : "cod";
                      if (value !== requiredPaymentMethod) {
                        toast.error(
                          activeOrder.paymentMethod === "ONLINE_PAYMENT"
                            ? t("checkout.step2.paymentMethodMismatchOnline")
                            : t("checkout.step2.paymentMethodMismatchCash")
                        );
                        return;
                      }
                    }
                    setPaymentMethod(value as "card" | "cod" | "paypal");
                  }}
                  className="space-y-3"
                >
                  {/* When merging, only show the payment method used in original order */}
                  {acceptOnlinePayment && 
                    (!mergeWithOrderId || (activeOrder?.paymentMethod === "ONLINE_PAYMENT" && activeOrder?.payment?.paymentProvider !== "PAYPAL")) && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem
                          value="card"
                          id="card-payment"
                        />
                        <Label
                          htmlFor="card-payment"
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {t("checkout.step2.creditDebitCard")}
                        </Label>
                      </div>
                    </div>
                  )}
                  {acceptPayPal && 
                    (!mergeWithOrderId || (activeOrder?.paymentMethod === "ONLINE_PAYMENT" && activeOrder?.payment?.paymentProvider === "PAYPAL")) && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem
                          value="paypal"
                          id="paypal-payment"
                        />
                        <Label
                          htmlFor="paypal-payment"
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {t("checkout.step2.paypal")}
                        </Label>
                      </div>
                    </div>
                  )}
                  {acceptCash && 
                    (!mergeWithOrderId || activeOrder?.paymentMethod === "CASH_ON_DELIVERY") && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem
                          value="cod"
                          id="cod-payment"
                        />
                        <Label
                          htmlFor="cod-payment"
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {orderType === "PICKUP" 
                            ? t("checkout.step2.cashOnPickup", { defaultValue: "Cash on Pickup" })
                            : t("checkout.step2.cashOnDelivery")}
                        </Label>
                      </div>
                    </div>
                  )}
                </RadioGroup>

                {!acceptCash && !acceptOnlinePayment && !acceptPayPal && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-center space-x-2 text-red-800 dark:text-red-200">
                      <svg
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm font-medium">
                        {t("checkout.step2.noPaymentMethodsAvailable")}
                      </span>
                    </div>
                  </div>
                )}

                {remainingTotal <= 0 && appliedVoucher ? (
                  <div className="space-y-4">
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                      <p className="text-green-800 dark:text-green-200 font-medium">
                        {t("checkout.voucher.fullyCovered", { defaultValue: "Your order is fully covered by the voucher!" })}
                      </p>
                    </div>
                    <Button
                      onClick={handleVoucherOnlyCheckout}
                      disabled={isPlacingOrder}
                      className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isPlacingOrder ? t("checkout.processing") : t("checkout.voucher.checkoutWithVoucher", { defaultValue: "Place Order (Voucher)" })}
                    </Button>
                  </div>
                ) : paymentMethod === "card" && acceptOnlinePayment ? (
                  <StripePaymentForm
                    amount={remainingTotal}
                    currency={currency}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    buttonText={
                      isPreOrderReservation
                        ? t("checkout.step2.completePreOrderReservation", { amount: formatPrice(remainingTotal, currency) })
                        : undefined
                    }
                    orderData={{
                      orderType,
                      deliveryAddress: orderType === "PICKUP" ? undefined : deliveryInfo.address,
                      deliveryStreetAddress:
                        orderType === "PICKUP" ? undefined : deliveryInfo.streetAddress || undefined,
                      deliveryHouseNumber:
                        orderType === "PICKUP" ? undefined : deliveryInfo.houseNumber || undefined,
                      deliveryPostalCode:
                        orderType === "PICKUP" ? undefined : deliveryInfo.postalCode || undefined,
                      deliveryBuilding: orderType === "PICKUP" ? undefined : deliveryInfo.building || undefined,
                      deliveryFloor: orderType === "PICKUP" ? undefined : deliveryInfo.floor || undefined,
                      deliveryApartment: orderType === "PICKUP" ? undefined : deliveryInfo.apartment || undefined,
                      deliveryExtraDetails:
                        orderType === "PICKUP" ? undefined : deliveryInfo.extraDetails || undefined,
                      deliveryPhone: orderType === "PICKUP" ? undefined : deliveryInfo.phone,
                      deliveryNotes: orderType === "PICKUP" ? undefined : deliveryInfo.notes,
                      pickupPhone: orderType === "PICKUP" ? pickupInfo.phone : undefined,
                      pickupNotes: orderType === "PICKUP" ? pickupInfo.notes : undefined,
                      subtotal: subtotal,
                      deliveryFee: deliveryFee,
                      tax: totalTax,
                      totalAmount: finalTotal,
                      deliveryDistanceKm:
                        orderType === "PICKUP" ? undefined : deliveryDistance ?? undefined,
                      branchId: branchSummary?.id,
                      scheduledDate: scheduledDate?.toISOString() || undefined,
                      replacesOrderId: replacesOrderId || undefined,
                      appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
                    } as any}
                    cartItems={cartItems}
                    mergeWithOrderId={mergeWithOrderId}
                    disabled={
                      (enableMinimumOrder && subtotal < minimumOrderAmount) ||
                      isLoadingSettings ||
                      (!acceptCash && !acceptOnlinePayment && !acceptPayPal)
                    }
                  />
                ) : paymentMethod === "paypal" && acceptPayPal ? (
                  <PayPalPaymentForm
                    amount={remainingTotal}
                    currency={currency}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    orderData={{
                      orderType,
                      deliveryAddress: orderType === "PICKUP" ? undefined : deliveryInfo.address,
                      deliveryStreetAddress:
                        orderType === "PICKUP" ? undefined : deliveryInfo.streetAddress || undefined,
                      deliveryHouseNumber:
                        orderType === "PICKUP" ? undefined : deliveryInfo.houseNumber || undefined,
                      deliveryPostalCode:
                        orderType === "PICKUP" ? undefined : deliveryInfo.postalCode || undefined,
                      deliveryBuilding: orderType === "PICKUP" ? undefined : deliveryInfo.building || undefined,
                      deliveryFloor: orderType === "PICKUP" ? undefined : deliveryInfo.floor || undefined,
                      deliveryApartment: orderType === "PICKUP" ? undefined : deliveryInfo.apartment || undefined,
                      deliveryExtraDetails:
                        orderType === "PICKUP" ? undefined : deliveryInfo.extraDetails || undefined,
                      deliveryPhone: orderType === "PICKUP" ? undefined : deliveryInfo.phone,
                      deliveryNotes: orderType === "PICKUP" ? undefined : deliveryInfo.notes,
                      pickupPhone: orderType === "PICKUP" ? pickupInfo.phone : undefined,
                      pickupNotes: orderType === "PICKUP" ? pickupInfo.notes : undefined,
                      subtotal: subtotal,
                      deliveryFee: deliveryFee,
                      tax: totalTax,
                      totalAmount: finalTotal,
                      deliveryDistanceKm:
                        orderType === "PICKUP" ? undefined : deliveryDistance ?? undefined,
                      branchId: branchSummary?.id,
                      scheduledDate: scheduledDate?.toISOString() || undefined,
                      replacesOrderId: replacesOrderId || undefined,
                      appliedVoucherCode: appliedVoucher?.voucherCode || undefined,
                    } as any}
                    cartItems={cartItems}
                    mergeWithOrderId={mergeWithOrderId}
                    disabled={
                      (enableMinimumOrder && subtotal < minimumOrderAmount) ||
                      isLoadingSettings ||
                      (!acceptCash && !acceptOnlinePayment && !acceptPayPal)
                    }
                  />
                ) : paymentMethod === "cod" && acceptCash ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <svg
                            className="h-5 w-5 text-blue-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            {orderType === "PICKUP" 
                              ? t("checkout.step2.cashOnPickup", { defaultValue: "Cash on Pickup" })
                              : t("checkout.step2.cashOnDelivery")}
                          </h3>
                          <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                            <p>
                              {orderType === "PICKUP"
                                ? t("checkout.step2.codInfo1Pickup", { defaultValue: "• Pay with cash when you pick up your order" })
                                : t("checkout.step2.codInfo1")}
                            </p>
                            <p>
                              {orderType === "PICKUP"
                                ? t("checkout.step2.codInfo2Pickup", { defaultValue: "• Please have exact change ready" })
                                : t("checkout.step2.codInfo2")}
                            </p>
                            {orderType === "PICKUP" ? (
                              <p>
                                {t("checkout.step2.codInfo3Pickup", { defaultValue: "• No delivery fee for pickup orders" })}
                              </p>
                            ) : (
                              <p>
                                {t("checkout.step2.codInfo3", {
                                  fee: formatPrice(deliveryFee, currency),
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleCODPayment}
                      disabled={
                        (enableMinimumOrder && subtotal < minimumOrderAmount) ||
                        isLoadingSettings ||
                        !branchSummary?.id ||
                        (orderType === "PICKUP"
                          ? !pickupInfo.phone
                          : !availability?.available)
                      }
                      className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPreOrderReservation ? (
                        <>
                          <Icon path={mdiCalendar} size={0.83} className="mr-2" />
                          {t("checkout.step2.completePreOrderReservationCash")}
                        </>
                      ) : (
                        t("checkout.step2.placeOrderCOD")
                      )}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Right Column - Order Summary (Only visible in Step 2) */}
        {currentStep === 2 && (
          <div className="space-y-6 order-1 lg:order-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("checkout.orderSummary")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cartItems.map((item) => {
                  const itemPrice =
                    item.basePrice +
                    item.addOns.reduce((sum, addOn) => {
                      const addOnQuantity = addOn.quantity || 1;
                      return sum + addOn.price * addOnQuantity;
                    }, 0);

                  const itemType = (item as any).itemType || "MEAL";
                  const isDeal = itemType === "DEAL";

                  // Find item in tax breakdown
                  const itemTaxInfo = taxBreakdown?.itemBreakdown?.find((breakdown: any) => {
                    if (itemType === "DEAL") {
                      return breakdown.mealId === item.dealId;
                    }
                    return breakdown.mealId === item.mealId && breakdown.size === item.size;
                  });

                  const dealComponentTaxRows = isDeal
                    ? (taxBreakdown?.dealComponentBreakdown || []).filter(
                        (row: any) => String(row.dealId) === String((item as any).dealId)
                      )
                    : [];

                  // Find addon tax info for THIS specific cart item
                  const addonTaxInfoList =
                    taxBreakdown?.addonBreakdown?.filter((addon: any) =>
                      item.addOns.some((a) => a.id === addon.addonId)
                    ) || [];

                  return (
                    <div
                      key={`${item.id}-${item.size}-${item.specialInstructions}`}
                      className="border-b border-border pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium text-foreground">
                              {item.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {t("checkout.step2.sizeQty", {
                                size: item.size,
                                quantity: item.quantity,
                              })}
                            </p>
                          </div>
                        </div>
                        <p className="font-semibold text-foreground">
                          {formatPrice(itemPrice * item.quantity, currency)}
                        </p>
                      </div>

                      {/* Add-ons display */}
                      {item.addOns.length > 0 && (
                        <div className="ml-16 space-y-1 mt-2">
                          {item.addOns.map((addOn) => {
                            const addonQuantity = addOn.quantity || 1;
                            // Total addon price = price per addon × addon quantity × meal item quantity
                            const addonPriceTotal =
                              addOn.price * addonQuantity * item.quantity;
                            return (
                              <div
                                key={addOn.id}
                                className="flex justify-between text-xs text-muted-foreground"
                              >
                                <span>
                                  • {addOn.name}
                                  {addonQuantity > 1
                                    ? ` ×${addonQuantity}`
                                    : ""}
                                  {item.quantity > 1
                                    ? ` (${t("checkout.step2.mealItems", {
                                        quantity: item.quantity,
                                      })})`
                                    : ""}
                                </span>
                                <span>
                                  {formatPrice(addonPriceTotal, currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Optional Ingredients display */}
                      {item.optionalIngredients &&
                        item.optionalIngredients.length > 0 && (
                          <div className="ml-16 space-y-1 mt-2">
                            {(() => {
                              const included = item.optionalIngredients.filter(
                                (ing) => ing.isIncluded
                              );

                              return (
                                <>
                                  {included.length > 0 && (
                                    <div className="text-xs">
                                      <span className="font-medium text-foreground">
                                        {t(
                                          "mealCustomization.includedIngredients"
                                        )}
                                        :
                                      </span>{" "}
                                      <span className="text-muted-foreground">
                                        {included
                                          .map((ing) => ing.name)
                                          .join(", ")}
                                      </span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}

                      {/* Special instructions */}
                      {item.specialInstructions && (
                        <p className="text-xs text-muted-foreground ml-16 mt-1 italic">
                          {t("checkout.step2.note")}: {item.specialInstructions}
                        </p>
                      )}

                      {/* Tax info for this item */}
                      {!taxInclusive && taxBreakdown && itemTaxInfo && (
                        <div className="ml-16 mt-2 p-2 bg-muted/30 rounded text-xs border border-border/50">
                          <div className="font-semibold text-xs mb-1.5 text-foreground">
                            {t("checkout.step2.taxBreakdown")}:
                          </div>

                          {/* Meal/Deal Tax */}
                          <div className="space-y-1">
                            {isDeal ? (
                              <>
                                {(dealComponentTaxRows || []).length > 0 ? (
                                  <div className="space-y-1">
                                    {(dealComponentTaxRows || []).map((row: any) => (
                                      <div key={row.dealComponentId} className="flex justify-between items-center">
                                        <span className="text-muted-foreground">
                                          {row.name} ×{row.quantity}
                                          {row.taxPercentage !== undefined && row.taxPercentage !== null
                                            ? ` (${row.taxPercentage}%)`
                                            : ""}
                                        </span>
                                        <span className="font-medium text-foreground">
                                          {formatPrice(row.taxAmount || 0, currency)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">
                                        {t("checkout.step2.mealBasePrice")}:
                                      </span>
                                      <span className="font-medium text-foreground">
                                        {formatPrice(itemTaxInfo.basePrice, currency)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-muted-foreground italic pl-1">
                                        {t("checkout.step2.taxPercentage", {
                                          percentage: itemTaxInfo.taxPercentage,
                                        })}
                                      </span>
                                      <span className="font-medium text-foreground">
                                        {formatPrice(itemTaxInfo.taxAmount, currency)}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">
                                    {t("checkout.step2.mealBasePrice")}:
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {formatPrice(itemTaxInfo.basePrice, currency)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-muted-foreground italic pl-1">
                                    {t("checkout.step2.taxPercentage", {
                                      percentage: itemTaxInfo.taxPercentage,
                                    })}
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {formatPrice(itemTaxInfo.taxAmount, currency)}
                                  </span>
                                </div>
                              </div>
                            )}

                            {item.addOns.length > 0 &&
                              addonTaxInfoList.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-border/30">
                                  {item.addOns.map((addOn) => {
                                    const addonTax = addonTaxInfoList.find(
                                      (tax: any) => tax.addonId === addOn.id
                                    );
                                    if (!addonTax) return null;
                                    return (
                                      <div
                                        key={addOn.id}
                                        className="flex justify-between items-center mb-0.5"
                                      >
                                        <span className="text-muted-foreground">
                                          {t("checkout.step2.addonTaxLabel", {
                                            name: addOn.name,
                                            percentage: addonTax.taxPercentage,
                                          })}
                                        </span>
                                        <span className="font-medium text-foreground">
                                          {formatPrice(
                                            addonTax.taxAmount,
                                            currency
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                            {/* Total tax for this item */}
                            <div className="mt-1.5 pt-1.5 border-t border-border/30 flex justify-between items-center font-medium text-xs">
                              <span className="text-foreground">
                                {t("checkout.step2.itemTotalTax")}:
                              </span>
                              <span className="text-pink-500 dark:text-pink-400">
                                {formatPrice(
                                  itemTaxInfo.taxAmount +
                                    addonTaxInfoList.reduce(
                                      (sum: number, tax: any) => sum + tax.taxAmount,
                                      0
                                    ),
                                  currency
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="border-t border-border pt-4 space-y-2">
                  <div className="text-sm font-semibold text-foreground">
                    {orderType === "PICKUP"
                      ? t("orders.pickupInformation", { defaultValue: "Pickup Information" })
                      : t("orders.deliveryInformation", { defaultValue: "Delivery Information" })}
                  </div>

                  {orderType === "PICKUP" ? (
                    <>
                      <div className="flex justify-between text-foreground">
                        <span>{t("orders.phone", { defaultValue: "Phone" })}:</span>
                        <span className="text-right break-words max-w-[60%]">
                          {pickupInfo.phone || "-"}
                        </span>
                      </div>
                      {pickupInfo.notes ? (
                        <div className="flex justify-between text-foreground">
                          <span>
                            {t("orders.specialInstructions", {
                              defaultValue: "Special instructions",
                            })}
                            :
                          </span>
                          <span className="text-right break-words max-w-[60%]">
                            {pickupInfo.notes}
                          </span>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-foreground">
                        <span>{t("orders.address", { defaultValue: "Address" })}:</span>
                        <span className="text-right break-words max-w-[60%]">
                          {deliveryInfo.address || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between text-foreground">
                        <span>{t("orders.phone", { defaultValue: "Phone" })}:</span>
                        <span className="text-right break-words max-w-[60%]">
                          {deliveryInfo.phone || "-"}
                        </span>
                      </div>
                      {deliveryInfo.notes ? (
                        <div className="flex justify-between text-foreground">
                          <span>
                            {t("orders.specialInstructions", {
                              defaultValue: "Special instructions",
                            })}
                            :
                          </span>
                          <span className="text-right break-words max-w-[60%]">
                            {deliveryInfo.notes}
                          </span>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="border-t border-border pt-4 space-y-2">
                  <div className="flex justify-between text-foreground">
                    <span>
                      {taxInclusive
                        ? t("checkout.step2.subtotalInclTax", { defaultValue: "Subtotal (incl. tax)" })
                        : t("checkout.step2.subtotal")}:
                    </span>
                    <span>{formatPrice(subtotal, currency)}</span>
                  </div>
                  {/* Hide delivery fee section when merging - already paid in original order */}
                  {shouldShowDeliveryFeeAndTax && orderType !== "PICKUP" && !mergeWithOrderId && (
                    <div className="flex flex-col gap-1 text-foreground">
                      <div className="flex justify-between">
                        <span>{t("checkout.step2.deliveryFee")}:</span>
                        <span>
                          {isLoadingSettings ? (
                            <span className="text-muted-foreground">
                              {t("common.loading")}
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {deliveryFee === 0 ? (
                                <>
                                  <span className="text-green-600 font-semibold">
                                    {t("checkout.step2.free")}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {t("checkout.step2.orderOverAmount", {
                                      amount: formatPrice(
                                        freeDeliveryThreshold,
                                        currency
                                      ),
                                    })}
                                  </span>
                                </>
                              ) : (
                                formatPrice(deliveryFee, currency)
                              )}
                            </div>
                          )}
                        </span>
                      </div>
                      {deliveryDistance !== null &&
                        deliveryDistance !== undefined && (
                          <div className="ml-4 text-xs text-muted-foreground flex justify-between">
                            <span>
                              {t("checkout.step2.distanceFromRestaurant")}:
                            </span>
                            <span className="font-medium">
                              {deliveryDistance.toFixed(2)} km
                            </span>
                          </div>
                        )}
                      {(useDynamicDeliveryFee || useTieredDeliveryFee) &&
                        deliveryDistance !== null &&
                        deliveryDistance !== undefined &&
                        (fullBranch?.deliveryRatePerKilometer || settings?.deliveryRatePerKilometer) &&
                        Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0)) > 0 && (
                          <div className="ml-4 text-xs text-muted-foreground flex justify-between">
                            <span>
                              {t("checkout.step2.standardRatePerKm")}:
                            </span>
                            <span className="font-medium">
                              {formatPrice(
                                Number(getBranchOrSettingsValue(fullBranch?.deliveryRatePerKilometer, settings?.deliveryRatePerKilometer, 0)),
                                currency
                              )}{" "}
                              {t("checkout.step2.perKm")}
                            </span>
                          </div>
                        )}
                      {useTieredDeliveryFee &&
                        deliveryDistance !== null &&
                        deliveryDistance !== undefined && (
                          <div className="ml-4 text-xs text-muted-foreground space-y-1">
                            <div className="flex justify-between">
                              <span>{t("checkout.step2.initialRange")}:</span>
                              <span className="font-medium">
                                {Number(
                                  getBranchOrSettingsValue(fullBranch?.initialDeliveryRange, settings?.initialDeliveryRange, 3.0)
                                ).toFixed(1)}{" "}
                                km -{" "}
                                {formatPrice(
                                  Number(getBranchOrSettingsValue(fullBranch?.initialDeliveryPrice, settings?.initialDeliveryPrice, 2.0)),
                                  currency
                                )}
                              </span>
                            </div>
                            {(fullBranch?.extendedDeliveryThreshold || settings?.extendedDeliveryThreshold) &&
                              (fullBranch?.extendedDeliveryRate || settings?.extendedDeliveryRate) && (
                                <div className="flex justify-between">
                                  <span>
                                    {t("checkout.step2.extendedRate", {
                                      threshold: Number(
                                        getBranchOrSettingsValue(fullBranch?.extendedDeliveryThreshold, settings?.extendedDeliveryThreshold, 0)
                                      ).toFixed(1),
                                    })}
                                  </span>
                                  <span className="font-medium">
                                    {formatPrice(
                                      Number(getBranchOrSettingsValue(fullBranch?.extendedDeliveryRate, settings?.extendedDeliveryRate, 0)),
                                      currency
                                    )}{" "}
                                    {t("checkout.step2.perKm")}
                                  </span>
                                </div>
                              )}
                          </div>
                        )}
                    </div>
                  )}
                  {/* Hide "select address to calculate" when merging - delivery already paid */}
                  {orderType !== "PICKUP" && (useDynamicDeliveryFee || useTieredDeliveryFee) &&
                    !deliveryInfo.address && !mergeWithOrderId && (
                      <div className="flex justify-between text-foreground">
                        <span>{t("checkout.step2.deliveryFee")}:</span>
                        <span className="text-muted-foreground text-sm">
                          {t("checkout.step2.selectAddressToCalculate")}
                        </span>
                      </div>
                    )}
                  {!taxInclusive && shouldShowDeliveryFeeAndTax && orderType !== "PICKUP" && (
                    <div className="flex flex-col gap-1 text-foreground">
                      <div className="flex justify-between">
                        <span>{t("checkout.step2.tax")}:</span>
                        <span>
                          {isLoadingSettings ? (
                            <span className="text-muted-foreground">
                              {t("common.loading")}
                            </span>
                          ) : (
                            formatPrice(totalTax, currency)
                          )}
                        </span>
                      </div>
                      {taxBreakdown && (
                        <div className="ml-4 text-xs text-muted-foreground space-y-0.5">
                          <div className="flex justify-between">
                            <span>{t("checkout.step2.itemTax")}</span>
                            <span>{formatPrice(itemTax, currency)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t("checkout.step2.addonTax")}</span>
                            <span>{formatPrice(addonTax, currency)}</span>
                          </div>
                          {deliveryFee > 0 && deliveryTax > 0 && (
                            <div className="flex justify-between">
                              <span>{t("checkout.step2.deliveryTax")}</span>
                              <span>{formatPrice(deliveryTax, currency)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!taxInclusive && orderType === "PICKUP" && (
                    <div className="flex flex-col gap-1 text-foreground">
                      <div className="flex justify-between">
                        <span>{t("checkout.step2.tax")}: </span>
                        <span>
                          {isLoadingSettings ? (
                            <span className="text-muted-foreground">
                              {t("common.loading")}
                            </span>
                          ) : (
                            formatPrice(itemTax + addonTax + takeawayServiceTaxAmount, currency)
                          )}
                        </span>
                      </div>
                      {taxBreakdown && (
                        <div className="ml-4 text-xs text-muted-foreground space-y-0.5">
                          <div className="flex justify-between">
                            <span>{t("checkout.step2.itemTax")}</span>
                            <span>{formatPrice(itemTax, currency)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t("checkout.step2.addonTax")}</span>
                            <span>{formatPrice(addonTax, currency)}</span>
                          </div>
                          {takeawayServiceTaxAmount > 0 && (
                            <div className="flex justify-between">
                              <span>
                                {t("checkout.step2.takeawayServiceTax", {
                                  defaultValue: "Takeaway service tax",
                                })}
                              </span>
                              <span>
                                {formatPrice(takeawayServiceTaxAmount, currency)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {orderType === "PICKUP" && !mergeWithOrderId && takeawayServiceFeeToAdd > 0 && (
                    <div className="flex justify-between text-foreground">
                      <span>{t("checkout.step2.takeawayServiceFee", { defaultValue: "Takeaway service fee" })}:</span>
                      <span>{formatPrice(takeawayServiceFeeToAdd, currency)}</span>
                    </div>
                  )}
                  {!taxInclusive && orderType !== "PICKUP" && (useDynamicDeliveryFee || useTieredDeliveryFee) &&
                    !deliveryInfo.address && (
                      <div className="flex justify-between text-foreground">
                        <span>{t("checkout.step2.tax")}:</span>
                        <span className="text-muted-foreground text-sm">
                          {t("checkout.step2.selectAddressToCalculate")}
                        </span>
                      </div>
                    )}
                  {/* Voucher Section */}
                  <div className="border-t border-border pt-4 pb-2">
                    <div className="flex flex-col space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        {t("checkout.voucher.title", { defaultValue: "Do you have a voucher?" })}
                      </span>
                      <div className="flex flex-col space-y-2">
                        <Input
                          placeholder={t("checkout.voucher.placeholder", { defaultValue: "Voucher code" })}
                          value={voucherCode}
                          onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                          disabled={isValidatingVoucher || !!appliedVoucher}
                          className="w-full bg-background text-foreground h-10"
                        />
                        {appliedVoucher ? (
                          <Button
                            variant="destructive"
                            onClick={() => {
                              setAppliedVoucher(null);
                              setVoucherCode("");
                              setVoucherError(null);
                            }}
                            className="w-full h-10"
                          >
                            {t("common.remove", { defaultValue: "Remove" })}
                          </Button>
                        ) : (
                          <Button
                            onClick={handleApplyVoucher}
                            disabled={isValidatingVoucher || !voucherCode.trim()}
                            className="w-full h-10"
                          >
                            {isValidatingVoucher ? t("common.loading") : t("checkout.voucher.apply", { defaultValue: "Redeem" })}
                          </Button>
                        )}
                      </div>
                      {voucherError && (
                        <p className="text-xs text-red-500 mt-1">{voucherError}</p>
                      )}
                      {appliedVoucher && (
                        <p className="text-xs text-green-500 mt-1">
                          {t("checkout.voucher.success", { defaultValue: "Voucher successfully applied!" })}
                        </p>
                      )}
                    </div>
                  </div>

                  {voucherDeduction > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400 font-medium">
                      <span>{t("checkout.voucher.discount", { defaultValue: "Voucher discount" })}:</span>
                      <span>-{formatPrice(voucherDeduction, currency)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-lg font-bold border-t border-border pt-2 text-foreground">
                    <span>{t("checkout.step2.total")}:</span>
                    <span>
                      {isLoadingSettings ? (
                        <span className="text-muted-foreground">
                          {t("common.loading")}
                        </span>
                      ) : orderType === "PICKUP" ? (
                        formatPrice(remainingTotal, currency)
                      ) : shouldShowDeliveryFeeAndTax ? (
                        formatPrice(remainingTotal, currency)
                      ) : (useDynamicDeliveryFee || useTieredDeliveryFee) &&
                        !deliveryInfo.address ? (
                        <span className="text-muted-foreground text-sm">
                          {t("checkout.step2.selectAddressToCalculate")}
                        </span>
                      ) : (
                        formatPrice(Math.max(0, subtotal - voucherDeduction), currency)
                      )}
                    </span>
                  </div>
                  {orderType !== "PICKUP" && (useDynamicDeliveryFee || useTieredDeliveryFee) &&
                    !deliveryInfo.address && (
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {t("checkout.step2.feeTaxCalculatedAfterAddress")}
                      </p>
                    )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/60 bg-muted/20">
              <CardHeader>
                <CardTitle className="text-base">
                  {scheduledDate
                    ? t("checkout.step2.scheduledOrderDetails", {
                        defaultValue: "Scheduled Order Details",
                      })
                    : t("checkout.step2.orderDetails", {
                        defaultValue: "Order Details",
                      })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {scheduledDate && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {t("checkout.step2.deliveryDate", {
                          defaultValue: "Delivery Date",
                        })}
                      </span>
                      <span className="font-medium text-foreground text-right">
                        {scheduledDate.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {t("checkout.step2.timeSlot", {
                          defaultValue: "Time Slot",
                        })}
                      </span>
                      <span className="font-medium text-foreground text-right">
                        {scheduledDate.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                )}

                {orderType === "DELIVERY" && (
                  <div className="space-y-1 border-t border-border/50 pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {t("checkout.step2.deliveryAddress", {
                          defaultValue: "Delivery Address",
                        })}
                      </span>
                      <span className="font-medium text-foreground text-right">
                        {deliveryInfo.address ||
                          t("checkout.step2.notProvided", {
                            defaultValue: "Not provided",
                          })}
                      </span>
                    </div>

                    {
                      (deliveryInfo.phone && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-muted-foreground">
                          {t("checkout.step2.phoneNumber", {
                            defaultValue: "Phone #",
                          })}
                        </span>
                        <span className="font-medium  text-foreground text-right">
                          {deliveryInfo.phone}
                        </span>
                        </div>
                      ))
                    }

                    {(deliveryInfo.building ||
                      deliveryInfo.floor ||
                      deliveryInfo.apartment) && (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground whitespace-nowrap">
                          {t("checkout.step2.addressDetails", {
                            defaultValue: "Address Details",
                          })}
                        </span>
                        <span className="font-medium text-foreground text-right">
                          {[
                            deliveryInfo.building
                              ? `${t("checkout.step1.addressSelector.building", {
                                  defaultValue: "Building",
                                })}: ${deliveryInfo.building}`
                              : null,
                            deliveryInfo.floor
                              ? `${t("checkout.step1.addressSelector.floor", {
                                  defaultValue: "Floor",
                                })}: ${deliveryInfo.floor}`
                              : null,
                            deliveryInfo.apartment
                              ? `${t("checkout.step1.addressSelector.apartment", {
                                  defaultValue: "Apartment",
                                })}: ${deliveryInfo.apartment}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    )}

                    {deliveryInfo.extraDetails && (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">
                          {t("checkout.step2.extraDetails", {
                            defaultValue: "Extra Details",
                          })}
                        </span>
                        <span className="font-medium text-foreground text-right">
                          {deliveryInfo.extraDetails}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
};

export default CheckoutPage;
