import { DsfinvkOrder, DsfinvkOrderItem } from "./types";
import { round2, getVatKeyFromRate, sortByVatId, toCents, fromCents, vatPartsFromGrossCents } from "./helpers";
import { normalizeDealItems } from "./bundleDecomposer";

export type AmountPerVat = {
  vat_definition_export_id: number;
  excl_vat?: number;
  vat: number;
  incl_vat?: number;
};

export type PriceFindingResult = {
  base_amounts_per_vat_id: AmountPerVat[];
  discounts_per_vat_id?: AmountPerVat[];
  extra_amounts_per_vat_id?: AmountPerVat[];
  amounts_per_vat_id: AmountPerVat[];
};

interface VatBucket {
  vatRate: number;
  vatKey: string;
  amount: number;
}

function toAmountPerVat(
  inclVat: number,
  vatRate: number,
  vatKey: string
): AmountPerVat {
  const parts = vatPartsFromGrossCents(toCents(inclVat), vatRate);

  return {
    vat_definition_export_id: Number(vatKey),
    ...parts,
  };
}

/**
 * Distribute discount proportionally across VAT buckets
 * Ensures each VAT rate gets its fair share of the discount
 */
function distributeDiscountAcrossVatBuckets(
  buckets: VatBucket[],
  totalDiscount: number
): Map<string, number> {
  const distribution = new Map<string, number>();
  
  if (totalDiscount === 0) return distribution;
  
  const totalAmount = buckets.reduce((sum, b) => sum + b.amount, 0);
  if (totalAmount === 0) return distribution;
  
  let remainingDiscount = totalDiscount;
  
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const proportionalShare = round2((bucket.amount / totalAmount) * totalDiscount);
    
    // Last bucket gets remainder to avoid rounding drift
    if (i === buckets.length - 1) {
      distribution.set(bucket.vatKey, round2(remainingDiscount));
    } else {
      distribution.set(bucket.vatKey, proportionalShare);
      remainingDiscount = round2(remainingDiscount - proportionalShare);
    }
  }
  
  return distribution;
}

/**
 * CENT-BASED DISCOUNT ARITHMETIC WITH AUDIT INTEGRITY
 *
 * Canonical calculation chain (all in integer cents):
 * 1. finalGrossCents = stored item.totalPrice (already includes add-ons)
 *    ⚠️ SUB-ITEMS ARE INFORMATIONAL ONLY - Add-on prices are baked into totalPrice ⚠️
 *    ⚠️ NEVER extract or sum add-ons from orderItemAddOns for financial calculation ⚠️
 * 2. discountCents = item discount (positive value, will be negated)
 * 3. surchargeCents = item surcharge
 * 4. baseGrossCents = finalGrossCents + discountCents - surchargeCents
 *
 * VAT decomposition uses cent math:
 * - netCents = Math.round(grossCents / (1 + rate/100))
 * - vatCents = grossCents - netCents
 *
 * Final amounts are DERIVED from component sums:
 * - final = base + discount + surcharge (ensures audit integrity)
 *
 * All output arrays are sorted by vat_definition_export_id.
 */
