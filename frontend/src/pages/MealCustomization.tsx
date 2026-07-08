import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiPlus, mdiMinus, mdiRefresh, mdiChevronRight, mdiAlert } from "@mdi/js";
import {
  Link,
  useParams,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useCartStore } from "@/store/cartStore";
import type { CartItem, AddOn } from "@/store/cartStore";
import ApiService from "@/services/apiService";
import type { Meal, MealDeclaration } from "@/services/mealService";
import { toast } from "sonner";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useSettings } from "@/contexts/SettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import type { OptionalIngredient as CartOptionalIngredient } from "@/store/cartStore";
import { getAddonPriceForMealSize, getNearestSmallerAddonSize, type SizeType } from "@/utils/sizeMatcher";
import { deliverableQuantityService, type PublicAvailableWeight } from "@/services/deliverableQuantityService";
import { formatInTimeZone } from "date-fns-tz";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/utils/mealAvailability";
import { getLocalizedName, getLocalizedDescription } from "@/utils/localization";

export default function MealCustomization() {
  const { mealId } = useParams<{ mealId: string }>();
  const navigate = useNavigate();
  const { maxOrderQuantity, currency, settings } = useSettings();
  const { branch, branches } = useBranch();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("edit") === "1";
  const editCartItemId = searchParams.get("cartItemId") || undefined;
  const from = searchParams.get("from");
  const categoryId = searchParams.get("categoryId");
  const [meal, setMeal] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t, i18n } = useTranslation();

  const getAddonName = (addOn: { name: string; nameFa?: string | null }): string => {
    return getLocalizedName(addOn.name, addOn.nameFa, i18n.language);
  };

  const getAddonDescription = (addOn: { description: string | null; descriptionFa?: string | null }): string | null => {
    return getLocalizedDescription(addOn.description, addOn.descriptionFa, i18n.language);
  };

  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  
  // Get the sizeType of the currently selected meal size
  const selectedMealSizeType = meal?.mealSizes.find(
    (size) => size.name === selectedSize
  )?.sizeType as SizeType | undefined;
  const [selectedOptionalIngredients, setSelectedOptionalIngredients] =
    useState<CartOptionalIngredient[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showDeclarationsSheet, setShowDeclarationsSheet] = useState(false);
  const [showAddOnsSheet, setShowAddOnsSheet] = useState(false);
  const [showOptionalIngredientsSheet, setShowOptionalIngredientsSheet] =
    useState(false);

  // Deliverable quantity availability state
  const [availability, setAvailability] = useState<PublicAvailableWeight | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_availabilityError, setAvailabilityError] = useState<string | null>(null);

  const { addItem, getItemById, replaceItem, items: cartItems } = useCartStore();

  useEffect(() => {
    const fetchMeal = async () => {
      if (!mealId) return;

      try {
        setLoading(true);
        setError(null);
        const apiService = ApiService.getInstance();
        const response = await apiService.getMeal(mealId, undefined, branch?.id);

        if (response.success) {
          setMeal(response.data);
          // Initialize optional ingredients - all unselected by default
          const optionalIngredients: CartOptionalIngredient[] =
            response.data.mealOptionalIngredients?.map(
              (moi: {
                id: string;
                optionalIngredient: {
                  id: string;
                  name: string;
                  description: string | null;
                };
              }) => ({
                id: moi.optionalIngredient.id,
                name: moi.optionalIngredient.name,
                isIncluded: false, // Default to unselected
              })
            ) || [];

          // Set defaults or preload from cart when editing
          if (isEditMode && editCartItemId) {
            const existing = getItemById(editCartItemId);
            if (existing) {
              setSelectedSize(
                existing.size || response.data.mealSizes[0]?.name || ""
              );
              setSelectedAddOns(existing.addOns || []);
              setSelectedOptionalIngredients(
                existing.optionalIngredients || optionalIngredients
              );
              setSpecialInstructions(existing.specialInstructions || "");
              setQuantity(existing.quantity || 1);
            } else if (response.data.mealSizes.length > 0) {
              setSelectedSize(response.data.mealSizes[0].name);
              setSelectedOptionalIngredients(optionalIngredients);
            }
          } else {
            if (response.data.mealSizes.length > 0) {
              setSelectedSize(response.data.mealSizes[0].name);
            }
            setSelectedOptionalIngredients(optionalIngredients);
          }
        } else {
          setError(t("mealCustomization.fetchError"));
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("mealCustomization.errorOccurred")
        );
        console.error("Error fetching meal:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMeal();
  }, [mealId]);

  // Fetch availability when meal and branch are available
  const fetchAvailability = useCallback(async () => {
    if (!mealId || !branch?.id) {
      setAvailability(null);
      return;
    }

    try {
      setLoadingAvailability(true);
      setAvailabilityError(null);
      const result = await deliverableQuantityService.getPublicAvailableWeight(
        branch.id,
        mealId
      );
      setAvailability(result);
    } catch (error) {
      console.error("Error fetching availability:", error);
      setAvailabilityError("Failed to check availability");
      // Don't block adding to cart if availability check fails
      setAvailability(null);
    } finally {
      setLoadingAvailability(false);
    }
  }, [mealId, branch?.id]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Calculate if the current selection can be added to cart based on deliverable limits
  const checkCanAddToCart = useCallback((): { canAdd: boolean; message: string | null } => {
    // If no availability data or no limit configured, allow adding
    if (!availability || availability.availableWeight === null) {
      return { canAdd: true, message: null };
    }

    // Get the size type of the selected size
    const selectedSizeType = meal?.mealSizes.find(
      (size) => size.name === selectedSize
    )?.sizeType;

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
    let cartWeightForThisMeal = 0;
    const cartItemsForMeal = cartItems.filter(item => item.mealId === mealId);
    
    for (const cartItem of cartItemsForMeal) {
      // Skip the item being edited (we'll use the new quantity instead)
      if (isEditMode && editCartItemId && cartItem.id === editCartItemId) {
        continue;
      }
      
      // Find the size type for this cart item
      const cartItemSizeType = meal?.mealSizes.find(
        (size) => size.name === cartItem.size
      )?.sizeType;
      
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
        // Already at or over limit from cart items
        return {
          canAdd: false,
          message: t("mealCustomization.dailyLimitReached") || "Daily limit reached",
        };
      }
      return {
        canAdd: false,
        message: t("mealCustomization.canAddMax", { maxQty: maxQtyCanAdd }) || `You can add max ${maxQtyCanAdd} more`,
      };
    }

    return { canAdd: true, message: null };
  }, [availability, meal?.mealSizes, selectedSize, quantity, t, cartItems, mealId, isEditMode, editCartItemId]);

  const { canAdd: canAddToCart, message: availabilityMessage } = checkCanAddToCart();

  const selectedBranch = (branch?.id ? branches.find((b) => b.id === branch.id) : null) ?? null;
  const effectiveTimezone = getEffectiveTimezone({
    branchTimezone: (selectedBranch as any)?.timezone ?? null,
    settingsTimezone: (settings as any)?.timezone ?? null,
  });

  const branchAvailability = getMealAvailabilityNow({
    meal,
    branchId: branch?.id,
    tz: effectiveTimezone,
  });
  const isAvailableByBranchTiming = branchAvailability.isAvailableNow;
  const nextAvailableAt = branchAvailability.nextAvailableAt;

  const nextAvailableText = nextAvailableAt
    ? formatInTimeZone(nextAvailableAt, effectiveTimezone, "EEE HH:mm")
    : null;

  if (loading) {
    return (
      <section className="space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (from === "category" && categoryId) {
                navigate(`/category/${encodeURIComponent(categoryId)}`);
              } else if (from === "menu" && categoryId) {
                navigate(`/menu?categoryId=${encodeURIComponent(categoryId)}`);
              } else {
                navigate("/home");
              }
            }}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("mealCustomization.loadingDetails")}
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("mealCustomization.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("mealCustomization.loadingDescription")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !meal) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">
            {t("mealCustomization.notFound")}
          </h2>
          <p className="text-red-500 mb-4">{error}</p>
          <Link to="/" className="text-pink-500 hover:text-pink-600">
            {t("mealCustomization.backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  // Helper function to get the correct addon price and size type based on selected meal size
  const getAddonPriceAndSize = (addOn: {
    id: string;
    price?: string;
    effectiveBasePrice?: number;
    addonSizes?: Array<{
      sizeType: "S" | "M" | "L" | "XL";
      price: string;
    }>;
  }): { price: number; sizeType?: "S" | "M" | "L" | "XL" } => {
    // Get original base price (for calculating size price adjustments)
    const originalBasePrice = addOn.price ? parseFloat(addOn.price) : 0;
    // Use effectiveBasePrice if available (branch-specific), otherwise use original base price
    const branchBasePrice = addOn.effectiveBasePrice !== undefined && addOn.effectiveBasePrice !== null 
      ? addOn.effectiveBasePrice 
      : originalBasePrice;
    
    // If addon has size-based pricing, use that
    if (addOn.addonSizes && addOn.addonSizes.length > 0) {
      const matchedSize = getNearestSmallerAddonSize(
        selectedMealSizeType,
        addOn.addonSizes.map((s) => s.sizeType)
      );
      
      // Get the original size price from database
      const originalSizePrice = getAddonPriceForMealSize(
        selectedMealSizeType,
        addOn.addonSizes.map((s) => ({
          sizeType: s.sizeType,
          price: s.price,
        }))
      );
      
      if (originalSizePrice !== null) {
        // If there's a branch-specific base price, adjust the size price
        // Formula: adjustedPrice = branchBasePrice + (originalSizePrice - originalBasePrice)
        // This preserves the size differential while applying the branch-specific base
        const sizePriceAdjustment = originalSizePrice - originalBasePrice;
        const adjustedSizePrice = branchBasePrice + sizePriceAdjustment;
        return { price: adjustedSizePrice, sizeType: matchedSize || undefined };
      }
      
      return { price: 0, sizeType: matchedSize || undefined };
    }
    
    // Use branch-specific price if available, otherwise fallback to deprecated price field
    // Always prefer effectiveBasePrice when it exists (even if it's 0, it means branch override exists)
    if (addOn.effectiveBasePrice !== undefined) {
      return { price: addOn.effectiveBasePrice };
    }
    return { price: originalBasePrice };
  };

  // Helper function to get the correct addon price based on selected meal size (backward compatibility)
  const getAddonPrice = (addOn: {
    id: string;
    price?: string;
    effectiveBasePrice?: number;
    addonSizes?: Array<{
      sizeType: "S" | "M" | "L" | "XL";
      price: string;
    }>;
  }): number => {
    return getAddonPriceAndSize(addOn).price;
  };

  const handleAddOnToggle = (addOn: {
    id: string;
    name: string;
    nameFa?: string | null;
    price?: string;
    effectiveBasePrice?: number;
    type: "BOOLEAN" | "QUANTITY";
    addonSizes?: Array<{
      sizeType: "S" | "M" | "L" | "XL";
      price: string;
    }>;
  }) => {
    const { price: addOnPrice, sizeType } = getAddonPriceAndSize(addOn);
    const addOnObj: AddOn = {
      id: addOn.id,
      name: addOn.name,
      nameFa: (addOn as any).nameFa || null,
      price: addOnPrice,
      type: addOn.type,
      sizeType: sizeType,
    };

    setSelectedAddOns((prev) =>
      prev.find((a) => a.id === addOnObj.id)
        ? prev.filter((a) => a.id !== addOnObj.id)
        : [...prev, addOnObj]
    );
  };

  const handleQuantityChange = (addOnId: string, newQuantity: number) => {
    const addOn = meal?.mealAddOns?.find(
      (ma) => ma.addOn?.id === addOnId
    )?.addOn;
    if (!addOn) return;

    const { price: addOnPrice, sizeType } = getAddonPriceAndSize(addOn);
    const addOnObj: AddOn = {
      id: addOn.id,
      name: addOn.name,
      nameFa: ('nameFa' in addOn ? (addOn as any).nameFa : null),
      price: addOnPrice,
      type: addOn.type as "BOOLEAN" | "QUANTITY",
      quantity: newQuantity,
      sizeType: sizeType,
    };

    setSelectedAddOns((prev) => {
      if (newQuantity === 0) {
        // Remove addon if quantity is 0
        return prev.filter((a) => a.id !== addOnId);
      } else {
        // Update or add addon with new quantity
        const existingIndex = prev.findIndex((a) => a.id === addOnId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = addOnObj;
          return updated;
        } else {
          return [...prev, addOnObj];
        }
      }
    });
  };

  const toggleOptionalIngredient = (ingredientId: string) => {
    // Explicitly check if the setting is true (default to true if undefined)
    const canExclude = settings?.allowExcludeOptionalIngredients ?? true;
    if (!canExclude) return; // Don't allow toggling if admin disabled it

    setSelectedOptionalIngredients((prev) =>
      prev.map((ing) =>
        ing.id === ingredientId ? { ...ing, isIncluded: !ing.isIncluded } : ing
      )
    );
  };

  const handleAddToCart = async () => {
    if (!isAvailableByBranchTiming) {
      toast.error(
        nextAvailableText
          ? t("mealCustomization.notAvailableRightNowToastWithNext", { next: nextAvailableText })
          : t("mealCustomization.notAvailableRightNowToast"),
        {
          duration: 3500,
        }
      );
      return;
    }

    const selectedSizeObj = meal.mealSizes.find(
      (size) => size.name === selectedSize
    );
    if (!selectedSizeObj) return;

    setIsAddingToCart(true);

    // Add a small delay for the click effect
    await new Promise((resolve) => setTimeout(resolve, 300));

    const isEditing = isEditMode && !!editCartItemId;
    const itemId = isEditing
      ? (editCartItemId as string)
      : `${meal.id}-${selectedSize}-${Date.now()}`;

    // Update addon prices and size types to current meal size before adding to cart
    const addOnsWithCurrentPrices = selectedAddOns.map((selectedAddOn) => {
      const mealAddOn = meal.mealAddOns.find(
        (ma) => ma.addOn?.id === selectedAddOn.id
      );
      if (mealAddOn?.addOn) {
        const { price, sizeType } = getAddonPriceAndSize(mealAddOn.addOn);
        return {
          ...selectedAddOn,
          price: price,
          sizeType: sizeType,
        };
      }
      return selectedAddOn;
    });

    const cartItem: CartItem = {
      id: itemId,
      mealId: meal.id, // Add the actual meal ID
      name: meal.name,
      basePrice:
        (meal.effectiveBasePrice ?? parseFloat(String(meal.basePrice))) + Number(selectedSizeObj.price),
      size: selectedSize,
      addOns: addOnsWithCurrentPrices,
      optionalIngredients: selectedOptionalIngredients,
      specialInstructions,
      image: meal.image
        ? isExternalImage(meal.image)
          ? meal.image
          : getOptimizedImageUrl(meal.image)
        : "https://placehold.co/800x800?text=Food",
      quantity,
    };

    try {
      if (isEditing) {
        replaceItem(itemId, cartItem);
        toast.success(t("mealCustomization.cartUpdated"), {
          duration: 1800,
          style: {
            background: "rgba(34, 197, 94, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(34, 197, 94, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          },
        });
        navigate("/home");
        return;
      } else {
        addItem(cartItem, maxOrderQuantity);
      }

      // Show success toast
      toast.success(t("mealCustomization.addedToCart"), {
        duration: 2000,
        style: {
          background: "rgba(34, 197, 94, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
        },
      });

      navigate(`/menu?categoryId=${encodeURIComponent(meal.categoryId)}`);
    } catch (error) {
      // Show error toast
      toast.error(
        error instanceof Error
          ? error.message
          : t("mealCustomization.failedToAdd"),
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
    } finally {
      setIsAddingToCart(false);
    }
  };

  const selectedSizeObj = meal.mealSizes.find(
    (size) => size.name === selectedSize
  );
  const effectiveBasePrice = meal.effectiveBasePrice ?? parseFloat(String(meal.basePrice));
  const basePrice = selectedSizeObj
    ? effectiveBasePrice + Number(selectedSizeObj.price)
    : effectiveBasePrice;
  
  // Calculate total price dynamically based on current meal size
  // This ensures addon prices update immediately when meal size changes
  const totalPrice =
    basePrice +
    selectedAddOns.reduce((sum, selectedAddOn) => {
      // Find the addon in the meal data to get current price
      const mealAddOn = meal.mealAddOns.find(
        (ma) => ma.addOn?.id === selectedAddOn.id
      );
      if (!mealAddOn?.addOn) return sum;
      
      // Get the current price based on selected meal size
      const addOnPrice = getAddonPrice(mealAddOn.addOn);
      const addOnQuantity = selectedAddOn.quantity || 1;
      return sum + addOnPrice * addOnQuantity;
    }, 0);

  return (
    <section className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (from === "category" && categoryId) {
              navigate(`/category/${encodeURIComponent(categoryId)}`);
            } else if (from === "menu" && categoryId) {
              navigate(`/menu?categoryId=${encodeURIComponent(categoryId)}`);
            } else {
              navigate("/home");
            }
          }}
          className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
        >
          <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
          {getLocalizedName(meal.name, meal.nameFa, i18n.language)}
        </h1>
      </div>

      {/* Meal Image */}
      {/* Mobile: Full width */}
      <div className="w-screen sm:hidden relative left-1/2 -translate-x-1/2">
        <div className="w-full h-[250px] relative">
          <img
            src={
              meal.image
                ? isExternalImage(meal.image)
                  ? meal.image
                  : getOptimizedImageUrl(meal.image)
                : "https://placehold.co/800x800?text=Food"
            }
            alt={getLocalizedName(meal.name, meal.nameFa, i18n.language)}
            className="h-full w-full object-cover"
            style={!isAvailableByBranchTiming ? { filter: "grayscale(1)", opacity: 0.85 } : undefined}
          />
          {!isAvailableByBranchTiming && (
            <div className="absolute top-0 left-0 right-0 bg-black/65 p-4">
              <div className="flex items-start gap-2">
                <Icon path={mdiAlert} size={0.72} className="text-amber-400 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {t("mealCustomization.notAvailableRightNow")}
                  </div>
                  <div className="text-xs text-white/90 mt-1">
                    {branchAvailability.reason || t("mealCustomization.outsideAvailabilityWindow")}
                  </div>
                  {nextAvailableText && (
                    <div className="text-xs text-white/90 mt-1">
                      {t("mealCustomization.nextAvailable", { next: nextAvailableText })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4">
            <p className="text-base font-semibold text-pink-400">
              {getLocalizedDescription(meal.description, meal.descriptionFa, i18n.language)}
            </p>
          </div>
        </div>
      </div>
      {/* Desktop: Card style */}
      <Card className="hidden sm:block overflow-hidden shadow-xl border-0 bg-gradient-to-br from-pink-50 to-rose-50">
        <CardContent className="p-0">
          <div className="aspect-video relative">
            <img
              src={
                meal.image
                  ? isExternalImage(meal.image)
                    ? meal.image
                    : getOptimizedImageUrl(meal.image)
                  : "https://placehold.co/800x800?text=Food"
              }
              alt={getLocalizedName(meal.name, meal.nameFa, i18n.language)}
              className="h-full w-full object-cover"
              style={!isAvailableByBranchTiming ? { filter: "grayscale(1)", opacity: 0.85 } : undefined}
            />
            {!isAvailableByBranchTiming && (
              <div className="absolute top-0 left-0 right-0 bg-black/65 p-4">
                <div className="flex items-start gap-2">
                  <Icon path={mdiAlert} size={0.72} className="text-amber-400 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {t("mealCustomization.notAvailableRightNow")}
                    </div>
                    <div className="text-xs text-white/90 mt-1">
                      {branchAvailability.reason || t("mealCustomization.outsideAvailabilityWindow")}
                    </div>
                    {nextAvailableText && (
                      <div className="text-xs text-white/90 mt-1">
                        {t("mealCustomization.nextAvailable", { next: nextAvailableText })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4">
              <p className="text-base font-semibold text-pink-400">
                {getLocalizedDescription(meal.description, meal.descriptionFa, i18n.language)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Declarations */}
      {meal.mealDeclarations && meal.mealDeclarations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
              <h2 className="font-bold text-lg text-foreground">
                {t("mealCustomization.declarations")}
              </h2>
            </div>
            <button
              onClick={() => setShowDeclarationsSheet(true)}
              className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
            >
              {t("mealCustomization.showMore")}
              <Icon path={mdiChevronRight} size={0.67} />
            </button>
          </div>
        </div>
      )}

      {/* Size Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
          <h2 className="font-bold text-lg text-foreground">
            {t("mealCustomization.chooseSize")}
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {meal.mealSizes.map((size) => {
            const isSelected = selectedSize === size.name;
            return (
              <button
                key={size.id}
                onClick={() => {
                setSelectedSize(size.name);
                // Update addon prices when meal size changes
                setSelectedAddOns((prev) =>
                  prev.map((selectedAddOn) => {
                    const mealAddOn = meal.mealAddOns.find(
                      (ma) => ma.addOn?.id === selectedAddOn.id
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
                className={`group relative p-4 rounded-xl border-2 text-sm font-semibold transition-all duration-300 hover:scale-105 ${
                  isSelected
                    ? "border-pink-500 bg-gradient-to-br from-pink-500/10 to-rose-500/10 text-pink-600 dark:text-pink-400 shadow-lg shadow-pink-500/20"
                    : "border-border bg-card hover:border-pink-300 hover:shadow-md"
                }`}
              >
                <div className="capitalize font-bold text-foreground">
                  {size.name}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    isSelected
                      ? "text-pink-500 dark:text-pink-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatPrice(
                    (meal.effectiveBasePrice ?? parseFloat(String(meal.basePrice))) + Number(size.price),
                    currency
                  )}
                </div>
                {isSelected && (
                  <div className="absolute -top-1 -right-1 h-6 w-6 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center animate-bounce">
                    <div className="h-2 w-2 bg-white rounded-full"></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Ingredients */}
      {meal.mealOptionalIngredients &&
        meal.mealOptionalIngredients.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
                <h2 className="font-bold text-lg text-foreground">
                  {settings?.allowExcludeOptionalIngredients ?? true
                    ? t("mealCustomization.optionalIngredients")
                    : t("mealCustomization.requiredIngredients")}
                </h2>
              </div>
              {meal.mealOptionalIngredients.length > 4 ? (
                <button
                  onClick={() => setShowOptionalIngredientsSheet(true)}
                  className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
                >
                  {t("mealCustomization.showMore")} (
                  {meal.mealOptionalIngredients.length - 4}{" "}
                  {t("mealCustomization.more")})
                  <Icon path={mdiChevronRight} size={0.67} />
                </button>
              ) : (
                <button
                  onClick={() => setShowOptionalIngredientsSheet(true)}
                  className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
                >
                  {t("mealCustomization.showMore")}
                  <Icon path={mdiChevronRight} size={0.67} />
                </button>
              )}
            </div>
            <div className="space-y-3">
              {meal.mealOptionalIngredients.slice(0, 4).map(
                (moi: {
                  id: string;
                  optionalIngredient: {
                    id: string;
                    name: string;
                    description: string | null;
                  };
                }) => {
                  const ingredient = moi.optionalIngredient;
                  const selectedIngredient = selectedOptionalIngredients.find(
                    (si) => si.id === ingredient.id
                  );
                  const isIncluded = selectedIngredient?.isIncluded ?? false;
                  const canExclude =
                    settings?.allowExcludeOptionalIngredients ?? true;

                  return (
                    <div
                      key={ingredient.id}
                      className={`group relative overflow-hidden rounded-lg border-1.5 transition-all duration-300 ${
                        isIncluded
                          ? "border-pink-500 bg-gradient-to-r from-pink-500/10 to-rose-500/10 shadow-md shadow-pink-500/20"
                          : "border-border bg-card hover:border-pink-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex gap-3 p-2.5">
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-foreground">
                              {ingredient.name}
                            </h3>
                            {ingredient.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {ingredient.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Checkbox
                              checked={isIncluded}
                              onCheckedChange={() =>
                                toggleOptionalIngredient(ingredient.id)
                              }
                              disabled={!canExclude}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        )}

      {/* Declarations Bottom Sheet */}
      <Sheet
        open={showDeclarationsSheet}
        onOpenChange={setShowDeclarationsSheet}
      >
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto bg-[#151718] border-t border-[#262626] text-white p-0 rounded-t-3xl"
        >
          <div className="px-4 pb-6 pt-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-xl font-bold text-pink-500">
              {t("mealCustomization.declarations")}
            </SheetTitle>
          </SheetHeader>
            <div className="space-y-2">
              {meal.mealDeclarations?.map(
                (mealDeclaration: MealDeclaration) => {
                  const declaration = mealDeclaration.declaration;
                  return (
                    <div
                      key={declaration.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 border border-pink-200 dark:border-pink-800"
                    >
                      {declaration.icon && (
                        <span className="text-xl flex-shrink-0">
                          {declaration.icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-pink-700 dark:text-pink-300">
                          {declaration.name}
                        </p>
                        {declaration.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {declaration.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Optional Ingredients Sheet */}
      <Sheet
        open={showOptionalIngredientsSheet}
        onOpenChange={setShowOptionalIngredientsSheet}
      >
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto bg-[#151718] border-t border-[#262626] text-white p-0 rounded-t-3xl"
        >
          <div className="px-4 pb-6 pt-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-xl font-bold text-pink-500">
                  {settings?.allowExcludeOptionalIngredients ?? true
                    ? t("mealCustomization.optionalIngredients")
                    : t("mealCustomization.requiredIngredients")}
                </SheetTitle>
                {(settings?.allowExcludeOptionalIngredients ?? true) && (
                <SheetDescription className="text-pink-400 mt-1">
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
                  </SheetDescription>
                )}
          </SheetHeader>
            <div className="space-y-3">
            {meal.mealOptionalIngredients &&
            meal.mealOptionalIngredients.length > 0 ? (
              meal.mealOptionalIngredients.map(
                (moi: {
                  id: string;
                  optionalIngredient: {
                    id: string;
                    name: string;
                    description: string | null;
                  };
                }) => {
                  const ingredient = moi.optionalIngredient;
                  const selectedIngredient = selectedOptionalIngredients.find(
                    (si) => si.id === ingredient.id
                  );
                  const isIncluded = selectedIngredient?.isIncluded ?? false;
                  const canExclude =
                    settings?.allowExcludeOptionalIngredients ?? true;

                  return (
                    <div
                      key={ingredient.id}
                      className={`group relative overflow-hidden rounded-lg border-1.5 transition-all duration-300 ${
                        isIncluded
                          ? "border-pink-500 bg-gradient-to-r from-pink-500/10 to-rose-500/10 shadow-md shadow-pink-500/20"
                          : "border-border bg-card hover:border-pink-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex gap-3 p-2.5">
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-foreground">
                              {ingredient.name}
                            </h3>
                            {ingredient.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {ingredient.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Checkbox
                              checked={isIncluded}
                              onCheckedChange={() =>
                                toggleOptionalIngredient(ingredient.id)
                              }
                              disabled={!canExclude}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
              )
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t("mealCustomization.noOptionalIngredients")}</p>
              </div>
            )}
          </div>
            
            {/* Done Button */}
            <div className="mt-6 pt-4 border-t border-[#262626]">
            <Button
              onClick={() => setShowOptionalIngredientsSheet(false)}
              className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white"
            >
              {t("mealCustomization.done")}
            </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add-ons Bottom Sheet */}
      <Sheet open={showAddOnsSheet} onOpenChange={setShowAddOnsSheet}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto bg-[#151718] border-t border-[#262626] text-white p-0 rounded-t-3xl"
        >
          <div className="px-4 pb-6 pt-8">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-xl font-bold text-pink-500">
                  {t("mealCustomization.addExtras")}
                </SheetTitle>
                {selectedAddOns.length > 0 && (
                <SheetDescription className="text-pink-400 mt-1">
                    {selectedAddOns.length} {t("mealCustomization.selected")}
                  </SheetDescription>
                )}
          </SheetHeader>
            <div className="space-y-3">
            {meal.mealAddOns?.length > 0 ? (
              meal.mealAddOns.map((mealAddOn) => {
                if (!mealAddOn.addOn) {
                  console.warn("Missing addOn data for mealAddOn:", mealAddOn);
                  return null;
                }

                const addOn = mealAddOn.addOn;
                const isBoolean = addOn.type === "BOOLEAN";
                const isQuantity = addOn.type === "QUANTITY";

                const isSelected =
                  isBoolean && selectedAddOns.some((a) => a.id === addOn.id);

                const quantityAddon = selectedAddOns.find(
                  (a) => a.id === addOn.id
                );
                const currentQuantity = quantityAddon
                  ? quantityAddon.quantity || 0
                  : 0;
                const hasQuantity = currentQuantity > 0;

                return (
                  <div
                    key={addOn.id}
                    className={`group relative overflow-hidden rounded-lg border-1.5 transition-all duration-300 ${
                      isSelected || hasQuantity
                        ? "border-pink-500 bg-gradient-to-r from-pink-500/10 to-rose-500/10 shadow-md shadow-pink-500/20"
                        : "border-border bg-card hover:border-pink-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex gap-3 p-2.5">
                      {addOn.image && (
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-md overflow-hidden bg-muted">
                            <img
                              src={
                                isExternalImage(addOn.image)
                                  ? addOn.image
                                  : getOptimizedImageUrl(addOn.image)
                              }
                              alt={getAddonName(addOn)}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src =
                                  "/placeholder-addon.png";
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-foreground">
                            {getAddonName(addOn)}
                          </h3>
                          {getAddonDescription(addOn) && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {getAddonDescription(addOn)}
                            </p>
                          )}
                          <span className="text-xs font-bold text-pink-600 dark:text-pink-400 mt-0.5 block">
                            {formatPrice(getAddonPrice(addOn), currency)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isBoolean && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                handleAddOnToggle({
                                  id: addOn.id,
                                  name: addOn.name,
                                  price: addOn.price,
                                  type: addOn.type as "BOOLEAN" | "QUANTITY",
                                  addonSizes: addOn.addonSizes,
                                })
                              }
                            />
                          )}

                          {isQuantity && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  handleQuantityChange(
                                    addOn.id,
                                    Math.max(0, currentQuantity - 1)
                                  )
                                }
                                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-1 hover:scale-110 transition-transform duration-200 shadow-md shadow-pink-500/30 disabled:opacity-50"
                                disabled={currentQuantity <= 0}
                              >
                                <Icon path={mdiMinus} size={0.33} className="text-white" />
                              </button>
                              <span className="min-w-[1.5rem] text-center font-bold text-pink-600 dark:text-pink-400 text-xs">
                                {currentQuantity}
                              </span>
                              <button
                                onClick={() =>
                                  handleQuantityChange(
                                    addOn.id,
                                    currentQuantity + 1
                                  )
                                }
                                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-1 hover:scale-110 transition-transform duration-200 shadow-md shadow-pink-500/30"
                              >
                                <Icon path={mdiPlus} size={0.33} className="text-white" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t("mealCustomization.noAddons")}</p>
              </div>
            )}
          </div>
            
            {/* Done Button */}
            <div className="mt-6 pt-4 border-t border-[#262626]">
            <Button
              onClick={() => setShowAddOnsSheet(false)}
              className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white"
            >
              {t("mealCustomization.done")}
            </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add-ons */}
      {meal.mealAddOns && meal.mealAddOns.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
              <h2 className="font-bold text-lg text-foreground">
                {t("mealCustomization.addExtras")}
              </h2>
            </div>
            {meal.mealAddOns.length > 4 ? (
              <button
                onClick={() => setShowAddOnsSheet(true)}
                className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
              >
                {t("mealCustomization.showMore")} ({meal.mealAddOns.length - 4}{" "}
                {t("mealCustomization.more")})
                <Icon path={mdiChevronRight} size={0.67} />
              </button>
            ) : (
              <button
                onClick={() => setShowAddOnsSheet(true)}
                className="text-sm font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors flex items-center gap-1"
              >
                {t("mealCustomization.showMore")}
                <Icon path={mdiChevronRight} size={0.67} />
              </button>
            )}
          </div>
          <div className="space-y-3">
            {meal.mealAddOns.slice(0, 4).map((mealAddOn) => {
              if (!mealAddOn.addOn) {
                console.warn("Missing addOn data for mealAddOn:", mealAddOn);
                return null;
              }

              const addOn = mealAddOn.addOn;
              const isBoolean = addOn.type === "BOOLEAN";
              const isQuantity = addOn.type === "QUANTITY";

              const isSelected =
                isBoolean && selectedAddOns.some((a) => a.id === addOn.id);

              const quantityAddon = selectedAddOns.find(
                (a) => a.id === addOn.id
              );
              const currentQuantity = quantityAddon
                ? quantityAddon.quantity || 0
                : 0;
              const hasQuantity = currentQuantity > 0;

              return (
                <div
                  key={addOn.id}
                  className={`group relative overflow-hidden rounded-2xl border-1.5 transition-all duration-300 ${
                    isSelected || hasQuantity
                      ? "border-pink-500 bg-gradient-to-r from-pink-500/10 to-rose-500/10 shadow-md shadow-pink-500/20"
                      : "border-border bg-card hover:border-pink-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex gap-3 p-2.5">
                    {addOn.image && (
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-md overflow-hidden bg-muted">
                          <img
                            src={
                              isExternalImage(addOn.image)
                                ? addOn.image
                                : getOptimizedImageUrl(addOn.image)
                            }
                            alt={getAddonName(addOn)}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                "/placeholder-addon.png";
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground">
                          {addOn.name}
                        </h3>
                        {addOn.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {addOn.description}
                          </p>
                        )}
                        <span className="text-xs font-bold text-pink-600 dark:text-pink-400 mt-0.5 block">
                          {formatPrice(getAddonPrice(addOn), currency)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isBoolean && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              handleAddOnToggle({
                                id: addOn.id,
                                name: addOn.name,
                                price: addOn.price,
                                effectiveBasePrice: addOn.effectiveBasePrice,
                                type: addOn.type as "BOOLEAN" | "QUANTITY",
                                addonSizes: addOn.addonSizes,
                              })
                            }
                          />
                        )}

                        {isQuantity && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                handleQuantityChange(
                                  addOn.id,
                                  Math.max(0, currentQuantity - 1)
                                )
                              }
                              className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-1 hover:scale-110 transition-transform duration-200 shadow-md shadow-pink-500/30 disabled:opacity-50"
                              disabled={currentQuantity <= 0}
                            >
                              <Icon path={mdiMinus} size={0.33} className="text-white" />
                            </button>
                            <span className="min-w-[1.5rem] text-center font-bold text-pink-600 dark:text-pink-400 text-xs">
                              {currentQuantity}
                            </span>
                            <button
                              onClick={() =>
                                handleQuantityChange(
                                  addOn.id,
                                  currentQuantity + 1
                                )
                              }
                              className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-1 hover:scale-110 transition-transform duration-200 shadow-md shadow-pink-500/30"
                            >
                              <Icon path={mdiPlus} size={0.33} className="text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Special Instructions */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
          <h2 className="font-bold text-lg text-foreground">
            {t("mealCustomization.specialInstructions")}
          </h2>
        </div>
        <div className="relative">
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder={t("mealCustomization.specialInstructionsPlaceholder")}
            className="w-full p-4 rounded-xl border-2 border-border focus:border-pink-500 focus:outline-none resize-none transition-all duration-200 bg-card text-foreground placeholder:text-muted-foreground"
            rows={3}
          />
          <div className="absolute top-2 right-2">
            <div className="h-2 w-2 bg-pink-500 rounded-full opacity-50"></div>
          </div>
        </div>
      </div>

      {/* Quantity */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-1 w-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></div>
          <h2 className="font-bold text-lg text-foreground">
            {t("mealCustomization.quantity")}
          </h2>
        </div>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-3 hover:scale-110 transition-transform duration-200 shadow-lg shadow-pink-500/30"
          >
            <Icon path={mdiMinus} size={0.83} className="text-white" />
          </button>
          <div className="bg-gradient-to-r from-pink-500/10 to-rose-500/10 rounded-xl px-6 py-3 border-2 border-pink-500/20">
            <span className="text-2xl font-bold text-pink-600 dark:text-pink-400">
              {quantity}
            </span>
          </div>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-3 hover:scale-110 transition-transform duration-200 shadow-lg shadow-pink-500/30"
          >
            <Icon path={mdiPlus} size={0.83} className="text-white" />
          </button>
        </div>
      </div>

      {/* Add to Cart */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background via-background to-background/95 backdrop-blur-sm border-t border-border">
        <div className="max-w-screen-sm mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground font-medium">
                {t("mealCustomization.total")}
              </div>
              <div className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
                {formatPrice(totalPrice * quantity, currency)}
              </div>
            </div>
            {/* Availability Warning - compact inline */}
            {availabilityMessage && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                <Icon path={mdiAlert} size={0.67} className="text-amber-500" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {availabilityMessage}
                </span>
              </div>
            )}
          </div>
          <Button
            onClick={handleAddToCart}
            disabled={isAddingToCart || !canAddToCart || loadingAvailability || !isAvailableByBranchTiming}
            className={`w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-2xl shadow-rose-500/40 py-4 text-lg font-bold rounded-xl transition-all duration-300 ${
              isAddingToCart || !canAddToCart || loadingAvailability || !isAvailableByBranchTiming
                ? "opacity-75 scale-95 cursor-not-allowed"
                : "hover:scale-[1.02] hover:shadow-rose-500/60 active:scale-95"
            }`}
          >
            {loadingAvailability ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t("mealCustomization.checkingAvailability")}
              </div>
            ) : isAddingToCart ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t("mealCustomization.adding")}
              </div>
            ) : !isAvailableByBranchTiming ? (
              t("mealCustomization.notAvailableNow")
            ) : !canAddToCart ? (
              t("mealCustomization.unavailable")
            ) : isEditMode ? (
              t("mealCustomization.updateItem")
            ) : (
              t("mealCustomization.addToCart")
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
