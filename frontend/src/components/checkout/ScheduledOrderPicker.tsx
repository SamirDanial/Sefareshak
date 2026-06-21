import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import Icon from "@mdi/react";
import { mdiCalendarClock, mdiClose, mdiCheck, mdiClock, mdiArrowRight, mdiLoading, mdiAlertCircle } from "@mdi/js";
import { cn } from "@/lib/utils";
import { ServingHoursService, type DeliveryHours } from "@/services/servingHoursService";
import { useBranch } from "@/contexts/BranchContext";
import ApiService from "@/services/apiService";

interface ScheduledOrderPickerProps {
  orderType: "PICKUP" | "DELIVERY";
  isEnabled: boolean;
  maxDays: number;
  timeSlotIntervalMinutes: number;
  scheduledDate: Date | null;
  onScheduledDateChange: (date: Date | null) => void;
  branchId?: string;
  className?: string;
}

interface TimePeriod {
  open: string;
  close: string;
}

export function ScheduledOrderPicker({
  orderType,
  isEnabled,
  maxDays,
  timeSlotIntervalMinutes,
  scheduledDate,
  onScheduledDateChange,
  branchId,
  className,
}: ScheduledOrderPickerProps) {
  const { t } = useTranslation();
  const { branch } = useBranch();
  const effectiveBranchId = branchId || branch?.id;
  const [isSchedulingFuture, setIsSchedulingFuture] = useState(!!scheduledDate);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    scheduledDate ? new Date(scheduledDate) : undefined
  );
  const [selectedTime, setSelectedTime] = useState<string | undefined>(
    scheduledDate
      ? formatTimeFrom24Hour(
          scheduledDate.getHours(),
          scheduledDate.getMinutes()
        )
      : undefined
  );

  useEffect(() => {
    const nextIsFuture = !!scheduledDate;
    setIsSchedulingFuture(nextIsFuture);

    if (!scheduledDate) {
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      return;
    }

    const nextDate = new Date(scheduledDate);
    if (isNaN(nextDate.getTime())) {
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      return;
    }

    setSelectedDate(nextDate);
    setSelectedTime(formatTimeFrom24Hour(nextDate.getHours(), nextDate.getMinutes()));
  }, [scheduledDate]);

  // Serving hours state
  const [servingHours, setServingHours] = useState<DeliveryHours | null>(null);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);
  
  // Time slot picker state
  const [isTimeSlotSheetOpen, setIsTimeSlotSheetOpen] = useState(false);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [timeSlotFilter, setTimeSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [slotUsage, setSlotUsage] = useState<Record<string, number>>({});
  const [maxOrdersPerSlot, setMaxOrdersPerSlot] = useState<number | null>(null);
  const [slotFeedback, setSlotFeedback] = useState<string | null>(null);

  // Fetch serving hours
  useEffect(() => {
    const fetchServingHours = async () => {
      try {
        setServingHoursLoading(true);
        if (!effectiveBranchId) {
          setServingHours(null);
          return;
        }

        const response = await ServingHoursService.getServingHours(effectiveBranchId);
        setServingHours(response.data.hours);
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      } finally {
        setServingHoursLoading(false);
      }
    };

    fetchServingHours();
  }, [effectiveBranchId]);

  // Get day name from date
  const getDayName = useCallback((date: Date): keyof DeliveryHours => {
    const days: (keyof DeliveryHours)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }, []);

  // Check if a date is off (closed) based on serving hours
  const isDateOff = useCallback((date: Date): boolean => {
    if (!servingHours) return false;
    const dayName = getDayName(date);
    const dayHours = servingHours[dayName] as any;
    return dayHours?.isOff === true;
  }, [servingHours, getDayName]);

  // Filter function for date picker - returns true if date should be enabled
  const filterDate = useCallback((date: Date): boolean => {
    // Don't filter if serving hours not loaded yet
    if (servingHoursLoading || !servingHours) return true;
    // Return false for off days (they should be disabled)
    return !isDateOff(date);
  }, [servingHoursLoading, servingHours, isDateOff]);

  // Generate time slots based on serving hours for a specific date
  const generateTimeSlots = useCallback((date: Date): string[] => {
    if (!servingHours) return [];
    
    const dayName = getDayName(date);
    const dayHours = servingHours[dayName] as any;
    
    if (!dayHours || dayHours.isOff) return [];

    const slots: string[] = [];
    const slotIntervalMinutes =
      typeof timeSlotIntervalMinutes === "number" && timeSlotIntervalMinutes > 0
        ? timeSlotIntervalMinutes
        : 30;

    // Check if there are multiple periods
    const periods: TimePeriod[] = [];
    if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
      periods.push(...dayHours.periods);
    } else if (dayHours.open && dayHours.close) {
      periods.push({ open: dayHours.open, close: dayHours.close });
    }

    if (periods.length === 0) return [];

    // Generate slots for each period
    for (const period of periods) {
      const startMinutes = parseTimeToMinutes(period.open);
      let endMinutes = parseTimeToMinutes(period.close);
      if (startMinutes === null || endMinutes === null) continue;

      // Support periods that end at 12:00 AM (midnight) like "3:00 PM - 12:00 AM".
      // In such cases, parseTimeToMinutes returns 0, but logically the close time is end-of-day.
      if (endMinutes === 0 && startMinutes > 0) {
        endMinutes = 24 * 60;
      }

      if (endMinutes <= startMinutes) continue;

      // Use a bounded loop to avoid any chance of infinite loops.
      // Max iterations for 30-min interval in one day = 48.
      const maxIterations = Math.ceil((endMinutes - startMinutes) / slotIntervalMinutes) + 2;
      let iterations = 0;

      for (let t = startMinutes; t < endMinutes; t += slotIntervalMinutes) {
        iterations += 1;
        if (iterations > maxIterations) break;
        slots.push(minutesToHHMM(t));
      }
    }

    // Filter out past time slots if selecting today
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes() + 60; // Add 1 hour buffer
      return slots.filter(slot => {
        const [h, m] = slot.split(':').map(Number);
        return h * 60 + m >= currentTimeMinutes;
      });
    }

    return slots;
  }, [servingHours, getDayName]);

  // Update time slots when date changes
  useEffect(() => {
    if (selectedDate) {
      setLoadingTimeSlots(true);
      const canGenerateSlots = !servingHoursLoading && !!servingHours;
      const slots = canGenerateSlots ? generateTimeSlots(selectedDate) : [];
      setAvailableTimeSlots(slots);
      setLoadingTimeSlots(false);
    } else {
      setAvailableTimeSlots([]);
      setSlotUsage({});
      setMaxOrdersPerSlot(null);
    }
  }, [selectedDate, generateTimeSlots, servingHoursLoading, servingHours]);

  // Fetch slot usage when date changes (for capacity limits)
  useEffect(() => {
    const run = async () => {
      try {
        if (!selectedDate || !effectiveBranchId) {
          setSlotUsage({});
          setMaxOrdersPerSlot(null);
          return;
        }

        const yyyy = selectedDate.getFullYear();
        const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const dd = String(selectedDate.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const api = ApiService.getInstance();
        const response = await api.get(
          `/api/user/orders/scheduled-slot-usage?date=${encodeURIComponent(dateStr)}&branchId=${encodeURIComponent(
            effectiveBranchId
          )}&orderType=${encodeURIComponent(orderType)}`
        );

        setSlotUsage((response as any)?.data?.slots || {});
        setMaxOrdersPerSlot((response as any)?.data?.maxOrdersPerSlot ?? null);
      } catch (error) {
        console.error("Error fetching scheduled slot usage:", error);
        setSlotUsage({});
        setMaxOrdersPerSlot(null);
      }
    };

    run();
  }, [selectedDate, effectiveBranchId, orderType]);

  // Time slot grouping helper
  type TimeSlotPeriod = 'morning' | 'afternoon' | 'evening';
  
  const getTimeSlotPeriod = (time: string): TimeSlotPeriod => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    return 'evening';
  };
  
  const groupedTimeSlots = useMemo(() => {
    const groups: Record<TimeSlotPeriod | 'all', string[]> = {
      all: availableTimeSlots,
      morning: [],
      afternoon: [],
      evening: []
    };
    
    availableTimeSlots.forEach(time => {
      const period = getTimeSlotPeriod(time);
      groups[period].push(time);
    });
    
    return groups;
  }, [availableTimeSlots]);
  
  const filteredTimeSlots = timeSlotFilter === 'all' 
    ? availableTimeSlots 
    : groupedTimeSlots[timeSlotFilter];

  // Calculate min and max dates
  const minDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const maxDate = useMemo(() => {
    const max = new Date();
    max.setDate(max.getDate() + maxDays);
    max.setHours(23, 59, 59, 999);
    return max;
  }, [maxDays]);

  // Determine if today is the only option (maxDays === 0)
  const isTodayOnly = maxDays === 0;

  // Handle date selection
  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedTime(undefined); // Reset time when date changes
    if (date) {
      // Open time slot picker after selecting date
      setTimeout(() => setIsTimeSlotSheetOpen(true), 300);
    } else {
      onScheduledDateChange(null);
    }
  };

  // Handle time slot selection
  const handleTimeSlotSelect = (time24: string) => {
    setSlotFeedback(null);

    if (maxOrdersPerSlot !== null) {
      const used = slotUsage?.[time24] || 0;
      if (used >= maxOrdersPerSlot) {
        setSlotFeedback(t("checkout.scheduledOrder.slotFull"));
        return;
      }
    }

    const time12 = formatTimeFrom24Hour(
      parseInt(time24.split(':')[0]),
      parseInt(time24.split(':')[1])
    );
    setSelectedTime(time12);
    setIsTimeSlotSheetOpen(false);
    
    if (selectedDate) {
      const combined = combineDateAndTime(selectedDate, time12);
      onScheduledDateChange(combined);
    }
  };

  // Toggle between ASAP and scheduled
  const handleToggleScheduling = () => {
    if (isSchedulingFuture) {
      // Switch to ASAP
      setIsSchedulingFuture(false);
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      onScheduledDateChange(null);
    } else {
      // Switch to scheduled
      setIsSchedulingFuture(true);
    }
  };

  // Format 24h time to 12h display
  const formatTime12h = (time24: string): string => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    let displayHour = h % 12;
    if (displayHour === 0) displayHour = 12;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Icon path={mdiCalendarClock} size={0.83} className="text-pink-500" />
        <Label className="text-base font-semibold">
          {t("checkout.scheduledOrder.title")}
        </Label>
      </div>

      {/* ASAP vs Scheduled Toggle */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "flex-1 border border-border",
            !isSchedulingFuture &&
              "bg-pink-500 hover:bg-pink-600 text-white border-pink-500"
          )}
          onClick={() => {
            if (isSchedulingFuture) {
              handleToggleScheduling();
            }
          }}
        >
          <Icon
            path={!isSchedulingFuture ? mdiCheck : mdiClose}
            size={0.67}
            className="mr-2"
          />
          {t("checkout.scheduledOrder.asap")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "flex-1 border border-border",
            isSchedulingFuture &&
              "bg-pink-500 hover:bg-pink-600 text-white border-pink-500"
          )}
          onClick={() => {
            if (!isSchedulingFuture) {
              handleToggleScheduling();
            }
          }}
          disabled={isTodayOnly || !isEnabled}
        >
          <Icon
            path={isSchedulingFuture ? mdiCheck : mdiCalendarClock}
            size={0.67}
            className="mr-2"
          />
          {t("checkout.scheduledOrder.scheduleFuture")}
        </Button>
      </div>

      {/* Date and Time Selection */}
      {isSchedulingFuture && isEnabled && (
        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {t("checkout.scheduledOrder.selectDateTimeDescription", {
              maxDays: maxDays,
              orderType: orderType === "PICKUP" 
                ? t("checkout.scheduledOrder.pickup").toLowerCase() 
                : t("checkout.scheduledOrder.delivery").toLowerCase(),
            })}
          </p>
          
          {/* Date Picker */}
          <div className="space-y-2">
            <Label>{t("checkout.scheduledOrder.date")}</Label>
            <DatePicker
              date={selectedDate}
              onDateChange={handleDateChange}
              minDate={minDate}
              maxDate={maxDate}
              placeholder={t("checkout.scheduledOrder.selectDate")}
              className="w-full"
              filterDate={filterDate}
            />
          </div>

          {/* Time Slot Selection - Trigger Button */}
          {selectedDate && (
            <div className="space-y-2">
              <Label className="text-sm">{t("checkout.scheduledOrder.time")}</Label>
              <button
                type="button"
                onClick={() => setIsTimeSlotSheetOpen(true)}
                disabled={loadingTimeSlots}
                className={`w-full p-4 rounded-lg border text-left transition-all flex items-center justify-between ${
                  selectedTime
                    ? "border-pink-500 bg-pink-500/10"
                    : "border-border hover:border-pink-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${selectedTime ? "bg-pink-500" : "bg-muted"}`}>
                    {loadingTimeSlots ? (
                      <Icon path={mdiLoading} size={0.83} className="text-white animate-spin" />
                    ) : (
                      <Icon path={mdiClock} size={0.83} className={selectedTime ? "text-white" : "text-muted-foreground"} />
                    )}
                  </div>
                  <div>
                    {selectedTime ? (
                      <>
                        <div className="font-medium text-foreground">{selectedTime}</div>
                        <div className="text-xs text-pink-500">
                          {t("checkout.scheduledOrder.tapToChange") || "Tap to change"}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-muted-foreground">
                          {loadingTimeSlots 
                            ? (t("checkout.scheduledOrder.loadingTimeSlots") || "Loading time slots...")
                            : (t("checkout.scheduledOrder.tapToSelectTime") || "Tap to select a time")}
                        </div>
                        {!loadingTimeSlots && availableTimeSlots.length > 0 && (
                          <div className="text-xs text-pink-500">
                            {t("checkout.scheduledOrder.slotsAvailable", { count: availableTimeSlots.length }) || `${availableTimeSlots.length} slots available`}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <Icon path={mdiArrowRight} size={0.67} className="text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Summary */}
          {selectedDate && selectedTime && (
            <div className="bg-pink-50 dark:bg-pink-500/10 rounded-lg p-3 border border-pink-200 dark:border-pink-500/30">
              <p className="text-sm text-pink-700 dark:text-pink-300 font-medium">
                {t("checkout.scheduledOrder.summary", {
                  date: selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }),
                  time: selectedTime,
                  orderType: orderType === "PICKUP" 
                    ? t("checkout.scheduledOrder.pickup") 
                    : t("checkout.scheduledOrder.delivery"),
                })}
              </p>
            </div>
          )}
        </div>
      )}

      {isTodayOnly && !isSchedulingFuture && (
        <p className="text-xs text-muted-foreground">
          {t("checkout.scheduledOrder.todayOnly")}
        </p>
      )}

      {/* Time Slot Selection Bottom Sheet */}
      <Sheet open={isTimeSlotSheetOpen} onOpenChange={setIsTimeSlotSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[70vh] bg-background border-t border-border rounded-t-3xl p-0 pt-8 flex flex-col overflow-hidden"
        >
          <SheetHeader className="px-4 pb-4 border-b border-border shrink-0">
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon path={mdiClock} size={0.83} className="text-pink-500" />
                <span>{t("checkout.scheduledOrder.selectTimeSlot") || "Select Time Slot"}</span>
              </div>
              {selectedTime && (
                <Badge className="bg-pink-500 text-white">
                  {selectedTime}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          
          {loadingTimeSlots ? (
            <div className="flex items-center justify-center py-16">
              <Icon path={mdiLoading} size={1.5} className="animate-spin text-pink-500" />
            </div>
          ) : availableTimeSlots.length === 0 ? (
            <div className="p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-full bg-muted p-4">
                  <Icon path={mdiAlertCircle} size={1.5} className="text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("checkout.scheduledOrder.noTimeSlots") || "No Time Slots Available"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {t("checkout.scheduledOrder.noTimeSlotsDescription") || "There are no available time slots for"}{" "}
                    <strong className="text-foreground">
                      {selectedDate?.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </strong>
                    .
                  </p>
                  <div className="pt-2 space-y-1 text-xs text-muted-foreground">
                    <p>{t("checkout.scheduledOrder.pleaseTry") || "Please try:"}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t("checkout.scheduledOrder.tryDifferentDate") || "Selecting a different date"}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Time Period Tabs */}
              <div className="px-4 py-3 border-b border-border">
                <div className="relative bg-muted rounded-xl p-1">
                  {/* Sliding Indicator */}
                  <div 
                    className="absolute top-1 bottom-1 bg-pink-500 rounded-lg transition-all duration-300 ease-out"
                    style={{
                      width: 'calc(25% - 2px)',
                      left: `calc(${(['all', 'morning', 'afternoon', 'evening'] as const).indexOf(timeSlotFilter)} * 25% + 2px)`,
                    }}
                  />
                  
                  {/* Tab Buttons */}
                  <div className="relative flex">
                    {(['all', 'morning', 'afternoon', 'evening'] as const).map((period) => {
                      const count = period === 'all' ? availableTimeSlots.length : groupedTimeSlots[period].length;
                      const labels: Record<typeof period, string> = {
                        all: t("checkout.scheduledOrder.allTimes") || "All",
                        morning: t("checkout.scheduledOrder.morning") || "Morning",
                        afternoon: t("checkout.scheduledOrder.afternoon") || "Afternoon",
                        evening: t("checkout.scheduledOrder.evening") || "Evening"
                      };
                      const isDisabled = period !== 'all' && count === 0;
                      const isActive = timeSlotFilter === period;
                      
                      return (
                        <button
                          key={period}
                          type="button"
                          onClick={() => !isDisabled && setTimeSlotFilter(period)}
                          disabled={isDisabled}
                          className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors duration-200 rounded-lg z-10 ${
                            isActive
                              ? "text-white"
                              : isDisabled
                              ? "text-muted-foreground/50 cursor-not-allowed"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span>{labels[period]}</span>
                            <span className={`text-[10px] ${isActive ? "text-white/80" : "text-muted-foreground/70"}`}>
                              ({count})
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Time Slots Grid */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {slotFeedback && (
                  <div className="mb-3 text-sm text-red-600 dark:text-red-400">
                    {slotFeedback}
                  </div>
                )}
                {filteredTimeSlots.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t("checkout.scheduledOrder.noSlotsInPeriod") || "No slots available in this period"}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {filteredTimeSlots.map((time) => {
                      const time12 = formatTime12h(time);
                      const isSelected =
                        !!selectedTime && convertTo24Hour(selectedTime) === time;
                      const used = slotUsage?.[time] || 0;
                      const isFull = maxOrdersPerSlot !== null && used >= maxOrdersPerSlot;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => handleTimeSlotSelect(time)}
                          disabled={isFull}
                          className={`p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                            isSelected
                              ? "bg-pink-500 text-white border-pink-500 shadow-lg shadow-pink-500/30"
                              : isFull
                              ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                              : "border-border bg-card text-foreground hover:border-pink-400 hover:bg-muted"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {isSelected && (
                              <div className="h-2 w-2 rounded-full bg-white" />
                            )}
                            {time12}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Helper functions
function formatTimeFrom24Hour(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) {
    displayHours = 12;
  }
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function combineDateAndTime(date: Date, timeStr: string): Date {
  const result = new Date(date);
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (hours === 12) {
      hours = period === "AM" ? 0 : 12;
    } else if (period === "PM") {
      hours += 12;
    }

    result.setHours(hours, minutes, 0, 0);
  }
  return result;
}

function parseTimeToMinutes(timeStr: string): number | null {
  const trimmed = String(timeStr || "").trim();
  if (!trimmed) return null;

  // 24h: HH:mm
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  // 12h: h:mm AM/PM
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const period = match12[3].toUpperCase();
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (h === 12) {
      h = period === "AM" ? 0 : 12;
    } else if (period === "PM") {
      h += 12;
    }
    return h * 60 + m;
  }

  return null;
}

function minutesToHHMM(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function convertTo24Hour(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (hours === 12) {
      hours = period === "AM" ? 0 : 12;
    } else if (period === "PM") {
      hours += 12;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  return timeStr;
}

export default ScheduledOrderPicker;

