/**
 * Migration script to assign existing tables to branches
 * 
 * This script:
 * 1. Gets the main branch from settings (or first active branch)
 * 2. Assigns all tables without branchId to that branch
 * 3. Ensures table numbers are unique per branch
 * 
 * Run with: npx ts-node backend/scripts/migrate-tables-to-branches.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateTablesToBranches() {
  try {
    console.log("Starting table migration to branches...");

    // Step 1: Get main branch from settings
    const settings = await prisma.settings.findFirst({
      select: { mainBranchId: true },
    });

    let targetBranchId: string | null = null;

    if (settings?.mainBranchId) {
      // Check if main branch exists and is active
      const mainBranch = await prisma.branch.findUnique({
        where: { id: settings.mainBranchId },
        select: { id: true, isActive: true },
      });

      if (mainBranch && mainBranch.isActive) {
        targetBranchId = mainBranch.id;
        console.log(`Found main branch: ${targetBranchId}`);
      }
    }

    // If no main branch, get first active branch
    if (!targetBranchId) {
      const firstActiveBranch = await prisma.branch.findFirst({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });

      if (firstActiveBranch) {
        targetBranchId = firstActiveBranch.id;
        console.log(`Using first active branch: ${firstActiveBranch.name} (${targetBranchId})`);
      } else {
        console.error("No active branches found! Cannot migrate tables.");
        console.error("Please create at least one active branch before running this migration.");
        process.exit(1);
      }
    }

    // Step 2: Get all tables without branchId
    const tablesWithoutBranch = await prisma.table.findMany({
      where: { branchId: null },
      select: { id: true, tableNumber: true, branchId: true },
    });

    console.log(`Found ${tablesWithoutBranch.length} tables without branchId`);

    if (tablesWithoutBranch.length === 0) {
      console.log("No tables to migrate. Migration complete!");
      return;
    }

    // Step 3: Check for table number conflicts
    const existingTablesInBranch = await prisma.table.findMany({
      where: { branchId: targetBranchId },
      select: { tableNumber: true },
    });

    const existingTableNumbers = new Set(
      existingTablesInBranch.map((t) => t.tableNumber)
    );

    const conflicts: Array<{ id: string; tableNumber: string }> = [];
    const toMigrate: Array<{ id: string; tableNumber: string }> = [];

    for (const table of tablesWithoutBranch) {
      if (existingTableNumbers.has(table.tableNumber)) {
        conflicts.push({ id: table.id, tableNumber: table.tableNumber });
      } else {
        toMigrate.push({ id: table.id, tableNumber: table.tableNumber });
      }
    }

    if (conflicts.length > 0) {
      console.warn(`\n⚠️  Found ${conflicts.length} table number conflicts:`);
      conflicts.forEach((c) => {
        console.warn(`  - Table ${c.tableNumber} (ID: ${c.id})`);
      });
      console.warn(
        "\nThese tables will be renamed to avoid conflicts (e.g., 'Table 1' -> 'Table 1-1')"
      );
    }

    // Step 4: Migrate tables
    let migratedCount = 0;
    let renamedCount = 0;

    for (const table of toMigrate) {
      await prisma.table.update({
        where: { id: table.id },
        data: { branchId: targetBranchId },
      });
      migratedCount++;
      existingTableNumbers.add(table.tableNumber);
    }

    // Step 5: Handle conflicts by renaming
    for (const conflict of conflicts) {
      let newTableNumber = conflict.tableNumber;
      let suffix = 1;

      // Find a unique table number
      while (existingTableNumbers.has(newTableNumber)) {
        newTableNumber = `${conflict.tableNumber}-${suffix}`;
        suffix++;
      }

      await prisma.table.update({
        where: { id: conflict.id },
        data: {
          branchId: targetBranchId,
          tableNumber: newTableNumber,
        },
      });

      renamedCount++;
      existingTableNumbers.add(newTableNumber);
      console.log(
        `  ✓ Renamed table ${conflict.tableNumber} to ${newTableNumber} and assigned to branch`
      );
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`  - Migrated ${migratedCount} tables`);
    if (renamedCount > 0) {
      console.log(`  - Renamed ${renamedCount} tables to avoid conflicts`);
    }
    console.log(`  - All tables assigned to branch: ${targetBranchId}`);

    // Step 6: Verify migration
    const remainingNull = await prisma.table.count({
      where: { branchId: null },
    });

    if (remainingNull > 0) {
      console.warn(
        `\n⚠️  Warning: ${remainingNull} tables still have null branchId`
      );
    } else {
      console.log(`\n✓ Verification: All tables have been assigned to a branch`);
      
      // Step 7: Add unique constraint after migration (optional - can be done manually)
      console.log(`\n📝 Next steps:`);
      console.log(`  1. Verify all tables have been assigned correctly`);
      console.log(`  2. Add unique constraint to schema: @@unique([branchId, tableNumber])`);
      console.log(`  3. Run: npx prisma db push`);
      console.log(`  4. Optionally make branchId required (non-nullable) in schema`);
    }
  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateTablesToBranches()
  .then(() => {
    console.log("\nMigration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration script failed:", error);
    process.exit(1);
  });

