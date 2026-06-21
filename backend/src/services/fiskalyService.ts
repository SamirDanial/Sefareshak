import DatabaseSingleton from "../config/database";
import {
  FiscalTransactionStatus,
  FiskalyEnvironment,
  FiskalyProvisioningStatus,
  Prisma,
} from "@prisma/client";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

type FiscalCorrectionType = "REFUND" | "CANCELLATION";

export class FiskalyService {
  private static instance: FiskalyService;
  private db = DatabaseSingleton.getInstance();

  public static readonly CORRECTION_TYPES = ["REFUND", "CANCELLATION"] as const;
  public static isCorrectionType(value: any): value is FiscalCorrectionType {
    return (FiskalyService.CORRECTION_TYPES as readonly string[]).includes(String(value));
  }

  private static readonly FISKALY_MIDDLEWARE_HOST =
    "https://kassensichv-middleware.fiskaly.com";

  private static readonly FISKALY_BACKEND_HOST = "https://kassensichv.fiskaly.com";

  private constructor() {
    // Removed verbose logging
  }

  private normalizeCurrencyCode(currency: string): string {
    // German TSS and DSFinV-K regulations mandate EUR as the base currency for all compliance exports.
    // Force 'EUR' to ensure strict legal compliance.
    return "EUR";
  }

  private resolvePaymentTypeFromMeta(meta: Record<string, any> | null | undefined): string {
    const raw =
      String((meta as any)?.paymentMethod || (meta as any)?.payment_method || "").trim() ||
      String((meta as any)?.paymentType || (meta as any)?.payment_type || "").trim();
    const pm = raw.toUpperCase();

    // Check for voucher payment - vouchers should be treated as non-cash
    const voucherPaymentAmount = Number((meta as any)?.voucherPaymentAmount || (meta as any)?.voucher_payment_amount || 0);
    const voucherCodes = (meta as any)?.voucherCodes || (meta as any)?.voucher_codes;
    const hasVoucherPayment = voucherPaymentAmount > 0 || (Array.isArray(voucherCodes) && voucherCodes.length > 0);

    console.log('[FiskalyService] resolvePaymentTypeFromMeta:', {
      paymentMethod: pm,
      voucherPaymentAmount,
      voucherCodes,
      hasVoucherPayment,
    });

    if (hasVoucherPayment) {
      console.log('[FiskalyService] Voucher payment detected, returning NON_CASH');
      return "NON_CASH"; // Vouchers are non-cash payments
    }

    if (pm === "CASH" || pm === "CASH_ON_DELIVERY" || pm === "CASH-ON-DELIVERY") {
      return "CASH";
    }
    if (pm === "CARD_ON_DELIVERY" || pm === "ONLINE" || pm === "ONLINE_PAYMENT") {
      return "NON_CASH";
    }

    return "CASH";
  }

