import { PrismaClient } from "@prisma/client";
import DatabaseSingleton from "../config/database";

/**
 * Get the effective base price for an addon at a specific branch.
 * Priority: Branch price override > Addon base price
 */
export async function getAddonBasePrice(
  addonId: string,
  branchId?: string | null
): Promise<number> {
  const prisma = DatabaseSingleton.getInstance().getPrisma();

  if (!branchId) {
    const addon = await prisma.addOn.findUnique({
      where: { id: addonId },
      select: { price: true },
    });
    return addon && addon.price !== null ? Number(addon.price) : 0;
  }

  const branchPrice = await prisma.addonBranchPrice.findUnique({
    where: {
      addonId_branchId: {
        addonId,
        branchId,
      },
    },
    select: { basePrice: true },
  });

  if (branchPrice) {
    return Number(branchPrice.basePrice);
  }

  const addon = await prisma.addOn.findUnique({
    where: { id: addonId },
    select: { price: true },
  });

  return addon && addon.price !== null ? Number(addon.price) : 0;
}

/**
 * Get the effective tax percentage for an addon at a specific branch.
 * Priority: Branch tax override > Addon tax > Branch tax > Settings tax
 */
export async function getAddonTaxPercentage(
  addonId: string,
  branchId?: string | null
): Promise<number | null> {
  const prisma = DatabaseSingleton.getInstance().getPrisma();

  // First, check for branch-specific tax override
  if (branchId) {
    const branchPrice = await prisma.addonBranchPrice.findUnique({
      where: {
        addonId_branchId: {
          addonId,
          branchId,
        },
      },
      select: { taxPercentage: true },
    });

    if (branchPrice && branchPrice.taxPercentage !== null) {
      return Number(branchPrice.taxPercentage);
    }
  }

  // Check addon tax percentage (before branch tax)
  const addon = await prisma.addOn.findUnique({
    where: { id: addonId },
    select: { taxPercentage: true },
  });

  if (addon && addon.taxPercentage !== null) {
    return Number(addon.taxPercentage);
  }

  // Check branch tax percentage (only if addon has no specific tax)
  if (branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { taxPercentage: true },
    });

    if (branch && branch.taxPercentage !== null) {
      return Number(branch.taxPercentage);
    }
  }

  // Fallback to settings
  const settings = await prisma.settings.findFirst({
    select: { taxPercentage: true },
  });

  return settings && settings.taxPercentage !== null
    ? Number(settings.taxPercentage)
    : null;
}

/**
 * Get both price and tax percentage for an addon at a specific branch.
 */
export async function getAddonPriceAndTax(
  addonId: string,
  branchId?: string | null
): Promise<{ basePrice: number; taxPercentage: number | null }> {
  const [basePrice, taxPercentage] = await Promise.all([
    getAddonBasePrice(addonId, branchId),
    getAddonTaxPercentage(addonId, branchId),
  ]);

  return { basePrice, taxPercentage };
}

