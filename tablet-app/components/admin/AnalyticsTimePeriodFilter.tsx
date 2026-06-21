import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type TimePeriodType =
  | "yearly"
  | "monthly"
  | "weekly"
  | "daily"
  | "custom";

export interface TimePeriod {
  type: TimePeriodType;
  startDate: Date;
  endDate: Date;
  label: string;
  year?: number;
  month?: number;
  week?: number;
}

interface AnalyticsTimePeriodFilterProps {
  selectedPeriod: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

const AnalyticsTimePeriodFilter: React.FC<AnalyticsTimePeriodFilterProps> = ({
  selectedPeriod,
  onPeriodChange,
}) => {
  const { t } = useTranslation();
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCustomStartDatePicker, setShowCustomStartDatePicker] =
    useState(false);
  const [showCustomEndDatePicker, setShowCustomEndDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(
    selectedPeriod.type === "custom" ? selectedPeriod.startDate : undefined
  );
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(
    selectedPeriod.type === "custom" ? selectedPeriod.endDate : undefined
  );

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentDate = new Date();

  const formatDateForLabel = (date: Date): string => {
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return `${day}-${month}`;
  };

  // Generate years (10 years from now to past - descending order)
  const generateYears = (): number[] => {
    const years = [];
    for (let i = 0; i <= 10; i++) {
      years.push(currentYear - i);
    }
    return years;
  };

  // Generate months
  const generateMonths = (
    selectedYear?: number
  ): Array<{ value: number; label: string }> => {
    const months = [];
    const year = selectedYear ?? currentYear;
    const maxMonth = year === currentYear ? currentMonth : 11;

    for (let i = 0; i <= maxMonth; i++) {
      const monthIndex = maxMonth - i;
      const date = new Date(2024, monthIndex, 1);
      months.push({
        value: monthIndex,
        label: date.toLocaleDateString("en-US", { month: "long" }),
      });
    }
    return months;
  };

  // Get weeks in a year
  const getWeeksInYear = (year: number): number => {
    const d = new Date(year, 0, 1);
    const isLeap = new Date(year, 1, 29).getMonth() === 1;
    return d.getDay() === 4 || (isLeap && d.getDay() === 3) ? 53 : 52;
  };

  // Get current week number
  const getCurrentWeek = (): number => {
    const date = new Date();
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor(
      (date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    return Math.ceil((days + startDate.getDay() + 1) / 7);
  };

  // Generate weeks for a year
  const generateWeeks = (year: number): number[] => {
    const weeks = [];
    const totalWeeks = getWeeksInYear(year);
    const currentWeek = getCurrentWeek();

    if (year === currentYear) {
      for (let i = currentWeek; i >= 1; i--) {
        weeks.push(i);
      }
    } else {
      for (let i = totalWeeks; i >= 1; i--) {
        weeks.push(i);
      }
    }
    return weeks;
  };

  // Get start and end of week
  const getWeekDates = (
    year: number,
    week: number
  ): { start: Date; end: Date } => {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    const ISOweekEnd = new Date(ISOweekStart);
    ISOweekEnd.setDate(ISOweekStart.getDate() + 6);
    ISOweekEnd.setHours(23, 59, 59, 999);
    return { start: ISOweekStart, end: ISOweekEnd };
  };

  const handleTypeChange = (type: TimePeriodType) => {
    let newPeriod: TimePeriod;

    switch (type) {
      case "yearly":
        newPeriod = {
          type: "yearly",
          startDate: new Date(currentYear, 0, 1),
          endDate: new Date(currentYear, 11, 31, 23, 59, 59, 999),
          label: `${currentYear}`,
          year: currentYear,
        };
        break;
      case "monthly":
        newPeriod = {
          type: "monthly",
          startDate: new Date(currentYear, currentMonth, 1),
          endDate: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999),
          label: `${new Date(currentYear, currentMonth, 1).toLocaleDateString(
            "en-US",
            {
              month: "long",
            }
          )} ${currentYear}`,
          year: currentYear,
          month: currentMonth,
        };
        break;
      case "weekly":
        const currentWeek = getCurrentWeek();
        const weekDates = getWeekDates(currentYear, currentWeek);
        newPeriod = {
          type: "weekly",
          startDate: weekDates.start,
          endDate: weekDates.end,
          label: `Week ${currentWeek}, ${currentYear}`,
          year: currentYear,
          week: currentWeek,
        };
        break;
      case "daily":
        const today = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate()
        );
        newPeriod = {
          type: "daily",
          startDate: today,
          endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
          label: today.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        };
        break;
      case "custom":
        if (selectedPeriod.type === "custom") {
          newPeriod = selectedPeriod;
        } else {
          const last30Days = new Date(
            currentDate.getTime() - 30 * 24 * 60 * 60 * 1000
          );
          newPeriod = {
            type: "custom",
            startDate: last30Days,
            endDate: currentDate,
            label: `${formatDateForLabel(last30Days)} to ${formatDateForLabel(
              currentDate
            )}`,
          };
          setCustomStartDate(last30Days);
          setCustomEndDate(currentDate);
        }
        break;
      default:
        return;
    }

    onPeriodChange(newPeriod);
    setShowTypePicker(false);
  };

  const handleYearChange = (year: number) => {
    let newPeriod: TimePeriod;

    if (selectedPeriod.type === "yearly") {
      newPeriod = {
        ...selectedPeriod,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31, 23, 59, 59, 999),
        label: `${year}`,
        year,
      };
    } else if (selectedPeriod.type === "monthly") {
      const month = selectedPeriod.month ?? currentMonth;
      newPeriod = {
        ...selectedPeriod,
        startDate: new Date(year, month, 1),
        endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
        label: `${new Date(year, month, 1).toLocaleDateString("en-US", {
          month: "long",
        })} ${year}`,
        year,
      };
    } else if (selectedPeriod.type === "weekly") {
      const week = selectedPeriod.week ?? getCurrentWeek();
      const weekDates = getWeekDates(year, week);
      newPeriod = {
        ...selectedPeriod,
        startDate: weekDates.start,
        endDate: weekDates.end,
        label: `Week ${week}, ${year}`,
        year,
      };
    } else {
      return;
    }

    onPeriodChange(newPeriod);
    setShowYearPicker(false);
  };

