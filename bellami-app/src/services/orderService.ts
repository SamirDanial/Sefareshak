import ApiService from "./apiService";

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
  // Get all orders with pagination and search
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

    const response = await apiService.get(`/api/admin/orders?${params}`, token);
    return response.data;
  },

  // Get single order by ID
  getOrderById: async (id: string, token?: string): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/orders/${id}`, token);
    return response.data;
  },

  // Update order
  updateOrder: async (
    id: string,
    data: OrderUpdateData,
    token?: string
  ): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/orders/${id}`,
      data,
      token
    );
    return response.data;
  },

  // Delete order
  deleteOrder: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/admin/orders/${id}`, token);
  },

  // Cancel order
  cancelOrder: async (id: string, cancellationReason: string, token?: string): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/orders/${id}`,
      { status: "CANCELLED", cancellationReason },
      token
    );
    return response.data;
  },
};
