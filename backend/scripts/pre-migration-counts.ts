#!/usr/bin/env ts-node
/**
 * Pre-migration count verification script.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx ts-node backend/scripts/pre-migration-counts.ts
 *
 * Outputs JSON with counts for Orders, ReservationOrders, Refunds.
 */
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const ordersWithPayments = await prisma.order.count({
    where: {
      OR: [
        { paymentIntentId: { not: null } },
        { paymentMethod: PaymentMethod.ONLINE_PAYMENT },
      ],
    },
  });

  const reservationOrdersWithPayments = await prisma.reservationOrder.count({
    where: {
      paymentIntentId: { not: null },
    },
  });

  const refundsCount = await prisma.refund.count();

  const result = {
    timestamp,
    ordersWithPayments,
    reservationOrdersWithPayments,
    refundsCount,
  };

  const outputDir = join(__dirname, "migration-outputs");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `pre_migration_counts_${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log("Pre-migration counts:");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Saved to: ${outputPath}`);
}

main()
  .catch((err) => {
    console.error("Error computing pre-migration counts:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

