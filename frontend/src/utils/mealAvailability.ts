import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";

type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type AvailabilityRecord = {
  branchId: string;
  isAvailableAllWeek: boolean;
  windows?: AvailabilityWindow[];
  branch?: { timezone?: string | null };
};

type UnknownRecord = Record<string, unknown>;

export type MealAvailabilityNow = {
  isAvailableNow: boolean;
  reason: string | null;
  nextAvailableAt: Date | null;
};

const safeTimeZone = (tz: string | null | undefined): string | null => {
  if (!tz) return null;
  try {
    // Throws on invalid IANA time zones
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
};

export const getEffectiveTimezone = (params: {
  branchTimezone?: string | null;
  settingsTimezone?: string | null;
}): string => {
  return (
    safeTimeZone(params.branchTimezone) ||
    safeTimeZone(params.settingsTimezone) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
};

const parseTimeToMinutes = (value: string): number | null => {
  const s = String(value || "").trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const extractAvailabilityRecords = (meal: unknown): AvailabilityRecord[] | null => {
  if (!meal || typeof meal !== "object") return null;
  const m = meal as UnknownRecord;

  const candidates = [
    m.mealBranchAvailabilities,
    m.mealBranchAvailability,
    m.branchAvailabilities,
    m.branchAvailability,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as AvailabilityRecord[];
    if (c && typeof c === "object") {
      const obj = c as UnknownRecord;
      if (Array.isArray(obj.windows)) return [c as AvailabilityRecord];
    }
  }

  return null;
};

const normalizeBackendDayOfWeek = (windows: AvailabilityWindow[]): ((d: number) => number) => {
  const values = windows.map((w) => Number(w.dayOfWeek)).filter((n) => Number.isFinite(n));

  // Most common: 0-6 (Sun-Sat)
  const hasZero = values.includes(0);
  const hasSix = values.includes(6);
  if (hasZero && hasSix) {
    return (backend) => {
      const d = Number(backend);
      return d === 0 ? 7 : d; // ISO 1-7, Sunday=7
    };
  }

  // ISO 1-7 (Mon=1..Sun=7)
  const hasSeven = values.includes(7);
  if (hasSeven) {
    return (backend) => {
      const d = Number(backend);
      return d;
    };
  }

  // Fallback: treat as ISO
  return (backend) => Number(backend);
};

const nowIsoDayAndMinutes = (tz: string): { isoDay: number; minutes: number } => {
  const now = new Date();
  const isoDay = Number(formatInTimeZone(now, tz, "i")); // 1..7 (Mon..Sun)
  const hh = Number(formatInTimeZone(now, tz, "H"));
  const mm = Number(formatInTimeZone(now, tz, "m"));
  return {
    isoDay: Number.isFinite(isoDay) ? isoDay : 1,
    minutes: (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0),
  };
};

const isWithinWindow = (nowMinutes: number, start: number, end: number): boolean => {
  if (start === end) return true;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  // Wraps over midnight
  return nowMinutes >= start || nowMinutes < end;
};

const nextStartForWindow = (params: {
  tz: string;
  nowIsoDay: number;
  nowMinutes: number;
  windowIsoDay: number;
  startMinutes: number;
}): Date | null => {
  const { tz, nowIsoDay, nowMinutes, windowIsoDay, startMinutes } = params;

  const daysAheadRaw = (windowIsoDay - nowIsoDay + 7) % 7;
  const needsNextWeek = daysAheadRaw === 0 && startMinutes <= nowMinutes;
  const daysAhead = needsNextWeek ? 7 : daysAheadRaw;

  const base = new Date();
  const yyyy = Number(formatInTimeZone(base, tz, "yyyy"));
  const MM = Number(formatInTimeZone(base, tz, "MM"));
  const dd = Number(formatInTimeZone(base, tz, "dd"));

  // Construct a date in the target timezone by taking today's Y/M/D in tz and then adding daysAhead.
  // We do the day addition in UTC to avoid DST surprises, then interpret as local in tz via zonedTimeToUtc.
  const utcMidnight = new Date(Date.UTC(yyyy, (MM || 1) - 1, dd || 1, 0, 0, 0));
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + daysAhead);

  const h = Math.floor(startMinutes / 60);
  const m = startMinutes % 60;

  const localLike = {
    year: utcMidnight.getUTCFullYear(),
    month: utcMidnight.getUTCMonth() + 1,
    day: utcMidnight.getUTCDate(),
    hours: h,
    minutes: m,
    seconds: 0,
  };

  try {
    return zonedTimeToUtc(
      `${localLike.year}-${String(localLike.month).padStart(2, "0")}-${String(localLike.day).padStart(2, "0")}T${String(localLike.hours).padStart(2, "0")}:${String(localLike.minutes).padStart(2, "0")}:00`,
      tz
    );
  } catch {
    return null;
  }
};

export const getMealAvailabilityNow = (params: {
  meal: unknown;
  branchId: string | null | undefined;
  tz: string;
}): MealAvailabilityNow => {
  const { meal, branchId, tz } = params;

  if (!branchId) {
    return { isAvailableNow: true, reason: null, nextAvailableAt: null };
  }

  const records = extractAvailabilityRecords(meal);
  if (!records || records.length === 0) {
    // Fail open if the API doesn't provide availability info.
    return { isAvailableNow: true, reason: null, nextAvailableAt: null };
  }

  const record = records.find((r) => String(r?.branchId) === String(branchId)) || null;
  if (!record) {
    // Fail open if there is no record for this branch.
    return { isAvailableNow: true, reason: null, nextAvailableAt: null };
  }

  const isAvailableAllWeek = record.isAvailableAllWeek !== false;
  if (isAvailableAllWeek) {
    return { isAvailableNow: true, reason: null, nextAvailableAt: null };
  }

  const windows = Array.isArray(record.windows) ? (record.windows as AvailabilityWindow[]) : [];
  if (windows.length === 0) {
    return {
      isAvailableNow: false,
      reason: "Not available at this time.",
      nextAvailableAt: null,
    };
  }

  const { isoDay: nowIsoDay, minutes: nowMinutes } = nowIsoDayAndMinutes(tz);
  const normalizeDay = normalizeBackendDayOfWeek(windows);

  let isAvailableNow = false;
  for (const w of windows) {
    const start = parseTimeToMinutes(w.startTime);
    const end = parseTimeToMinutes(w.endTime);
    if (start === null || end === null) continue;

    const windowIsoDay = normalizeDay(w.dayOfWeek);
    if (!Number.isFinite(windowIsoDay)) continue;

    if (windowIsoDay !== nowIsoDay) continue;

    if (isWithinWindow(nowMinutes, start, end)) {
      isAvailableNow = true;
      break;
    }
  }

  if (isAvailableNow) {
    return { isAvailableNow: true, reason: null, nextAvailableAt: null };
  }

  // Find next start time across the next 7 days.
  let next: Date | null = null;
  for (const w of windows) {
    const start = parseTimeToMinutes(w.startTime);
    if (start === null) continue;

    const windowIsoDay = normalizeDay(w.dayOfWeek);
    if (!Number.isFinite(windowIsoDay)) continue;

    const candidate = nextStartForWindow({
      tz,
      nowIsoDay,
      nowMinutes,
      windowIsoDay,
      startMinutes: start,
    });

    if (!candidate) continue;
    if (!next || candidate.getTime() < next.getTime()) {
      next = candidate;
    }
  }

  return {
    isAvailableNow: false,
    reason: "Not available right now.",
    nextAvailableAt: next,
  };
};
