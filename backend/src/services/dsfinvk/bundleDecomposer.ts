import { DsfinvkOrderItem } from "./types";
import { toCents, fromCents, round2 } from "./helpers";

/**
 * Bundle Decomposition for DSFinV-K compliance.
 *
 * When a DEAL order item (parent) contains DEAL_COMPONENT children:
 *  - The parent is suppressed (zero lines emitted for it).
 *  - Each child is converted into a synthetic item whose `totalPrice` carries its
 *    proportional share of the flat bundle selling price.
 *  - `_bundleStandalonePrice` retains the original standalone price for use as
 *    `price_per_unit` / base_amounts in the audit trail.
 *  - `_bundleText` = "[Deal Name] - [Component Name]" for line labels.
 *  - `itemDiscountAmount` = standalone - allocated, so existing buildPriceFindingForItem
 *    renders discounts_per_vat_id automatically.
 *
 * Rounding safety: remainder pennies are distributed per-VAT-rate-group, assigned
 * to the component with the highest standalone value within each group — this prevents
 * cross-VAT-bucket contamination that would corrupt net = gross / (1 + rate/100).
 */
export function normalizeDealItems(
  items: DsfinvkOrderItem[]
): DsfinvkOrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return items;

  const dealParents = new Map<string, DsfinvkOrderItem>();
  const childrenByParent = new Map<string, DsfinvkOrderItem[]>();
  const standaloneItems: DsfinvkOrderItem[] = [];

  for (const item of items) {
    const type = String(item.itemType || "").toUpperCase();
    const parentId = item.parentDealItemId;

    if (type === "DEAL") {
      dealParents.set(String(item.id || ""), item);
    } else if (type === "DEAL_COMPONENT" && parentId) {
      const list = childrenByParent.get(parentId) ?? [];
      list.push(item);
      childrenByParent.set(parentId, list);
    } else if (type !== "DEAL_COMPONENT") {
      standaloneItems.push(item);
    }
  }

  const decomposedItems: DsfinvkOrderItem[] = [];

  for (const [parentId, parent] of dealParents) {
    const children = childrenByParent.get(parentId);

    if (!children || children.length === 0) {
      console.warn(`[DSFinV-K bundleDecomposer] DEAL parent ${parentId} has no DEAL_COMPONENT children — emitting as standalone`);
      standaloneItems.push(parent);
      continue;
    }

    const bundlePriceCents = toCents(parent.totalPrice || 0);
    const dealName = String(parent.deal?.name || "").trim();

    const standaloneCents = children.map((c) => toCents(c.totalPrice || 0));
    const standaloneSumCents = standaloneCents.reduce((s, v) => s + v, 0);

    if (standaloneSumCents <= 0) {
      standaloneItems.push(parent);
      children.forEach((c) => standaloneItems.push(c));
      continue;
    }

    const allocatedCents: number[] = standaloneCents.map((sc) =>
      Math.round((sc / standaloneSumCents) * bundlePriceCents)
    );

    const allocatedSum = allocatedCents.reduce((s, v) => s + v, 0);
    const remainder = bundlePriceCents - allocatedSum;

    if (remainder !== 0) {
      const vatGroups = new Map<string, { idx: number; standaloneCents: number }>();
      children.forEach((child, idx) => {
        const rate = String(Number(child.taxPercentage || 0));
        const existing = vatGroups.get(rate);
        if (!existing || standaloneCents[idx] > existing.standaloneCents) {
          vatGroups.set(rate, { idx, standaloneCents: standaloneCents[idx] });
        }
      });

      const rateGroups = Array.from(vatGroups.entries());
      let leftover = remainder;
      for (let i = 0; i < rateGroups.length && leftover !== 0; i++) {
        const { idx } = rateGroups[i][1];
        const sign = leftover > 0 ? 1 : -1;
        allocatedCents[idx] += sign;
        leftover -= sign;
      }
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const componentName = String(child.dealComponent?.name || "").trim();
      const bundleText = dealName
        ? componentName
          ? `${dealName} - ${componentName}`
          : dealName
        : componentName || "Bundle";

      const allocated = fromCents(allocatedCents[i]);
      const standalone = fromCents(standaloneCents[i]);
      const discountShare = round2(standalone - allocated);

      decomposedItems.push({
        ...child,
        totalPrice: allocated,
        unitPrice: standalone,
        itemDiscountAmount: discountShare > 0 ? discountShare : 0,
        itemSurchargeAmount: 0,
        _bundleText: bundleText,
        _bundleStandalonePrice: standalone,
      });
    }
  }

  const orphanComponents: DsfinvkOrderItem[] = [];
  for (const [parentId, children] of childrenByParent) {
    if (!dealParents.has(parentId)) {
      orphanComponents.push(...children);
    }
  }

  return [...standaloneItems, ...orphanComponents, ...decomposedItems];
}
