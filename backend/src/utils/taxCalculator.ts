import { PrismaClient } from "@prisma/client";
import DatabaseSingleton from "../config/database";
import { getMealTaxPercentage as getMealTaxPercentageFromHelper } from "./mealPriceHelper";
import { getAddonTaxPercentage as getAddonTaxPercentageFromHelper } from "./addonPriceHelper";

interface TaxCalculationResult {
  itemTaxAmount: number;
  addonTaxAmount: number;
  deliveryTaxAmount: number;
  totalTaxAmount: number;
  itemTaxPercentages: { [key: string]: number };
  addonTaxPercentages: { [key: string]: number };
}

interface CartItem {
  mealId: string;
  quantity: number;
  size?: string;
  addOns?: any[];
  basePrice: number;
}

export class TaxCalculator {
  private prisma: PrismaClient;
  private settings: any = null;

  constructor() {
    this.prisma = DatabaseSingleton.getInstance().getPrisma();
  }

  /**
   * Calculate tax for an order based on the cart items
   * Returns the breakdown of tax amounts for items, addons, and delivery
   */
  async calculateTax(
    cartItems: CartItem[],
    deliveryFee: number = 0,
    mealSizePrices?: { [key: string]: number },
    branchId?: string | null
  ): Promise<TaxCalculationResult> {
    // Load settings if not already loaded
    if (!this.settings) {
      this.settings = await this.prisma.settings.findFirst();
    }

    if (!this.settings) {
      throw new Error("Settings not found");
    }

    const result: TaxCalculationResult = {
      itemTaxAmount: 0,
      addonTaxAmount: 0,
      deliveryTaxAmount: 0,
      totalTaxAmount: 0,
      itemTaxPercentages: {},
      addonTaxPercentages: {},
    };

    let itemTaxAmount = 0;
    let addonTaxAmount = 0;
    const taxInclusive = this.settings.taxInclusive || false;

    // Calculate tax for each cart item
    for (const item of cartItems) {
      // Fetch meal with category and size information
      const meal = await this.prisma.meal.findUnique({
        where: { id: item.mealId },
        include: {
          category: true,
          mealSizes: true,
        },
      });

      if (!meal) continue;

      // Determine tax percentage for this meal
      // Priority: Branch-meal override > MealSize > Meal > Category > Settings
      let taxPercentage = this.settings.taxPercentage || 0;

      // First, check for branch-meal override
      if (branchId) {
        const branchTaxPercentage = await getMealTaxPercentageFromHelper(
          item.mealId,
          branchId
        );
        if (branchTaxPercentage !== null) {
          taxPercentage = branchTaxPercentage;
        }
      }

      // If no branch override applied, check meal size, meal, category in order
      if (branchId ? (await getMealTaxPercentageFromHelper(item.mealId, branchId)) === null : true) {
        if (item.size) {
          const mealSize = meal.mealSizes.find((size) => size.name === item.size);
          if (mealSize && mealSize.taxPercentage !== null) {
            taxPercentage = Number(mealSize.taxPercentage);
          } else if (meal.taxPercentage !== null) {
            taxPercentage = Number(meal.taxPercentage);
          } else if (meal.category && meal.category.taxPercentage !== null) {
            taxPercentage = Number(meal.category.taxPercentage);
          }
        } else if (meal.taxPercentage !== null) {
          taxPercentage = Number(meal.taxPercentage);
        } else if (meal.category && meal.category.taxPercentage !== null) {
          taxPercentage = Number(meal.category.taxPercentage);
        }
      }

      // Calculate the base price (considering size if applicable)
      // IMPORTANT: Frontend sends item.basePrice as meal.basePrice + size.price
      // So we should use item.basePrice directly
      let basePrice = item.basePrice;
      if (
        item.size &&
        mealSizePrices &&
        mealSizePrices[item.mealId + ":" + item.size]
      ) {
        // Only override if mealSizePrices is provided and has the size price
        // Otherwise, use the basePrice from cart (which already includes size)
        basePrice = mealSizePrices[item.mealId + ":" + item.size];
      }

      // Calculate tax for this item
      let itemTax = 0;
      if (taxInclusive) {
        // Tax is included in the price, calculate how much tax was included
        itemTax = (basePrice * taxPercentage) / (100 + taxPercentage);
      } else {
        // Tax is added on top of the price
        itemTax = (basePrice * taxPercentage) / 100;
      }

      itemTaxAmount += itemTax * item.quantity;
      result.itemTaxPercentages[item.mealId] = taxPercentage;

      // Calculate tax for addons
      if (item.addOns && item.addOns.length > 0) {
        for (const addOn of item.addOns) {
          // Fetch addon details
          const addonData = await this.prisma.addOn.findUnique({
            where: { id: addOn.id },
          });

          if (!addonData) continue;

          // Determine tax percentage for this addon
          // Priority: Branch override > AddOn tax > Branch tax > Settings default tax
          let addonTaxPercentage = this.settings.taxPercentage || 0;
          
    // First, check for branch-specific tax override
    if (branchId) {
            const branchTaxPercentage = await getAddonTaxPercentageFromHelper(addOn.id, branchId);
            if (branchTaxPercentage !== null) {
              addonTaxPercentage = branchTaxPercentage;
            } else if (addonData.taxPercentage !== null) {
              addonTaxPercentage = Number(addonData.taxPercentage);
            }
          } else {
            // No branchId, use addon tax or settings
            if (addonData.taxPercentage !== null) {
              addonTaxPercentage = Number(addonData.taxPercentage);
            }
          }

          const addonQuantity = addOn.quantity || 1;
          const addonPrice = Number(addonData.price);

          // Calculate tax for this addon
          let addonTax = 0;
          if (taxInclusive) {
            addonTax =
              (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage);
          } else {
            addonTax = (addonPrice * addonTaxPercentage) / 100;
          }

          addonTaxAmount += addonTax * addonQuantity * item.quantity;
          result.addonTaxPercentages[addOn.id] = addonTaxPercentage;
        }
      }
    }

    // Calculate delivery tax
    let deliveryTax = 0;
    if (deliveryFee > 0 && this.settings.deliveryTaxPercentage) {
      const deliveryTaxPercentage = Number(this.settings.deliveryTaxPercentage);
      if (taxInclusive) {
        deliveryTax =
          (deliveryFee * deliveryTaxPercentage) / (100 + deliveryTaxPercentage);
      } else {
        deliveryTax = (deliveryFee * deliveryTaxPercentage) / 100;
      }
    }


    // Round to 2 decimal places for currency
    result.itemTaxAmount = Math.round(itemTaxAmount * 100) / 100;
    result.addonTaxAmount = Math.round(addonTaxAmount * 100) / 100;
    result.deliveryTaxAmount = Math.round(deliveryTax * 100) / 100;
    result.totalTaxAmount =
      Math.round((itemTaxAmount + addonTaxAmount + deliveryTax) * 100) / 100;

    return result;
  }

