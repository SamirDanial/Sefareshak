import { DsfinvkOrder, DsfinvkCorrection, TransactionRow, PaymentType, CashStatementPayment } from "./types";
import { round2, dsfinvkPaymentTypeFromPaymentMethod, getPaymentTypeName } from "./helpers";

/**
 * payment.csv
 *
 * Builds the cash_statement.payment section: aggregates payment totals by type
 * across all order and correction transactions for the closing period.
 */
export function buildPaymentTotals(
  transactions: TransactionRow[],
  correctionExportIds: Set<string>,
  orderById: Map<string, DsfinvkOrder>,
  correctionRows: DsfinvkCorrection[]
): Map<string, number> {
  const paymentTotals = new Map<string, number>();

  const addPayment = (type: string, name: string, amount: number) => {
    const t = String(type || "").trim() || "Unbar";
    const n = String(name || "").trim() || getPaymentTypeName(t);
    const k = `${t}:${n}`;
    paymentTotals.set(k, (paymentTotals.get(k) || 0) + Number(amount || 0));
  };

  for (const tx of transactions) {
    const exportId = String(tx?.head?.transaction_export_id || "");
    const isCorrection = correctionExportIds.has(exportId);
    const amount = round2(tx?.data?.full_amount_incl_vat);

    if (!exportId) {
      addPayment("Unbar", "Kreditkarte", amount);
      continue;
    }

    if (!isCorrection) {
      const o = orderById.get(exportId);
      const voucherAmount = round2(Number((o as any)?.voucherPaymentAmount || 0));
      
      // Add voucher payment if present (treated as Unbar/non-cash per DSFinV-K schema)
      if (voucherAmount > 0) {
        addPayment("Unbar", "Gutschein", voucherAmount);
      }
      
      // Add regular payment method for remaining amount
      const regularAmount = amount - voucherAmount;
      if (regularAmount > 0) {
        const pm = dsfinvkPaymentTypeFromPaymentMethod((o as any)?.paymentMethod);
        addPayment(pm, getPaymentTypeName(pm), regularAmount);
      }
      continue;
    }

    const cRow = correctionRows.find((c) => String(c?.id) === String(exportId));
    const sig = (cRow as any)?.signaturePayload || null;
    const orderIdFromCorrection = String((cRow as any)?.orderId || "").trim() || null;

    // Fetch original order to get payment split details
    let originalOrder = null;
    if (orderIdFromCorrection) {
      originalOrder = orderById.get(orderIdFromCorrection);
    }

    const voucherAmount = round2(Number((originalOrder as any)?.voucherPaymentAmount || 0));
    const totalAmount = round2(Number((originalOrder as any)?.totalAmount || 0));
    const nonVoucherAmount = totalAmount - voucherAmount;
    const refundAmount = Math.abs(round2(amount));
    const refundRatio = totalAmount > 0 ? refundAmount / totalAmount : 1;

    // Add voucher refund if present in original
    if (voucherAmount > 0) {
      const voucherRefund = round2(voucherAmount * refundRatio);
      addPayment("Unbar", "Gutschein", -voucherRefund);
    }

    // Add regular payment method refund if present in original
    if (nonVoucherAmount > 0) {
      const regularRefund = round2(nonVoucherAmount * refundRatio);
      const pm = dsfinvkPaymentTypeFromPaymentMethod((originalOrder as any)?.paymentMethod);
      addPayment(pm, getPaymentTypeName(pm), -regularRefund);
    }

    // Fallback to original behavior if no payment split data
    if (voucherAmount === 0 && nonVoucherAmount === 0) {
      const pmCandidate =
        (sig as any)?.process_data?.meta?.paymentMethod ||
        (sig as any)?.processData?.meta?.paymentMethod ||
        (sig as any)?.response?.process_data?.meta?.paymentMethod ||
        (sig as any)?.response?.processData?.meta?.paymentMethod ||
        (orderIdFromCorrection ? (orderById.get(orderIdFromCorrection) as any)?.paymentMethod : null) ||
        null;

      const pm = dsfinvkPaymentTypeFromPaymentMethod(pmCandidate);
      addPayment(pm, getPaymentTypeName(pm), amount);
    }
  }

  return paymentTotals;
}

export function buildCashStatementPaymentTypes(paymentTotals: Map<string, number>): PaymentType[] {
  const dsfinvkCurrencyCode = "EUR";

  const paymentTypes: PaymentType[] = Array.from(paymentTotals.entries()).map(([compositeKey, amount]) => {
    const parts = compositeKey.split(":");
    const type = parts[0];
    const name = parts[1] || getPaymentTypeName(type);
    return {
      type,
      name,
      currency_code: dsfinvkCurrencyCode,
      amount: round2(amount),
    };
  });

  if (paymentTypes.length === 0) {
    paymentTypes.push({ type: "Bar", name: "Bargeld", currency_code: dsfinvkCurrencyCode, amount: 0 });
  }

  return paymentTypes;
}

export function buildCashStatementPayment(paymentTotals: Map<string, number>): CashStatementPayment {
  const dsfinvkCurrencyCode = "EUR";
  const paymentTypes = buildCashStatementPaymentTypes(paymentTotals);

  const fullAmount = round2(
    paymentTypes.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );
  const cashAmount = round2(
    paymentTypes
      .filter((p) => p.type === "Bar")
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );

  return {
    full_amount: fullAmount,
    cash_amount: cashAmount,
    cash_amounts_by_currency: [{ currency_code: dsfinvkCurrencyCode, amount: cashAmount }],
    payment_types: paymentTypes,
  };
}
