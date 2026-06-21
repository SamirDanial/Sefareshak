import { DsfinvkOrderItem, SubItem, DiscountSubItem } from "./types";
import { round2, getVatKeyFromRate } from "./helpers";

/**
 * ⚠️ INFORMATIONAL ONLY - NO FINANCIAL IMPACT ⚠️
 *
 * Sub-items must NEVER affect parent line financials.
 * Parent item.totalPrice is the canonical source of truth.
 *
 * SCENARIO A - Embedded Add-ons (Current Design):
 *   - Add-on price is ALREADY BAKED INTO parent item.totalPrice
 *   - Sub-item shows price_per_unit for transparency/audit trail
 *   - Parent financials calculated from item.totalPrice ONLY
 *
 * SCENARIO B - Charged Add-ons (Future - Must be Separate Line):
 *   - If add-on is charged ON TOP of base price dynamically at checkout
 *   - MUST NOT be nested in sub_items
 *   - MUST be promoted to separate ROOT LINE with:
 *     * Unique lineitem_export_id
 *     * Complete business_case block
 *     * Own price_per_unit and VAT calculations
 *
 * SAFETY RULES:
 * 1. Sub-item prices are for display/transparency only
 * 2. NEVER sum sub-items into parent amounts
 * 3. NEVER use sub-item VAT in parent VAT aggregation
 * 4. Parent totalPrice is the SOLE source for all financial calculations
 */
export function buildSubItems(item: DsfinvkOrderItem): SubItem[] {
  const subItems: SubItem[] = [];

  for (const ao of item.orderItemAddOns || []) {
    const qty = Number(ao?.quantity || 1);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const vatRate = Number(ao?.taxPercentage || 0);
    const vatKey = getVatKeyFromRate(vatRate);

    /**
     * Normalize unit price safely
     */
    const unitPriceRaw = Number(ao?.addOnPrice || 0);
    const unitPrice = round2(unitPriceRaw);

    if (!Number.isFinite(unitPrice)) continue;

    /**
     * DSFinV-K consistent VAT split for INFORMATIONAL DISPLAY ONLY
     * ⚠️ This VAT breakdown is for transparency/audit trail - NEVER aggregate into parent ⚠️
     * Parent financials use item.totalPrice only, which already includes this add-on
     */
    const incl_vat = unitPrice;

    const excl_vat =
      vatRate > 0
        ? round2(incl_vat / (1 + vatRate / 100))
        : incl_vat;

    const vat = round2(incl_vat - excl_vat);

    subItems.push({
      number:
        String(ao?.addon?.sku || "").trim() ||
        String(ao?.addon_id || "").trim() ||
        String(ao?.addOnName || "").substring(0, 20).trim() ||
        String((ao as any)?.id || "ADDON"),

      name: String(ao?.addOnName || "Zusatz"),

      quantity: qty,
      quantity_factor: 1,
      quantity_measure: "STK",

      price_per_unit: unitPrice,

      amount_per_vat_id: {
        vat_definition_export_id: vatKey,
        excl_vat,
        vat,
        incl_vat,
      },
    });
  }

  // ⚠️ DEV ASSERTION: Sub-items must never exceed parent total (would indicate double-counting) ⚠️
  if (process.env.NODE_ENV === 'development') {
    const subItemsTotal = subItems.reduce((sum, si) => sum + (si.price_per_unit * si.quantity), 0);
    const parentTotal = Number(item?.totalPrice || 0);
    // Sub-items can equal parent total (all add-ons) but must not exceed it
    if (subItemsTotal > parentTotal + 0.01) {
      console.error(
        `[DSFinV-K] CRITICAL: Sub-items total (${subItemsTotal}) exceeds parent total (${parentTotal}). ` +
        `This indicates double-counting. Sub-items must be informational only.`
      );
    }
  }

  return subItems;
}