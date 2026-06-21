import type { PrismaClient } from "@prisma/client";
import { getBranchTimeZone, isMealAvailableNow } from "./mealAvailabilityHelper";

export type CartBranchUnavailableItem = {
  itemType: "MEAL" | "DEAL" | "ADDON";
  id: string;
  name: string;
  reason: string;
};

type CartItem = {
  mealId?: string;
  dealId?: string;
  itemType?: string;
  id?: string;
  name?: string;
  addOns?: Array<{ id: string; name?: string }>;
};

const isDealCartItem = (item: any): boolean => {
  return Boolean(item?.dealId || String(item?.itemType || "").toUpperCase() === "DEAL");
};

export async function validateCartItemsForBranch(params: {
  prisma: PrismaClient;
  branchId: string;
  cartItems: CartItem[];
}): Promise<CartBranchUnavailableItem[]> {
  const { prisma, branchId, cartItems } = params;

  const mealIds = cartItems
    .filter((item) => !isDealCartItem(item) && item?.itemType !== "VOUCHER" && String(item?.itemType).toUpperCase() !== "VOUCHER")
    .map((item: any) => item?.mealId || item?.id)
    .filter((id: any): id is string => typeof id === "string" && id.trim().length > 0);

  const dealIds = cartItems
    .filter((item) => isDealCartItem(item))
    .map((item: any) => item?.dealId)
    .filter((id: any): id is string => typeof id === "string" && id.trim().length > 0);

  const addOnIds = cartItems
    .flatMap((item: any) => (Array.isArray(item?.addOns) ? item.addOns : []))
    .map((a: any) => a?.id)
    .filter((id: any): id is string => typeof id === "string" && id.trim().length > 0);

  const [meals, deals, addOns] = await Promise.all([
    mealIds.length > 0
      ? prisma.meal.findMany({
          where: { id: { in: mealIds } },
          select: {
            id: true,
            name: true,
            isActive: true,
            excludedBranches: true,
            category: { select: { excludedBranches: true } },
          },
        })
      : Promise.resolve([]),
    dealIds.length > 0
      ? (prisma as any).deal.findMany({
          where: { id: { in: dealIds } },
          select: {
            id: true,
            name: true,
            isActive: true,
            excludedBranches: true,
            category: { select: { excludedBranches: true } },
          },
        })
      : Promise.resolve([]),
    addOnIds.length > 0
      ? prisma.addOn.findMany({
          where: { id: { in: addOnIds } },
          select: { id: true, name: true, isActive: true, excludedBranches: true },
        })
      : Promise.resolve([]),
  ]);

  const mealById = new Map(meals.map((m) => [m.id, m] as const));
  const dealById = new Map((deals as any[]).map((d) => [d.id, d] as const));
  const addOnById = new Map(addOns.map((a) => [a.id, a] as const));

  const mealAvailabilityById = new Map<
    string,
    { isAvailableAllWeek: boolean; windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }> }
  >();
  if (mealIds.length > 0) {
    const configs = await (prisma as any).mealBranchAvailability.findMany({
      where: {
        branchId,
        mealId: { in: mealIds },
      },
      select: {
        mealId: true,
        isAvailableAllWeek: true,
        windows: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    for (const cfg of configs) {
      if (cfg?.mealId) {
        mealAvailabilityById.set(String(cfg.mealId), {
          isAvailableAllWeek: Boolean((cfg as any).isAvailableAllWeek),
          windows: Array.isArray((cfg as any).windows) ? (cfg as any).windows : [],
        });
      }
    }
  }

  const timeZone = await getBranchTimeZone({ prisma, branchId });
  const now = new Date();

  const unavailable: CartBranchUnavailableItem[] = [];

  for (const item of cartItems) {
    if (item?.itemType === "VOUCHER" || String(item?.itemType).toUpperCase() === "VOUCHER") {
      continue;
    }
    if (isDealCartItem(item)) {
      const dealId = (item as any)?.dealId;
      if (typeof dealId !== "string" || dealId.trim().length === 0) continue;

      const deal = dealById.get(dealId);
      if (!deal || deal.isActive === false) {
        unavailable.push({
          itemType: "DEAL",
          id: dealId,
          name: deal?.name || item?.name || "Unknown deal",
          reason: !deal ? "Deal not found" : "Deal is not active",
        });
        continue;
      }

      if (Array.isArray(deal.excludedBranches) && deal.excludedBranches.includes(branchId)) {
        unavailable.push({
          itemType: "DEAL",
          id: dealId,
          name: deal.name,
          reason: "Deal excluded from this branch",
        });
        continue;
      }

      if (Array.isArray(deal?.category?.excludedBranches) && deal.category.excludedBranches.includes(branchId)) {
        unavailable.push({
          itemType: "DEAL",
          id: dealId,
          name: deal.name,
          reason: "Category excluded from this branch",
        });
        continue;
      }

      continue;
    }

    const mealId = (item as any)?.mealId || (item as any)?.id;
    if (typeof mealId !== "string" || mealId.trim().length === 0) continue;

    const meal = mealById.get(mealId);
    if (!meal || meal.isActive === false) {
      unavailable.push({
        itemType: "MEAL",
        id: mealId,
        name: meal?.name || item?.name || "Unknown meal",
        reason: !meal ? "Meal not found" : "Meal is not active",
      });
      continue;
    }

    if (Array.isArray(meal.excludedBranches) && meal.excludedBranches.includes(branchId)) {
      unavailable.push({
        itemType: "MEAL",
        id: mealId,
        name: meal.name,
        reason: "Meal excluded from this branch",
      });
      continue;
    }

    if (Array.isArray(meal?.category?.excludedBranches) && meal.category.excludedBranches.includes(branchId)) {
      unavailable.push({
        itemType: "MEAL",
        id: mealId,
        name: meal.name,
        reason: "Category excluded from this branch",
      });
      continue;
    }

    const availability = mealAvailabilityById.get(mealId) || null;
    const isAvailable = isMealAvailableNow({
      availability,
      now,
      timeZone,
    });
    if (!isAvailable) {
      unavailable.push({
        itemType: "MEAL",
        id: mealId,
        name: meal.name,
        reason: "Meal is not available at this time",
      });
      continue;
    }
  }

  for (const addOnId of addOnIds) {
    const addOn = addOnById.get(addOnId);
    if (!addOn || addOn.isActive === false) {
      unavailable.push({
        itemType: "ADDON",
        id: addOnId,
        name: addOn?.name || "Unknown add-on",
        reason: !addOn ? "Add-on not found" : "Add-on is not active",
      });
      continue;
    }

    if (Array.isArray(addOn.excludedBranches) && addOn.excludedBranches.includes(branchId)) {
      unavailable.push({
        itemType: "ADDON",
        id: addOnId,
        name: addOn.name,
        reason: "Add-on excluded from this branch",
      });
      continue;
    }
  }

  return unavailable;
}
