import ApiService from "./apiService";

export type KitchenTicketStatus = "NEW" | "PREPARING" | "READY" | "CANCELLED";

export interface KitchenTicket {
  id: string;
  branchId: string;
  reservationId?: string | null;
  status: KitchenTicketStatus;
  items: any;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const kitchenTicketService = {
  listKitchenTickets: async (params: { branchId: string; date: string }, token?: string): Promise<KitchenTicket[]> => {
    const apiService = ApiService.getInstance();
    const query = new URLSearchParams({
      branchId: params.branchId,
      date: params.date,
    });

    const resp = await apiService.get(`/api/admin/kitchen-tickets?${query.toString()}`, token);
    return (resp as any)?.data || [];
  },

  createKitchenTicket: async (
    params: { branchId: string; reservationId?: string | null; items: any },
    token?: string
  ): Promise<KitchenTicket> => {
    const apiService = ApiService.getInstance();
    const resp = await apiService.post(
      `/api/admin/kitchen-tickets`,
      {
        branchId: params.branchId,
        reservationId: params.reservationId ?? null,
        items: params.items,
      },
      token
    );
    return (resp as any)?.data;
  },

  updateKitchenTicketStatus: async (params: { id: string; status: KitchenTicketStatus }, token?: string): Promise<KitchenTicket> => {
    const apiService = ApiService.getInstance();
    const resp = await apiService.patch(`/api/admin/kitchen-tickets/${params.id}/status`, { status: params.status }, token);
    return (resp as any)?.data;
  },
};
