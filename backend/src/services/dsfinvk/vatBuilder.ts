import { DsfinvkOrder, DsfinvkCorrection } from "./types";
import { round2, getVatKeyFromRate, sortByVatId, toCents, vatPartsFromGrossCents } from "./helpers";
import { normalizeDealItems } from "./bundleDecomposer";

interface VatAggregate {
  rate: number;
  gross: number;
  net: number;
  vat: number;
}

/**
 * Absorb rounding drift in highest VAT bucket
 * Ensures sum of VAT buckets matches expected total
 */
function absorbRoundingDrift(
  aggregates: VatAggregate[],
  expectedTotal: number
): VatAggregate[] {
  const actualTotal = round2(aggregates.reduce((sum, v) => sum + v.gross, 0));
  const drift = round2(expectedTotal - actualTotal);

  if (Math.abs(drift) < 0.01) return aggregates;

  // Find highest VAT rate bucket to absorb drift
  const highestVatIndex = aggregates.reduce((maxIdx, v, idx, arr) => 
    v.rate > arr[maxIdx].rate ? idx : maxIdx, 0);

  const target = aggregates[highestVatIndex];
  const rate = target.rate;
  
  // Adjust gross, net, and vat proportionally
  target.gross = round2(target.gross + drift);
  target.net = rate > 0 ? round2(target.gross / (1 + rate / 100)) : target.gross;
  target.vat = round2(target.gross - target.net);

  return aggregates;
}

/**
 * vat.csv
 *
 * Aggregates VAT amounts by rate across all orders for the closing period.
 * Calculates VAT on base item + add-ons separately, then applies discounts proportionally.
 * Also merges correction (storno/refund) VAT adjustments.
 */
export function aggregateVatAmounts(orders: DsfinvkOrder[]): VatAggregate[] {
  const vatMap = new Map<number, VatAggregate>();

  for (const order of orders) {
    for (const item of order?.orderItems || []) {
      const finalGross = round2(item?.totalPrice || 0);
      
      if (!Number.isFinite(finalGross) || finalGross === 0) continue;

      const itemVatRate = Number(item?.taxPercentage || 0);
      const itemVatKey = getVatKeyFromRate(itemVatRate);
      const parts = vatPartsFromGrossCents(toCents(finalGross), itemVatRate);

      const existing = vatMap.get(itemVatKey);
      if (existing) {
        existing.gross = round2(existing.gross + parts.incl_vat);
        existing.net = round2(existing.net + parts.excl_vat);
        existing.vat = round2(existing.vat + parts.vat);
      } else {
        vatMap.set(itemVatKey, { rate: itemVatRate, gross: parts.incl_vat, net: parts.excl_vat, vat: parts.vat });
      }
    }

    const deliveryFee = round2(order?.deliveryFee);
    if (Number.isFinite(deliveryFee) && deliveryFee > 0) {
      const deliveryVatRate = 19;
      const gross = deliveryFee;
      const net = round2(gross / (1 + deliveryVatRate / 100));
      const vat = round2(gross - net);

      const key = getVatKeyFromRate(deliveryVatRate);
      const existing = vatMap.get(key);
      if (existing) {
        existing.gross = round2(existing.gross + gross);
        existing.net = round2(existing.net + net);
        existing.vat = round2(existing.vat + vat);
      } else {
        vatMap.set(key, { rate: deliveryVatRate, gross, net, vat });
      }
    }
  }

  return Array.from(vatMap.values()).sort((a, b) => getVatKeyFromRate(a.rate) - getVatKeyFromRate(b.rate));
}

export function aggregateCorrectionVat(corrections: DsfinvkCorrection[]): VatAggregate[] {
  const vatMap = new Map<number, VatAggregate>();

  for (const c of corrections) {
    const signaturePayload = c?.signaturePayload || null;
    const vatRateCandidates = [
      (signaturePayload as any)?.process_data?.vatRate,
      (signaturePayload as any)?.processData?.vatRate,
      (signaturePayload as any)?.response?.process_data?.vatRate,
      (signaturePayload as any)?.response?.processData?.vatRate,
    ];
    const rate = Number(vatRateCandidates.find((r) => r !== undefined && r !== null) ?? 19);

    const amount = Number(c?.amount || 0);
    const gross = -Math.abs(round2(amount));
    const net = rate > 0 ? round2(gross / (1 + rate / 100)) : gross;
    const vat = round2(gross - net);

    const key = getVatKeyFromRate(rate);
    const existing = vatMap.get(key);
    if (existing) {
      existing.gross = round2(existing.gross + gross);
      existing.net = round2(existing.net + net);
      existing.vat = round2(existing.vat + vat);
    } else {
      vatMap.set(key, { rate, gross, net, vat });
    }
  }

  return Array.from(vatMap.values()).sort((a, b) => getVatKeyFromRate(a.rate) - getVatKeyFromRate(b.rate));
}

/**
 * Merges order VAT and correction VAT into one combined list.
 */
