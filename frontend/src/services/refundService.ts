import ApiService from "./apiService";

// Refund types
export type RefundType = "FULL" | "PARTIAL" | "ITEM_SPECIFIC";
export type RefundStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export interface RefundItem {
  orderItemId: string;
  refundAmount: number;
  reason?: string;
}

export interface CreateRefundRequest {
  orderId?: string;
  reservationOrderId?: string;
  refundType: RefundType;
  amount?: number; // For custom amount refunds
  items?: RefundItem[];
  reason?: string;
}

export interface RefundResponse {
  id: string;
  orderId?: string;
  reservationOrderId?: string;
  refundType: RefundType;
  amount: number;
  reason?: string;
  stripeRefundId?: string;
  paypalRefundId?: string;
  status: RefundStatus;
  refundedBy: string;
  refundedAt?: Date;
  createdAt: Date;
}

export interface RefundsResponse {
  success: boolean;
  data: RefundResponse[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateRefundResponse {
  success: boolean;
  data: RefundResponse;
  message?: string;
  error?: string;
}

class RefundService {
  private apiService: ApiService;

  constructor() {
    this.apiService = ApiService.getInstance();
  }

  // Create a refund
  async createRefund(
    refundData: CreateRefundRequest,
    token?: string
  ): Promise<CreateRefundResponse> {
    try {
      const response = (await this.apiService.post(
        "/api/refunds",
        refundData,
        token
      )) as CreateRefundResponse;
      return response;
    } catch (error) {
      console.error("Error creating refund:", error);
      throw error;
    }
  }

  // Get refunds for a specific order
  async getOrderRefunds(
    orderId: string,
    token?: string
  ): Promise<RefundResponse[]> {
    try {
      const response = (await this.apiService.get(
        `/api/refunds/order/${orderId}`,
        token
      )) as {
        success: boolean;
        data: RefundResponse[];
      };
      return response.data;
    } catch (error) {
      console.error("Error fetching order refunds:", error);
      throw error;
    }
  }

  // Get all refunds (admin only)
  async getAllRefunds(
    params?: {
      page?: number;
      limit?: number;
      status?: RefundStatus;
      refundType?: RefundType;
    },
    token?: string
  ): Promise<RefundsResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append("page", params.page.toString());
      if (params?.limit) queryParams.append("limit", params.limit.toString());
      if (params?.status) queryParams.append("status", params.status);
      if (params?.refundType)
        queryParams.append("refundType", params.refundType);

      const url = `/api/refunds${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;
      const response = (await this.apiService.get(
        url,
        token
      )) as RefundsResponse;
      return response;
    } catch (error) {
      console.error("Error fetching all refunds:", error);
      throw error;
    }
  }

  // Cancel a refund
  async cancelRefund(
    refundId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = (await this.apiService.patch(
        `/api/refunds/${refundId}/cancel`,
        {},
        token
      )) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      return response;
    } catch (error) {
      console.error("Error cancelling refund:", error);
      throw error;
    }
  }

  // Helper method to calculate refund amount for items
  calculateItemRefundAmount(
    orderItems: any[],
    selectedItems: RefundItem[]
  ): number {
    return selectedItems.reduce((total, item) => {
      const orderItem = orderItems.find((oi) => oi.id === item.orderItemId);
      if (orderItem) {
        return total + item.refundAmount;
      }
      return total;
    }, 0);
  }

  // Helper method to validate refund amount
  validateRefundAmount(
    refundAmount: number,
    orderTotal: number,
    existingRefunds: RefundResponse[]
  ): { isValid: boolean; error?: string; maxRefundable?: number } {
    const totalRefunded = existingRefunds.reduce(
      (sum, refund) => sum + refund.amount,
      0
    );
    const maxRefundable = orderTotal - totalRefunded;

    if (refundAmount <= 0) {
      return { isValid: false, error: "Refund amount must be greater than 0" };
    }

    if (refundAmount > maxRefundable) {
      return {
        isValid: false,
        error: `Refund amount cannot exceed $${maxRefundable.toFixed(
          2
        )}. Already refunded: $${totalRefunded.toFixed(2)}`,
        maxRefundable,
      };
    }

    return { isValid: true, maxRefundable };
  }

  // Helper method to format refund status
  formatRefundStatus(status: RefundStatus): { text: string; color: string } {
    switch (status) {
      case "PENDING":
        return { text: "Pending", color: "text-yellow-600" };
      case "SUCCEEDED":
        return { text: "Succeeded", color: "text-green-600" };
      case "FAILED":
        return { text: "Failed", color: "text-red-600" };
      case "CANCELED":
        return { text: "Canceled", color: "text-gray-600" };
      default:
        return { text: "Unknown", color: "text-gray-600" };
    }
  }

  // Helper method to format refund type
  formatRefundType(type: RefundType): string {
    switch (type) {
      case "FULL":
        return "Full Refund";
      case "PARTIAL":
        return "Partial Refund";
      case "ITEM_SPECIFIC":
        return "Item-Specific Refund";
      default:
        return "Unknown";
    }
  }
}

export const refundService = new RefundService();
