import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import { mdiCalendar, mdiCalendarMonth } from "@mdi/js";
import { useTranslation } from "react-i18next";
import { DatePicker } from "@/components/ui/date-picker";

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
  // Additional data for specific types
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
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(
    undefined
  );
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(
    undefined
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
    return years; // Already in descending order (current year first)
  };

  // Generate months (current month first, then descending, no future months for current year)
  const generateMonths = (
    selectedYear?: number
  ): Array<{ value: number; label: string }> => {
    const months = [];
    const year = selectedYear ?? currentYear;
    const maxMonth = year === currentYear ? currentMonth : 11; // Show all months for past years

    // Start from current month (or last month of year for past years) and go backwards
    for (let i = 0; i <= maxMonth; i++) {
      const monthIndex = maxMonth - i;
      const date = new Date(2024, monthIndex, 1); // Use 2024 as base year for month names
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

  // Generate weeks for a year (current week first, then descending, no future weeks for current year)
  const generateWeeks = (year: number): number[] => {
    const weeks = [];
    const totalWeeks = getWeeksInYear(year);
    const currentWeek = getCurrentWeek();

    // If the year is current year, only show weeks up to current week
    if (year === currentYear) {
      // Start from current week and go backwards
      for (let i = currentWeek; i >= 1; i--) {
        weeks.push(i);
      }
    } else {
      // For past years, show all weeks in descending order
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

  // Get current week number
  const getCurrentWeek = (): number => {
    const date = new Date();
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor(
      (date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    return Math.ceil((days + startDate.getDay() + 1) / 7);
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
        // Keep existing custom range or set default
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
        }
        break;
      default:
        return;
    }

    onPeriodChange(newPeriod);
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
  };

  const handleCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);

      const newPeriod: TimePeriod = {
        type: "custom",
        startDate: start,
        endDate: end,
        label: `${formatDateForLabel(start)} to ${formatDateForLabel(end)}`,
      };

      onPeriodChange(newPeriod);
      setIsCustomDialogOpen(false);
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  const years = generateYears();
  const months = generateMonths(
    selectedPeriod.type === "monthly" ? selectedPeriod.year : undefined
  );
  const weeks =
    selectedPeriod.type === "weekly" && selectedPeriod.year
      ? generateWeeks(selectedPeriod.year)
      : generateWeeks(currentYear);

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      {/* Filter Type Dropdown */}
      <Select
        value={selectedPeriod.type}
        onValueChange={(value) => handleTypeChange(value as TimePeriodType)}
      >
        <SelectTrigger className="w-full sm:min-w-[140px] border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10">
          <Icon path={mdiCalendarMonth} size={0.67} className="mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yearly">
            {t("admin.analytics.timePeriod.yearly") || "Yearly"}
          </SelectItem>
          <SelectItem value="monthly">
            {t("admin.analytics.timePeriod.monthly") || "Monthly"}
          </SelectItem>
          <SelectItem value="weekly">
            {t("admin.analytics.timePeriod.weekly") || "Weekly"}
          </SelectItem>
          <SelectItem value="daily">
            {t("admin.analytics.timePeriod.daily") || "Daily"}
          </SelectItem>
          <SelectItem value="custom">
            {t("admin.analytics.timePeriod.customRange") || "Custom Range"}
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Dynamic Second Dropdown/Input */}
      {selectedPeriod.type === "yearly" && (
        <Select
          value={selectedPeriod.year?.toString() || currentYear.toString()}
          onValueChange={(value) => handleYearChange(parseInt(value))}
        >
          <SelectTrigger className="w-full sm:min-w-[120px] border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedPeriod.type === "monthly" && (
        <div className="flex gap-2 w-full sm:w-auto">
          <Select
            value={selectedPeriod.month?.toString() || currentMonth.toString()}
            onValueChange={(value) => handleMonthChange(parseInt(value))}
          >
            <SelectTrigger className="flex-1 sm:min-w-[140px] border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value.toString()}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedPeriod.year?.toString() || currentYear.toString()}
            onValueChange={(value) => handleYearChange(parseInt(value))}
          >
            <SelectTrigger className="flex-1 sm:min-w-[100px] border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedPeriod.type === "weekly" && (
        <div className="flex gap-2 w-full sm:w-auto">
          <Select
            value={
              selectedPeriod.week?.toString() || getCurrentWeek().toString()
            }
            onValueChange={(value) => handleWeekChange(parseInt(value))}
          >
            <SelectTrigger className="flex-1 sm:min-w-[120px] border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10">
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((week) => (
                <SelectItem key={week} value={week.toString()}>
                  Week {week}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedPeriod.year?.toString() || currentYear.toString()}
            onValueChange={(value) => handleYearChange(parseInt(value))}
          >
            <SelectTrigger className="flex-1 sm:min-w-[100px] border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedPeriod.type === "daily" && (
        <div className="w-full sm:w-auto">
          <DatePicker
            date={selectedPeriod.startDate}
            onDateChange={(date) => {
              if (date) {
                handleDailyDateChange(date);
              }
            }}
            maxDate={new Date()}
            placeholder="Select a date"
          />
        </div>
      )}

      {selectedPeriod.type === "custom" && (
        <>
          <Button
            variant="outline"
            onClick={() => {
              if (selectedPeriod.startDate && selectedPeriod.endDate) {
                setCustomStartDate(selectedPeriod.startDate);
                setCustomEndDate(selectedPeriod.endDate);
              } else {
                const today = new Date();
                const last30Days = new Date(
                  today.getTime() - 30 * 24 * 60 * 60 * 1000
                );
                setCustomStartDate(last30Days);
                setCustomEndDate(today);
              }
              setIsCustomDialogOpen(true);
            }}
            className="w-full sm:min-w-[200px] justify-start border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
          >
            <Icon path={mdiCalendar} size={0.67} className="mr-2" />
            <span className="text-sm font-medium truncate">
              {selectedPeriod.label}
            </span>
          </Button>

          {/* Custom Date Range Dialog */}
          <Dialog
            open={isCustomDialogOpen}
            onOpenChange={setIsCustomDialogOpen}
          >
            <DialogContent className="bg-card border-border text-foreground">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {t("admin.analytics.timePeriod.selectDateRange") ||
                    "Select Date Range"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">
                    {t("admin.analytics.timePeriod.startDate") || "Start Date"}
                  </Label>
                  <DatePicker
                    date={customStartDate}
                    onDateChange={(date) => setCustomStartDate(date)}
                    maxDate={customEndDate || new Date()}
                    placeholder={
                      t("admin.analytics.timePeriod.startDate") ||
                      "Select start date"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">
                    {t("admin.analytics.timePeriod.endDate") || "End Date"}
                  </Label>
                  <DatePicker
                    date={customEndDate}
                    onDateChange={(date) => setCustomEndDate(date)}
                    minDate={customStartDate}
                    maxDate={new Date()}
                    placeholder={
                      t("admin.analytics.timePeriod.endDate") ||
                      "Select end date"
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCustomDialogOpen(false);
                    setCustomStartDate(undefined);
                    setCustomEndDate(undefined);
                  }}
                  className="border-border text-foreground hover:bg-muted dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  {t("common.cancel") || "Cancel"}
                </Button>
                <Button
                  onClick={handleCustomDateRange}
                  disabled={!customStartDate || !customEndDate}
                  className="bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50 disabled:cursor-not-allowed dark:bg-pink-500 dark:hover:bg-pink-600"
                >
                  {t("common.apply") || "Apply"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default AnalyticsTimePeriodFilter;
