import ApiService from "@/src/services/apiService";
import type { Order } from "@/src/services/orderService";

export type PosServiceMode = "COUNTER_TAKEAWAY" | "DINE_IN";
export type PosPaymentMethod = "CASH" | "CARD";
export type PosPaymentStatus = "PENDING" | "PAID";

export type PosCartAddon = {
  id: string;
  name: string;
  price?: number;
  quantity?: number;
  type?: "BOOLEAN" | "QUANTITY";
  description?: string | null;
  sizeType?: "S" | "M" | "L" | "XL";
};

export type PosCartOptionalIngredient = {
  id: string;
  name: string;
  isIncluded?: boolean;
};

export type PosCartItem = {
  id: string;
  mealId: string;
  name: string;
  quantity: number;
  price: number;
  size?: string;
  mealSizeType?: "S" | "M" | "L" | "XL";
  mealSizePrice?: number;
  specialInstructions?: string;
  addOns?: PosCartAddon[];
  optionalIngredients?: PosCartOptionalIngredient[];
  itemDiscountType?: "FIXED" | "PERCENTAGE" | null;
  itemDiscountValue?: number | null;
  itemDiscountScope?: "PER_UNIT" | "PER_LINE";
  itemSurchargeAmount?: number | null;
  itemSurchargeScope?: "PER_UNIT" | "PER_LINE";
};

export type CreatePosOrderInput = {
  branchId: string;
  cartItems: PosCartItem[];
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  paymentMethod: PosPaymentMethod;
  paymentStatus: PosPaymentStatus;
  serviceMode: PosServiceMode;
  tableId?: string;
  tableNumber?: string;
  ticketName?: string;
  notes?: string;
  sendToKitchen?: boolean;
  discountType?: "FIXED" | "PERCENTAGE" | null;
  discountValue?: number | null;
  appliedVoucher?: { voucherCode: string; amount: number; type: string; remainingBalance?: number } | null;
};

export const posOrderService = {
  async createPosOrder(input: CreatePosOrderInput, token?: string): Promise<{ order: Order; orderNumber: string }> {
    const api = ApiService.getInstance();
    const response = await api.post("/api/order/pos", input, token);
    return (response as any).data as { order: Order; orderNumber: string };
  },
};
