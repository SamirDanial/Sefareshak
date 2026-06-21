import paypal from "@paypal/checkout-server-sdk";
import { PAYPAL_CONFIG } from "../config/paypal";

/**
 * Service wrapper for PayPal refunds using @paypal/checkout-server-sdk.
 * Uses capture ID (stored as providerChargeId) to initiate refunds.
 */
class PayPalRefundService {
  private static instance: PayPalRefundService;

  /**
   * Ensure amounts sent to PayPal are valid:
   * - finite number
   * - minimum 0.01
   * - rounded to 2 decimals
   */
  private normalizeAmount(amount: number): number {
    if (!Number.isFinite(amount)) {
      throw new Error("PayPal refund amount is invalid");
    }
    const rounded = Math.round(amount * 100) / 100;
    if (rounded < 0.01) {
      throw new Error("PayPal refund amount must be at least 0.01");
    }
    return rounded;
  }

  /**
   * Map PayPal refund statuses to our internal status names.
   */
  public mapRefundStatus(status?: string): "SUCCEEDED" | "PENDING" | "FAILED" | "CANCELED" {
    const normalized = (status || "").toUpperCase();
    if (normalized === "COMPLETED" || normalized === "SUCCEEDED") return "SUCCEEDED";
    if (normalized === "PENDING") return "PENDING";
    if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELED";
    if (normalized === "DENIED" || normalized === "FAILED") return "FAILED";
    return "PENDING";
  }

  /**
   * Format PayPal SDK errors into a readable message.
   */
  private formatPayPalError(error: any): Error {
    const message =
      error?.message ||
      error?.response?.message ||
      error?.response?.statusText ||
      "Unknown PayPal error";
    const details = error?.response?.result?.details
      ? JSON.stringify(error.response.result.details)
      : undefined;
    const status = error?.statusCode || error?.response?.statusCode;

    const parts = [`PayPal refund failed: ${message}`];
    if (status) parts.push(`status=${status}`);
    if (details) parts.push(`details=${details}`);

    return new Error(parts.join(" | "));
  }

  public static getInstance(): PayPalRefundService {
    if (!PayPalRefundService.instance) {
      PayPalRefundService.instance = new PayPalRefundService();
    }
    return PayPalRefundService.instance;
  }

  private getClient() {
    if (!PAYPAL_CONFIG.clientId || !PAYPAL_CONFIG.clientSecret) {
      throw new Error("PayPal credentials are not configured");
    }

    const environment =
      PAYPAL_CONFIG.mode === "live"
        ? new paypal.core.LiveEnvironment(
            PAYPAL_CONFIG.clientId,
            PAYPAL_CONFIG.clientSecret
          )
        : new paypal.core.SandboxEnvironment(
            PAYPAL_CONFIG.clientId,
            PAYPAL_CONFIG.clientSecret
          );

    return new paypal.core.PayPalHttpClient(environment);
  }

  /**
   * Create a refund for a given capture (providerChargeId).
   */
  public async createRefund(params: {
    captureId: string;
    amount: number;
    currency: string;
    reason?: string;
    metadata?: Record<string, string>;
  }) {
    const normalizedAmount = this.normalizeAmount(params.amount);

    try {
      const client = this.getClient();
      const paypalAny = paypal as any;
      const request = new paypalAny.payments.CapturesRefundRequest(
        params.captureId
      );

      request.requestBody({
        amount: {
          value: normalizedAmount.toFixed(2),
          currency_code: params.currency.toUpperCase(),
        },
        note_to_payer: params.reason,
        invoice_id: params.metadata?.invoiceId,
        custom_id: params.metadata?.customId,
      });

      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      throw this.formatPayPalError(error);
    }
  }

  /**
   * Retrieve a refund by PayPal refund ID.
   */
  public async getRefund(refundId: string) {
    try {
      const client = this.getClient();
      const paypalAny = paypal as any;
      const request = new paypalAny.payments.RefundsGetRequest(refundId);
      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      throw this.formatPayPalError(error);
    }
  }
}

export default PayPalRefundService;

