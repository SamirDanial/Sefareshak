/**
 * transactions_tse.csv
 *
 * Builds the security field for a transaction, containing either a verified
 * TSS transaction ID (tss_tx_id) from SIGN DE or a fallback error_message
 * when the transaction was not signed in live mode.
 */
export function buildTransactionSecurity(params: {
  rawTxId: string;
  signMode: string;
  hasSignDeResponse: boolean;
  errorMessage?: string;
}): { tss_tx_id: string } | { error_message: string } {
  const { rawTxId, signMode, hasSignDeResponse, errorMessage } = params;

  const tssTxId =
    rawTxId && signMode === "live" && hasSignDeResponse ? rawTxId : "";

  if (tssTxId) {
    return { tss_tx_id: tssTxId };
  }

  return {
    error_message: String(
      errorMessage ||
        (signMode === "test"
          ? "Transaction signed in test mode (not in SIGN DE)"
          : "Missing Fiskaly signature")
    ),
  };
}

export function extractTssTxId(signaturePayload: any): {
  rawTxId: string;
  signMode: string;
  hasSignDeResponse: boolean;
} {
  const rawTxId = String(
    signaturePayload?.txId || signaturePayload?.response?.tx_id || ""
  ).trim();
  const signMode = String(signaturePayload?.mode || "").trim().toLowerCase();
  const hasSignDeResponse = !!(signaturePayload?.response);
  return { rawTxId, signMode, hasSignDeResponse };
}
