#!/usr/bin/env ts-node
/**
 * Post-migration verification script.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx ts-node backend/scripts/verify-migration.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const log = (...args: any[]) => console.log("[verify]", ...args);

async function main() {
  const ordersWithPaymentId = await prisma.order.count({
    where: { paymentId: { not: null } },
  });

  const paymentsWithOrder = await prisma.payment.count({
    where: { orderId: { not: null } },
  });

  const resOrdersWithPaymentId = await prisma.reservationOrder.count({
    where: { paymentId: { not: null } },
  });

  const paymentsWithResOrder = await prisma.payment.count({
    where: { reservationOrderId: { not: null } },
  });

  const refundsLinked = await prisma.refund.count({
    where: { paymentId: { not: null } },
  });

  const paymentsWithBoth = await prisma.payment.count({
    where: {
      orderId: { not: null },
      reservationOrderId: { not: null },
    },
  });

  const orphanPayments = await prisma.payment.count({
    where: {
      orderId: null,
      reservationOrderId: null,
    },
  });

  log("Order payment links:", { ordersWithPaymentId, paymentsWithOrder });
  log("ReservationOrder payment links:", {
    resOrdersWithPaymentId,
    paymentsWithResOrder,
  });
  log("Refunds linked to payments:", { refundsLinked });
  log("Payments with both orderId and reservationOrderId:", paymentsWithBoth);
  log("Payments without owner (orphan):", orphanPayments);

  if (
    ordersWithPaymentId !== paymentsWithOrder ||
    resOrdersWithPaymentId !== paymentsWithResOrder ||
    paymentsWithBoth > 0
  ) {
    log("Verification FAILED: counts mismatch or invalid relations detected");
    process.exit(1);
  }

  log("Verification PASSED");
}

main()
  .catch((err) => {
    console.error("[verify][error]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

