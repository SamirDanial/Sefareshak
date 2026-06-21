import * as React from "react";
import ReactDatePicker from "react-datepicker";
import Icon from "@mdi/react";
import { mdiCalendar } from "@mdi/js";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import "react-datepicker/dist/react-datepicker.css";

interface DatePickerProps {
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  maxDate?: Date;
  minDate?: Date;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  excludeDates?: Date[]; // Dates to exclude/disable
  excludeDateIntervals?: Array<{ start: Date; end: Date }>; // Date ranges to exclude/disable
  filterDate?: (date: Date) => boolean; // Custom filter function for dates
}

export function DatePicker({
  date,
  onDateChange,
  maxDate,
  minDate,
  disabled = false,
  className,
  placeholder = "Pick a date",
  variant = "ghost",
  excludeDates = [],
  excludeDateIntervals = [],
  filterDate: customFilterDate,
}: DatePickerProps) {
  const CustomInput = React.forwardRef<
    HTMLButtonElement,
    { value?: string; onClick?: () => void }
  >(({ value, onClick }, ref) => {
    // Extract height class from className if present
    const heightMatch = className?.match(/\bh-\d+\b/);
    const heightClass = heightMatch ? heightMatch[0] : "";
    const classNameWithoutHeight = className?.replace(/\bh-\d+\b/g, "").trim();
    
    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        onClick={onClick}
        className={cn(
          variant === "ghost" && "min-w-[160px] justify-start text-left font-normal text-pink-600 hover:text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:text-pink-300 dark:hover:bg-pink-500/10",
          variant === "ghost" && !date && "text-muted-foreground",
          heightClass,
          classNameWithoutHeight
        )}
        disabled={disabled}
      >
        <Icon path={mdiCalendar} size={0.67} className="mr-2" />
        {value || <span>{placeholder}</span>}
      </Button>
    );
  });

  CustomInput.displayName = "CustomInput";

  // Helper function to check if a date should be excluded
  const isDateExcluded = React.useCallback((dateToCheck: Date): boolean => {
    // Normalize date to start of day for comparison
    const dateToCheckStr = dateToCheck.toISOString().split('T')[0];
    const dateToCheckOnly = new Date(dateToCheckStr + 'T00:00:00');
    dateToCheckOnly.setHours(0, 0, 0, 0);
    
    // Check single excluded dates
    if (excludeDates.length > 0) {
      for (const excludedDate of excludeDates) {
        const excludedDateStr = excludedDate.toISOString().split('T')[0];
        if (dateToCheckStr === excludedDateStr) {
          return true;
        }
      }
    }
    
    // Check date intervals
    if (excludeDateIntervals.length > 0) {
      for (const interval of excludeDateIntervals) {
        const startDate = new Date(interval.start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(interval.end);
        endDate.setHours(23, 59, 59, 999);
        
        if (dateToCheckOnly >= startDate && dateToCheckOnly <= endDate) {
          return true;
        }
      }
    }
    
    return false;
  }, [excludeDates, excludeDateIntervals]);

  return (
    <div className={cn("relative", className)}>
      <ReactDatePicker
        selected={date}
        onChange={(date: Date | null) => {
          onDateChange?.(date || undefined);
        }}
        maxDate={maxDate}
        minDate={minDate}
        disabled={disabled}
        filterDate={(date: Date) => {
          // First check custom filter if provided
          if (customFilterDate && !customFilterDate(date)) {
            return false;
          }
          // Filter out excluded dates and date intervals
          return !isDateExcluded(date);
        }}
        customInput={<CustomInput />}
        dateFormat="dd - MMM - yy"
        popperPlacement="bottom-start"
        showPopperArrow={false}
        popperClassName="react-datepicker-popper-custom"
      />
    </div>
  );
}
