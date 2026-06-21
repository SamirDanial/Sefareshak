import DatabaseSingleton from "../config/database";
import { getMealBasePrice } from "./mealPriceHelper";
import { getAddonBasePrice } from "./addonPriceHelper";
import { TaxCalculator } from "./taxCalculator";
import { getAddonPriceForMealSize } from "./sizeMatcher";

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  // Prisma Decimal (decimal.js) supports toString(); Number(value) can be unreliable.
  if (typeof value === "object" && typeof value.toString === "function") {
    const n = Number(value.toString());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface CartItem {
  mealId?: string;
  dealId?: string;
  itemType?: string;
  quantity: number;
  size?: string;
  addOns?: Array<{
    id: string;
    quantity?: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface OrderCalculationResult {
  subtotal: number;
  itemTaxAmount: number;
  addonTaxAmount: number;
  deliveryTaxAmount: number;
  takeawayServiceTaxAmount: number;
  takeawayServiceTaxPercentage: number;
  totalTaxAmount: number;
  deliveryFee: number;
  takeawayServiceFee: number;
  finalTotal: number;
  itemBreakdown: Array<{
    mealId: string;
    itemType?: "MEAL" | "DEAL";
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxAmount: number;
    taxPercentage: number;
  }>;
  addonBreakdown: Array<{
    addonId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxAmount: number;
    taxPercentage: number;
  }>;
}

/**
 * Calculate complete order totals from scratch using branch-specific prices and taxes.
 * This function recalculates everything and does not trust frontend data.
 * 
 * @param cartItems - Array of cart items (mealId, quantity, size, addOns)
 * @param branchId - Branch ID for branch-specific prices and taxes
 * @param deliveryFee - Delivery fee amount
 * @param orderType - "DELIVERY" or "PICKUP"
 * @returns Complete order calculation breakdown
 */
export async function calculateOrderTotals(
  cartItems: CartItem[],
  branchId: string | null | undefined,
  deliveryFee: number = 0,
  orderType: "DELIVERY" | "PICKUP" = "DELIVERY"
): Promise<OrderCalculationResult> {
  const db = DatabaseSingleton.getInstance();
  const prisma = db.getPrisma();

  // Get settings for tax-inclusive flag (but allow branch override)
  const settings = await prisma.settings.findFirst();
  const branch = branchId
    ? await prisma.branch.findUnique({
        where: { id: branchId },
        select: ({
          taxInclusive: true,
          deliveryTaxPercentage: true,
          serviceTaxPercentage: true,
          pickupTakeawayServiceFee: true,
        } as any),
      })
    : null;
  const taxInclusive =
    branch?.taxInclusive !== null && branch?.taxInclusive !== undefined
      ? Boolean(branch.taxInclusive)
      : Boolean(settings?.taxInclusive || false);

  const effectiveDeliveryTaxPercentage =
    branch?.deliveryTaxPercentage !== null &&
    branch?.deliveryTaxPercentage !== undefined
      ? toNumber(branch.deliveryTaxPercentage)
      : toNumber(settings?.deliveryTaxPercentage);

  const effectiveTakeawayServiceTaxPercentage =
    branch?.serviceTaxPercentage !== null &&
    branch?.serviceTaxPercentage !== undefined
      ? toNumber(branch.serviceTaxPercentage)
      : toNumber((settings as any)?.serviceTaxPercentage);

  const takeawayServiceFee =
    orderType === "PICKUP"
      ? (branch?.pickupTakeawayServiceFee !== null &&
        branch?.pickupTakeawayServiceFee !== undefined
          ? toNumber(branch.pickupTakeawayServiceFee)
          : toNumber((settings as any)?.pickupTakeawayServiceFee))
      : 0;

  // Initialize tax calculator
  const taxCalculator = new TaxCalculator();

  // Step 1: Recalculate all prices from scratch using branch-specific prices
  const recalculatedCartItems = await Promise.all(
    cartItems.map(async (item) => {
      const isVoucher = item.itemType === "VOUCHER" || String(item.mealId || "").startsWith("VOUCHER_") || String(item.id || "").startsWith("VOUCHER_");
      if (isVoucher) {
        return {
          itemType: "VOUCHER" as const,
          id: item.id,
          mealId: item.mealId || item.id,
          name: item.name || "Gutschein",
          quantity: item.quantity,
          basePrice: item.price || 0,
          vatRate: (item as any).vatRate || null,
          addOns: [],
        };
      }

      const isDeal = Boolean((item as any)?.dealId || (item as any)?.itemType === "DEAL");
      if (isDeal) {
        const dealId = String((item as any).dealId);
        const prismaAny = prisma as any;

        const deal = await prismaAny.deal.findUnique({
          where: { id: dealId },
          include: {
            components: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include:
                branchId
                  ? {
                      branchPrices: {
                        where: { branchId: branchId as string },
                        select: {
                          id: true,
                          branchId: true,
                          price: true,
                          taxPercentage: true,
                        },
                      },
                    }
                  : undefined,
            },
          },
        });

        const components = Array.isArray(deal?.components) ? deal.components : [];
        const baseUnitPrice = components.reduce((sum: number, c: any) => {
          const override = Array.isArray(c.branchPrices) && c.branchPrices.length > 0 ? c.branchPrices[0] : null;
          const unitPrice = override ? Number(override.price) : Number(c.price);
          const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
          const qty = Number.isFinite(q) && q > 0 ? q : 1;
          return sum + unitPrice * qty;
        }, 0);

        const recalculatedAddOns = await Promise.all(
          (item.addOns || []).map(async (addOn) => {
            const branchBasePrice = await getAddonBasePrice(addOn.id, branchId);
            return {
              id: addOn.id,
              price: branchBasePrice,
              quantity: addOn.quantity || 1,
            };
          })
        );

        return {
          itemType: "DEAL" as const,
          dealId,
          quantity: item.quantity,
          basePrice: baseUnitPrice,
          addOns: recalculatedAddOns,
        };
      }

      const mealId = String(item.mealId);
      // Get branch-specific meal base price
      const mealBasePrice = await getMealBasePrice(mealId, branchId);

      // Get meal with sizes to calculate final price
      const meal = await prisma.meal.findUnique({
        where: { id: mealId },
        include: { mealSizes: true },
      });

      // Calculate final meal price (base + size price if applicable)
      let finalMealPrice = mealBasePrice;
      if (item.size && meal) {
        const mealSize = meal.mealSizes.find((s) => s.name === item.size);
        if (mealSize) {
          // Size price is additional to base price
          finalMealPrice = mealBasePrice + Number(mealSize.price || 0);
        }
      }

      // Recalculate addon prices using branch-specific prices and size-based pricing
      const recalculatedAddOns = await Promise.all(
        (item.addOns || []).map(async (addOn) => {
          // Get branch-specific base price
          const branchBasePrice = await getAddonBasePrice(addOn.id, branchId);
          
          // Get addon with sizes to check for size-based pricing
          const addonData = await prisma.addOn.findUnique({
            where: { id: addOn.id },
            include: {
              addonSizes: true,
            },
          });

          let finalAddonPrice = branchBasePrice;

          // If addon has size-based pricing, calculate adjusted price
          if (addonData && addonData.addonSizes && addonData.addonSizes.length > 0) {
            // Get meal size type from meal
            let mealSizeType: "S" | "M" | "L" | "XL" | null = null;
            if (item.size && meal) {
              const mealSize = meal.mealSizes.find((s) => s.name === item.size);
              if (mealSize) {
                mealSizeType = mealSize.sizeType as "S" | "M" | "L" | "XL";
              }
            }
            // Default to M if no size
            mealSizeType = mealSizeType || "M";

              // Get original size price for this meal size
              const originalSizePrice = getAddonPriceForMealSize(
                mealSizeType,
                addonData.addonSizes.map((s) => ({
                  sizeType: s.sizeType as "S" | "M" | "L" | "XL",
                  price: Number(s.price),
                }))
              );

            if (originalSizePrice !== null) {
              // Get original base price (from addon, not branch-specific)
              const originalBasePrice = addonData.price ? Number(addonData.price) : 0;
              
              // Calculate adjusted price: branchBasePrice + (originalSizePrice - originalBasePrice)
              // This preserves the size differential while applying the branch-specific base
              const sizePriceAdjustment = originalSizePrice - originalBasePrice;
              finalAddonPrice = branchBasePrice + sizePriceAdjustment;
            }
          }

          return {
            id: addOn.id,
            price: finalAddonPrice,
            quantity: addOn.quantity || 1,
          };
        })
      );

      return {
        itemType: "MEAL" as const,
        mealId,
        quantity: item.quantity,
        size: item.size,
        basePrice: finalMealPrice, // This is the recalculated price
        addOns: recalculatedAddOns,
      };
    })
  );

  // Step 2: Calculate subtotal using recalculated prices
  const subtotal = recalculatedCartItems.reduce((sum, item) => {
    const itemPrice = item.basePrice * item.quantity;
    const addonsPrice = (item.addOns || []).reduce((addonSum, addOn) => {
      return addonSum + addOn.price * addOn.quantity * item.quantity;
    }, 0);
    return sum + itemPrice + addonsPrice;
  }, 0);

  // Step 3: Calculate taxes manually using recalculated prices
  // We can't use TaxCalculator.calculateTax because it uses addonData.price instead of branch prices
  const effectiveDeliveryFee = orderType === "PICKUP" ? 0 : deliveryFee;
  
  let itemTaxAmount = 0;
  let addonTaxAmount = 0;
  let deliveryTaxAmount = 0;
  let takeawayServiceTaxAmount = 0;

  // Calculate item taxes
  for (const item of recalculatedCartItems) {
    const isDeal = (item as any).itemType === "DEAL";
    if (isDeal) {
      const prismaAny = prisma as any;
      const deal = await prismaAny.deal.findUnique({
        where: { id: (item as any).dealId },
        include: {
          components: {
            include:
              branchId
                ? {
                    branchPrices: {
                      where: { branchId: branchId as string },
                      select: { price: true, taxPercentage: true },
                    },
                  }
                : undefined,
          },
        },
      });

      const components = Array.isArray(deal?.components) ? deal.components : [];
      for (const c of components) {
        const override = Array.isArray(c.branchPrices) && c.branchPrices.length > 0 ? c.branchPrices[0] : null;
        const unitPrice = override ? Number(override.price) : Number(c.price);
        const taxPct =
          override && override.taxPercentage !== null && override.taxPercentage !== undefined
            ? Number(override.taxPercentage)
            : Number(c.taxPercentage);
        const compQty = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
        const compQtySafe = Number.isFinite(compQty) && compQty > 0 ? compQty : 1;
        const dealQty = Number(item.quantity || 1);
        const lineQty = dealQty * compQtySafe;

        const taxPerUnit = taxInclusive
          ? (unitPrice * taxPct) / (100 + taxPct)
          : (unitPrice * taxPct) / 100;
        itemTaxAmount += taxPerUnit * lineQty;
      }
      continue;
    }

    const isVoucherItem = (item as any).itemType === "VOUCHER";
    if (isVoucherItem) {
      // Parse specialInstructions to determine voucher type
      const specialInstructions = String((item as any).specialInstructions || "");
      const isSinglePurpose = specialInstructions.includes("TYPE: SINGLE_PURPOSE");
      
      // Single-purpose vouchers have tax already paid at issuance, so no tax at redemption
      const taxPercentage = isSinglePurpose ? 0 : Number((item as any).vatRate || 0);
      let itemTax = 0;
      if (taxPercentage > 0 && !isSinglePurpose) {
        if (taxInclusive) {
          itemTax = ((item as any).basePrice * taxPercentage) / (100 + taxPercentage);
        } else {
          itemTax = ((item as any).basePrice * taxPercentage) / 100;
        }
      }
      itemTaxAmount += itemTax * (item as any).quantity;
      continue;
    }

    const taxPercentage = await taxCalculator.getMealTaxPercentage(
      (item as any).mealId,
      (item as any).size,
      branchId
    );

    let itemTax = 0;
    if (taxInclusive) {
      itemTax = ((item as any).basePrice * taxPercentage) / (100 + taxPercentage);
    } else {
      itemTax = ((item as any).basePrice * taxPercentage) / 100;
    }

    itemTaxAmount += itemTax * (item as any).quantity;
  }

  // Calculate addon taxes using recalculated addon prices
  for (const item of recalculatedCartItems) {
    for (const addOn of item.addOns || []) {
      const addonTaxPercentage = await taxCalculator.getAddonTaxPercentage(
        addOn.id,
        branchId
      );

      let addonTax = 0;
      if (taxInclusive) {
        addonTax = (addOn.price * addonTaxPercentage) / (100 + addonTaxPercentage);
      } else {
        addonTax = (addOn.price * addonTaxPercentage) / 100;
      }

      const addonQuantity = addOn.quantity * (item as any).quantity;
      addonTaxAmount += addonTax * addonQuantity;
    }
  }

  // Calculate delivery tax
  if (effectiveDeliveryFee > 0 && effectiveDeliveryTaxPercentage > 0) {
    const deliveryTaxPercentage = effectiveDeliveryTaxPercentage;
    if (taxInclusive) {
      deliveryTaxAmount =
        (effectiveDeliveryFee * deliveryTaxPercentage) / (100 + deliveryTaxPercentage);
    } else {
      deliveryTaxAmount = (effectiveDeliveryFee * deliveryTaxPercentage) / 100;
    }
  }

  // Calculate takeaway service tax (applies only to PICKUP takeaway service fee)
  if (
    orderType === "PICKUP" &&
    takeawayServiceFee > 0 &&
    effectiveTakeawayServiceTaxPercentage > 0
  ) {
    if (taxInclusive) {
      takeawayServiceTaxAmount =
        (takeawayServiceFee * effectiveTakeawayServiceTaxPercentage) /
        (100 + effectiveTakeawayServiceTaxPercentage);
    } else {
      takeawayServiceTaxAmount =
        (takeawayServiceFee * effectiveTakeawayServiceTaxPercentage) / 100;
    }
  }

  const taxBreakdown = {
    itemTaxAmount: Math.round(itemTaxAmount * 100) / 100,
    addonTaxAmount: Math.round(addonTaxAmount * 100) / 100,
    deliveryTaxAmount: Math.round(deliveryTaxAmount * 100) / 100,
    takeawayServiceTaxAmount: Math.round(takeawayServiceTaxAmount * 100) / 100,
    takeawayServiceTaxPercentage: effectiveTakeawayServiceTaxPercentage,
    totalTaxAmount:
      Math.round(
        (itemTaxAmount +
          addonTaxAmount +
          deliveryTaxAmount +
          takeawayServiceTaxAmount) *
          100
      ) / 100,
  };

  // Step 4: Calculate detailed breakdown for items and addons
  const itemBreakdown: OrderCalculationResult["itemBreakdown"] = [];
  const addonBreakdown: OrderCalculationResult["addonBreakdown"] = [];

  for (const item of recalculatedCartItems) {
    const isDeal = (item as any).itemType === "DEAL";
    if (isDeal) {
      // Aggregate deal tax percentage is not meaningful when components have different VAT.
      // We store taxAmount as the sum across components and expose per-component lines via OrderItems.
      const prismaAny = prisma as any;
      const deal = await prismaAny.deal.findUnique({
        where: { id: (item as any).dealId },
        include: {
          components: {
            include:
              branchId
                ? {
                    branchPrices: {
                      where: { branchId: branchId as string },
                      select: { price: true, taxPercentage: true },
                    },
                  }
                : undefined,
          },
        },
      });
      const components = Array.isArray(deal?.components) ? deal.components : [];
      let dealTaxAmount = 0;
      for (const c of components) {
        const override = Array.isArray(c.branchPrices) && c.branchPrices.length > 0 ? c.branchPrices[0] : null;
        const unitPrice = override ? Number(override.price) : Number(c.price);
        const taxPct =
          override && override.taxPercentage !== null && override.taxPercentage !== undefined
            ? Number(override.taxPercentage)
            : Number(c.taxPercentage);
        const compQty = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
        const compQtySafe = Number.isFinite(compQty) && compQty > 0 ? compQty : 1;
        const dealQty = Number((item as any).quantity || 1);
        const lineQty = dealQty * compQtySafe;
        const taxPerUnit = taxInclusive
          ? (unitPrice * taxPct) / (100 + taxPct)
          : (unitPrice * taxPct) / 100;
        dealTaxAmount += taxPerUnit * lineQty;
      }

      const totalItemPrice = Number((item as any).basePrice) * Number((item as any).quantity);
      itemBreakdown.push({
        itemType: "DEAL",
        mealId: String((item as any).dealId),
        quantity: (item as any).quantity,
        unitPrice: Number((item as any).basePrice),
        totalPrice: totalItemPrice,
        taxAmount: Math.round(dealTaxAmount * 100) / 100,
        taxPercentage: 0,
      });
    } else if ((item as any).itemType === "VOUCHER") {
      // Parse specialInstructions to determine voucher type
      const specialInstructions = String((item as any).specialInstructions || "");
      const isSinglePurpose = specialInstructions.includes("TYPE: SINGLE_PURPOSE");
      
      // Single-purpose vouchers have tax already paid at issuance, so no tax at redemption
      const taxPercentage = isSinglePurpose ? 0 : Number((item as any).vatRate || 0);
      let itemTax = 0;
      if (taxPercentage > 0 && !isSinglePurpose) {
        if (taxInclusive) {
          itemTax = ((item as any).basePrice * taxPercentage) / (100 + taxPercentage);
        } else {
          itemTax = ((item as any).basePrice * taxPercentage) / 100;
        }
      }
      const totalItemPrice = (item as any).basePrice * (item as any).quantity;
      const totalItemTax = itemTax * (item as any).quantity;

      itemBreakdown.push({
        itemType: "MEAL",
        mealId: (item as any).mealId,
        quantity: (item as any).quantity,
        unitPrice: (item as any).basePrice,
        totalPrice: totalItemPrice,
        taxAmount: Math.round(totalItemTax * 100) / 100,
        taxPercentage,
      });
    } else {
      // Get tax percentage for this meal
      const taxPercentage = await taxCalculator.getMealTaxPercentage(
        (item as any).mealId,
        (item as any).size,
        branchId
      );

      // Calculate tax for this item
      let itemTax = 0;
      if (taxInclusive) {
        itemTax = ((item as any).basePrice * taxPercentage) / (100 + taxPercentage);
      } else {
        itemTax = ((item as any).basePrice * taxPercentage) / 100;
      }

      const totalItemPrice = (item as any).basePrice * (item as any).quantity;
      const totalItemTax = itemTax * (item as any).quantity;

      itemBreakdown.push({
        itemType: "MEAL",
        mealId: (item as any).mealId,
        quantity: (item as any).quantity,
        unitPrice: (item as any).basePrice,
        totalPrice: totalItemPrice,
        taxAmount: Math.round(totalItemTax * 100) / 100,
        taxPercentage,
      });
    }

    // Calculate taxes for addons
    for (const addOn of item.addOns || []) {
      const addonTaxPercentage = await taxCalculator.getAddonTaxPercentage(
        addOn.id,
        branchId
      );

      let addonTax = 0;
      if (taxInclusive) {
        addonTax = (addOn.price * addonTaxPercentage) / (100 + addonTaxPercentage);
      } else {
        addonTax = (addOn.price * addonTaxPercentage) / 100;
      }

      const addonQuantity = addOn.quantity * (item as any).quantity;
      const totalAddonPrice = addOn.price * addonQuantity;
      const totalAddonTax = addonTax * addonQuantity;

      addonBreakdown.push({
        addonId: addOn.id,
        quantity: addonQuantity,
        unitPrice: addOn.price,
        totalPrice: totalAddonPrice,
        taxAmount: Math.round(totalAddonTax * 100) / 100,
        taxPercentage: addonTaxPercentage,
      });
    }
  }

  // Step 5: Calculate final total
  // When taxInclusive=true, tax is already embedded in prices, so don't add it again
  // When taxInclusive=false, tax needs to be added on top
  // For PICKUP: subtotal + (tax if not inclusive)
  // For DELIVERY: subtotal + (tax if not inclusive) + deliveryFee
  let finalTotal: number;
  if (taxInclusive) {
    // Tax is already in the subtotal, only add delivery fee for delivery orders
    finalTotal =
      orderType === "PICKUP"
        ? subtotal + takeawayServiceFee
        : subtotal + effectiveDeliveryFee;
  } else {
    // Tax needs to be added on top
    finalTotal =
      orderType === "PICKUP"
        ? subtotal +
          taxBreakdown.itemTaxAmount +
          taxBreakdown.addonTaxAmount +
          takeawayServiceFee +
          taxBreakdown.takeawayServiceTaxAmount
        : subtotal +
          taxBreakdown.itemTaxAmount +
          taxBreakdown.addonTaxAmount +
          taxBreakdown.deliveryTaxAmount +
          effectiveDeliveryFee;
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    itemTaxAmount: Math.round(taxBreakdown.itemTaxAmount * 100) / 100,
    addonTaxAmount: Math.round(taxBreakdown.addonTaxAmount * 100) / 100,
    deliveryTaxAmount: Math.round(taxBreakdown.deliveryTaxAmount * 100) / 100,
    takeawayServiceTaxAmount: Math.round(taxBreakdown.takeawayServiceTaxAmount * 100) / 100,
    takeawayServiceTaxPercentage: Math.round(effectiveTakeawayServiceTaxPercentage * 100) / 100,
    totalTaxAmount: Math.round(taxBreakdown.totalTaxAmount * 100) / 100,
    deliveryFee: effectiveDeliveryFee,
    takeawayServiceFee: Math.round(takeawayServiceFee * 100) / 100,
    finalTotal: Math.round(finalTotal * 100) / 100,
    itemBreakdown,
    addonBreakdown,
  };
}

/**
 * Compute per-item discount and surcharge amounts using cent-based arithmetic.
 * Scope controls whether the flat amount is per-unit (×qty) or per-line (flat).
 * Percentage discounts always apply to the raw line gross (unitPrice × qty).
 *
 * @param unitPrice           - Unit price in currency (euros)
 * @param quantity            - Item quantity
 * @param itemDiscountType    - "FIXED" | "PERCENTAGE" | null
 * @param itemDiscountValue   - Raw discount input (currency amount or % 0-100)
 * @param itemDiscountScope   - "PER_UNIT" | "PER_LINE"
 * @param itemSurchargeAmount - Flat surcharge amount
 * @param itemSurchargeScope  - "PER_UNIT" | "PER_LINE"
 * @returns { itemDiscountAmount, itemSurchargeAmount, totalPrice }
 */
export function computeItemAdjustments(
  unitPrice: number,
  quantity: number,
  itemDiscountType: string | null | undefined,
  itemDiscountValue: number | null | undefined,
  itemDiscountScope: string | null | undefined,
  itemSurchargeRaw: number | null | undefined,
  itemSurchargeScope: string | null | undefined
): { itemDiscountAmount: number; itemSurchargeAmount: number; totalPrice: number } {
  const qty = Math.max(1, Math.round(Number(quantity) || 1));
  const unitPriceSafe = Math.max(0, Number(unitPrice) || 0);

  // Step 1: raw row gross in cents
  const rawRowGrossCents = Math.round(unitPriceSafe * qty * 100);

  // Step 2: surcharge cents
  const surchargeRaw = Math.max(0, Number(itemSurchargeRaw) || 0);
  const surchargeCents =
    itemSurchargeScope === "PER_UNIT"
      ? Math.round(surchargeRaw * qty * 100)
      : Math.round(surchargeRaw * 100);

  // Step 3: discount cents
  const discountValueSafe = Math.max(0, Number(itemDiscountValue) || 0);
  let discountCents = 0;
  if (itemDiscountType === "PERCENTAGE") {
    const pct = Math.min(discountValueSafe, 100);
    discountCents = Math.round(rawRowGrossCents * (pct / 100));
  } else if (itemDiscountType === "FIXED") {
    discountCents =
      itemDiscountScope === "PER_UNIT"
        ? Math.round(discountValueSafe * qty * 100)
        : Math.round(discountValueSafe * 100);
  }

  // Step 4: canonical line total
  const totalPriceCents = Math.max(0, rawRowGrossCents + surchargeCents - discountCents);

  return {
    itemDiscountAmount: Math.round(discountCents) / 100,
    itemSurchargeAmount: Math.round(surchargeCents) / 100,
    totalPrice: Math.round(totalPriceCents) / 100,
  };
}

/**
 * Compute the pre-tax discount amount from a raw discount input.
 * The discount is applied against the pre-tax subtotal (German/EU compliant).
 *
 * @param subtotal   - Pre-tax subtotal (sum of all items before tax/fees)
 * @param discountType  - "FIXED" | "PERCENTAGE" | null
 * @param discountValue - Raw discount input (currency amount or percentage 0-100)
 * @returns { discountAmount, discountedSubtotal }
 */
export function applyDiscount(
  subtotal: number,
  discountType: string | null | undefined,
  discountValue: number | null | undefined
): { discountAmount: number; discountedSubtotal: number } {
  const raw = Number(discountValue) || 0;
  let discountAmount = 0;

  if (discountType === "FIXED") {
    discountAmount = Math.min(Math.max(raw, 0), subtotal);
  } else if (discountType === "PERCENTAGE") {
    const pct = Math.min(Math.max(raw, 0), 100);
    discountAmount = subtotal * (pct / 100);
  }

  discountAmount = Math.round(discountAmount * 100) / 100;
  const discountedSubtotal = Math.max(Math.round((subtotal - discountAmount) * 100) / 100, 0);

  return { discountAmount, discountedSubtotal };
}
