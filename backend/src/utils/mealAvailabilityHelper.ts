import type { PrismaClient } from "@prisma/client";

type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type MealBranchAvailabilityLike = {
  isAvailableAllWeek: boolean;
  windows: AvailabilityWindow[];
};

const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseTimeToMinutes(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function getZonedDayAndMinutes(now: Date, timeZone: string): { dayOfWeek: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value;
  const hourStr = parts.find((p) => p.type === "hour")?.value;
  const minuteStr = parts.find((p) => p.type === "minute")?.value;

  const dayOfWeek = weekdayShort && weekdayShort in WEEKDAY_SHORT_TO_NUM ? WEEKDAY_SHORT_TO_NUM[weekdayShort] : 0;
  const hour = hourStr ? parseInt(hourStr, 10) : 0;
  const minute = minuteStr ? parseInt(minuteStr, 10) : 0;

  return { dayOfWeek, minutes: hour * 60 + minute };
}

function isNowWithinWindow(params: {
  nowDayOfWeek: number;
  nowMinutes: number;
  window: AvailabilityWindow;
}): boolean {
  const { nowDayOfWeek, nowMinutes, window } = params;

  if (typeof window.dayOfWeek !== "number" || window.dayOfWeek < 0 || window.dayOfWeek > 6) {
    return false;
  }

  const startMin = parseTimeToMinutes(window.startTime);
  const endMin = parseTimeToMinutes(window.endTime);
  if (startMin === null || endMin === null) return false;

  // 00:00-00:00 => treat as closed (avoid ambiguous "all day")
  if (startMin === endMin) return false;

  if (endMin > startMin) {
    // Normal same-day window.
    return nowDayOfWeek === window.dayOfWeek && nowMinutes >= startMin && nowMinutes < endMin;
  }

  // Overnight window (e.g. 22:00 -> 02:00).
  // Active from dayOfWeek @ startMin until next day @ endMin.
  const nextDay = (window.dayOfWeek + 1) % 7;
  if (nowDayOfWeek === window.dayOfWeek) {
    return nowMinutes >= startMin;
  }
  if (nowDayOfWeek === nextDay) {
    return nowMinutes < endMin;
  }
  return false;
}

export function isMealAvailableNow(params: {
  availability: MealBranchAvailabilityLike | null;
  now: Date;
  timeZone: string;
}): boolean {
  const { availability, now, timeZone } = params;

  // No config => default available.
  if (!availability) return true;

  if (availability.isAvailableAllWeek) return true;

  const windows = Array.isArray(availability.windows) ? availability.windows : [];
  if (windows.length === 0) return false;

  const { dayOfWeek, minutes } = getZonedDayAndMinutes(now, timeZone);

  for (const window of windows) {
    if (isNowWithinWindow({ nowDayOfWeek: dayOfWeek, nowMinutes: minutes, window })) {
      return true;
    }
  }

  return false;
}

export async function getBranchTimeZone(params: {
  prisma: PrismaClient;
  branchId: string;
}): Promise<string> {
  const { prisma, branchId } = params;
  const branch = await (prisma as any).branch.findUnique({
    where: { id: branchId },
    select: { timezone: true },
  });
  const tz = (branch as any)?.timezone;
  return typeof tz === "string" && tz.trim() ? tz.trim() : "UTC";
}

export async function filterMealIdsAvailableNow(params: {
  prisma: PrismaClient;
  branchId: string;
  mealIds: string[];
  now?: Date;
}): Promise<string[]> {
  const { prisma, branchId } = params;
  const now = params.now || new Date();

  if (!Array.isArray(params.mealIds) || params.mealIds.length === 0) return [];

  const timeZone = await getBranchTimeZone({ prisma, branchId });

  const configs = await (prisma as any).mealBranchAvailability.findMany({
    where: {
      branchId,
      mealId: { in: params.mealIds },
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

  const configByMealId = new Map<string, MealBranchAvailabilityLike>();
  for (const c of configs) {
    if (c?.mealId) {
      configByMealId.set(String(c.mealId), {
        isAvailableAllWeek: Boolean((c as any).isAvailableAllWeek),
        windows: Array.isArray((c as any).windows) ? (c as any).windows : [],
      });
    }
  }

  const result: string[] = [];
  for (const mealId of params.mealIds) {
    const cfg = configByMealId.get(mealId) || null;
    if (isMealAvailableNow({ availability: cfg, now, timeZone })) {
      result.push(mealId);
    }
  }

  return result;
}