function buildPriceFindingForItem(
  item: DsfinvkOrderItem,
  orderDiscountShare: number
): PriceFindingResult | null {
  const finalGross = round2(item?.totalPrice || 0);

  if (!Number.isFinite(finalGross) || Math.abs(finalGross) < 0.001) {
    return null;
  }

  const itemVatRate = Number(item.taxPercentage || 0);
  const itemVatKey = String(getVatKeyFromRate(itemVatRate));

  const itemDiscount = round2(item.itemDiscountAmount);
  const surcharge = round2(item.itemSurchargeAmount);

  const hasItemDiscount = Math.abs(itemDiscount) > 0.001;

  const discount =
    hasItemDiscount
      ? Math.abs(itemDiscount)
      : Math.abs(orderDiscountShare);

  // CENT-BASED CALCULATION PIPELINE
  const finalGrossCents = toCents(finalGross);
  const discountCents = toCents(discount);
  const surchargeCents = toCents(surcharge);

  // Base = final + discount - surcharge (reverse the transaction)
  const baseGrossCents = finalGrossCents + discountCents - surchargeCents;

  // Decompose base using cent VAT math
  const baseNetCents = itemVatRate > 0
    ? Math.round(baseGrossCents / (1 + itemVatRate / 100))
    : baseGrossCents;
  const baseVatCents = baseGrossCents - baseNetCents;

  // Decompose discount (negative for discounts_per_vat_id)
  const discountNetCents = discountCents > 0 && itemVatRate > 0
    ? Math.round(discountCents / (1 + itemVatRate / 100))
    : discountCents;
  const discountVatCents = discountCents - discountNetCents;

  // Decompose surcharge
  const surchargeNetCents = surchargeCents > 0 && itemVatRate > 0
    ? Math.round(surchargeCents / (1 + itemVatRate / 100))
    : surchargeCents;
  const surchargeVatCents = surchargeCents - surchargeNetCents;

  // DERIVE final from component sums (ensures audit integrity)
  const derivedFinalGrossCents = baseGrossCents - discountCents + surchargeCents;
  const derivedFinalNetCents = baseNetCents - discountNetCents + surchargeNetCents;
  const derivedFinalVatCents = baseVatCents - discountVatCents + surchargeVatCents;

  // Absorb any cent drift in largest bucket
  let adjustedFinalGrossCents = derivedFinalGrossCents;
  let adjustedFinalNetCents = derivedFinalNetCents;
  let adjustedFinalVatCents = derivedFinalVatCents;

  const drift = finalGrossCents - derivedFinalGrossCents;
  if (Math.abs(drift) > 0 && Math.abs(drift) <= 5) { // up to 5 cents = 0.05 EUR
    // Adjust net cents (VAT stays whole-cent legal)
    adjustedFinalNetCents += drift;
    adjustedFinalGrossCents += drift;
  }

  // Build AmountPerVat objects from cents
  // For base_amounts_per_vat_id, include all three fields (excl_vat, vat, incl_vat)
  // to ensure PF_NETTO, PF_UST, and PF_BRUTTO are all populated in the CSV
  const baseAmountPerVat: AmountPerVat = {
    vat_definition_export_id: Number(itemVatKey),
    excl_vat: fromCents(baseNetCents),
    vat: fromCents(baseVatCents),
    incl_vat: fromCents(baseGrossCents),
  };

  const finalAmountPerVat: AmountPerVat = {
    vat_definition_export_id: Number(itemVatKey),
    excl_vat: fromCents(adjustedFinalNetCents),
    vat: fromCents(adjustedFinalVatCents),
    incl_vat: fromCents(adjustedFinalGrossCents),
  };

  const result: PriceFindingResult = {
    base_amounts_per_vat_id: sortByVatId([baseAmountPerVat]),
    amounts_per_vat_id: sortByVatId([finalAmountPerVat]),
  };

  // Only include discount if non-zero
  if (discountCents > 0) {
    const discountAmountPerVat: AmountPerVat = {
      vat_definition_export_id: Number(itemVatKey),
      excl_vat: fromCents(-discountNetCents),
      vat: fromCents(-discountVatCents),
      incl_vat: fromCents(-discountCents),
    };
    result.discounts_per_vat_id = sortByVatId([discountAmountPerVat]);
  }

  // Only include surcharge if non-zero
  if (surchargeCents > 0) {
    const surchargeAmountPerVat: AmountPerVat = {
      vat_definition_export_id: Number(itemVatKey),
      excl_vat: fromCents(surchargeNetCents),
      vat: fromCents(surchargeVatCents),
      incl_vat: fromCents(surchargeCents),
    };
    result.extra_amounts_per_vat_id = sortByVatId([surchargeAmountPerVat]);
  }

  return result;
}

export function buildPriceFindingForOrder(
  order: DsfinvkOrder
): Map<string, PriceFindingResult> {
  const result = new Map<string, PriceFindingResult>();

  const items = normalizeDealItems(Array.isArray(order.orderItems) ? order.orderItems : []);

  const totalOrderDiscount = round2(order.discountAmount);

  const totalItemsGross = items.reduce((sum, item) => {
    const g = round2(item.totalPrice);
    return Number.isFinite(g) ? sum + Math.abs(g) : sum;
  }, 0);

  console.log(`[DSFinV-K][DEBUG][itemAmounts] order=${(order as any)?.id} totalOrderDiscount=${totalOrderDiscount} totalItemsGross=${totalItemsGross} items=${items.length}`);
  for (const item of items) {
    const lineId = String(item.id || "");
    if (!lineId) continue;

    const gross = round2(item.totalPrice);
    if (!Number.isFinite(gross) || Math.abs(gross) < 0.001) continue;

    const hasItemDiscount =
      Math.abs(round2(item.itemDiscountAmount)) > 0.001;

    let orderDiscountShare = 0;

    if (!hasItemDiscount && totalItemsGross > 0 && Math.abs(totalOrderDiscount) > 0.001) {
      orderDiscountShare = round2(
        (Math.abs(gross) / totalItemsGross) * totalOrderDiscount
      );
    }

    console.log(`[DSFinV-K][DEBUG][itemAmounts]   item=${lineId} gross=${gross} itemDiscountAmount=${item.itemDiscountAmount} hasItemDiscount=${hasItemDiscount} orderDiscountShare=${orderDiscountShare}`);

    const priceFinding = buildPriceFindingForItem(item, orderDiscountShare);

    console.log(`[DSFinV-K][DEBUG][itemAmounts]   priceFinding built: ${priceFinding ? `base=${JSON.stringify(priceFinding.base_amounts_per_vat_id)} discount=${JSON.stringify(priceFinding.discounts_per_vat_id)}` : "NULL (skipped)"}`);

    if (priceFinding) {
      result.set(lineId, priceFinding);
    }
  }

  return result;
}