import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import StripePaymentForm from "@/components/payment/StripePaymentForm";
import PayPalPaymentForm from "@/components/payment/PayPalPaymentForm";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsService, type Settings } from "@/services/settingsService";
import branchService, { type Branch } from "@/services/branchService";
import { reservationService, type ReservationSettings } from "@/services/reservationService";
import { mealService, type Meal } from "@/services/mealService";
import { addonService, type Addon } from "@/services/addonService";
import { calculateTax } from "@/utils/taxCalculator";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiCalendar, mdiClock, mdiAccountGroup, mdiMapMarker, mdiClose, mdiAlert, mdiSilverwareForkKnife } from "@mdi/js";
import { Link } from "react-router-dom";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/contexts/SettingsContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { ServingHoursService, type ServingHoursStatus } from "@/services/servingHoursService";
import { useBranch } from "@/contexts/BranchContext";

const ReservationCheckout: React.FC = () => {
  const navigate = useNavigate();
  const {
    items: cartItems,
    clearCart,
  } = useCartStore();
  const { isSignedIn, getToken } = useAuth();
  const { t } = useTranslation();
  const { currency } = useSettings();
  const { branch: branchSummary } = useBranch();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [acceptPayPal, setAcceptPayPal] = useState(false);
  const [reservationSettings, setReservationSettings] = useState<ReservationSettings | null>(null);
  const [branchData, setBranchData] = useState<Branch | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [taxBreakdown, setTaxBreakdown] = useState<any>(null);
  const [reservationData, setReservationData] = useState<any>(null);
  const [specialRequests, setSpecialRequests] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const [existingReservation, setExistingReservation] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal">("card");
  const [isPaymentMethodLocked, setIsPaymentMethodLocked] = useState(false);
  const [lockedPaymentProvider, setLockedPaymentProvider] = useState<
    "STRIPE" | "PAYPAL" | null
  >(null);
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);

  // Check if we're modifying an existing reservation FIRST (before checking for new reservation)
  useEffect(() => {
    const checkModificationMode = async () => {
      const modifyingReservationId = sessionStorage.getItem("modifyingReservationId");
      if (modifyingReservationId) {
        setIsModifying(true);
        await loadExistingReservation(modifyingReservationId);
      } else {
        // Only check for new reservation if not modifying
    try {
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      if (pendingReservation) {
        setReservationData(JSON.parse(pendingReservation));
      } else {
        // No reservation data, redirect to menu
        toast.error(t("reservations.checkout.noReservationFound"));
        navigate("/reservations/book");
      }
    } catch (error) {
      console.error("Error loading reservation data:", error);
      toast.error(t("reservations.checkout.loadReservationError"));
      navigate("/reservations/book");
    }
      }
    };
    
    checkModificationMode();
  }, [navigate]);

  const loadExistingReservation = async (reservationId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        toast.error(t("reservations.checkout.authRequired"));
        return;
      }
      
      const reservation = await reservationService.getReservationById(reservationId, token);
      setExistingReservation(reservation);
      const originalPaymentProvider = reservation.reservationOrder?.payment?.paymentProvider;
      if (originalPaymentProvider) {
        setIsPaymentMethodLocked(true);
        setLockedPaymentProvider(originalPaymentProvider);
        setPaymentMethod(originalPaymentProvider === "PAYPAL" ? "paypal" : "card");
      }
      
      // Set reservation data from existing reservation
      const reservationDate = new Date(reservation.reservationDate);
      const year = reservationDate.getFullYear();
      const month = String(reservationDate.getMonth() + 1).padStart(2, "0");
      const day = String(reservationDate.getDate()).padStart(2, "0");
      const hours = String(reservationDate.getHours()).padStart(2, "0");
      const minutes = String(reservationDate.getMinutes()).padStart(2, "0");
      
      const reservationDataObj = {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
        numberOfGuests: reservation.numberOfGuests,
        customerName: reservation.customerName,
        customerEmail: reservation.customerEmail,
        customerPhone: reservation.customerPhone,
        specialRequests: reservation.specialRequests,
        preferredZone: reservation.preferredZone,
        branchId: reservation.branch?.id, // Include branchId for modification
      };
      setReservationData(reservationDataObj);
      
      // Store branchId in sessionStorage for menu page access
      if (reservation.branch?.id) {
        sessionStorage.setItem("modifyingReservationBranchId", reservation.branch.id);
      }
    } catch (error) {
      console.error("Error loading existing reservation:", error);
      toast.error(t("reservations.checkout.loadReservationError"));
      sessionStorage.removeItem("modifyingReservationId");
      navigate("/reservations/my-reservations");
    } finally {
      // no-op
    }
  };

  // Redirect if cart is empty
  useEffect(() => {
    if (cartItems.length === 0) {
      if (isModifying) {
        // If modifying and cart is empty, go back to reservations
        navigate("/reservations/my-reservations");
      } else {
      navigate("/menu?reservation=pre-order");
      }
    }
  }, [cartItems.length, navigate, isModifying]);

  // Redirect if not signed in
  useEffect(() => {
    if (!isSignedIn) {
      toast.error(t("reservations.checkout.signInRequired"));
      navigate("/menu?reservation=pre-order");
    }
  }, [isSignedIn, navigate, t]);

  // Load settings, meals, and addons for tax calculations
  useEffect(() => {
    const loadData = async () => {
      if (!isSignedIn) return;
      
      // Get branchId from reservationData or sessionStorage
      // Try reservationData first (might be set from existing reservation or parsed from sessionStorage)
      let branchId: string | undefined = undefined;
      
      if (reservationData?.branchId) {
        branchId = reservationData.branchId;
      } else {
        // Fallback to sessionStorage if reservationData not loaded yet
        const pendingReservation = sessionStorage.getItem("pendingReservation");
        if (pendingReservation) {
          try {
            const parsed = JSON.parse(pendingReservation);
            branchId = parsed.branchId;
          } catch (e) {
            console.error("Error parsing pendingReservation:", e);
          }
        }
        // Also check for modifying reservation branchId
        if (!branchId) {
          branchId = sessionStorage.getItem("modifyingReservationBranchId") || undefined;
        }
      }

      // Ensure we always use the original reservation branch when modifying
      const originalBranchId = reservationData?.branchId;
      if (isModifying && originalBranchId) {
        if (!branchId) {
          branchId = originalBranchId;
        } else if (branchId !== originalBranchId) {
          console.warn(
            "[ReservationCheckout] Branch mismatch while modifying; using original reservation branch",
            { originalBranchId, resolvedBranchId: branchId }
          );
          branchId = originalBranchId;
        }
      }
      
      try {
        const token = await getToken();
        if (!token) {
          toast.error(t("reservations.checkout.authRequired"));
          return;
        }

        // Fetch branch-specific reservation settings if branchId is available
        const [settingsResponse, reservationSettingsResponse, mealsResponse, addonsResponse] = await Promise.all([
          SettingsService.getSettings(token),
          reservationService.getSettings(token, branchId),
          // Pass branchId to pull branch-specific prices/taxes
          mealService.getMeals(1, 100, "", "createdAt", "desc", "", token, undefined, branchId),
          addonService.getAddons(1, 100, "", "createdAt", "desc", token, "", branchId),
        ]);

        setSettings(settingsResponse.data);
        setReservationSettings(reservationSettingsResponse);
        const mealsData = mealsResponse.meals || [];
        setMeals(mealsData);
        setAddons(addonsResponse.addons || []);

        // Load branch data for tax/payment overrides if branchId is available
        if (branchId) {
          try {
            const branches = await branchService.getBranches(token);
            const branch = branches.find((b) => b.id === branchId) || null;
            setBranchData(branch);
          } catch (branchErr) {
            console.warn("Failed to load branch data for tax overrides:", branchErr);
            setBranchData(null);
          }
        } else {
          setBranchData(null);
        }
        
        // Check if PayPal is accepted
        const paypalEnabled = settingsResponse.data?.acceptPayPal ?? false;
        setAcceptPayPal(paypalEnabled);
        
        // Set default payment method based on availability
        if (paypalEnabled && !settingsResponse.data?.acceptOnlinePayment) {
          setPaymentMethod("paypal");
        }
        
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error(t("reservations.checkout.loadSettingsError"));
      } finally {
        // no-op
      }
    };

    loadData();
  }, [isSignedIn, getToken, reservationData?.branchId]);

  // Calculate tax breakdown
  useEffect(() => {
    if (!settings || !meals.length || !addons.length || !cartItems.length) {
      return;
    }

    try {
      // Derive tax settings with branch overrides when available
      const taxSettings = {
        taxPercentage:
          branchData?.taxPercentage !== null && branchData?.taxPercentage !== undefined
            ? Number(branchData.taxPercentage)
            : Number(settings.taxPercentage),
        deliveryTaxPercentage:
          branchData?.deliveryTaxPercentage !== null && branchData?.deliveryTaxPercentage !== undefined
            ? Number(branchData.deliveryTaxPercentage)
            : Number(settings.deliveryTaxPercentage),
        taxInclusive:
          branchData?.taxInclusive !== null && branchData?.taxInclusive !== undefined
            ? Boolean(branchData.taxInclusive)
            : Boolean(settings.taxInclusive),
      };

      // For reservations, there's no delivery fee
      const breakdown = calculateTax(
        cartItems,
        meals,
        addons,
        { ...settings, ...taxSettings },
        0, // No delivery fee for reservations
        undefined
      );
      setTaxBreakdown(breakdown);
    } catch (error) {
      console.error("Error calculating tax:", error);
    }
  }, [cartItems, meals, addons, settings, branchData]);

  // Calculate totals - use cart item prices directly (they're already correct)
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      // Cart item basePrice already includes meal basePrice + size price
      const itemPrice = item.basePrice;
      
      // Addon prices are already stored correctly in the cart item
      const addonPrice = (item.addOns || []).reduce((addonSum, addOn) => {
        const addOnQuantity = addOn.quantity || 1;
        return addonSum + addOn.price * addOnQuantity;
      }, 0);

      // Total for this item = (meal price + addon prices) × quantity
      return sum + (itemPrice + addonPrice) * item.quantity;
    }, 0);
  }, [cartItems]);

  const tax = taxBreakdown?.totalTaxAmount || 0;
  const displayTaxPercentage =
    taxBreakdown?.itemBreakdown?.[0]?.taxPercentage ??
    taxBreakdown?.addonBreakdown?.[0]?.taxPercentage ??
    (branchData?.taxPercentage !== null && branchData?.taxPercentage !== undefined
      ? Number(branchData.taxPercentage)
      : settings?.taxPercentage ?? 0);
  // If tax is inclusive, the subtotal already includes tax, so finalTotal = subtotal
  // If tax is not inclusive, we need to add tax on top: finalTotal = subtotal + tax
  const taxInclusive =
    branchData?.taxInclusive !== null && branchData?.taxInclusive !== undefined
      ? Boolean(branchData.taxInclusive)
      : Boolean(settings?.taxInclusive || false);
  const newItemsTotal = taxInclusive ? subtotal : subtotal + tax;

  // For modifying reservations, calculate combined total
  const existingTotal = existingReservation?.reservationOrder?.totalAmount 
    ? Number(existingReservation.reservationOrder.totalAmount) 
    : 0;
  
  // Combined total for minimum order validation
  const combinedTotal = existingTotal + newItemsTotal;
  
  // Use new items total for display/payment; combined only for minimum validation
  const finalTotal = newItemsTotal;

  // Check minimum pre-order amount (using combined total for modifications)
  const preOrderMinAmount = reservationSettings?.preOrderMinAmount ? Number(reservationSettings.preOrderMinAmount) : null;
  const totalForMinimum = isModifying ? combinedTotal : finalTotal;
  const isMinimumOrderMet = !preOrderMinAmount || totalForMinimum >= preOrderMinAmount;

  // Deposit / allowed methods
  const depositPercentage = reservationSettings?.depositPercentage !== undefined && reservationSettings?.depositPercentage !== null
    ? Number(reservationSettings.depositPercentage)
    : 100;
  // Get allowed payment methods from reservation settings
  // Only use default if field is completely missing (not null/empty array)
  const allowedPaymentMethods = reservationSettings?.allowedPaymentMethods !== undefined
    ? (Array.isArray(reservationSettings.allowedPaymentMethods) ? reservationSettings.allowedPaymentMethods : [])
    : ["ONLINE_CARD", "PAYPAL"]; // Only default if completely missing

  const payableAmount = Math.max(0, Math.round((finalTotal * depositPercentage / 100) * 100) / 100);
  const paymentRequired = payableAmount > 0.0001;

  // Payment methods are allowed if they're in the reservation settings allowedPaymentMethods
  // AND the corresponding global payment gateway is enabled
  const orgOnlinePaymentsAllowed = (branchData as any)?.organization?.onlinePaymentsAllowed;
  const orgCardPaymentsAllowed = (branchData as any)?.organization?.cardPaymentsAllowed;
  const orgPayPalAllowed = (branchData as any)?.organization?.paypalAllowed;

  const cardAllowed =
    allowedPaymentMethods.includes("ONLINE_CARD") &&
    (settings?.acceptOnlinePayment ?? false) &&
    orgOnlinePaymentsAllowed !== false &&
    orgCardPaymentsAllowed !== false;

  const paypalAllowed =
    allowedPaymentMethods.includes("PAYPAL") &&
    acceptPayPal &&
    orgOnlinePaymentsAllowed !== false &&
    orgPayPalAllowed !== false;

  // Choose default payment method based on allowed options
  // This ensures paymentMethod is always set to an allowed method
  useEffect(() => {
    if (isPaymentMethodLocked && lockedPaymentProvider) {
      setPaymentMethod(lockedPaymentProvider === "PAYPAL" ? "paypal" : "card");
      return;
    }

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
  }, [paypalAllowed, cardAllowed, paymentRequired, isPaymentMethodLocked, lockedPaymentProvider]);

  // Get serving hours message helper
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

  // Load serving hours status
  useEffect(() => {
    const loadServingHours = async () => {
      if (!branchSummary?.id) return;
      
      try {
        const response = await ServingHoursService.getServingHours(branchSummary.id);
        setServingHoursStatus(response.data.currentStatus);
      } catch (error) {
        console.error("Error loading serving hours:", error);
        setServingHoursStatus(null);
      }
    };

    loadServingHours();
  }, [branchSummary?.id]);

  const handlePaymentSuccess = async (paymentId: string) => {
    // paymentId can be either Stripe paymentIntentId or PayPal orderID
    if (!reservationData || !isSignedIn) {
      toast.error(t("reservations.checkout.missingInfoError"));
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        toast.error(t("reservations.checkout.authRequired"));
        return;
      }

      // Prepare order items
      const orderItems = cartItems.map((item) => {
        // Find the meal size type from the size name
        const meal = meals.find((m) => m.id === item.mealId);

        
        let mealSizeType: string | undefined = undefined;
        if (item.size && meal) {
          const sizeName = String(item.size || "");
          // Try exact match first
          let sizeObj = meal.mealSizes?.find((s) => s.name === sizeName);
          
          // If not found, try case-insensitive match
          if (!sizeObj) {
            sizeObj = meal.mealSizes?.find(
              (s) => s.name.toLowerCase() === sizeName.toLowerCase()
            );
          }
          
          // If still not found, try trimming whitespace
          if (!sizeObj) {
            sizeObj = meal.mealSizes?.find(
              (s) => s.name.trim().toLowerCase() === sizeName.trim().toLowerCase()
            );
          }
          
          if (sizeObj) {
            mealSizeType = sizeObj.sizeType;
          } else {
            console.error(`[ReservationCheckout] ❌ Size not found for meal ${item.mealId} (${item.name}), requested size: "${item.size}". Available sizes:`, meal.mealSizes?.map(s => ({ name: s.name, sizeType: s.sizeType, price: s.price })));
          }
        } else {
          console.warn(`[ReservationCheckout] ⚠️  Missing size or meal:`, {
            mealId: item.mealId,
            size: item.size,
            mealFound: !!meal
          });
        }
        
        if (!mealSizeType) {
          console.warn(`[ReservationCheckout] ⚠️  No mealSizeType found for item ${item.mealId}, size: ${item.size}. Using fallback "M"`);
        }
        
        return {
          mealId: item.mealId,
          mealSizeType: mealSizeType || "M", // Fallback to M if not found (M is the default)
          quantity: item.quantity,
          addons: (item.addOns || []).map((addon) => ({
            addonId: addon.id,
            name: addon.name || "", // Include addon name
            quantity: addon.quantity || 1,
            price: addon.price, // Use the price from cart item
            type: addon.type, // Include addon type
            sizeType: addon.sizeType, // Include size type
          })),
          optionalIngredients: item.optionalIngredients || [],
          specialInstructions: item.specialInstructions || undefined,
        };
      });
      // Validate required fields before sending
      if (!reservationData.date || !reservationData.time || !reservationData.numberOfGuests ||
          !reservationData.customerName || !reservationData.customerEmail || !reservationData.customerPhone ||
          !orderItems || orderItems.length === 0 || (paymentRequired && !paymentId)) {
        console.error("Missing required fields:", {
          date: reservationData.date,
          time: reservationData.time,
          numberOfGuests: reservationData.numberOfGuests,
          customerName: reservationData.customerName,
          customerEmail: reservationData.customerEmail,
          customerPhone: reservationData.customerPhone,
          orderItemsLength: orderItems?.length,
          paymentId: !!paymentId,
        });
        toast.error(t("reservations.checkout.missingInfoError"));
        return;
      }

      // Check minimum order amount before proceeding (use combined total for modifications)
      if (preOrderMinAmount && totalForMinimum < preOrderMinAmount) {
        toast.error(
          t("reservations.checkout.minimumOrderError", { amount: formatPrice(preOrderMinAmount, currency), current: formatPrice(totalForMinimum, currency) }),
          { duration: 6000 }
        );
        return;
      }

      // Handle modification vs new reservation
      if (isModifying && existingReservation) {
        // Merge new items with existing items
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
                addonId: addon.addon_id,
                name: addon.addOnName,
                quantity: perItemAddonQuantity, // Per-item quantity
                price: Number(addon.addOnPrice),
                type: addon.addon_type || "BOOLEAN",
                sizeType: addon.addonSizeType,
              };
            }),
            optionalIngredients: (item.optionalIngredients || []).map((ing: any) => ({
              id: ing.optionalIngredientId,
              name: ing.ingredientName,
              isIncluded: ing.isIncluded,
            })),
            specialInstructions: item.specialInstructions,
          };
        });

        // Combine existing and new items
        const allOrderItems = [...existingOrderItems, ...orderItems];

        // Modify the reservation with combined items and payment
        const modifyData: any = {
          orderItems: allOrderItems,
        };
        
        // Pass payment ID based on payment method
        if (paymentMethod === "paypal") {
          modifyData.paypalOrderId = paymentId;
        } else {
          modifyData.paymentIntentId = paymentId;
        }
        
        const modifiedReservation = await reservationService.modifyReservation(
          existingReservation.id,
          modifyData,
          token
        );

        // Clear cart and modification data
        clearCart();
        sessionStorage.removeItem("modifyingReservationId");
        sessionStorage.removeItem("modifyingReservationBranchId");
        // Trigger storage events to update navbar and other components
        window.dispatchEvent(new StorageEvent("storage", { key: "modifyingReservationId" }));
        window.dispatchEvent(new StorageEvent("storage", { key: "modifyingReservationBranchId" }));

        // Show meaningful notification with details
        const newItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
        const newItemsNames = cartItems.map(item => `${item.quantity}x ${item.name}`).join(", ");
        
        toast.success(
          <div className="space-y-2 text-white">
            <div className="font-semibold text-base text-white">
              {t("reservations.checkout.modifiedSuccess")}
            </div>
            <div className="text-sm space-y-1 text-white">
              <div className="flex items-center gap-2 text-white">
                <span className="font-medium text-white">{t("reservations.checkout.reservation")}</span>
                <span className="text-pink-300 font-semibold">
                  #{modifiedReservation.reservationNumber || existingReservation.reservationNumber}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white">
                <span className="font-medium text-white">{t("reservations.checkout.itemsAdded")}</span>
                <span className="text-white">{newItemsCount} {newItemsCount !== 1 ? t("reservations.checkout.items") : t("reservations.checkout.item")}</span>
              </div>
              <div className="flex items-center gap-2 text-white">
                <span className="font-medium text-white">{t("reservations.checkout.amountPaid")}</span>
                <span className="text-green-300 font-semibold">
                  {formatPrice(newItemsTotal, currency)}
                </span>
              </div>
              {newItemsNames.length < 100 && (
                <div className="text-xs text-white/80 pt-1 border-t border-white/30">
                  {newItemsNames}
                </div>
              )}
            </div>
          </div>,
          {
            duration: 8000,
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
            },
          }
        );

        // Redirect back to reservations page
        navigate("/reservations/my-reservations");
      } else {
        // Create new pre-order reservation (backend will create the order internally)
        const reservationData_payload: any = {
          reservationDate: reservationData.date,
          time: reservationData.time,
          numberOfGuests: reservationData.numberOfGuests,
          customerName: reservationData.customerName,
          customerEmail: reservationData.customerEmail,
          customerPhone: reservationData.customerPhone,
          specialRequests: specialRequests || reservationData.specialRequests || undefined,
          preferredZone: reservationData.preferredZone || undefined,
          branchId: reservationData.branchId || undefined,
          zoneId: reservationData.zoneId || undefined,
          ...(reservationData.tableIds && reservationData.tableIds.length > 0 && { tableIds: reservationData.tableIds }),
          orderItems,
        };
        
        // Pass payment ID based on payment method
        if (paymentMethod === "paypal") {
          reservationData_payload.paypalOrderId = paymentId;
        } else {
          reservationData_payload.paymentIntentId = paymentId;
        }
        
      await reservationService.createPreOrderReservation(
        reservationData_payload,
        token
      );

      // Clear cart and reservation data
      clearCart();
      sessionStorage.removeItem("pendingReservation");
      sessionStorage.removeItem("preOrderBranchLock");

      toast.success(t("reservations.checkout.createdSuccess"), {
        duration: 5000,
      });

      // Redirect to my reservations page
      navigate("/reservations/my-reservations");
      }
    } catch (error: any) {
      console.error("Error creating pre-order reservation:", error);
      console.error("Error details:", {
        response: error.response?.data,
        status: error.response?.status || error.status,
        message: error.message,
        error: error,
      });
      
      // Extract error message from various possible locations
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message ||
                          error.message ||
                          t("reservations.checkout.createError");
      
      console.error("Final error message:", errorMessage);
      
      toast.error(errorMessage, {
        duration: 7000,
      });
    }
  };

  const handlePaymentError = (error: string) => {
    toast.error(error);
  };

  const handleCancelReservation = () => {
    // Clear cart and reservation data
    clearCart();
    sessionStorage.removeItem("pendingReservation");
    sessionStorage.removeItem("modifyingReservationId");
    
    // Navigate to home page
    navigate("/");
    
    toast.info(t("reservations.checkout.cancelReservation"), {
      duration: 3000,
    });
  };

  const handleModifyReservationDetails = () => {
    // Save current reservation data to sessionStorage so the booking page can pre-fill it
    if (reservationData) {
      sessionStorage.setItem("pendingReservation", JSON.stringify(reservationData));
      // Set flag to indicate we're coming from checkout
      sessionStorage.setItem("fromCheckout", "true");
    }
    // Navigate to reservation booking page
    navigate("/reservations/book");
  };

  if (!reservationData) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <p className="text-muted-foreground">{t("reservations.checkout.loadingDetails")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="loading-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-[-10px]">
        <Link
          to={isModifying ? "/reservations/my-reservations" : "/menu?reservation=pre-order"}
          className="flex items-center gap-2 text-pink-500 hover:text-pink-400 transition-colors"
        >
          <Icon path={mdiArrowLeft} size={0.83} className="text-pink-500" />
          <span className="text-sm font-medium">{t("reservations.checkout.back")}</span>
        </Link>
        <h1 className="text-lg font-semibold text-white whitespace-nowrap">
          {isModifying ? t("reservations.checkout.addItemsTitle") : t("reservations.checkout.title")}
        </h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-4xl mx-auto ${!isModifying ? 'mt-6' : ''}`}>
        {/* Left Column - Payment */}
        <div className="lg:col-span-2 space-y-6">
          {/* Reservation Details Card - Display only with modify button */}
          {!isModifying && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon path={mdiCalendar} size={0.83} className="text-pink-500" />
                  {t("reservations.checkout.reservationDetails")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Icon path={mdiCalendar} size={0.67} className="text-muted-foreground" />
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("reservations.checkout.date")}</Label>
                      <p className="text-sm font-medium text-foreground">
                        {reservationData.date ? new Date(`${reservationData.date}T${reservationData.time || "12:00"}`).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }) : t("reservations.checkout.notSet")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Icon path={mdiClock} size={0.67} className="text-muted-foreground" />
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("reservations.checkout.time")}</Label>
                      <p className="text-sm font-medium text-foreground">
                        {reservationData.time || t("reservations.checkout.notSet")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Icon path={mdiAccountGroup} size={0.67} className="text-muted-foreground" />
                    <div>
                      <Label className="text-xs text-muted-foreground">{t("reservations.checkout.guests")}</Label>
                      <p className="text-sm font-medium text-foreground">
                        {reservationData.numberOfGuests} {reservationData.numberOfGuests === 1 ? t("reservations.checkout.guest") : t("reservations.checkout.guests")}
                      </p>
                    </div>
                  </div>
                  {reservationData.zoneName && (
                    <div className="flex items-center gap-3">
                      <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground" />
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("reservations.checkout.zone")}</Label>
                        <p className="text-sm font-medium text-foreground">
                          {reservationData.zoneName}
                        </p>
                      </div>
                    </div>
                  )}
                  {reservationData.tableNumbers && reservationData.tableNumbers.length > 0 && (
                    <div className="flex items-center gap-3">
                      <Icon path={mdiSilverwareForkKnife} size={0.67} className="text-muted-foreground" />
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("reservations.checkout.tables")}</Label>
                        <p className="text-sm font-medium text-foreground">
                          {reservationData.tableNumbers.length === 1 
                            ? `${t("reservations.checkout.table")} ${reservationData.tableNumbers[0]}`
                            : reservationData.tableNumbers.join(", ")}
                        </p>
                      </div>
                    </div>
                  )}
                  {reservationData.preferredZone && !reservationData.zoneName && (
                    <div className="flex items-center gap-3">
                      <Icon path={mdiMapMarker} size={0.67} className="text-muted-foreground" />
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("reservations.checkout.preferredZone")}</Label>
                        <p className="text-sm font-medium text-foreground">
                          {reservationData.preferredZone}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleModifyReservationDetails}
                  className="w-full border-pink-200 text-pink-600 bg-transparent hover:bg-pink-50 hover:text-pink-700 dark:border-pink-800 dark:text-pink-400 dark:bg-transparent dark:hover:bg-pink-950/20 dark:hover:text-pink-300"
                >
                  <Icon path={mdiCalendar} size={0.67} className="mr-2" />
                  {t("reservations.checkout.modifyDetails")}
                </Button>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Right Column - Order Summary */}
        <div className="space-y-0">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold">{t("reservations.checkout.orderSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {/* Order Items */}
              <div className="space-y-1.5">
                {cartItems.map((item) => {
                  const meal = meals.find((m) => m.id === item.mealId);
                  if (!meal) return null;

                  // Use cart item prices directly (they're already correct)
                  // item.basePrice already includes meal basePrice + size price
                  const itemPrice = item.basePrice;
                  
                  // Calculate item subtotal using cart item prices
                  const addonPrice = (item.addOns || []).reduce((sum, addOn) => {
                    const addOnQuantity = addOn.quantity || 1;
                    return sum + addOn.price * addOnQuantity;
                  }, 0);
                  
                  const itemSubtotal = (itemPrice + addonPrice) * item.quantity;
                  
                  // Get addon details for display (use cart item prices)
                  const addonDetails = (item.addOns || []).map((addOn) => {
                    const addonData = addons.find((a) => a.id === addOn.id);
                    if (!addonData) return null;
                    
                    const addOnQuantity = addOn.quantity || 1;
                    // Use the price from cart item (already correct for size)
                    return {
                      ...addOn,
                      name: addonData.name,
                      image: addonData.image,
                      price: addOn.price, // Use cart item price
                      totalPrice: addOn.price * addOnQuantity * item.quantity,
                    };
                  }).filter(Boolean);

                  return (
                    <div key={item.id} className="border-b border-border pb-1.5 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {meal.image && (
                            <img
                              src={
                                isExternalImage(meal.image)
                                  ? meal.image
                                  : getOptimizedImageUrl(meal.image)
                              }
                              alt={meal.name}
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/placeholder-meal.png";
                              }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs text-foreground truncate">
                              {item.quantity}x {meal.name}
                            </p>
                            {item.size && (
                              <p className="text-[10px] text-muted-foreground">
                                {item.size}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="font-semibold text-xs text-foreground whitespace-nowrap">
                          {formatPrice(itemSubtotal, currency)}
                        </p>
                      </div>

                      {/* Add-ons display - Compact */}
                      {addonDetails.length > 0 && (
                        <div className="ml-12 mt-1 space-y-0.5">
                          {addonDetails.map((addon) => (
                            <div
                              key={addon?.id}
                              className="flex items-center justify-between gap-2 text-[10px]"
                            >
                              <span className="text-muted-foreground truncate flex-1">
                                • {addon?.name}
                                {addon && addon.quantity && addon.quantity > 1 ? ` ×${addon.quantity}` : ""}
                              </span>
                              <span className="font-medium text-foreground whitespace-nowrap">
                                {formatPrice(addon?.totalPrice || 0, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Totals - Compact */}
              <div className="space-y-1 pt-2 border-t border-border">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {taxInclusive
                      ? t("checkout.step2.subtotalInclTax", { defaultValue: "Subtotal (incl. tax)" })
                      : t("reservations.checkout.subtotal")}
                  </span>
                  <span className="text-foreground font-medium">{formatPrice(subtotal, currency)}</span>
                </div>
                {!taxInclusive && taxBreakdown && (
                  <div className="space-y-0.5 pt-1 border-t border-border/50">
                    {taxBreakdown.itemTaxAmount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {t("reservations.checkout.itemTax")}{" "}
                          {displayTaxPercentage ? `(${displayTaxPercentage}%)` : ""}
                        </span>
                        <span className="text-foreground font-medium">
                          {formatPrice(taxBreakdown.itemTaxAmount || 0, currency)}
                        </span>
                      </div>
                    )}
                    {taxBreakdown.addonTaxAmount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t("reservations.checkout.addonTax")}</span>
                        <span className="text-foreground font-medium">
                          {formatPrice(taxBreakdown.addonTaxAmount || 0, currency)}
                        </span>
                      </div>
                    )}
                    {tax > 0 && (
                      <div className="flex justify-between text-xs font-medium pt-0.5 border-t border-border/30">
                        <span className="text-foreground">
                          {t("reservations.checkout.totalTax")}{" "}
                          {displayTaxPercentage ? `(${displayTaxPercentage}%)` : ""}
                        </span>
                        <span className="text-foreground">
                          {formatPrice(tax, currency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {!taxInclusive && !taxBreakdown && tax > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("reservations.checkout.tax")}</span>
                    <span className="text-foreground font-medium">{formatPrice(tax, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-border mt-1">
                  <span className="text-foreground">{t("reservations.checkout.total")}</span>
                  <span className="text-pink-600 dark:text-pink-400">{formatPrice(isModifying ? newItemsTotal : finalTotal, currency)}</span>
                </div>
              </div>

              {/* Deposit Information */}
              {depositPercentage !== undefined && (
                <div className="pt-3 border-t border-border mt-2">
                  {depositPercentage === 0 ? (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-blue-900 dark:text-blue-100 font-medium mb-1">
                        {t("reservations.checkout.noDepositRequired")}
                      </p>
                      <p className="text-[10px] text-blue-800 dark:text-blue-200">
                        {t("reservations.checkout.payAtRestaurant")}
                      </p>
                    </div>
                  ) : depositPercentage < 100 ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-xs text-amber-900 dark:text-amber-100 font-medium mb-1.5">
                          {t("reservations.checkout.depositRequired")}
                        </p>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-amber-800 dark:text-amber-200">
                              {t("reservations.checkout.depositAmount")} ({depositPercentage}%):
                            </span>
                            <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                              {formatPrice(payableAmount, currency)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-amber-200 dark:border-amber-700">
                            <span className="text-[10px] text-amber-800 dark:text-amber-200">
                              {t("reservations.checkout.remainingBalance")}:
                            </span>
                            <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                              {formatPrice(Math.max(0, finalTotal - payableAmount), currency)}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1.5">
                          {t("reservations.checkout.depositDescription")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-xs text-green-900 dark:text-green-100 font-medium mb-1">
                        {t("reservations.checkout.fullPaymentRequired")}
                      </p>
                      <p className="text-[10px] text-green-800 dark:text-green-200">
                        {t("reservations.checkout.fullPaymentDescription")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Notes */}
              <div className="pt-4 border-t border-border">
                <div className="space-y-1.5">
                  <Label htmlFor="specialRequests" className="text-xs text-muted-foreground">{t("reservations.checkout.additionalNotes")}</Label>
                  <Textarea
                    id="specialRequests"
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder={t("reservations.checkout.additionalNotesPlaceholder")}
                    rows={2}
                    className="bg-transparent text-sm"
                  />
                </div>
              </div>

                  {/* Payment Method */}
              <div className="pt-4 border-t border-border">
                {/* Serving Hours Warning - Only show when modifying, not for new reservations */}
                {isModifying && servingHoursStatus && !servingHoursStatus.isOpen && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg mb-3">
                    <div className="flex items-start gap-3">
                      <Icon path={mdiAlert} size={0.67} className="text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-orange-900 dark:text-orange-100">
                          <strong>{t("checkout.servingHours.warningTitle")}</strong>
                          <span className="block mt-1">
                            {getServingHoursMessage(servingHoursStatus)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {!isModifying && preOrderMinAmount && !isMinimumOrderMet && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-3">
                    <p className="text-xs text-yellow-900 dark:text-yellow-100">
                      <strong>{t("reservations.checkout.minimumOrderRequired")}</strong> {t("reservations.checkout.minimumOrderMessage", { amount: formatPrice(preOrderMinAmount, currency), current: formatPrice(finalTotal, currency) })}
                    </p>
                  </div>
                )}
                
                {/* Payment Method Selection - Only show if both methods are allowed and not locked */}
                {paymentRequired && cardAllowed && paypalAllowed && !isPaymentMethodLocked && (
                  <div className="mb-4 space-y-3">
                    <Label className="text-xs text-muted-foreground">{t("checkout.step2.paymentMethod")}</Label>
                    <RadioGroup
                      value={paymentMethod}
                      onValueChange={(value: string) => {
                        setPaymentMethod(value as "card" | "paypal");
                      }}
                      className="space-y-3"
                    >
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="card" id="reservation-card-payment" />
                        <Label
                          htmlFor="reservation-card-payment"
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {t("checkout.step2.creditDebitCard")}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="paypal" id="reservation-paypal-payment" />
                        <Label
                          htmlFor="reservation-paypal-payment"
                          className="text-sm font-medium text-foreground cursor-pointer"
                        >
                          {t("checkout.step2.paypal")}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
                {isModifying && isPaymentMethodLocked && (
                  <div className="mb-4 p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      {lockedPaymentProvider === "PAYPAL"
                        ? t(
                            "reservations.checkout.paymentMethodLockedPayPal",
                            "This reservation was paid with PayPal. Please use PayPal for modifications."
                          )
                        : t(
                            "reservations.checkout.paymentMethodLockedStripe",
                            "This reservation was paid with Stripe. Please use card payment for modifications."
                          )}
                    </p>
                  </div>
                )}
                
                <div className="space-y-3">
                  {!paymentRequired ? (
                    <Button
                      type="button"
                      className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 focus-visible:ring-2 focus-visible:ring-rose-400"
                      disabled={!isMinimumOrderMet}
                      onClick={() => handlePaymentSuccess("")}
                    >
                      {isModifying
                        ? t("reservations.checkout.addItemsToReservation")
                        : t("reservations.checkout.placeReservation")}
                    </Button>
                  ) : cardAllowed && !paypalAllowed ? (
                    // Only card is allowed - show it
                    <StripePaymentForm
                      amount={payableAmount}
                      currency={currency}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      buttonText={
                        isModifying 
                          ? t("reservations.checkout.addItemsToReservation")
                          : t("reservations.checkout.placeReservation")
                      }
                      orderData={{
                        subtotal,
                        tax,
                        totalAmount: isModifying ? newItemsTotal : finalTotal,
                        depositPercentage,
                        payableAmount,
                      }}
                      cartItems={cartItems}
                      disabled={!isMinimumOrderMet}
                      skipOrderCreation={true}
                      buttonClassName="whitespace-nowrap"
                    />
                  ) : paypalAllowed && !cardAllowed ? (
                    // Only PayPal is allowed - show it
                    <PayPalPaymentForm
                      amount={payableAmount}
                      currency={currency}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      orderData={{
                        subtotal,
                        tax,
                        totalAmount: isModifying ? newItemsTotal : finalTotal,
                        depositPercentage,
                        payableAmount,
                      }}
                      cartItems={cartItems}
                      disabled={!isMinimumOrderMet}
                      skipOrderCreation={true}
                    />
                  ) : cardAllowed && paypalAllowed && paymentMethod === "card" ? (
                    // Both allowed, user selected card
                    <StripePaymentForm
                      amount={payableAmount}
                      currency={currency}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      buttonText={
                        isModifying 
                          ? t("reservations.checkout.addItemsToReservation")
                          : t("reservations.checkout.placeReservation")
                      }
                      orderData={{
                        subtotal,
                        tax,
                        totalAmount: isModifying ? newItemsTotal : finalTotal,
                        depositPercentage,
                        payableAmount,
                      }}
                      cartItems={cartItems}
                      disabled={!isMinimumOrderMet}
                      skipOrderCreation={true}
                      buttonClassName="whitespace-nowrap"
                    />
                  ) : cardAllowed && paypalAllowed && paymentMethod === "paypal" ? (
                    // Both allowed, user selected PayPal
                    <PayPalPaymentForm
                      amount={payableAmount}
                      currency={currency}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      orderData={{
                        subtotal,
                        tax,
                        totalAmount: isModifying ? newItemsTotal : finalTotal,
                        depositPercentage,
                        payableAmount,
                      }}
                      cartItems={cartItems}
                      disabled={!isMinimumOrderMet}
                      skipOrderCreation={true}
                    />
                  ) : paymentRequired && !cardAllowed && !paypalAllowed ? (
                    // Payment required but no methods allowed
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        {t("reservations.checkout.onlinePaymentRequired")}
                      </p>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelReservation}
                    className="w-full border-red-200 text-red-600 bg-transparent hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:bg-transparent dark:hover:bg-red-950/20 dark:hover:text-red-300"
                  >
                    <Icon path={mdiClose} size={0.67} className="mr-2" />
                    {t("reservations.checkout.cancelReservation")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ReservationCheckout;

