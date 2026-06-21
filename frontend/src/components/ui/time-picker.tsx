import * as React from "react";
import ReactDatePicker from "react-datepicker";
import Icon from "@mdi/react";
import { mdiClock } from "@mdi/js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import "react-datepicker/dist/react-datepicker.css";

interface TimePickerProps {
  time?: string; // Format: "HH:mm"
  onTimeChange?: (time: string | undefined) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function TimePicker({
  time,
  onTimeChange,
  disabled = false,
  className,
  placeholder = "Select time",
}: TimePickerProps) {
  const [selectedTime, setSelectedTime] = React.useState<Date | null>(null);

  // Convert time string (HH:mm) to Date object
  React.useEffect(() => {
    if (time) {
      const [hours, minutes] = time.split(":").map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      setSelectedTime(date);
    } else {
      setSelectedTime(null);
    }
  }, [time]);

  const handleTimeChange = (date: Date | null) => {
    setSelectedTime(date);
    if (date) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      onTimeChange?.(`${hours}:${minutes}`);
    } else {
      onTimeChange?.(undefined);
    }
  };

  const CustomInput = React.forwardRef<
    HTMLButtonElement,
    { value?: string; onClick?: () => void }
  >(({ value, onClick }, ref) => {
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
        {value || <span>{placeholder}</span>}
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
        dateFormat="HH:mm"
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

