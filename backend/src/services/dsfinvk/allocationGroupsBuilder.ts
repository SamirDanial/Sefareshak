import { DsfinvkOrder } from "./types";

/**
 * allocation_groups.csv
 *
 * Determines the DSFinV-K Abrechnungskreis (allocation group) for a given order.
 * Each transaction head references one or more allocation groups.
 */
export function getAllocationGroup(order: DsfinvkOrder): string {
  const orderType = String((order as any)?.orderType || "").toUpperCase();
  const isPosOrder = Boolean((order as any)?.isPosOrder);

  if (isPosOrder) return "DineIn";
  if (orderType === "PICKUP") return "Pickup";
  if (orderType === "DELIVERY") return "Delivery";
  return "Standard";
}
