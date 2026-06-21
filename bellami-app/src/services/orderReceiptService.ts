import ApiService from "./apiService";

export type FiskalySignaturePayload = any;

export type OrderReceiptPayload = {
  order: any;
  fiskaly: null | {
    status?: string;
    signaturePayload?: FiskalySignaturePayload;
  };
  fiskalyCorrections?: any[];
};

export const orderReceiptService = {
  getOrderReceiptPayload: async (orderId: string, token?: string): Promise<OrderReceiptPayload> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/order/${orderId}/receipt`, token);
    const raw = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    return raw;
  },
  getMyOrderReceiptPayload: async (orderId: string, token?: string): Promise<OrderReceiptPayload> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/order/user/${orderId}/receipt`, token);
    const raw = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    return raw;
  },
};
