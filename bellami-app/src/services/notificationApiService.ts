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
  mealId: string;
  quantity: number;
  meal: {
    id: string;
    name: string;
    basePrice: number;
    image?: string;
  };
}

export interface NotificationOrder {
  id: string;
  orderNumber: string;
  userId?: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  user?: NotificationOrderUser;
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
  type?: "ORDER" | "RESERVATION";
  isSeen: boolean;
  isOrderUpdate: boolean;
  seenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: NotificationOrder | null;
  reservation?: NotificationReservation | null;
}

export interface PaginatedNotificationsResponse {
  notifications: NotificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const notificationApiService = {
  // Get all unseen notifications
  getUnseenNotifications: async (
    token?: string,
    organizationId?: string
  ): Promise<NotificationItem[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/notifications/unseen", token, {
      skipOrgHeader: Boolean(organizationId),
      headers: organizationId
        ? {
            "x-organization-id": organizationId,
          }
        : undefined,
    });
    return response.data;
  },

  // Get all notifications with pagination
  getNotifications: async (
    page: number = 1,
    limit: number = 10,
    token?: string,
    organizationId?: string
  ): Promise<PaginatedNotificationsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    const response = await apiService.get(
      `/api/notifications?${params}`,
      token,
      {
        skipOrgHeader: Boolean(organizationId),
        headers: organizationId
          ? {
              "x-organization-id": organizationId,
            }
          : undefined,
      }
    );
    return response.data;
  },

  // Mark notification as seen by orderId or reservationId
  markAsSeen: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.patch(`/api/notifications/${id}/seen`, {}, token);
  },

  // Mark all notifications as seen
  markAllAsSeen: async (token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.patch("/api/notifications/mark-all-seen", {}, token);
  },
};
