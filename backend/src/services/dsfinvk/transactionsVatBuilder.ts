import { DsfinvkCorrection } from "./types";
import { round2, getVatKeyFromRate } from "./helpers";

/**
 * transactions_vat.csv (per-correction VAT breakdown)
 *
 * Builds the vat_amounts array for a single correction transaction.
 * For order transactions use aggregateOrderVatByRate from vatBuilder.ts.
 */
export function aggregateCorrectionVatForTx(correction: DsfinvkCorrection) {
  const signaturePayload = correction?.signaturePayload || null;
  const vatRateCandidates = [
    (signaturePayload as any)?.process_data?.vatRate,
    (signaturePayload as any)?.processData?.vatRate,
    (signaturePayload as any)?.response?.process_data?.vatRate,
    (signaturePayload as any)?.response?.processData?.vatRate,
  ];
  const rate = Number(vatRateCandidates.find((r) => r !== undefined && r !== null) ?? 19);
  const gross = Math.abs(round2(correction?.amount || 0));
  const net = rate > 0 ? round2(gross / (1 + rate / 100)) : gross;
  const vat = round2(gross - net);

  return [
    {
      vat_id: getVatKeyFromRate(rate),
      vat_rate: rate,
      excl_vat: net,
      vat,
      incl_vat: gross,
    },
  ];
}
