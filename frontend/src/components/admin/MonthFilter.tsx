import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@mdi/react";
import { mdiCalendar, mdiChevronDown } from "@mdi/js";
import { cn } from "@/lib/utils";

export type MonthFilter = {
  year: number;
  month: number;
  label: string;
};

interface MonthFilterProps {
  selectedMonth: MonthFilter;
  onMonthChange: (month: MonthFilter) => void;
}

const MonthFilterComponent: React.FC<MonthFilterProps> = ({
  selectedMonth,
  onMonthChange,
}) => {
  // Generate months for the current year only
  const generateMonths = (): MonthFilter[] => {
    const months = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-based

    // Add months for current year (January to current month)
    for (let month = 0; month <= currentMonth; month++) {
      const date = new Date(currentYear, month, 1);
      months.push({
        year: currentYear,
        month: month,
        label: date.toLocaleDateString("en-US", {
          month: "long",
        }),
      });
    }

    return months.reverse(); // Most recent first
  };

  const availableMonths = generateMonths();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="min-w-[140px] sm:min-w-[160px] justify-between border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
        >
          <Icon path={mdiCalendar} size={0.67} />
          <span className="text-sm font-medium">{selectedMonth.label}</span>
          <Icon path={mdiChevronDown} size={0.67} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 sm:w-56 max-h-[300px] overflow-y-auto"
      >
        {availableMonths.map((month) => {
          const isSelected =
            selectedMonth.year === month.year &&
            selectedMonth.month === month.month;

          return (
            <DropdownMenuItem
              key={`${month.year}-${month.month}`}
              onClick={() => onMonthChange(month)}
              className={cn(
                "cursor-pointer",
                isSelected
                  ? "bg-pink-500/20 text-pink-400 border-l-2 border-pink-500"
                  : "hover:bg-gray-800 hover:text-gray-100"
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    isSelected ? "bg-pink-400" : "bg-gray-400"
                  )}
                />
                <div className="flex flex-col">
                  <span className="font-medium">{month.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {month.year === new Date().getFullYear() &&
                    month.month === new Date().getMonth()
                      ? "Current month"
                      : `${month.year}`}
                  </span>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default MonthFilterComponent;
