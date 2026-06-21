import { DsfinvkBuilderContext, CashPointClosingPayload, TransactionRow } from "./types";
import { buildCashPointClosingHead } from "./cashPointClosingBuilder";
import { buildBusinessCases } from "./businessCasesBuilder";
import { buildPaymentTotals, buildCashStatementPayment } from "./paymentBuilder";
import { buildOrderTransactions, buildCorrectionTransactions } from "./transactionsBuilder";

/**
 * Orchestrates all DSFinV-K CSV builders into one complete cash point closing payload.
 * This payload is submitted to Fiskaly via insertCashPointClosing.
 */
export function buildCashPointClosingPayload(ctx: DsfinvkBuilderContext): {
  payload: CashPointClosingPayload;
  minimalPayload: CashPointClosingPayload;
} {
  const {
    organizationId,
    cashRegisterId,
    cashPointClosingExportNumber,
    exportCreationDate,
    businessDate,
    orders,
    corrections,
    posDevices,
    settings,
  } = ctx;

  const orderTransactions = buildOrderTransactions(orders, organizationId, cashRegisterId);
  const originalTxIdByOrderId = new Map<string, string>();
  const orderById = new Map<string, any>();
  for (const tx of orderTransactions) {
    const orderId = String(tx?.head?.transaction_export_id || "");
    const txId = String(tx?.head?.tx_id || "");
    if (orderId && txId) originalTxIdByOrderId.set(orderId, txId);
  }
  for (const order of orders) {
    if (order?.id) orderById.set(String(order.id), order);
  }

  const correctionTransactions = buildCorrectionTransactions(
    corrections,
    organizationId,
    cashRegisterId,
    originalTxIdByOrderId,
    orderById
  );

  let transactions: TransactionRow[] = ([] as TransactionRow[]).concat(
    orderTransactions as any,
    correctionTransactions as any
  );

  const correctionExportIds = new Set<string>();
  for (const c of corrections) {
    if (c?.id) correctionExportIds.add(String(c.id));
  }

  const cancellationCorrectionOrderIds = new Set<string>();
  for (const c of corrections) {
    if (String(c?.type || "").toUpperCase() === "CANCELLATION" && c?.orderId) {
      cancellationCorrectionOrderIds.add(String(c.orderId));
    }
  }

  for (const tx of transactions) {
    const exportId = String(tx?.head?.transaction_export_id || "");
    if (!exportId) continue;
    if (correctionExportIds.has(exportId)) continue;
    const orderId = exportId;
    if (!orderId) continue;
    if (cancellationCorrectionOrderIds.has(orderId)) {
      tx.head = { ...tx.head, storno: false };
    }
  }

  const paymentTotals = buildPaymentTotals(transactions, correctionExportIds, orderById, corrections);

  const cashStatement = {
    business_cases: buildBusinessCases(orders, corrections),
    payment: buildCashStatementPayment(paymentTotals),
  };

  const firstId = String(transactions?.[0]?.head?.transaction_export_id || "0");
  const lastId = String(
    transactions?.[Math.max(0, (transactions?.length || 1) - 1)]?.head?.transaction_export_id || "0"
  );

  const head = buildCashPointClosingHead({
    exportCreationDate,
    businessDate,
    firstTransactionExportId: firstId,
    lastTransactionExportId: lastId,
  });

  const payload: CashPointClosingPayload = {
    head,
    cash_statement: cashStatement,
    transactions,
  };

  const minimalPayload: CashPointClosingPayload = {
    ...payload,
    transactions: transactions.map((t) => {
      const { lines, ...rest } = t.data as any;
      return { ...t, data: rest };
    }),
  };

  return { payload, minimalPayload };
}

/**
 * Cleans payload for Fiskaly by removing deprecated keys and mapping old property names.
 * Ensures only valid DSFinV-K properties are sent.
 */
export function cleanPayloadForFiskaly(payload: any): any {
  const cleaned = JSON.parse(JSON.stringify(payload));

  // 1. Remove any legacy root-level keys no longer part of the API
  delete cleaned.slaves;
  delete (cleaned.cash_statement || {}).terminals;
  delete (cleaned.cash_statement || {}).payment_types;

  // 2. Safe defensive mapping for payment_types (handle both old and new property names)
  for (const tx of cleaned.transactions || []) {
    const rawPayments = tx.payment_types || tx.payments;
    if (rawPayments) {
      tx.payment_types = rawPayments.map((p: any) => ({
        type: p.type || p.zahlart_typ,
        name: p.name || p.zahlart_name,
        currency_code: p.currency_code || p.zahlwaeh_code,
        amount: p.amount || p.zahlwaeh_betrag,
      }));
      delete tx.payments;
    }
  }

  return cleaned;
}

/**
 * Replaces all tss_tx_id values with error_message in a payload.
 * Used when Fiskaly reports "Transaction not found in SIGN DE".
 */
export function stripTssTxIds(p: CashPointClosingPayload): CashPointClosingPayload {
  const fixedTransactions = (p?.transactions || []).map((t) => {
    const sec = t?.security || {};
    if ((sec as any).tss_tx_id) {
      return {
        ...t,
        security: {
          error_message: `TSS transaction not available in SIGN DE (tx_id: ${(sec as any).tss_tx_id})`,
        },
      };
    }
    return t;
  });
  return { ...p, transactions: fixedTransactions };
}
