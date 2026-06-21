import ApiService from "./apiService";

export interface NotificationOrderUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
}

export interface NotificationOrderItem {
  id: string;
  mealId?: string;
  dealId?: string;
  itemType?: string;
  quantity: number;
  meal: {
    id: string;
    name: string;
    basePrice: number;
    image?: string;
  } | null;
  deal?: {
    id: string;
    name: string;
    image?: string | null;
  } | null;
}

export interface NotificationOrder {
  id: string;
  orderNumber: string;
  userId?: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  user?: NotificationOrderUser;
  branch?: {
    id: string;
    name: string;
  } | null;
  orderItems: NotificationOrderItem[];
}

export interface NotificationReservation {
  id: string;
  reservationNumber: string;
  userId?: string;
  status: string;
  type: string;
  reservationDate: string;
  numberOfGuests: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  createdAt: string;
  user?: NotificationOrderUser;
}

export interface NotificationItem {
  id: string;
  orderId?: string | null;
  reservationId?: string | null;
  type: "ORDER" | "RESERVATION";
  isSeen: boolean;
  isOrderUpdate: boolean;
  seenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: NotificationOrder;
  reservation?: NotificationReservation;
}

export interface NotificationsResponse {
  success: boolean;
  data: NotificationItem[];
}

export interface PaginatedNotificationsResponse {
  success: boolean;
  data: {
    notifications: NotificationItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

export const notificationService = {
  // Get all unseen notifications
  getUnseenNotifications: async (
    token?: string
  ): Promise<NotificationItem[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/notifications/unseen", token);
    return response.data;
  },

  // Get all notifications with pagination
  getNotifications: async (
    page: number = 1,
    limit: number = 10,
    token?: string
  ): Promise<PaginatedNotificationsResponse["data"]> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    const response = await apiService.get(
      `/api/notifications?${params}`,
      token
    );
    return response.data;
  },

  // Mark notification as seen by notificationId
  markAsSeen: async (notificationId: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.patch(`/api/notifications/${notificationId}/seen`, {}, token);
  },

  // Mark all notifications as seen
  markAllAsSeen: async (token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.patch("/api/notifications/mark-all-seen", {}, token);
  },
};