export function buildVatTotals(
  orders: DsfinvkOrder[],
  corrections: DsfinvkCorrection[]
): VatAggregate[] {
  const vatAmounts = aggregateVatAmounts(orders);
  const correctionVatAmounts = aggregateCorrectionVat(corrections);

  for (const cVat of correctionVatAmounts) {
    const existing = vatAmounts.find((v) => v.rate === cVat.rate);
    if (existing) {
      existing.gross = round2(existing.gross + cVat.gross);
      existing.net = round2(existing.net + cVat.net);
      existing.vat = round2(existing.vat + cVat.vat);
    } else {
      vatAmounts.push(cVat);
    }
  }

  return vatAmounts.sort((a, b) => getVatKeyFromRate(a.rate) - getVatKeyFromRate(b.rate));
}

/**
 * transactions_vat.csv (per-order VAT breakdown)
 */
export function aggregateOrderVatByRate(order: DsfinvkOrder) {
  const vatMap = new Map<
    number,
    { vat_id: number; vat_rate: number; excl_vat: number; vat: number; incl_vat: number }
  >();

  let itemsSum = 0;

  const normalizedItems = normalizeDealItems(order?.orderItems || []);

  for (const item of normalizedItems) {
    const rate = Number(item?.taxPercentage || 0);
    const gross = round2(item?.totalPrice);
    if (!Number.isFinite(gross) || gross === 0) continue;

    itemsSum = round2(itemsSum + gross);

    const net = rate > 0 ? round2(gross / (1 + rate / 100)) : gross;
    const vat = round2(gross - net);
    const vatId = getVatKeyFromRate(rate);

    const existing = vatMap.get(vatId);
    if (existing) {
      existing.excl_vat = round2(existing.excl_vat + net);
      existing.vat = round2(existing.vat + vat);
      existing.incl_vat = round2(existing.incl_vat + gross);
    } else {
      vatMap.set(vatId, { vat_id: vatId, vat_rate: rate, excl_vat: net, vat, incl_vat: gross });
    }
  }

  const deliveryFee = round2(order?.deliveryFee);
  if (Number.isFinite(deliveryFee) && deliveryFee > 0) {
    itemsSum = round2(itemsSum + deliveryFee);

    const rate = 19;
    const gross = deliveryFee;
    const net = round2(gross / (1 + rate / 100));
    const vat = round2(gross - net);
    const vatId = 1;

    const existing = vatMap.get(vatId);
    if (existing) {
      existing.excl_vat = round2(existing.excl_vat + net);
      existing.vat = round2(existing.vat + vat);
      existing.incl_vat = round2(existing.incl_vat + gross);
    } else {
      vatMap.set(vatId, { vat_id: vatId, vat_rate: rate, excl_vat: net, vat, incl_vat: gross });
    }
  }

  const serviceFee = round2(order?.takeawayServiceFee);
  if (Number.isFinite(serviceFee) && serviceFee > 0) {
    itemsSum = round2(itemsSum + serviceFee);
    const serviceTaxRate = Number(order?.takeawayServiceTaxPercentage || 0);
    const serviceNet = serviceTaxRate > 0
      ? round2(serviceFee / (1 + serviceTaxRate / 100))
      : serviceFee;
    const serviceVat = round2(serviceFee - serviceNet);
    const vatId = getVatKeyFromRate(serviceTaxRate);
    const existing = vatMap.get(vatId);
    if (existing) {
      existing.excl_vat = round2(existing.excl_vat + serviceNet);
      existing.vat = round2(existing.vat + serviceVat);
      existing.incl_vat = round2(existing.incl_vat + serviceFee);
    } else {
      vatMap.set(vatId, { vat_id: vatId, vat_rate: serviceTaxRate, excl_vat: serviceNet, vat: serviceVat, incl_vat: serviceFee });
    }
  }

  // Add rounding difference (Sonstiges line) as VAT id 3 (0% VAT)
  // Only emit for genuine sub-penny drift (<=0.05 EUR). Larger values indicate
  // a stale totalAmount (e.g. pre-surcharge) and would create a negative bucket.
  const total = round2(order?.totalAmount);
  if (Number.isFinite(total) && Math.abs(total - itemsSum) >= 0.01 && Math.abs(total - itemsSum) <= 0.05) {
    const roundingDiff = round2(total - itemsSum);
    const rate = 0;
    const gross = roundingDiff;
    const net = roundingDiff;
    const vat = 0;
    const vatId = 3;

    const existing = vatMap.get(vatId);
    if (existing) {
      existing.excl_vat = round2(existing.excl_vat + net);
      existing.vat = round2(existing.vat + vat);
      existing.incl_vat = round2(existing.incl_vat + gross);
    } else {
      vatMap.set(vatId, { vat_id: vatId, vat_rate: rate, excl_vat: net, vat, incl_vat: gross });
    }
  }

  return sortByVatId(Array.from(vatMap.values()));
}
