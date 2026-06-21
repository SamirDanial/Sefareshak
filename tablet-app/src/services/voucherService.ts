import ApiService from "@/src/services/apiService";

export type VoucherType = "SINGLE_PURPOSE" | "MULTI_PURPOSE";
export type VoucherStatus = "ACTIVE" | "PARTIALLY_REDEEMED" | "REDEEMED" | "EXPIRED" | "VOIDED";

export interface Voucher {
  id: string;
  voucherCode: string;
  voucherType: VoucherType;
  initialAmount: number;
  currentAmount: number;
  vatRate: number | null;
  status: VoucherStatus;
  expiresAt: string;
  tseIssuanceSignature: string | null;
}

export interface VoucherIssueInput {
  voucherType: VoucherType;
  amount: number;
  vatRate?: number | null;
  organizationId: string;
  branchId?: string | null;
}

export interface VoucherRedeemInput {
  voucherCode: string;
  amountNeeded: number;
  organizationId: string;
  branchId?: string | null;
  orderId?: string | null;
}

export interface VoucherValidateInput {
  voucherCode: string;
  branchId?: string | null;
  orderId?: string | null;
}

export const voucherService = {
  async issueVoucher(input: VoucherIssueInput, token?: string): Promise<Voucher> {
    const api = ApiService.getInstance();
    const response = await api.post("/api/v1/vouchers/issue", input, token);
    return (response as any).data as Voucher;
  },

  async validateVoucher(input: VoucherValidateInput, token?: string): Promise<Voucher> {
    const api = ApiService.getInstance();
    const response = await api.post("/api/v1/vouchers/validate", input, token);
    return (response as any).data as Voucher;
  },

  async getVoucherByCode(voucherCode: string, token?: string): Promise<Voucher> {
    const api = ApiService.getInstance();
    const response = await api.get(`/api/v1/vouchers/${voucherCode}`, token);
    return (response as any).data as Voucher;
  },

  async redeemVoucher(input: VoucherRedeemInput, token?: string): Promise<{
    voucherCode: string;
    voucherType: VoucherType;
    redeemedAmount: number;
    remainingBalance: number;
    status: VoucherStatus;
  }> {
    const api = ApiService.getInstance();
    const response = await api.post("/api/v1/vouchers/redeem", input, token);
    return (response as any).data as any;
  },
};
