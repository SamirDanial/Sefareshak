#!/usr/bin/env ts-node
/**
 * Migration script to populate the Payment table from existing Orders and ReservationOrders.
 * Supports dry-run mode and batch processing.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx ts-node backend/scripts/migrate-payments.ts [--dry-run] [--batch=100]
 */
import { PrismaClient, PaymentMethod, PaymentProvider, PaymentState } from "@prisma/client";

const prisma = new PrismaClient();

function getArg(key: string, fallback?: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${key}=`));
  return arg ? arg.split("=")[1] : fallback;
}

const dryRun = process.argv.includes("--dry-run");
const batchSize = Number(getArg("--batch", "100"));

const log = (...args: any[]) => console.log("[migrate]", ...args);

async function migrateOrders() {
  let processed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { paymentIntentId: { not: null } },
          { paymentMethod: PaymentMethod.ONLINE_PAYMENT },
        ],
        paymentId: null,
      },
      take: batchSize,
    });

    if (orders.length === 0) break;

    for (const order of orders) {
      const providerPaymentId = order.paymentIntentId;
      if (!providerPaymentId) continue;

      if (dryRun) {
        log(`DRY-RUN: Would create payment for Order ${order.id} (${providerPaymentId}) amount=${order.totalAmount}`);
        continue;
      }

      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          paymentMethod: order.paymentMethod,
          paymentProvider: PaymentProvider.STRIPE,
          providerPaymentId,
          amount: order.totalAmount,
          currency: order.currency.toUpperCase(),
          status: order.paymentStatus === "PAID" ? PaymentState.COMPLETED : PaymentState.PENDING,
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentId: payment.id },
      });

      processed += 1;
    }
  }
  return processed;
}

async function migrateReservationOrders() {
  let processed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resOrders = await prisma.reservationOrder.findMany({
      where: { paymentIntentId: { not: null }, paymentId: null },
      take: batchSize,
    });

    if (resOrders.length === 0) break;

    for (const ro of resOrders) {
      const providerPaymentId = ro.paymentIntentId;
      if (!providerPaymentId) continue;

      if (dryRun) {
        log(`DRY-RUN: Would create payment for ReservationOrder ${ro.id} (${providerPaymentId}) amount=${ro.totalAmount}`);
        continue;
      }

      const payment = await prisma.payment.create({
        data: {
          reservationOrderId: ro.id,
          paymentMethod: ro.paymentMethod,
          paymentProvider: PaymentProvider.STRIPE,
          providerPaymentId,
          amount: ro.totalAmount,
          currency: ro.currency.toUpperCase(),
          status: ro.paymentStatus === "PAID" ? PaymentState.COMPLETED : PaymentState.PENDING,
        },
      });

      await prisma.reservationOrder.update({
        where: { id: ro.id },
        data: { paymentId: payment.id },
      });

      processed += 1;
    }
  }
  return processed;
}

async function linkRefunds() {
  const refunds = await prisma.refund.findMany({
    where: { paymentId: null },
    include: { order: true },
  });

  let linked = 0;

  for (const refund of refunds) {
    const paymentId = refund.order?.paymentId;
    if (!paymentId) continue;

    if (dryRun) {
      log(`DRY-RUN: Would link refund ${refund.id} to payment ${paymentId}`);
      continue;
    }

    await prisma.refund.update({
      where: { id: refund.id },
      data: { paymentId },
    });
    linked += 1;
  }

  return linked;
}

async function main() {
  log(`Starting migration ${dryRun ? "(dry-run)" : ""} with batchSize=${batchSize}`);

  if (dryRun) {
    const ordersToMigrate = await prisma.order.count({
      where: {
        OR: [
          { paymentIntentId: { not: null } },
          { paymentMethod: PaymentMethod.ONLINE_PAYMENT },
        ],
        paymentId: null,
      },
    });
    const resOrdersToMigrate = await prisma.reservationOrder.count({
      where: { paymentIntentId: { not: null }, paymentId: null },
    });
    const refundsToLink = await prisma.refund.count({
      where: { paymentId: null },
    });

    log(`DRY-RUN SUMMARY: orders=${ordersToMigrate}, reservationOrders=${resOrdersToMigrate}, refunds=${refundsToLink}`);
    process.exit(0);
  }

  await prisma.$transaction(async (tx) => {
    // Use transaction runner context
    (prisma as any)._engine = (tx as any)._engine;
    const ordersProcessed = await migrateOrders();
    const resOrdersProcessed = await migrateReservationOrders();
    const refundsLinked = await linkRefunds();

    log(`Migration complete. Orders: ${ordersProcessed}, ReservationOrders: ${resOrdersProcessed}, Refunds linked: ${refundsLinked}`);
  });
}

main()
  .catch((err) => {
    console.error("[migrate][error]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

