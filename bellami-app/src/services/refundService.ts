import ApiService from "./apiService";

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
  amount?: number;
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

class RefundService {
  private static instance: RefundService;
  private apiService: ApiService;

  private constructor() {
    this.apiService = ApiService.getInstance();
  }

  public static getInstance(): RefundService {
    if (!RefundService.instance) {
      RefundService.instance = new RefundService();
    }
    return RefundService.instance;
  }

  async createRefund(
    refundData: CreateRefundRequest,
    token?: string
  ): Promise<{
    success: boolean;
    data: RefundResponse;
    message?: string;
    error?: string;
  }> {
    try {
      const response = (await this.apiService.post(
        "/api/refunds",
        refundData,
        token
      )) as {
        success: boolean;
        data: RefundResponse;
        message?: string;
        error?: string;
      };
      return response;
    } catch (error) {
      console.error("Error creating refund:", error);
      throw error;
    }
  }

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

  formatRefundStatus(status: RefundStatus): { text: string; color: string } {
    switch (status) {
      case "PENDING":
        return { text: "Pending", color: "#fbbf24" };
      case "SUCCEEDED":
        return { text: "Succeeded", color: "#22c55e" };
      case "FAILED":
        return { text: "Failed", color: "#ef4444" };
      case "CANCELED":
        return { text: "Canceled", color: "#6b7280" };
      default:
        return { text: "Unknown", color: "#6b7280" };
    }
  }
}

export const refundService = RefundService.getInstance();
