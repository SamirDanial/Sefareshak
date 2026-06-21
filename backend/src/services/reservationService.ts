import DatabaseSingleton from "../config/database";
import { Prisma, ReservationStatus, ReservationType, TableStatus, PaymentStatus, PaymentProvider, PaymentState } from "@prisma/client";
import WebSocketService from "../services/websocketService";
import BusinessDayService from "./businessDayService";
import PayPalRefundService from "./paypalRefundService";
import { getMealBasePrice } from "../utils/mealPriceHelper";
import { getAddonBasePrice } from "../utils/addonPriceHelper";
import FiskalyService from "./fiskalyService";
import { getFiskalyConfigSnapshot, shouldFiscalize } from "../utils/fiscalization";

export class ReservationService {
  private static instance: ReservationService;
  private db: DatabaseSingleton;

  private constructor() {
    this.db = DatabaseSingleton.getInstance();
  }

  public static getInstance(): ReservationService {
    if (!ReservationService.instance) {
      ReservationService.instance = new ReservationService();
    }
    return ReservationService.instance;
  }

  /**
   * Generate unique reservation number
   */
  private generateReservationNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, "0");
    return `RES-${year}-${random}`;
  }

  /**
   * Helper function to add history entry to reservation order
   */
  /**
   * Add a history entry to a reservation order
   * This method is public so it can be called from controllers
   */
  public async addHistoryEntry(
    reservationOrderId: string,
    entry: {
      type: string; // e.g., "ORDER_CREATED", "ITEM_ADDED", "ITEM_REMOVED", "REFUND", "CANCELLED", "PAYMENT_UPDATED", "STATUS_CHANGED"
      action: string; // Human-readable action description
      userId?: string;
      details?: any; // Additional details about the event
    }
  ): Promise<void> {
    try {
      const reservationOrder = await this.db.getPrisma().reservationOrder.findUnique({
        where: { id: reservationOrderId },
        select: { history: true },
      });

      const existingHistory = (reservationOrder?.history as any[]) || [];
      const newEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      };

      const updatedHistory = [...existingHistory, newEntry];

      await this.db.getPrisma().reservationOrder.update({
        where: { id: reservationOrderId },
        data: {
          history: updatedHistory,
        },
      });
    } catch (error) {
      console.error(`[ReservationService] Error adding history entry:`, error);
      // Don't throw - history is non-critical
    }
  }

  /**
   * Get operating hours for a specific day
   */
  public getOperatingHoursForDay(
    settings: any,
    dayOfWeek: number
  ): { open: string | null; close: string | null } {
    const dayMap: { [key: number]: { open: string; close: string } } = {
      0: { open: "sundayOpen", close: "sundayClose" },
      1: { open: "mondayOpen", close: "mondayClose" },
      2: { open: "tuesdayOpen", close: "tuesdayClose" },
      3: { open: "wednesdayOpen", close: "wednesdayClose" },
      4: { open: "thursdayOpen", close: "thursdayClose" },
      5: { open: "fridayOpen", close: "fridayClose" },
      6: { open: "saturdayOpen", close: "saturdayClose" },
    };

    const dayFields = dayMap[dayOfWeek];
    if (!dayFields) {
      return { open: null, close: null };
    }

    const openTime = settings[dayFields.open];
    const closeTime = settings[dayFields.close];
    
    // Check if times are actually set (not null, undefined, or empty string)
    const hasOpenTime = openTime != null && openTime !== "" && String(openTime).trim() !== "";
    const hasCloseTime = closeTime != null && closeTime !== "" && String(closeTime).trim() !== "";

    // Normalize time formats
    const normalized = {
      open: hasOpenTime ? this.normalizeTime(openTime) : null,
      close: hasCloseTime ? this.normalizeTime(closeTime) : null,
    };
    

    return normalized;
  }

  /**
   * Get day name for logging
   */
  private getDayName(dayOfWeek: number): string {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[dayOfWeek] || "Unknown";
  }

  /**
   * Format minutes since midnight to HH:mm string
   */
  private formatTimeFromMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }

  /**
   * Normalize time string to HH:mm format (24-hour)
   * Handles formats like "11:00 AM", "11:00", "23:00"
   */
  private normalizeTime(time: string): string {
    if (!time) return "";
    
    // Remove spaces and convert to uppercase
    const cleaned = time.trim().toUpperCase();
    
    // Check if it's already in 24-hour format (HH:mm)
    if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
      const [hours, minutes] = cleaned.split(":").map(Number);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      }
    }
    
    // Try to parse AM/PM format (e.g., "11:00 AM", "3:00 PM")
    const amPmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (amPmMatch) {
      let hours = parseInt(amPmMatch[1]);
      const minutes = parseInt(amPmMatch[2]);
      const period = amPmMatch[3];
      
      if (period === "PM" && hours !== 12) {
        hours += 12;
      } else if (period === "AM" && hours === 12) {
        hours = 0;
      }
      
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
    
    // Return as-is if we can't parse it
    console.warn(`[ReservationService] Could not normalize time format: ${time}`);
    return cleaned;
  }

  /**
   * Parse time string (HH:mm) to minutes since midnight
   */
  public timeToMinutes(time: string): number {
    const normalized = this.normalizeTime(time);
    const [hours, minutes] = normalized.split(":").map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Parse timezone offset string (e.g., "+05:00" or "-05:00") to minutes
   */
  private parseTimezoneOffset(offset: string): number {
    const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = parseInt(match[2]);
      const minutes = parseInt(match[3]);
      return sign * (hours * 60 + minutes);
    }
    // If it's just a number, treat it as hours
    const num = parseInt(offset);
    return isNaN(num) ? 0 : num * 60;
  }

  private getRestaurantTimezoneOffsetMinutes(): number {
    const raw = process.env.RESTAURANT_TIMEZONE_OFFSET;
    if (!raw) return 5 * 60;
    return this.parseTimezoneOffset(raw);
  }

  /**
   * Check if a date/time is within operating hours
   * Note: dateTime should be in UTC, we convert it to restaurant local time for comparison
   */
  private isWithinOperatingHours(
    dateTime: Date,
    settings: any
  ): boolean {
    const offsetMinutes = this.getRestaurantTimezoneOffsetMinutes();

    // dateTime is UTC; shift the timestamp to get restaurant-local wall clock time,
    // then use UTC getters to read those local components.
    const localDate = new Date(dateTime.getTime() + offsetMinutes * 60_000);
    const dayOfWeek = localDate.getUTCDay();
    const hours = this.getOperatingHoursForDay(settings, dayOfWeek);

    if (!hours.open || !hours.close) {
      return false; // Restaurant closed on this day
    }

    // Compare restaurant local time with operating hours
    const reservationTime = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const openTime = this.timeToMinutes(hours.open);
    const closeTime = this.timeToMinutes(hours.close);

    return reservationTime >= openTime && reservationTime <= closeTime;
  }

  /**
   * Generate available time slots for a given date
   */
  public async getAvailableTimeSlots(
    date: Date,
    numberOfGuests: number,
    branchId?: string
  ): Promise<string[]> {
    const settings = await this.getSettings(branchId);
    if (!settings || !settings.isEnabled) {
      return [];
    }

    // Normalize date to start of day in local timezone
    const reservationDateOnly = new Date(date);
    reservationDateOnly.setHours(0, 0, 0, 0);
    
    // Check maximum advance booking days
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor(
      (reservationDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff < 0) {
      return []; // Past date
    }

    if (daysDiff > settings.maxAdvanceBookingDays) {
      return []; // Too far in advance
    }

    if (daysDiff === 0 && !settings.allowSameDayBooking) {
      return []; // Same day booking not allowed
    }

    // Check excluded dates first
    const dateStr = reservationDateOnly.toISOString().split("T")[0];
    if (settings.excludedDates) {
      let excludedDates: any = settings.excludedDates;
      
      // Parse if it's a string (JSON)
      if (typeof excludedDates === 'string') {
        try {
          excludedDates = JSON.parse(excludedDates);
        } catch (e) {
          console.error("[ReservationService] Error parsing excludedDates:", e);
          excludedDates = null;
        }
      }
      
      if (excludedDates) {
        // Check single excluded dates
        if (excludedDates.singleDates && Array.isArray(excludedDates.singleDates)) {
          if (excludedDates.singleDates.includes(dateStr)) {
            return []; // Date is excluded
          }
        }
        
        // Check date ranges
        if (excludedDates.dateRanges && Array.isArray(excludedDates.dateRanges)) {
          for (const range of excludedDates.dateRanges) {
            if (range.start && range.end) {
              const startDate = new Date(range.start + 'T00:00:00');
              startDate.setHours(0, 0, 0, 0);
              const endDate = new Date(range.end + 'T00:00:00');
              endDate.setHours(23, 59, 59, 999);
              
              if (reservationDateOnly >= startDate && reservationDateOnly <= endDate) {
                return []; // Date is in excluded range
              }
            }
          }
        }
      }
    }
    
    // Also check legacy blockedDates for backward compatibility
    if (settings.blockedDates?.includes(dateStr)) {
      return []; // Date is blocked
    }

    // Get operating hours for the day
    const dayOfWeek = date.getDay();
    const hours = this.getOperatingHoursForDay(settings, dayOfWeek);


    if (!hours.open || !hours.close || hours.open === "" || hours.close === "") {
      return []; // Restaurant closed or hours not configured
    }

      // Generate time slots
      const slots: string[] = [];
      const interval = settings.timeSlotInterval || 30;
      const openMinutes = this.timeToMinutes(hours.open);
      const closeMinutes = this.timeToMinutes(hours.close);
      
      // Get restaurant timezone offset (default to UTC+5 for Pakistan, can be configured via env)
      // Format: "+05:00" or "-05:00" or number of hours offset (e.g., 5 for UTC+5)
      const restaurantTimezoneOffsetHours = process.env.RESTAURANT_TIMEZONE_OFFSET 
        ? (process.env.RESTAURANT_TIMEZONE_OFFSET.includes(':'))
          ? this.parseTimezoneOffset(process.env.RESTAURANT_TIMEZONE_OFFSET) / 60
          : parseInt(process.env.RESTAURANT_TIMEZONE_OFFSET)
        : 5; // Default: UTC+5 (Pakistan)
      
      const restaurantTimezoneOffsetMinutes = restaurantTimezoneOffsetHours * 60;
      
      // Get current UTC time
      const nowUTC = new Date();
      const utcTimestamp = nowUTC.getTime();
      
      // Get current time in restaurant local timezone (as timestamp)
      const currentRestaurantLocalTimestamp = utcTimestamp + (restaurantTimezoneOffsetMinutes * 60 * 1000);
      const currentRestaurantLocalTime = new Date(currentRestaurantLocalTimestamp);
      
      // Calculate restaurant local time components manually from UTC to avoid timezone issues
      // Get UTC components first
      const utcYear = nowUTC.getUTCFullYear();
      const utcMonth = nowUTC.getUTCMonth();
      const utcDay = nowUTC.getUTCDate();
      const utcHour = nowUTC.getUTCHours();
      const utcMinute = nowUTC.getUTCMinutes();
      const utcSecond = nowUTC.getUTCSeconds();
      
      // Add timezone offset to get restaurant local time
      let restaurantHour = utcHour + restaurantTimezoneOffsetHours;
      let restaurantDay = utcDay;
      let restaurantMonth = utcMonth;
      let restaurantYear = utcYear;
      
      // Handle day rollover
      if (restaurantHour >= 24) {
        restaurantHour -= 24;
        restaurantDay++;
        const daysInMonth = new Date(Date.UTC(restaurantYear, restaurantMonth + 1, 0)).getUTCDate();
        if (restaurantDay > daysInMonth) {
          restaurantDay = 1;
          restaurantMonth++;
          if (restaurantMonth > 11) {
            restaurantMonth = 0;
            restaurantYear++;
          }
        }
      } else if (restaurantHour < 0) {
        restaurantHour += 24;
        restaurantDay--;
        if (restaurantDay < 1) {
          restaurantMonth--;
          if (restaurantMonth < 0) {
            restaurantMonth = 11;
            restaurantYear--;
          }
          restaurantDay = new Date(Date.UTC(restaurantYear, restaurantMonth + 1, 0)).getUTCDate();
        }
      }
      
      // Get the selected date components
      const selectedYear = date.getFullYear();
      const selectedMonth = date.getMonth();
      const selectedDay = date.getDate();
      
      // Check if selected date is today in restaurant timezone
      const isToday = restaurantYear === selectedYear &&
                     restaurantMonth === selectedMonth &&
                     restaurantDay === selectedDay;
      
      let minAdvanceHours = settings.minAdvanceBookingHours || 0;
      const currentRestaurantTimeMinutes = restaurantHour * 60 + utcMinute;
      
      // For same-day bookings, if the minimum advance would make it impossible to book,
      // use a more lenient minimum (1 hour or 0 if same-day booking is allowed)
      if (isToday && settings.allowSameDayBooking) {
        const latestPossibleSlot = closeMinutes;
        const earliestPossibleSlotWithAdvance = currentRestaurantTimeMinutes + (minAdvanceHours * 60);
        
        // If the minimum advance requirement would make it impossible to book today,
        // reduce it to allow same-day bookings
        if (earliestPossibleSlotWithAdvance > latestPossibleSlot) {
          // Use 1 hour minimum for same-day, or 0 if that still doesn't work
          const oneHourAdvance = currentRestaurantTimeMinutes + 60;
          if (oneHourAdvance <= latestPossibleSlot) {
            minAdvanceHours = 1;
          } else {
            minAdvanceHours = 0;
          }
        }
      }

      let slotsGenerated = 0;
      let slotsFiltered = 0;

      for (
        let minutes = openMinutes;
        minutes <= closeMinutes;
        minutes += interval
      ) {
        slotsGenerated++;
        const slotHour = Math.floor(minutes / 60);
        const slotMinute = minutes % 60;

        // For same-day bookings ONLY, check if slot is in the past or too soon
        // For future dates, ALL slots within operating hours should be available
        if (isToday) {
          // Filter out slots that are in the past
          if (minutes <= currentRestaurantTimeMinutes) {
            slotsFiltered++;
            const slotTimeStr = this.formatTimeFromMinutes(minutes);
            continue;
          }

          // Check minimum advance booking hours for same day only
          const minutesUntilSlot = minutes - currentRestaurantTimeMinutes;
          const hoursUntilSlot = minutesUntilSlot / 60;
          if (hoursUntilSlot < minAdvanceHours) {
            slotsFiltered++;
            continue;
          }
        }
        // For future dates (not today), skip all time-based filtering and include all slots
        
        // Create UTC date for the slot time
        // Slot time is in restaurant local time, so we need to subtract the offset to get UTC
        // Calculate UTC time by subtracting the timezone offset
        const slotMinutesTotal = minutes; // Total minutes since midnight in restaurant local time
        const utcMinutesTotal = slotMinutesTotal - restaurantTimezoneOffsetMinutes; // Convert to UTC minutes
        
        // Handle negative minutes (day rollover)
        let adjustedUtcMinutes = utcMinutesTotal;
        let utcDay = selectedDay;
        let utcMonth = selectedMonth;
        let utcYear = selectedYear;
        
        if (adjustedUtcMinutes < 0) {
          adjustedUtcMinutes += 24 * 60; // Add a day's worth of minutes
          utcDay--;
          if (utcDay < 1) {
            utcMonth--;
            if (utcMonth < 0) {
              utcMonth = 11;
              utcYear--;
            }
            utcDay = new Date(utcYear, utcMonth + 1, 0).getDate();
          }
        } else if (adjustedUtcMinutes >= 24 * 60) {
          adjustedUtcMinutes -= 24 * 60; // Subtract a day's worth of minutes
          utcDay++;
          const daysInMonth = new Date(utcYear, utcMonth + 1, 0).getDate();
          if (utcDay > daysInMonth) {
            utcDay = 1;
            utcMonth++;
            if (utcMonth > 11) {
              utcMonth = 0;
              utcYear++;
            }
          }
        }
        
        const slotUtcHour = Math.floor(adjustedUtcMinutes / 60);
        const slotUtcMinute = adjustedUtcMinutes % 60;
        
        // Create UTC date representing the slot time
        const slotDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, slotUtcHour, slotUtcMinute, 0, 0));

      // Check availability for this time slot
      const isAvailable = await this.isTimeSlotAvailable(
        slotDate,
        numberOfGuests,
        settings
      );

      if (isAvailable) {
        const timeStr = this.formatTimeFromMinutes(minutes);
        slots.push(timeStr);
      } else {
        slotsFiltered++;
      }
    }
    return slots;
  }

  /**
   * Check if a time slot is available
   */
  private async isTimeSlotAvailable(
    dateTime: Date,
    numberOfGuests: number,
    settings: any
  ): Promise<boolean> {
    // Check if within operating hours
    if (!this.isWithinOperatingHours(dateTime, settings)) {
      return false;
    }

    // Check blocked dates
    const dateStr = dateTime.toISOString().split("T")[0];
    if (settings.blockedDates?.includes(dateStr)) {
      return false;
    }

    // For Simple tier: Check total guests at this time
    if (settings.tier === "SIMPLE") {
      const startTime = new Date(dateTime);
      const endTime = new Date(dateTime);
      endTime.setMinutes(endTime.getMinutes() + 120); // Default 2 hour duration

      const existingReservations = await this.db.getPrisma().reservation.count({
        where: {
          status: {
            in: ["PENDING", "CONFIRMED", "SEATED"],
          },
          reservationDate: {
            gte: startTime,
            lt: endTime,
          },
        },
      });

      // Simple capacity check: if maxCapacityPerTimeSlot is set, use it
      // Otherwise, allow unlimited (restaurant manages manually)
      if (settings.maxCapacityPerTimeSlot) {
        const totalGuests = await this.getTotalGuestsAtTime(dateTime);
        return totalGuests + numberOfGuests <= settings.maxCapacityPerTimeSlot;
      }

      return true; // No capacity limit
    }

    // For Medium tier: Check table availability
    if (settings.tier === "MEDIUM") {
      const availableTables = await this.db.getPrisma().table.findMany({
        where: {
          isActive: true,
          status: {
            in: ["AVAILABLE", "RESERVED"], // Can reassign if needed
          },
          capacity: {
            gte: numberOfGuests,
          },
        },
      });

      if (availableTables.length === 0) {
        return false;
      }

      // Check if tables are actually free at this time
      const startTime = new Date(dateTime);
      const endTime = new Date(dateTime);
      endTime.setMinutes(endTime.getMinutes() + 120);

      const reservedTables = await this.db.getPrisma().reservation.findMany({
        where: {
          status: {
            in: ["PENDING", "CONFIRMED", "SEATED"],
          },
          reservationDate: {
            gte: startTime,
            lt: endTime,
          },
          tableId: {
            not: null,
          },
        },
        select: {
          tableId: true,
        },
      });

      const reservedTableIds = new Set(
        reservedTables.map((r) => r.tableId).filter(Boolean)
      );
      const freeTables = availableTables.filter(
        (t) => !reservedTableIds.has(t.id)
      );

      return freeTables.length > 0;
    }

    return true;
  }

  /**
   * Get total guests at a specific time
   */
  private async getTotalGuestsAtTime(dateTime: Date): Promise<number> {
    const startTime = new Date(dateTime);
    const endTime = new Date(dateTime);
    endTime.setMinutes(endTime.getMinutes() + 120);

    const reservations = await this.db.getPrisma().reservation.findMany({
      where: {
        status: {
          in: ["PENDING", "CONFIRMED", "SEATED"],
        },
        reservationDate: {
          gte: startTime,
          lt: endTime,
        },
      },
      select: {
        numberOfGuests: true,
      },
    });

    return reservations.reduce((sum, r) => sum + r.numberOfGuests, 0);
  }

  /**
   * Get reservation settings
   */
  /**
   * Get reservation settings, optionally merged with branch-specific settings
   * @param branchId Optional branch ID to get branch-specific settings
   * @param organizationId Optional organization ID to scope settings (used for SUPER_ADMIN)
   * @returns Merged settings (branch settings override global settings)
   */
  public async getSettings(branchId?: string, organizationId?: string): Promise<any> {
    // Global settings are the ReservationSettings row with no organization assigned.
    let globalSettings: any = await this.db
      .getPrisma()
      .reservationSettings.findFirst({ where: { organizationId: null } } as any);

    // Create default settings if none exist
    if (!globalSettings) {
      globalSettings = await (this.db.getPrisma() as any).reservationSettings.create({
        data: {
          organizationId: null,
          tier: "SIMPLE", // Ensure default tier is set
        },
      });
    }

    // At this point globalSettings must exist
    const global = globalSettings as any;

    // Ensure tier is always set to SIMPLE if null/undefined
    if (!global.tier) {
      global.tier = "SIMPLE";
    }

    // If no branchId provided, return org settings (if org selected) or global settings
    if (!branchId) {
      let base = global;

      if (organizationId) {
        let orgSettings: any = await (this.db.getPrisma() as any).reservationSettings.findUnique({
          where: { organizationId },
        });

        if (!orgSettings) {
          // Each organization is independent: do NOT clone/copy values from global settings.
          // Create a fresh row using Prisma defaults and explicitly set the minimal default tier.
          orgSettings = await (this.db.getPrisma() as any).reservationSettings.create({
            data: {
              organizationId,
              tier: "SIMPLE",
            },
          });
        }

        if (!orgSettings.tier) {
          orgSettings.tier = "SIMPLE";
        }

        base = { ...global, ...orgSettings };
      }

      // Don't default allowedPaymentMethods - use actual database value (even if empty array)
      // Only default depositPercentage if completely missing
      if (base.depositPercentage === null || base.depositPercentage === undefined) {
        (base as any).depositPercentage = 100;
      }

      return base;
    }

    // Get branch settings (only if branch is active)
    const branch = await this.db.getPrisma().branch.findUnique({
      where: { id: branchId },
      select: {
        isActive: true,
        organizationId: true,
        organization: {
          select: {
            isActive: true,
            freeVersion: true,
            reservationsAllowed: true,
          },
        } as any,
        reservationIsEnabled: true,
        reservationTier: true,
        reservationMondayOpen: true,
        reservationMondayClose: true,
        reservationTuesdayOpen: true,
        reservationTuesdayClose: true,
        reservationWednesdayOpen: true,
        reservationWednesdayClose: true,
        reservationThursdayOpen: true,
        reservationThursdayClose: true,
        reservationFridayOpen: true,
        reservationFridayClose: true,
        reservationSaturdayOpen: true,
        reservationSaturdayClose: true,
        reservationSundayOpen: true,
        reservationSundayClose: true,
        reservationTimeSlotInterval: true,
        reservationMaxGuestsPerReservation: true,
        reservationMinAdvanceBookingHours: true,
        reservationMaxAdvanceBookingDays: true,
        reservationAllowSameDayBooking: true,
        reservationAllowCancellation: true,
        reservationModificationWindowHours: true,
        reservationEnablePreOrder: true,
        reservationPreOrderMinAmount: true,
        reservationFullRefundHoursBefore: true,
        reservationPartialRefundHoursBefore: true,
        reservationNoRefundHoursBefore: true,
        reservationMaxCapacityPerTimeSlot: true,
        reservationBufferTimeMinutes: true,
        reservationExcludedDates: true,
        reservationDepositPercentage: true,
        reservationAllowedPaymentMethods: true,
      },
    });

    // If branch not found or inactive, return global settings (inactive branches should not be accessible)
    if (!branch || !branch.isActive) {
      return global;
    }

    const orgIsActive = (branch as any)?.organization?.isActive;
    const orgFreeVersion = (branch as any)?.organization?.freeVersion;
    const orgReservationsAllowed = (branch as any)?.organization?.reservationsAllowed;
    const orgReservationsEntitled =
      orgIsActive === false || orgFreeVersion === true || orgReservationsAllowed === false ? false : true;

    // Organization settings row (optional): overrides global settings.
    // If branch is assigned to an organization, ensure an org row exists.
    let orgSettings: any = null;
    if (branch.organizationId) {
      orgSettings = await (this.db.getPrisma() as any).reservationSettings.findUnique({
        where: { organizationId: branch.organizationId },
      });
      if (!orgSettings) {
        // Each organization is independent: do NOT clone/copy values from global settings.
        // Create a fresh row using Prisma defaults and explicitly set the minimal default tier.
        orgSettings = await (this.db.getPrisma() as any).reservationSettings.create({
          data: {
            organizationId: branch.organizationId,
            tier: "SIMPLE",
          },
        });
      }
      if (!orgSettings.tier) {
        orgSettings.tier = "SIMPLE";
      }
    }

    const baseSettings = orgSettings ? { ...global, ...orgSettings } : global;

    // Merge branch settings with global settings (branch settings take precedence)
    const mergedSettings = {
      ...baseSettings,
      // Override with branch settings if they exist (not null/undefined)
      isEnabled: branch.reservationIsEnabled !== null && branch.reservationIsEnabled !== undefined
        ? branch.reservationIsEnabled
        : baseSettings.isEnabled,
      tier: branch.reservationTier !== null && branch.reservationTier !== undefined
        ? branch.reservationTier
        : baseSettings.tier,
    };

    // Only override isEnabled based on org entitlement if branch hasn't explicitly set it
    if (!orgReservationsEntitled && (branch.reservationIsEnabled === null || branch.reservationIsEnabled === undefined)) {
      (mergedSettings as any).isEnabled = false;
    }

    // Fallback defaults - only for depositPercentage if completely missing
    // Don't default allowedPaymentMethods - use actual database value (even if empty array)
    if (
      mergedSettings.depositPercentage === null ||
      mergedSettings.depositPercentage === undefined
    ) {
      (mergedSettings as any).depositPercentage = 100;
    }

    return mergedSettings;
  }

  /**
   * Update reservation settings
   */
  public async updateSettings(data: any, organizationId?: string): Promise<any> {
    const where: any = organizationId ? { organizationId } : { organizationId: null };
    let settings = await (this.db.getPrisma() as any).reservationSettings.findFirst({ where });

    // Ensure tier is always set to SIMPLE if not provided or invalid
    const tierValue = data.tier && (data.tier === "SIMPLE" || data.tier === "MEDIUM" || data.tier === "COMPLEX")
      ? data.tier
      : "SIMPLE";

    // Prepare update data - exclude fields that shouldn't be updated directly
    const { id, createdAt, updatedAt, excludedDates, ...updateData } = data;
    
    // Build the update payload
    const updatePayload: any = {
      ...updateData,
      tier: tierValue,
    };
    
    // Explicitly handle day fields - convert undefined to null so Prisma will update them
    const dayFields = [
      'mondayOpen', 'mondayClose',
      'tuesdayOpen', 'tuesdayClose',
      'wednesdayOpen', 'wednesdayClose',
      'thursdayOpen', 'thursdayClose',
      'fridayOpen', 'fridayClose',
      'saturdayOpen', 'saturdayClose',
      'sundayOpen', 'sundayClose',
    ];
    
    dayFields.forEach((field) => {
      if (field in data) {
        // If the field is explicitly provided (even if undefined), set it to null
        updatePayload[field] = data[field] === undefined || data[field] === null || data[field] === '' 
          ? null 
          : data[field];
      }
    });
    
    // Only include excludedDates if it exists
    // Clean excludedDates - ensure it's properly formatted JSON and remove any Date objects
    if (excludedDates !== undefined && excludedDates !== null) {
      const cleanedExcludedDates: any = {
        singleDates: Array.isArray(excludedDates.singleDates) 
          ? excludedDates.singleDates.filter((d: any) => typeof d === 'string')
          : [],
        dateRanges: Array.isArray(excludedDates.dateRanges)
          ? excludedDates.dateRanges
              .filter((range: any) => range && range.start && range.end)
              .map((range: any) => ({
                start: typeof range.start === 'string' ? range.start : String(range.start),
                end: typeof range.end === 'string' ? range.end : String(range.end),
              }))
          : [],
      };
      updatePayload.excludedDates = cleanedExcludedDates;
    }

    // Handle depositPercentage - convert to Decimal if provided
    if (data.depositPercentage !== undefined) {
      if (data.depositPercentage === null || data.depositPercentage === '') {
        updatePayload.depositPercentage = null;
      } else {
        const depositValue = typeof data.depositPercentage === 'number' 
          ? data.depositPercentage 
          : parseFloat(String(data.depositPercentage));
        if (!isNaN(depositValue)) {
          // Clamp between 0 and 100
          const clampedDeposit = Math.max(0, Math.min(100, depositValue));
          updatePayload.depositPercentage = new Prisma.Decimal(clampedDeposit);
        }
      }
    }

    // Handle allowedPaymentMethods - ensure it's an array of valid enum values
    if (data.allowedPaymentMethods !== undefined) {
      if (Array.isArray(data.allowedPaymentMethods)) {
        // Filter to only valid enum values
        const validMethods = ['ONLINE_CARD', 'PAYPAL', 'NONE'];
        updatePayload.allowedPaymentMethods = data.allowedPaymentMethods.filter((method: string) => 
          validMethods.includes(method)
        );
      } else {
        // If not an array, set to empty array or default
        updatePayload.allowedPaymentMethods = [];
      }
    }
    
    if (!settings) {
      settings = await (this.db.getPrisma() as any).reservationSettings.create({
        data: {
          ...updatePayload,
          organizationId: organizationId ?? null,
        },
      });
    } else {
      try {
        settings = await this.db.getPrisma().reservationSettings.update({
          where: { id: settings.id },
          data: updatePayload,
        });
      } catch (error: any) {
        console.error('[ReservationService] Error updating reservation settings:', error);
        // If excludedDates field doesn't exist in database yet, try without it
        if (error.message && error.message.includes('excludedDates')) {
          console.warn('[ReservationService] excludedDates field not found in database, updating without it');
          const { excludedDates: _, ...payloadWithoutExcluded } = updatePayload;
          settings = await this.db.getPrisma().reservationSettings.update({
            where: { id: settings.id },
            data: payloadWithoutExcluded,
          });
        } else if (error.message && (error.message.includes('depositPercentage') || error.message.includes('allowedPaymentMethods'))) {
          console.error('[ReservationService] Database columns for depositPercentage or allowedPaymentMethods may not exist. Please run migration.');
          throw new Error('Database migration required: depositPercentage and allowedPaymentMethods columns missing from reservation_settings table');
        } else {
          throw error;
        }
      }
    }

    return settings;
  }

  /**
   * Check availability for a specific date/time
   * @param date Reservation date
   * @param time Reservation time
   * @param numberOfGuests Number of guests
   * @param branchId Optional branch ID to use branch-specific settings
   */
  public async checkAvailability(
    date: Date,
    time: string,
    numberOfGuests: number,
    branchId?: string
  ): Promise<{ available: boolean; reason?: string }> {
    const settings = await this.getSettings(branchId);

    if (!settings || !settings.isEnabled) {
      return { available: false, reason: "Reservations are disabled" };
    }

    // Parse requested reservation date+time.
    // `time` is the restaurant-local wall clock time; build a UTC Date from it using the restaurant offset.
    const [hours, minutes] = time.split(":").map(Number);
    const offsetMinutes = this.getRestaurantTimezoneOffsetMinutes();
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const utcMs = Date.UTC(year, month, day, hours, minutes, 0, 0) - offsetMinutes * 60_000;
    const dateTime = new Date(utcMs);

    // Check if within booking window
    const checkTime = new Date();
    const hoursUntilReservation = (dateTime.getTime() - checkTime.getTime()) / (1000 * 60 * 60);

    if (hoursUntilReservation < 0) {
      return { available: false, reason: "Cannot book in the past" };
    }

    // Check minimum advance booking hours
    if (hoursUntilReservation < settings.minAdvanceBookingHours) {
      return {
        available: false,
        reason: `Must book at least ${settings.minAdvanceBookingHours} hour(s) in advance`,
      };
    }

    // Check maximum advance booking days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reservationDateOnly = new Date(dateTime);
    reservationDateOnly.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor(
      (reservationDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff > settings.maxAdvanceBookingDays) {
      return {
        available: false,
        reason: `Cannot book more than ${settings.maxAdvanceBookingDays} days in advance`,
      };
    }

    if (daysDiff === 0 && !settings.allowSameDayBooking) {
      return { available: false, reason: "Same-day booking not allowed" };
    }

    // Check operating hours
    if (!this.isWithinOperatingHours(dateTime, settings)) {
      return { available: false, reason: "Outside operating hours" };
    }

    // Check blocked dates (legacy)
    const dateStr = dateTime.toISOString().split("T")[0];
    if (settings.blockedDates?.includes(dateStr)) {
      return { available: false, reason: "Date is blocked" };
    }

    // Check excluded dates (new system - supports single dates and date ranges)
    if (settings.excludedDates) {
      let excludedDates: any = settings.excludedDates;
      
      // Parse if it's a string (JSON)
      if (typeof excludedDates === 'string') {
        try {
          excludedDates = JSON.parse(excludedDates);
        } catch (e) {
          console.error("[ReservationService] Error parsing excludedDates:", e);
          excludedDates = null;
        }
      }
      
      if (excludedDates) {
        // Check single excluded dates
        if (excludedDates.singleDates && Array.isArray(excludedDates.singleDates)) {
          if (excludedDates.singleDates.includes(dateStr)) {
            return { available: false, reason: "This date is excluded from reservations" };
          }
        }
        
        // Check date ranges
        if (excludedDates.dateRanges && Array.isArray(excludedDates.dateRanges)) {
          const reservationDate = new Date(dateStr + 'T00:00:00');
          reservationDate.setHours(0, 0, 0, 0);
          
          for (const range of excludedDates.dateRanges) {
            if (range.start && range.end) {
              const startDate = new Date(range.start + 'T00:00:00');
              startDate.setHours(0, 0, 0, 0);
              const endDate = new Date(range.end + 'T00:00:00');
              endDate.setHours(23, 59, 59, 999);
              
              if (reservationDate >= startDate && reservationDate <= endDate) {
                return { available: false, reason: "This date falls within an excluded date range" };
              }
            }
          }
        }
      }
    }

    // Check time slot availability
    const isAvailable = await this.isTimeSlotAvailable(
      dateTime,
      numberOfGuests,
      settings
    );

    if (!isAvailable) {
      return {
        available: false,
        reason: "Time slot is fully booked or no tables available",
      };
    }

    return { available: true };
  }

  /**
   * Create a simple reservation
   */
  public async createSimpleReservation(data: {
    userId?: string;
    branchId?: string | null;
    reservationDate: Date;
    numberOfGuests: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    specialRequests?: string;
    preferredZone?: string;
    tableIds?: string[];
    zoneId?: string;
  }): Promise<any> {
    const reservationNumber = this.generateReservationNumber();

    // Get first table's zoneId and tableId if tables are selected
    let zoneId: string | null = data.zoneId || null; // Use provided zoneId first
    let tableId: string | null = null;
    
    if (data.tableIds && data.tableIds.length > 0) {
      const firstTable = await this.db.getPrisma().table.findUnique({
        where: { id: data.tableIds[0] },
        select: { id: true, zoneId: true },
      });
      if (firstTable) {
        tableId = firstTable.id;
        // Use provided zoneId if available, otherwise use table's zoneId
        if (!zoneId) {
          zoneId = firstTable.zoneId || null;
        }
      } else {
        console.warn("[ReservationService] Table not found for ID:", data.tableIds[0]);
      }
    } else {
    }

    const reservationData: Prisma.ReservationUncheckedCreateInput = {
        reservationNumber,
        userId: data.userId,
      branchId: data.branchId || null,
      tableId: tableId || null,
      tableIds: data.tableIds && data.tableIds.length > 0 ? data.tableIds : [],
      zoneId: zoneId || null,
      type: ReservationType.SIMPLE,
      status: ReservationStatus.CONFIRMED,
        confirmedAt: new Date(),
        reservationDate: data.reservationDate,
        numberOfGuests: data.numberOfGuests,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        specialRequests: data.specialRequests,
        preferredZone: data.preferredZone,
        // Many-to-many table assignment
        ...(data.tableIds && data.tableIds.length > 0 ? {
          tables: {
            create: data.tableIds.map(tableId => ({
              tableId,
            })),
          },
        } : {}),
    };

    const reservation = await this.db.getPrisma().reservation.create({
      data: reservationData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        table: {
          include: {
            zoneRelation: true,
          },
        },
        tables: {
          include: {
            table: {
              include: {
                zoneRelation: true,
          },
        },
          },
        },
        zone: true,
      },
    });

    // Set all assigned tables to RESERVED status
    if (data.tableIds && data.tableIds.length > 0) {
      await this.db.getPrisma().table.updateMany({
        where: { id: { in: data.tableIds } },
        data: { status: TableStatus.RESERVED },
      });
    } else if (data.tableIds && data.tableIds.length === 1) {
      // Handle legacy single table
      await this.db.getPrisma().table.update({
        where: { id: data.tableIds[0] },
        data: { status: TableStatus.RESERVED },
      });
    }

    return reservation;
  }

  /**
   * Create a pre-order reservation
   */
  public async createPreOrderReservation(data: {
    userId?: string;
    branchId?: string | null;
    reservationDate: Date;
    numberOfGuests: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    specialRequests?: string;
    preferredZone?: string;
    reservationOrderId: string;
    paymentIntentId?: string | null;
    tableIds?: string[];
    zoneId?: string;
  }): Promise<any> {
    const normalizedPaymentIntentId = (data.paymentIntentId || "").trim();
    const paymentIntentId = normalizedPaymentIntentId.length > 0 ? normalizedPaymentIntentId : null;

    const existingReservation = await this.db.getPrisma().reservation.findFirst({
      where: {
        OR: [
          paymentIntentId ? { paymentIntentId } : undefined,
          data.reservationOrderId
            ? { reservationOrderId: data.reservationOrderId }
            : undefined,
        ].filter(Boolean) as any,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        table: {
          include: {
            zoneRelation: true,
          },
        },
        tables: {
          include: {
            table: {
              include: {
                zoneRelation: true,
              },
            },
          },
        },
        zone: true,
        reservationOrder: {
          include: {
            items: {
              include: {
                meal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (existingReservation) {
      return existingReservation;
    }

    const reservationNumber = this.generateReservationNumber();

    // Get first table's zoneId and tableId if tables are selected
    let zoneId: string | null = data.zoneId || null; // Use provided zoneId first
    let tableId: string | null = null;
    
    if (data.tableIds && data.tableIds.length > 0) {
      const firstTable = await this.db.getPrisma().table.findUnique({
        where: { id: data.tableIds[0] },
        select: { id: true, zoneId: true },
      });
      if (firstTable) {
        tableId = firstTable.id;
        // Use provided zoneId if available, otherwise use table's zoneId
        if (!zoneId) {
          zoneId = firstTable.zoneId || null;
        }
      } else {
        console.warn("[ReservationService] Table not found for ID:", data.tableIds[0]);
      }
    } else {
    }

    let reservation: any;
    try {
      reservation = await this.db.getPrisma().reservation.create({
        data: {
          reservationNumber,
          userId: data.userId,
          branchId: data.branchId || null,
          tableId: tableId || null,
          tableIds: data.tableIds && data.tableIds.length > 0 ? data.tableIds : [],
          zoneId: zoneId || null,
          type: ReservationType.PRE_ORDER,
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
          reservationDate: data.reservationDate,
          numberOfGuests: data.numberOfGuests,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          specialRequests: data.specialRequests,
          preferredZone: data.preferredZone,
          reservationOrderId: data.reservationOrderId,
          paymentIntentId,
          paymentStatus: PaymentStatus.PAID,
          ...(data.tableIds && data.tableIds.length > 0
            ? {
                tables: {
                  create: data.tableIds.map((tableId) => ({
                    tableId,
                  })),
                },
              }
            : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          table: {
            include: {
              zoneRelation: true,
            },
          },
          tables: {
            include: {
              table: {
                include: {
                  zoneRelation: true,
                },
              },
            },
          },
          zone: true,
          reservationOrder: {
            include: {
              items: {
                include: {
                  meal: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } catch (err: any) {
      if (
        err?.code === "P2002" &&
        Array.isArray(err?.meta?.target) &&
        err.meta.target.includes("paymentIntentId")
      ) {
        if (paymentIntentId) {
          const found = await this.db.getPrisma().reservation.findUnique({
            where: { paymentIntentId },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              table: {
                include: {
                  zoneRelation: true,
                },
              },
              tables: {
                include: {
                  table: {
                    include: {
                      zoneRelation: true,
                    },
                  },
                },
              },
              zone: true,
              reservationOrder: {
                include: {
                  items: {
                    include: {
                      meal: {
                        select: {
                          id: true,
                          name: true,
                          image: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (found) {
            return found;
          }
        }
      }
      throw err;
    }

    return reservation;
  }

  /**
   * Get reservations with filters
   */
  public async getReservations(filters: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    date?: Date;
    fromDate?: Date;
    toDate?: Date;
    userId?: string;
    branchId?: string;
    zoneId?: string;
  }): Promise<{ reservations: any[]; total: number; pagination: any }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ReservationWhereInput = {};

    if (filters.status) {
      where.status = filters.status as any;
    }

    if (filters.type) {
      where.type = filters.type as any;
    }

    if (filters.date) {
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);

      where.reservationDate = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (filters.fromDate || filters.toDate) {
      const range: { gte?: Date; lte?: Date } = {};

      if (filters.fromDate) {
        const start = new Date(filters.fromDate);
        start.setHours(0, 0, 0, 0);
        range.gte = start;
      }

      if (filters.toDate) {
        const end = new Date(filters.toDate);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }

      where.reservationDate = range as any;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.zoneId) {
      where.zoneId = filters.zoneId;
    }

    const [reservations, total] = await Promise.all([
      this.db.getPrisma().reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          table: {
            include: {
              zoneRelation: true,
            },
          }, // Legacy single table
          tables: {
            include: {
              table: {
                include: {
                  zoneRelation: true,
            },
          },
            },
          },
          zone: true,
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          reservationOrder: {
            include: {
              items: {
                include: {
                  meal: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                  addons: {
                    include: {
                      addon: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                  optionalIngredients: true,
                },
              },
              payment: true,
            },
          },
          notifications: {
            where: {
              isSeen: false,
            },
            select: {
              id: true,
              isSeen: true,
            },
          },
        },
      }),
      this.db.getPrisma().reservation.count({ where }),
    ]);

    return {
      reservations,
      total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get reservation by ID
   */
  public async getReservationById(id: string): Promise<any> {
    return await this.db.getPrisma().reservation.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        table: {
          include: {
            zoneRelation: true,
          },
        }, // Legacy single table
        tables: {
          include: {
            table: {
              include: {
                zoneRelation: true,
          },
        },
          },
        },
        zone: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
        reservationOrder: {
          include: {
            items: {
              include: {
                meal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
                addons: true,
                optionalIngredients: true,
              },
            },
            payment: true,
          },
        },
        notifications: {
          where: {
            isSeen: false,
          },
          select: {
            id: true,
            isSeen: true,
          },
        },
      },
    });
  }

  /**
   * Update reservation status
   */
  public async updateReservationStatus(
    id: string,
    status: string,
    userId?: string
  ): Promise<any> {
    // First, get the current reservation to check if it has a table assigned
    const currentReservation = await this.db.getPrisma().reservation.findUnique({
      where: { id },
      include: { table: true },
    });

    if (!currentReservation) {
      throw new Error("Reservation not found");
    }

    if (currentReservation.status === "CANCELLED") {
      throw new Error("Cannot update a cancelled reservation");
    }

    const updateData: any = {
      status: status as any,
    };

    if (status === "CONFIRMED") {
      updateData.confirmedAt = new Date();
    } else if (status === "SEATED") {
      updateData.seatedAt = new Date();
      
      // Set all assigned tables to OCCUPIED when guests are seated
      const reservationTables = await this.db.getPrisma().reservationTable.findMany({
        where: { reservationId: id },
        include: { table: true },
      });

      if (reservationTables.length > 0) {
        const tableIds = reservationTables.map((rt) => rt.tableId);
        await this.db.getPrisma().table.updateMany({
          where: { id: { in: tableIds } },
          data: { status: "OCCUPIED" },
        });
      } else if (currentReservation.tableId && currentReservation.table) {
        // Fallback to legacy single table
        await this.db.getPrisma().table.update({
          where: { id: currentReservation.tableId },
          data: { status: "OCCUPIED" },
        });
      }
    } else if (status === "COMPLETED") {
      updateData.completedAt = new Date();
      
      // Get all tables assigned to this reservation (from junction table)
      const reservationTables = await this.db.getPrisma().reservationTable.findMany({
        where: { reservationId: id },
        include: { table: true },
      });

      // Set all assigned tables back to AVAILABLE
      if (reservationTables.length > 0) {
        const tableIds = reservationTables.map((rt) => rt.tableId);
        await this.db.getPrisma().table.updateMany({
          where: { id: { in: tableIds } },
          data: { status: "AVAILABLE" },
        });
      } else if (currentReservation.tableId && currentReservation.table) {
        // Fallback to legacy single table
        await this.db.getPrisma().table.update({
          where: { id: currentReservation.tableId },
          data: { status: "AVAILABLE" },
        });
      }
    } else if (status === "CANCELLED") {
      updateData.cancelledAt = new Date();
      if (userId) {
        updateData.cancelledBy = userId;
      }
      
      // Get all tables assigned to this reservation (from junction table)
      const reservationTables = await this.db.getPrisma().reservationTable.findMany({
        where: { reservationId: id },
        include: { table: true },
      });

      // Set all assigned tables back to AVAILABLE
      if (reservationTables.length > 0) {
        const tableIds = reservationTables.map((rt) => rt.tableId);
        await this.db.getPrisma().table.updateMany({
          where: { id: { in: tableIds } },
          data: { status: "AVAILABLE" },
        });
        // Delete junction table entries to release the association
        await this.db.getPrisma().reservationTable.deleteMany({
          where: { reservationId: id },
        });
      }
      
      // Handle legacy single table
      if (currentReservation.tableId && currentReservation.table) {
        await this.db.getPrisma().table.update({
          where: { id: currentReservation.tableId },
          data: { status: "AVAILABLE" },
        });
        // Clear legacy tableId field
        updateData.tableId = null;
      }
    } else if (status === "NO_SHOW") {
      updateData.noShow = true;

      // Release assigned tables (same behavior as cancellation: free tables + clear assignments)
      const reservationTables = await this.db.getPrisma().reservationTable.findMany({
        where: { reservationId: id },
        include: { table: true },
      });

      if (reservationTables.length > 0) {
        const tableIds = reservationTables.map((rt) => rt.tableId);
        await this.db.getPrisma().table.updateMany({
          where: { id: { in: tableIds } },
          data: { status: "AVAILABLE" },
        });
        await this.db.getPrisma().reservationTable.deleteMany({
          where: { reservationId: id },
        });
      }

      if (currentReservation.tableId && currentReservation.table) {
        await this.db.getPrisma().table.update({
          where: { id: currentReservation.tableId },
          data: { status: "AVAILABLE" },
        });
        updateData.tableId = null;
      }
    }

    const updatedReservation = await this.db.getPrisma().reservation.update({
      where: { id },
      data: updateData,
      include: {
        user: true,
        table: true, // Legacy single table
        tables: {
          include: {
            table: true,
          },
        },
        reservationOrder: {
          include: {
            items: {
              include: {
                meal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
                addons: true,
                optionalIngredients: true,
              },
            },
          },
        },
      },
    });

    // Germany-style EOD posting for reservation orders:
    // Post only when the reservation is completed (service performed) and the reservation order is paid.
    try {
      const ro = (updatedReservation as any)?.reservationOrder;
      const branchId = (updatedReservation as any)?.branchId;
      if (
        String(status) === "COMPLETED" &&
        ro?.id &&
        branchId &&
        String(ro.paymentStatus) === "PAID" &&
        !ro.postedAt
      ) {
        const branch = await (this.db.getPrisma() as any).branch.findUnique({
          where: { id: branchId },
          select: { organizationId: true },
        });

        const organizationId = branch?.organizationId as string | null | undefined;
        if (organizationId) {
          const config = await getFiskalyConfigSnapshot(
            this.db.getPrisma() as any,
            organizationId
          );
          if (shouldFiscalize(config)) {
            const fiskaly = FiskalyService.getInstance();
            await fiskaly.fiscalize({
              organizationId,
              branchId,
              reservationOrderId: ro.id,
              amount: Number((ro as any).totalAmount),
              currency: String((ro as any).currency || "usd"),
              receiptNumber: String((ro as any).orderNumber || ro.id),
              meta: {
                paymentMethod: String((ro as any)?.paymentMethod || "").trim() || null,
                voucherPaymentAmount: Number((ro as any)?.voucherPaymentAmount || 0),
                voucherCodes: (ro as any)?.voucherCodes || [],
              },
            });
          }
        }

        const businessDayService = BusinessDayService.getInstance();
        const openSession = await businessDayService.getOrCreateOpenSession(branchId);
        await this.db.getPrisma().reservationOrder.update({
          where: { id: ro.id },
          data: {
            postedAt: new Date(),
            businessDaySessionId: openSession?.id || null,
          } as any,
        });
      }
    } catch {
      // don't fail reservation status changes due to EOD posting
    }

    // Emit WebSocket events for real-time updates
    try {
      const wsService = WebSocketService.getInstance();
      
      // Emit to user if they have a userId
      if (updatedReservation.userId) {
        wsService.emitReservationStatusChange(updatedReservation.userId, updatedReservation);
      }
      
      // Emit to admin room for real-time updates in admin panel
      wsService.emitReservationUpdate(updatedReservation);
    } catch (error) {
      console.error("Error emitting WebSocket events for reservation update:", error);
      // Continue even if WebSocket emission fails
    }

    return updatedReservation;
  }

  /**
   * Calculate the net paid amount from Stripe payment intents (original + incremental),
   * subtracting any refunds (succeeded or pending).
   */
  private async calculateNetPaidAmountFromStripe(
    paymentIntentId: string | null,
    incrementalPaymentIntentIds: string | null
  ): Promise<number> {
    const ids: string[] = [];
    if (paymentIntentId) ids.push(paymentIntentId);
    if (incrementalPaymentIntentIds) {
      try {
        const parsed = JSON.parse(incrementalPaymentIntentIds);
        if (Array.isArray(parsed)) {
          ids.push(...parsed.filter((id: any) => typeof id === "string"));
        }
      } catch {
        // ignore parse errors
      }
    }

    if (!ids.length) return 0;

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-10-29.clover",
    });

    let netPaid = 0;

    for (const pid of ids) {
      try {
        const intent = await stripe.paymentIntents.retrieve(pid);
        const amount = intent.amount_received !== null ? intent.amount_received : intent.amount;
        if (amount && intent.status === "succeeded") {
          netPaid += amount / 100;
        }

        const refunds = await stripe.refunds.list({ payment_intent: pid, limit: 100 });
        const refunded = refunds.data.reduce((sum, refund) => {
          if (refund.status === "succeeded" || refund.status === "pending") {
            return sum + refund.amount / 100;
          }
          return sum;
        }, 0);
        netPaid -= refunded;
      } catch (err) {
        console.error(`[ReservationService] Failed to compute net paid for PI ${pid}:`, err);
      }
    }

    // Clamp to 2 decimals, never below zero
    return Math.max(0, Math.round(netPaid * 100) / 100);
  }

  /**
   * Assign table(s) to reservation
   * Supports both single table (legacy) and multiple tables
   * Supports capacity override for cases where capacity is slightly short
   */
  public async assignTable(
    reservationId: string,
    tableIds: string | string[],
    overrideCapacity?: boolean,
    overrideNote?: string
  ): Promise<any> {
    const tableIdArray = Array.isArray(tableIds) ? tableIds : [tableIds];
    
    if (tableIdArray.length === 0) {
      throw new Error("At least one table ID is required");
    }

    // Get reservation to check number of guests
    const reservation = await this.db.getPrisma().reservation.findUnique({
      where: { id: reservationId },
      include: { tables: { include: { table: true } } },
    });

    if (!reservation) {
      throw new Error("Reservation not found");
    }

    if (reservation.status === "CANCELLED") {
      throw new Error("Cannot modify a cancelled reservation");
    }

    // Get tables and calculate total capacity
    const tables = await this.db.getPrisma().table.findMany({
      where: { id: { in: tableIdArray } },
    });

    if (tables.length !== tableIdArray.length) {
      throw new Error("One or more tables not found");
    }

    // Calculate total capacity of selected tables
    const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
    const capacityShort = reservation.numberOfGuests - totalCapacity;

    // Check if total capacity is sufficient (unless override is enabled)
    if (totalCapacity < reservation.numberOfGuests) {
      if (!overrideCapacity) {
        throw new Error(
          `Total table capacity (${totalCapacity}) is less than number of guests (${reservation.numberOfGuests}). Use overrideCapacity flag to proceed.`
        );
      }
      
      // Only allow override if shortage is 2 seats or less
      if (capacityShort > 2) {
        throw new Error(
          `Capacity shortage (${capacityShort} seats) is too large. Override only allowed for 1-2 seat shortages.`
        );
      }
    }

    // Update all table statuses to RESERVED
    await this.db.getPrisma().table.updateMany({
      where: { id: { in: tableIdArray } },
      data: { status: "RESERVED" },
    });

    // Remove existing table assignments (from junction table)
    await this.db.getPrisma().reservationTable.deleteMany({
      where: { reservationId },
    });

    // Create new table assignments in junction table
    await this.db.getPrisma().reservationTable.createMany({
      data: tableIdArray.map((tableId) => ({
        reservationId,
        tableId,
      })),
    });

    // For backward compatibility, also set the first table as tableId
    const firstTableId = tableIdArray[0];

    // Prepare update data
    const updateData: any = { tableId: firstTableId }; // Keep for backward compatibility

    // Add override note to internal notes if override was used
    if (overrideCapacity && overrideNote) {
      const existingNotes = reservation.internalNotes || "";
      const notePrefix = existingNotes ? "\n\n" : "";
      updateData.internalNotes = `${existingNotes}${notePrefix}[Capacity Override] ${overrideNote}`;
    } else if (overrideCapacity && capacityShort > 0) {
      // Auto-generate note if override used but no note provided
      const existingNotes = reservation.internalNotes || "";
      const notePrefix = existingNotes ? "\n\n" : "";
      updateData.internalNotes = `${existingNotes}${notePrefix}[Capacity Override] Assigned with ${capacityShort} seat${capacityShort > 1 ? "s" : ""} short (${totalCapacity} seats for ${reservation.numberOfGuests} guests)`;
    }

    // Return updated reservation with all tables
    const updatedReservation = await this.db.getPrisma().reservation.update({
      where: { id: reservationId },
      data: updateData,
      include: {
        user: true,
        table: true, // Legacy single table
        tables: {
          include: {
            table: true,
          },
        },
        reservationOrder: true,
      },
    });

    // Emit WebSocket events for real-time updates
    try {
      const wsService = WebSocketService.getInstance();
      
      // Emit to user if they have a userId
      if (updatedReservation.userId) {
        wsService.emitReservationStatusChange(updatedReservation.userId, updatedReservation);
      }
      
      // Emit to admin room for real-time updates in admin panel
      wsService.emitReservationUpdate(updatedReservation);
    } catch (error) {
      console.error("Error emitting WebSocket events for reservation table assignment:", error);
      // Continue even if WebSocket emission fails
    }

    return updatedReservation;
  }

  /**
   * Complete payment for a reservation order (mark remaining balance as paid)
   */
  public async completeReservationPayment(
    reservationId: string,
    userId?: string
  ): Promise<any> {
    const reservation = await this.db.getPrisma().reservation.findUnique({
      where: { id: reservationId },
      include: {
        reservationOrder: true,
      },
    });

    if (!reservation) {
      throw new Error("Reservation not found");
    }

    if (reservation.status === "CANCELLED") {
      throw new Error("Cannot modify a cancelled reservation");
    }

    if (!reservation.reservationOrder) {
      throw new Error("Reservation order not found");
    }

    const totalAmount = Number(reservation.reservationOrder.totalAmount);
    const currentPaidAmount = Number(reservation.reservationOrder.paidAmount || 0);

    if (currentPaidAmount >= totalAmount) {
      throw new Error("Payment already completed");
    }

    // Get existing history and append new entry
    const existingHistory = (reservation.reservationOrder.history as any[]) || [];
    const newHistoryEntry = {
      type: "PAYMENT_COMPLETED",
      action: "Remaining balance paid",
      userId: userId,
      timestamp: new Date().toISOString(),
      details: {
        previousPaidAmount: currentPaidAmount,
        newPaidAmount: totalAmount,
        remainingAmount: totalAmount - currentPaidAmount,
      },
    };
    const updatedHistory = [...existingHistory, newHistoryEntry];

    // Update paidAmount to totalAmount
    await this.db.getPrisma().reservationOrder.update({
      where: { id: reservation.reservationOrder.id },
      data: {
        paidAmount: totalAmount,
        paymentStatus: "PAID",
        history: updatedHistory,
      },
    });

    // Get updated reservation with full details
    const updatedReservation = await this.getReservationById(reservationId);

    // Emit WebSocket events for real-time updates
    try {
      const wsService = WebSocketService.getInstance();
      
      // Emit to user if they have a userId
      if (updatedReservation.userId) {
        wsService.emitReservationStatusChange(updatedReservation.userId, updatedReservation);
      }
      
      // Emit to admin room for real-time updates in admin panel
      wsService.emitReservationUpdate(updatedReservation);
    } catch (error) {
      console.error("Error emitting WebSocket events for payment completion:", error);
      // Continue even if WebSocket emission fails
    }

    return updatedReservation;
  }

  /**
   * Cancel reservation
   * Handles cancellation according to refund policy:
   * - Full refund if cancelled X hours before (fullRefundHoursBefore)
   * - Partial refund if cancelled within X hours (partialRefundHoursBefore)
   * - No refund if cancelled within X hours (noRefundHoursBefore)
   */
  public async cancelReservation(
    id: string,
    reason?: string,
    userId?: string
  ): Promise<any> {
    const reservation = await this.db.getPrisma().reservation.findUnique({
      where: { id },
      include: { reservationOrder: { include: { payment: true, refunds: true } } },
    });

    if (!reservation) {
      throw new Error("Reservation not found");
    }

    const settings = await this.getSettings(reservation.branchId || undefined);
    const now = new Date();
    const hoursUntilReservation =
      (reservation.reservationDate.getTime() - now.getTime()) /
      (1000 * 60 * 60);

    // Determine refund amount based on cancellation policy (for PRE_ORDER only)
    let refundPercentage = 0; // 0 = no refund, 0.5 = 50%, 1.0 = 100%
    
    if (reservation.type === "PRE_ORDER" && reservation.reservationOrder) {
      const fullRefundHours = settings.fullRefundHoursBefore ?? 24;
      const partialRefundHours = settings.partialRefundHoursBefore ?? 4;
      const noRefundHours = settings.noRefundHoursBefore ?? 1;

      if (hoursUntilReservation >= fullRefundHours) {
        // Full refund
        refundPercentage = 1.0;
      } else if (hoursUntilReservation >= partialRefundHours) {
        // Partial refund (50%)
        refundPercentage = 0.5;
      } else if (hoursUntilReservation >= noRefundHours) {
        // Partial refund (25%) - between no refund and partial refund threshold
        refundPercentage = 0.25;
      } else {
        // No refund
        refundPercentage = 0;
      }

      // Process refund if applicable
      if (refundPercentage > 0 && reservation.reservationOrder) {
        const prisma = this.db.getPrisma();
        const paymentProvider =
          reservation.reservationOrder.payment?.paymentProvider ||
          PaymentProvider.STRIPE;
        const paymentRecord = reservation.reservationOrder.payment;
        const paidAmount = parseFloat(
          reservation.reservationOrder.paidAmount.toString()
        );
        const refundAmount = paidAmount * refundPercentage;
        const currency = reservation.reservationOrder.currency.toUpperCase();

        if (paymentProvider === PaymentProvider.PAYPAL) {
          const captureId = paymentRecord?.providerChargeId;
          if (captureId && refundAmount > 0) {
            try {
              const refundResult =
                await PayPalRefundService.getInstance().createRefund({
                  captureId,
                  amount: refundAmount,
                  currency,
                  reason: reason || "reservation_cancellation",
                  metadata: {
                    invoiceId: reservation.reservationOrder.orderNumber,
                    customId: reservation.id,
                  },
                });

              const paypalRefundId = (refundResult as any)?.id || null;

              await prisma.refund.create({
                data: {
                  reservationOrderId: reservation.reservationOrder.id,
                  refundType: refundPercentage === 1.0 ? "FULL" : "PARTIAL",
                  amount: refundAmount,
                  reason: reason || "Reservation cancellation",
                  status: "SUCCEEDED",
                  refundedBy: userId || "system",
                  refundedAt: new Date(),
                  paypalRefundId,
                  paymentId: reservation.reservationOrder.paymentId || null,
                },
              });
            } catch (paypalError) {
              console.error(
                "[ReservationService] Error processing PayPal refund during cancellation:",
                paypalError
              );
            }
          }
        } else if (reservation.paymentIntentId) {
          try {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
              apiVersion: "2025-10-29.clover",
            });

            // Calculate total amount paid (original + incremental payment intents)
            let totalPaidAmount = 0;
            const incrementalPaymentIntentIds: string[] =
              reservation.incrementalPaymentIntentIds
                ? JSON.parse(reservation.incrementalPaymentIntentIds)
                : [];

            // Get original payment intent amount
            if (reservation.paymentIntentId) {
              try {
                const originalIntent = await stripe.paymentIntents.retrieve(
                  reservation.paymentIntentId
                );
                totalPaidAmount += originalIntent.amount / 100; // Convert from cents
              } catch (error) {
                console.error(
                  `[ReservationService] Error retrieving original payment intent:`,
                  error
                );
              }
            }

            // Get incremental payment intent amounts
            for (const incrementalId of incrementalPaymentIntentIds) {
              try {
                const incrementalIntent = await stripe.paymentIntents.retrieve(
                  incrementalId
                );
                totalPaidAmount += incrementalIntent.amount / 100; // Convert from cents
              } catch (error) {
                console.error(
                  `[ReservationService] Error retrieving incremental payment intent ${incrementalId}:`,
                  error
                );
              }
            }

            const stripeRefundAmount = Math.min(refundAmount, totalPaidAmount);

            if (stripeRefundAmount > 0) {
              // Refund from newest incremental payment intents first (LIFO), then original
              const allPaymentIntentIds = [
                ...incrementalPaymentIntentIds.reverse(),
                reservation.paymentIntentId,
              ];
              let remainingRefundAmount = stripeRefundAmount;

              for (const paymentIntentId of allPaymentIntentIds) {
                if (remainingRefundAmount <= 0) break;

                try {
                  const paymentIntent = await stripe.paymentIntents.retrieve(
                    paymentIntentId
                  );
                  const availableForRefund = paymentIntent.amount / 100; // Convert from cents

                  // Check existing refunds for this payment intent
                  const existingRefunds = await stripe.refunds.list({
                    payment_intent: paymentIntentId,
                  });
                  const alreadyRefunded = existingRefunds.data.reduce(
                    (sum, refund) => sum + refund.amount / 100,
                    0
                  );
                  const availableAmount = availableForRefund - alreadyRefunded;

                  if (availableAmount > 0) {
                    const refundToProcess = Math.min(
                      remainingRefundAmount,
                      availableAmount
                    );

                    await stripe.refunds.create({
                      payment_intent: paymentIntentId,
                      amount: Math.round(refundToProcess * 100), // Convert to cents
                      reason: "requested_by_customer",
                      metadata: {
                        reservationId: id,
                        reason: reason || "reservation_cancellation",
                        refundPercentage: refundPercentage.toString(),
                      },
                    });

                    remainingRefundAmount -= refundToProcess;
                  }
                } catch (error) {
                  console.error(
                    `[ReservationService] Error processing refund for payment intent ${paymentIntentId}:`,
                    error
                  );
                  // Continue with other payment intents even if one fails
                }
              }

              await prisma.refund.create({
                data: {
                  reservationOrderId: reservation.reservationOrder.id,
                  refundType: refundPercentage === 1.0 ? "FULL" : "PARTIAL",
                  amount: stripeRefundAmount,
                  reason: reason || "Reservation cancellation",
                  status: "SUCCEEDED",
                  refundedBy: userId || "system",
                  refundedAt: new Date(),
                  paymentId: reservation.reservationOrder.paymentId || null,
                },
              });
            }
          } catch (error) {
            console.error(
              "[ReservationService] Error processing refund during cancellation:",
              error
            );
            // Continue with cancellation even if refund fails
          }
        }

        // Update order payment status
        const newPaymentStatus =
          refundPercentage === 1.0
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED;

        await prisma.reservationOrder.update({
          where: { id: reservation.reservationOrder.id },
          data: {
            paymentStatus: newPaymentStatus,
            status: "CANCELLED",
          },
        });

        if (reservation.reservationOrder.paymentId) {
          await prisma.payment.update({
            where: { id: reservation.reservationOrder.paymentId },
            data: {
              status:
                newPaymentStatus === PaymentStatus.REFUNDED
                  ? PaymentState.REFUNDED
                  : PaymentState.PARTIALLY_REFUNDED,
              refundedAt: new Date(),
            },
          });
        }

        // Add history entry for refund
        await this.addHistoryEntry(reservation.reservationOrder.id, {
          type: "REFUND",
          action: `Refund processed: ${(refundPercentage * 100).toFixed(0)}% (${refundAmount.toFixed(
            2
          )} ${reservation.reservationOrder.currency})`,
          userId: userId,
          details: {
            refundPercentage,
            refundAmount,
            refundType: refundPercentage === 1.0 ? "FULL" : "PARTIAL",
            reason: reason || "Reservation cancellation",
            hoursUntilReservation: hoursUntilReservation.toFixed(2),
          },
        });
      } else if (reservation.reservationOrder && refundPercentage === 0) {
        // No refund but still cancel the order
        await this.db.getPrisma().reservationOrder.update({
          where: { id: reservation.reservationOrder.id },
          data: {
            status: "CANCELLED",
          },
        });

        // Add history entry for cancellation without refund
        await this.addHistoryEntry(reservation.reservationOrder.id, {
          type: "CANCELLED",
          action: "Reservation cancelled - no refund (within no-refund window)",
          userId: userId,
          details: {
            reason: reason || "Reservation cancellation",
            hoursUntilReservation: hoursUntilReservation.toFixed(2),
            refundPercentage: 0,
          },
        });
      }
    }

    // Free up tables if assigned (legacy single table)
    if (reservation.tableId) {
      await this.db.getPrisma().table.update({
        where: { id: reservation.tableId },
        data: { status: "AVAILABLE" },
      });
    }

    // Free up tables from junction table (many-to-many)
    const reservationTables = await this.db.getPrisma().reservationTable.findMany({
      where: { reservationId: id },
      include: { table: true },
    });

    // Update all tables to AVAILABLE status before deleting junction entries
    if (reservationTables.length > 0) {
      const tableIds = reservationTables.map((rt) => rt.tableId);
      await this.db.getPrisma().table.updateMany({
        where: { id: { in: tableIds } },
        data: { status: "AVAILABLE" },
      });
    }

    // Delete junction table entries to release the association
    await this.db.getPrisma().reservationTable.deleteMany({
      where: { reservationId: id },
    });

    // Clear legacy tableId field as well
    if (reservation.tableId) {
      await this.db.getPrisma().reservation.update({
        where: { id },
        data: { tableId: null },
      });
    }

    // Update reservation
    const cancelledReservation = await this.db.getPrisma().reservation.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: reason,
      },
      include: {
        user: true,
        table: true,
        tables: {
          include: {
            table: true,
          },
        },
        reservationOrder: true,
      },
    });

    // Emit WebSocket events for real-time updates
    try {
      const wsService = WebSocketService.getInstance();
      
      // Emit to user if they have a userId
      if (cancelledReservation.userId) {
        wsService.emitReservationStatusChange(cancelledReservation.userId, cancelledReservation);
      }
      
      // Emit to admin room for real-time updates in admin panel
      wsService.emitReservationUpdate(cancelledReservation);
    } catch (error) {
      console.error("Error emitting WebSocket events for reservation cancellation:", error);
      // Continue even if WebSocket emission fails
    }

    return cancelledReservation;
  }

  /**
   * Modify reservation (update time, date, number of guests, zone, tables, and pre-order items)
   */
  public async modifyReservation(
    id: string,
    updates: {
      reservationDate?: Date;
      numberOfGuests?: number;
      orderItems?: any[]; // For PRE_ORDER reservations
      paymentIntentId?: string; // For new items payment when modifying
      userId?: string;
      zoneId?: string; // Zone selection
      tableIds?: string[]; // Table selection (array of table IDs)
    }
  ): Promise<any> {
    const db = this.db.getPrisma();
    const reservation = await db.reservation.findUnique({
      where: { id },
      include: {
        reservationOrder: {
          include: {
            items: {
              include: {
                addons: true,
                optionalIngredients: true,
              },
            },
            payment: true,
            refunds: true,
          },
        },
        table: true,
        tables: {
          include: {
            table: true,
          },
        },
      },
    });

    if (!reservation) {
      throw new Error("Reservation not found");
    }

    // Use the original reservation branch for all calculations (tax/deposit hierarchy)
    const branchIdForPricing = reservation.branchId || undefined;
    console.debug("[ReservationService] modifyReservation branch context", {
      reservationId: id,
      branchId: branchIdForPricing ?? "global",
      userId: updates.userId ?? null,
    });

    // Check modification window (branch-specific override > global)
    const settings = await this.getSettings(branchIdForPricing);
    console.debug("[ReservationService] modifyReservation settings snapshot", {
      branchId: branchIdForPricing ?? "global",
      depositPercentage: settings?.depositPercentage,
      taxInclusive: settings?.taxInclusive,
    });
    const modificationWindowHours = settings.modificationWindowHours || 24;
    const now = new Date();
    const hoursUntilReservation =
      (reservation.reservationDate.getTime() - now.getTime()) /
      (1000 * 60 * 60);

    if (hoursUntilReservation < modificationWindowHours) {
      throw new Error(
        `Reservations can only be modified at least ${modificationWindowHours} hours before the reservation time`
      );
    }

    // Validate new time slot if date/time is being changed
    if (updates.reservationDate) {
      const availability = await this.checkAvailability(
        updates.reservationDate,
        updates.reservationDate.toTimeString().slice(0, 5),
        updates.numberOfGuests || reservation.numberOfGuests
      );

      if (!availability.available) {
        throw new Error(
          availability.reason || "New time slot is not available"
        );
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (updates.reservationDate) {
      updateData.reservationDate = updates.reservationDate;
    }

    if (updates.numberOfGuests) {
      updateData.numberOfGuests = updates.numberOfGuests;
    }

    // Handle zone update
    if (updates.zoneId !== undefined) {
      updateData.zoneId = updates.zoneId;
    }

    // Handle table assignments update
    if (updates.tableIds !== undefined && Array.isArray(updates.tableIds)) {
      // Delete existing table assignments
      await db.reservationTable.deleteMany({
        where: { reservationId: id },
      });

      // Create new table assignments if tableIds provided
      if (updates.tableIds.length > 0) {
        await db.reservationTable.createMany({
          data: updates.tableIds.map((tableId: string) => ({
            reservationId: id,
            tableId,
          })),
        });

        // Update legacy tableId field for backward compatibility (use first table)
        updateData.tableId = updates.tableIds[0];
      } else {
        // Clear legacy tableId if no tables assigned
        updateData.tableId = null;
      }
    }

      // Handle PRE_ORDER modifications
    // IMPORTANT: Validate meal availability BEFORE any payment processing
    // If orderItems is empty array, cancel the reservation and refund fully
    if (reservation.type === "PRE_ORDER" && updates.orderItems !== undefined) {
      // Validate that branch cannot be changed
      // The branchId should remain the same as the original reservation
      if (reservation.branchId) {
        // Validate that all orderItems are available in the reservation's branch
        // Check if any meals are excluded from this branch (either directly or via category)
        // This validation MUST happen BEFORE any payment processing (refunds or new payments)
        const unavailableItems: { mealId: string; mealName: string; reason: string }[] = [];
        
        for (const item of updates.orderItems) {
          const mealId = item.mealId;
          if (!mealId) continue;
          
          const meal = await db.meal.findUnique({
            where: { id: mealId },
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  excludedBranches: true,
                },
              },
            },
          });
          
          if (!meal || !meal.isActive) {
            unavailableItems.push({
              mealId,
              mealName: meal?.name || "Unknown meal",
              reason: !meal ? "Meal not found" : "Meal is not active",
            });
            continue;
          }
          
          // Check if meal is directly excluded from this branch
          if (meal.excludedBranches?.includes(reservation.branchId)) {
            unavailableItems.push({
              mealId,
              mealName: meal.name,
              reason: "This meal is excluded from this branch",
            });
            continue;
          }
          
          // Check if meal's category is excluded from this branch
          if (meal.category?.excludedBranches?.includes(reservation.branchId)) {
            unavailableItems.push({
              mealId,
              mealName: meal.name,
              reason: `The category "${meal.category.name}" is excluded from this branch`,
            });
            continue;
          }
        }
        
        // If any items are unavailable, throw an error and prevent ALL payment processing
        if (unavailableItems.length > 0) {
          const mealDetails = unavailableItems.map(item => 
            `"${item.mealName}" (${item.reason})`
          ).join(", ");
          
          throw new Error(
            `Cannot proceed with payment: One or more selected items are not available in this branch. ${mealDetails}. Please remove these items and try again.`
          );
        }
      }
      
      // If all items are removed (empty array), cancel the reservation and refund fully
      if (updates.orderItems.length === 0) {
        // Get the actual payment amount from Stripe for full refund
        // Also check for existing refunds to calculate available refund amount
        let refundAmount = 0;
        let originalPaymentAmount = 0;
        let alreadyRefunded = 0;
        
        if (reservation.paymentIntentId) {
          try {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
              apiVersion: "2025-10-29.clover",
            });
            const paymentIntent = await stripe.paymentIntents.retrieve(reservation.paymentIntentId);
            originalPaymentAmount = paymentIntent.amount / 100; // Convert from cents to dollars
            
            // Check for existing refunds on this payment intent
            const existingRefunds = await stripe.refunds.list({
              payment_intent: reservation.paymentIntentId,
              limit: 100, // Get all refunds
            });
            
            // Calculate total already refunded
            alreadyRefunded = existingRefunds.data.reduce((sum, refund) => {
              // Only count succeeded or pending refunds
              if (refund.status === "succeeded" || refund.status === "pending") {
                return sum + (refund.amount / 100);
              }
              return sum;
            }, 0);
            
            // The refund amount is what's available (original - already refunded)
            refundAmount = originalPaymentAmount - alreadyRefunded;
            
          } catch (stripeError) {
            console.error("Error retrieving payment intent for cancellation refund:", stripeError);
            // Fall back to stored totalAmount + tax
            const storedTotal = Number(reservation.reservationOrder?.totalAmount || 0);
            const storedTax = Number(reservation.reservationOrder?.taxAmount || 0);
            const mainSettings = await db.settings.findFirst();
            const taxInclusive = mainSettings?.taxInclusive || false;
            if (!taxInclusive && storedTax > 0) {
              refundAmount = storedTotal + storedTax;
            } else {
              refundAmount = storedTotal;
            }
          }
        } else {
          // No payment intent, use stored total
          const storedTotal = Number(reservation.reservationOrder?.totalAmount || 0);
          const storedTax = Number(reservation.reservationOrder?.taxAmount || 0);
          const mainSettings = await db.settings.findFirst();
          const taxInclusive = mainSettings?.taxInclusive || false;
          if (!taxInclusive && storedTax > 0) {
            refundAmount = storedTotal + storedTax;
          } else {
            refundAmount = storedTotal;
          }
        }
        
        // If no refund amount available, don't try to refund
        if (refundAmount <= 0) {
          console.warn(`[ReservationService] No refundable amount available for cancellation. Original: ${originalPaymentAmount}, Already refunded: ${alreadyRefunded}`);
        }

        const paymentRecord =
          reservation.reservationOrder?.payment ||
          (await db.payment.findFirst({
            where: { reservationOrderId: reservation.reservationOrder?.id },
          }));
        const paymentProvider =
          paymentRecord?.paymentProvider || PaymentProvider.STRIPE;

        // Process full refund via provider - MUST succeed before cancelling reservation
        // Only process if there's an available refund amount
        if (refundAmount > 0) {
          if (
            paymentProvider === PaymentProvider.PAYPAL &&
            paymentRecord?.providerChargeId
          ) {
            try {
              const refundResult =
                await PayPalRefundService.getInstance().createRefund({
                  captureId: paymentRecord.providerChargeId,
                  amount: refundAmount,
                  currency:
                    reservation.reservationOrder?.currency?.toUpperCase() ||
                    "USD",
                  reason: "cancellation_all_items_removed",
                  metadata: {
                    invoiceId: String(
                      reservation.reservationOrder?.orderNumber || ""
                    ),
                    customId: reservation.id,
                  },
                });

              const paypalRefundId = (refundResult as any)?.id || null;

              await db.refund.create({
                data: {
                  reservationOrderId: reservation.reservationOrder!.id,
                  refundType: "FULL",
                  amount: refundAmount,
                  reason: "All items removed from pre-order",
                  status: "SUCCEEDED",
                  refundedBy: updates.userId || "system",
                  refundedAt: new Date(),
                  paypalRefundId,
                  paymentId: paymentRecord.id,
                },
              });
            } catch (paypalError) {
              console.error(
                "[ReservationService] Full refund via PayPal failed:",
                paypalError
              );
              const errorMessage =
                (paypalError as any)?.message ||
                (paypalError as any)?.toString() ||
                "Unknown error";
              throw new Error(
                `Failed to process full refund for cancellation: ${errorMessage}. Reservation cancellation cancelled.`
              );
            }
          } else if (reservation.paymentIntentId) {
            try {
              const Stripe = (await import("stripe")).default;
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
                apiVersion: "2025-10-29.clover",
              });
              
              // Create refund and wait for confirmation
              const refund = await stripe.refunds.create({
                payment_intent: reservation.paymentIntentId,
                amount: Math.round(refundAmount * 100), // Convert to cents
                reason: "requested_by_customer",
                metadata: {
                  reservationId: id,
                  reason: "cancellation_all_items_removed",
                },
              });

              // Wait for refund to be confirmed (check status)
              if (refund.status === "succeeded" || refund.status === "pending") {
                
                // For pending refunds, wait a moment and verify
                if (refund.status === "pending") {
                  // Wait 1 second and check status again
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const verifiedRefund = await stripe.refunds.retrieve(refund.id);
                  
                  if (verifiedRefund.status !== "succeeded" && verifiedRefund.status !== "pending") {
                    throw new Error(`Refund ${refund.id} failed with status: ${verifiedRefund.status}`);
                  }
                  
                }
              } else {
                throw new Error(`Refund ${refund.id} failed with status: ${refund.status}`);
              }

              await db.refund.create({
                data: {
                  reservationOrderId: reservation.reservationOrder!.id,
                  refundType: "FULL",
                  amount: refundAmount,
                  reason: "All items removed from pre-order",
                  status: "SUCCEEDED",
                  refundedBy: updates.userId || "system",
                  refundedAt: new Date(),
                  stripeRefundId: refund.id,
                  paymentId: paymentRecord?.id || null,
                },
              });
            } catch (stripeError: any) {
              console.error("[ReservationService] Full refund failed:", stripeError);
              const errorMessage = stripeError?.message || stripeError?.toString() || "Unknown error";
              throw new Error(`Failed to process full refund for cancellation: ${errorMessage}. Reservation cancellation cancelled.`);
            }
          }
        }

        // Cancel the reservation (bypass cancellation policy check since user removed all items)
        // We'll manually update the reservation status to avoid the policy check
        const cancelledReservation = await db.reservation.update({
          where: { id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledBy: updates.userId,
            cancellationReason: "All items removed from pre-order",
          },
          include: {
            user: true,
            table: true,
            tables: {
              include: {
                table: true,
              },
            },
            reservationOrder: {
              include: {
                items: {
                  include: {
                    meal: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                      },
                    },
                    addons: true,
                    optionalIngredients: true,
                  },
                },
              },
            },
          },
        });

        // Free up table if assigned
        if (cancelledReservation.tableId) {
          await db.table.update({
            where: { id: cancelledReservation.tableId },
            data: { status: "AVAILABLE" },
          });
        }

        // Free up multiple tables if assigned
        if (cancelledReservation.tables && cancelledReservation.tables.length > 0) {
          const tableIds = cancelledReservation.tables.map((rt) => rt.tableId);
          await db.table.updateMany({
            where: { id: { in: tableIds } },
            data: { status: "AVAILABLE" },
          });
        }

        // Emit WebSocket events for real-time updates
        try {
          const wsService = WebSocketService.getInstance();
          
          // Emit to user if they have a userId
          if (cancelledReservation.userId) {
            wsService.emitReservationStatusChange(cancelledReservation.userId, cancelledReservation);
          }
          
          // Emit to admin room for real-time updates in admin panel
          wsService.emitReservationUpdate(cancelledReservation);
        } catch (error) {
          console.error("Error emitting WebSocket events for reservation cancellation:", error);
        }

        return cancelledReservation;
      }
      const TaxCalculator = (await import("../utils/taxCalculator")).default;
      const taxCalculator = new TaxCalculator();
      const mainSettings = await db.settings.findFirst();
      const branchForTax = branchIdForPricing
        ? await db.branch.findUnique({
            where: { id: branchIdForPricing },
            select: { taxInclusive: true },
          })
        : null;
      const taxInclusive =
        branchForTax?.taxInclusive !== null && branchForTax?.taxInclusive !== undefined
          ? Boolean(branchForTax.taxInclusive)
          : Boolean(mainSettings?.taxInclusive || false);

      // Get all meals for tax calculation
      const mealIds = updates.orderItems.map((item: any) => item.mealId);
      const meals = await db.meal.findMany({
        where: { id: { in: mealIds } },
        include: {
          mealSizes: true,
          category: true,
        },
      });

      let newTotalAmount = 0;
      let newItemTaxAmount = 0;
      let newAddonTaxAmount = 0;

      // Calculate new totals
      for (const item of updates.orderItems) {
        const meal = meals.find((m) => m.id === item.mealId);
        if (!meal) continue;

        const mealSize = meal.mealSizes.find(
          (s) => s.sizeType === item.mealSizeType
        );
        const branchBasePrice = await getMealBasePrice(
          item.mealId,
          branchIdForPricing || undefined
        );
        const unitPrice = mealSize
          ? Number(branchBasePrice) + Number(mealSize.price)
          : Number(branchBasePrice);
        const itemTotal = unitPrice * item.quantity;
        newTotalAmount += itemTotal;

        // Calculate tax for item - use branchId from reservation (already loaded above)
        // Tax hierarchy: branch item override > branch tax > meal size > meal > category > settings
        const taxPercentage = await taxCalculator.getMealTaxPercentage(
          item.mealId,
          mealSize?.name,
          branchIdForPricing
        );
        let itemTax = 0;
        if (taxInclusive) {
          itemTax = (Number(unitPrice) * taxPercentage) / (100 + taxPercentage);
        } else {
          itemTax = (Number(unitPrice) * taxPercentage) / 100;
        }
        newItemTaxAmount += itemTax * item.quantity;

        // Calculate tax for addons - ensure addons are processed and taxes calculated
        if (item.addons && Array.isArray(item.addons) && item.addons.length > 0) {
          for (const addonItem of item.addons) {
            // Ensure we have a valid addon ID
            if (!addonItem.addonId) {
              console.warn(`[ReservationService] Skipping addon without ID in item ${item.mealId}`);
              continue;
            }

            // Prefer branch-priced addon base price; fall back to default/helper then client price
            let addonPrice = addonItem.addonId
              ? await getAddonBasePrice(addonItem.addonId, reservation.branchId || undefined)
              : Number(addonItem.price || 0);
            if (addonPrice <= 0) {
              console.warn(`[ReservationService] Addon ${addonItem.addonId} has invalid price: ${addonItem.price}`);
            }

            const addonQuantity = addonItem.quantity || 1;
            const addonTotal = addonPrice * addonQuantity * item.quantity;
            newTotalAmount += addonTotal;

            // Calculate tax for this addon - this is critical for correct tax calculation
            // Tax hierarchy for addons: branch item override > branch tax > addon > settings
            const addonTaxPercentage = await taxCalculator.getAddonTaxPercentage(
              addonItem.addonId,
              branchIdForPricing
            );
            let addonTax = 0;
            if (taxInclusive) {
              // Tax is included in price - extract tax amount
              addonTax =
                (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage);
            } else {
              // Tax is added on top of price
              addonTax = (addonPrice * addonTaxPercentage) / 100;
            }
            // Total addon tax = tax per addon × addon quantity × item quantity
            const addonTaxForAll = addonTax * addonQuantity * item.quantity;
            newAddonTaxAmount += addonTaxForAll;
          }
        }
      }

      const newTaxAmount = newItemTaxAmount + newAddonTaxAmount;
      const newFinalTotal = taxInclusive
        ? newTotalAmount
        : newTotalAmount + newTaxAmount;

      // Use ACTUAL Stripe payment amounts as the source of truth for oldTotal
      // This ensures we refund exactly what was paid, not what the database says
      let oldTotal = 0;
      let alreadyRefunded = 0;
      
      if (reservation.paymentIntentId) {
        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2025-10-29.clover",
          });
          
          // Get original payment intent amount
          const paymentIntent = await stripe.paymentIntents.retrieve(reservation.paymentIntentId);
          const originalPaymentAmount = paymentIntent.amount / 100;
          
          // Get existing refunds on original payment intent
          const originalRefunds = await stripe.refunds.list({
            payment_intent: reservation.paymentIntentId,
            limit: 100,
          });
          
          const originalRefunded = originalRefunds.data.reduce((sum, refund) => {
            if (refund.status === "succeeded" || refund.status === "pending") {
              return sum + (refund.amount / 100);
            }
            return sum;
          }, 0);
          
          // Get incremental payment intents and their amounts
          const incrementalPaymentIntentIds: string[] = reservation.incrementalPaymentIntentIds
            ? JSON.parse(reservation.incrementalPaymentIntentIds)
            : [];
          
          let incrementalPaymentsTotal = 0;
          let incrementalRefunded = 0;
          
          for (const incrementalId of incrementalPaymentIntentIds) {
            try {
              const incrementalIntent = await stripe.paymentIntents.retrieve(incrementalId);
              const incrementalAmount = incrementalIntent.amount / 100;
              incrementalPaymentsTotal += incrementalAmount;
              
              // Get refunds on this incremental payment intent
              const incrementalRefunds = await stripe.refunds.list({
                payment_intent: incrementalId,
                limit: 100,
              });
              
              const incrementalRefundedAmount = incrementalRefunds.data.reduce((sum, refund) => {
                if (refund.status === "succeeded" || refund.status === "pending") {
                  return sum + (refund.amount / 100);
                }
                return sum;
              }, 0);
              
              incrementalRefunded += incrementalRefundedAmount;
            } catch (incrementalError) {
              console.error(`[ReservationService] Error retrieving incremental payment intent ${incrementalId}:`, incrementalError);
            }
          }
          
          // oldTotal = (original payment + incremental payments) - (all refunds)
          oldTotal = (originalPaymentAmount + incrementalPaymentsTotal) - (originalRefunded + incrementalRefunded);
          alreadyRefunded = originalRefunded + incrementalRefunded;
          
          const storedTotal = Number(reservation.reservationOrder?.totalAmount || 0);
          const storedTax = Number(reservation.reservationOrder?.taxAmount || 0);
          const storedTotalWithTax = taxInclusive ? storedTotal : storedTotal + storedTax;
          
        } catch (stripeError) {
          console.error("Error retrieving payment intents for oldTotal calculation:", stripeError);
          // Fallback to stored values if Stripe retrieval fails
          const storedTotal = Number(reservation.reservationOrder?.totalAmount || 0);
          const storedTax = Number(reservation.reservationOrder?.taxAmount || 0);
          if (!taxInclusive && storedTax > 0) {
            oldTotal = storedTotal + storedTax;
          } else {
            oldTotal = storedTotal;
          }
        }
      } else {
        // No payment intent - use stored values
        const storedTotal = Number(reservation.reservationOrder?.totalAmount || 0);
        const storedTax = Number(reservation.reservationOrder?.taxAmount || 0);
        if (!taxInclusive && storedTax > 0) {
          oldTotal = storedTotal + storedTax;
        } else {
          oldTotal = storedTotal;
        }
      }
      
      // Use stored reservation total (with tax) as a floor for comparison to avoid false positive charges
      const storedTotal = Number(reservation.reservationOrder?.totalAmount || 0);
      const storedTax = Number(reservation.reservationOrder?.taxAmount || 0);
      const storedTotalWithTax = taxInclusive ? storedTotal : storedTotal + storedTax;
      const effectiveOldTotal = Math.max(oldTotal, storedTotalWithTax);
      const priceDifference = newFinalTotal - effectiveOldTotal;

      // If paymentIntentId is provided (for new items), we'll use it to update the payment
      // Otherwise, we'll handle payment differences automatically
      const hasNewPayment = !!updates.paymentIntentId;

      // IMPORTANT: Process refunds BEFORE database updates to ensure we don't remove items if refund fails
      // If a refund is needed, process it first and wait for confirmation
      // Refund from incremental payment intents first (newest first), then original
      // Only process refund if there's a significant price difference (more than 1 cent) to avoid rounding issues
      if (priceDifference < -0.01) {
        // Cap requested refund by what has actually been paid to avoid over-refunding
        const paidSoFar = Number(reservation.reservationOrder?.paidAmount || 0);
        const requestedRefundAmount = Math.min(Math.abs(priceDifference), paidSoFar);
        const paymentProvider =
          reservation.reservationOrder?.payment?.paymentProvider ||
          PaymentProvider.STRIPE;

        // PayPal refunds (capture-based)
        if (paymentProvider === PaymentProvider.PAYPAL) {
          const paymentRecord = reservation.reservationOrder?.payment;
          const captureId = paymentRecord?.providerChargeId;
          const currency =
            reservation.reservationOrder?.currency?.toUpperCase() || "USD";
          const existingRefunds = reservation.reservationOrder?.refunds || [];
          const alreadyRefunded = existingRefunds.reduce((sum, refund) => {
            if (
              refund.paypalRefundId &&
              refund.status !== "FAILED" &&
              refund.status !== "CANCELED"
            ) {
              return sum + parseFloat(refund.amount.toString());
            }
            return sum;
          }, 0);
          const paidAmount = parseFloat(
            reservation.reservationOrder?.paidAmount?.toString() ||
              reservation.reservationOrder?.totalAmount?.toString() ||
              "0"
          );
          const availableForRefund = Math.max(paidAmount - alreadyRefunded, 0);
          const refundAmount = Math.min(requestedRefundAmount, availableForRefund);

          if (!captureId) {
            throw new Error(
              "PayPal capture ID not found for this reservation; cannot process refund"
            );
          }

          if (refundAmount < 0.01) {
            throw new Error("No refundable PayPal amount available for modification");
          }

          try {
            const refundService = PayPalRefundService.getInstance();
            const refundResult = await refundService.createRefund({
              captureId,
              amount: refundAmount,
              currency,
              reason: "modification_price_difference",
              metadata: {
                invoiceId: String(reservation.reservationOrder?.orderNumber || ""),
                customId: String(reservation.id),
              },
            });

            const paypalRefundId = (refundResult as any)?.id || null;
            let paypalStatus = refundService.mapRefundStatus(
              (refundResult as any)?.status
            );

            if (paypalRefundId && paypalStatus === "PENDING") {
              try {
                const verified = await refundService.getRefund(paypalRefundId);
                paypalStatus = refundService.mapRefundStatus(
                  (verified as any)?.status
                );
              } catch (verifyErr) {
                console.warn(
                  "[ReservationService] PayPal refund verification failed; keeping status as PENDING",
                  verifyErr
                );
              }
            }

            if (paypalStatus === "FAILED" || paypalStatus === "CANCELED") {
              throw new Error("PayPal refund did not succeed");
            }

            await db.refund.create({
              data: {
                reservationOrderId: reservation.reservationOrder!.id,
                refundType: "PARTIAL",
                amount: refundAmount,
                reason: "Price decrease during modification",
                status: paypalStatus as any,
                refundedBy: updates.userId || "system",
                refundedAt: paypalStatus === "SUCCEEDED" ? new Date() : null,
                paypalRefundId,
                paymentId: paymentRecord?.id || null,
              },
            });

            await this.addHistoryEntry(reservation.reservationOrderId!, {
              type: "REFUND",
              action: `PayPal refund processed during modification: ${refundAmount.toFixed(
                2
              )} ${currency}`,
              userId: updates.userId,
              details: {
                refundAmount,
                requestedAmount: requestedRefundAmount,
                currency,
                paypalRefundId,
                status: paypalStatus,
              },
            });
          } catch (paypalError: any) {
            console.error("[ReservationService] PayPal refund failed:", paypalError);
            throw paypalError;
          }
        } else if (reservation.paymentIntentId) {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2025-10-29.clover",
          });

          try {
            // Get all payment intent IDs (incremental + original)
            const incrementalPaymentIntentIds: string[] = reservation.incrementalPaymentIntentIds
              ? JSON.parse(reservation.incrementalPaymentIntentIds)
              : [];
            
            // Build list of all payment intents (newest incremental first, then original)
            const allPaymentIntentIds = [...incrementalPaymentIntentIds.reverse(), reservation.paymentIntentId];
            
            let remainingRefundAmount = requestedRefundAmount;
            const processedRefunds: string[] = [];
            const processedRefundAmounts: number[] = []; // Track actual refunded amounts
            const remainingIncrementalIds: string[] = [];
            
            // Refund from newest incremental payment intents first
            for (const paymentIntentId of allPaymentIntentIds) {
              if (remainingRefundAmount <= 0) {
                // No more refund needed - keep all remaining incremental payment intents
                if (incrementalPaymentIntentIds.includes(paymentIntentId)) {
                  remainingIncrementalIds.push(paymentIntentId);
                }
                continue;
              }
              
              try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                const paymentAmount = paymentIntent.amount / 100;
                
                // Get existing refunds for this payment intent
                const existingRefunds = await stripe.refunds.list({
                  payment_intent: paymentIntentId,
                  limit: 100,
                });
                
                const alreadyRefundedForThis = existingRefunds.data.reduce((sum, refund) => {
                  if (refund.status === "succeeded" || refund.status === "pending") {
                    return sum + (refund.amount / 100);
                  }
                  return sum;
                }, 0);
                
                const availableForRefund = paymentAmount - alreadyRefundedForThis;
                
                if (availableForRefund <= 0) {
                  // This payment intent is fully refunded - don't keep incremental intents
                  // Original payment intent is always kept (even if fully refunded)
                  if (!incrementalPaymentIntentIds.includes(paymentIntentId)) {
                    // This is the original payment intent, always keep it in the list (even if refunded)
                  }
                  continue;
                }
                
                const refundFromThis = Math.min(remainingRefundAmount, availableForRefund);
                const isFullyRefunded = Math.abs(refundFromThis - availableForRefund) < 0.01; // Allow small rounding differences
                
                // Skip refunds less than 1 cent (Stripe minimum)
                if (refundFromThis < 0.01) {
                  remainingRefundAmount -= refundFromThis; // Subtract it anyway to clear the remainder
                  continue;
                }
                
                // Round to 2 decimal places and convert to cents
                const refundAmountInCents = Math.round(Math.round(refundFromThis * 100) / 100 * 100);
                
                // Ensure at least 1 cent
                if (refundAmountInCents < 1) {
                  remainingRefundAmount -= refundFromThis;
                  continue;
                }
                
                const refund = await stripe.refunds.create({
                  payment_intent: paymentIntentId,
                  amount: refundAmountInCents,
                  reason: "requested_by_customer",
                  metadata: {
                    reservationId: id,
                    reason: "modification_price_difference",
                    parentPaymentIntent: reservation.paymentIntentId,
                  },
                });
                
                processedRefunds.push(refund.id);
                // Track the actual refunded amount (in dollars, not cents)
                const actualRefundedAmount = refund.amount / 100;
                processedRefundAmounts.push(actualRefundedAmount);
                remainingRefundAmount -= refundFromThis;
                
                // Verify refund status
                if (refund.status === "pending") {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const verifiedRefund = await stripe.refunds.retrieve(refund.id);
                  if (verifiedRefund.status !== "succeeded" && verifiedRefund.status !== "pending") {
                    throw new Error(`Refund ${refund.id} failed with status: ${verifiedRefund.status}`);
                  }
                }
                
                // Track which incremental payment intents to keep
                if (incrementalPaymentIntentIds.includes(paymentIntentId)) {
                  // This is an incremental payment intent
                  if (!isFullyRefunded) {
                    // Partial refund - keep this incremental payment intent
                    remainingIncrementalIds.push(paymentIntentId);
                  }
                  // If fully refunded, don't add it to remainingIncrementalIds
                }
                // Original payment intent is always kept (handled separately)
                
              } catch (paymentIntentError: any) {
                console.error(`[ReservationService] Error processing refund from payment intent ${paymentIntentId}:`, paymentIntentError);
                // If we couldn't process refund from this payment intent, keep it
                if (incrementalPaymentIntentIds.includes(paymentIntentId)) {
                  remainingIncrementalIds.push(paymentIntentId);
                }
              }
            }
            
            // Allow small rounding differences (less than 1 cent) - these are due to floating point precision
            // If there is still a remaining amount, proceed as partial refund (do NOT throw)
            if (remainingRefundAmount > 0.01) {
              console.warn(
                `[ReservationService] Partial refund during modification. Requested: ${requestedRefundAmount}, Refunded: ${requestedRefundAmount - remainingRefundAmount}, Remaining: ${remainingRefundAmount}`
              );
            }
            
            // Store updated incremental payment intent IDs (only those that weren't fully refunded)
            updateData.incrementalPaymentIntentIds = remainingIncrementalIds.length > 0 
              ? JSON.stringify(remainingIncrementalIds) 
              : null;
            
            // Calculate actual total refunded from Stripe refunds
            const actualTotalRefunded = processedRefundAmounts.reduce((sum, amount) => sum + amount, 0);

            // Update paidAmount to reflect refunds (never below zero)
            if (reservation.reservationOrderId) {
              const currentPaidAmount = Number(reservation.reservationOrder?.paidAmount || 0);
              const newPaidAmount = Math.max(0, currentPaidAmount - actualTotalRefunded);
              await db.reservationOrder.update({
                where: { id: reservation.reservationOrderId },
                data: {
                  paidAmount: newPaidAmount,
                },
              });
            } else {
              console.warn("[ReservationService] Skipping paidAmount update; reservationOrderId is null");
            }
            
            
            // Add history entry for refund during modification
            await this.addHistoryEntry(reservation.reservationOrderId!, {
              type: "REFUND",
              action: `Refund processed during modification: ${actualTotalRefunded.toFixed(2)} ${reservation.reservationOrder?.currency?.toUpperCase() || 'USD'}${remainingRefundAmount > 0.01 ? " (partial)" : ""}`,
              userId: updates.userId,
              details: {
                refundAmount: actualTotalRefunded,
                requestedAmount: requestedRefundAmount,
                remainingUnrefunded: remainingRefundAmount,
                currency: reservation.reservationOrder?.currency?.toUpperCase() || 'USD',
                processedRefunds: processedRefunds.length,
                refundIds: processedRefunds,
                remainingIncrementalIntents: remainingIncrementalIds.length,
              },
            });
            
          } catch (stripeError: any) {
            console.error("[ReservationService] Refund failed:", stripeError);
            const errorMessage = stripeError?.message || stripeError?.toString() || "Unknown error";
            throw new Error(`Failed to process refund: ${errorMessage}. Reservation modification cancelled.`);
          }
        }
      }

      // Delete old order items (cascade will delete addons and optional ingredients)
      // Only proceed if refund was successful (or no refund needed)
      if (reservation.reservationOrderId) {
        await db.reservationOrderItem.deleteMany({
          where: { reservationOrderId: reservation.reservationOrderId },
        });

        // Create new order items
        await db.reservationOrderItem.createMany({
          data: await Promise.all(
            updates.orderItems.map(async (item) => {
              const meal = meals.find((m) => m.id === item.mealId);
              if (!meal) throw new Error(`Meal not found: ${item.mealId}`);

              const mealSize = meal.mealSizes.find(
                (s) => s.sizeType === item.mealSizeType
              );
              const branchBasePrice = await getMealBasePrice(
                item.mealId,
                branchIdForPricing || undefined
              );
              const unitPrice = mealSize
                ? Number(branchBasePrice) + Number(mealSize.price)
                : Number(branchBasePrice);
              const totalPrice = unitPrice * item.quantity;

              const itemTaxPct = await taxCalculator.getMealTaxPercentage(
                item.mealId,
                mealSize?.name,
                branchIdForPricing
              );
              const basePrice = unitPrice;
              const itemTax = taxInclusive
                ? (basePrice * itemTaxPct) / (100 + itemTaxPct)
                : (basePrice * itemTaxPct) / 100;
              const itemTaxAmountForOrderItem = itemTax * item.quantity;

              return {
                reservationOrderId: reservation.reservationOrderId!,
                mealId: item.mealId,
                quantity: item.quantity,
                unitPrice: unitPrice,
                totalPrice,
                selectedSize: mealSize?.name,
                mealSizeType: item.mealSizeType,
                specialInstructions: item.specialInstructions,
                taxAmount: itemTaxAmountForOrderItem,
                taxPercentage: itemTaxPct,
              };
            })
          ),
        });

        // Create addons and optional ingredients for each item
        const createdItems = await db.reservationOrderItem.findMany({
          where: { reservationOrderId: reservation.reservationOrderId },
        });

        for (let i = 0; i < updates.orderItems.length; i++) {
          const item = updates.orderItems[i];
          const orderItem = createdItems[i];

          if (item.addons && item.addons.length > 0) {
            await db.reservationOrderItemAddOn.createMany({
              data: await Promise.all(
                item.addons.map(async (addonItem: any) => {
                  let addonName = addonItem.name || "";
                  if (!addonName && addonItem.addonId) {
                    const addonData = await db.addOn.findUnique({
                      where: { id: addonItem.addonId },
                      select: { name: true },
                    });
                    addonName = addonData?.name || "";
                  }

                  const addonTaxPct = await taxCalculator.getAddonTaxPercentage(
                    addonItem.addonId,
                    branchIdForPricing
                  );
                  // Prefer branch-priced addon base price; fall back to provided price
                  const addonBasePrice = addonItem.addonId
                    ? await getAddonBasePrice(
                        addonItem.addonId,
                        branchIdForPricing || undefined
                      )
                    : Number(addonItem.price || 0);
                  const addonQuantity = addonItem.quantity || 1;
                  const addonTax = taxInclusive
                    ? (addonBasePrice * addonTaxPct) / (100 + addonTaxPct)
                    : (addonBasePrice * addonTaxPct) / 100;
                  const addonTaxAmountForOrderItem =
                    addonTax * addonQuantity * item.quantity;

                  return {
                    reservationOrderItemId: orderItem.id,
                    addon_id: addonItem.addonId,
                    addOnName: addonName || "Unknown Addon",
                    addOnPrice: addonBasePrice,
                    addon_type: addonItem.type || "BOOLEAN",
                    addonSizeType: addonItem.sizeType,
                    quantity: addonQuantity * item.quantity,
                    taxAmount: addonTaxAmountForOrderItem,
                    taxPercentage: addonTaxPct,
                  };
                })
              ),
            });
          }

          if (item.optionalIngredients) {
            await db.reservationOrderItemOptionalIngredient.createMany({
              data: item.optionalIngredients.map((ing: any) => ({
                reservationOrderItemId: orderItem.id,
                optionalIngredientId: ing.id,
                isIncluded: ing.isIncluded !== false,
                ingredientName: ing.name,
              })),
            });
          }
        }

        // Get current paid amount before updating
        const currentPaidAmount = Number(reservation.reservationOrder?.paidAmount || 0);
        
        // Update reservation order total using Stripe actual amounts when available
        await db.reservationOrder.update({
          where: { id: reservation.reservationOrderId },
          data: {
            totalAmount: newFinalTotal,
            taxAmount: newTaxAmount,
            itemTaxAmount: newItemTaxAmount,
            addonTaxAmount: newAddonTaxAmount,
          },
        });
        console.debug("[ReservationService] modifyReservation totals", {
          reservationId: id,
          branchId: branchIdForPricing ?? "global",
          newFinalTotal,
          newTaxAmount,
          newItemTaxAmount,
          newAddonTaxAmount,
        });

        // Add history entry for order modification
        const oldItemCount = reservation.reservationOrder?.items?.length || 0;
        const newItemCount = updates.orderItems.length;
        const itemsChanged = oldItemCount !== newItemCount;
        
        await this.addHistoryEntry(reservation.reservationOrderId!, {
          type: "ORDER_MODIFIED",
          action: itemsChanged 
            ? `Order modified: ${oldItemCount} items → ${newItemCount} items`
            : "Order items updated",
          userId: updates.userId,
          details: {
            oldTotal: oldTotal,
            newTotal: newFinalTotal,
            priceDifference: priceDifference,
            oldItemCount,
            newItemCount,
            itemsAdded: priceDifference > 0 ? priceDifference : 0,
            itemsRemoved: priceDifference < 0 ? Math.abs(priceDifference) : 0,
            refundProcessed: priceDifference < 0,
            additionalPayment: priceDifference > 0 && hasNewPayment ? priceDifference : 0,
            incrementalPaymentIntentId: priceDifference > 0 && updates.paymentIntentId ? updates.paymentIntentId : null,
          },
        });

        // Handle payment difference if needed (for additional charges only, refunds are handled above)
        // Use incremental payment intents - create new payment intent for additional amount only
        // Only process payment if there's a significant price difference (more than 1 cent) to avoid rounding issues
        if (priceDifference > 0.01) {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2025-10-29.clover",
          });

          try {
            if (hasNewPayment && updates.paymentIntentId) {
              // Frontend created a new payment intent for the additional amount
              // Verify it matches the price difference (with small tolerance for rounding)
              const newPaymentIntent = await stripe.paymentIntents.retrieve(updates.paymentIntentId);
              const newPaymentAmount = newPaymentIntent.amount / 100;
              
              // Verify payment was successful
              if (newPaymentIntent.status !== "succeeded") {
                throw new Error(`Payment intent ${updates.paymentIntentId} is not succeeded. Status: ${newPaymentIntent.status}`);
              }
              
              // Allow small tolerance for rounding differences (within 1 cent)
              if (Math.abs(newPaymentAmount - priceDifference) > 0.01) {
                console.warn(`[ReservationService] Payment intent amount (${newPaymentAmount}) doesn't match price difference (${priceDifference}). Proceeding anyway.`);
              }
              
              // Link the incremental payment intent to the original via metadata
              await stripe.paymentIntents.update(updates.paymentIntentId, {
                metadata: {
                  ...newPaymentIntent.metadata,
                  reservationId: id,
                  parentPaymentIntentId: reservation.paymentIntentId || "",
                  isIncremental: "true",
                  incrementalAmount: priceDifference.toString(),
                },
              });
              
              // Get existing incremental payment intent IDs
              const existingIncrementalIds: string[] = reservation.incrementalPaymentIntentIds
                ? JSON.parse(reservation.incrementalPaymentIntentIds)
                : [];
              
              // Add new incremental payment intent ID
              const updatedIncrementalIds = [...existingIncrementalIds, updates.paymentIntentId];
              
              // Store updated incremental payment intent IDs
              updateData.incrementalPaymentIntentIds = JSON.stringify(updatedIncrementalIds);
              
              // Use the actual payment amount from Stripe instead of priceDifference
              // This ensures we show the exact amount that was charged
              const actualPaymentAmount = newPaymentAmount;
              
              
              // Add history entry for additional payment
              await this.addHistoryEntry(reservation.reservationOrderId!, {
                type: "PAYMENT_ADDED",
                action: `Additional payment processed: ${actualPaymentAmount.toFixed(2)} ${reservation.reservationOrder?.currency?.toUpperCase() || 'USD'}`,
                userId: updates.userId,
                details: {
                  incrementalPaymentIntentId: updates.paymentIntentId,
                  amount: actualPaymentAmount,
                  currency: reservation.reservationOrder?.currency?.toUpperCase() || 'USD',
                  totalIncrementalIntents: updatedIncrementalIds.length,
                },
              });
              
              // Update paidAmount to include the additional payment
              const newPaidAmount = currentPaidAmount + actualPaymentAmount;

              await db.reservationOrder.update({
                where: { id: reservation.reservationOrderId },
                data: {
                  paidAmount: newPaidAmount,
                },
              });
              
            } else if (priceDifference > 0 && reservation.paymentIntentId) {
              // No new payment provided - try to update original payment intent
              // This only works if payment intent is still modifiable (not succeeded)
              try {
                const originalPaymentIntent = await stripe.paymentIntents.retrieve(reservation.paymentIntentId);
                
                // Only update if payment intent is still modifiable
                if (["requires_payment_method", "requires_confirmation", "requires_action", "processing"].includes(originalPaymentIntent.status)) {
                  await stripe.paymentIntents.update(reservation.paymentIntentId, {
                    amount: Math.round(newFinalTotal * 100),
                  });
                  
                  // Update paidAmount to match the new total (since we updated the payment intent)
                  await db.reservationOrder.update({
                    where: { id: reservation.reservationOrderId },
                    data: {
                      paidAmount: newFinalTotal,
                    },
                  });
                } else {
                  // Payment intent is already succeeded - need incremental payment intent
                  throw new Error(`Payment intent ${reservation.paymentIntentId} is already ${originalPaymentIntent.status}. Cannot update. Frontend must create incremental payment intent.`);
                }
              } catch (updateError: any) {
                console.error("Stripe payment update error:", updateError);
                throw new Error(`Cannot add items without payment. Payment intent is not modifiable. Please create a new payment intent for the additional amount (${priceDifference}).`);
              }
            }
          } catch (stripeError: any) {
            console.error("Stripe payment handling error:", stripeError);
            const errorMessage = stripeError?.message || stripeError?.toString() || "Unknown error";
            throw new Error(`Failed to handle payment for additional items: ${errorMessage}`);
          }
        }
      }
    }

    // Update reservation
    // Final consistency: recompute paidAmount from Stripe (use new incremental IDs if we just added one)
    if (
      reservation.paymentIntentId &&
      reservation.reservationOrder?.payment?.paymentProvider === PaymentProvider.STRIPE
    ) {
      try {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: "2025-10-29.clover",
        });
        // Prefer newly updated incremental list if present in this modification
        const updatedIncrementalIds: string[] = updateData.incrementalPaymentIntentIds
          ? JSON.parse(updateData.incrementalPaymentIntentIds)
          : reservation.incrementalPaymentIntentIds
          ? JSON.parse(reservation.incrementalPaymentIntentIds)
          : [];

        const allPaymentIntentIds: string[] = [
          reservation.paymentIntentId,
          ...updatedIncrementalIds,
        ].filter(Boolean);
        let totalPaid = 0;
        let totalRefunded = 0;
        for (const pid of allPaymentIntentIds) {
          try {
            const pi = await stripe.paymentIntents.retrieve(pid);
            if (pi.status === "succeeded") {
              totalPaid += (pi.amount_received ?? pi.amount ?? 0) / 100;
            }
            const refunds = await stripe.refunds.list({ payment_intent: pid, limit: 100 });
            totalRefunded += refunds.data.reduce((sum, r) => {
              if (r.status === "succeeded" || r.status === "pending") {
                return sum + r.amount / 100;
              }
              return sum;
            }, 0);
          } catch (stripeErr) {
            console.warn("[ReservationService] Stripe reconciliation skipped for PI", pid, stripeErr);
          }
        }
        const reconciledPaid = Math.max(0, totalPaid - totalRefunded);
        await db.reservationOrder.update({
          where: { id: reservation.reservationOrderId! },
          data: { paidAmount: reconciledPaid },
        });
      } catch (reconErr) {
        console.warn("[ReservationService] Stripe reconciliation failed, keeping existing paidAmount", reconErr);
      }
    }

    const updatedReservation = await db.reservation.update({
      where: { id },
      data: updateData,
      include: {
        user: true,
        table: true,
        tables: {
          include: {
            table: true,
          },
        },
        reservationOrder: {
          include: {
            items: {
              include: {
                meal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
                addons: true,
                optionalIngredients: true,
              },
            },
            payment: true,
          },
        },
      },
    });
    
    try {
      // Calculate what changed for PRE_ORDER modifications
      let itemsAdded = 0;
      let itemsRemoved = 0;
      let modificationType = "GENERAL"; // GENERAL, ITEMS_ADDED, ITEMS_REMOVED, ITEMS_BOTH
      
      if (reservation.type === "PRE_ORDER" && updates.orderItems !== undefined && reservation.reservationOrder) {
        const oldItems = reservation.reservationOrder.items || [];
        const newItems = updates.orderItems || [];
        
        // Create maps to count total quantities by mealId + sizeType (not including quantity in key)
        // This allows us to detect when quantities change or items are completely removed
        const oldItemMap = new Map<string, number>();
        const newItemMap = new Map<string, number>();
        
        // Count old items (sum quantities for same meal+size)
        oldItems.forEach((item: any) => {
          const key = `${item.mealId}-${item.mealSizeType || 'default'}`;
          const currentCount = oldItemMap.get(key) || 0;
          oldItemMap.set(key, currentCount + (item.quantity || 1));
        });
        
        // Count new items (sum quantities for same meal+size)
        newItems.forEach((item: any) => {
          const key = `${item.mealId}-${item.mealSizeType || 'default'}`;
          const currentCount = newItemMap.get(key) || 0;
          newItemMap.set(key, currentCount + (item.quantity || 1));
        });
        
        // Calculate added items (items in new but not in old, or with increased quantity)
        let totalAdded = 0;
        newItemMap.forEach((newCount, key) => {
          const oldCount = oldItemMap.get(key) || 0;
          if (newCount > oldCount) {
            totalAdded += (newCount - oldCount);
          }
        });
        itemsAdded = totalAdded;
        
        // Calculate removed items (items in old but not in new, or with decreased quantity)
        let totalRemoved = 0;
        oldItemMap.forEach((oldCount, key) => {
          const newCount = newItemMap.get(key) || 0;
          if (oldCount > newCount) {
            totalRemoved += (oldCount - newCount);
          }
        });
        itemsRemoved = totalRemoved;
        
        // Also check for completely new items (different mealId/size combinations)
        const completelyNewItems = Array.from(newItemMap.keys()).filter(
          key => !oldItemMap.has(key)
        ).length;
        
        // Also check for completely removed items
        const completelyRemovedItems = Array.from(oldItemMap.keys()).filter(
          key => !newItemMap.has(key)
        ).length;
        
        // Determine modification type
        if ((itemsAdded > 0 || completelyNewItems > 0) && (itemsRemoved > 0 || completelyRemovedItems > 0)) {
          modificationType = "ITEMS_BOTH";
        } else if (itemsAdded > 0 || completelyNewItems > 0) {
          modificationType = "ITEMS_ADDED";
        } else if (itemsRemoved > 0 || completelyRemovedItems > 0) {
          modificationType = "ITEMS_REMOVED";
        }
        
      }
      
      const notification = await db.notification.create({
        data: {
          reservationId: id,
          type: "RESERVATION",
          isSeen: false,
          isOrderUpdate: false, // Mark as modification (not a new reservation)
          // Store modification details in metadata (we'll use a JSON field if available, or pass via WebSocket)
        },
      });

      // Fetch notification with full reservation details for WebSocket emission
      const notificationWithReservation = await db.notification.findUnique({
        where: { id: notification.id },
        include: {
          reservation: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      });

      if (!notificationWithReservation) {
        console.error(`[ReservationService] Failed to fetch notification with reservation details for ID: ${notification.id}`);
      }

      // Emit WebSocket events
      const wsService = WebSocketService.getInstance();
      
      // Emit to user if they have a userId
      if (updatedReservation.userId) {
        try {
          wsService.emitReservationStatusChange(
            updatedReservation.userId,
            updatedReservation
          );
        } catch (userError) {
          console.error(`[ReservationService] Error emitting to user:`, userError);
        }
      }
      
      // Emit reservation update to admin room
      try {
        wsService.emitReservationUpdate(updatedReservation);
      } catch (updateError) {
        console.error(`[ReservationService] Error emitting reservation-updated:`, updateError);
      }
      
      // Emit reservation modification notification to admin room with modification details
      // ALWAYS emit, even if notificationWithReservation fetch failed - use notification and updatedReservation directly
      try {
        
        // Pass modification details through the reservation object
        const reservationWithModificationDetails = {
          ...updatedReservation,
          _modificationDetails: {
            itemsAdded,
            itemsRemoved,
            modificationType,
          },
        };
        
        // Use notificationWithReservation if available, otherwise create a minimal notification object
        const notificationToEmit = notificationWithReservation || {
          ...notification,
          reservation: updatedReservation,
        };
        
        wsService.emitReservationModified(notificationToEmit, reservationWithModificationDetails);
      } catch (modifiedError) {
        console.error(`[ReservationService] Error emitting reservation-modified:`, modifiedError);
        // Try to emit with minimal data as fallback
        try {
          const minimalNotification = {
            id: notification.id,
            reservationId: id,
            type: "RESERVATION",
            isSeen: false,
            isOrderUpdate: false,
            createdAt: new Date(),
            reservation: updatedReservation,
          };
          const reservationWithModificationDetails = {
            ...updatedReservation,
            _modificationDetails: {
              itemsAdded,
              itemsRemoved,
              modificationType,
            },
          };
          wsService.emitReservationModified(minimalNotification, reservationWithModificationDetails);
        } catch (fallbackError) {
          console.error(`[ReservationService] Fallback emission also failed:`, fallbackError);
        }
      }
    } catch (error) {
      console.error("[ReservationService] Error creating notification or emitting WebSocket events for reservation modification:", error);
      console.error("[ReservationService] Error details:", error instanceof Error ? error.stack : error);
      // Still emit the update even if notification creation fails
      try {
        const wsService = WebSocketService.getInstance();
        if (updatedReservation.userId) {
          wsService.emitReservationStatusChange(
            updatedReservation.userId,
            updatedReservation
          );
        }
        wsService.emitReservationUpdate(updatedReservation);
      } catch (wsError) {
        console.error("Error emitting WebSocket events for reservation modification:", wsError);
      }
    }

    return updatedReservation;
  }
}

export default ReservationService;

