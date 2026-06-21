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

const unwrapData = <T,>(response: unknown): T => {
  if (response && typeof response === "object" && "data" in (response as any)) {
    return (response as any).data as T;
  }
  return response as T;
};

export const businessDayService = {
  getCurrent: async (branchId: string, token?: string): Promise<BusinessDaySession> => {
    if (!branchId) throw new Error("branchId is required");

    const api = ApiService.getInstance();
    const params = new URLSearchParams({ branchId });
    const response = await api.get(`/api/admin/business-day/current?${params}`, token);
    return unwrapData<BusinessDaySession>(response);
  },

  listClosed: async (
    branchId: string,
    options?: { page?: number; limit?: number; take?: number; skip?: number },
    token?: string
  ): Promise<{ sessions: BusinessDaySession[]; pagination: Pagination }> => {
    if (!branchId) throw new Error("branchId is required");

    const api = ApiService.getInstance();
    const params = new URLSearchParams({ branchId });

    if (options?.page !== undefined) params.set("page", String(options.page));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.take !== undefined) params.set("take", String(options.take));
    if (options?.skip !== undefined) params.set("skip", String(options.skip));

    const response = await api.get(`/api/admin/business-day/closed?${params}`, token);
    const data = unwrapData<any>(response);

    if (Array.isArray(data)) {
      return {
        sessions: data as BusinessDaySession[],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: (data as any[]).length,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    return data as { sessions: BusinessDaySession[]; pagination: Pagination };
  },

  validateClose: async (branchId: string, token?: string): Promise<BusinessDayCloseValidation> => {
    if (!branchId) throw new Error("branchId is required");

    const api = ApiService.getInstance();
    const response = await api.post(`/api/admin/business-day/validate-close`, { branchId }, token);
    return unwrapData<BusinessDayCloseValidation>(response);
  },

  closeDay: async (branchId: string, token?: string) => {
    if (!branchId) throw new Error("branchId is required");

    const api = ApiService.getInstance();
    const response = await api.post(`/api/admin/business-day/close`, { branchId }, token);
    return unwrapData<any>(response);
  },

  getReport: async (sessionId: string, token?: string): Promise<BusinessDayReport> => {
    if (!sessionId) throw new Error("sessionId is required");

    const api = ApiService.getInstance();
    const response = await api.get(`/api/admin/business-day/${sessionId}/report`, token);
    return unwrapData<BusinessDayReport>(response);
  },
};
