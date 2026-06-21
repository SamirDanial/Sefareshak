import { DsfinvkOrder, DsfinvkCorrection, TransactionRow } from "./types";
import { round2, dsfinvkPaymentTypeFromPaymentMethod, dsfinvkPaymentTypeFromVoucher, getPaymentTypeName, getCurrencyCode, stableId } from "./helpers";
import { getAllocationGroup } from "./allocationGroupsBuilder";
import { buildOrderLines } from "./linesBuilder";
import { buildPriceFindingForOrder } from "./itemAmountsBuilder";
import { aggregateOrderVatByRate } from "./vatBuilder";
import { aggregateCorrectionVatForTx } from "./transactionsVatBuilder";
import { buildCorrectionReferences } from "./referencesBuilder";
import { buildTransactionSecurity, extractTssTxId } from "./transactionsTseBuilder";

/**
 * transactions.csv
 *
 * Builds TransactionRow entries for normal order transactions.
 */
export function buildOrderTransactions(
  orders: DsfinvkOrder[],
  organizationId: string,
  cashRegisterId: string
): TransactionRow[] {
  return orders.map((o, idx) => {
    const signaturePayload = o?.fiscalTransaction?.signaturePayload || null;
    const { rawTxId, signMode, hasSignDeResponse } = extractTssTxId(signaturePayload);

    if (rawTxId && !(rawTxId && signMode === "live" && hasSignDeResponse)) {
      console.warn(
        `[DSFinV-K] Stripping tss_tx_id for order ${o.id}: mode=${signMode}, hasResponse=${hasSignDeResponse} — using error_message instead`
      );
    }

    const transactionExportId = String(o.id);
    // Extract numeric portion from alphanumeric order numbers (e.g., "POS-1779009932687-0WJB39" -> 1779009932687)
    const rawOrderNumber = String(o.orderNumber || "");
    const numericMatch = rawOrderNumber.match(/\d+/);
    let number = numericMatch ? parseInt(numericMatch[0], 10) : (idx + 1);

    // Ensure within 32-bit signed integer range (max 2147483647) per Fiskaly schema
    const MAX_INT32 = 2147483647;
    if (number > MAX_INT32) {
      number = number % MAX_INT32;
      if (number === 0) number = MAX_INT32;
    }
    const createdAt = new Date(o.postedAt || o.createdAt || Date.now());
    const ts = Math.floor(createdAt.getTime() / 1000);
    const storno = String(o.status || "").toUpperCase() === "CANCELLED";
    const allocationGroup = getAllocationGroup(o);
    const tssTxId = rawTxId && signMode === "live" && hasSignDeResponse ? rawTxId : "";

    const vatAmounts = aggregateOrderVatByRate(o);
    const derivedTotal = round2(vatAmounts.reduce((s, v) => s + v.incl_vat, 0));
    const txAmountsPerVatId = vatAmounts.map((v) => ({
      vat_definition_export_id: Number(v.vat_id),
      excl_vat: v.excl_vat,
      vat: v.vat,
      incl_vat: v.incl_vat,
    }));

    // Determine payment types
    const voucherAmount = round2(Number(o?.voucherPaymentAmount || 0));
    const hasVoucher = voucherAmount > 0;
    const regularPaymentAmount = derivedTotal - voucherAmount;

    const paymentTypes: any[] = [];

    // Add voucher payment if present (treated as Unbar/non-cash per DSFinV-K schema)
    if (hasVoucher) {
      paymentTypes.push({
        type: "Unbar",
        name: "Gutschein",
        currency_code: "EUR",
        amount: voucherAmount,
        ...(o?.voucherCodes?.[0] && { voucher_id: o.voucherCodes[0] }),
      });
    }

    // Add regular payment method if there's remaining amount or no voucher
    if (regularPaymentAmount > 0 || !hasVoucher) {
      const regularAmount = hasVoucher ? regularPaymentAmount : derivedTotal;
      paymentTypes.push({
        type: dsfinvkPaymentTypeFromPaymentMethod(o?.paymentMethod),
        name: getPaymentTypeName(dsfinvkPaymentTypeFromPaymentMethod(o?.paymentMethod)),
        currency_code: "EUR",
        amount: regularAmount,
      });
    }

    const priceFindings = buildPriceFindingForOrder(o);
    const lines = buildOrderLines(o, organizationId, storno).map((line: any) => {
      const priceFinding = priceFindings.get(String(line?.lineitem_export_id || ""));
      const itemSubItems = (line?.sub_items || []).filter((si: any) => typeof si.number === "string");

      const fallbackBaseAmounts = (line?.business_case?.amounts_per_vat_id || []).map((amt: any) => ({
        vat_definition_export_id: amt.vat_definition_export_id,
        excl_vat: amt.excl_vat,
        vat: amt.vat,
        incl_vat: amt.incl_vat,
      }));

      const item = {
        ...(line.item || {}),
        ...(itemSubItems.length ? { sub_items: itemSubItems } : {}),
        base_amounts_per_vat_id: priceFinding ? priceFinding.base_amounts_per_vat_id : fallbackBaseAmounts,
        ...(priceFinding?.discounts_per_vat_id ? { discounts_per_vat_id: priceFinding.discounts_per_vat_id } : {}),
        ...(priceFinding?.extra_amounts_per_vat_id ? { extra_amounts_per_vat_id: priceFinding.extra_amounts_per_vat_id } : {}),
      };
      return {
        ...line,
        item,
        ...(priceFinding ? { price_findings: priceFinding } : {}),
      };
    });

    return {
      head: {
        tx_id: tssTxId || stableId(`${organizationId}:${o.id}`),
        transaction_export_id: transactionExportId,
        closing_client_id: cashRegisterId,
        type: "Beleg",
        storno,
        number,
        timestamp_start: ts,
        timestamp_end: ts,
        allocation_groups: [allocationGroup],
      },
      data: {
        full_amount_incl_vat: derivedTotal,
        amounts_per_vat_id: txAmountsPerVatId,
        lines: lines,
        payment_types: paymentTypes,
      },
      security: buildTransactionSecurity({
        rawTxId,
        signMode,
        hasSignDeResponse,
        errorMessage: String(
          o?.fiscalTransaction?.errorMessage ||
            (signMode === "test"
              ? "Transaction signed in test mode (not in SIGN DE)"
              : "Missing Fiskaly signature for order")
        ),
      }),
    };
  });
}

