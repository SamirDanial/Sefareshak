/**
 * Utility functions for matching addon sizes to meal sizes
 */

export type SizeType = "S" | "M" | "L" | "XL";

const SIZE_ORDER: SizeType[] = ["S", "M", "L", "XL"];

/**
 * Get the nearest smaller addon size for a given meal size
 * If meal size is XL but addon only has S and M, returns M
 * If meal size is S and addon has S, returns S
 * If no smaller size exists, returns the smallest available size
 */
export function getNearestSmallerAddonSize(
  mealSizeType: SizeType | null | undefined,
  availableAddonSizes: SizeType[]
): SizeType | null {
  // Default to M if no meal size is selected
  const targetSize = mealSizeType || "M";

  if (availableAddonSizes.length === 0) {
    return null;
  }

  // Sort available sizes by order
  const sortedSizes = availableAddonSizes.sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
  );

  // Find the target size index
  const targetIndex = SIZE_ORDER.indexOf(targetSize);

  // Find the largest size that is <= target size
  let bestMatch: SizeType | null = null;
  for (const size of sortedSizes) {
    const sizeIndex = SIZE_ORDER.indexOf(size);
    if (sizeIndex <= targetIndex) {
      bestMatch = size;
    } else {
      break;
    }
  }

  // If no smaller or equal size found, return the smallest available
  return bestMatch || sortedSizes[0];
}

/**
 * Get the price for an addon based on meal size
 */
export function getAddonPriceForMealSize(
  mealSizeType: SizeType | null | undefined,
  addonSizes: Array<{ sizeType: SizeType; price: number | string }>
): number | null {
  if (addonSizes.length === 0) {
    return null;
  }

  const availableSizes = addonSizes.map((s) => s.sizeType);
  const matchedSize = getNearestSmallerAddonSize(mealSizeType, availableSizes);

  if (!matchedSize) {
    return null;
  }

  const matchedAddonSize = addonSizes.find((s) => s.sizeType === matchedSize);
  return matchedAddonSize ? Number(matchedAddonSize.price) : null;
}

