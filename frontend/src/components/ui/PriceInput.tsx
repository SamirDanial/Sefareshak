import React from "react";
import { Input } from "./input";
import Icon from "@mdi/react";
import { mdiCurrencyUsd } from "@mdi/js";

interface PriceInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  showDollarIcon?: boolean;
  className?: string;
}

const PriceInput: React.FC<PriceInputProps> = ({
  id,
  value,
  onChange,
  placeholder = "2.5",
  disabled = false,
  required = false,
  showDollarIcon = true,
  className = "",
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow empty string
    if (inputValue === "") {
      onChange("");
      return;
    }
    
    // Only allow numbers and one decimal point
    // Pattern: digits optionally followed by a dot and more digits
    const validPattern = /^\d*\.?\d*$/;
    
    if (validPattern.test(inputValue)) {
      // Ensure only one decimal point
      const decimalCount = (inputValue.match(/\./g) || []).length;
      if (decimalCount <= 1) {
        onChange(inputValue);
      }
    }
    // If pattern doesn't match, don't update the input (reject invalid characters)
  };

  const inputElement = (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={`bg-card border-border focus:border-pink-500 focus:ring-pink-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] ${showDollarIcon ? "pl-10" : ""} ${className}`}
    />
  );

  if (showDollarIcon) {
    return (
      <div className="relative">
        <Icon path={mdiCurrencyUsd} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
        {inputElement}
      </div>
    );
  }

  return inputElement;
};

export default PriceInput;