/**
 * transactions.csv (correction rows)
 *
 * Builds TransactionRow entries for fiscal correction transactions (Storno/Gutschrift).
 */
export function buildCorrectionTransactions(
  corrections: DsfinvkCorrection[],
  organizationId: string,
  cashRegisterId: string,
  originalTxIdByOrderId: Map<string, string> = new Map(),
  orderById: Map<string, DsfinvkOrder> = new Map()
): TransactionRow[] {
  return corrections.map((c, idx) => {
    const signaturePayload = c?.signaturePayload || null;
    const { rawTxId, signMode, hasSignDeResponse } = extractTssTxId(signaturePayload);

    if (rawTxId && !(rawTxId && signMode === "live" && hasSignDeResponse)) {
      console.warn(
        `[DSFinV-K] Stripping tss_tx_id for correction ${c.id}: mode=${signMode}, hasResponse=${hasSignDeResponse} — using error_message instead`
      );
    }

    const transactionExportId = String(c.id);
    const number = 10_000_000 + idx + 1;
    const createdAt = new Date(c.createdAt || Date.now());
    const ts = Math.floor(createdAt.getTime() / 1000);
    const tssTxId = rawTxId && signMode === "live" && hasSignDeResponse ? rawTxId : "";

    const amountCandidates = [
      (signaturePayload as any)?.process_data?.amount,
      (signaturePayload as any)?.processData?.amount,
      (signaturePayload as any)?.response?.process_data?.amount,
      (signaturePayload as any)?.response?.processData?.amount,
      (signaturePayload as any)?.amount,
    ];
    const parsed = Number(amountCandidates.find((a) => a !== undefined && a !== null && a !== ""));
    const signedAmount = Number.isFinite(parsed) ? parsed : -Math.abs(Number(c.amount || 0));

    const businessCaseName = "Umsatz";
    const references = buildCorrectionReferences(
      c,
      c?.orderId ? originalTxIdByOrderId.get(String(c.orderId)) : null
    );

    // Fetch original order to get payment split details
    const originalOrder = c?.orderId ? orderById.get(String(c.orderId)) : null;
    const voucherAmount = round2(Number((originalOrder as any)?.voucherPaymentAmount || 0));
    const totalAmount = round2(Number((originalOrder as any)?.totalAmount || 0));
    const nonVoucherAmount = totalAmount - voucherAmount;
    const refundAmount = Math.abs(round2(signedAmount));
    const refundRatio = totalAmount > 0 ? refundAmount / totalAmount : 1;

    const paymentTypes: any[] = [];

    // Add voucher refund if present in original
    if (voucherAmount > 0) {
      const voucherRefund = round2(voucherAmount * refundRatio);
      paymentTypes.push({
        type: "Unbar",
        name: "Gutschein",
        currency_code: "EUR",
        amount: -Math.abs(voucherRefund),
        ...(originalOrder?.voucherCodes?.[0] && { voucher_id: originalOrder.voucherCodes[0] }),
      });
    }

    // Add regular payment method refund if present in original
    if (nonVoucherAmount > 0) {
      const regularRefund = round2(nonVoucherAmount * refundRatio);
      const pm = dsfinvkPaymentTypeFromPaymentMethod((originalOrder as any)?.paymentMethod);
      paymentTypes.push({
        type: pm,
        name: getPaymentTypeName(pm),
        currency_code: "EUR",
        amount: -Math.abs(regularRefund),
      });
    }

    // Fallback to get payment method from correction signature payload if no payment split data available
    if (paymentTypes.length === 0) {
      const pmCandidate =
        (signaturePayload as any)?.process_data?.meta?.paymentMethod ||
        (signaturePayload as any)?.processData?.meta?.paymentMethod ||
        (signaturePayload as any)?.response?.process_data?.meta?.paymentMethod ||
        (signaturePayload as any)?.response?.processData?.meta?.paymentMethod ||
        null;
      const pm = dsfinvkPaymentTypeFromPaymentMethod(pmCandidate);
      paymentTypes.push({
        type: pm,
        name: getPaymentTypeName(pm),
        currency_code: "EUR",
        amount: round2(signedAmount),
      });
    }

    return {
      head: {
        tx_id: tssTxId || stableId(`${organizationId}:${c.id}`),
        transaction_export_id: transactionExportId,
        closing_client_id: cashRegisterId,
        type: "Beleg",
        storno: true,
        number,
        timestamp_start: ts,
        timestamp_end: ts,
        allocation_groups: ["Korrektur"],
        ...(references.length > 0 ? { references } : {}),
      },
      data: {
        full_amount_incl_vat: round2(signedAmount),
        amounts_per_vat_id: aggregateCorrectionVatForTx(c).map((v) => ({
          vat_definition_export_id: v.vat_id,
          excl_vat: v.excl_vat,
          vat: v.vat,
          incl_vat: v.incl_vat,
        })),
        lines: [
          {
            lineitem_export_id: stableId(`${organizationId}:${c.id}:line:1`),
            text: String((c as any)?.type || "Korrektur"),
            storno: true,
            line_item_amount_excl_vat: round2(signedAmount / 1.19),
            line_item_amount_incl_vat: round2(signedAmount),
            amount_excl_vat: round2(signedAmount / 1.19),
            amount_incl_vat: round2(signedAmount),
            business_case: {
              type: businessCaseName,
              name: businessCaseName,
              amounts_per_vat_id: [
                {
                  vat_definition_export_id: 1,
                  excl_vat: round2(Math.abs(Number(signedAmount || 0)) / 1.19),
                  vat: round2(
                    Math.abs(Number(signedAmount || 0)) -
                      Math.abs(Number(signedAmount || 0)) / 1.19
                  ),
                  incl_vat: Math.abs(round2(Number(signedAmount || 0))),
                },
              ],
            },
            item: {
              number: "STORNO",
              quantity: 1,
              price_per_unit: round2(signedAmount),
            },
          },
        ],
        payment_types: paymentTypes,
      },
      security: buildTransactionSecurity({
        rawTxId,
        signMode,
        hasSignDeResponse,
        errorMessage: String(
          c?.errorMessage ||
            (signMode === "test"
              ? "Transaction signed in test mode (not in SIGN DE)"
              : "Missing Fiskaly signature for correction")
        ),
      }),
    };
  });
}
