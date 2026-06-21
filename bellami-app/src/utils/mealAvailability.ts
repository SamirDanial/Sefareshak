type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type AvailabilityRecord = {
  branchId: string;
  isAvailableAllWeek?: boolean | null;
  windows?: AvailabilityWindow[];
};

type UnknownRecord = Record<string, unknown>;

export type MealAvailabilityNow = {
  isAvailableNow: boolean;
  reason: string | null;
  nextAvailableText: string | null;
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

const isWithinWindow = (nowMinutes: number, startMinutes: number, endMinutes: number): boolean => {
  if (startMinutes === endMinutes) return true;
  if (endMinutes < startMinutes) {
    return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
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

// Backend can send dayOfWeek as 0-6 (Sun-Sat) or 1-7 (Mon-Sun)
const normalizeBackendDayOfWeek = (windows: AvailabilityWindow[]): ((d: number) => number) => {
  const values = windows.map((w) => Number(w.dayOfWeek)).filter((n) => Number.isFinite(n));

  const hasZero = values.includes(0);
  const hasSix = values.includes(6);
  if (hasZero && hasSix) {
    return (backend) => {
      const d = Number(backend);
      return d === 0 ? 7 : d; // ISO 1..7
    };
  }

  const hasSeven = values.includes(7);
  if (hasSeven) {
    return (backend) => Number(backend);
  }

  return (backend) => Number(backend);
};

const safeTimeZone = (tz: string | null | undefined): string | null => {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
};

export const getEffectiveTimezone = (params: {
  branchTimezone?: string | null;
  settingsTimezone?: string | null;
  deviceTimezone: string;
}): string => {
  return (
    safeTimeZone(params.branchTimezone) ||
    safeTimeZone(params.settingsTimezone) ||
    safeTimeZone(params.deviceTimezone) ||
    "UTC"
  );
};

const getZonedNow = (tz: string): { isoDay: number; minutes: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  const wk = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");

  const weekdayIsoMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    isoDay: weekdayIsoMap[wk] ?? 1,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
};

const isoDayLabel = (isoDay: number): string => {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const idx = Math.min(7, Math.max(1, Number(isoDay))) - 1;
  return labels[idx];
};

export const getMealAvailabilityNow = (params: {
  meal: unknown;
  branchId: string | null | undefined;
  tz: string;
}): MealAvailabilityNow => {
  const { meal, branchId, tz } = params;

  if (!branchId) {
    return { isAvailableNow: true, reason: null, nextAvailableText: null };
  }

  const records = extractAvailabilityRecords(meal);
  if (!records || records.length === 0) {
    return { isAvailableNow: true, reason: null, nextAvailableText: null };
  }

  const record = records.find((r) => String(r?.branchId) === String(branchId)) || null;
  if (!record) {
    return { isAvailableNow: true, reason: null, nextAvailableText: null };
  }

  const isAvailableAllWeek = record.isAvailableAllWeek !== false;
  if (isAvailableAllWeek) {
    return { isAvailableNow: true, reason: null, nextAvailableText: null };
  }

  const windows = Array.isArray(record.windows) ? (record.windows as AvailabilityWindow[]) : [];
  if (windows.length === 0) {
    return { isAvailableNow: false, reason: "Not available right now.", nextAvailableText: null };
  }

  const { isoDay: nowIsoDay, minutes: nowMinutes } = getZonedNow(tz);
  const normalizeDay = normalizeBackendDayOfWeek(windows);

  for (const w of windows) {
    const start = parseTimeToMinutes(w.startTime);
    const end = parseTimeToMinutes(w.endTime);
    if (start === null || end === null) continue;

    const windowIsoDay = normalizeDay(w.dayOfWeek);
    if (!Number.isFinite(windowIsoDay)) continue;
    if (windowIsoDay !== nowIsoDay) continue;

    if (isWithinWindow(nowMinutes, start, end)) {
      return { isAvailableNow: true, reason: null, nextAvailableText: null };
    }
  }

  // Next available: choose soonest start across next 7 days (text only).
  let best: { deltaDays: number; startMinutes: number; label: string } | null = null;
  for (const w of windows) {
    const start = parseTimeToMinutes(w.startTime);
    if (start === null) continue;

    const windowIsoDay = normalizeDay(w.dayOfWeek);
    if (!Number.isFinite(windowIsoDay)) continue;

    const rawDelta = (windowIsoDay - nowIsoDay + 7) % 7;
    const deltaDays = rawDelta === 0 && start <= nowMinutes ? 7 : rawDelta;

    const label = `${isoDayLabel(windowIsoDay)} ${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;

    const candidate = { deltaDays, startMinutes: start, label };
    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.deltaDays < best.deltaDays) {
      best = candidate;
      continue;
    }

    if (candidate.deltaDays === best.deltaDays && candidate.startMinutes < best.startMinutes) {
      best = candidate;
    }
  }

  return {
    isAvailableNow: false,
    reason: "Not available right now.",
    nextAvailableText: best?.label ?? null,
  };
};
