import { OrderStatus, ReservationStatus, SizeType } from "@prisma/client";
import DatabaseSingleton from "../config/database";

type Decimalish = number | string;

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Utility to convert Prisma Decimal-like values to number
const toNumber = (value: any) =>
  value === null || value === undefined ? 0 : Number(value);

// Map sizeType to configured weight for a meal within a branch
const buildSizeWeightMap = async (
  branchId: string,
  mealId: string
): Promise<Record<SizeType, number>> => {
  const db = DatabaseSingleton.getInstance();
  const weights = await db.getPrisma().mealSizeWeight.findMany({
    where: { branchId, mealId },
    include: { mealSize: true },
  });

  const map: Record<SizeType, number> = {} as any;
  for (const w of weights) {
    if (w.mealSize?.sizeType) {
      map[w.mealSize.sizeType] = toNumber(w.weight);
    }
  }
  return map;
};

// Get all size weights for a meal in a branch (with size details)
export const getSizeWeightsWithDetails = async (
  branchId: string,
  mealId: string
) => {
  const db = DatabaseSingleton.getInstance();
  const weights = await db.getPrisma().mealSizeWeight.findMany({
    where: { branchId, mealId },
    include: { mealSize: true },
  });

  // Build a map of sizeType -> weight
  const weightsByType: Record<string, number> = {};
  for (const w of weights) {
    if (w.mealSize?.sizeType) {
      weightsByType[w.mealSize.sizeType] = toNumber(w.weight);
    }
  }

  return { weights, weightsByType };
};