  const handleMonthChange = (month: number) => {
    const year = selectedPeriod.year ?? currentYear;
    const newPeriod: TimePeriod = {
      ...selectedPeriod,
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
      label: `${new Date(year, month, 1).toLocaleDateString("en-US", {
        month: "long",
      })} ${year}`,
      year,
      month,
    };
    onPeriodChange(newPeriod);
    setShowMonthPicker(false);
  };

  const handleWeekChange = (week: number) => {
    const year = selectedPeriod.year ?? currentYear;
    const weekDates = getWeekDates(year, week);
    const newPeriod: TimePeriod = {
      ...selectedPeriod,
      startDate: weekDates.start,
      endDate: weekDates.end,
      label: `Week ${week}, ${year}`,
      year,
      week,
    };
    onPeriodChange(newPeriod);
    setShowWeekPicker(false);
  };

  const handleDailyDateChange = (date: Date) => {
    const startDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    const newPeriod: TimePeriod = {
      type: "daily",
      startDate,
      endDate,
      label: startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
    onPeriodChange(newPeriod);
    setShowDatePicker(false);
  };

  const handleCustomStartDateChange = (date: Date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    let end = customEndDate || selectedPeriod.endDate || new Date();
    end.setHours(23, 59, 59, 999);

    // If start date is after end date, adjust end date to be one day after start
    // But don't exceed current date
    if (start > end) {
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 59, 999);
      // Ensure end date doesn't exceed current date
      if (end > currentDate) {
        end = new Date(currentDate);
        end.setHours(23, 59, 59, 999);
      }
      setCustomEndDate(end);
    }

    setCustomStartDate(start);
    const newPeriod: TimePeriod = {
      type: "custom",
      startDate: start,
      endDate: end,
      label: `${formatDateForLabel(start)} to ${formatDateForLabel(end)}`,
    };

    onPeriodChange(newPeriod);
    setShowCustomStartDatePicker(false);
  };

  const handleCustomEndDateChange = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    let start = customStartDate || selectedPeriod.startDate || new Date();
    start.setHours(0, 0, 0, 0);