  /**
   * Get tax percentage for a specific meal based on priority
   * Priority: Branch-meal override > MealSize > Meal > Category > Settings
   */
  async getMealTaxPercentage(
    mealId: string,
    sizeName?: string,
    branchId?: string | null
  ): Promise<number> {
    if (!this.settings) {
      this.settings = await this.prisma.settings.findFirst();
    }

    const defaultTax = this.settings?.taxPercentage || 0;

    // First, check for branch-meal override
    if (branchId) {
      const branchTaxPercentage = await getMealTaxPercentageFromHelper(mealId, branchId);
      if (branchTaxPercentage !== null) {
        // If branch override exists, still check meal size as it has higher priority
        if (sizeName) {
          const meal = await this.prisma.meal.findUnique({
            where: { id: mealId },
            include: {
              mealSizes: true,
            },
          });
          if (meal) {
            const mealSize = meal.mealSizes.find((size) => size.name === sizeName);
            if (mealSize && mealSize.taxPercentage !== null) {
              return Number(mealSize.taxPercentage);
            }
          }
        }
        return branchTaxPercentage;
      }
    }

    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      include: {
        category: true,
        mealSizes: true,
      },
    });

    if (!meal) return defaultTax;

    // Check meal size first (highest priority after branch override)
    if (sizeName) {
      const mealSize = meal.mealSizes.find((size) => size.name === sizeName);
      if (mealSize && mealSize.taxPercentage !== null) {
        return Number(mealSize.taxPercentage);
      }
    }

    // Check meal tax
    if (meal.taxPercentage !== null) {
      return Number(meal.taxPercentage);
    }

    // Check category tax
    if (meal.category && meal.category.taxPercentage !== null) {
      return Number(meal.category.taxPercentage);
    }

    // Return default tax
    return defaultTax;
  }

  /**
   * Get tax percentage for a specific addon
   * Priority: Branch override > Addon tax > Branch tax > Settings
   */
  async getAddonTaxPercentage(
    addonId: string,
    branchId?: string | null
  ): Promise<number> {
    if (!this.settings) {
      this.settings = await this.prisma.settings.findFirst();
    }

    const defaultTax = this.settings?.taxPercentage || 0;

    // First, check for branch-specific tax override
    if (branchId) {
      const branchTaxPercentage = await getAddonTaxPercentageFromHelper(addonId, branchId);
      if (branchTaxPercentage !== null) {
        return branchTaxPercentage;
      }
    }

    const addon = await this.prisma.addOn.findUnique({
      where: { id: addonId },
    });

    if (!addon) return defaultTax;

    // Check addon tax
    if (addon.taxPercentage !== null) {
      return Number(addon.taxPercentage);
    }

    // Return default tax
    return defaultTax;
  }
}

export default TaxCalculator;
