/**
 * Utility functions for delivery serving hours
 */

export interface TimePeriod {
  open: string; // 12-hour format, e.g., "9:00 AM"
  close: string; // 12-hour format, e.g., "10:00 PM"
}

export interface DayHours {
  isOff: boolean;
  open?: string; // Deprecated: kept for backward compatibility
  close?: string; // Deprecated: kept for backward compatibility
  periods?: TimePeriod[]; // Array of time periods for the day
}

export interface DeliveryHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

/**
 * Convert 12-hour format time string to 24-hour format minutes since midnight
 * @param timeStr - Time in 12-hour format (e.g., "9:00 AM", "10:30 PM")
 * @returns Minutes since midnight (0-1439)
 */
function parse12HourTime(timeStr: string): number {
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Expected format: "HH:MM AM/PM"`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (hours === 12) {
    hours = 0; // 12:XX AM/PM becomes 0:XX
  }

  if (period === "PM") {
    hours += 12;
  }

  return hours * 60 + minutes;
}

/**
 * Get day name from date (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
function getDayName(dayIndex: number): keyof DeliveryHours {
  const days: (keyof DeliveryHours)[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[dayIndex];
}

/**
 * Check if current time is within serving hours for a given day
 * @param hours - Delivery hours configuration
 * @param date - Date to check (defaults to now)
 * @returns Object with isOpen status and nextOpenTime if closed
 */
export function checkServingHours(
  hours: DeliveryHours,
  date: Date = new Date()
): {
  isOpen: boolean;
  isOff: boolean;
  nextOpenTime?: Date;
  currentDayHours?: DayHours;
  message?: string;
  // Structured data for frontend translation
  hoursUntilOpen?: number;
  minutesUntilOpen?: number;
  nextOpenDay?: string;
  nextOpenTimeString?: string;
} {
  const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayName = getDayName(dayIndex);
  const dayHours = hours[dayName];

  // If day is off
  if (dayHours.isOff) {
    // Find next open day
    let nextDayIndex = (dayIndex + 1) % 7;
    let daysToAdd = 1;
    let nextOpenDay: keyof DeliveryHours | null = null;

    for (let i = 0; i < 7; i++) {
      const checkDayName = getDayName(nextDayIndex);
      if (!hours[checkDayName].isOff) {
        nextOpenDay = checkDayName;
        break;
      }
      nextDayIndex = (nextDayIndex + 1) % 7;
      daysToAdd++;
    }

    if (nextOpenDay) {
      const nextOpenDate = new Date(date);
      nextOpenDate.setDate(nextOpenDate.getDate() + daysToAdd);
      nextOpenDate.setHours(0, 0, 0, 0);

      const nextDayHours = hours[nextOpenDay];
      if (nextDayHours.open) {
        const [hours, minutes] = nextDayHours.open
          .split(":")
          .map((s) => parseInt(s.trim(), 10));
        const period = nextDayHours.open.includes("PM")
          ? "PM"
          : nextDayHours.open.includes("AM")
          ? "AM"
          : "";
        let h = hours;
        if (period === "PM" && h !== 12) h += 12;
        if (period === "AM" && h === 12) h = 0;
        nextOpenDate.setHours(h, minutes || 0, 0, 0);
      }

      return {
        isOpen: false,
        isOff: true,
        nextOpenTime: nextOpenDate,
        currentDayHours: dayHours,
        message: `We're closed today. We'll be open ${nextOpenDay.charAt(0).toUpperCase() + nextOpenDay.slice(1)} at ${nextDayHours.open || "TBD"}`,
        nextOpenDay: nextOpenDay.charAt(0).toUpperCase() + nextOpenDay.slice(1),
        nextOpenTimeString: nextDayHours.open || undefined,
      };
    }

    return {
      isOpen: false,
      isOff: true,
      currentDayHours: dayHours,
      message: "We're closed today. Please check back later.",
    };
  }

  // Get periods - use new periods array if available, otherwise fall back to single open/close
  let periods: TimePeriod[] = [];
  if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
    periods = dayHours.periods;
  } else if (dayHours.open && dayHours.close) {
    // Fallback to single period for backward compatibility
    periods = [{ open: dayHours.open, close: dayHours.close }];
  }

  // If no periods set, assume always open
  if (periods.length === 0) {
    return {
      isOpen: true,
      isOff: false,
      currentDayHours: dayHours,
    };
  }

  try {
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    let isOpen = false;
    let nextOpenTime: Date | undefined;
    let nextOpenTimeString: string | undefined;

    // Check if current time is within any period
    for (const period of periods) {
      const openMinutes = parse12HourTime(period.open);
      const closeMinutes = parse12HourTime(period.close);

      // Handle case where close time is next day (e.g., 3:30 PM - 3:00 AM)
      let periodIsOpen = false;
    if (closeMinutes > openMinutes) {
      // Normal case: open and close on same day
        periodIsOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
      } else {
        // Close time is next day (e.g., 3:30 PM - 3:00 AM)
        periodIsOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
      }

      if (periodIsOpen) {
        isOpen = true;
        break;
      }

      // Track the earliest next open time
      let periodNextOpen: Date;
      if (currentMinutes < openMinutes) {
        // Open time is later today
        periodNextOpen = new Date(date);
        const [hours, minutes] = period.open
          .split(":")
          .map((s) => parseInt(s.trim(), 10));
        const periodStr = period.open.includes("PM")
          ? "PM"
          : period.open.includes("AM")
          ? "AM"
          : "";
        let h = hours;
        if (periodStr === "PM" && h !== 12) h += 12;
        if (periodStr === "AM" && h === 12) h = 0;
        periodNextOpen.setHours(h, minutes || 0, 0, 0);
    } else {
        // Open time is tomorrow (or later today if this period already passed)
        periodNextOpen = new Date(date);
        // If close time is next day and we're past it, next open is tomorrow
        if (closeMinutes < openMinutes && currentMinutes >= closeMinutes) {
          periodNextOpen.setDate(periodNextOpen.getDate() + 1);
        } else if (currentMinutes >= closeMinutes) {
          periodNextOpen.setDate(periodNextOpen.getDate() + 1);
        }
        const [hours, minutes] = period.open
          .split(":")
          .map((s) => parseInt(s.trim(), 10));
        const periodStr = period.open.includes("PM")
          ? "PM"
          : period.open.includes("AM")
          ? "AM"
          : "";
        let h = hours;
        if (periodStr === "PM" && h !== 12) h += 12;
        if (periodStr === "AM" && h === 12) h = 0;
        periodNextOpen.setHours(h, minutes || 0, 0, 0);
      }

      if (!nextOpenTime || periodNextOpen.getTime() < nextOpenTime.getTime()) {
        nextOpenTime = periodNextOpen;
        nextOpenTimeString = period.open;
      }
    }

    if (isOpen) {
      return {
        isOpen: true,
        isOff: false,
        currentDayHours: dayHours,
      };
    }

    // Calculate time until next open
    if (!nextOpenTime) {
      // Should not happen, but fallback
      return {
        isOpen: false,
        isOff: false,
        currentDayHours: dayHours,
        message: "We're currently closed.",
      };
    }

    const timeUntilOpen = Math.ceil(
      (nextOpenTime.getTime() - date.getTime()) / (1000 * 60)
    );
    const hoursUntilOpen = Math.floor(timeUntilOpen / 60);
    const minutesUntilOpen = timeUntilOpen % 60;

    let message = `We're currently closed. `;
    if (hoursUntilOpen > 0) {
      message += `We'll be open in ${hoursUntilOpen} hour${hoursUntilOpen > 1 ? "s" : ""}`;
      if (minutesUntilOpen > 0) {
        message += ` and ${minutesUntilOpen} minute${minutesUntilOpen > 1 ? "s" : ""}`;
      }
    } else {
      message += `We'll be open in ${minutesUntilOpen} minute${minutesUntilOpen > 1 ? "s" : ""}`;
    }
    message += `. Your order will be served as soon as we open at ${nextOpenTimeString}.`;

    return {
      isOpen: false,
      isOff: false,
      nextOpenTime,
      currentDayHours: dayHours,
      message,
      hoursUntilOpen,
      minutesUntilOpen,
      nextOpenTimeString: nextOpenTimeString,
    };
  } catch (error) {
    // If parsing fails, assume open
    console.error("Error parsing serving hours:", error);
    return {
      isOpen: true,
      isOff: false,
      currentDayHours: dayHours,
    };
  }
}

/**
 * Get serving hours for a specific day
 */
export function getDayServingHours(
  hours: DeliveryHours,
  dayIndex: number
): DayHours {
  const dayName = getDayName(dayIndex);
  return hours[dayName];
}

/**
 * Format serving hours for display
 */
export function formatServingHours(dayHours: DayHours): string {
  if (dayHours.isOff) {
    return "Closed";
  }
  
  // Use periods if available
  if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
    return dayHours.periods
      .map((p) => `${p.open} - ${p.close}`)
      .join(", ");
  }
  
  // Fallback to single open/close
  if (!dayHours.open || !dayHours.close) {
    return "24/7";
  }
  return `${dayHours.open} - ${dayHours.close}`;
}

