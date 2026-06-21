import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "onChange"
  > {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  allowDecimals?: boolean;
  min?: number;
  max?: number;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    { value, onChange, allowDecimals = true, min, max, className, ...props },
    ref
  ) => {
    const [displayValue, setDisplayValue] = React.useState(
      value !== undefined ? value.toString() : ""
    );

    // Update display value when prop value changes
    React.useEffect(() => {
      setDisplayValue(value !== undefined ? value.toString() : "");
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;

      // Allow empty string - treat as undefined
      if (inputValue === "") {
        setDisplayValue("");
        onChange(undefined);
        return;
      }

      // Only allow numbers and decimal point
      const regex = allowDecimals ? /^\d*\.?\d*$/ : /^\d*$/;

      if (!regex.test(inputValue)) {
        return;
      }

      // Update display value
      setDisplayValue(inputValue);

      // Convert to number for validation and onChange
      const numValue = parseFloat(inputValue);

      // Only call onChange if we have a valid number
      if (!isNaN(numValue)) {
        // Check min/max constraints
        if (min !== undefined && numValue < min) {
          return;
        }
        if (max !== undefined && numValue > max) {
          return;
        }
        onChange(numValue);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Prevent arrow keys from changing the value
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
      }
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn("", className)}
        inputMode="numeric"
        pattern={allowDecimals ? "[0-9]*\\.?[0-9]*" : "[0-9]*"}
      />
    );
  }
);

NumberInput.displayName = "NumberInput";

export { NumberInput };
