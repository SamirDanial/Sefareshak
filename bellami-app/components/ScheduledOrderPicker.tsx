import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import servingHoursService, {
  type DeliveryHours,
} from "@/src/services/servingHoursService";
import ApiService from "@/src/services/apiService";

interface ScheduledOrderPickerProps {
  orderType: "PICKUP" | "DELIVERY";
  isEnabled: boolean;
  maxDays: number;
  timeSlotIntervalMinutes: number;
  scheduledDate: Date | null;
  onScheduledDateChange: (date: Date | null) => void;
  branchId?: string;
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
}: ScheduledOrderPickerProps) {
  const { t } = useTranslation();
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

  // Date picker state
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  
  // Time slot picker state
  const [showTimeSlotModal, setShowTimeSlotModal] = useState(false);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [timeSlotFilter, setTimeSlotFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [slotUsage, setSlotUsage] = useState<Record<string, number>>({});
  const [maxOrdersPerSlot, setMaxOrdersPerSlot] = useState<number | null>(null);
  const [slotFeedback, setSlotFeedback] = useState<string | null>(null);

  // Serving hours state
  const [servingHours, setServingHours] = useState<DeliveryHours | null>(null);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);

  // Sync external scheduledDate changes
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

  // Fetch serving hours
  useEffect(() => {
    const fetchServingHours = async () => {
      try {
        setServingHoursLoading(true);
        if (!branchId) {
          setServingHours(null);
          return;
        }

        const response = await servingHoursService.getServingHours(branchId);
        setServingHours(response.data?.hours || null);
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      } finally {
        setServingHoursLoading(false);
      }
    };

    fetchServingHours();
  }, [branchId]);

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
  }, [servingHours, getDayName, timeSlotIntervalMinutes]);

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
        if (!selectedDate || !branchId) {
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
            branchId
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
  }, [selectedDate, branchId, orderType]);

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

  const toCalendarDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Generate marked dates for calendar (disabled days + selected day)
  const markedDates = useMemo(() => {
    const marks: Record<string, { disabled?: boolean; disableTouchEvent?: boolean; selected?: boolean; selectedColor?: string }> = {};
    
    // Mark closed days as disabled
    if (servingHours && !servingHoursLoading) {
      const current = new Date(minDate);
      while (current <= maxDate) {
        if (isDateOff(current)) {
          const dateStr = toCalendarDateString(current);
          marks[dateStr] = { disabled: true, disableTouchEvent: true };
        }
        current.setDate(current.getDate() + 1);
      }
    }
    
    // Mark selected date
    if (selectedDate) {
      const selectedStr = toCalendarDateString(selectedDate);
      marks[selectedStr] = { 
        ...marks[selectedStr],
        selected: true, 
        selectedColor: "#ec4899" 
      };
    }
    
    return marks;
  }, [servingHours, servingHoursLoading, minDate, maxDate, selectedDate, isDateOff]);

  // Handle time slot selection
  const handleTimeSlotSelect = (time24: string) => {
    setSlotFeedback(null);

    if (maxOrdersPerSlot !== null) {
      const used = slotUsage?.[time24] || 0;
      if (used >= maxOrdersPerSlot) {
        setSlotFeedback(t("checkout.scheduledOrder.slotFull", "This slot is full"));
        return;
      }
    }

    const time12 = formatTimeFrom24Hour(
      parseInt(time24.split(':')[0]),
      parseInt(time24.split(':')[1])
    );
    setSelectedTime(time12);
    setShowTimeSlotModal(false);
    
    if (selectedDate) {
      const combined = combineDateAndTime(selectedDate, time12);
      onScheduledDateChange(combined);
    }
  };

  // Toggle between ASAP and scheduled
  const handleToggleScheduling = (scheduleMode: boolean) => {
    if (!scheduleMode) {
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

  if (!isEnabled) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="calendar-clock" size={20} color="#ec4899" />
        <Text style={styles.headerText}>
          {t("checkout.scheduledOrder.title", "Schedule Order")}
        </Text>
      </View>

      {/* ASAP vs Scheduled Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            !isSchedulingFuture && styles.toggleButtonSelected,
          ]}
          onPress={() => handleToggleScheduling(false)}
        >
          <MaterialIcons 
            name={!isSchedulingFuture ? "check" : "close"} 
            size={16} 
            color={!isSchedulingFuture ? "#fff" : "#9ca3af"} 
          />
          <Text style={[
            styles.toggleButtonText,
            !isSchedulingFuture && styles.toggleButtonTextSelected,
          ]}>
            {t("checkout.scheduledOrder.asap", "ASAP")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            isSchedulingFuture && styles.toggleButtonSelected,
            (isTodayOnly || !isEnabled) && styles.toggleButtonDisabled,
          ]}
          onPress={() => handleToggleScheduling(true)}
          disabled={isTodayOnly || !isEnabled}
        >
          <MaterialCommunityIcons 
            name={isSchedulingFuture ? "check" : "calendar-clock"} 
            size={16} 
            color={isSchedulingFuture ? "#fff" : "#9ca3af"} 
          />
          <Text style={[
            styles.toggleButtonText,
            isSchedulingFuture && styles.toggleButtonTextSelected,
            (isTodayOnly || !isEnabled) && styles.toggleButtonTextDisabled,
          ]}>
            {t("checkout.scheduledOrder.scheduleFuture", "Schedule")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date and Time Selection */}
      {isSchedulingFuture && (
        <View style={styles.schedulingSection}>
          <Text style={styles.description}>
            {t("checkout.scheduledOrder.selectDateTimeDescription", {
              maxDays: maxDays,
              orderType: orderType === "PICKUP" 
                ? t("checkout.scheduledOrder.pickup", "pickup").toLowerCase() 
                : t("checkout.scheduledOrder.delivery", "delivery").toLowerCase(),
              defaultValue: `Schedule your ${orderType.toLowerCase()} up to ${maxDays} days in advance`,
            })}
          </Text>
          
          {/* Date Picker Button */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {t("checkout.scheduledOrder.date", "Date")}
            </Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setDatePickerVisible(true)}
            >
              <MaterialCommunityIcons name="calendar" size={20} color="#ec4899" />
              <Text style={styles.pickerButtonText}>
                {selectedDate
                  ? selectedDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : t("checkout.scheduledOrder.selectDate", "Select a date")}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Date Picker Bottom Sheet (matches reservation page UX) */}
          <Modal
            visible={datePickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setDatePickerVisible(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setDatePickerVisible(false)}
            >
              <Pressable
                style={styles.dateModalContent}
                onPress={() => {
                  // prevent closing when tapping the sheet content
                }}
              >
                <View style={styles.dateModalHeader}>
                  <Text style={styles.dateModalTitle}>
                    {t("checkout.scheduledOrder.selectDate", "Select a date")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDatePickerVisible(false)}
                    style={styles.modalCloseButton}
                  >
                    <MaterialCommunityIcons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Calendar
                  current={toCalendarDateString(selectedDate || new Date())}
                  minDate={toCalendarDateString(minDate)}
                  maxDate={toCalendarDateString(maxDate)}
                  markedDates={markedDates}
                  onDayPress={(day) => {
                    const next = new Date(day.dateString);
                    if (isNaN(next.getTime())) return;

                    if (isDateOff(next)) {
                      setSlotFeedback(
                        t("checkout.scheduledOrder.dateOff", "This day is closed")
                      );
                      return;
                    }

                    setSlotFeedback(null);
                    setSelectedDate(next);
                    setSelectedTime(undefined);
                    onScheduledDateChange(next);
                    setDatePickerVisible(false);
                    // Auto-open time slot picker after date selection (like React frontend)
                    setTimeout(() => setShowTimeSlotModal(true), 300);
                  }}
                  theme={{
                    backgroundColor: "#1a1a1a",
                    calendarBackground: "#1a1a1a",
                    textSectionTitleColor: "#9ca3af",
                    selectedDayBackgroundColor: "#ec4899",
                    selectedDayTextColor: "#ffffff",
                    todayTextColor: "#ec4899",
                    dayTextColor: "#ffffff",
                    textDisabledColor: "#374151",
                    monthTextColor: "#ffffff",
                    arrowColor: "#ec4899",
                  }}
                />
              </Pressable>
            </Pressable>
          </Modal>

          {/* Time Slot Selection Button */}
          {selectedDate && (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                {t("checkout.scheduledOrder.time", "Time")}
              </Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  selectedTime && styles.pickerButtonSelected,
                ]}
                onPress={() => setShowTimeSlotModal(true)}
                disabled={loadingTimeSlots}
              >
                {loadingTimeSlots ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <MaterialCommunityIcons 
                    name="clock-outline" 
                    size={20} 
                    color={selectedTime ? "#ec4899" : "#9ca3af"} 
                  />
                )}
                <View style={styles.pickerButtonContent}>
                  {selectedTime ? (
                    <>
                      <Text style={styles.pickerButtonTextSelected}>{selectedTime}</Text>
                      <Text style={styles.pickerButtonSubtext}>
                        {t("checkout.scheduledOrder.tapToChange", "Tap to change")}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.pickerButtonText}>
                        {loadingTimeSlots 
                          ? t("checkout.scheduledOrder.loadingTimeSlots", "Loading...")
                          : t("checkout.scheduledOrder.tapToSelectTime", "Select a time")}
                      </Text>
                      {!loadingTimeSlots && availableTimeSlots.length > 0 && (
                        <Text style={styles.pickerButtonSubtextPink}>
                          {t("checkout.scheduledOrder.slotsAvailable", {
                            count: availableTimeSlots.length,
                            defaultValue: `${availableTimeSlots.length} slots available`,
                          })}
                        </Text>
                      )}
                    </>
                  )}
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          )}

          {/* Summary */}
          {selectedDate && selectedTime && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>
                {t("checkout.scheduledOrder.summary", {
                  date: selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }),
                  time: selectedTime,
                  orderType: orderType === "PICKUP" 
                    ? t("checkout.scheduledOrder.pickup", "Pickup") 
                    : t("checkout.scheduledOrder.delivery", "Delivery"),
                  defaultValue: `Your order will be ready for ${orderType.toLowerCase()} on ${selectedDate.toLocaleDateString()} at ${selectedTime}`,
                })}
              </Text>
            </View>
          )}
        </View>
      )}

      {isTodayOnly && !isSchedulingFuture && (
        <Text style={styles.todayOnlyText}>
          {t("checkout.scheduledOrder.todayOnly", "Only same-day orders are available")}
        </Text>
      )}

      {/* Time Slot Selection Modal */}
      <Modal
        visible={showTimeSlotModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTimeSlotModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <MaterialCommunityIcons name="clock-outline" size={20} color="#ec4899" />
                <Text style={styles.modalTitle}>
                  {t("checkout.scheduledOrder.selectTimeSlot", "Select Time Slot")}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTimeSlotModal(false)}>
                <MaterialIcons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {loadingTimeSlots ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ec4899" />
              </View>
            ) : availableTimeSlots.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyTitle}>
                  {t("checkout.scheduledOrder.noTimeSlots", "No Time Slots Available")}
                </Text>
                <Text style={styles.emptyDescription}>
                  {t("checkout.scheduledOrder.noTimeSlotsDescription", "No slots available for this date")}
                </Text>
              </View>
            ) : (
              <>
                {/* Time Period Filter */}
                <View style={styles.filterContainer}>
                  {(['all', 'morning', 'afternoon', 'evening'] as const).map((period) => {
                    const count = period === 'all' ? availableTimeSlots.length : groupedTimeSlots[period].length;
                    const labels: Record<typeof period, string> = {
                      all: t("checkout.scheduledOrder.allTimes", "All"),
                      morning: t("checkout.scheduledOrder.morning", "Morning"),
                      afternoon: t("checkout.scheduledOrder.afternoon", "Afternoon"),
                      evening: t("checkout.scheduledOrder.evening", "Evening"),
                    };
                    const isDisabled = period !== 'all' && count === 0;
                    const isActive = timeSlotFilter === period;
                    
                    return (
                      <TouchableOpacity
                        key={period}
                        style={[
                          styles.filterButton,
                          isActive && styles.filterButtonActive,
                          isDisabled && styles.filterButtonDisabled,
                        ]}
                        onPress={() => !isDisabled && setTimeSlotFilter(period)}
                        disabled={isDisabled}
                      >
                        <Text style={[
                          styles.filterButtonText,
                          isActive && styles.filterButtonTextActive,
                          isDisabled && styles.filterButtonTextDisabled,
                        ]}>
                          {labels[period]}
                        </Text>
                        <Text style={[
                          styles.filterButtonCount,
                          isActive && styles.filterButtonCountActive,
                        ]}>
                          ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Slot Feedback */}
                {slotFeedback && (
                  <Text style={styles.feedbackText}>{slotFeedback}</Text>
                )}

                {/* Time Slots Grid */}
                <ScrollView style={styles.slotsScrollView} showsVerticalScrollIndicator={false}>
                  {filteredTimeSlots.length === 0 ? (
                    <Text style={styles.noSlotsText}>
                      {t("checkout.scheduledOrder.noSlotsInPeriod", "No slots in this period")}
                    </Text>
                  ) : (
                    <View style={styles.slotsGrid}>
                      {filteredTimeSlots.map((time) => {
                        const time12 = formatTime12h(time);
                        const isSelected =
                          !!selectedTime && convertTo24Hour(selectedTime) === time;
                        const used = slotUsage?.[time] || 0;
                        const isFull = maxOrdersPerSlot !== null && used >= maxOrdersPerSlot;
                        
                        return (
                          <TouchableOpacity
                            key={time}
                            style={[
                              styles.slotButton,
                              isSelected && styles.slotButtonSelected,
                              isFull && styles.slotButtonFull,
                            ]}
                            onPress={() => handleTimeSlotSelect(time)}
                            disabled={isFull}
                          >
                            {isSelected && (
                              <View style={styles.slotSelectedDot} />
                            )}
                            <Text style={[
                              styles.slotButtonText,
                              isSelected && styles.slotButtonTextSelected,
                              isFull && styles.slotButtonTextFull,
                            ]}>
                              {time12}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
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

  // Normalize spaces so we can handle strings like "12: 00 PM".
  // - remove spaces around ':'
  // - collapse multiple spaces
  const normalized = trimmed
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, " ")
    .trim();

  // 24h: HH:mm
  const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  // 12h: h:mm AM/PM
  const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  headerText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  toggleContainer: {
    flexDirection: "row",
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#262626",
  },
  toggleButtonSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.15)",
  },
  toggleButtonDisabled: {
    opacity: 0.5,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9ca3af",
  },
  toggleButtonTextSelected: {
    color: "#ec4899",
  },
  toggleButtonTextDisabled: {
    color: "#6b7280",
  },
  schedulingSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  description: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#262626",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  pickerButtonSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  pickerButtonContent: {
    flex: 1,
  },
  pickerButtonText: {
    fontSize: 15,
    color: "#9ca3af",
  },
  pickerButtonTextSelected: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  pickerButtonSubtext: {
    fontSize: 12,
    color: "#ec4899",
    marginTop: 2,
  },
  pickerButtonSubtextPink: {
    fontSize: 12,
    color: "#ec4899",
    marginTop: 2,
  },
  summaryBox: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
    marginTop: 8,
  },
  summaryText: {
    fontSize: 14,
    color: "#ec4899",
    fontWeight: "500",
  },
  todayOnlyText: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  dateModalContent: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    maxHeight: "80%",
  },
  dateModalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  loadingContainer: {
    padding: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginTop: 16,
  },
  emptyDescription: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  filterButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#262626",
  },
  filterButtonActive: {
    backgroundColor: "#ec4899",
  },
  filterButtonDisabled: {
    opacity: 0.5,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
  },
  filterButtonTextActive: {
    color: "#fff",
  },
  filterButtonTextDisabled: {
    color: "#6b7280",
  },
  filterButtonCount: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
  },
  filterButtonCountActive: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  feedbackText: {
    fontSize: 14,
    color: "#ef4444",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  slotsScrollView: {
    padding: 16,
  },
  noSlotsText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 24,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  slotButton: {
    width: "30%",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
    backgroundColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  slotButtonSelected: {
    borderColor: "#ec4899",
    backgroundColor: "#ec4899",
  },
  slotButtonFull: {
    opacity: 0.5,
    borderColor: "#333",
    backgroundColor: "#1a1a1a",
  },
  slotSelectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  slotButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  slotButtonTextSelected: {
    color: "#fff",
  },
  slotButtonTextFull: {
    color: "#6b7280",
  },
});

export default ScheduledOrderPicker;
