export interface Settings {
  taxPercentage: number;
  deliveryTaxPercentage?: number;
  taxInclusive?: boolean;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  deliveryFee?: number;
  deliveryRadius?: number;
  deliveryRatePerKilometer?: number;
  useDynamicDeliveryFee?: boolean;
  useTieredDeliveryFee?: boolean;
  initialDeliveryRange?: number;
  initialDeliveryPrice?: number;
  extendedDeliveryThreshold?: number;
  extendedDeliveryRate?: number;
  latitude?: number | string;
  longitude?: number | string;
  country?: string;
  state?: string;
  city?: string;
  businessAddress?: string;
  currency?: string;
  enableFreeDelivery?: boolean;
  freeDeliveryThreshold?: number;
  enableMinimumOrder?: boolean;
  minimumOrderAmount?: number;
  // Delivery payment settings
  acceptCash?: boolean;
  acceptCard?: boolean;
  acceptOnlinePayment?: boolean;
  acceptPayPal?: boolean;
  // Pickup payment settings
  pickupAcceptCash?: boolean;
  pickupAcceptCard?: boolean;
  pickupAcceptOnlinePayment?: boolean;
  pickupAcceptPayPal?: boolean;
  // Order merge settings
  orderMergeTimeframeMinutes?: number;
  
  // Future Order Settings
  futureOrdersEnabled?: boolean;
  enableFuturePickupOrders?: boolean;
  futurePickupOrderDays?: number;
  enableFutureDeliveryOrders?: boolean;
  futureDeliveryOrderDays?: number;
  
  // Scheduled Order Time Slot Settings
  scheduledOrderTimeSlotInterval?: number;

  // Scheduled Order Merge Settings
  allowScheduledOrderMerge?: boolean;
  scheduledOrderMergeCutoffHours?: number;
}

export interface Meal {
  id: string;
  taxPercentage?: number | null;
  effectiveTaxPercentage?: number | null; // Branch-specific tax override
  category?: {
    taxPercentage?: number | null;
  };
  mealSizes?: {
    id: string;
    name: string;
    taxPercentage?: number | null;
    price: string;
    sizeType?: "S" | "M" | "L" | "XL" | string;
  }[];
}

export interface Addon {
  id: string;
  name?: string;
  taxPercentage?: number | null;
  effectiveTaxPercentage?: number | null; // Branch-specific tax override
  price: string;
  type?: "BOOLEAN" | "QUANTITY" | string;
  sizeType?: "S" | "M" | "L" | "XL" | string;
}

export interface CartItem {
  id: string;
  itemType?: "MEAL" | "DEAL";
  mealId?: string;
  dealId?: string;
  size?: string;
  sizeId?: string;
  basePrice: number;
  sizePrice?: number;
  quantity: number;
  dealComponents?: {
    id?: string;
    name?: string;
    price: number;
    taxPercentage: number;
    quantity: number;
  }[];
  addOns?: {
    id: string;
    name?: string;
    quantity?: number;
    price?: number; // Price from cart item (should already include branch-specific price)
  }[];
}

export interface TaxBreakdown {
  itemTaxAmount: number;
  addonTaxAmount: number;
  deliveryTaxAmount: number;
  totalTaxAmount: number;
  dealComponentBreakdown?: {
    dealId: string;
    componentId?: string;
    name: string;
    taxPercentage: number;
    unitPrice: number;
    componentQuantity: number;
    dealQuantity: number;
    taxAmount: number;
  }[];
  itemBreakdown: {
    mealId: string;
    size: string;
    taxPercentage: number;
    basePrice: number;
    quantity: number;
    taxAmount: number;
  }[];
  addonBreakdown: {
    addonId: string;
    name: string;
    taxPercentage: number;
    price: number;
    quantity: number;
    itemQuantity: number;
    taxAmount: number;
  }[];
}

/**
 * Calculate tax for an order based on the cart items
 * Returns the breakdown of tax amounts for items, addons, and delivery
 */
