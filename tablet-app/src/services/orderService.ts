import ApiService from "@/src/services/apiService";

export interface OrderUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
}

export interface OrderItemAddOn {
  id: string;
  addOnName: string;
  addOnPrice: number;
  addon_type?: "BOOLEAN" | "QUANTITY";
  quantity: number;
  taxAmount?: number;
  taxPercentage?: number;
  addon_description?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  mealId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxAmount?: number;
  taxPercentage?: number;
  selectedSize?: string;
  itemDiscountType?: "FIXED" | "PERCENTAGE" | null;
  itemDiscountValue?: number | null;
  itemDiscountAmount?: number;
  itemDiscountScope?: "PER_LINE" | "PER_UNIT";
  itemSurchargeAmount?: number;
  itemSurchargeScope?: "PER_LINE" | "PER_UNIT";
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
  meal: {
    id: string;
    name: string;
    basePrice: number;
    image?: string;
    description?: string;
  };
  orderItemAddOns: OrderItemAddOn[];
}

export interface Order {
  id: string;
  orderNumber: string;
  deliveryLinkToken?: string;
  userId?: string;
  isMerged?: boolean;
  isPosOrder?: boolean;
  isNotSynced?: boolean;
  mergedAt?: string | null;
  confirmedAt?: string | null;
  preparationTime?: number | null;
  orderType: "DELIVERY" | "PICKUP";
  status:
    | "PENDING"
    | "CONFIRMED"
    | "PREPARING"
    | "READY_FOR_DELIVERY"
    | "READY_FOR_PICKUP"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "PICKED_UP"
    | "CANCELLED";
  totalAmount: number;
  currency: string;
  deliveryFee: number;
  taxAmount: number;
  itemTaxAmount?: number;
  addonTaxAmount?: number;
  deliveryTaxAmount?: number;
  takeawayServiceFee?: number;
  takeawayServiceTaxAmount?: number;
  takeawayServiceTaxPercentage?: number;
  taxInclusive?: boolean;
  discountType?: "FIXED" | "PERCENTAGE" | null;
  discountValue?: number | null;
  discountAmount?: number;
  voucherPaymentAmount?: number;
  voucherCodes?: string[];
  voucherRemainingBalances?: Record<string, number>;
  paymentMethod: "CASH_ON_DELIVERY" | "CARD_ON_DELIVERY" | "ONLINE_PAYMENT";
  paymentStatus:
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "REFUNDED"
    | "PARTIALLY_REFUNDED";
  paymentIntentId?: string;
  deliveryAddress?: string;
  deliveryStreetAddress?: string;
  deliveryHouseNumber?: string;
  deliveryPostalCode?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  pickupPhone?: string;
  pickupNotes?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  branch?: {
    id: string;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  scheduledDate?: string | null;
  isScheduledOrder?: boolean;
  businessDaySession?: {
    id?: string;
    status?: "OPEN" | "CLOSED" | string;
  } | null;
  createdAt: string;
  updatedAt: string;
  user?: OrderUser;
  orderItems: OrderItem[];
  cancellationReason?: string | null;
  refunds?: Array<{
    id: string;
    refundType: "FULL" | "PARTIAL" | "ITEM_SPECIFIC";
    amount: number;
    reason?: string | null;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";
    stripeRefundId?: string | null;
    paypalRefundId?: string | null;
    refundedBy: string;
    refundedAt?: string | null;
    createdAt: string;
    items?: Array<{
      orderItemId: string;
      refundAmount: number;
      refundedQuantity?: number;
      reason?: string;
    }>;
  }>;
  history?: Array<{
    type: string;
    action: string;
    userId?: string;
    details?: {
      reason?: string;
      [key: string]: any;
    };
    timestamp: string;
  }> | null;
  _count?: {
    orderItems: number;
  };
}

export type FiskalySignaturePayload = {
  provider?: string;
  mode?: string;
  clientTransactionId?: string;
  tssTransactionId?: string;
  signatureCounter?: number;
  receiptNumber?: string | null;
  receiptDate?: string;
  amount?: number;
  currency?: string;
  signature?: string;
  meta?: Record<string, any>;
} | null;

export type OrderReceiptPayload = {
  order: Order;
  fiskaly: null | {
    status?: string;
    signaturePayload?: FiskalySignaturePayload;
  };
  fiskalyCorrections?: Array<{
    id: string;
    type?: string;
    status?: string;
    refundId?: string | null;
    amount?: number | string;
    currency?: string | null;
    signaturePayload?: any;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt?: string;
  }>;
};

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface OrderUpdateData {
  status?:
    | "PENDING"
    | "CONFIRMED"
    | "PREPARING"
    | "READY_FOR_DELIVERY"
    | "READY_FOR_PICKUP"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "PICKED_UP"
    | "CANCELLED";
  paymentStatus?:
    | "PENDING"
    | "PAID"
    | "FAILED"
    | "REFUNDED"
    | "PARTIALLY_REFUNDED";
  deliveryNotes?: string;
  preparationTime?: number;
  cancellationReason?: string;
}

export const orderService = {
  getOrders: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    status: string = "",
    paymentStatus: string = "",
    paymentMethod: string = "",
    startDate?: string,
    endDate?: string,
    branchId?: string,
    orderType?: "DELIVERY" | "PICKUP" | "",
    isScheduled?: "all" | "scheduled" | "asap",
    businessDayStatus?: "" | "OPEN" | "CLOSED",
    scheduledScope?: "all" | "upcoming",
    isPosOrder?: "all" | "pos" | "online",
    token?: string
  ): Promise<OrdersResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });

    if (status) params.append("status", status);
    if (paymentStatus) params.append("paymentStatus", paymentStatus);
    if (paymentMethod) params.append("paymentMethod", paymentMethod);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (branchId) params.append("branchId", branchId);
    if (orderType) params.append("orderType", orderType);
    if (isScheduled && isScheduled !== "all") params.append("isScheduled", isScheduled);
    if (businessDayStatus) params.append("businessDayStatus", businessDayStatus);
    if (scheduledScope && scheduledScope !== "all") params.append("scheduledScope", scheduledScope);
    if (isPosOrder && isPosOrder !== "all") {
      params.append("isPosOrder", isPosOrder === "pos" ? "true" : "false");
    }

    const response = await apiService.get(`/api/admin/orders?${params}`, token);
    return (response as any).data;
  },

  getOrderById: async (id: string, token?: string): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/orders/${id}`, token);
    return (response as any).data;
  },

  getOrderReceiptPayload: async (id: string, token?: string): Promise<OrderReceiptPayload> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/order/${id}/receipt`, token);
    return (response as any).data;
  },

  getRefundReceiptPayload: async (refundId: string, token?: string): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/order/refund/${refundId}/receipt`, token);
    return (response as any).data;
  },

  updateOrder: async (
    id: string,
    data: OrderUpdateData,
    token?: string
  ): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/admin/orders/${id}`, data, token);
    return (response as any).data;
  },

  deleteOrder: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/admin/orders/${id}`, token);
  },

  cancelOrder: async (id: string, cancellationReason: string, token?: string): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/orders/${id}`,
      { status: "CANCELLED", cancellationReason },
      token
    );
    return (response as any).data;
  },
};
