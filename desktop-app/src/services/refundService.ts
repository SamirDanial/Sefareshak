import ApiService from "./apiService";

export type RefundType = "FULL" | "PARTIAL" | "ITEM_SPECIFIC";
export type RefundStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export interface RefundItem {
  orderItemId: string;
  refundAmount: number;
  reason?: string;
}

export interface CreateRefundRequest {
  orderId: string;
  refundType: RefundType;
  amount?: number;
  items?: RefundItem[];
  reason?: string;
}

export interface RefundResponse {
  id: string;
  orderId: string;
  refundType: RefundType;
  amount: number;
  reason?: string;
  stripeRefundId?: string;
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

export const refundService = {
  // Create a refund
  createRefund: async (
    refundData: CreateRefundRequest,
    token?: string
  ): Promise<CreateRefundResponse> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/refunds", refundData, token);
    return response;
  },

  // Get refunds for a specific order
  getOrderRefunds: async (
    orderId: string,
    token?: string
  ): Promise<RefundResponse[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/refunds/order/${orderId}`, token);
    return response.data || [];
  },

  // Get all refunds (admin only)
  getAllRefunds: async (
    params?: {
      page?: number;
      limit?: number;
      status?: RefundStatus;
      refundType?: RefundType;
    },
    token?: string
  ): Promise<RefundsResponse> => {
    const apiService = ApiService.getInstance();
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.status) queryParams.append("status", params.status);
    if (params?.refundType)
      queryParams.append("refundType", params.refundType);

    const url = `/api/refunds${
      queryParams.toString() ? `?${queryParams.toString()}` : ""
    }`;
    const response = await apiService.get(url, token);
    return response;
  },

  // Cancel a refund
  cancelRefund: async (
    refundId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/refunds/${refundId}/cancel`,
      {},
      token
    );
    return response;
  },
};

