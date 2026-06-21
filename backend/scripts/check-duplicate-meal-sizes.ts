/**
 * Script to check and fix duplicate meal sizes that would violate the unique constraint
 * Run this BEFORE running: npx prisma db push
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAndFixDuplicateMealSizes() {
  console.log("Checking for duplicate meal sizes...");

  try {
    // First, we need to add sizeType column if it doesn't exist yet
    // This script assumes the column exists (after first push)
    
    // Check for meals with multiple sizes that have the same sizeType
    const meals = await prisma.meal.findMany({
      include: {
        mealSizes: {
          orderBy: {
            price: "asc", // Prefer smaller sizes when assigning
          },
        },
      },
    });

    const duplicates: Array<{
      mealId: string;
      mealName: string;
      sizes: Array<{ id: string; name: string; currentSizeType?: string }>;
      targetSizeType: string;
    }> = [];

    for (const meal of meals) {
      if (meal.mealSizes.length > 1) {
        // Group sizes by their current or inferred sizeType
        const sizeTypeMap = new Map<string, typeof meal.mealSizes>();

        for (const size of meal.mealSizes) {
          // Get current sizeType if it exists, otherwise infer from name
          const sizeType = (size as any).sizeType || getSizeTypeFromName(size.name);
          
          if (!sizeTypeMap.has(sizeType)) {
            sizeTypeMap.set(sizeType, []);
          }
          sizeTypeMap.get(sizeType)!.push(size);
        }

        // Check for duplicates and assign unique sizeTypes
        const availableSizeTypes = ["S", "M", "L", "XL"];
        let assignedIndex = 0;

        for (const [sizeType, sizes] of sizeTypeMap.entries()) {
          if (sizes.length > 1) {
            // Multiple sizes with same type - need to reassign
            for (let i = 0; i < sizes.length; i++) {
              const size = sizes[i];
              const newSizeType = availableSizeTypes[assignedIndex % availableSizeTypes.length];
              
              duplicates.push({
                mealId: meal.id,
                mealName: meal.name,
                sizes: [{ id: size.id, name: size.name, currentSizeType: sizeType }],
                targetSizeType: newSizeType,
              });
              
              assignedIndex++;
            }
          } else {
            assignedIndex++;
          }
        }
      }
    }

    if (duplicates.length > 0) {
      console.log("\n⚠️  Found meal sizes that need sizeType assignment:");
      console.log("Updating sizeTypes to ensure uniqueness...\n");

      // Update sizes to have unique sizeTypes
      for (const dup of duplicates) {
        await prisma.$executeRaw`
          UPDATE meal_sizes 
          SET "sizeType" = ${dup.targetSizeType}::"SizeType"
          WHERE id = ${dup.sizes[0].id}
        `;
        console.log(`✓ Updated ${dup.mealName} - ${dup.sizes[0].name} → ${dup.targetSizeType}`);
      }

      console.log("\n✅ All duplicates fixed. Safe to proceed with db push.");
    } else {
      console.log("✅ No duplicate size types found. Safe to proceed with db push.");
    }
  } catch (error: any) {
    // If sizeType column doesn't exist yet, that's okay - it will be added by db push
    if (error.message?.includes("column") && error.message?.includes("sizeType")) {
      console.log("⚠️  sizeType column doesn't exist yet. This is normal for the first run.");
      console.log("Run 'npx prisma db push' first, then run this script again to fix any duplicates.");
      console.log("Then add the unique constraint manually or in a second push.");
    } else {
      console.error("Check failed:", error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function getSizeTypeFromName(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("small") || (lowerName.length === 1 && lowerName === "s")) return "S";
  if (lowerName.includes("large") || (lowerName.length === 1 && lowerName === "l")) return "L";
  if (lowerName.includes("xl") || lowerName.includes("extra") || lowerName === "xl") return "XL";
  if (lowerName.includes("medium") || (lowerName.length === 1 && lowerName === "m")) return "M";
  return "M"; // Default
}

checkAndFixDuplicateMealSizes();

