import DatabaseSingleton from "../config/database";
import {
  PaymentMethod,
  PaymentProvider,
  PaymentState,
  Prisma,
} from "@prisma/client";

export interface CreatePaymentInput {
  orderId?: string | null;
  reservationOrderId?: string | null;
  paymentMethod: PaymentMethod;
  paymentProvider: PaymentProvider;
  providerPaymentId?: string | null;
  providerChargeId?: string | null;
  amount: Prisma.Decimal | number;
  currency: string;
  fees?: Prisma.Decimal | number | null;
  netAmount?: Prisma.Decimal | number | null;
  status?: PaymentState;
  metadata?: Prisma.InputJsonValue;
  webhookData?: Prisma.InputJsonValue;
}

export class PaymentService {
  private static instance: PaymentService;
  private db = DatabaseSingleton.getInstance();

  private constructor() {}

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  public async createPayment(input: CreatePaymentInput) {
    const prisma = this.db.getPrisma();

    const orderId = input.orderId ?? null;
    const reservationOrderId = input.reservationOrderId ?? null;

    const data: Prisma.PaymentUncheckedCreateInput = {
      orderId,
      reservationOrderId,
      paymentMethod: input.paymentMethod,
      paymentProvider: input.paymentProvider,
      providerPaymentId: input.providerPaymentId ?? null,
      providerChargeId: input.providerChargeId ?? null,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      fees:
        input.fees !== undefined && input.fees !== null
          ? new Prisma.Decimal(input.fees)
          : null,
      netAmount:
        input.netAmount !== undefined && input.netAmount !== null
          ? new Prisma.Decimal(input.netAmount)
          : null,
      status: input.status || PaymentState.PENDING,
      metadata: input.metadata || undefined,
      webhookData: input.webhookData || undefined,
    };

    const update: Prisma.PaymentUncheckedUpdateInput = {
      paymentMethod: input.paymentMethod,
      paymentProvider: input.paymentProvider,
      providerPaymentId:
        input.providerPaymentId === undefined ? undefined : input.providerPaymentId,
      providerChargeId:
        input.providerChargeId === undefined ? undefined : input.providerChargeId,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency,
      fees:
        input.fees === undefined
          ? undefined
          : input.fees === null
            ? null
            : new Prisma.Decimal(input.fees),
      netAmount:
        input.netAmount === undefined
          ? undefined
          : input.netAmount === null
            ? null
            : new Prisma.Decimal(input.netAmount),
      status: input.status || PaymentState.PENDING,
      metadata: input.metadata || undefined,
      webhookData: input.webhookData || undefined,
      orderId: input.orderId === undefined ? undefined : input.orderId,
      reservationOrderId:
        input.reservationOrderId === undefined ? undefined : input.reservationOrderId,
    };

    if (orderId) {
      return prisma.payment.upsert({
        where: { orderId },
        create: data,
        update,
      });
    }

    if (reservationOrderId) {
      return prisma.payment.upsert({
        where: { reservationOrderId },
        create: data,
        update,
      });
    }

    return prisma.payment.create({ data });
  }

  public async updatePaymentStatus(
    paymentId: string,
    status: PaymentState,
    extra?: Partial<{
      providerChargeId: string | null;
      fees: Prisma.Decimal | number | null;
      netAmount: Prisma.Decimal | number | null;
      webhookData: Prisma.InputJsonValue;
      completedAt: Date;
      failedAt: Date;
      refundedAt: Date;
    }>
  ) {
    const prisma = this.db.getPrisma();
    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        providerChargeId: extra?.providerChargeId ?? undefined,
        fees:
          extra?.fees === undefined
            ? undefined
            : extra.fees === null
            ? null
            : new Prisma.Decimal(extra.fees),
        netAmount:
          extra?.netAmount === undefined
            ? undefined
            : extra.netAmount === null
            ? null
            : new Prisma.Decimal(extra.netAmount),
        webhookData: extra?.webhookData ?? undefined,
        completedAt: extra?.completedAt,
        failedAt: extra?.failedAt,
        refundedAt: extra?.refundedAt,
      },
    });
  }

  public async getPaymentById(paymentId: string) {
    return this.db.getPrisma().payment.findUnique({
      where: { id: paymentId },
    });
  }

  public async getPaymentByProviderId(providerPaymentId: string) {
    return this.db.getPrisma().payment.findUnique({
      where: { providerPaymentId },
    });
  }

  public async linkPaymentToOrder(paymentId: string, orderId: string) {
    const prisma = this.db.getPrisma();
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: { orderId, reservationOrderId: null },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { paymentId: payment.id },
      });
      return payment;
    });
  }

  public async linkPaymentToReservationOrder(
    paymentId: string,
    reservationOrderId: string
  ) {
    const prisma = this.db.getPrisma();
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: { reservationOrderId, orderId: null },
      });
      await tx.reservationOrder.update({
        where: { id: reservationOrderId },
        data: { paymentId: payment.id },
      });
      return payment;
    });
  }

  /**
   * Placeholder for provider-agnostic refund handling. To be implemented when
   * refund flows are migrated to Payment table.
   */
  public async processRefund(): Promise<void> {
    return;
  }

  /**
   * Placeholder for migrating existing payment records.
   */
  public async migrateExistingPayments(): Promise<void> {
    return;
  }
}

export default PaymentService;

