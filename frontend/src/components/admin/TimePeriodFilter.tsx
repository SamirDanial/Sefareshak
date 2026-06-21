import React from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@mdi/react";
import { mdiCalendar, mdiChevronDown } from "@mdi/js";

export type TimePeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_7_days"
  | "last_30_days"
  | "last_3_months"
  | "last_6_months"
  | "this_year";

interface TimePeriodFilterProps {
  selectedPeriod: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

const TimePeriodFilter: React.FC<TimePeriodFilterProps> = ({
  selectedPeriod,
  onPeriodChange,
}) => {
  const { t } = useTranslation();

  const timePeriods = [
    {
      value: "today" as TimePeriod,
      labelKey: "admin.dashboard.periods.today",
      descriptionKey: "admin.dashboard.periods.last24Hours",
    },
    {
      value: "this_week" as TimePeriod,
      labelKey: "admin.dashboard.periods.thisWeek",
      descriptionKey: "admin.dashboard.periods.currentWeek",
    },
    {
      value: "this_month" as TimePeriod,
      labelKey: "admin.dashboard.periods.thisMonth",
      descriptionKey: "admin.dashboard.periods.currentMonth",
    },
    {
      value: "last_7_days" as TimePeriod,
      labelKey: "admin.dashboard.periods.last7Days",
      descriptionKey: "admin.dashboard.periods.past7Days",
    },
    {
      value: "last_30_days" as TimePeriod,
      labelKey: "admin.dashboard.periods.last30Days",
      descriptionKey: "admin.dashboard.periods.past30Days",
    },
    {
      value: "last_3_months" as TimePeriod,
      labelKey: "admin.dashboard.periods.last3Months",
      descriptionKey: "admin.dashboard.periods.past3Months",
    },
    {
      value: "last_6_months" as TimePeriod,
      labelKey: "admin.dashboard.periods.last6Months",
      descriptionKey: "admin.dashboard.periods.past6Months",
    },
    {
      value: "this_year" as TimePeriod,
      labelKey: "admin.dashboard.periods.thisYear",
      descriptionKey: "admin.dashboard.periods.currentYear",
    },
  ];

  const selectedPeriodData = timePeriods.find(
    (p) => p.value === selectedPeriod
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 min-w-[120px] sm:min-w-[140px]"
        >
          <Icon path={mdiCalendar} size={0.67} />
          <span className="text-sm font-medium">
            {selectedPeriodData ? t(selectedPeriodData.labelKey) : ""}
          </span>
          <Icon path={mdiChevronDown} size={0.67} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 sm:w-56">
        {timePeriods.map((period) => {
          const isSelected = selectedPeriod === period.value;

          return (
            <DropdownMenuItem
              key={period.value}
              onSelect={() => onPeriodChange(period.value)}
              className={`cursor-pointer ${
                isSelected
                  ? "bg-pink-500/20 text-pink-400 border-l-2 border-pink-500"
                  : "hover:bg-gray-800 hover:text-gray-100"
              }`}
            >
              <div className="flex flex-col">
                <span className="font-medium">{t(period.labelKey)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(period.descriptionKey)}
                </span>
              </div>
              {isSelected && (
                <div className="ml-auto h-2 w-2 rounded-full bg-pink-400" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TimePeriodFilter;