export const deliverableQuantityService = {
  async getMealSizeWeights(branchId: string, mealId: string) {
    const db = DatabaseSingleton.getInstance();
    return db.getPrisma().mealSizeWeight.findMany({
      where: { branchId, mealId },
      include: { mealSize: true },
    });
  },

  async upsertMealSizeWeight(
    branchId: string,
    mealId: string,
    mealSizeId: string,
    weight: Decimalish
  ) {
    const db = DatabaseSingleton.getInstance();
    return db.getPrisma().mealSizeWeight.upsert({
      where: { mealId_mealSizeId_branchId: { branchId, mealId, mealSizeId } },
      update: { weight: Number(weight) },
      create: {
        branchId,
        mealId,
        mealSizeId,
        weight: Number(weight),
      },
    });
  },

  async deleteMealSizeWeight(id: string) {
    const db = DatabaseSingleton.getInstance();
    return db.getPrisma().mealSizeWeight.delete({ where: { id } });
  },

  // Get daily deliverable limit (no date - applies every day)
  async getDailyDeliverable(branchId: string, mealId: string) {
    const db = DatabaseSingleton.getInstance();
    return db.getPrisma().mealDailyDeliverable.findUnique({
      where: { mealId_branchId: { branchId, mealId } },
    });
  },

  // Set or update daily deliverable limit (no date - applies every day)
  async upsertDailyDeliverable(
    branchId: string,
    mealId: string,
    dailyDeliverableWeight: Decimalish
  ) {
    const db = DatabaseSingleton.getInstance();
    return db.getPrisma().mealDailyDeliverable.upsert({
      where: { mealId_branchId: { branchId, mealId } },
      update: { dailyDeliverableWeight: Number(dailyDeliverableWeight) },
      create: {
        branchId,
        mealId,
        dailyDeliverableWeight: Number(dailyDeliverableWeight),
      },
    });
  },

  // Delete daily deliverable limit
  async deleteDailyDeliverable(branchId: string, mealId: string) {
    const db = DatabaseSingleton.getInstance();
    return db.getPrisma().mealDailyDeliverable.deleteMany({
      where: { branchId, mealId },
    });
  },

  // Calculate consumed weight for a specific date
  async calculateConsumedWeight(branchId: string, mealId: string, date: Date) {
    const db = DatabaseSingleton.getInstance();
    const start = startOfDay(date);
    const end = endOfDay(date);
    const sizeWeightMap = await buildSizeWeightMap(branchId, mealId);

    // Orders for the day (pickup/delivery)
    const orders = await db.getPrisma().order.findMany({
      where: {
        branchId,
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: start, lte: end },
        orderItems: { some: { mealId } },
      },
      select: {
        orderItems: {
          where: { mealId },
          select: { quantity: true, mealSizeType: true },
        },
      },
    });

    let orderWeight = 0;
    for (const order of orders) {
      for (const item of order.orderItems) {
        const sizeWeight = item.mealSizeType
          ? sizeWeightMap[item.mealSizeType]
          : undefined;
        if (!sizeWeight) continue;
        orderWeight += item.quantity * sizeWeight;
      }
    }

    // Reservation orders for the day (pre-orders)
    const reservationOrders = await db.getPrisma().reservationOrder.findMany({
      where: {
        reservation: {
          branchId,
          reservationDate: { gte: start, lte: end },
          status: { not: ReservationStatus.CANCELLED },
        },
        items: { some: { mealId } },
      },
      select: {
        items: {
          where: { mealId },
          select: { quantity: true, mealSizeType: true },
        },
      },
    });

    let reservationWeight = 0;
    for (const ro of reservationOrders) {
      for (const item of ro.items) {
        const sizeWeight = item.mealSizeType
          ? sizeWeightMap[item.mealSizeType]
          : undefined;
        if (!sizeWeight) continue;
        reservationWeight += item.quantity * sizeWeight;
      }
    }

    return {
      orderWeight,
      reservationWeight,
      total: orderWeight + reservationWeight,
    };
  },

  // Get available weight for TODAY (main use case)
  async getAvailableWeight(branchId: string, mealId: string) {
    return this.getAvailableWeightForDate(branchId, mealId, new Date());
  },

  // Get available weight for a specific date (for reservations or historical data)
  async getAvailableWeightForDate(branchId: string, mealId: string, date: Date) {
    const daily = await this.getDailyDeliverable(branchId, mealId);
    if (!daily) {
      // Not configured: treat as unlimited by returning null
      return { availableWeight: null, dailyDeliverableWeight: null, consumedWeight: null };
    }
    const consumed = await this.calculateConsumedWeight(branchId, mealId, date);
    const available =
      Number(daily.dailyDeliverableWeight) - toNumber(consumed.total);
    return {
      availableWeight: available,
      dailyDeliverableWeight: Number(daily.dailyDeliverableWeight),
      consumedWeight: consumed.total,
    };
  },

  // Get size weight map for a meal (utility for other uses)
  async getSizeWeightMap(branchId: string, mealId: string) {
    return buildSizeWeightMap(branchId, mealId);
  },

  async checkAndReserveWeight(
    branchId: string,
    mealId: string,
    mealSizeType: SizeType | null | undefined,
    quantity: number,
    date: Date
  ) {
    const sizeWeights = await buildSizeWeightMap(branchId, mealId);
    const sizeWeight = mealSizeType ? sizeWeights[mealSizeType] : undefined;
    if (!sizeWeight) {
      // Size weight not configured - allow the order (no limit)
      return { requiredWeight: null, sizeWeight: null, availability: { availableWeight: null, dailyDeliverableWeight: null, consumedWeight: null } };
    }
    const requiredWeight = quantity * sizeWeight;
    const availability = await this.getAvailableWeightForDate(branchId, mealId, date);

    if (
      availability.availableWeight !== null &&
      requiredWeight > availability.availableWeight
    ) {
      throw new Error(
        `Insufficient deliverable quantity. Required ${requiredWeight.toFixed(2)} kg, available ${availability.availableWeight.toFixed(2)} kg.`
      );
    }
    return { requiredWeight, sizeWeight, availability };
  },

  async validateOrderWeight(
    items: { mealId: string; mealSizeType?: SizeType | null; quantity: number }[],
    branchId: string,
    date: Date
  ) {
    const failures: string[] = [];
    const db = DatabaseSingleton.getInstance();

    // Group items by mealId for efficient checks
    const grouped = items.reduce<Record<string, { quantity: number; mealSizeType?: SizeType | null }[]>>(
      (acc, item) => {
        acc[item.mealId] = acc[item.mealId] || [];
        acc[item.mealId].push({ quantity: item.quantity, mealSizeType: item.mealSizeType });
        return acc;
      },
      {}
    );

    for (const [mealId, mealItems] of Object.entries(grouped)) {
      // Check if this meal has a daily limit configured
      const dailyConfig = await this.getDailyDeliverable(branchId, mealId);
      if (!dailyConfig) {
        // No limit configured for this meal - skip validation
        continue;
      }

      // Fetch size weight map once per meal
      const sizeWeights = await buildSizeWeightMap(branchId, mealId);
      let requiredTotal = 0;
      let hasConfiguredSizes = false;

      for (const item of mealItems) {
        const sizeWeight = item.mealSizeType
          ? sizeWeights[item.mealSizeType]
          : undefined;
        if (!sizeWeight) {
          // Size weight not configured for this size - skip this item
          continue;
        }
        hasConfiguredSizes = true;
        requiredTotal += item.quantity * sizeWeight;
      }

      if (!hasConfiguredSizes) {
        // No size weights configured - skip validation
        continue;
      }

      const availability = await this.getAvailableWeightForDate(branchId, mealId, date);
      if (
        availability.availableWeight !== null &&
        requiredTotal > availability.availableWeight
      ) {
        // Get meal name for better error message
        const meal = await db.getPrisma().meal.findUnique({
          where: { id: mealId },
          select: { name: true },
        });
        const mealName = meal?.name || mealId;
        failures.push(
          `Daily limit exceeded for "${mealName}". Required ${requiredTotal.toFixed(2)} kg, available ${availability.availableWeight.toFixed(2)} kg.`
        );
      }
    }

    return { ok: failures.length === 0, failures };
  },

  async cancelPickupDeliveryOrdersIfExceeded(
    branchId: string,
    mealId: string,
    date: Date
  ) {
    const availability = await this.getAvailableWeightForDate(branchId, mealId, date);
    if (
      availability.dailyDeliverableWeight === null ||
      availability.availableWeight === null
    ) {
      return { cancelled: 0 };
    }

    if (availability.availableWeight >= 0) {
      return { cancelled: 0 };
    }

    const db = DatabaseSingleton.getInstance();
    const start = startOfDay(date);
    const end = endOfDay(date);

    const affectedOrders = await db.getPrisma().order.findMany({
      where: {
        branchId,
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING] },
        createdAt: { gte: start, lte: end },
        orderItems: { some: { mealId } },
      },
      select: { id: true },
    });

    if (!affectedOrders.length) return { cancelled: 0 };

    await db.getPrisma().order.updateMany({
      where: { id: { in: affectedOrders.map((o) => o.id) } },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    return { cancelled: affectedOrders.length };
  },
};
