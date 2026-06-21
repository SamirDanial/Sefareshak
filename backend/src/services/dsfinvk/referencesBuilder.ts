import { DsfinvkCorrection, TransactionReference } from "./types";

/**
 * references.csv
 *
 * Builds reference entries that link correction transactions back to their
 * original order transactions (Bonreferenz). Only corrections with an
 * associated orderId produce a reference row.
 */
export function buildCorrectionReferences(
  correction: DsfinvkCorrection,
  referencedTransactionTxId?: string | null
): TransactionReference[] {
  const txId = String(referencedTransactionTxId || "").trim();
  if (!correction?.orderId || !txId) return [];

  return [
    {
      type: "InterneTransaktion" as const,
      tx_id: txId,
    },
  ];
}
