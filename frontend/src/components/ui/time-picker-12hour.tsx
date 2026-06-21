import * as React from "react";
import ReactDatePicker from "react-datepicker";
import Icon from "@mdi/react";
import { mdiClock } from "@mdi/js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import "react-datepicker/dist/react-datepicker.css";

interface TimePicker12HourProps {
  time?: string; // Format: "9:00 AM" or "10:00 PM"
  onTimeChange?: (time: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Convert 12-hour format time string to 24-hour format
 * @param time12h - Time in 12-hour format (e.g., "9:00 AM", "10:30 PM")
 * @returns Time in 24-hour format (e.g., "09:00", "22:30") or undefined
 */
function parse12HourTime(time12h: string): { hours: number; minutes: number } | null {
  if (!time12h) return null;
  
  const trimmed = time12h.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (hours === 12) {
    hours = 0; // 12:XX AM/PM becomes 0:XX
  }

  if (period === "PM") {
    hours += 12;
  }

  return { hours, minutes };
}

/**
 * Convert 24-hour format time to 12-hour format
 * @param hours - Hours (0-23)
 * @param minutes - Minutes (0-59)
 * @returns Time in 12-hour format (e.g., "9:00 AM", "10:30 PM")
 */
function format12HourTime(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) {
    displayHours = 12;
  }
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function TimePicker12Hour({
  time,
  onTimeChange,
  disabled = false,
  className,
  placeholder = "Select time",
}: TimePicker12HourProps) {
  const [selectedTime, setSelectedTime] = React.useState<Date | null>(null);

  // Convert 12-hour format time string to Date object
  React.useEffect(() => {
    if (time) {
      const parsed = parse12HourTime(time);
      if (parsed) {
        const date = new Date();
        date.setHours(parsed.hours, parsed.minutes, 0, 0);
        setSelectedTime(date);
      } else {
        setSelectedTime(null);
      }
    } else {
      setSelectedTime(null);
    }
  }, [time]);

  const handleTimeChange = (date: Date | null) => {
    setSelectedTime(date);
    if (date) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const time12h = format12HourTime(hours, minutes);
      onTimeChange?.(time12h);
    } else {
      onTimeChange?.(undefined);
    }
  };

  const CustomInput = React.forwardRef<
    HTMLButtonElement,
    { value?: string; onClick?: () => void }
  >(({ value, onClick }, ref) => {
    // Convert the 24-hour format value to 12-hour format for display
    let displayValue = value;
    if (value && selectedTime) {
      const hours = selectedTime.getHours();
      const minutes = selectedTime.getMinutes();
      displayValue = format12HourTime(hours, minutes);
    }

    return (
      <Button
        ref={ref}
        variant="outline"
        onClick={onClick}
        className={cn(
          "min-w-[140px] justify-start text-left font-normal border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10",
          !selectedTime && "text-muted-foreground",
          className
        )}
        disabled={disabled}
      >
        <Icon path={mdiClock} size={0.67} className="mr-2" />
        {displayValue || <span>{placeholder}</span>}
      </Button>
    );
  });

  CustomInput.displayName = "CustomInput";

  return (
    <div className={cn("relative", className)}>
      <ReactDatePicker
        selected={selectedTime}
        onChange={handleTimeChange}
        showTimeSelect
        showTimeSelectOnly
        timeIntervals={15}
        dateFormat="h:mm aa"
        timeCaption="Time"
        disabled={disabled}
        customInput={<CustomInput />}
        popperPlacement="bottom-start"
        showPopperArrow={false}
        popperClassName="react-datepicker-popper-custom"
      />
    </div>
  );
}

