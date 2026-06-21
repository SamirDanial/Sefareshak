import { PrismaClient } from "@prisma/client";
import DatabaseSingleton from "../config/database";

/**
 * Get the effective base price for a meal at a specific branch.
 * Checks for branch-specific price override first, then falls back to meal's basePrice.
 * 
 * @param mealId - The ID of the meal
 * @param branchId - The ID of the branch (optional, if not provided returns base price)
 * @returns The effective base price as a number
 */
export async function getMealBasePrice(
  mealId: string,
  branchId?: string | null
): Promise<number> {
  const prisma = DatabaseSingleton.getInstance().getPrisma();

  // If no branchId provided, just return the base price
  if (!branchId) {
    const meal = await prisma.meal.findUnique({
      where: { id: mealId },
      select: { basePrice: true },
    });
    return meal ? Number(meal.basePrice) : 0;
  }

  // Check for branch-specific price override
  const branchPrice = await prisma.mealBranchPrice.findUnique({
    where: {
      mealId_branchId: {
        mealId,
        branchId,
      },
    },
    select: { basePrice: true },
  });

  if (branchPrice) {
    return Number(branchPrice.basePrice);
  }

  // Fall back to meal's base price
  const meal = await prisma.meal.findUnique({
    where: { id: mealId },
    select: { basePrice: true },
  });

  return meal ? Number(meal.basePrice) : 0;
}

/**
 * Get the effective tax percentage for a meal at a specific branch.
 * Priority: Branch override > Meal tax > Category tax > Settings default
 * 
 * @param mealId - The ID of the meal
 * @param branchId - The ID of the branch (optional)
 * @returns The effective tax percentage as a number
 */
export async function getMealTaxPercentage(
  mealId: string,
  branchId?: string | null
): Promise<number | null> {
  const prisma = DatabaseSingleton.getInstance().getPrisma();

  // If branchId provided, check for branch-specific tax override
  if (branchId) {
    const branchPrice = await prisma.mealBranchPrice.findUnique({
      where: {
        mealId_branchId: {
          mealId,
          branchId,
        },
      },
      select: { taxPercentage: true },
    });

    if (branchPrice && branchPrice.taxPercentage !== null) {
      return Number(branchPrice.taxPercentage);
    }
  }

  // Fall back to meal's tax percentage
  const meal = await prisma.meal.findUnique({
    where: { id: mealId },
    include: {
      category: {
        select: { taxPercentage: true },
      },
    },
  });

  if (!meal) return null;

  // Priority: Meal tax > Category tax
  if (meal.taxPercentage !== null) {
    return Number(meal.taxPercentage);
  }

  if (meal.category && meal.category.taxPercentage !== null) {
    return Number(meal.category.taxPercentage);
  }

  return null;
}

/**
 * Get both price and tax percentage for a meal at a specific branch.
 * This is a convenience function that combines getMealBasePrice and getMealTaxPercentage.
 * 
 * @param mealId - The ID of the meal
 * @param branchId - The ID of the branch (optional)
 * @returns Object with basePrice and taxPercentage
 */
export async function getMealPriceAndTax(
  mealId: string,
  branchId?: string | null
): Promise<{ basePrice: number; taxPercentage: number | null }> {
  const [basePrice, taxPercentage] = await Promise.all([
    getMealBasePrice(mealId, branchId),
    getMealTaxPercentage(mealId, branchId),
  ]);

  return { basePrice, taxPercentage };
}

