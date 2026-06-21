import { OrderStatus, OrderType } from "@prisma/client";

// Validate status transitions based on order type
export function validateOrderTypeTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  orderType: OrderType
): boolean {
  // Prevent pickup orders from entering delivery-only states
  if (orderType === "PICKUP") {
    if (newStatus === "OUT_FOR_DELIVERY" || newStatus === "DELIVERED") {
      return false;
    }
  }

  // Prevent delivery orders from entering pickup-only states
  if (orderType === "DELIVERY") {
    if (newStatus === "READY_FOR_PICKUP" || newStatus === "PICKED_UP") {
      return false;
    }
  }

  // Allow transition otherwise (business rules can be expanded here)
  return true;
}





