import DatabaseSingleton from "../config/database";
import FiskalyService from "./fiskalyService";
import { FiscalTransactionStatus } from "@prisma/client";
import { shouldFiscalize, getFiskalyConfigSnapshot } from "../utils/fiscalization";

export class FiscalQueueWorker {
  private static instance: FiscalQueueWorker;
  private db = DatabaseSingleton.getInstance();
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): FiscalQueueWorker {
    if (!FiscalQueueWorker.instance) {
      FiscalQueueWorker.instance = new FiscalQueueWorker();
    }
    return FiscalQueueWorker.instance;
  }

  public start() {
    if (this.intervalId) return;
    console.info("[FiscalQueueWorker] Starting background signing queue worker...");
    // Run every 30 seconds
    this.intervalId = setInterval(() => this.processQueue(), 30000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Enqueues an order for background fiscalization retry.
   */
  public async enqueue(orderId: string) {
    const prisma = this.db.getPrisma() as any;
    try {
      await prisma.fiscalSigningQueue.upsert({
        where: { orderId },
        update: {
          status: "PENDING",
          nextAttemptAt: new Date(),
        },
        create: {
          orderId,
          status: "PENDING",
        },
      });
      console.info(`[FiscalQueueWorker] Enqueued order ${orderId} for fiscalization.`);
    } catch (err) {
      console.error(`[FiscalQueueWorker] Failed to enqueue order ${orderId}:`, err);
    }
  }

  /**
   * Process pending items in the queue.
   */
  public async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const prisma = this.db.getPrisma() as any;
    const now = new Date();

    try {
      const pendingItems = await prisma.fiscalSigningQueue.findMany({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          nextAttemptAt: { lte: now },
          attempts: { lt: 10 }, // Max 10 attempts
        },
        select: {
          id: true,
          orderId: true,
          attempts: true,
        },
        take: 10,
        orderBy: { nextAttemptAt: "asc" },
      });

      if (pendingItems.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.info(`[FiscalQueueWorker] Found ${pendingItems.length} queued fiscal transactions to process.`);

      for (const item of pendingItems) {
        await this.processItem(item);
      }
    } catch (error) {
      console.error("[FiscalQueueWorker] Error processing queue:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processItem(item: any) {
    const prisma = this.db.getPrisma() as any;
    const orderId = item.orderId;
    const organizationId = item.order?.branch?.organizationId;

    if (!orderId || !organizationId) {
      // Unresolvable order/branch, mark as FAILED with max attempts
      await prisma.fiscalSigningQueue.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          attempts: 10,
          errorMessage: "Unresolvable order or branch details",
        },
      });
      return;
    }

    // Fetch order fresh with all required fields including voucher information
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        currency: true,
        paymentMethod: true,
        branchId: true,
        voucherPaymentAmount: true,
        voucherCodes: true,
        branch: {
          select: {
            organizationId: true,
          },
        },
      },
    });

    // Check if fiscalization is enabled
    const config = await getFiskalyConfigSnapshot(prisma, organizationId);
    if (!shouldFiscalize(config)) {
      // Fiskaly disabled, skip and remove from active queue
      await prisma.fiscalSigningQueue.update({
        where: { id: item.id },
        data: { status: "SIGNED", errorMessage: "Fiskaly disabled" },
      });
      return;
    }

    // Attempt count increment
    const attempts = item.attempts + 1;
    // Exponential backoff: 2 min, 4 min, 8 min, 16 min...
    const backoffMinutes = Math.pow(2, attempts);
    const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await prisma.fiscalSigningQueue.update({
      where: { id: item.id },
      data: { status: "PROCESSING", attempts, lastAttemptAt: new Date() },
    });

    try {
      // Find suitable active POS device or fallback to any provisioned POS device for the branch
      const device = await prisma.posDevice.findFirst({
        where: { branchId: order.branchId, isDeleted: false, NOT: { fiskalyClientId: null } },
        select: { id: true },
      });

      const fiskaly = FiskalyService.getInstance();
      const meta = {
        paymentMethod: String(order.paymentMethod || "").trim() || null,
        voucherPaymentAmount: Number((order as any)?.voucherPaymentAmount || 0),
        voucherCodes: (order as any)?.voucherCodes || [],
        isLateFiscalization: true,
      };
      console.log('[FiscalQueueWorker] Fiscalizing order with metadata:', meta);
      await fiskaly.fiscalize({
        organizationId,
        branchId: order.branchId,
        deviceId: device?.id || null,
        orderId: order.id,
        amount: Number(order.totalAmount || 0),
        currency: String(order.currency || "EUR"),
        receiptNumber: String(order.orderNumber || order.id),
        meta,
      });

      // Mark as signed and resolved
      await prisma.fiscalSigningQueue.update({
        where: { id: item.id },
        data: { status: "SIGNED", errorMessage: null },
      });

      // Resolve any open outage log for this organization
      await this.resolveOutage(organizationId);

      console.info(`[FiscalQueueWorker] Successfully fiscalized order ${order.id} in background.`);
    } catch (err: any) {
      const msg = err?.fiskalyMessage || err?.message || "Fiskaly background fiscalization failed";
      console.warn(`[FiscalQueueWorker] Attempt ${attempts} failed for order ${order.id}: ${msg}`);

      await prisma.fiscalSigningQueue.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          nextAttemptAt,
          errorMessage: msg,
        },
      });

      // Track outage if connection or server error occurs
      const isConnectionOrServerError = 
        err?.status >= 500 || 
        err?.code === "ENOTFOUND" || 
        err?.code === "ECONNREFUSED" || 
        err?.fiskalyCode === "E_CONNECT_FAILED" ||
        msg.toLowerCase().includes("timeout") ||
        msg.toLowerCase().includes("fetch failed");

      if (isConnectionOrServerError) {
        await this.registerOutage(organizationId, msg);
      }
    }
  }

  private async registerOutage(organizationId: string, reason: string) {
    const prisma = this.db.getPrisma() as any;
    try {
      const activeOutage = await prisma.tssOutageLog.findFirst({
        where: { organizationId, resolved: false },
      });

      if (!activeOutage) {
        await prisma.tssOutageLog.create({
          data: {
            organizationId,
            reason,
            resolved: false,
          },
        });
        console.warn(`[FiscalQueueWorker] TSS Outage detected and registered for organization ${organizationId}. Reason: ${reason}`);
      }
    } catch (err) {
      console.error("[FiscalQueueWorker] Failed to register TSS outage log:", err);
    }
  }

  private async resolveOutage(organizationId: string) {
    const prisma = this.db.getPrisma() as any;
    try {
      const activeOutage = await prisma.tssOutageLog.findFirst({
        where: { organizationId, resolved: false },
      });

      if (activeOutage) {
        await prisma.tssOutageLog.update({
          where: { id: activeOutage.id },
          data: {
            resolved: true,
            endedAt: new Date(),
          },
        });
        console.info(`[FiscalQueueWorker] TSS Outage resolved for organization ${organizationId}.`);
      }
    } catch (err) {
      console.error("[FiscalQueueWorker] Failed to resolve TSS outage log:", err);
    }
  }
}

export default FiscalQueueWorker;
