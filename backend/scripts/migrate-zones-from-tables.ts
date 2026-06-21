/**
 * Migration script to extract zones from existing tables and create Zone records
 * 
 * This script:
 * 1. Finds all unique (branchId, zone name) combinations from existing tables
 * 2. Creates Zone records for each unique combination
 * 3. Updates Table records to reference the new Zone.id via zoneId
 * 4. Preserves all existing data
 * 
 * Run with: npx ts-node backend/scripts/migrate-zones-from-tables.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateZonesFromTables() {
  try {
    console.log("Starting zone migration from tables...");

    // Step 1: Get all tables with zone information
    const tables = await prisma.table.findMany({
      where: {
        OR: [
          { zone: { not: null } }, // Has zone string
          { branchId: { not: null } }, // Has branchId (even if zone is null)
        ],
      },
      select: {
        id: true,
        branchId: true,
        zone: true,
        zoneId: true,
      },
    });

    console.log(`Found ${tables.length} tables to process`);

    if (tables.length === 0) {
      console.log("No tables to migrate. Migration complete!");
      return;
    }

    // Step 2: Group tables by (branchId, zone name) to find unique zones
    const zoneMap = new Map<string, {
      branchId: string;
      zoneName: string;
      tableIds: string[];
    }>();

    for (const table of tables) {
      // Skip if already has zoneId (already migrated)
      if (table.zoneId) {
        continue;
      }

      // Skip if no branchId (can't create zone without branch)
      if (!table.branchId) {
        console.warn(`  ⚠️  Table ${table.id} has no branchId, skipping zone migration`);
        continue;
      }

      // Use zone string if available, otherwise use "Default" or "Unassigned"
      const zoneName = (table.zone && table.zone.trim()) || "Unassigned";
      const key = `${table.branchId}:${zoneName}`;

      if (!zoneMap.has(key)) {
        zoneMap.set(key, {
          branchId: table.branchId,
          zoneName: zoneName,
          tableIds: [],
        });
      }

      zoneMap.get(key)!.tableIds.push(table.id);
    }

    console.log(`\nFound ${zoneMap.size} unique zones to create:`);
    zoneMap.forEach((zoneInfo, key) => {
      console.log(`  - "${zoneInfo.zoneName}" in branch ${zoneInfo.branchId} (${zoneInfo.tableIds.length} tables)`);
    });

    // Step 3: Verify branches exist
    const branchIds = Array.from(new Set(Array.from(zoneMap.values()).map(z => z.branchId)));
    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });

    const branchMap = new Map(branches.map(b => [b.id, b.name]));
    const missingBranches = branchIds.filter(id => !branchMap.has(id));

    if (missingBranches.length > 0) {
      console.error(`\n❌ Error: Branches not found: ${missingBranches.join(", ")}`);
      console.error("Cannot create zones for non-existent branches. Aborting migration.");
      process.exit(1);
    }

    // Step 4: Create Zone records
    const createdZones = new Map<string, string>(); // key -> zoneId
    let createdCount = 0;
    let skippedCount = 0;

    for (const [key, zoneInfo] of zoneMap.entries()) {
      // Check if zone already exists
      const existingZone = await prisma.zone.findFirst({
        where: {
          branchId: zoneInfo.branchId,
          name: zoneInfo.zoneName,
        },
        select: { id: true },
      });

      if (existingZone) {
        console.log(`  ✓ Zone "${zoneInfo.zoneName}" already exists in branch ${branchMap.get(zoneInfo.branchId)}`);
        createdZones.set(key, existingZone.id);
        skippedCount++;
        continue;
      }

      // Create new zone
      const zone = await prisma.zone.create({
        data: {
          branchId: zoneInfo.branchId,
          name: zoneInfo.zoneName,
          description: zoneInfo.zoneName === "Unassigned" 
            ? "Default zone for tables without a specific zone assignment"
            : null,
          isActive: true,
        },
      });

      createdZones.set(key, zone.id);
      createdCount++;
      console.log(`  ✓ Created zone "${zoneInfo.zoneName}" in branch ${branchMap.get(zoneInfo.branchId)} (ID: ${zone.id})`);
    }

    // Step 5: Update tables to reference zones
    let updatedCount = 0;
    let errorCount = 0;

    for (const [key, zoneInfo] of zoneMap.entries()) {
      const zoneId = createdZones.get(key);
      if (!zoneId) {
        console.error(`  ❌ No zone ID found for key: ${key}`);
        errorCount++;
        continue;
      }

      // Update all tables in this zone
      const result = await prisma.table.updateMany({
        where: {
          id: { in: zoneInfo.tableIds },
          zoneId: null, // Only update if not already set
        },
        data: {
          zoneId: zoneId,
        },
      });

      updatedCount += result.count;
      console.log(`  ✓ Updated ${result.count} tables to reference zone "${zoneInfo.zoneName}"`);
    }

    // Step 6: Verify migration
    const remainingNull = await prisma.table.count({
      where: {
        branchId: { not: null },
        zoneId: null,
        zone: { not: null }, // Has zone string but no zoneId
      },
    });

    console.log(`\n✅ Migration complete!`);
    console.log(`  - Created ${createdCount} new zones`);
    console.log(`  - Skipped ${skippedCount} existing zones`);
    console.log(`  - Updated ${updatedCount} tables with zoneId`);
    if (errorCount > 0) {
      console.warn(`  - ⚠️  ${errorCount} errors encountered`);
    }

    if (remainingNull > 0) {
      console.warn(`\n⚠️  Warning: ${remainingNull} tables still have null zoneId (but have zone string)`);
      console.warn("  These may need manual review.");
    } else {
      console.log(`\n✓ Verification: All tables with branchId and zone string have been assigned zoneId`);
    }

    // Step 7: Summary by branch
    console.log(`\n📊 Summary by branch:`);
    for (const branchId of branchIds) {
      const branchName = branchMap.get(branchId) || "Unknown";
      const zonesInBranch = Array.from(zoneMap.values()).filter(z => z.branchId === branchId);
      const tablesInBranch = zonesInBranch.reduce((sum, z) => sum + z.tableIds.length, 0);
      console.log(`  - ${branchName}: ${zonesInBranch.length} zones, ${tablesInBranch} tables`);
    }

  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateZonesFromTables()
  .then(() => {
    console.log("\n✅ Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration script failed:", error);
    process.exit(1);
  });

