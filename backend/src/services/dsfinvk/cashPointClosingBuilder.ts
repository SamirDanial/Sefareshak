/**
 * cashpointclosing.csv
 *
 * Builds the head metadata for a cash point closing (Kassenabschluss).
 * This is submitted to Fiskaly via insertCashPointClosing and generates
 * the cashpointclosing.csv entry in the DSFinV-K export.
 */
export function buildCashPointClosingHead(params: {
  exportCreationDate: number;
  businessDate: string;
  firstTransactionExportId: string;
  lastTransactionExportId: string;
}): {
  export_creation_date: number;
  business_date: string;
  first_transaction_export_id: string;
  last_transaction_export_id: string;
} {
  return {
    export_creation_date: params.exportCreationDate,
    business_date: params.businessDate,
    first_transaction_export_id: params.firstTransactionExportId,
    last_transaction_export_id: params.lastTransactionExportId,
  };
}
