import DatabaseSingleton from "../config/database";
import { Prisma } from "@prisma/client";
import BusinessDayReportService from "./businessDayReportService";
import { getFiskalyConfigSnapshot, shouldFiscalize } from "../utils/fiscalization";
import { FiskalyService } from "./fiskalyService";
import FiscalQueueWorker from "./fiscalQueueWorker";
import { v4 as uuidv4 } from "uuid";
import DsfinvkService from "./dsfinvkService";
import { version as appVersion } from "../../package.json";
import {
  buildCashPointClosingPayload,
  stripTssTxIds,
  DsfinvkBuilderContext,
} from "./dsfinvk";

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
      }>;
    };

export class BusinessDayService {
  private static instance: BusinessDayService;
  private db = DatabaseSingleton.getInstance();


  private constructor() {}

  public async getDsfinvkCashPointClosingDetails(sessionId: string): Promise<any> {
    const prisma = this.db.getPrisma() as any;

    const session = await prisma.businessDaySession.findUnique({
      where: { id: sessionId },
      select: { id: true, branchId: true },
    });
    if (!session?.id) {
      const err: any = new Error("Business day session not found");
      err.code = "BUSINESS_DAY_SESSION_NOT_FOUND";
      throw err;
    }

    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { id: true, organizationId: true },
    });
    const organizationId = String(branch?.organizationId || "").trim();
    if (!organizationId) {
      const err: any = new Error("Missing organizationId for business day session");
      err.code = "BUSINESS_DAY_ORG_MISSING";
      throw err;
    }

    const submission = await prisma.businessDayDsfinvkSubmission.findUnique({
      where: { sessionId: session.id },
      select: { cashPointClosingExportId: true },
    });

    const closingId = String(submission?.cashPointClosingExportId || "").trim();
    if (!closingId) {
      const err: any = new Error("No DSFinV-K cash point closing id stored for this session");
      err.code = "DSFINVK_CLOSING_ID_MISSING";
      throw err;
    }

    const dsfinvk = DsfinvkService.getInstance();
    const token = await dsfinvk.getToken({ internalOrganizationId: organizationId });
    return dsfinvk.retrieveCashPointClosingDetails({
      internalOrganizationId: organizationId,
      closingId,
      token,
    });
  }

  private getDsfinvkEodEnvironment(): "AUTO" | "TEST" | "LIVE" | "OFF" {
    const raw = String(process.env.DSFINVK_EOD_ENVIRONMENT || "").trim().toUpperCase();
    if (raw === "TEST") return "TEST";
    if (raw === "LIVE") return "LIVE";
    if (raw === "OFF") return "OFF";
    return "AUTO";
  }

  private shouldSubmitDsfinvk(params: {
    fiskalyConfig: Awaited<ReturnType<typeof getFiskalyConfigSnapshot>> | null;
  }): boolean {
    const config = params.fiskalyConfig;
    if (!shouldFiscalize(config)) return false;

    const mode = this.getDsfinvkEodEnvironment();
    if (mode === "OFF") return false;

    // In this codebase, fiskalyEnvironment=LIVE means "real calls". fiskalyEnvironment=TEST
    // is a stub mode and must never trigger DSFinV-K submissions.
    const env = String(config?.environment || "").toUpperCase();
    if (mode === "TEST") return env === "LIVE";
    if (mode === "LIVE") return env === "LIVE";
    return env === "LIVE";
  }

  private async requireLivePosDevice(params: {
    prisma: any;
    branchId: string;
    organizationId: string;
    deviceId?: string | null;
  }): Promise<{ deviceId: string; fiskalyClientId: string }> {
    const headerDeviceId = String(params.deviceId || "").trim();
    if (!headerDeviceId) {
      const err: any = new Error("POS device selection is required.");
      err.code = "POS_DEVICE_REQUIRED";
      err.data = { reason: "MISSING_HEADER" };
      throw err;
    }

    const deviceInOrg = await (params.prisma as any).posDevice.findFirst({
      where: {
        id: headerDeviceId,
        organizationId: params.organizationId,
      },
      select: {
        id: true,
        branchId: true,
        isActive: true,
        isDeleted: true,
        fiskalyClientId: true,
      },
    });

    if (!deviceInOrg?.id) {
      const err: any = new Error("Selected POS device was not found for this organization.");
      err.code = "POS_DEVICE_REQUIRED";
      err.data = {
        reason: "DEVICE_NOT_IN_ORG",
        deviceId: headerDeviceId,
        organizationId: params.organizationId,
        requiredBranchId: params.branchId,
      };
      throw err;
    }

    if (deviceInOrg.isDeleted || deviceInOrg.isActive === false) {
      const err: any = new Error("Selected POS device is inactive. Please select an active device.");
      err.code = "POS_DEVICE_REQUIRED";
      err.data = {
        reason: "DEVICE_INACTIVE",
        deviceId: headerDeviceId,
        deviceBranchId: String(deviceInOrg.branchId || "").trim() || null,
        requiredBranchId: params.branchId,
      };
      throw err;
    }

    const deviceBranchId = String(deviceInOrg.branchId || "").trim();
    if (deviceBranchId && deviceBranchId !== params.branchId) {
      const err: any = new Error("Selected POS device is not available for this branch.");
      err.code = "POS_DEVICE_REQUIRED";
      err.data = {
        reason: "DEVICE_BRANCH_MISMATCH",
        deviceId: headerDeviceId,
        deviceBranchId,
        requiredBranchId: params.branchId,
      };
      throw err;
    }

    const fiskalyClientId = String((deviceInOrg as any)?.fiskalyClientId || "").trim();
    if (!fiskalyClientId) {
      const err: any = new Error(
        "This tablet is not connected to a Fiskaly POS device yet. Please provision/select a Fiskaly device for this tablet and try again."
      );
      err.code = "FISKALY_POS_DEVICE_NOT_PROVISIONED";
      err.data = {
        deviceId: headerDeviceId,
        branchId: params.branchId,
      };
      throw err;
    }

    return { deviceId: headerDeviceId, fiskalyClientId };
  }

  private formatBusinessDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  private async submitDsfinvkForClosing(params: {
    tx: Prisma.TransactionClient;
    branchId: string;
    sessionId: string;
    startedAt: Date;
    endedAt: Date;
    deviceId?: string | null;
    stripTssTxIds?: boolean;
  }): Promise<
    | { ok: true; data: any }
    | { ok: false; error: string; data?: any }
  > {
    const prismaAny = params.tx as any;

    const branch = await prismaAny.branch.findUnique({
      where: { id: params.branchId },
      select: { id: true, organizationId: true },
    });

    const organizationId = String(branch?.organizationId || "").trim();
    if (!organizationId) {
      return { ok: false, error: "Missing organizationId for branch" };
    }

    const config = await getFiskalyConfigSnapshot(prismaAny, organizationId);
    if (!shouldFiscalize(config)) {
      return { ok: true, data: { skipped: true, reason: "Fiskaly disabled" } };
    }

    const dsfinvkMode = this.getDsfinvkEodEnvironment();
    if (dsfinvkMode === "OFF") {
      return { ok: true, data: { skipped: true, reason: "DSFinV-K EOD disabled" } };
    }

    const fiskalyEnv = String(config?.environment || "").toUpperCase();
    if ((dsfinvkMode === "TEST" || dsfinvkMode === "LIVE") && fiskalyEnv !== "LIVE") {
      return { ok: true, data: { skipped: true, reason: "Fiskaly not LIVE" } };
    }
    if (dsfinvkMode === "AUTO" && fiskalyEnv !== "LIVE") {
      return { ok: true, data: { skipped: true, reason: "Fiskaly not LIVE" } };
    }

    const deviceId = String(params.deviceId || "").trim();
    if (!deviceId) {
      return {
        ok: false,
        error: "Missing deviceId (x-pos-device-id) required for DSFinV-K cash register mapping",
      };
    }

    const device = await prismaAny.posDevice.findFirst({
      where: { id: deviceId, branchId: params.branchId, isDeleted: false },
      select: { id: true, name: true, deviceCode: true, fiskalyClientId: true },
    });

    if (!device?.id) {
      return { ok: false, error: "POS device not found for branch" };
    }

    const cashRegisterId = String((device as any)?.fiskalyClientId || "").trim();
    if (!cashRegisterId) {
      return {
        ok: false,
        error:
          "Missing Fiskaly client id for POS device. Provision the POS device/client in Fiskaly first (so posDevice.fiskalyClientId is set), then retry closing.",
      };
    }

    const cashRegisterExportId = String(device.deviceCode || device.id);

    const dsfinvk = DsfinvkService.getInstance();

    let token: string;
    let fiskalyOrganizationId: string;
    let settings: any;
    try {
      settings = await prismaAny.settings.findFirst({
        where: { organizationId },
        select: {
          fiskalyManagedOrganizationId: true,
          taxNumber: true,
          vatId: true,
          fiscalName: true,
        },
      });

      const fromSettings = String(settings?.fiskalyManagedOrganizationId || "").trim();
      const fromEnv = String(process.env.DSFINVK_ORGANIZATION_ID || "").trim();

      fiskalyOrganizationId = fromSettings || fromEnv;
      if (!fiskalyOrganizationId) {
        return {
          ok: false,
          error:
            "Missing Fiskaly managed organization id for DSFinV-K. Set Settings.fiskalyManagedOrganizationId for this organization (tablet app Fiskaly settings) or set DSFINVK_ORGANIZATION_ID env var.",
        };
      }

      token = await dsfinvk.getToken({ internalOrganizationId: organizationId });
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }

    const businessDate = this.formatBusinessDate(params.endedAt);

    const session = await prismaAny.businessDaySession.findUnique({
      where: { id: params.sessionId },
      select: { sequenceNumber: true },
    });

    const cashPointClosingExportNumber = Number(session?.sequenceNumber ?? 0);
    const exportCreationDate = Math.floor(Date.now() / 1000);

    const posDevices = await prismaAny.posDevice.findMany({
      where: { organizationId, isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        deviceCode: true,
        fiskalyClientId: true,
        fiskalyClientSerialNumber: true,
      },
    });

    const eligibleOrders = await prismaAny.order.findMany({
      where: {
        branchId: params.branchId,
        replacementOrders: { none: {} },
        status: { in: ["DELIVERED", "PICKED_UP", "CANCELLED"] },
        OR: [
          { businessDaySessionId: params.sessionId },
          { postedAt: { gte: params.startedAt, lt: params.endedAt } },
          { postedAt: null, createdAt: { gte: params.startedAt, lt: params.endedAt } },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        totalAmount: true,
        deliveryFee: true,
        takeawayServiceFee: true,
        takeawayServiceTaxAmount: true,
        takeawayServiceTaxPercentage: true,
        currency: true,
        createdAt: true,
        postedAt: true,
        discountAmount: true,
        discountType: true,
        discountValue: true,
        voucherPaymentAmount: true,
        voucherCodes: true,
        orderItems: {
          select: {
            id: true,
            itemType: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            taxPercentage: true,
            selectedSize: true,
            itemDiscountType: true,
            itemDiscountAmount: true,
            itemSurchargeAmount: true,
            parentDealItemId: true,
            meal: { select: { name: true, sku: true, category: { select: { id: true, name: true } } } },
            deal: { select: { name: true, sku: true } },
            dealComponent: { select: { name: true } },
            orderItemAddOns: {
              select: {
                addOnName: true,
                addOnPrice: true,
                taxAmount: true,
                taxPercentage: true,
                quantity: true,
                addon_id: true,
                addon: { select: { sku: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        fiscalTransaction: {
          select: { status: true, signaturePayload: true, errorMessage: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const correctionRows = await prismaAny.fiscalTransactionCorrection.findMany({
      where: {
        organizationId,
        branchId: params.branchId,
        status: "FINISHED",
        createdAt: { gte: params.startedAt, lt: params.endedAt },
        orderId: { in: (eligibleOrders as any[]).map((o: any) => o.id) },
      },
      select: {
        id: true,
        orderId: true,
        refundId: true,
        type: true,
        amount: true,
        currency: true,
        signaturePayload: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const builderCtx: DsfinvkBuilderContext = {
      organizationId,
      cashRegisterId,
      cashRegisterExportId,
      cashPointClosingExportNumber,
      exportCreationDate,
      businessDate,
      orders: eligibleOrders as any[],
      corrections: correctionRows as any[],
      posDevices: posDevices as any[],
      settings: {
        fiscalName: settings?.fiscalName ?? null,
        taxNumber: settings?.taxNumber ?? null,
        vatId: settings?.vatId ?? null,
      },
    };

    let { payload } = buildCashPointClosingPayload(builderCtx);

    // Strip tss_tx_ids if requested (fallback for transactions not found in SIGN DE)
    if (params.stripTssTxIds) {
      console.warn(`[DSFinV-K][DIAG] Stripping tss_tx_ids from payload as requested`);
      const stripTssTxIdsFn = (await import("./dsfinvk/cashPointClosingPayloadBuilder")).stripTssTxIds;
      payload = stripTssTxIdsFn(payload);
    }

    for (const tx of payload.transactions as any[]) {
      const txId = tx?.head?.transaction_export_id || "?";
      const txLines: any[] = tx?.data?.lines || [];
      for (const line of txLines) {
        const lid = line?.lineitem_export_id || "?";
        const subItems: any[] = line?.sub_items || [];
        const hasPriceFindings = Boolean(line?.price_findings);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const cashPointClosingExportId = DsfinvkService.stableId(
      `${organizationId}:${params.branchId}:${params.sessionId}`
    );

    try {
      // insertCashRegister upserts the cash register with latest tax/fiscal data from DB.
      // STNR and USTID in cashpointclosing.csv are sourced from the cash_register record
      // (tax_number and vat_id fields), so this is the correct and only place to push them.
      const cashRegisterResp = await dsfinvk.insertCashRegister({
        internalOrganizationId: organizationId,
        fiskalyOrganizationId,
        cashRegisterId,
        cashRegisterExportId,
        brand: settings?.fiscalName || null,
        model: device.name || "pos",
        softwareBrand: settings?.fiscalName || null,
        softwareVersion: appVersion,
        taxNumber: settings?.taxNumber || null,
        vatId: settings?.vatId || null,
        token,
      });

      const payloadHasDetailedCsvData = payload.transactions.some((tx: any) => {
        const txLines = tx.data?.lines || [];
        return (
          (tx.head?.references || []).length > 0 ||
          (tx.data?.references || []).length > 0 ||
          txLines.some((l: any) =>
            (l.sub_items || []).length > 0 ||
            Boolean(l.price_findings)
          )
        );
      });

      let effectiveClosingId = cashPointClosingExportId;
      let closingCreatedAt: Date | null = null;
      try {
        try {
          await dsfinvk.insertCashPointClosing({
            internalOrganizationId: organizationId,
            fiskalyOrganizationId,
            cashRegisterId,
            cashPointClosingExportId: effectiveClosingId,
            cashPointClosingExportNumber,
            payload,
            token,
          });
          closingCreatedAt = new Date();
        } catch (e: any) {
          const httpStatus = Number(e?.httpStatus || 0);
          const msg = String(e?.fiskalyMessage || e?.message || e?.response?.data?.message || "");
          console.warn(`[DSFinV-K][DIAG] insertCashPointClosing failed: httpStatus=${httpStatus}, msg=${msg}`);
          console.warn(`[DSFinV-K][DIAG] Error details:`, JSON.stringify(e?.response?.data || e, null, 2));
          if (msg.toLowerCase().includes("transaction not found in sign de")) {
            console.warn(`[DSFinV-K][DIAG] Falling back to stripTssTxIds payload (lines preserved, sub_items intact)`);
            // Fiskaly can't find these TSS transactions — strip tss_tx_id and use error_message instead
            effectiveClosingId = DsfinvkService.stableId(
              `${organizationId}:${params.branchId}:${params.sessionId}:nosign`
            );
            await dsfinvk.insertCashPointClosing({
              internalOrganizationId: organizationId,
              fiskalyOrganizationId,
              cashRegisterId,
              cashPointClosingExportId: effectiveClosingId,
              cashPointClosingExportNumber,
              payload: stripTssTxIds(payload),
              token,
            });
            closingCreatedAt = new Date();
          } else {
            throw e;
          }
        }
      } catch (e: any) {
        const httpStatus = Number(e?.httpStatus || 0);
        const code = String(e?.response?.data?.code || "").trim();
        if (httpStatus === 409 || code === "E_CASH_POINT_CLOSING_CONFLICT") {
          console.warn(`[DSFinV-K][DIAG] 409 conflict — closing already exists in Fiskaly. Re-exporting old data; new sub_items will NOT appear.`);
          // A closing with this closing_id already exists. Check its state:
          // - COMPLETED: reuse it, proceed to export
          // - ERROR / anything else: create a new closing_id and retry
          let existingState = "UNKNOWN";
          let existing: any = null;
          try {
            existing = await dsfinvk.retrieveCashPointClosingDetails({
              internalOrganizationId: organizationId,
              closingId: effectiveClosingId,
              token,
            });
            existingState = String((existing as any)?.state || "").toUpperCase();
          } catch {
            existingState = "NOT_FOUND";
          }

          if (existingState !== "COMPLETED") {
            effectiveClosingId = DsfinvkService.stableId(
              `${organizationId}:${params.branchId}:${params.sessionId}:${Date.now()}`
            );
            try {
              await dsfinvk.insertCashPointClosing({
                internalOrganizationId: organizationId,
                fiskalyOrganizationId,
                cashRegisterId,
                cashPointClosingExportId: effectiveClosingId,
                cashPointClosingExportNumber,
                payload: stripTssTxIds(payload),
                token,
              });
              closingCreatedAt = new Date();
            } catch (retryErr: any) {
              const retryMsg = String(retryErr?.fiskalyMessage || retryErr?.message || retryErr?.response?.data?.message || "");
              if (retryMsg.toLowerCase().includes("transaction not found in sign de")) {
                // Already stripped — something else is wrong, rethrow with context
                throw new Error(`DSFinV-K SIGN DE error after stripping tss_tx_ids: ${retryMsg}`);
              }
              throw retryErr;
            }
          } else {
            if (existing && typeof existing.creation_date === "number") {
              closingCreatedAt = new Date(existing.creation_date * 1000);
            }
          }
          // If COMPLETED, fall through — the polling loop below will pick up COMPLETED immediately
        } else {
          throw e;
        }
      }

      // DSFinV-K processes cash point closings asynchronously. Triggering an export immediately can
      // fail with E_CASH_POINT_CLOSING_NOT_FOUND. Wait until the closing reaches COMPLETED.
      // Poll up to 60 times × 2s = 120s max
      let closingCompleted = false;
      for (let i = 0; i < 60; i++) {
        const details = await dsfinvk.retrieveCashPointClosingDetails({
          internalOrganizationId: organizationId,
          closingId: effectiveClosingId,
          token,
        });
        const state = String((details as any)?.state || "").toUpperCase();
        if (state === "COMPLETED") {
          closingCompleted = true;
          break;
        }
        if (state === "ERROR") {
          throw new Error(
            String((details as any)?.error?.message || "DSFinV-K cash point closing entered ERROR state")
          );
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!closingCompleted) {
        throw new Error("DSFinV-K cash point closing did not reach COMPLETED state within 120 seconds");
      }

      // Generate a fresh UUID v4 for each export to prevent Fiskaly from serving cached results
      const exportId = uuidv4();

      // To prevent exporting multiple cash point closings in a single export (which happens if multiple closings 
      // exist within the session start/end timeframe, e.g. during testing or repeated attempts), 
      // we constrain the export window tightly around the exact creation time of this specific closing.
      const closingTime = closingCreatedAt || new Date();
      const exportStartDate = Math.floor(closingTime.getTime() / 1000) - 10;
      const exportEndDate = Math.floor(closingTime.getTime() / 1000) + 10;

      let effectiveExportId = exportId;
      let exportResp: any;
      try {
        exportResp = await dsfinvk.triggerExport({
          internalOrganizationId: organizationId,
          exportId: effectiveExportId,
          cashRegisterId,
          startDate: exportStartDate,
          endDate: exportEndDate,
          token,
        });
      } catch (e: any) {
        const httpStatus = Number(e?.httpStatus || 0);
        const code = String(e?.response?.data?.code || "").trim();
        const msg = String(e?.response?.data?.message || "").toLowerCase();
        if (httpStatus === 409 || code === "E_EXPORT_CONFLICT") {
          // Export ID already exists. Prefer reusing the existing export for idempotency.
          try {
            exportResp = await dsfinvk.retrieveExportDetails({
              internalOrganizationId: organizationId,
              exportId: effectiveExportId,
              token,
            });
          } catch {
            // As a fallback (e.g. export cannot be retrieved), create a new export id.
            effectiveExportId = uuidv4();
            exportResp = await dsfinvk.triggerExport({
              internalOrganizationId: organizationId,
              exportId: effectiveExportId,
              cashRegisterId,
              startDate: exportStartDate,
              endDate: exportEndDate,
              token,
            });
          }
        } else if (httpStatus === 400 && (code === "E_FAILED_SCHEMA_VALIDATION" || msg.includes("format"))) {
          // Schema validation error on format field - export likely exists with different format.
          // Create a new export ID to avoid conflict.
          effectiveExportId = uuidv4();
          exportResp = await dsfinvk.triggerExport({
            internalOrganizationId: organizationId,
            exportId: effectiveExportId,
            cashRegisterId,
            startDate: exportStartDate,
            endDate: exportEndDate,
            token,
          });
        } else {
          throw e;
        }
      }

      return {
        ok: true,
        data: {
          fiskalyOrganizationId,
          cashRegisterId,
          cashRegisterExportId,
          cashPointClosingExportId: effectiveClosingId,
          exportId: effectiveExportId,
          cashRegisterResp,
          exportResp,
        },
      };
    } catch (e: any) {
      const upstreamUrl = String(e?.request?.url || "").trim();
      const msg =
        e?.fiskalyMessage ||
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "DSFinV-K submission failed";

      // Check if this is a "Transaction not found in SIGN DE" error and apply the same fallback
      if (msg.toLowerCase().includes("transaction not found in sign de")) {
        console.warn(`[DSFinV-K][DIAG] Transaction not found error caught in outer handler. This indicates the error came from a different API call (e.g., triggerExport or polling).`);
        console.warn(`[DSFinV-K][DIAG] Error details:`, JSON.stringify(e?.response?.data || e, null, 2));
        return {
          ok: false,
          error: msg,
          data: {
            fiskalyOrganizationId,
            upstream: e?.response?.data || null,
            requiresFallback: true,
          },
        };
      }

      const withUrl = upstreamUrl ? `${String(msg)} (${upstreamUrl})` : String(msg);
      return {
        ok: false,
        error: withUrl,
        data: {
          fiskalyOrganizationId,
          upstream: e?.response?.data || null,
        },
      };
    }
  }

  public static getInstance(): BusinessDayService {
    if (!BusinessDayService.instance) {
      BusinessDayService.instance = new BusinessDayService();
    }
    return BusinessDayService.instance;
  }

  public async getOrCreateOpenSession(branchId: string) {
    const prisma = this.db.getPrisma() as any;
    const open = await prisma.businessDaySession.findFirst({
      where: { branchId, status: "OPEN" },
      orderBy: { startedAt: "desc" },
    });

    if (open) return open;

    const max = await prisma.businessDaySession.findFirst({
      where: { branchId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });

    return prisma.businessDaySession.create({
      data: {
        branchId,
        sequenceNumber: (max?.sequenceNumber || 0) + 1,
        status: "OPEN",
      },
    });
  }

  public async getCurrentSessionWithCounts(branchId: string): Promise<{
    session: any;
    counts: { orderCount: number; reservationOrderCount: number; totalCount: number };
  }> {
    const prisma = this.db.getPrisma() as any;
    const session = await this.getOrCreateOpenSession(branchId);

    await prisma.$transaction(async (tx: any) => {
      await this.attachUnassignedOrdersToSession(tx, branchId, session.id, session.startedAt);
      await this.attachUnassignedReservationOrdersToSession(tx, branchId, session.id, session.startedAt);
    });

    const [orderCount, reservationOrderCount] = await Promise.all([
      prisma.order.count({ where: { branchId, businessDaySessionId: session.id } }),
      prisma.reservationOrder.count({ where: { branchId, businessDaySessionId: session.id } }),
    ]);

    return {
      session,
      counts: {
        orderCount: Number(orderCount || 0),
        reservationOrderCount: Number(reservationOrderCount || 0),
        totalCount: Number(orderCount || 0) + Number(reservationOrderCount || 0),
      },
    };
  }

  private async attachUnassignedOrdersToSession(
    tx: Prisma.TransactionClient,
    branchId: string,
    sessionId: string,
    startedAt: Date
  ) {
    await (tx as any).order.updateMany({
      where: {
        branchId,
        businessDaySessionId: null,
        postedAt: { gte: startedAt },
      },
      data: { businessDaySessionId: sessionId },
    });
  }

  private async attachUnassignedReservationOrdersToSession(
    tx: Prisma.TransactionClient,
    branchId: string,
    sessionId: string,
    startedAt: Date
  ) {
    await (tx as any).reservationOrder.updateMany({
      where: {
        branchId,
        businessDaySessionId: null,
        postedAt: { gte: startedAt },
      },
      data: { businessDaySessionId: sessionId },
    });
  }

  public async validateClose(
    branchId: string,
    options?: { deviceId?: string | null }
  ): Promise<BusinessDayCloseValidation> {
    const prisma = this.db.getPrisma() as any;
    const session = await this.getOrCreateOpenSession(branchId);

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { organizationId: true },
    });
    const organizationId = String(branch?.organizationId || "").trim();
    if (organizationId) {
      const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
      if (this.shouldSubmitDsfinvk({ fiskalyConfig: config })) {
        await this.requireLivePosDevice({
          prisma,
          branchId,
          organizationId,
          deviceId: options?.deviceId ?? null,
        });
      }
    }

    await prisma.$transaction(async (tx: any) => {
      await this.attachUnassignedOrdersToSession(
        tx,
        branchId,
        session.id,
        session.startedAt
      );

      await this.attachUnassignedReservationOrdersToSession(
        tx,
        branchId,
        session.id,
        session.startedAt
      );
    });

    
    const orders = await prisma.order.findMany({
      where: {
        branchId,
        businessDaySessionId: session.id,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        postedAt: true,
        isScheduledOrder: true,
        scheduledDate: true,
        replacementOrders: { select: { id: true } },
        fiscalTransaction: {
          select: {
            status: true,
          },
        },
        payment: {
          select: {
            paymentProvider: true,
          },
        },
      },
    });

    const reservationOrders = await prisma.reservationOrder.findMany({
      where: {
        branchId,
        businessDaySessionId: session.id,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        postedAt: true,
        payment: {
          select: {
            paymentProvider: true,
          },
        },
      },
    });

    const isCleared = (o: (typeof orders)[number]) => {
      const status = String(o.status);
      const paymentStatus = String((o as any).paymentStatus);

      const isScheduled = Boolean((o as any).isScheduledOrder);
      const scheduledDateRaw = (o as any).scheduledDate as Date | null | undefined;
      const isScheduledForToday = (() => {
        if (!isScheduled || !scheduledDateRaw) return false;
        const d = new Date(scheduledDateRaw);
        if (Number.isNaN(d.getTime())) return false;
        const now = new Date();
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      })();

      // If an order has been replaced by a newer order, it must never block closing.
      // It is operationally superseded and fiscally handled by the replacement + any refund/delta flows.
      if (((o as any).replacementOrders || []).length > 0) return true;

      // Scheduled/future orders that are not fiscally posted yet must NOT block EOD.
      // They will be posted later (when fiscally finalized) and then belong to that later business day.
      if (isScheduled && !(o as any).postedAt && !isScheduledForToday) return true;

      // Any pending payment should block closing. This protects against orders stuck in payment flows.
      if (paymentStatus === "PENDING") return false;

      // Treat terminal order statuses as complete for End of Day closing.
      // Only non-terminal statuses should block closing.
      return status === "DELIVERED" || status === "PICKED_UP" || status === "CANCELLED";
    };

    const closeBlockReason = (o: any): string => {
      if (o?.isScheduledOrder && !o?.postedAt) {
        return "Scheduled order is not posted yet (ignored for EOD)";
      }

      const paymentStatus = String(o.paymentStatus);
      if (paymentStatus === "PENDING") {
        return "Payment is still pending for this order";
      }

      const status = String(o.status);
      return `Order is not cleared (status: ${status})`;
    };

    const blockingOrders = ([] as any[])
      .concat(orders as any, reservationOrders as any)
      .filter((o: any) => {
        const cleared = isCleared(o);
        return !cleared;
      })
      .map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: String(o.status),
        paymentStatus: String(o.paymentStatus),
        paymentMethod: String(o.paymentMethod),
        reason: closeBlockReason(o),
      }));

    if (blockingOrders.length > 0) {
      return { ok: false, blockingOrders };
    }

    // Check if there are pending fiscalization items for orders in this session
    // This prevents closing the business day before background fiscalization completes
    if (organizationId) {
      const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
      if (shouldFiscalize(config)) {
        const orderIds = orders.map((o: any) => o.id);
        const pendingFiscalization = await prisma.fiscalSigningQueue.findMany({
          where: {
            orderId: { in: orderIds },
            status: { in: ["PENDING", "PROCESSING", "FAILED"] },
          },
          select: {
            orderId: true,
            status: true,
            attempts: true,
            errorMessage: true,
          },
        });

        if (pendingFiscalization.length > 0) {
          const pendingOrderNumbers = await prisma.order.findMany({
            where: {
              id: { in: pendingFiscalization.map((p: any) => p.orderId) },
            },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              paymentStatus: true,
              paymentMethod: true,
              fiscalTransaction: {
                select: {
                  status: true,
                },
              },
            },
          });

          // Filter out orders that have successful fiscalization (FINISHED) even if they have stale FAILED queue entries
          const fiscalBlockingOrders = pendingOrderNumbers
            .filter((o: any) => o.fiscalTransaction?.status !== "FINISHED")
            .map((o: any) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              status: String(o.status),
              paymentStatus: String(o.paymentStatus),
              paymentMethod: String(o.paymentMethod),
              reason: "Order is awaiting fiscalization (SIGN DE signature)",
            }));

          // Log orders that were skipped due to having successful fiscalization
          const skippedOrders = pendingOrderNumbers.filter((o: any) => o.fiscalTransaction?.status === "FINISHED");


          if (fiscalBlockingOrders.length > 0) {
            return { ok: false, blockingOrders: fiscalBlockingOrders };
          }
        }
      }
    }

    return { ok: true };
  }

  private async reconcileFiskalyForClosing(params: {
    tx: Prisma.TransactionClient;
    branchId: string;
    sessionId: string;
    startedAt: Date;
    endedAt: Date;
    deviceId?: string | null;
  }): Promise<
    | { ok: true }
    | {
        ok: false;
        blockingOrders: Array<{
          id: string;
          orderNumber: string;
          status: string;
          paymentStatus: string;
          paymentMethod: string;
          reason: string;
        }>;
      }
  > {
    const prismaAny = params.tx as any;

    const branch = await prismaAny.branch.findUnique({
      where: { id: params.branchId },
      select: { id: true, organizationId: true },
    });

    const organizationId = branch?.organizationId as string | null | undefined;
    const config = await getFiskalyConfigSnapshot(prismaAny, organizationId);
    if (!shouldFiscalize(config)) {
      return { ok: true };
    }

    const requireDeviceForLive = String(config?.environment || "") === "LIVE";
    if (requireDeviceForLive && !params.deviceId) {
      return {
        ok: false,
        blockingOrders: [
          {
            id: "",
            orderNumber: "",
            status: "",
            paymentStatus: "",
            paymentMethod: "",
            reason:
              "POS device is required to fiscalize in LIVE mode (missing x-pos-device-id header)",
          },
        ],
      };
    }

    const timeWindow = {
      gte: params.startedAt,
      lt: params.endedAt,
    };

    const eligibleOrders = await prismaAny.order.findMany({
      where: {
        branchId: params.branchId,
        replacementOrders: { none: {} },
        status: { in: ["DELIVERED", "PICKED_UP"] },
        paymentStatus: "PAID",
        OR: [
          { postedAt: timeWindow },
          { postedAt: null, createdAt: timeWindow },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        totalAmount: true,
        currency: true,
        postedAt: true,
        fiscalTransaction: { select: { status: true, errorMessage: true } },
      },
    });

    const fiskaly = FiskalyService.getInstance();
    const failures: Array<{
      id: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      paymentMethod: string;
      reason: string;
    }> = [];

    for (const o of eligibleOrders as any[]) {
      const fStatus = String(o?.fiscalTransaction?.status || "");
      const isFinished = fStatus === "FINISHED";
      if (isFinished) {
        if (!o.postedAt) {
          await prismaAny.order.update({
            where: { id: o.id },
            data: {
              postedAt: new Date(),
              businessDaySessionId: params.sessionId,
            },
          });
        }
        continue;
      }

      try {
        await fiskaly.fiscalize({
          organizationId: String(organizationId),
          branchId: params.branchId,
          deviceId: params.deviceId ?? null,
          orderId: o.id,
          amount: Number(o.totalAmount || 0),
          currency: String(o.currency || "usd"),
          receiptNumber: String(o.orderNumber || o.id),
          meta: {
            paymentMethod: String(o.paymentMethod || "").trim() || null,
          },
        });

        await prismaAny.order.update({
          where: { id: o.id },
          data: {
            postedAt: o.postedAt || new Date(),
            businessDaySessionId: params.sessionId,
          },
        });
      } catch (e: any) {
        const msg =
          e?.fiskalyMessage ||
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          "Fiskaly fiscalization failed";
        
        console.warn(`[EOD Close] Fiscalization failed for order ${o.orderNumber || o.id}: ${msg}. Enqueueing to background queue...`);
        
        // Save the order details and associate it with the session so it isn't orphaned
        await prismaAny.order.update({
          where: { id: o.id },
          data: {
            postedAt: o.postedAt || new Date(),
            businessDaySessionId: params.sessionId,
          },
        });

        // Enqueue to the background queue for late-fiscalization
        const queueWorker = FiscalQueueWorker.getInstance();
        await queueWorker.enqueue(o.id);
      }
    }

    // Do not block closing the day on Fiskaly signing issues.
    // Outage logs are registered automatically by the queue worker on its first run or we can log it here.
    return { ok: true };
  }

  private async computeReportData(sessionId: string, prismaOverride?: any) {
    return BusinessDayReportService.getInstance().computeReportData(sessionId, prismaOverride);
  }


  public async closeDay(
    branchId: string,
    closedByUserId?: string,
    options?: { deviceId?: string | null }
  ) {
    const prisma = this.db.getPrisma() as any;

    return prisma.$transaction(async (tx: any) => {
      const session = await tx.businessDaySession.findFirst({
        where: { branchId, status: "OPEN" },
        orderBy: { startedAt: "desc" },
      });

      if (!session) {
        const created = await this.getOrCreateOpenSession(branchId);
        return { session: created, report: null };
      }

      await this.attachUnassignedOrdersToSession(
        tx,
        branchId,
        session.id,
        session.startedAt
      );

      await this.attachUnassignedReservationOrdersToSession(
        tx,
        branchId,
        session.id,
        session.startedAt
      );

      const validation = await this.validateClose(branchId, { deviceId: options?.deviceId ?? null });
      if (!validation.ok) {
        const err: any = new Error("BUSINESS_DAY_BLOCKED");
        err.code = "BUSINESS_DAY_BLOCKED";
        err.blockingOrders = validation.blockingOrders;
        throw err;
      }

      const endedAt = new Date();

      const fiskalyReconcile = await this.reconcileFiskalyForClosing({
        tx,
        branchId,
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt,
        deviceId: options?.deviceId ?? null,
      });
      if (!fiskalyReconcile.ok) {
        const err: any = new Error("BUSINESS_DAY_FISKALY_BLOCKED");
        err.code = "BUSINESS_DAY_FISKALY_BLOCKED";
        err.blockingOrders = fiskalyReconcile.blockingOrders;
        throw err;
      }

      let dsfinvkResult: any = null;
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { organizationId: true },
      });
      const organizationId = String(branch?.organizationId || "").trim();
      const fiskalyConfig = organizationId
        ? await getFiskalyConfigSnapshot(tx as any, organizationId)
        : null;
      const shouldSubmitDsfinvk = this.shouldSubmitDsfinvk({ fiskalyConfig });

      if (shouldSubmitDsfinvk) {

        let dsfinvk = await this.submitDsfinvkForClosing({
          tx,
          branchId,
          sessionId: session.id,
          startedAt: session.startedAt,
          endedAt,
          deviceId: options?.deviceId ?? null,
        });

        dsfinvkResult = dsfinvk;

        // If the error indicates transactions not found in SIGN DE and requires fallback,
        // retry by stripping tss_tx_ids from the payload
        if (!dsfinvk.ok && dsfinvk.data?.requiresFallback) {
          console.warn(`[BusinessDay] DSFinV-K submission failed with "Transaction not found in SIGN DE" error. Retrying with stripped tss_tx_ids.`);
          dsfinvk = await this.submitDsfinvkForClosing({
            tx,
            branchId,
            sessionId: session.id,
            startedAt: session.startedAt,
            endedAt,
            deviceId: options?.deviceId ?? null,
            stripTssTxIds: true,
          });
          dsfinvkResult = dsfinvk;
        }

        try {
          const ok = Boolean((dsfinvk as any)?.ok);
          const data = (dsfinvk as any)?.data || null;
          const error = ok ? null : String((dsfinvk as any)?.error || "DSFinV-K submission failed");
          await (tx as any).businessDayDsfinvkSubmission.upsert({
            where: { sessionId: session.id },
            update: {
              ok,
              error,
              fiskalyOrganizationId: String(data?.fiskalyOrganizationId || "") || null,
              cashRegisterId: String(data?.cashRegisterId || "") || null,
              cashRegisterExportId: String(data?.cashRegisterExportId || "") || null,
              cashPointClosingExportId: String(data?.cashPointClosingExportId || "") || null,
              exportId: String(data?.exportId || "") || null,
              payload: dsfinvk as any,
            },
            create: {
              sessionId: session.id,
              ok,
              error,
              fiskalyOrganizationId: String(data?.fiskalyOrganizationId || "") || null,
              cashRegisterId: String(data?.cashRegisterId || "") || null,
              cashRegisterExportId: String(data?.cashRegisterExportId || "") || null,
              cashPointClosingExportId: String(data?.cashPointClosingExportId || "") || null,
              exportId: String(data?.exportId || "") || null,
              payload: dsfinvk as any,
            },
          });
        } catch {
          // ignore persistence failure to avoid blocking close day when fiskaly submission succeeded
        }

        if (!dsfinvk.ok) {
          console.error("[BusinessDay] DSFinV-K EOD submission failed", {
            branchId,
            sessionId: session.id,
            deviceId: String(options?.deviceId || "").trim() || null,
            error: dsfinvk.error,
            data: dsfinvk.data || null,
          });
          const err: any = new Error("BUSINESS_DAY_DSFINVK_BLOCKED");
          err.code = "BUSINESS_DAY_DSFINVK_BLOCKED";
          err.dsfinvk = dsfinvk;
          throw err;
        }
      }

      await tx.businessDaySession.update({
        where: { id: session.id },
        data: {
          status: "CLOSED",
          endedAt,
          closedByUserId: closedByUserId || null,
        },
      });

      // IMPORTANT: compute report using the same transaction so we see the updated endedAt.
      const reportData = await this.computeReportData(session.id, tx);

      const report = await tx.businessDayReport.upsert({
        where: { sessionId: session.id },
        update: {
          data: {
            ...(reportData as any),
            dsfinvk: dsfinvkResult,
          } as any,
        },
        create: {
          sessionId: session.id,
          data: {
            ...(reportData as any),
            dsfinvk: dsfinvkResult,
          } as any,
        },
      } as any);

      const nextMax = await tx.businessDaySession.findFirst({
        where: { branchId },
        orderBy: { sequenceNumber: "desc" },
        select: { sequenceNumber: true },
      });

      const newSession = await tx.businessDaySession.create({
        data: {
          branchId,
          sequenceNumber: (nextMax?.sequenceNumber || 0) + 1,
          status: "OPEN",
        },
      });

      return { closedSession: session, report, newSession };
    }, { timeout: 180000 });
  }

  public async getSessionReport(sessionId: string) {
    return BusinessDayReportService.getInstance().getSessionReport(sessionId);
  }
}

export default BusinessDayService;
