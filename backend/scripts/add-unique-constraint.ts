/**
 * Script to add the unique constraint on [mealId, sizeType] after ensuring no duplicates
 * Run this AFTER: npx prisma db push (first time) AND npm run migrate:check-duplicates
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function addUniqueConstraint() {
  console.log("Adding unique constraint on [mealId, sizeType]...");

  try {
    // Check for duplicates first
    const duplicates = await prisma.$queryRaw<Array<{ mealId: string; sizeType: string; count: number }>>`
      SELECT "mealId", "sizeType", COUNT(*) as count
      FROM meal_sizes
      GROUP BY "mealId", "sizeType"
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length > 0) {
      console.error("\n⚠️  Found duplicates! Cannot add unique constraint:");
      for (const dup of duplicates) {
        console.error(`  Meal ${dup.mealId} has ${dup.count} sizes with type ${dup.sizeType}`);
      }
      console.error("\nRun 'npm run migrate:check-duplicates' to fix them first.");
      process.exit(1);
    }

    // Add the unique constraint
    await prisma.$executeRaw`
      ALTER TABLE meal_sizes 
      ADD CONSTRAINT meal_sizes_mealId_sizeType_key UNIQUE ("mealId", "sizeType")
    `;

    console.log("✅ Unique constraint added successfully!");
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log("✅ Unique constraint already exists.");
    } else {
      console.error("Failed to add constraint:", error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addUniqueConstraint();