    // If end date is before start date, adjust start date to be one day before end
    if (end < start) {
      start = new Date(end);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      setCustomStartDate(start);
    }

    setCustomEndDate(end);
    const newPeriod: TimePeriod = {
      type: "custom",
      startDate: start,
      endDate: end,
      label: `${formatDateForLabel(start)} to ${formatDateForLabel(end)}`,
    };

    onPeriodChange(newPeriod);
    setShowCustomEndDatePicker(false);
  };

  const years = generateYears();
  const months = generateMonths(
    selectedPeriod.type === "monthly" ? selectedPeriod.year : undefined
  );
  const weeks =
    selectedPeriod.type === "weekly" && selectedPeriod.year
      ? generateWeeks(selectedPeriod.year)
      : generateWeeks(currentYear);

  // Simple date picker - generate days for a month
  const generateDaysForMonth = (year: number, month: number): Date[] => {
    const days: Date[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const maxDay =
      year === now.getFullYear() && month === now.getMonth()
        ? now.getDate()
        : daysInMonth;

    for (let day = maxDay; day >= 1; day--) {
      days.push(new Date(year, month, day));
    }
    return days;
  };

  const renderTypePicker = () => (
    <Modal
      visible={showTypePicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowTypePicker(false)}
    >
      <Pressable
        style={styles.bottomSheetOverlay}
        onPress={() => setShowTypePicker(false)}
      >
        <Pressable
          style={styles.bottomSheetContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>
              {t("admin.analytics.timePeriod.selectDateRange")}
            </Text>
            <TouchableOpacity onPress={() => setShowTypePicker(false)}>
              <MaterialCommunityIcons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.bottomSheetBody}>
            {[
              {
                type: "yearly" as TimePeriodType,
                label: t("admin.analytics.timePeriod.yearly"),
              },
              {
                type: "monthly" as TimePeriodType,
                label: t("admin.analytics.timePeriod.monthly"),
              },
              {
                type: "weekly" as TimePeriodType,
                label: t("admin.analytics.timePeriod.weekly"),
              },
              {
                type: "daily" as TimePeriodType,
                label: t("admin.analytics.timePeriod.daily"),
              },
              {
                type: "custom" as TimePeriodType,
                label: t("admin.analytics.timePeriod.customRange"),
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.type}
                style={[
                  styles.bottomSheetOption,
                  selectedPeriod.type === option.type &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => handleTypeChange(option.type)}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPeriod.type === option.type &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderYearPicker = () => (
    <Modal
      visible={showYearPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowYearPicker(false)}
    >
      <Pressable
        style={styles.bottomSheetOverlay}
        onPress={() => setShowYearPicker(false)}
      >
        <Pressable
          style={styles.bottomSheetContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>
              {t("admin.analytics.timePeriod.selectYear")}
            </Text>
            <TouchableOpacity onPress={() => setShowYearPicker(false)}>
              <MaterialCommunityIcons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.bottomSheetBody}>
            {years.map((year) => (
              <TouchableOpacity
                key={year}
                style={[
                  styles.bottomSheetOption,
                  selectedPeriod.year === year &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => handleYearChange(year)}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPeriod.year === year &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderMonthPicker = () => (
    <Modal
      visible={showMonthPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowMonthPicker(false)}
    >
      <Pressable
        style={styles.bottomSheetOverlay}
        onPress={() => setShowMonthPicker(false)}
      >
        <Pressable
          style={styles.bottomSheetContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>
              {t("admin.analytics.timePeriod.selectMonth")}
            </Text>
            <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
              <MaterialCommunityIcons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.bottomSheetBody}>
            {months.map((month) => (
              <TouchableOpacity
                key={month.value}
                style={[
                  styles.bottomSheetOption,
                  selectedPeriod.month === month.value &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => handleMonthChange(month.value)}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPeriod.month === month.value &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  {month.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderWeekPicker = () => (
    <Modal
      visible={showWeekPicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowWeekPicker(false)}
    >
      <Pressable
        style={styles.bottomSheetOverlay}
        onPress={() => setShowWeekPicker(false)}
      >
        <Pressable
          style={styles.bottomSheetContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>
              {t("admin.analytics.timePeriod.selectWeek")}
            </Text>
            <TouchableOpacity onPress={() => setShowWeekPicker(false)}>
              <MaterialCommunityIcons name="close" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.bottomSheetBody}>
            {weeks.map((week) => (
              <TouchableOpacity
                key={week}
                style={[
                  styles.bottomSheetOption,
                  selectedPeriod.week === week &&
                    styles.bottomSheetOptionActive,
                ]}
                onPress={() => handleWeekChange(week)}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionText,
                    selectedPeriod.week === week &&
                      styles.bottomSheetOptionTextActive,
                  ]}
                >
                  Week {week}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderDatePicker = () => {
    const year = selectedPeriod.startDate.getFullYear();
    const month = selectedPeriod.startDate.getMonth();
    const days = generateDaysForMonth(year, month);
    const monthsList = generateMonths(year);

    return (
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.analytics.timePeriod.selectDate")}
              </Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.sectionTitle}>Year</Text>
                <View style={styles.yearSelector}>
                    <TouchableOpacity
                      onPress={() => {
                        const newYear = year - 1;
                        handleDailyDateChange(new Date(newYear, month, 1));
                      }}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={18} color="#6b7280" />
                    </TouchableOpacity>
                    <Text style={styles.yearText}>{year}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const newYear = year + 1;
                        if (newYear <= currentYear) {
                          handleDailyDateChange(new Date(newYear, month, 1));
                        }
                      }}
                      disabled={year >= currentYear}
                    >
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={year >= currentYear ? "#d1d5db" : "#6b7280"}
                      />
                    </TouchableOpacity>
                </View>
              </View>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.sectionTitle}>Month</Text>
                {monthsList.map((m) => (
                  <TouchableOpacity
                    key={m.value}
                    style={[
                      styles.bottomSheetOption,
                      month === m.value && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      handleDailyDateChange(new Date(year, m.value, 1));
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        month === m.value && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View>
                <Text style={styles.sectionTitle}>Day</Text>
                {days.map((day) => {
                  const dayNum = day.getDate();
                  const isSelected =
                    selectedPeriod.startDate.getDate() === dayNum &&
                    selectedPeriod.startDate.getMonth() === month &&
                    selectedPeriod.startDate.getFullYear() === year;
                  return (
                    <TouchableOpacity
                      key={day.getTime()}
                      style={[
                        styles.bottomSheetOption,
                        isSelected && styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => handleDailyDateChange(day)}
                    >
                      <Text
                        style={[
                          styles.bottomSheetOptionText,
                          isSelected && styles.bottomSheetOptionTextActive,
                        ]}
                      >
                        {day.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderCustomStartDatePicker = () => {
    const selectedDate =
      customStartDate || selectedPeriod.startDate || new Date();
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    return (
      <Modal
        visible={showCustomStartDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomStartDatePicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowCustomStartDatePicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.analytics.timePeriod.startDate")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCustomStartDatePicker(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.label}>Year</Text>
                  <View style={styles.yearSelector}>
                    <TouchableOpacity
                      onPress={() => {
                        const newDate = new Date(
                          year - 1,
                          month,
                          selectedDate.getDate()
                        );
                        handleCustomStartDateChange(newDate);
                      }}
                    >
                      <MaterialCommunityIcons
                        name="chevron-left"
                        size={18}
                        color="#D1D5DB"
                      />
                    </TouchableOpacity>
                    <Text style={styles.yearText}>{year}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const newYear = year + 1;
                        if (newYear <= currentYear) {
                          const newDate = new Date(
                            newYear,
                            month,
                            selectedDate.getDate()
                          );
                          handleCustomStartDateChange(newDate);
                        }
                      }}
                      disabled={year >= currentYear}
                    >
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={year >= currentYear ? "#d1d5db" : "#6b7280"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                <View>
                  <Text style={styles.label}>Month</Text>
                  <View style={styles.monthGrid}>
                    {generateMonths(year).map((m) => (
                      <TouchableOpacity
                        key={m.value}
                        style={[
                          styles.monthCell,
                          month === m.value && styles.monthCellActive,
                        ]}
                        onPress={() => {
                          const newDate = new Date(
                            year,
                            m.value,
                            selectedDate.getDate()
                          );
                          handleCustomStartDateChange(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.monthCellText,
                            month === m.value && styles.monthCellTextActive,
                          ]}
                        >
                          {m.label.substring(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text style={styles.label}>Day</Text>
                  <View style={styles.monthGrid}>
                    {generateDaysForMonth(year, month)
                      .slice(0, 31)
                      .map((day) => {
                        const dayNum = day.getDate();
                        const isSelected =
                          selectedDate.getDate() === dayNum &&
                          selectedDate.getMonth() === month &&
                          selectedDate.getFullYear() === year;
                        return (
                          <TouchableOpacity
                            key={day.getTime()}
                            style={[
                              styles.monthCell,
                              isSelected && styles.monthCellActive,
                            ]}
                            onPress={() => handleCustomStartDateChange(day)}
                          >
                            <Text
                              style={[
                                styles.monthCellText,
                                isSelected && styles.monthCellTextActive,
                              ]}
                            >
                              {dayNum}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderCustomEndDatePicker = () => {
    const selectedDate = customEndDate || selectedPeriod.endDate || new Date();
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    return (
      <Modal
        visible={showCustomEndDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomEndDatePicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowCustomEndDatePicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.analytics.timePeriod.endDate")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCustomEndDatePicker(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.label}>Year</Text>
                  <View style={styles.yearSelector}>
                    <TouchableOpacity
                      onPress={() => {
                        const newDate = new Date(
                          year - 1,
                          month,
                          selectedDate.getDate()
                        );
                        handleCustomEndDateChange(newDate);
                      }}
                    >
                      <MaterialCommunityIcons
                        name="chevron-left"
                        size={18}
                        color="#D1D5DB"
                      />
                    </TouchableOpacity>
                    <Text style={styles.yearText}>{year}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const newYear = year + 1;
                        if (newYear <= currentYear) {
                          const newDate = new Date(
                            newYear,
                            month,
                            selectedDate.getDate()
                          );
                          handleCustomEndDateChange(newDate);
                        }
                      }}
                      disabled={year >= currentYear}
                    >
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={year >= currentYear ? "#d1d5db" : "#6b7280"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                <View>
                  <Text style={styles.label}>Month</Text>
                  <View style={styles.monthGrid}>
                    {generateMonths(year).map((m) => (
                      <TouchableOpacity
                        key={m.value}
                        style={[
                          styles.monthCell,
                          month === m.value && styles.monthCellActive,
                        ]}
                        onPress={() => {
                          const newDate = new Date(
                            year,
                            m.value,
                            selectedDate.getDate()
                          );
                          handleCustomEndDateChange(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.monthCellText,
                            month === m.value && styles.monthCellTextActive,
                          ]}
                        >
                          {m.label.substring(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text style={styles.label}>Day</Text>
                  <View style={styles.monthGrid}>
                    {generateDaysForMonth(year, month)
                      .slice(0, 31)
                      .map((day) => {
                        const dayNum = day.getDate();
                        const isSelected =
                          selectedDate.getDate() === dayNum &&
                          selectedDate.getMonth() === month &&
                          selectedDate.getFullYear() === year;
                        return (
                          <TouchableOpacity
                            key={day.getTime()}
                            style={[
                              styles.monthCell,
                              isSelected && styles.monthCellActive,
                            ]}
                            onPress={() => handleCustomEndDateChange(day)}
                          >
                            <Text
                              style={[
                                styles.monthCellText,
                                isSelected && styles.monthCellTextActive,
                              ]}
                            >
                              {dayNum}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      {/* First row: Type selector (full width) */}
      <View style={styles.firstRow}>
        <TouchableOpacity
          style={[styles.filterDropdown, styles.fullWidthDropdown]}
          onPress={() => setShowTypePicker(true)}
        >
          <MaterialCommunityIcons name="calendar" size={14} color="#ec4899" />
          <Text style={styles.filterDropdownText}>
            {selectedPeriod.type === "yearly"
              ? t("admin.analytics.timePeriod.yearly")
              : selectedPeriod.type === "monthly"
              ? t("admin.analytics.timePeriod.monthly")
              : selectedPeriod.type === "weekly"
              ? t("admin.analytics.timePeriod.weekly")
              : selectedPeriod.type === "daily"
              ? t("admin.analytics.timePeriod.daily")
              : t("admin.analytics.timePeriod.customRange")}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Second row: Other dropdowns */}
      {(selectedPeriod.type === "yearly" ||
        selectedPeriod.type === "monthly" ||
        selectedPeriod.type === "weekly" ||
        selectedPeriod.type === "daily" ||
        selectedPeriod.type === "custom") && (
        <View style={styles.filterRow}>
          {selectedPeriod.type === "yearly" && (
            <TouchableOpacity
              style={styles.filterDropdown}
              onPress={() => setShowYearPicker(true)}
            >
              <Text style={styles.filterDropdownText}>
                {selectedPeriod.year ?? currentYear}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
            </TouchableOpacity>
          )}

          {selectedPeriod.type === "monthly" && (
            <>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => setShowMonthPicker(true)}
              >
                <Text style={styles.filterDropdownText}>
                  {new Date(
                    selectedPeriod.year ?? currentYear,
                    selectedPeriod.month ?? currentMonth,
                    1
                  ).toLocaleDateString("en-US", { month: "long" })}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => setShowYearPicker(true)}
              >
                <Text style={styles.filterDropdownText}>
                  {selectedPeriod.year ?? currentYear}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
            </>
          )}

          {selectedPeriod.type === "weekly" && (
            <>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => setShowWeekPicker(true)}
              >
                <Text style={styles.filterDropdownText}>
                  Week {selectedPeriod.week ?? getCurrentWeek()}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => setShowYearPicker(true)}
              >
                <Text style={styles.filterDropdownText}>
                  {selectedPeriod.year ?? currentYear}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
            </>
          )}

          {selectedPeriod.type === "daily" && (
            <TouchableOpacity
              style={styles.filterDropdown}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.filterDropdownText}>
                {selectedPeriod.label}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
            </TouchableOpacity>
          )}

          {selectedPeriod.type === "custom" && (
            <>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => {
                  if (selectedPeriod.startDate) {
                    setCustomStartDate(selectedPeriod.startDate);
                  } else {
                    const today = new Date();
                    const last30Days = new Date(
                      today.getTime() - 30 * 24 * 60 * 60 * 1000
                    );
                    setCustomStartDate(last30Days);
                  }
                  setShowCustomStartDatePicker(true);
                }}
              >
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedPeriod.startDate
                    ? formatDateForLabel(selectedPeriod.startDate)
                    : t("admin.analytics.timePeriod.startDate")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => {
                  if (selectedPeriod.endDate) {
                    setCustomEndDate(selectedPeriod.endDate);
                  } else {
                    setCustomEndDate(new Date());
                  }
                  setShowCustomEndDatePicker(true);
                }}
              >
                <Text style={styles.filterDropdownText} numberOfLines={1}>
                  {selectedPeriod.endDate
                    ? formatDateForLabel(selectedPeriod.endDate)
                    : t("admin.analytics.timePeriod.endDate")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {renderTypePicker()}
      {renderYearPicker()}
      {renderMonthPicker()}
      {renderWeekPicker()}
      {renderDatePicker()}
      {renderCustomStartDatePicker()}
      {renderCustomEndDatePicker()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  firstRow: {
    width: "100%",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  filterDropdown: {
    flex: 1,
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  fullWidthDropdown: {
    flex: 1,
    width: "100%",
    minWidth: "100%",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  bottomSheetBody: {
    padding: 16,
    maxHeight: 400,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 8,
  },
  yearSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  yearText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 16,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  monthCell: {
    width: "23%",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    alignItems: "center",
  },
  monthCellActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  monthCellText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 12,
  },
  monthCellTextActive: {
    color: "#ec4899",
  },
  customRangeActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  applyButton: {
    backgroundColor: "#ec4899",
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelButtonText: {
    color: "#111827",
    fontWeight: "600",
  },
  applyButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});

export default AnalyticsTimePeriodFilter;
