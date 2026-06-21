import { DsfinvkOrder, DsfinvkCorrection, BusinessCaseRow } from "./types";
import { round2, getVatKeyFromRate, sortByVatId, toCents, vatPartsFromGrossCents } from "./helpers";
import { normalizeDealItems } from "./bundleDecomposer";

interface VatAggregate {
  rate: number;
  gross: number;
  net: number;
  vat: number;
}

/**
 * businesscases.csv
 *
 * Builds the cash_statement.business_cases array for the closing payload.
 * Aggregates VAT separately for normal sales (Umsatz), cancellations (Storno),
 * and refunds/returns (Gutschrift) — all reported as Umsatz type per DSFinV-K spec.
 */

function aggregateSalesVat(orders: DsfinvkOrder[]): VatAggregate[] {
  const vatMap = new Map<number, VatAggregate>();

  for (const order of orders) {
    if (String(order?.status).toUpperCase() === "CANCELLED") continue;

    let itemsSum = 0;

    const normalizedItems = normalizeDealItems(order?.orderItems || []).filter(
      (it) => String(it?.itemType || "").toUpperCase() !== "DEAL"
    );

    for (const item of normalizedItems) {
      const finalGross = round2(item?.totalPrice || 0);
      
      if (!Number.isFinite(finalGross) || finalGross === 0) continue;

      itemsSum = round2(itemsSum + finalGross);

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
      itemsSum = round2(itemsSum + deliveryFee);

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

    const serviceFee = round2(order?.takeawayServiceFee);
    if (Number.isFinite(serviceFee) && serviceFee > 0) {
      itemsSum = round2(itemsSum + serviceFee);
      const serviceTaxRate = Number(order?.takeawayServiceTaxPercentage || 0);
      const serviceNet = serviceTaxRate > 0
        ? round2(serviceFee / (1 + serviceTaxRate / 100))
        : serviceFee;
      const serviceVat = round2(serviceFee - serviceNet);
      const key = getVatKeyFromRate(serviceTaxRate);
      const existing = vatMap.get(key);
      if (existing) {
        existing.gross = round2(existing.gross + serviceFee);
        existing.net   = round2(existing.net   + serviceNet);
        existing.vat   = round2(existing.vat   + serviceVat);
      } else {
        vatMap.set(key, { rate: serviceTaxRate, gross: serviceFee, net: serviceNet, vat: serviceVat });
      }
    }

    // Add rounding difference (Sonstiges line) as 0% VAT
    // Only emit for genuine sub-penny drift (<=0.05 EUR). Larger values indicate
    // a stale totalAmount (e.g. pre-surcharge) and would create a negative bucket.
    const total = round2(order?.totalAmount);
    if (Number.isFinite(total) && Math.abs(total - itemsSum) >= 0.01 && Math.abs(total - itemsSum) <= 0.05) {
      const roundingDiff = round2(total - itemsSum);
      const rate = 0;
      const gross = roundingDiff;
      const net = roundingDiff;
      const vat = 0;

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
  }

  return Array.from(vatMap.values());
}

function aggregateStornoVat(corrections: DsfinvkCorrection[]): VatAggregate[] {
  const vatMap = new Map<number, VatAggregate>();

  for (const c of corrections) {
    if (String(c?.type).toUpperCase() !== "CANCELLATION") continue;

    const signaturePayload = c?.signaturePayload || null;
    const vatRateCandidates = [
      (signaturePayload as any)?.process_data?.vatRate,
      (signaturePayload as any)?.processData?.vatRate,
      (signaturePayload as any)?.response?.process_data?.vatRate,
      (signaturePayload as any)?.response?.processData?.vatRate,
    ];
    const rate = Number(vatRateCandidates.find((r) => r !== undefined && r !== null) ?? 19);

    const gross = -Math.abs(round2(c?.amount || 0));
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

  return Array.from(vatMap.values());
}

function aggregateGutschriftVat(corrections: DsfinvkCorrection[]): VatAggregate[] {
  const vatMap = new Map<number, VatAggregate>();

  for (const c of corrections) {
    const type = String(c?.type).toUpperCase();
    if (type !== "REFUND" && type !== "RETURN") continue;

    const signaturePayload = c?.signaturePayload || null;
    const vatRateCandidates = [
      (signaturePayload as any)?.process_data?.vatRate,
      (signaturePayload as any)?.processData?.vatRate,
      (signaturePayload as any)?.response?.process_data?.vatRate,
      (signaturePayload as any)?.response?.processData?.vatRate,
    ];
    const rate = Number(vatRateCandidates.find((r) => r !== undefined && r !== null) ?? 19);

    const gross = -Math.abs(round2(c?.amount || 0));
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

  return Array.from(vatMap.values());
}

export function buildBusinessCases(
  orders: DsfinvkOrder[],
  corrections: DsfinvkCorrection[]
): BusinessCaseRow[] {
  const cases: BusinessCaseRow[] = [];

  const salesVat = aggregateSalesVat(orders);
  const stornoVat = aggregateStornoVat(corrections);
  const gutschriftVat = aggregateGutschriftVat(corrections);

  // Combine all VAT aggregates into a single business case
  const combinedVat = new Map<number, VatAggregate>();

  for (const v of salesVat) {
    const key = getVatKeyFromRate(v.rate);
    const existing = combinedVat.get(key);
    if (existing) {
      existing.gross = round2(existing.gross + v.gross);
      existing.net = round2(existing.net + v.net);
      existing.vat = round2(existing.vat + v.vat);
    } else {
      combinedVat.set(key, { ...v });
    }
  }

  for (const v of stornoVat) {
    const key = getVatKeyFromRate(v.rate);
    const existing = combinedVat.get(key);
    if (existing) {
      existing.gross = round2(existing.gross + v.gross);
      existing.net = round2(existing.net + v.net);
      existing.vat = round2(existing.vat + v.vat);
    } else {
      combinedVat.set(key, { ...v });
    }
  }

  for (const v of gutschriftVat) {
    const key = getVatKeyFromRate(v.rate);
    const existing = combinedVat.get(key);
    if (existing) {
      existing.gross = round2(existing.gross + v.gross);
      existing.net = round2(existing.net + v.net);
      existing.vat = round2(existing.vat + v.vat);
    } else {
      combinedVat.set(key, { ...v });
    }
  }

  // Create a single business case with all VAT groups
  const totalGross = round2(Array.from(combinedVat.values()).reduce((sum, v) => sum + v.gross, 0));
  const amountsPerVatId = Array.from(combinedVat.values()).sort((a, b) => getVatKeyFromRate(a.rate) - getVatKeyFromRate(b.rate)).map((v) => {
    const vatId = getVatKeyFromRate(v.rate);
    return {
      vat_definition_export_id: vatId,
      excl_vat: round2(v.net),
      vat: round2(v.vat),
      incl_vat: round2(v.gross),
    };
  });

  if (totalGross !== 0 || amountsPerVatId.length > 0) {
    cases.push({
      type: "Umsatz",
      amounts_per_vat_id: amountsPerVatId,
    });
  } else {
    cases.push({
      type: "Umsatz",
      amounts_per_vat_id: [
        { vat_definition_export_id: 1, excl_vat: 0, vat: 0, incl_vat: 0 },
      ],
    });
  }

  return cases;
}
