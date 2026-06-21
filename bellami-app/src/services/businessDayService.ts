import ApiService from "./apiService";

export type BusinessDayStatus = "OPEN" | "CLOSED";

export interface BusinessDaySession {
  id: string;
  branchId: string;
  sequenceNumber: number;
  status: BusinessDayStatus;
  startedAt: string;
  endedAt?: string | null;
  closedByUserId?: string | null;
}

export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type BusinessDayCloseValidation =
  | { ok: true }
  | {
      ok: false;
      blockingOrders: Array<{
        id: string;
        orderNumber: string;
        status: string;
        paymentStatus: string;
        paymentMethod: string;
        reason?: string;
      }>;
    };

export interface BusinessDayReport {
  id: string;
  sessionId: string;
  data: any;
  createdAt: string;
}

export const businessDayService = {
  getCurrent: async (branchId: string, token?: string): Promise<BusinessDaySession> => {
    const api = ApiService.getInstance();
    const params = new URLSearchParams({ branchId });
    const response = await api.get(`/api/admin/business-day/current?${params}`, token);
    return response.data as BusinessDaySession;
  },

  listClosed: async (
    branchId: string,
    options?: { page?: number; limit?: number; take?: number; skip?: number },
    token?: string
  ): Promise<{ sessions: BusinessDaySession[]; pagination: Pagination }> => {
    const api = ApiService.getInstance();
    const params = new URLSearchParams({ branchId });

    if (options?.page !== undefined) params.set("page", String(options.page));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.take !== undefined) params.set("take", String(options.take));
    if (options?.skip !== undefined) params.set("skip", String(options.skip));
    const response = await api.get(`/api/admin/business-day/closed?${params}`, token);

    // Backwards compatibility with older response shape (array)
    if (Array.isArray(response?.data)) {
      return {
        sessions: response.data as BusinessDaySession[],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: (response.data as any[]).length,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    return response.data as { sessions: BusinessDaySession[]; pagination: Pagination };
  },

  validateClose: async (branchId: string, token?: string): Promise<BusinessDayCloseValidation> => {
    const api = ApiService.getInstance();
    const response = await api.post(`/api/admin/business-day/validate-close`, { branchId }, token);
    return response.data as BusinessDayCloseValidation;
  },

  closeDay: async (branchId: string, token?: string) => {
    const api = ApiService.getInstance();
    return await api.post(`/api/admin/business-day/close`, { branchId }, token);
  },

  getReport: async (sessionId: string, token?: string): Promise<BusinessDayReport> => {
    const api = ApiService.getInstance();
    const response = await api.get(`/api/admin/business-day/${sessionId}/report`, token);
    return response.data as BusinessDayReport;
  },
};