  private extractQrCodeData(payload: any): string | null {
    try {
      const directCandidates = [
        payload?.qr_code_data,
        payload?.qrCodeData,
        payload?.qr_code,
        payload?.qrCode,
        payload?.schema?.standard_v1?.receipt?.qr_code_data,
        payload?.schema?.standard_v1?.receipt?.qrCodeData,
      ];
      for (const c of directCandidates) {
        if (typeof c === "string" && c.trim()) return c.trim();
      }

      const keys = new Set([
        "qr_code_data",
        "qrCodeData",
        "qr_code",
        "qrCode",
      ]);

      const seen = new Set<any>();
      const stack: any[] = [payload];
      let steps = 0;

      while (stack.length > 0 && steps < 5000) {
        steps++;
        const cur = stack.pop();
        if (!cur || typeof cur !== "object") continue;
        if (seen.has(cur)) continue;
        seen.add(cur);

        for (const [k, v] of Object.entries(cur)) {
          if (keys.has(k) && typeof v === "string" && v.trim()) {
            return v.trim();
          }
          if (v && typeof v === "object") stack.push(v);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private getFiskalyBackendBaseUrl(config: {
    fiskalyApiBaseUrl?: string | null;
  } | null | undefined): string {
    const candidate = String(config?.fiskalyApiBaseUrl || "").trim();
    if (!candidate) return FiskalyService.FISKALY_BACKEND_HOST;
    if (!/^https?:\/\//i.test(candidate)) return FiskalyService.FISKALY_BACKEND_HOST;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return FiskalyService.FISKALY_BACKEND_HOST;
    }

    const hostname = String(parsed.hostname || "").toLowerCase();

    // Guardrail: middleware host is NOT the backend host. Backend endpoints (v0/v1/v2 tss) must not use it.
    // Also reject any host that merely contains "middleware" (handles truncated/typo URLs).
    if (hostname.includes("middleware")) {
      return FiskalyService.FISKALY_BACKEND_HOST;
    }

    // Guardrail: only allow fiskaly domains here (avoid accidental internal URLs).
    if (!hostname.endsWith("fiskaly.com")) {
      return FiskalyService.FISKALY_BACKEND_HOST;
    }

    return parsed.origin;
  }

  public static getInstance(): FiskalyService {
    if (!FiskalyService.instance) {
      FiskalyService.instance = new FiskalyService();
    }
    return FiskalyService.instance;
  }

  /**
   * Provision or ensure a POS device has a Fiskaly client registered under the org TSS.
   * Intended to run on POS device creation/activation.
   */
  public async provisionPosDeviceClient(params: {
    organizationId: string;
    deviceId: string;
  }) {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (!config) {
      throw new Error("Organization Settings not found");
    }

    if (config.fiskalyEnvironment !== FiskalyEnvironment.LIVE) {
      throw new Error(
        "POS device client provisioning is only supported when fiskalyEnvironment=LIVE"
      );
    }

    const tssId = String(config.fiskalyTssId || "").trim();
    if (!tssId) {
      throw new Error(
        "Missing fiskalyTssId. Provision the organization TSS first (Save Fiskaly settings)."
      );
    }

    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new Error(
        "Missing Fiskaly credentials: fiskalyClientId (api_key) and fiskalyClientSecret (api_secret)"
      );
    }

    const adminPinEnc = String(config.fiskalyTssAdminPinEncrypted || "").trim();
    if (!adminPinEnc) {
      throw new Error(
        "Missing Fiskaly admin PIN. Provision the organization TSS first (Save Fiskaly settings)."
      );
    }

    const adminPin = this.decryptAdminPin(adminPinEnc);

    const device = await (prisma as any).posDevice.findFirst({
      where: { id: params.deviceId, organizationId: params.organizationId },
    });
    if (!device) {
      throw new Error("POS device not found");
    }

    let serialNumber =
      String(device.fiskalyClientSerialNumber || "").trim() ||
      String(device.deviceCode || "").trim();
    if (!serialNumber) {
      throw new Error("POS device serial_number is missing");
    }

    // For reprovisioning, we need to handle the case where we cleared the clientId but the client still exists in Fiskaly
    let clientId = String(device.fiskalyClientId || "").trim();
    
    // If we don't have a clientId, we'll try to create one and handle the conflict
    if (!clientId) {
      clientId = uuidv4();
      console.info(`No existing clientId in database, will attempt to create new client ${clientId} for serial number ${serialNumber}`);
    } else {
      console.info(`Using existing clientId ${clientId} from database`);
    }

    await (prisma as any).posDevice.update({
      where: { id: device.id },
      data: {
        fiskalyClientId: clientId,
        fiskalyClientSerialNumber: serialNumber,
        fiskalyClientProvisioningStatus: FiskalyProvisioningStatus.IN_PROGRESS,
        fiskalyClientProvisioningLastErrorCode: null,
        fiskalyClientProvisioningLastErrorMessage: null,
      },
    });

    try {
      const accessToken = await this.authenticate({ apiKey, apiSecret });

      // Admin auth is required for client creation
      await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/admin/auth`,
        method: "POST",
        token: accessToken,
        body: { admin_pin: adminPin },
      });

      try {
      // Try to create the client with the current serial number
      await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/client/${clientId}`,
        method: "PUT",
        token: accessToken,
        body: {
          serial_number: serialNumber,
          state: "REGISTERED",
        },
      });
      console.info(`Successfully created Fiskaly client ${clientId} with serial number ${serialNumber}`);
    } catch (createErr: any) {
      // If we get a serial number conflict, generate a new unique serial number
      if (createErr?.fiskalyCode === 'E_ILLEGAL_CLIENT_SERIAL') {
        console.info(`Serial number conflict detected for ${serialNumber}. Generating new unique serial number...`);
        
        // Generate a new unique serial number
        let newSerialNumber: string;
        let attempts = 0;
        const maxAttempts = 10;
        
        do {
          attempts++;
          // Generate a random 6-character alphanumeric string
          const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
          newSerialNumber = `TAB-${randomChars}`;
          
          console.info(`Attempt ${attempts}: Trying new serial number ${newSerialNumber}`);
          
          try {
            // Try to create the client with the new serial number
            await this.fiskalyRequest<any>({
              baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
              path: `/api/v2/tss/${tssId}/client/${clientId}`,
              method: "PUT",
              token: accessToken,
              body: {
                serial_number: newSerialNumber,
                state: "REGISTERED",
              },
            });
            
            // If successful, update the database with the new serial number
            await (prisma as any).posDevice.update({
              where: { id: device.id },
              data: {
                fiskalyClientSerialNumber: newSerialNumber,
                deviceCode: newSerialNumber, // Also update the device code
              },
            });
            
            console.info(`Successfully created Fiskaly client ${clientId} with new serial number ${newSerialNumber}`);
            console.info(`Updated device ${device.id} with new serial number and device code`);
            
            // Continue with the original flow - the device now has the new serial number
            serialNumber = newSerialNumber;
            break;
            
          } catch (retryErr: any) {
            if (retryErr?.fiskalyCode === 'E_ILLEGAL_CLIENT_SERIAL') {
              console.info(`Serial number ${newSerialNumber} also conflicts, trying another...`);
              continue;
            } else {
              // Re-throw other errors
              throw retryErr;
            }
          }
        } while (attempts < maxAttempts);
        
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to generate a unique serial number after ${maxAttempts} attempts. This may indicate a problem with the Fiskaly TSS.`);
        }
      } else {
        // Re-throw other errors
        throw createErr;
      }
    }

      return await (prisma as any).posDevice.update({
        where: { id: device.id },
        data: {
          fiskalyClientProvisioningStatus: FiskalyProvisioningStatus.READY,
          fiskalyClientProvisioningLastErrorCode: null,
          fiskalyClientProvisioningLastErrorMessage: null,
        },
      });
    } catch (err: any) {
      const code = err?.fiskalyCode ? String(err.fiskalyCode) : null;
      const message = err?.fiskalyMessage
        ? String(err.fiskalyMessage)
        : err instanceof Error
          ? err.message
          : String(err);

      await (prisma as any).posDevice.update({
        where: { id: device.id },
        data: {
          fiskalyClientProvisioningStatus: FiskalyProvisioningStatus.FAILED,
          fiskalyClientProvisioningLastErrorCode: code,
          fiskalyClientProvisioningLastErrorMessage: message,
        },
      });

      throw err;
    }
  }

  /**
   * Check if a Fiskaly client has any fiscal transactions.
   * Used to determine if a client can be safely deleted.
   */
  public async checkClientHasTransactions(params: {
    organizationId: string;
    clientId: string;
  }): Promise<boolean> {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (!config) {
      throw new Error("Fiskaly is not configured for this organization");
    }

    try {
      const accessToken = await this.authenticate({
        apiKey: String(config.fiskalyClientId || "").trim(),
        apiSecret: String(config.fiskalyClientSecret || "").trim(),
      });

      // Check if client has any transactions
      const transactions = await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_BACKEND_HOST,
        path: `/api/v1/tss/${config.fiskalyTssId}/clients/${params.clientId}/transactions`,
        method: "GET",
        token: accessToken,
        query: { limit: 1 }, // Only need to check if any exist
      });

      // If transactions array exists and has items, client has transactions
      return transactions && Array.isArray(transactions.transactions) && transactions.transactions.length > 0;
    } catch (err: any) {
      console.warn("Failed to check client transactions:", err);
      // If client doesn't exist (404), it doesn't have transactions
      if (err?.fiskalyCode === 'E_NOT_FOUND' || err?.httpStatus === 404) {
        console.info("Fiskaly client not found, assuming no transactions");
        return false;
      }
      // For other errors, assume it has transactions to be safe
      return true;
    }
  }

  /**
   * Deprovision a POS device's Fiskaly client.
   * Intended to run on POS device deactivation.
   */
  public async deprovisionPosDeviceClient(params: {
    organizationId: string;
    deviceId: string;
  }) {
    const prisma = this.db.getPrisma();

    const device = await prisma.posDevice.findFirst({
      where: { id: params.deviceId, organizationId: params.organizationId },
    });

    if (!device || !device.fiskalyClientId) {
      // Device not found or not provisioned - nothing to deprovision
      return;
    }

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (!config) {
      throw new Error("Fiskaly is not configured for this organization");
    }

    try {
      const accessToken = await this.authenticate({
        apiKey: String(config.fiskalyClientId || "").trim(),
        apiSecret: String(config.fiskalyClientSecret || "").trim(),
      });

      // Attempt to delete the client from Fiskaly (best effort)
      // Note: Fiskaly doesn't allow deleting clients with existing transactions, which is expected
      try {
        await this.fiskalyRequest({
          baseUrl: FiskalyService.FISKALY_BACKEND_HOST,
          path: `/api/v1/tss/${config.fiskalyTssId}/clients/${device.fiskalyClientId}`,
          method: "DELETE",
          token: accessToken,
        });
        console.info(
          `Successfully deleted Fiskaly client ${device.fiskalyClientId} from TSS ${config.fiskalyTssId}`
        );
      } catch (deleteErr: any) {
        // This is expected behavior - Fiskaly clients with transactions cannot be deleted
        // We'll clear the local database fields instead
        console.info(
          `Fiskaly client ${device.fiskalyClientId} cannot be deleted (likely has existing transactions). This is expected behavior.`
        );
      }
    } catch (err: any) {
      console.warn("Fiskaly deprovisioning failed:", err);
      // Don't throw - deprovisioning is best effort
    }
  }

  private generateClientTransactionId(): string {
    const rnd = crypto.randomBytes(16).toString("hex");
    return `ftx_${Date.now()}_${rnd}`;
  }

  private formatFiskalyAmount(value: number): string {
    const rounded = Math.round(Number(value || 0) * 100) / 100;
    return rounded.toFixed(2);
  }

  private scaleVatPerTaxRate(params: {
    vatPerTaxRate: Array<{ taxRate: string; amount: string }>;
    targetTotal: number;
  }): Array<{ taxRate: string; amount: string }> {
    const groups = (params.vatPerTaxRate || []).map((g) => ({
      taxRate: String(g.taxRate || "").trim(),
      amount: Number(g.amount || 0),
    }));

    const baseTotal = groups.reduce((s, g) => s + (Number.isFinite(g.amount) ? g.amount : 0), 0);
    if (!groups.length || !Number.isFinite(baseTotal) || Math.abs(baseTotal) < 0.0001) {
      return [{ taxRate: "19", amount: this.formatFiskalyAmount(params.targetTotal) }];
    }

    const factor = params.targetTotal / baseTotal;
    const scaled = groups.map((g) => ({
      taxRate: g.taxRate || "19",
      amount: Math.round(g.amount * factor * 100) / 100,
    }));

    const scaledTotal = scaled.reduce((s, g) => s + (Number.isFinite(g.amount) ? g.amount : 0), 0);
    const diff = Math.round((params.targetTotal - scaledTotal) * 100) / 100;
    if (scaled.length > 0 && Math.abs(diff) >= 0.01) {
      scaled[scaled.length - 1].amount = Math.round((scaled[scaled.length - 1].amount + diff) * 100) / 100;
    }

    return scaled
      .filter((g) => g.taxRate)
      .map((g) => ({ taxRate: g.taxRate, amount: this.formatFiskalyAmount(g.amount) }));
  }

  public async fiscalizeCorrection(params: {
    organizationId: string;
    branchId: string;
    deviceId?: string | null;
    orderId?: string | null;
    reservationOrderId?: string | null;
    originalFiscalTransactionId: string;
    correctionType: FiscalCorrectionType;
    refundId?: string | null;
    amount: number;
    currency: string;
    receiptNumber?: string;
    receiptDate?: Date;
    meta?: Record<string, any>;
    refundItems?: Array<{ orderItemId: string; quantity: number }>;
  }) {
    const prisma = this.db.getPrisma() as any;

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (!config) {
      throw new Error("Fiskaly is not configured for this organization");
    }

    const original = await prisma.fiscalTransaction.findFirst({
      where: {
        id: params.originalFiscalTransactionId,
        organizationId: params.organizationId,
      },
      select: {
        id: true,
        status: true,
        orderId: true,
        reservationOrderId: true,
        signaturePayload: true,
      },
    });

    if (!original || String(original.status) !== "FINISHED") {
      throw new Error("Original fiscal transaction not found or not FINISHED");
    }

    if (params.refundId) {
      const existing = await prisma.fiscalTransactionCorrection.findFirst({
        where: { refundId: params.refundId, organizationId: params.organizationId },
      });
      if (existing && existing.status === FiscalTransactionStatus.FINISHED) return existing;
    }

    // Check if this is the first correction for this fiscal transaction
    const existingCorrections = await prisma.fiscalTransactionCorrection.findMany({
      where: {
        fiscalTransactionId: params.originalFiscalTransactionId,
        organizationId: params.organizationId,
      },
    });

    const isFirstCorrection = existingCorrections.length === 0;

    // Determine correction type based on whether this is the first correction and if all items are refunded
    let effectiveCorrectionType = params.correctionType;
    if (isFirstCorrection && params.refundItems && params.refundItems.length > 0) {
      const orderId = params.orderId ?? original.orderId ?? null;
      if (orderId) {
        // Fetch original order items
        const originalOrder = await prisma.order.findFirst({
          where: { id: orderId },
          select: {
            orderItems: {
              select: {
                id: true,
                quantity: true,
              },
            },
          },
        });

        if (originalOrder && originalOrder.orderItems) {
          // Calculate total quantity of original order
          const originalTotalQuantity = originalOrder.orderItems.reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          );

          console.log('[FiskalyService] Original order items:', originalOrder.orderItems.map((item: any) => ({
            id: item.id,
            quantity: item.quantity,
          })));
          console.log('[FiskalyService] Original total quantity:', originalTotalQuantity);

          // Calculate total quantity being refunded
          const refundedTotalQuantity = params.refundItems.reduce(
            (sum: number, item: any) => sum + Number(item.refundedQuantity || 0),
            0
          );

          console.log('[FiskalyService] Refund items:', params.refundItems.map((item: any) => ({
            orderItemId: item.orderItemId,
            refundedQuantity: item.refundedQuantity,
          })));
          console.log('[FiskalyService] Refunded total quantity:', refundedTotalQuantity);

          // If all items are being refunded in the first correction, use CANCELLATION type
          if (refundedTotalQuantity >= originalTotalQuantity) {
            effectiveCorrectionType = "CANCELLATION";
            console.log('[FiskalyService] First correction includes all items, using CANCELLATION type');
          } else {
            effectiveCorrectionType = "REFUND";
            console.log('[FiskalyService] First correction includes partial items, using REFUND type');
          }
        }
      }
    } else if (!isFirstCorrection) {
      // If not the first correction, always use REFUND type
      effectiveCorrectionType = "REFUND";
      console.log('[FiskalyService] Not the first correction, using REFUND type');
    }

    const now = new Date();
    const signedTotal = -Math.abs(Number(params.amount || 0));

    const vatBase = await this.calculateVatPerTaxRate({
      organizationId: params.organizationId,
      orderId: params.orderId ?? original.orderId ?? null,
      reservationOrderId: params.reservationOrderId ?? original.reservationOrderId ?? null,
      context: 'correction',
    });

    const vatPerTaxRate = this.scaleVatPerTaxRate({
      vatPerTaxRate: vatBase,
      targetTotal: signedTotal,
    });

    if (config.fiskalyEnvironment === FiskalyEnvironment.TEST) {
      const signaturePayload: Prisma.InputJsonValue = {
        provider: "fiskaly",
        mode: "test",
        correctionType: effectiveCorrectionType,
        refundId: params.refundId ?? null,
        originalFiscalTransactionId: original.id,
        receiptNumber: params.receiptNumber ?? null,
        receiptDate: (params.receiptDate ?? now).toISOString(),
        amount: signedTotal,
        currency: params.currency,
        vatPerTaxRate,
        meta: params.meta ?? undefined,
      };

      const created = await prisma.fiscalTransactionCorrection.create({
        data: {
          organizationId: params.organizationId,
          branchId: params.branchId,
          deviceId: params.deviceId ?? null,
          orderId: params.orderId ?? null,
          reservationOrderId: params.reservationOrderId ?? null,
          refundId: params.refundId ?? null,
          fiscalTransactionId: original.id,
          type: effectiveCorrectionType,
          status: FiscalTransactionStatus.FINISHED,
          amount: Math.round(Number(params.amount || 0) * 100) / 100,
          currency: params.currency,
          metadata: params.meta ?? undefined,
          clientTransactionId: this.generateClientTransactionId(),
          tssTransactionId: `tss_test_${this.generateClientTransactionId()}`,
          startedAt: now,
          finishedAt: now,
          signaturePayload,
          lastAttemptAt: now,
          attemptCount: 1,
        },
      });

      return created;
    }

    if (config.fiskalyEnvironment !== FiskalyEnvironment.LIVE) {
      throw new Error(
        `Unsupported fiskalyEnvironment: ${String((config as any)?.fiskalyEnvironment)}`
      );
    }

    const tssId = String(config.fiskalyTssId || "").trim();
    if (!tssId) {
      throw new Error("Missing fiskalyTssId. Provision the organization TSS first (Save Fiskaly settings).");
    }

    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new Error(
        "Missing Fiskaly credentials: fiskalyClientId (api_key) and fiskalyClientSecret (api_secret)"
      );
    }

    const deviceId = params.deviceId ?? null;
    if (!deviceId) {
      const err: any = new Error("Missing deviceId for LIVE Fiskaly correction fiscalization");
      err.code = "POS_DEVICE_REQUIRED";
      throw err;
    }

    const device = await prisma.posDevice.findFirst({
      where: { id: deviceId, organizationId: params.organizationId, branchId: params.branchId },
      select: { id: true, fiskalyClientId: true },
    });

    const clientId = String(device?.fiskalyClientId || "").trim();
    if (!clientId) {
      const err: any = new Error("Selected POS device is not provisioned for Fiskaly.");
      err.code = "FISKALY_POS_DEVICE_NOT_PROVISIONED";
      throw err;
    }

    const existingFinished = await prisma.fiscalTransactionCorrection.findFirst({
      where: {
        organizationId: params.organizationId,
        fiscalTransactionId: original.id,
        ...(params.refundId ? { refundId: params.refundId } : {}),
        type: effectiveCorrectionType,
        status: FiscalTransactionStatus.FINISHED,
      },
    });
    if (existingFinished) return existingFinished;

    const clientTransactionId = this.generateClientTransactionId();
    const txId = uuidv4();

    const correction = await prisma.fiscalTransactionCorrection.create({
      data: {
        organizationId: params.organizationId,
        branchId: params.branchId,
        deviceId,
        orderId: params.orderId ?? null,
        reservationOrderId: params.reservationOrderId ?? null,
        refundId: params.refundId ?? null,
        fiscalTransactionId: original.id,
        type: effectiveCorrectionType,
        status: FiscalTransactionStatus.STARTED,
        amount: Math.round(Number(params.amount || 0) * 100) / 100,
        currency: params.currency,
        metadata: params.meta ?? undefined,
        clientTransactionId,
        tssTransactionId: txId,
        startedAt: now,
        lastAttemptAt: now,
        attemptCount: 1,
      },
    });

    try {
      const accessToken = await this.authenticate({ apiKey, apiSecret });

      const finalState = effectiveCorrectionType === "CANCELLATION" ? "CANCELLED" : "FINISHED";

      const currencyCode = this.normalizeCurrencyCode(params.currency);
      
      // Fetch original order payment details to handle split payments
      const orderId = params.orderId ?? original.orderId ?? null;
      let voucherAmount = 0;
      let totalAmount = 0;
      let hasVoucherPayment = false;
      let isSplitPayment = false;
      
      if (orderId) {
        const order = await prisma.order.findFirst({
          where: { id: orderId },
          select: {
            voucherPaymentAmount: true,
            totalAmount: true,
            paymentMethod: true,
            voucherCodes: true,
          },
        });
        
        voucherAmount = Number(order?.voucherPaymentAmount || 0);
        totalAmount = Number(order?.totalAmount || 0);
        
        if (voucherAmount > 0 && Array.isArray(order?.voucherCodes) && order.voucherCodes.length > 0) {
          hasVoucherPayment = true;
          const nonVoucherAmount = totalAmount - voucherAmount;
          isSplitPayment = voucherAmount > 0 && nonVoucherAmount > 0;
        }
      }
      
      const paymentType = this.resolvePaymentTypeFromMeta(params.meta);
      
      console.log('[FiskalyService] fiscalizeCorrection payment split:', { 
        voucherAmount, 
        totalAmount, 
        signedTotal, 
        hasVoucherPayment, 
        isSplitPayment 
      });

      // Construct amounts_per_payment_type for correction
      let amountsPerPaymentType;
      if (isSplitPayment && totalAmount > 0) {
        // Calculate refund ratio (if partial refund)
        const refundRatio = Math.abs(signedTotal) / totalAmount;
        const voucherRefund = -Math.round(voucherAmount * refundRatio * 100) / 100;
        const nonVoucherRefund = -Math.round((totalAmount - voucherAmount) * refundRatio * 100) / 100;
        
        console.log('[FiskalyService] fiscalizeCorrection refund ratio:', { refundRatio, voucherRefund, nonVoucherRefund });
        
        amountsPerPaymentType = [
          {
            payment_type: "NON_CASH",
            amount: this.formatFiskalyAmount(voucherRefund),
            currency_code: currencyCode,
          },
          {
            payment_type: paymentType,
            amount: this.formatFiskalyAmount(nonVoucherRefund),
            currency_code: currencyCode,
          },
        ];
      } else {
        // Single payment type
        amountsPerPaymentType = [
          {
            payment_type: paymentType,
            amount: this.formatFiskalyAmount(signedTotal),
            currency_code: currencyCode,
          },
        ];
      }
      
      console.log('[FiskalyService] fiscalizeCorrection amounts_per_payment_type:', amountsPerPaymentType);

      const basePayload = {
        state: "ACTIVE",
        client_id: clientId,
        process_type: "Kassenbeleg-V1",
        schema: {
          standard_v1: {
            receipt: {
              receipt_type: "RECEIPT",
              amounts_per_vat_rate: vatPerTaxRate.map(({ taxRate, amount }) => ({
                vat_rate: taxRate,
                amount: amount,
              })),
              amounts_per_payment_type: amountsPerPaymentType
            },
          },
        },
        process_data: {
          process_type: "Kassenbeleg-V1",
          provider: process.env.APP_NAME || "pos-system",
          mode: "live",
          clientTransactionId,
          orderId: params.orderId ?? null,
          reservationOrderId: params.reservationOrderId ?? null,
          receiptNumber: params.receiptNumber ?? null,
          receiptDate: (params.receiptDate ?? now).toISOString(),
          amount: signedTotal,
          currency: params.currency,
          meta: {
            ...(params.meta || {}),
            correctionType: effectiveCorrectionType,
            refundId: params.refundId ?? null,
            originalFiscalTransactionId: original.id,
          },
        },
        metadata: {
          orderId: params.orderId ?? undefined,
          reservationOrderId: params.reservationOrderId ?? undefined,
          refundId: params.refundId ?? undefined,
          app_branchId: params.branchId,
          app_correctionType: effectiveCorrectionType,
        },
      };

      let currentTx;
      try {
        currentTx = await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
          path: `/api/v2/tss/${tssId}/tx/${txId}`,
          method: "GET",
          token: accessToken,
        });
      } catch (err: any) {
        if (err?.fiskalyCode !== "E_TX_NOT_FOUND") throw err;
      }

      const nextRevision = currentTx ? currentTx.latest_revision + 1 : 1;

      await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/tx/${txId}`,
        method: "PUT",
        token: accessToken,
        query: { tx_revision: nextRevision },
        body: {
          ...basePayload,
          state: "ACTIVE",
        },
      });

      const finishedResp = await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/tx/${txId}`,
        method: "PUT",
        token: accessToken,
        query: { tx_revision: nextRevision + 1 },
        body: {
          ...basePayload,
          state: finalState,
        },
      });

      const qrCodeData = this.extractQrCodeData(finishedResp);

      const signaturePayload: Prisma.InputJsonValue = {
        provider: "fiskaly",
        mode: "live",
        correctionType: effectiveCorrectionType,
        refundId: params.refundId ?? null,
        originalFiscalTransactionId: original.id,
        tssId,
        clientId,
        txId,
        qrCodeData,
        response: finishedResp ?? null,
      };

      return await prisma.fiscalTransactionCorrection.update({
        where: { id: correction.id },
        data: {
          status: FiscalTransactionStatus.FINISHED,
          finishedAt: new Date(),
          signaturePayload,
          errorCode: null,
          errorMessage: null,
          lastAttemptAt: new Date(),
        },
      });
    } catch (err: any) {
      const code = err?.fiskalyCode ? String(err.fiskalyCode) : err?.code ? String(err.code) : null;
      const message = err?.fiskalyMessage
        ? String(err.fiskalyMessage)
        : err instanceof Error
          ? err.message
          : String(err);

      await prisma.fiscalTransactionCorrection.update({
        where: { id: correction.id },
        data: {
          status: FiscalTransactionStatus.FAILED,
          errorCode: code,
          errorMessage: message,
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      throw err;
    }
  }

  private generatePossibleUuidsForDevice(device: any, serialNumber: string): string[] {
    // Generate possible UUID patterns based on device properties
    const possibleUuids: string[] = [];
    
    // Common patterns that might have been used
    const patterns = [
      () => `${serialNumber.replace(/[^a-zA-Z0-9]/g, '')}-${device.id}`,
      () => `${device.id}-${serialNumber.replace(/[^a-zA-Z0-9]/g, '')}`,
      () => serialNumber.replace(/[^a-zA-Z0-9]/g, '') + device.id.replace(/[^a-zA-Z0-9]/g, ''),
      () => device.id.replace(/[^a-zA-Z0-9]/g, '') + serialNumber.replace(/[^a-zA-Z0-9]/g, ''),
    ];
    
    // Try each pattern
    for (const pattern of patterns) {
      try {
        const candidate = pattern();
        if (candidate && candidate.length > 10) { // Reasonable length check
          possibleUuids.push(candidate);
        }
      } catch (e) {
        // Skip invalid patterns
      }
    }
    
    return possibleUuids;
  }

  private async getOrgFiskalyConfig(
    prisma: Prisma.TransactionClient,
    organizationId: string
  ) {
    return prisma.settings.findFirst({
      where: { organizationId },
      select: {
        fiskalyEnabled: true,
        fiskalyEnvironment: true,
        fiskalyApiBaseUrl: true,
        fiskalyClientId: true,
        fiskalyClientSecret: true,
        fiskalyManagedOrganizationId: true,
        fiskalyTssId: true,
        fiskalyTssAdminPuk: true,
        fiskalyTssAdminPinEncrypted: true,
        fiskalyProvisioningStatus: true,
        fiskalyProvisioningLastErrorCode: true,
        fiskalyProvisioningLastErrorMessage: true,
        fiskalyProvisionedAt: true,
      },
    });
  }

  private getAdminPinEncryptionKey(): Buffer {
    const raw = process.env.FISKALY_ADMIN_PIN_ENC_KEY;
    if (!raw) {
      throw new Error(
        "Missing FISKALY_ADMIN_PIN_ENC_KEY env var (32-byte key, base64 or hex)"
      );
    }

    // Accept base64 or hex.
    const key = /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");

    if (key.length !== 32) {
      throw new Error(
        `Invalid FISKALY_ADMIN_PIN_ENC_KEY length: ${key.length} bytes (expected 32)`
      );
    }
    return key;
  }

  private encryptAdminPin(pin: string): string {
    const key = this.getAdminPinEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString("base64");
  }

  private decryptAdminPin(encrypted: string): string {
    const key = this.getAdminPinEncryptionKey();
    const buf = Buffer.from(encrypted, "base64");
    if (buf.length < 12 + 16 + 1) {
      throw new Error("Invalid encrypted admin PIN payload");
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  private generateAdminPin(): string {
    // 6-digit PIN
    const n = crypto.randomInt(0, 1_000_000);
    return String(n).padStart(6, "0");
  }

  private async fiskalyRequest<T>(params: {
    baseUrl: string;
    path: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    token?: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: any;
  }): Promise<T> {
    const url = new URL(params.path, params.baseUrl);
    if (params.query) {
      for (const [k, v] of Object.entries(params.query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      method: params.method,
      headers: {
        "content-type": "application/json",
        ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
      },
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // leave json null
    }

    if (!res.ok) {
      const code = json?.error?.code || json?.code || json?.error || res.status;
      const message =
        json?.error?.message || json?.message || text || `HTTP ${res.status}`;
      const err = new Error(`Fiskaly error (${code}): ${message}`);
      (err as any).fiskalyCode = code;
      (err as any).fiskalyMessage = message;
      (err as any).httpStatus = res.status;
      throw err;
    }

    return (json ?? ({} as any)) as T;
  }

  private async authenticate(params: {
    apiKey: string;
    apiSecret: string;
  }): Promise<string> {
    const resp = await this.fiskalyRequest<{ access_token: string }>({
      baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
      path: "/api/v2/auth",
      method: "POST",
      body: {
        api_key: params.apiKey,
        api_secret: params.apiSecret,
      },
    });
    if (!resp?.access_token) {
      throw new Error("Fiskaly auth succeeded but access_token missing in response");
    }
    return resp.access_token;
  }

  public async setTssStateForOrganization(params: {
    organizationId: string;
    state: "DISABLED" | "INITIALIZED";
  }) {
    const prisma = this.db.getPrisma();
    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);

    if (!config) {
      throw new Error("Organization settings not found");
    }

    const tssId = String(config.fiskalyTssId || "").trim();
    if (!tssId) {
      throw new Error("Missing fiskalyTssId");
    }

    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new Error("Missing Fiskaly API credentials");
    }

    const adminPinEnc = String(config.fiskalyTssAdminPinEncrypted || "").trim();
    if (!adminPinEnc) {
      throw new Error("Missing Fiskaly admin PIN");
    }

    const adminPin = this.decryptAdminPin(adminPinEnc);
    const accessToken = await this.authenticate({ apiKey, apiSecret });

    const patchTssState = async (state: string) => {
      return await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}`,
        method: "PATCH",
        token: accessToken,
        body: { state },
      });
    };

    try {
      await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/admin/auth`,
        method: "POST",
        token: accessToken,
        body: { admin_pin: adminPin },
      });
    } catch (e: any) {
      // Enabling a DISABLED TSS: Fiskaly may reject admin operations until the TSS is transitioned
      // out of DISABLED. In that case, do: DISABLED -> UNINITIALIZED -> (admin auth) -> INITIALIZED.
      if (params.state === "INITIALIZED" && e?.fiskalyCode === "E_TSS_DISABLED") {


        // Step 1: transition to UNINITIALIZED (no admin auth)
        const uninit = await patchTssState("UNINITIALIZED");

        // Step 2: admin auth should work now
        await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
          path: `/api/v2/tss/${tssId}/admin/auth`,
          method: "POST",
          token: accessToken,
          body: { admin_pin: adminPin },
        });
      } else {
        throw e;
      }
    }


    const tssInfo = await patchTssState(params.state);


    return {
      success: true,
      state: String(tssInfo?.state || params.state),
      tssInfo,
    };
  }

  /**
   * Provision or ensure the organization-level TSS is created and INITIALIZED.
   * This is intended to run when org Fiskaly settings are saved.
   */
  public async provisionOrganizationTss(params: { organizationId: string }) {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (!config) {
      throw new Error("Organization Settings not found");
    }

    if (config.fiskalyEnvironment !== FiskalyEnvironment.LIVE) {
      throw new Error("Provisioning is only supported when fiskalyEnvironment=LIVE");
    }

    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new Error(
        "Missing Fiskaly credentials: fiskalyClientId (api_key) and fiskalyClientSecret (api_secret)"
      );
    }

    const tssId = (config.fiskalyTssId || "").trim() || uuidv4();

    // Mark in progress (short DB call, no transaction held open)
    await prisma.settings.update({
      where: { organizationId: params.organizationId },
      data: {
        fiskalyTssId: tssId,
        fiskalyProvisioningStatus: FiskalyProvisioningStatus.IN_PROGRESS,
        fiskalyProvisioningLastErrorCode: null,
        fiskalyProvisioningLastErrorMessage: null,
      } as any,
    });

    try {
      const accessToken = await this.authenticate({ apiKey, apiSecret });

      // Set a timestamp immediately so it's never null
      await prisma.settings.update({
        where: { organizationId: params.organizationId },
        data: { fiskalyProvisionedAt: new Date() } as any,
      });

      // 1) Ensure TSS exists (backend host)
      // Try to fetch first to see current state
      let tssState: string | null = null;
      let adminPuk = String(config.fiskalyTssAdminPuk || "").trim();
      try {
        const existing = await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_BACKEND_HOST,
          path: `/api/v2/tss/${tssId}`,
          method: "GET",
          token: accessToken,
        });
        tssState = String(existing?.state || "").trim();
        adminPuk = adminPuk || String(existing?.admin_puk || existing?.adminPuk || "").trim();
      } catch (e: any) {
        // 404 means it doesn't exist; we'll create it
        if ((e as any).httpStatus === 404) {
        } else {
          throw e;
        }
      }

      // Create only if it doesn't exist
      if (!tssState) {
        const tssCreateResp = await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_BACKEND_HOST,
          path: `/api/v2/tss/${tssId}`,
          method: "PUT",
          token: accessToken,
          body: { state: "CREATED" },
        });
        adminPuk = adminPuk || String(tssCreateResp?.admin_puk || tssCreateResp?.adminPuk || "").trim();
      }

      if (!adminPuk) {
        throw new Error(
          "Fiskaly TSS exists but admin_puk missing; cannot continue provisioning"
        );
      }

      // Persist PUK immediately
      await prisma.settings.update({
        where: { organizationId: params.organizationId },
        data: { fiskalyTssAdminPuk: adminPuk } as any,
      });

      // 2) Set state UNINITIALIZED (middleware) only if needed
      if (tssState !== "INITIALIZED") {
        const uninitUrl = `${FiskalyService.FISKALY_MIDDLEWARE_HOST}/api/v2/tss/${tssId}`;
        await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
          path: `/api/v2/tss/${tssId}`,
          method: "PATCH",
          token: accessToken,
          body: { state: "UNINITIALIZED" },
        });
      } else {
      }

      // 3) Set admin PIN (backend host) only if not already set
      let pin: string | undefined;
      const existingEncrypted = String(config.fiskalyTssAdminPinEncrypted || "").trim();
      if (!existingEncrypted) {
        pin = this.generateAdminPin();
        const adminPinUrl = `${FiskalyService.FISKALY_MIDDLEWARE_HOST}/api/v2/tss/${tssId}/admin`;
        await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
          path: `/api/v2/tss/${tssId}/admin`,
          method: "PATCH",
          token: accessToken,
          body: {
            admin_puk: adminPuk,
            new_admin_pin: pin,
          },
        });
        // Persist admin PIN immediately
        await prisma.settings.update({
          where: { organizationId: params.organizationId },
          data: {
            fiskalyTssAdminPinEncrypted: this.encryptAdminPin(pin),
          } as any,
        });
      } else {
        pin = this.decryptAdminPin(existingEncrypted);
      }

      // 4) Admin auth (middleware)
      await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/admin/auth`,
        method: "POST",
        token: accessToken,
        body: {
          admin_pin: pin,
        },
      });

      // 5) Initialize TSS (middleware) only if needed
      if (tssState !== "INITIALIZED") {
        await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
          path: `/api/v2/tss/${tssId}`,
          method: "PATCH",
          token: accessToken,
          body: { state: "INITIALIZED" },
        });
      } else {
      }

      return await prisma.settings.update({
        where: { organizationId: params.organizationId },
        data: {
          fiskalyProvisioningStatus: FiskalyProvisioningStatus.READY,
          fiskalyProvisionedAt: new Date(),
          fiskalyProvisioningLastErrorCode: null,
          fiskalyProvisioningLastErrorMessage: null,
        } as any,
      });
    } catch (err: any) {
      const code = err?.fiskalyCode ? String(err.fiskalyCode) : null;
      const message = err?.fiskalyMessage
        ? String(err.fiskalyMessage)
        : err instanceof Error
          ? err.message
          : String(err);

      // Always set a timestamp so it's not null
      await prisma.settings.update({
        where: { organizationId: params.organizationId },
        data: {
          fiskalyProvisioningStatus: FiskalyProvisioningStatus.FAILED,
          fiskalyProvisionedAt: new Date(),
          fiskalyProvisioningLastErrorCode: code,
          fiskalyProvisioningLastErrorMessage: message,
        } as any,
      });

      throw err;
    }
  }

  private assertFiskalyEnabled(config: {
    fiskalyEnabled: boolean;
    fiskalyEnvironment: FiskalyEnvironment;
  } | null) {
    if (!config?.fiskalyEnabled) {
      throw new Error("Fiskaly is not enabled for this organization");
    }
  }

  /**
   * Ensure a FiscalTransaction exists for exactly one of (orderId, reservationOrderId).
   * Idempotent: returns existing if already created.
   */
  public async getOrCreateFiscalTransaction(
    prisma: Prisma.TransactionClient,
    params: {
      organizationId: string;
      branchId: string;
      deviceId?: string | null;
      orderId?: string | null;
      reservationOrderId?: string | null;
    }
  ) {
    const orderId = params.orderId ?? null;
    const reservationOrderId = params.reservationOrderId ?? null;

    if (!!orderId === !!reservationOrderId) {
      throw new Error(
        "Exactly one of orderId or reservationOrderId must be provided"
      );
    }

    const existing = await prisma.fiscalTransaction.findFirst({
      where: {
        organizationId: params.organizationId,
        OR: [
          orderId ? { orderId } : undefined,
          reservationOrderId ? { reservationOrderId } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (existing) return existing;

    const clientTransactionId = this.generateClientTransactionId();

    try {
      return await prisma.fiscalTransaction.create({
        data: {
          organizationId: params.organizationId,
          branchId: params.branchId,
          deviceId: params.deviceId ?? null,
          orderId,
          reservationOrderId,
          status: FiscalTransactionStatus.CREATED,
          clientTransactionId,
        },
      });
    } catch (err: any) {
      // If two requests raced, return the winner.
      if (err?.code === "P2002") {
        const again = await prisma.fiscalTransaction.findFirst({
          where: {
            organizationId: params.organizationId,
            OR: [
              orderId ? { orderId } : undefined,
              reservationOrderId ? { reservationOrderId } : undefined,
            ].filter(Boolean) as any,
          },
        });
        if (again) return again;
      }
      throw err;
    }
  }

  /**
   * Test-mode lifecycle:
   * - Validates org config is enabled
   * - Starts and finishes (idempotent)
   * - Persists signature payload in `signaturePayload`
   */
  public async fiscalizeTestMode(params: {
    organizationId: string;
    branchId: string;
    deviceId?: string | null;
    orderId?: string | null;
    reservationOrderId?: string | null;
    amount: number;
    currency: string;
    receiptNumber?: string;
    receiptDate?: Date;
    meta?: Record<string, any>;
  }) {
    const prisma = this.db.getPrisma();

    return prisma.$transaction(async (tx) => {
      const config = await this.getOrgFiskalyConfig(tx, params.organizationId);
      this.assertFiskalyEnabled(
        config
          ? {
              fiskalyEnabled: config.fiskalyEnabled,
              fiskalyEnvironment: config.fiskalyEnvironment,
            }
          : null
      );

      if (config?.fiskalyEnvironment !== FiskalyEnvironment.TEST) {
        throw new Error(
          "FiskalyService fiscalizeTestMode can only be used when fiskalyEnvironment=TEST"
        );
      }

      const ftx = await this.getOrCreateFiscalTransaction(tx, {
        organizationId: params.organizationId,
        branchId: params.branchId,
        deviceId: params.deviceId ?? null,
        orderId: params.orderId ?? null,
        reservationOrderId: params.reservationOrderId ?? null,
      });

      if (ftx.status === FiscalTransactionStatus.FINISHED) {
        return ftx;
      }

      const now = new Date();

      const signatureCounter =
        (await tx.fiscalTransaction.count({
          where: {
            organizationId: params.organizationId,
            deviceId: params.deviceId ?? null,
            status: FiscalTransactionStatus.FINISHED,
          },
        })) + 1;

      const started =
        ftx.status === FiscalTransactionStatus.STARTED
          ? ftx
          : await tx.fiscalTransaction.update({
              where: { id: ftx.id },
              data: {
                status: FiscalTransactionStatus.STARTED,
                startedAt: ftx.startedAt ?? now,
                lastAttemptAt: now,
                attemptCount: { increment: 1 },
                tssTransactionId:
                  ftx.tssTransactionId ?? `tss_test_${this.generateClientTransactionId()}`,
              },
            });

      const signaturePayload: Prisma.InputJsonValue = {
        provider: "fiskaly",
        mode: "test",
        clientTransactionId: started.clientTransactionId,
        tssTransactionId: started.tssTransactionId,
        signatureCounter,
        receiptNumber: params.receiptNumber ?? null,
        receiptDate: (params.receiptDate ?? now).toISOString(),
        amount: Math.round(params.amount * 100) / 100,
        currency: params.currency,
        signature: crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              org: params.organizationId,
              branch: params.branchId,
              orderId: params.orderId ?? null,
              reservationOrderId: params.reservationOrderId ?? null,
              amount: params.amount,
              currency: params.currency,
              at: now.toISOString(),
              nonce: this.generateClientTransactionId(),
            })
          )
          .digest("hex"),
        meta: params.meta ?? undefined,
      };

      const finished = await tx.fiscalTransaction.update({
        where: { id: started.id },
        data: {
          status: FiscalTransactionStatus.FINISHED,
          finishedAt: now,
          signaturePayload,
          errorCode: null,
          errorMessage: null,
          lastAttemptAt: now,
        },
      });

      return finished;
    });
  }

  /**
   * LIVE-mode lifecycle:
   * - Calls the real fiskaly SIGN DE API v2 (Middleware) to create+finish a transaction
   * - Persists the result in `fiscal_transactions`
   *
   * IMPORTANT: In this codebase, fiskalyEnvironment=LIVE is used to mean “real calls”.
   */
  private async calculateVatPerTaxRate(params: {
    organizationId: string;
    orderId?: string | null;
    reservationOrderId?: string | null;
    context?: 'sale' | 'correction';
  }): Promise<{ taxRate: string; amount: string }[]> {
    const prisma = this.db.getPrisma();
    
    if (!params.orderId && !params.reservationOrderId) {
      // If no order ID provided, fallback to default 19% VAT
      return [{ taxRate: "19", amount: "0.00" }];
    }

    // Check if the order was paid with a single-purpose voucher covering the full amount
    const orderId = params.orderId || params.reservationOrderId;
    let voucherAmount = 0;
    let totalAmount = 0;
    let hasSinglePurposeVoucher = false;
    let isPartialVoucherPayment = false;
    
    if (orderId) {
      const order = await (prisma as any).order.findFirst({
        where: { id: orderId },
        select: {
          totalAmount: true,
          voucherPaymentAmount: true,
          voucherCodes: true,
        },
      });

      console.log('[FiskalyService] calculateVatPerTaxRate - Order check:', {
        orderId,
        voucherPaymentAmount: order?.voucherPaymentAmount,
        voucherCodes: order?.voucherCodes,
        totalAmount: order?.totalAmount,
      });

      if (order && order.voucherPaymentAmount > 0 && Array.isArray(order.voucherCodes) && order.voucherCodes.length > 0) {
        // Check if any voucher is single-purpose
        const vouchers = await prisma.voucher.findMany({
          where: { voucherCode: { in: order.voucherCodes } },
          select: { voucherType: true, vatRate: true },
        });

        console.log('[FiskalyService] calculateVatPerTaxRate - Vouchers fetched:', {
          voucherCount: vouchers.length,
          vouchers: vouchers.map(v => ({ type: v.voucherType, vatRate: v.vatRate })),
        });

        hasSinglePurposeVoucher = vouchers.some(v => v.voucherType === "SINGLE_PURPOSE");
        voucherAmount = Number(order.voucherPaymentAmount);
        totalAmount = Number(order.totalAmount);

        // Check if it's a partial voucher payment (voucher doesn't cover full amount)
        isPartialVoucherPayment = hasSinglePurposeVoucher && voucherAmount > 0 && voucherAmount < totalAmount;

        console.log('[FiskalyService] calculateVatPerTaxRate - Voucher payment analysis:', {
          hasSinglePurposeVoucher,
          voucherAmount,
          totalAmount,
          isPartialVoucherPayment,
          isFullVoucherPayment: hasSinglePurposeVoucher && voucherAmount >= totalAmount,
        });

        // If single-purpose voucher covers the full order
        if (hasSinglePurposeVoucher && voucherAmount >= totalAmount) {
          const singlePurposeVoucher = vouchers.find(v => v.voucherType === "SINGLE_PURPOSE");
          if (singlePurposeVoucher && singlePurposeVoucher.vatRate) {
            // For both sales and corrections of voucher payments, return 0% VAT
            // Tax was already paid at voucher issuance
            console.log('[FiskalyService] calculateVatPerTaxRate - Full voucher payment (sale or correction), returning 0% VAT with full amount');
            return [{ taxRate: "0", amount: totalAmount.toFixed(2) }];
          }
          console.log('[FiskalyService] calculateVatPerTaxRate - Full voucher payment but no VAT rate, falling back to 0%');
          return [{ taxRate: "0", amount: "0.00" }];
        }
      }
    }

    // Get organization tax mapping settings
    const orgSettings = await this.getOrgFiskalyConfig(prisma, params.organizationId || "");
    
    // Flexible tax rate mapping - can be configured per organization
    const getTaxMapping = (): Record<string, string> => {
      // Default mapping - can be overridden by organization settings
      const defaultMapping: Record<string, string> = {
        "0": "0",      // Zero-rated
        "2": "7",      // Often maps to reduced rate
        "5": "7",      // Reduced rates
        "5.5": "5.5",  // French reduced rate
        "7": "7",      // German reduced rate
        "10": "10.7",  // Some countries have 10%
        "10.7": "10.7", // French intermediate rate
        "19": "19",    // German standard rate
        "20": "19",    // Many EU countries use 20%, map to 19%
        "21": "19",    // Some countries use 21%, map to 19%
        "25": "19",    // Some countries use 25%, map to 19%
      };
      
      // TODO: In future, this could be loaded from organization settings
      // For now, use the intelligent default mapping
      
      return defaultMapping;
    };
    
    // Helper function to map any tax percentage to Fiskaly format
    const mapToVatRate = (taxPercentage: number): string => {
      const mapping = getTaxMapping();
      const taxKey = taxPercentage.toString();
      
      // Direct mapping
      if (mapping[taxKey]) {
        return mapping[taxKey];
      }
      
      // Find closest match for unusual rates
      const taxRates = Object.keys(mapping).map(Number).sort((a, b) => a - b);
      let closest = taxRates[0];
      let minDiff = Math.abs(taxPercentage - closest);
      
      for (const rate of taxRates) {
        const diff = Math.abs(taxPercentage - rate);
        if (diff < minDiff) {
          minDiff = diff;
          closest = rate;
        }
      }
      
      return mapping[closest.toString()];
    };

    // Get order items with their tax information
    // Note: orderItemAddOns prices are already baked into item.totalPrice — do NOT add them separately
    const orderItems = await prisma.orderItem.findMany({
      where: {
        OR: [
          params.orderId ? { orderId: params.orderId } : undefined,
          params.reservationOrderId ? { reservationOrderId: params.reservationOrderId } : undefined,
        ].filter(Boolean) as any,
      },
    });

    // Fetch the parent order to get takeawayServiceFee and its tax rate
    const parentOrder = params.orderId
      ? await (prisma as any).order.findFirst({ where: { id: params.orderId }, select: { takeawayServiceFee: true, takeawayServiceTaxPercentage: true } })
      : params.reservationOrderId
      ? await (prisma as any).order.findFirst({ where: { id: params.reservationOrderId }, select: { takeawayServiceFee: true, takeawayServiceTaxPercentage: true } })
      : null;

    // Group amounts by tax rate
    const vatGroups = new Map<string, number>();
    
    // Calculate the ratio of non-voucher amount to total amount for proportional tax calculation
    const nonVoucherRatio = isPartialVoucherPayment ? (totalAmount - voucherAmount) / totalAmount : 1;
    
    console.log('[FiskalyService] calculateVatPerTaxRate:', { 
      isPartialVoucherPayment, 
      voucherAmount, 
      totalAmount, 
      nonVoucherRatio 
    });

    orderItems.forEach(item => {
      const itemTaxRate = mapToVatRate(Number(item.taxPercentage));
      // item.totalPrice is already post-discount and includes add-on prices — use it directly
      const itemAmount = Math.round((Number(item.totalPrice) || 0) * 100) / 100;
      
      // For partial voucher payments, only calculate tax on the non-voucher portion
      const taxableAmount = isPartialVoucherPayment ? Math.round(itemAmount * nonVoucherRatio * 100) / 100 : itemAmount;

      const currentAmount = vatGroups.get(itemTaxRate) || 0;
      vatGroups.set(itemTaxRate, Math.round((currentAmount + taxableAmount) * 100) / 100);
    });

    // Add takeaway service fee at its own tax rate (also proportional for split payments)
    const serviceFee = Math.round((Number(parentOrder?.takeawayServiceFee) || 0) * 100) / 100;
    if (serviceFee > 0) {
      const serviceTaxRate = mapToVatRate(Number(parentOrder?.takeawayServiceTaxPercentage) || 0);
      const taxableServiceAmount = isPartialVoucherPayment ? Math.round(serviceFee * nonVoucherRatio * 100) / 100 : serviceFee;
      const currentServiceAmount = vatGroups.get(serviceTaxRate) || 0;
      vatGroups.set(serviceTaxRate, Math.round((currentServiceAmount + taxableServiceAmount) * 100) / 100);
    }
    
    // For split payments, add 0% tax entry for the voucher portion
    if (isPartialVoucherPayment) {
      const currentZeroAmount = vatGroups.get("0") || 0;
      const voucherPortion = Math.round(voucherAmount * 100) / 100;
      vatGroups.set("0", Math.round((currentZeroAmount + voucherPortion) * 100) / 100);
    }

    // Convert to Fiskaly format — filter out zero-amount groups
    return Array.from(vatGroups.entries())
      .filter(([, amount]) => Math.abs(amount) >= 0.01)
      .map(([taxRate, amount]) => ({
        taxRate,
        amount: amount.toFixed(2),
      }));
  }

  public async fiscalizeLiveMode(params: {
    organizationId: string;
    branchId: string;
    deviceId?: string | null;
    orderId?: string | null;
    reservationOrderId?: string | null;
    amount: number;
    currency: string;
    receiptNumber?: string;
    receiptDate?: Date;
    meta?: Record<string, any>;
  }) {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma as any, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (!config) {
      throw new Error("Fiskaly is not configured for this organization");
    }

    if (config.fiskalyEnvironment !== FiskalyEnvironment.LIVE) {
      throw new Error(
        "FiskalyService fiscalizeLiveMode can only be used when fiskalyEnvironment=LIVE"
      );
    }

    const tssId = String(config.fiskalyTssId || "").trim();
    if (!tssId) {
      throw new Error(
        "Missing fiskalyTssId. Provision the organization TSS first (Save Fiskaly settings)."
      );
    }

    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    if (!apiKey || !apiSecret) {
      throw new Error(
        "Missing Fiskaly credentials: fiskalyClientId (api_key) and fiskalyClientSecret (api_secret)"
      );
    }

    // Idempotency: if the order already has a FINISHED fiscal transaction, return it even
    // if deviceId is missing (e.g. historical receipt rendering or non-operational reads).
    if (params.orderId || params.reservationOrderId) {
      const existingFinished = await prisma.fiscalTransaction.findFirst({
        where: {
          organizationId: params.organizationId,
          ...(params.orderId ? { orderId: params.orderId } : {}),
          ...(params.reservationOrderId ? { reservationOrderId: params.reservationOrderId } : {}),
          status: FiscalTransactionStatus.FINISHED,
        } as any,
      });
      if (existingFinished) {
        return existingFinished;
      }
    }

    const deviceId = params.deviceId ?? null;
    if (!deviceId) {
      throw new Error(
        "Missing deviceId for LIVE Fiskaly fiscalization (x-pos-device-id header not provided or device not found for branch)"
      );
    }

    const device = await (prisma as any).posDevice.findFirst({
      where: { id: deviceId, organizationId: params.organizationId, branchId: params.branchId },
      select: {
        id: true,
        fiskalyClientId: true,
        fiskalyClientSerialNumber: true,
        deviceCode: true,
      },
    });

    const clientId = String(device?.fiskalyClientId || "").trim();
    if (!clientId) {
      throw new Error(
        "POS device is missing fiskalyClientId. Provision the POS device client first (device provisioning)."
      );
    }

    // Create/mark the DB record first (idempotent), then do network calls.
    // Important: ensure only one request does the network calls when multiple requests race.
    const { ftxId, txId, clientTransactionId, skipNetwork } = await prisma.$transaction(async (tx) => {
      const ftx = await this.getOrCreateFiscalTransaction(tx as any, {
        organizationId: params.organizationId,
        branchId: params.branchId,
        deviceId,
        orderId: params.orderId ?? null,
        reservationOrderId: params.reservationOrderId ?? null,
      });

      if (ftx.status === FiscalTransactionStatus.FINISHED) {
        return {
          ftxId: ftx.id,
          txId: String(ftx.tssTransactionId || "").trim(),
          clientTransactionId: ftx.clientTransactionId,
          skipNetwork: true,
        };
      }

      if (ftx.status === FiscalTransactionStatus.STARTED) {
        const last = ftx.lastAttemptAt ? new Date(ftx.lastAttemptAt) : null;
        const now = new Date();

        // If another request just started fiscalizing this same order, do NOT send again.
        // Allow retry only if the STARTED record is stale (e.g. prior crash).
        const isRecent = last ? now.getTime() - last.getTime() < 30_000 : false;
        if (isRecent) {
          return {
            ftxId: ftx.id,
            txId: String(ftx.tssTransactionId || "").trim(),
            clientTransactionId: ftx.clientTransactionId,
            skipNetwork: true,
          };
        }
      }

      const now = new Date();
      const ensuredTxId = String(ftx.tssTransactionId || "").trim() || uuidv4();

      const updated =
        ftx.status === FiscalTransactionStatus.STARTED
          ? await (tx as any).fiscalTransaction.update({
              where: { id: ftx.id },
              data: {
                lastAttemptAt: now,
                attemptCount: { increment: 1 },
                tssTransactionId: ensuredTxId,
              },
            })
          : await (tx as any).fiscalTransaction.update({
              where: { id: ftx.id },
              data: {
                status: FiscalTransactionStatus.STARTED,
                startedAt: ftx.startedAt ?? now,
                lastAttemptAt: now,
                attemptCount: { increment: 1 },
                tssTransactionId: ensuredTxId,
              },
            });

      return {
        ftxId: updated.id,
        txId: ensuredTxId,
        clientTransactionId: updated.clientTransactionId,
        skipNetwork: false,
      };
    });

    // If it was already finished, return it.
    const existing = await prisma.fiscalTransaction.findUnique({ where: { id: ftxId } });
    if (existing?.status === FiscalTransactionStatus.FINISHED) return existing;

    // Another request is already fiscalizing this transaction.
    // Return the current DB state without doing any network calls.
    if (skipNetwork) {
      return existing;
    }

    try {
      const accessToken = await this.authenticate({ apiKey, apiSecret });
      const now = new Date();

      // Validate and format amount for Fiskaly
      if (!params.amount || isNaN(Number(params.amount)) || Number(params.amount) <= 0) {
        throw new Error(`Invalid amount for fiscalization: ${params.amount}. Amount must be a positive number.`);
      }
      
      const formatAmount = (value: number) => {
        const rounded = Math.round(value * 100) / 100;
        return rounded.toFixed(2); // Always returns string with 2 decimal places
      };
      
      const formattedAmount = formatAmount(Number(params.amount));

      const currencyCode = this.normalizeCurrencyCode(params.currency);
      
      // Fetch order to get payment split details
      let paymentType = this.resolvePaymentTypeFromMeta(params.meta);
      const orderId = params.orderId ?? params.reservationOrderId;
      let voucherAmount = 0;
      let nonVoucherAmount = 0;
      let hasVoucherPayment = false;
      
      if (orderId) {
        const order = await prisma.order.findFirst({
          where: { id: orderId },
          select: {
            voucherPaymentAmount: true,
            totalAmount: true,
            voucherCodes: true,
            paymentMethod: true,
          },
        });
        
        voucherAmount = Number(order?.voucherPaymentAmount || 0);
        const totalAmount = Number(order?.totalAmount || 0);
        nonVoucherAmount = totalAmount - voucherAmount;
        
        if (voucherAmount > 0 && Array.isArray(order?.voucherCodes) && order.voucherCodes.length > 0) {
          hasVoucherPayment = true;
          // If partial voucher payment, keep the original payment method for non-voucher portion
          if (nonVoucherAmount > 0) {
            paymentType = this.resolvePaymentTypeFromMeta(params.meta);
          } else {
            // Full voucher payment, force NON_CASH
            paymentType = "NON_CASH";
          }
        }
      }

      console.log('[FiskalyService] fiscalizeLiveMode metadata:', params.meta);
      console.log('[FiskalyService] fiscalizeLiveMode payment split:', { voucherAmount, nonVoucherAmount, paymentType });
      
      // Construct amounts_per_payment_type
      let amountsPerPaymentType;
      if (hasVoucherPayment && voucherAmount > 0 && nonVoucherAmount > 0) {
        // Split payment: voucher + other payment method
        amountsPerPaymentType = [
          {
            payment_type: "NON_CASH",
            amount: this.formatFiskalyAmount(voucherAmount),
            currency_code: currencyCode,
          },
          {
            payment_type: paymentType,
            amount: this.formatFiskalyAmount(nonVoucherAmount),
            currency_code: currencyCode,
          },
        ];
      } else {
        // Single payment type
        amountsPerPaymentType = [
          {
            payment_type: paymentType,
            amount: formattedAmount,
            currency_code: currencyCode,
          },
        ];
      }
      
      console.log('[FiskalyService] fiscalizeLiveMode amounts_per_payment_type:', amountsPerPaymentType);
      
      // Calculate VAT per tax rate from order items
      const vatPerTaxRate = await this.calculateVatPerTaxRate({
        organizationId: params.organizationId,
        orderId: params.orderId ?? null,
        reservationOrderId: params.reservationOrderId ?? null,
        context: 'sale',
      });

      const basePayload = {
        state: "ACTIVE",
        client_id: clientId,
        process_type: "Kassenbeleg-V1",
        schema: {
          standard_v1: {
            receipt: {
              receipt_type: "RECEIPT",
              amounts_per_vat_rate: vatPerTaxRate.map(({ taxRate, amount }) => ({
                vat_rate: taxRate,
                amount: amount,
              })),
              amounts_per_payment_type: amountsPerPaymentType
            }
          }
        },
        process_data: {
          process_type: "Kassenbeleg-V1",
          provider: process.env.APP_NAME || "pos-system",
          mode: "live",
          clientTransactionId,
          orderId: params.orderId ?? null,
          reservationOrderId: params.reservationOrderId ?? null,
          receiptNumber: params.receiptNumber ?? null,
          receiptDate: (params.receiptDate ?? now).toISOString(),
          amount: Math.round(params.amount * 100) / 100,
          currency: params.currency,
          meta: params.meta ?? undefined,
        },
        metadata: {
          orderId: params.orderId ?? undefined,
          reservationOrderId: params.reservationOrderId ?? undefined,
          receiptNumber: params.receiptNumber ?? undefined,
          app_branchId: params.branchId,
        },
      };

      // Removed verbose payload logging

      // Get current transaction to determine the correct revision
      let currentTx;
      try {
        currentTx = await this.fiskalyRequest<any>({
          baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
          path: `/api/v2/tss/${tssId}/tx/${txId}`,
          method: "GET",
          token: accessToken,
        });
        // Removed verbose transaction logging
      } catch (err: any) {
        if (err?.fiskalyCode === 'E_TX_NOT_FOUND') {
          // Transaction doesn't exist, will create new one
        } else {
          throw err;
        }
      }

      // Determine next revision
      const nextRevision = currentTx ? currentTx.latest_revision + 1 : 1;
      // Removed verbose revision logging

      // Start/update transaction
      await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/tx/${txId}`,
        method: "PUT",
        token: accessToken,
        query: { tx_revision: nextRevision },
        body: {
          ...basePayload,
          state: currentTx ? "ACTIVE" : "ACTIVE", // Keep ACTIVE for both new and existing
        },
      });

      // Finish transaction with next revision
      const finishedResp = await this.fiskalyRequest<any>({
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${tssId}/tx/${txId}`,
        method: "PUT",
        token: accessToken,
        query: { tx_revision: nextRevision + 1 },
        body: {
          ...basePayload,
          state: "FINISHED",
        },
      });

      const qrCodeData = this.extractQrCodeData(finishedResp);

      const signaturePayload: Prisma.InputJsonValue = {
        provider: "fiskaly",
        mode: "live",
        tssId,
        clientId,
        txId,
        qrCodeData,
        response: finishedResp ?? null,
      };

      return await prisma.fiscalTransaction.update({
        where: { id: ftxId },
        data: {
          status: FiscalTransactionStatus.FINISHED,
          finishedAt: new Date(),
          signaturePayload,
          errorCode: null,
          errorMessage: null,
          lastAttemptAt: new Date(),
        },
      });
    } catch (err: any) {
      const code = err?.fiskalyCode ? String(err.fiskalyCode) : null;
      const message = err?.fiskalyMessage
        ? String(err.fiskalyMessage)
        : err instanceof Error
          ? err.message
          : String(err);

      await prisma.fiscalTransaction.update({
        where: { id: ftxId },
        data: {
          status: FiscalTransactionStatus.FAILED,
          errorCode: code,
          errorMessage: message,
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      throw err;
    }
  }

  /**
   * Unified entrypoint:
   * - fiskalyEnvironment=TEST  -> simulated mode (writes fiscal_transactions, no network)
   * - fiskalyEnvironment=LIVE  -> real calls to Fiskaly middleware (writes fiscal_transactions, does network)
   */
  public async fiscalize(params: {
    organizationId: string;
    branchId: string;
    deviceId?: string | null;
    orderId?: string | null;
    reservationOrderId?: string | null;
    amount: number;
    currency: string;
    receiptNumber?: string;
    receiptDate?: Date;
    meta?: Record<string, any>;
  }) {
    const prisma = this.db.getPrisma();
    const config = await this.getOrgFiskalyConfig(prisma as any, params.organizationId);
    this.assertFiskalyEnabled(
      config
        ? {
            fiskalyEnabled: config.fiskalyEnabled,
            fiskalyEnvironment: config.fiskalyEnvironment,
          }
        : null
    );

    if (config?.fiskalyEnvironment === FiskalyEnvironment.TEST) {
      return this.fiscalizeTestMode(params);
    }
    if (config?.fiskalyEnvironment === FiskalyEnvironment.LIVE) {
      return this.fiscalizeLiveMode(params);
    }

    throw new Error(
      `Unsupported fiskalyEnvironment: ${String((config as any)?.fiskalyEnvironment)}`
    );
  }

  public async markFailed(params: {
    fiscalTransactionId: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    const prisma = this.db.getPrisma();
    return prisma.fiscalTransaction.update({
      where: { id: params.fiscalTransactionId },
      data: {
        status: FiscalTransactionStatus.FAILED,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  public async decommissionFiskalyForOrganization(params: { organizationId: string }) {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    if (!config || !config.fiskalyTssId) {
      throw new Error("Fiskaly TSS not configured for this organization");
    }

    const fiskalyBackendBaseUrl = this.getFiskalyBackendBaseUrl(config);

    let apiDeactivationSuccessful = false;
    let deactivationDetails: any = null;

    try {
      const accessToken = await this.authenticate({
        apiKey: String(config.fiskalyClientId || "").trim(),
        apiSecret: String(config.fiskalyClientSecret || "").trim(),
      });

      // Try to deactivate TSS (this may not be supported by Fiskaly API)
      try {
        const response = await this.fiskalyRequest<any>({
          method: "PUT",
          baseUrl: fiskalyBackendBaseUrl,
          path: `/api/v0/tss/${config.fiskalyTssId}/deactivate`,
          token: accessToken,
        });
        apiDeactivationSuccessful = true;
        deactivationDetails = response;
      } catch (deactivateErr: any) {
        // If deactivation endpoint doesn't exist, fall back to manual workflow
        if (deactivateErr?.status === 404 || deactivateErr?.fiskalyCode === "E_NOT_FOUND") {
          console.info("TSS deactivation not supported via API, falling back to manual workflow");
        } else {
          throw deactivateErr;
        }
      }

      // Revoke API credentials if possible
      try {
        await this.fiskalyRequest<any>({
          method: "DELETE",
          baseUrl: fiskalyBackendBaseUrl,
          path: "/api/v0/auth/credentials",
          token: accessToken,
        });
      } catch (revokeErr: any) {
        console.warn("Failed to revoke credentials via API:", revokeErr.message);
      }
    } catch (err: any) {
      console.warn("API-based deactivation failed, using manual workflow:", err.message);
    }

    // Update local state
    await prisma.settings.update({
      where: { organizationId: params.organizationId },
      data: {
        fiskalyEnabled: false,
        fiskalyTssAdminPuk: null,
        fiskalyTssAdminPinEncrypted: null,
        fiskalyClientId: null,
        fiskalyClientSecret: null,
        fiskalyProvisioningStatus: "FAILED",
        fiskalyProvisionedAt: null,
        fiskalyProvisioningLastErrorCode: apiDeactivationSuccessful ? null : "MANUAL_DECOMMISSION",
        fiskalyProvisioningLastErrorMessage: apiDeactivationSuccessful
          ? null
          : "TSS must be manually deactivated in Fiskaly dashboard",
      },
    });

    // Clear per-device Fiskaly clients
    await prisma.posDevice.updateMany({
      where: { organizationId: params.organizationId },
      data: {
        fiskalyClientId: null,
        fiskalyClientSerialNumber: null,
        fiskalyClientProvisioningStatus: null,
        fiskalyClientProvisioningLastErrorCode: null,
        fiskalyClientProvisioningLastErrorMessage: null,
      },
    });

    return {
      success: true,
      apiDeactivationSuccessful,
      requiresManualAction: !apiDeactivationSuccessful,
      deactivationDetails,
      message: apiDeactivationSuccessful
        ? "TSS deactivated via API"
        : "TSS must be manually deactivated in Fiskaly dashboard",
    };
  }

  public async recommissionFiskalyForOrganization(params: { organizationId: string }) {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);
    if (!config || !config.fiskalyTssId || !config.fiskalyClientId || !config.fiskalyClientSecret) {
      throw new Error("Fiskaly not configured for this organization");
    }

    const fiskalyBackendBaseUrl = String(
      config.fiskalyApiBaseUrl || FiskalyService.FISKALY_BACKEND_HOST
    ).trim();

    // Generate new API credentials
    const newClientId = uuidv4();
    const newClientSecret = crypto.randomBytes(32).toString("hex");

    try {
      const accessToken = await this.authenticate({
        apiKey: String(config.fiskalyClientId || "").trim(),
        apiSecret: String(config.fiskalyClientSecret || "").trim(),
      });

      // Try to reactivate TSS (if supported)
      try {
        await this.fiskalyRequest<any>({
          method: "PUT",
          baseUrl: fiskalyBackendBaseUrl,
          path: `/api/v0/tss/${config.fiskalyTssId}/reactivate`,
          token: accessToken,
        });
      } catch (reactivateErr: any) {
        if (reactivateErr?.status === 404) {
          console.info("TSS reactivation not supported via API, may require manual action");
        } else {
          throw reactivateErr;
        }
      }

      // Update credentials in our system
      await prisma.settings.update({
        where: { organizationId: params.organizationId },
        data: {
          fiskalyEnabled: true,
          fiskalyClientId: newClientId,
          fiskalyClientSecret: newClientSecret,
          fiskalyProvisioningStatus: "READY",
          fiskalyProvisionedAt: new Date(),
          fiskalyProvisioningLastErrorCode: null,
          fiskalyProvisioningLastErrorMessage: null,
        },
      });

      return {
        success: true,
        newClientId,
        message: "TSS reactivated and new credentials generated",
      };
    } catch (err: any) {
      await prisma.settings.update({
        where: { organizationId: params.organizationId },
        data: {
          fiskalyProvisioningStatus: "FAILED",
          fiskalyProvisioningLastErrorCode: err.code || "RECOMMISSION_FAILED",
          fiskalyProvisioningLastErrorMessage: err.message,
        },
      });
      throw err;
    }
  }

  /**
   * Verify Fiskaly TSS status for an organization.
   * Checks if TSS is active/inactive via Fiskaly API.
   */
  public async verifyFiskalyStatus(params: {
    organizationId: string;
  }) {
    const prisma = this.db.getPrisma();

    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);

    if (!config || !config.fiskalyTssId) {
      return {
        success: false,
        status: "NOT_CONFIGURED",
        message: "Fiskaly TSS not configured",
      };
    }

    // Check if credentials are available
    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    
    if (!apiKey || !apiSecret) {
      return {
        success: false,
        status: "CREDENTIALS_MISSING",
        message: "API credentials are missing or empty",
      };
    }

    try {
      const accessToken = await this.authenticate({
        apiKey,
        apiSecret,
      });

      const tssInfo = await this.fiskalyRequest<any>({
        method: "GET",
        baseUrl: FiskalyService.FISKALY_MIDDLEWARE_HOST,
        path: `/api/v2/tss/${config.fiskalyTssId}`,
        token: accessToken,
      });

      const state = String(tssInfo?.state || "UNKNOWN");
      const isActive = state === "INITIALIZED";

      const result = {
        success: true,
        status: isActive ? "ACTIVE" : "INACTIVE",
        state,
        tssInfo,
        message: isActive ? "TSS is active" : "TSS is inactive",
      };
      return result;
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        return {
          success: false,
          status: "CREDENTIALS_INVALID",
          message: "API credentials are invalid or revoked",
        };
      }
      if (
        err.status === 404 ||
        err.fiskalyCode === "E_TSS_NOT_FOUND" ||
        err.fiskalyCode === "E_NOT_FOUND"
      ) {
        return {
          success: false,
          status: "TSS_NOT_FOUND",
          message: "TSS not found in Fiskaly",
        };
      }
      return {
        success: false,
        status: "ERROR",
        message: err.message || "Failed to verify TSS status",
      };
    }
  }

  /**
   * Update Managed Organization settings on Fiskaly (KassenSichV Management API v2)
   */
  public async updateFiskalyOrganization(params: {
    organizationId: string;
    name: string;
    street: string;
    postalCode: string;
    city: string;
    countryCode: string;
    taxNumber: string;
    vatIdNumber: string;
  }) {
    const prisma = this.db.getPrisma();
    const config = await this.getOrgFiskalyConfig(prisma, params.organizationId);

    if (!config || !config.fiskalyClientId || !config.fiskalyClientSecret || !config.fiskalyManagedOrganizationId) {
      throw new Error("Fiskaly is not fully configured for this organization");
    }

    const apiKey = String(config.fiskalyClientId || "").trim();
    const apiSecret = String(config.fiskalyClientSecret || "").trim();
    const accessToken = await this.authenticate({ apiKey, apiSecret });

    let countryCode = params.countryCode.trim().toUpperCase();
    if (countryCode.length === 2) {
      if (countryCode === "DE") countryCode = "DEU";
    }
    if (countryCode.length !== 3) {
      countryCode = "DEU";
    }

    const patchResp = await this.fiskalyRequest<any>({
      baseUrl: FiskalyService.FISKALY_BACKEND_HOST,
      path: "/api/v2/organizations",
      method: "PATCH",
      token: accessToken,
      body: {
        name: params.name,
        address: {
          street: params.street,
          postal_code: params.postalCode,
          city: params.city,
          country_code: countryCode,
        },
        tax_number: params.taxNumber,
        vat_id_number: params.vatIdNumber,
      },
    });
    console.log(`[Fiskaly][DEBUG] PATCH /api/v2/organizations response:`, JSON.stringify(patchResp, null, 2));
    return patchResp;
  }
}

export default FiskalyService;
