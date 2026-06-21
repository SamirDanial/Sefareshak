import type { Settings } from "@/services/settingsService";
import type { Meal, MealSize } from "@/services/mealService";
import type { Addon } from "@/services/addonService";
import type { CartItem } from "@/store/cartStore";

interface TaxBreakdown {
  itemTaxAmount: number;
  addonTaxAmount: number;
  deliveryTaxAmount: number;
  totalTaxAmount: number;
  itemBreakdown: {
    mealId: string;
    size: string;
    taxPercentage: number;
    basePrice: number;
    quantity: number;
    taxAmount: number;
  }[];
  dealComponentBreakdown?: {
    dealId: string;
    dealComponentId: string;
    name: string;
    taxPercentage: number;
    unitPrice: number;
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

type DealComponentTaxSource = {
  id: string;
  name?: string | null;
  price?: number | string | null;
  taxPercentage?: number | string | null;
  quantity?: number | null;
  effectivePrice?: number | string | null;
  effectiveTaxPercentage?: number | string | null;
};

type DealTaxSource = {
  id: string;
  components?: DealComponentTaxSource[];
};

interface MealWithDetails extends Meal {
  category: {
    id: string;
    name: string;
    taxPercentage?: number | null;
  };
}

/**
 * Calculate tax for an order based on the cart items
 * Returns the breakdown of tax amounts for items, addons, and delivery
 */
export function calculateTax(
  cartItems: CartItem[],
  meals: MealWithDetails[],
  addons: Addon[],
  settings: Settings,
  deliveryFee: number,
  deals?: DealTaxSource[]
): TaxBreakdown {
  const taxInclusive = settings.taxInclusive || false;
  // Ensure tax percentages are in the correct format (0-100, not decimal)
  const defaultTaxPercentage = Number(settings.taxPercentage) || 0;
  const deliveryTaxPercentage = Number(settings.deliveryTaxPercentage) || 0;

  const itemBreakdown: TaxBreakdown["itemBreakdown"] = [];
  const dealComponentBreakdown: NonNullable<TaxBreakdown["dealComponentBreakdown"]> = [];
  const addonBreakdown: TaxBreakdown["addonBreakdown"] = [];
  let itemTaxAmount = 0;
  let addonTaxAmount = 0;

  const resolveAddonTaxPercentage = (addonData: Addon, cartAddOn: CartItem["addOns"][number]) => {
    const sizeType = (cartAddOn as any)?.sizeType as string | undefined;
    if (sizeType && Array.isArray((addonData as any)?.addonSizes)) {
      const match = (addonData as any).addonSizes.find((s: any) => String(s?.sizeType) === String(sizeType));
      if (match?.taxPercentage !== null && match?.taxPercentage !== undefined) {
        return Number(match.taxPercentage);
      }
    }

    if (addonData.taxPercentage !== null && addonData.taxPercentage !== undefined) {
      const addonSpecific = Number(addonData.taxPercentage);
      if (addonData.effectiveTaxPercentage !== null && addonData.effectiveTaxPercentage !== undefined) {
        const effective = Number(addonData.effectiveTaxPercentage);
        if (effective !== defaultTaxPercentage) return effective;
      }
      return addonSpecific;
    }

    if (addonData.effectiveTaxPercentage !== null && addonData.effectiveTaxPercentage !== undefined) {
      return Number(addonData.effectiveTaxPercentage);
    }
    return defaultTaxPercentage;
  };

  // Calculate tax for each cart item
  for (const item of cartItems) {
    const itemType = (item as any).itemType || "MEAL";

    if (itemType === "DEAL") {
      const dealId = String((item as any).dealId || "");
      const basePrice = item.basePrice;

      const deal = Array.isArray(deals) && dealId
        ? deals.find((d) => String(d.id) === dealId)
        : undefined;

      // If we have deal details, compute tax per component (each component can have a different tax rate).
      // Otherwise, fallback to previous behavior (deal taxed with defaultTaxPercentage).
      let dealTaxAmount = 0;

      if (deal && Array.isArray(deal.components) && deal.components.length > 0) {
        for (const c of deal.components) {
          const unitPriceRaw =
            c.effectivePrice !== null && c.effectivePrice !== undefined
              ? c.effectivePrice
              : c.price;
          const unitPrice = Number(unitPriceRaw || 0);

          const taxPctRaw =
            c.effectiveTaxPercentage !== null && c.effectiveTaxPercentage !== undefined
              ? c.effectiveTaxPercentage
              : c.taxPercentage;
          const taxPercentage =
            taxPctRaw !== null && taxPctRaw !== undefined
              ? Number(taxPctRaw)
              : defaultTaxPercentage;

          const componentQty =
            c.quantity !== null && c.quantity !== undefined
              ? Number(c.quantity)
              : 1;
          const lineQty = componentQty * (item.quantity || 1);
          const lineTotal = unitPrice * lineQty;

          let taxAmount = 0;
          if (taxInclusive) {
            taxAmount = (lineTotal * taxPercentage) / (100 + taxPercentage);
          } else {
            taxAmount = (lineTotal * taxPercentage) / 100;
          }

          dealTaxAmount += taxAmount;
          dealComponentBreakdown.push({
            dealId,
            dealComponentId: String(c.id),
            name: String(c.name || ""),
            taxPercentage,
            unitPrice,
            quantity: lineQty,
            taxAmount,
          });
        }
      } else {
        // Fallback: treat entire deal as one taxable line using defaultTaxPercentage
        const taxPercentage = defaultTaxPercentage;
        const dealPriceTotal = basePrice * item.quantity;

        if (taxInclusive) {
          dealTaxAmount = (dealPriceTotal * taxPercentage) / (100 + taxPercentage);
        } else {
          dealTaxAmount = (dealPriceTotal * taxPercentage) / 100;
        }
      }

      itemTaxAmount += dealTaxAmount;
      itemBreakdown.push({
        mealId: dealId || item.mealId || item.id,
        size: item.size || "",
        taxPercentage: defaultTaxPercentage,
        basePrice,
        quantity: item.quantity,
        taxAmount: dealTaxAmount,
      });

      // Addon tax calculation (same as meal items)
      if (item.addOns && item.addOns.length > 0) {
        for (const addOn of item.addOns) {
          const addonData = addons.find((a) => a.id === addOn.id);
          if (!addonData) continue;

          const addonTaxPercentage = resolveAddonTaxPercentage(addonData, addOn);

          const addonQuantity = addOn.quantity || 1;
          const addonPrice = addOn.price || Number(addonData.price) || 0;

          let addonTax = 0;
          if (taxInclusive) {
            addonTax =
              (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage);
          } else {
            addonTax = (addonPrice * addonTaxPercentage) / 100;
          }

          const totalAddonTax = addonTax * addonQuantity * item.quantity;
          addonTaxAmount += totalAddonTax;

          addonBreakdown.push({
            addonId: addOn.id,
            name: addOn.name,
            taxPercentage: addonTaxPercentage,
            price: addonPrice,
            quantity: addonQuantity,
            itemQuantity: item.quantity,
            taxAmount: totalAddonTax,
          });
        }
      }

      continue;
    }

    // Find the meal data
    const mealData = meals.find((m) => m.id === item.mealId);
    if (!mealData) continue;

    // Find the size if specified
    let mealSize: MealSize | undefined;
    if (item.size) {
      mealSize = mealData.mealSizes.find((s) => s.name === item.size);
    }

    // Determine tax percentage based on priority
    // Priority: MealSize > Branch Override (effectiveTaxPercentage) > Meal > Category > Settings
    let taxPercentage = defaultTaxPercentage;
    
    // First check meal size (highest priority)
    if (
      mealSize?.taxPercentage !== null &&
      mealSize?.taxPercentage !== undefined
    ) {
      taxPercentage = Number(mealSize.taxPercentage);
    } else {
      // If no meal size tax, check branch-specific tax override
      if (
        (mealData as any).effectiveTaxPercentage !== null &&
        (mealData as any).effectiveTaxPercentage !== undefined
      ) {
        taxPercentage = Number((mealData as any).effectiveTaxPercentage);
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
    }

    // Calculate tax for this item
    const basePrice = item.basePrice;
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
      mealId: item.mealId || "",
      size: item.size || "",
      taxPercentage,
      basePrice,
      quantity: item.quantity,
      taxAmount: taxAmount, // Keep original precision for display
    });

    // Calculate tax for addons
    if (item.addOns && item.addOns.length > 0) {
      for (const addOn of item.addOns) {
        const addonData = addons.find((a) => a.id === addOn.id);
        if (!addonData) continue;

        const addonTaxPercentage = resolveAddonTaxPercentage(addonData, addOn);

        // Calculate tax for this addon
        // Use the price from cart item (already correct for size), fallback to addonData.price
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
        // Note: This stores tax for this specific addon attached to this specific meal item
        addonBreakdown.push({
          addonId: addOn.id,
          name: addOn.name,
          taxPercentage: addonTaxPercentage,
          price: addonPrice,
          quantity: addonQuantity,
          itemQuantity: item.quantity,
          taxAmount: totalAddonTax, // Total tax for this addon across all quantities
        });
      }
    }
  }

  // Calculate delivery tax
  let deliveryTaxAmount = 0;
  if (deliveryFee > 0) {
    if (taxInclusive) {
      deliveryTaxAmount =
        (deliveryFee * deliveryTaxPercentage) / (100 + deliveryTaxPercentage);
    } else {
      deliveryTaxAmount = (deliveryFee * deliveryTaxPercentage) / 100;
    }
  }

  const totalTaxAmount = itemTaxAmount + addonTaxAmount + deliveryTaxAmount;

  // Round only the totals, keep breakdown items with full precision
  return {
    itemTaxAmount: Math.round(itemTaxAmount * 100) / 100,
    addonTaxAmount: Math.round(addonTaxAmount * 100) / 100,
    deliveryTaxAmount: Math.round(deliveryTaxAmount * 100) / 100,
    totalTaxAmount: Math.round(totalTaxAmount * 100) / 100,
    itemBreakdown,
    dealComponentBreakdown,
    addonBreakdown,
  };
}
