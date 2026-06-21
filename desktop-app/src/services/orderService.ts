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
  addon_type: "BOOLEAN" | "QUANTITY";
  quantity: number;
  taxAmount?: number;
  taxPercentage?: number;
  addon_description?: string;
  addon_id?: string;
  addon?: {
    id: string;
    image?: string | null;
  };
}

export interface OrderItemOptionalIngredient {
  id: string;
  optionalIngredientId: string;
  isIncluded: boolean;
  ingredientName: string;
  optionalIngredient?: {
    id: string;
    name: string;
    description: string | null;
  };
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
    isDrink?: boolean;
  };
  orderItemAddOns?: OrderItemAddOn[];
  orderItemOptionalIngredients?: OrderItemOptionalIngredient[];
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
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
  subtotalAmount?: number;
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
  orderType?: "DELIVERY" | "PICKUP";
  preparationTime?: number;
  confirmedAt?: string;
  deliveryAddress?: string;
  deliveryBuilding?: string;
  deliveryFloor?: string;
  deliveryApartment?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  pickupPhone?: string;
  pickupNotes?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  cancellationReason?: string;
  businessDaySession?: {
    id: string;
    status: "OPEN" | "CLOSED";
    startedAt: string;
    endedAt?: string | null;
  } | null;
  // Scheduled/Future Order fields
  scheduledDate?: string | null;
  isScheduledOrder?: boolean;
  createdAt: string;
  updatedAt: string;
  user?: OrderUser;
  branch?: {
    id: string;
    name: string;
    address?: string | null;
  } | null;
  orderItems: OrderItem[];
  _count?: {
    orderItems: number;
  };
}

export interface OrdersResponse {
  orders: Order[];
  queueCounts?: {
    asap: number;
    scheduled: number;
  };
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
    highlightOrder?: string,
    orderType?: "DELIVERY" | "PICKUP",
    isScheduled?: "all" | "scheduled" | "asap",
    scheduledScope?: "upcoming" | "all",
    businessDayStatus?: "" | "OPEN" | "CLOSED",
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
    if (highlightOrder) params.append("highlightOrder", highlightOrder);
    if (orderType) params.append("orderType", orderType);
    if (isScheduled && isScheduled !== "all") params.append("isScheduled", isScheduled);
    if (scheduledScope && scheduledScope !== "all") params.append("scheduledScope", scheduledScope);
    if (businessDayStatus) params.append("businessDayStatus", businessDayStatus);

    const response = await apiService.get(`/api/admin/orders?${params}`, token);
    return response.data;
  },

  getDispatchOrders: async (
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
    highlightOrder?: string,
    orderType?: "DELIVERY" | "PICKUP",
    isScheduled?: "all" | "scheduled" | "asap",
    businessDayStatus?: "" | "OPEN" | "CLOSED",
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
    if (highlightOrder) params.append("highlightOrder", highlightOrder);
    if (orderType) params.append("orderType", orderType);
    if (isScheduled && isScheduled !== "all") params.append("isScheduled", isScheduled);
    if (businessDayStatus) params.append("businessDayStatus", businessDayStatus);

    const response = await apiService.get(`/api/admin/orders/dispatch?${params}`, token);
    return response.data;
  },

  // Get single order by ID
  getOrderById: async (id: string, token?: string): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/orders/${id}`, token);
    return response.data || response;
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

  // Update order status
  updateOrderStatus: async (
    id: string,
    status: Order["status"],
    token?: string
  ): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/orders/${id}`,
      { status },
      token
    );
    return response.data;
  },

  // Update payment status
  updatePaymentStatus: async (
    id: string,
    paymentStatus: Order["paymentStatus"],
    token?: string
  ): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/orders/${id}`,
      { paymentStatus },
      token
    );
    return response.data;
  },

  // Cancel order
  cancelOrder: async (id: string, reason?: string, token?: string): Promise<Order> => {
    const apiService = ApiService.getInstance();
    const body: Record<string, any> = { status: "CANCELLED" };
    if (reason && reason.trim()) {
      body.cancellationReason = reason.trim();
    }
    const response = await apiService.put(
      `/api/admin/orders/${id}`,
      body,
      token
    );
    return response.data;
  },
};
