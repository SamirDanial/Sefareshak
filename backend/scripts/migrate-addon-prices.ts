/**
 * Migration script to move addon prices to addon_sizes table
 * Run this AFTER running: npx prisma db push
 * Then run: npx prisma db push again to remove the price column
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateAddonPrices() {
  console.log("Starting addon price migration...");

  try {
    // Get all addons that have a price but no addonSizes
    const addons = await prisma.addOn.findMany({
      where: {
        price: {
          not: null,
        },
        addonSizes: {
          none: {},
        },
      },
    });

    console.log(`Found ${addons.length} addons to migrate`);

    for (const addon of addons) {
      if (addon.price !== null) {
        await prisma.addonSize.create({
          data: {
            addonId: addon.id,
            sizeType: "M",
            price: addon.price,
            taxPercentage: addon.taxPercentage,
          },
        });
        console.log(`Migrated addon: ${addon.name} (${addon.id})`);
      }
    }

    console.log("Migration completed successfully!");
    console.log("\nNext step: Remove the 'price' field from AddOn model in schema.prisma");
    console.log("Then run: npx prisma db push");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateAddonPrices();