export function calculateTax(
  cartItems: CartItem[],
  meals: Meal[],
  addons: Addon[],
  settings: Settings,
  deliveryFee: number
): TaxBreakdown {
  const taxInclusive = settings.taxInclusive || false;
  const defaultTaxPercentage = Number(settings.taxPercentage) || 0;
  const deliveryTaxPercentage = Number(settings.deliveryTaxPercentage) || 0;

  const itemBreakdown: TaxBreakdown["itemBreakdown"] = [];
  const addonBreakdown: TaxBreakdown["addonBreakdown"] = [];
  const dealComponentBreakdown: NonNullable<TaxBreakdown["dealComponentBreakdown"]> = [];
  let itemTaxAmount = 0;
  let addonTaxAmount = 0;

  // Calculate tax for each cart item
  for (const item of cartItems) {
    const isDeal = item.itemType === "DEAL" || !!item.dealId || Array.isArray(item.dealComponents);

    if (isDeal) {
      const taxInclusiveDeal = settings.taxInclusive || false;
      const components = Array.isArray(item.dealComponents) ? item.dealComponents : [];
      const baseUnitPrice = Number(item.basePrice || 0);
      const qty = Number(item.quantity || 1);
      const dealId = String(item.dealId || item.mealId || item.id);

      const componentsTaxPerDealUnit = components.reduce((sum, c) => {
        const unit = Number(c.price || 0);
        const compQty = Number(c.quantity || 1);
        const taxPct = Number(c.taxPercentage || 0);
        const linePrice = unit * compQty;
        const taxAmount = taxInclusiveDeal
          ? (linePrice * taxPct) / (100 + taxPct)
          : (linePrice * taxPct) / 100;
        return sum + (Number.isFinite(taxAmount) ? taxAmount : 0);
      }, 0);

      for (const c of components) {
        const unit = Number(c.price || 0);
        const compQty = Number(c.quantity || 1);
        const taxPct = Number(c.taxPercentage || 0);
        const linePrice = unit * compQty;
        const perDealUnitTax = taxInclusiveDeal
          ? (linePrice * taxPct) / (100 + taxPct)
          : (linePrice * taxPct) / 100;
        const taxAmount = (Number.isFinite(perDealUnitTax) ? perDealUnitTax : 0) * qty;
        dealComponentBreakdown.push({
          dealId,
          componentId: c.id,
          name: String(c.name || c.id || "Component"),
          taxPercentage: Number.isFinite(taxPct) ? taxPct : 0,
          unitPrice: Number.isFinite(unit) ? unit : 0,
          componentQuantity: Number.isFinite(compQty) ? compQty : 1,
          dealQuantity: qty,
          taxAmount,
        });
      }

      const itemTaxForLine = componentsTaxPerDealUnit * qty;
      itemTaxAmount += itemTaxForLine;
      itemBreakdown.push({
        mealId: dealId,
        size: item.size || "DEAL",
        taxPercentage: 0,
        basePrice: baseUnitPrice,
        quantity: qty,
        taxAmount: itemTaxForLine,
      });

      if (item.addOns && item.addOns.length > 0) {
        for (const addOn of item.addOns) {
          const addonData = addons.find((a) => a.id === addOn.id);
          if (!addonData) continue;

          let addonTaxPercentage = defaultTaxPercentage;
          if (
            addonData.effectiveTaxPercentage !== null &&
            addonData.effectiveTaxPercentage !== undefined
          ) {
            addonTaxPercentage = Number(addonData.effectiveTaxPercentage);
          } else if (
            addonData.taxPercentage !== null &&
            addonData.taxPercentage !== undefined
          ) {
            addonTaxPercentage = Number(addonData.taxPercentage);
          }

          const addonQuantity = addOn.quantity || 1;
          const addonPrice = addOn.price || Number(addonData.price) || 0;
          let addonTax = 0;
          if (taxInclusiveDeal) {
            addonTax = (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage);
          } else {
            addonTax = (addonPrice * addonTaxPercentage) / 100;
          }
          const totalAddonTax = addonTax * addonQuantity * qty;
          addonTaxAmount += totalAddonTax;

          const addonName = addOn.name || addonData.id || addOn.id;
          addonBreakdown.push({
            addonId: addOn.id,
            name: addonName,
            taxPercentage: addonTaxPercentage,
            price: addonPrice,
            quantity: addonQuantity,
            itemQuantity: qty,
            taxAmount: totalAddonTax,
          });
        }
      }

      continue;
    }

    // Find the meal data
    const mealId = item.mealId;
    if (!mealId) continue;
    const mealData = meals.find((m) => m.id === mealId);
    if (!mealData) continue;

    // Find the size if specified
    type MealSize = NonNullable<Meal["mealSizes"]>[number];
    let mealSize: MealSize | undefined;
    if (item.sizeId || item.size) {
      mealSize = mealData.mealSizes?.find(
        (s) => s.id === item.sizeId || s.name === item.size
      );
    }

    // Determine tax percentage based on priority
    // Priority: Branch Override (effectiveTaxPercentage) > MealSize > Meal > Category > Settings
    let taxPercentage = defaultTaxPercentage;
    if (
      (mealData as any).effectiveTaxPercentage !== null &&
      (mealData as any).effectiveTaxPercentage !== undefined
    ) {
      taxPercentage = Number((mealData as any).effectiveTaxPercentage);
    } else if (
      mealSize?.taxPercentage !== null &&
      mealSize?.taxPercentage !== undefined
    ) {
      taxPercentage = Number(mealSize.taxPercentage);
    } else if (
      mealData.taxPercentage !== null &&
      mealData.taxPercentage !== undefined
    ) {
      taxPercentage = Number(mealData.taxPercentage);
    } else if (
      mealData.category?.taxPercentage !== null &&
      mealData.category?.taxPercentage !== undefined
    ) {
      taxPercentage = Number(mealData.category.taxPercentage);
    }

    // Calculate tax for this item
    const basePrice = item.basePrice + (item.sizePrice || 0);
    const mealPriceTotal = basePrice * item.quantity;

    let taxAmount = 0;
    if (taxInclusive) {
      // Tax is included in the price - extract tax amount
      taxAmount = (mealPriceTotal * taxPercentage) / (100 + taxPercentage);
    } else {
      // Tax is added on top of the price
      taxAmount = (mealPriceTotal * taxPercentage) / 100;
    }

    itemTaxAmount += taxAmount;
    itemBreakdown.push({
      mealId: mealId,
      size: item.size || mealSize?.name || "Regular",
      taxPercentage,
      basePrice,
      quantity: item.quantity,
      taxAmount: taxAmount,
    });

    // Calculate tax for addons
    if (item.addOns && item.addOns.length > 0) {
      for (const addOn of item.addOns) {
        const addonData = addons.find((a) => a.id === addOn.id);
        if (!addonData) continue;

        // Determine addon tax percentage
        // Priority: effectiveTaxPercentage (branch-specific) > taxPercentage (addon-specific) > defaultTaxPercentage
        let addonTaxPercentage = defaultTaxPercentage;
        if (
          addonData.effectiveTaxPercentage !== null &&
          addonData.effectiveTaxPercentage !== undefined
        ) {
          addonTaxPercentage = Number(addonData.effectiveTaxPercentage);
        } else if (
          addonData.taxPercentage !== null &&
          addonData.taxPercentage !== undefined
        ) {
          addonTaxPercentage = Number(addonData.taxPercentage);
        }

        // Calculate tax for this addon
        // Use the price from cart item (already correct for size and branch), fallback to addonData.price
        const addonQuantity = addOn.quantity || 1;
        const addonPrice = addOn.price || Number(addonData.price) || 0;

        let addonTax = 0;
        if (taxInclusive) {
          addonTax =
            (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage);
        } else {
          addonTax = (addonPrice * addonTaxPercentage) / 100;
        }

        // Total addon tax = tax per addon × addon quantity × item quantity
        const totalAddonTax = addonTax * addonQuantity * item.quantity;
        addonTaxAmount += totalAddonTax;

        // Store breakdown per addon per order item
        // Get addon name from cart item if available, otherwise from addon data
        const addonName = addOn.name || addonData.id || addOn.id;
        addonBreakdown.push({
          addonId: addOn.id,
          name: addonName,
          taxPercentage: addonTaxPercentage,
          price: addonPrice,
          quantity: addonQuantity,
          itemQuantity: item.quantity,
          taxAmount: totalAddonTax,
        });
      }
    }
  }

  // Calculate delivery tax
  let deliveryTaxAmount = 0;
  if (deliveryFee > 0 && deliveryTaxPercentage > 0) {
    deliveryTaxAmount = taxInclusive
      ? (deliveryFee * deliveryTaxPercentage) / (100 + deliveryTaxPercentage)
      : (deliveryFee * deliveryTaxPercentage) / 100;
  }

  const totalTaxAmount = itemTaxAmount + addonTaxAmount + deliveryTaxAmount;

  return {
    itemTaxAmount,
    addonTaxAmount,
    deliveryTaxAmount,
    totalTaxAmount,
    dealComponentBreakdown,
    itemBreakdown,
    addonBreakdown,
  };
}
