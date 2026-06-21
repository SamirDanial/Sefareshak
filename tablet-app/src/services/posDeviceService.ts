import ApiService from "@/src/services/apiService";

export type PosDevice = {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  deviceCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fiskalyClientId?: string | null;
  fiskalyClientSerialNumber?: string | null;
  fiskalyClientProvisioningStatus?: string | null;
  fiskalyClientProvisioningLastErrorCode?: string | null;
  fiskalyClientProvisioningLastErrorMessage?: string | null;
};

export type CreatePosDeviceInput = {
  branchId: string;
  name: string;
  deviceCode: string;
  isActive?: boolean;
};

export type UpdatePosDeviceInput = Partial<CreatePosDeviceInput>;

export const posDeviceService = {
  listForOrganization: async (organizationId: string, token?: string, branchId?: string) => {
    const api = ApiService.getInstance();
    const qs = new URLSearchParams();
    if (branchId) qs.set("branchId", String(branchId));
    const url = `/api/admin/organizations/${organizationId}/pos-devices${qs.toString() ? `?${qs}` : ""}`;
    const res = await api.get(url, token);
    return (res as any).data as PosDevice[];
  },

  createForOrganization: async (organizationId: string, input: CreatePosDeviceInput, token?: string) => {
    const api = ApiService.getInstance();
    const res = await api.post(`/api/admin/organizations/${organizationId}/pos-devices`, input, token);
    return (res as any).data as PosDevice;
  },

  updateForOrganization: async (
    organizationId: string,
    deviceId: string,
    input: UpdatePosDeviceInput,
    token?: string
  ) => {
    const api = ApiService.getInstance();
    const res = await api.put(`/api/admin/organizations/${organizationId}/pos-devices/${deviceId}`, input, token);
    return (res as any).data as PosDevice;
  },

  deleteForOrganization: async (organizationId: string, deviceId: string, token?: string) => {
    const api = ApiService.getInstance();
    const res = await api.delete(`/api/admin/organizations/${organizationId}/pos-devices/${deviceId}`, token);
    return res as any;
  },

  provisionFiskalyClient: async (organizationId: string, deviceId: string, token?: string) => {
    const api = ApiService.getInstance();
    const res = await api.post(
      `/api/admin/organizations/${organizationId}/pos-devices/${deviceId}/provision-fiskaly-client`,
      {},
      token
    );
    return (res as any).data as PosDevice;
  },
};
