import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
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

  // Generate years (10 years from now to past)
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

  // Get current week number
  const getCurrentWeek = (): number => {
    const date = new Date();
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor(
      (date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    return Math.ceil((days + startDate.getDay() + 1) / 7);
  };

  // Get weeks in a year
  const getWeeksInYear = (year: number): number => {
    const d = new Date(year, 0, 1);
    const isLeap = new Date(year, 1, 29).getMonth() === 1;
    return d.getDay() === 4 || (isLeap && d.getDay() === 3) ? 53 : 52;
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
    const ISOweekStart = new Date(simple);
    if (dow <= 4) {
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    ISOweekStart.setHours(0, 0, 0, 0);
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
            { month: "long" }
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
          label: `${t("admin.revenueAnalytics.timePeriodFilter.week")} ${currentWeek}, ${currentYear}`,
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
        label: `${t("admin.revenueAnalytics.timePeriodFilter.week")} ${week}, ${year}`,
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
      label: `${t("admin.revenueAnalytics.timePeriodFilter.week")} ${week}, ${year}`,
      year,
      week,
    };
    onPeriodChange(newPeriod);
  };

  const handleDailyDateChange = (dateString: string) => {
    // Parse date string (YYYY-MM-DD) directly to avoid timezone issues
    const [year, month, day] = dateString.split("-").map(Number);
    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
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
      // Ensure dates are in local timezone
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
    }
  };

  // Helper to parse date string to local date
  const parseDateString = (dateString: string): Date => {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  };

  // Helper to format date to YYYY-MM-DD in local timezone
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
    <>
      <div className="flex gap-2 flex-wrap">
        {/* Filter Type Dropdown */}
        <Select
          value={selectedPeriod.type}
          onValueChange={(val) => handleTypeChange(val as TimePeriodType)}
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yearly">{t("admin.revenueAnalytics.timePeriodFilter.yearly")}</SelectItem>
            <SelectItem value="monthly">{t("admin.revenueAnalytics.timePeriodFilter.monthly")}</SelectItem>
            <SelectItem value="weekly">{t("admin.revenueAnalytics.timePeriodFilter.weekly")}</SelectItem>
            <SelectItem value="daily">{t("admin.revenueAnalytics.timePeriodFilter.daily")}</SelectItem>
            <SelectItem value="custom">{t("admin.revenueAnalytics.timePeriodFilter.customRange")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Dynamic Second Dropdown/Input */}
        {selectedPeriod.type === "yearly" && (
          <Select
            value={String(selectedPeriod.year ?? currentYear)}
            onValueChange={(val) => handleYearChange(parseInt(val))}
          >
            <SelectTrigger className="min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedPeriod.type === "monthly" && (
          <div className="flex gap-2">
            <Select
              value={String(selectedPeriod.month ?? currentMonth)}
              onValueChange={(val) => handleMonthChange(parseInt(val))}
            >
              <SelectTrigger className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month) => (
                  <SelectItem key={month.value} value={String(month.value)}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(selectedPeriod.year ?? currentYear)}
              onValueChange={(val) => handleYearChange(parseInt(val))}
            >
              <SelectTrigger className="min-w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedPeriod.type === "weekly" && (
          <div className="flex gap-2">
            <Select
              value={String(selectedPeriod.week ?? getCurrentWeek())}
              onValueChange={(val) => handleWeekChange(parseInt(val))}
            >
              <SelectTrigger className="min-w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((week) => (
                  <SelectItem key={week} value={String(week)}>
                    {t("admin.revenueAnalytics.timePeriodFilter.week")} {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(selectedPeriod.year ?? currentYear)}
              onValueChange={(val) => handleYearChange(parseInt(val))}
            >
              <SelectTrigger className="min-w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedPeriod.type === "daily" && (
          <input
            type="date"
            value={formatDateForInput(selectedPeriod.startDate)}
            onChange={(e) => {
              if (e.target.value) {
                handleDailyDateChange(e.target.value);
              }
            }}
            max={formatDateForInput(new Date())}
            style={{
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#ec4899";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e5e7eb";
            }}
          />
        )}

        {selectedPeriod.type === "custom" && (
          <button
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              fontSize: "14px",
              fontWeight: "500",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              color: "#111827",
              minWidth: "200px",
              justifyContent: "flex-start",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f9fafb";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#ffffff";
            }}
          >
            <Calendar style={{ height: "16px", width: "16px" }} />
            <span style={{ flex: 1, textAlign: "left" }}>
              {selectedPeriod.label}
            </span>
          </button>
        )}
      </div>

      {/* Custom Date Range Dialog */}
      {isCustomDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setIsCustomDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#111827",
                  margin: 0,
                }}
              >
                {t("admin.revenueAnalytics.timePeriodFilter.selectDateRange")}
              </h3>
              <button
                onClick={() => setIsCustomDialogOpen(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <X style={{ height: "20px", width: "20px", color: "#6b7280" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.revenueAnalytics.timePeriodFilter.startDate")}
                </label>
                <input
                  type="date"
                  value={
                    customStartDate
                      ? formatDateForInput(customStartDate)
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      setCustomStartDate(parseDateString(e.target.value));
                    }
                  }}
                  max={
                    customEndDate
                      ? formatDateForInput(customEndDate)
                      : formatDateForInput(new Date())
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.revenueAnalytics.timePeriodFilter.endDate")}
                </label>
                <input
                  type="date"
                  value={
                    customEndDate
                      ? formatDateForInput(customEndDate)
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      setCustomEndDate(parseDateString(e.target.value));
                    }
                  }}
                  min={
                    customStartDate
                      ? formatDateForInput(customStartDate)
                      : undefined
                  }
                  max={formatDateForInput(new Date())}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() => {
                  setIsCustomDialogOpen(false);
                  setCustomStartDate(undefined);
                  setCustomEndDate(undefined);
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  fontWeight: "500",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#111827",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("admin.revenueAnalytics.timePeriodFilter.cancel")}
              </button>
              <button
                onClick={handleCustomDateRange}
                disabled={!customStartDate || !customEndDate}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  fontWeight: "500",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor:
                    !customStartDate || !customEndDate ? "#d1d5db" : "#ec4899",
                  cursor:
                    !customStartDate || !customEndDate
                      ? "not-allowed"
                      : "pointer",
                  color: "#ffffff",
                  opacity: !customStartDate || !customEndDate ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (customStartDate && customEndDate) {
                    e.currentTarget.style.backgroundColor = "#db2777";
                  }
                }}
                onMouseLeave={(e) => {
                  if (customStartDate && customEndDate) {
                    e.currentTarget.style.backgroundColor = "#ec4899";
                  }
                }}
              >
                {t("admin.revenueAnalytics.timePeriodFilter.apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AnalyticsTimePeriodFilter;

