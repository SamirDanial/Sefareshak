import { DsfinvkOrder, OrderLine, SubItem, DiscountSubItem } from "./types";
import { round2, getVatKeyFromRate, stableId } from "./helpers";
import { buildSubItems } from "./subitemsBuilder";
import { normalizeDealItems } from "./bundleDecomposer";

export function buildOrderLines(
  order: DsfinvkOrder,
  organizationId: string,
  isStorno: boolean = false
): OrderLine[] {
  const lines: OrderLine[] = [];
  const rawItems = Array.isArray(order?.orderItems) ? order.orderItems : [];
  console.log(`[DSFinV-K][DEBUG][linesBuilder] order=${order?.id} rawItems=${rawItems.length}, order.discountAmount=${order?.discountAmount}`);
  rawItems.forEach((it: any, i: number) => {
    console.log(`[DSFinV-K][DEBUG][linesBuilder]   rawItem[${i}] id=${it?.id} totalPrice=${it?.totalPrice} itemDiscountAmount=${it?.itemDiscountAmount} itemDiscountType=${it?.itemDiscountType} addons=${it?.orderItemAddOns?.length ?? 0}`);
  });
  const items = normalizeDealItems(rawItems).filter(
    (it) => String(it?.itemType || "").toUpperCase() !== "DEAL"
  );

  let pos = 0;
  let sum = 0;

  for (const it of items) {
    const qty = Number(it?.quantity || 0);

    const finalAmount = round2(it?.totalPrice || 0);

    if (!Number.isFinite(finalAmount) || Math.abs(finalAmount) < 0.0001) continue;

    pos++;

    const name =
      it?._bundleText ||
      String(it?.meal?.name || "").trim() ||
      String(it?.deal?.name || "").trim() ||
      String(it?.dealComponent?.name || "").trim() ||
      "Artikel";

    const size = it?._bundleText ? "" : String(it?.selectedSize || "").trim();
    const text = size ? `${name} (${size})` : name;

    const vatRate = Number(it?.taxPercentage || 0);

    const vatId = getVatKeyFromRate(vatRate);

    // Add item-level discount as a sub_item to populate itemamounts.csv
    const itemDiscount = round2(it?.itemDiscountAmount || 0);

    // Use pre-discount amount for parent line root properties
    const preDiscountAmount = itemDiscount > 0 ? round2(finalAmount + itemDiscount) : finalAmount;

    // VAT calculated on pre-discount amount for root line properties
    const net =
      vatRate > 0 ? round2(preDiscountAmount / (1 + vatRate / 100)) : preDiscountAmount;

    const vat = round2(preDiscountAmount - net);

    // VAT calculated on post-discount amount for business_case amounts
    const postDiscountNet =
      vatRate > 0 ? round2(finalAmount / (1 + vatRate / 100)) : finalAmount;

    const postDiscountVat = round2(finalAmount - postDiscountNet);

    const lineExportId =
      String(it?.id || stableId(`${organizationId}:${order?.id || "order"}:${pos}`));

    const subItems: (SubItem | DiscountSubItem)[] = buildSubItems(it);

    if (itemDiscount > 0) {
      const discountNet = vatRate > 0 ? round2(itemDiscount / (1 + vatRate / 100)) : itemDiscount;
      const discountVat = round2(itemDiscount - discountNet);
      console.log(`[DSFinV-K][LINES] Adding discount sub_item for line ${lineExportId}: discount=${itemDiscount}, net=${discountNet}, vat=${discountVat}`);
      subItems.push({
        sub_item_export_id: `${lineExportId}:sub:rabatt`,
        text: "Rabatt",
        line_item_amount_excl_vat: -discountNet,
        line_item_amount_incl_vat: -itemDiscount,
        amount_excl_vat: -discountNet,
        amount_incl_vat: -itemDiscount,
        business_case: {
          type: "Mehr-Mindererloese",
          name: "Rabatt",
          amounts_per_vat_id: [{
            vat_definition_export_id: vatId,
            excl_vat: -discountNet,
            vat: -discountVat,
            incl_vat: -itemDiscount,
          }],
        },
        item: {
          number: "DISCOUNT",
          quantity: 1,
          price_per_unit: -discountNet,
        },
      });
    }

    const lineAmountsPerVatId = [{
      vat_definition_export_id: vatId,
      excl_vat: postDiscountNet,
      vat: postDiscountVat,
      incl_vat: finalAmount,
    }];

    const isVoucherItem =
      (it as any)?.mealId === null &&
      (it as any)?.dealId === null &&
      (it as any)?.dealComponentId === null &&
      /Gutschein|Voucher|Single-Purpose|Multi-Purpose/i.test((it as any)?.specialInstructions || "");

    const specialInstructions = String((it as any)?.specialInstructions || "");
    const isSinglePurposeVoucher = specialInstructions.includes("TYPE: SINGLE_PURPOSE");
    const isMultiPurposeVoucher = isVoucherItem && vatRate === 0;

    const lineItem: OrderLine = {
      lineitem_export_id: lineExportId,
      text,
      storno: isStorno,
      line_item_amount_excl_vat: net,
      line_item_amount_incl_vat: preDiscountAmount,
      amount_excl_vat: net,
      amount_incl_vat: preDiscountAmount,

      business_case: {
        type: isSinglePurposeVoucher || isMultiPurposeVoucher ? "Anzahlung" : "Umsatz",
        name: isSinglePurposeVoucher || isMultiPurposeVoucher ? "Anzahlung" : "Umsatz",

        amounts_per_vat_id: lineAmountsPerVatId,
      },

      item: {
        number:
          String(it?.meal?.sku || "").trim() ||
          String(it?.deal?.sku || "").trim() ||
          String((it?.meal as any)?.id || "") ||
          String(it?.id || "ITEM"),

        quantity: qty || 1,
        price_per_unit: qty > 0 ? round2(preDiscountAmount / qty) : preDiscountAmount,
      },

      ...(subItems.length > 0 && {
        sub_items: subItems,
      }),

      ...(isVoucherItem && order?.voucherCodes?.[0] && {
        voucher_id: order.voucherCodes[0],
      }),
    };

    if (subItems.length > 0) {
      console.log(`[DSFinV-K][LINES] Line ${lineExportId} has ${subItems.length} sub_items:`, JSON.stringify(subItems, null, 2));
    }

    lines.push(lineItem);

    sum += finalAmount;
  }

  const serviceFee = round2(order?.takeawayServiceFee);
  if (Number.isFinite(serviceFee) && serviceFee > 0) {
    const serviceTaxRate = Number(order?.takeawayServiceTaxPercentage || 0);
    const serviceNet = serviceTaxRate > 0
      ? round2(serviceFee / (1 + serviceTaxRate / 100))
      : serviceFee;
    const serviceVat = round2(serviceFee - serviceNet);
    const serviceVatId = getVatKeyFromRate(serviceTaxRate);
    sum = round2(sum + serviceFee);

    lines.push({
      lineitem_export_id: stableId(`${organizationId}:${order?.id || "order"}:servicefee`),
      text: "Servicegebühr",
      storno: isStorno,
      line_item_amount_excl_vat: serviceNet,
      line_item_amount_incl_vat: serviceFee,
      amount_excl_vat: serviceNet,
      amount_incl_vat: serviceFee,
      business_case: {
        type: "Umsatz",
        name: "Umsatz",
        amounts_per_vat_id: [{ vat_definition_export_id: serviceVatId, excl_vat: serviceNet, vat: serviceVat, incl_vat: serviceFee }],
      },
      item: { number: "9999", quantity: 1, price_per_unit: serviceFee },
    });
  }

  const total = round2(order?.totalAmount || 0);

  // ✅ FIX 2: ONLY true rounding correction allowed
  const diff = round2(total - sum);

  if (Math.abs(diff) >= 0.01 && Math.abs(diff) <= 0.05) {
    lines.push({
      lineitem_export_id: stableId(
        `${organizationId}:${order?.id || "order"}:rounding`
      ),
      text: "Rundungsdifferenz",
      storno: isStorno,
      line_item_amount_excl_vat: diff,
      line_item_amount_incl_vat: diff,
      amount_excl_vat: diff,
      amount_incl_vat: diff,

      business_case: {
        type: "Umsatz",
        name: "Umsatz",
        amounts_per_vat_id: [
          {
            vat_definition_export_id: getVatKeyFromRate(0),
            excl_vat: diff,
            vat: 0,
            incl_vat: diff,
          },
        ],
      },

      item: {
        number: "ROUNDING",
        quantity: 1,
        price_per_unit: diff,
      },
    });
  }

  console.log(`[DSFinV-K][LINES] Built ${lines.length} lines for order ${order?.id || "unknown"}`);
  return lines;
}