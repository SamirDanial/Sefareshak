import React from "react";

interface NumberInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  allowDecimals?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  step?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
  id,
  value,
  onChange,
  allowDecimals = false,
  min,
  max,
  placeholder,
  disabled = false,
  step,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    if (inputValue === "" || inputValue === "-") {
      onChange(0);
      return;
    }

    const numValue = allowDecimals ? parseFloat(inputValue) : parseInt(inputValue, 10);
    
    if (!isNaN(numValue)) {
      let finalValue = numValue;
      
      if (min !== undefined && finalValue < min) {
        finalValue = min;
      }
      if (max !== undefined && finalValue > max) {
        finalValue = max;
      }
      
      onChange(finalValue);
    }
  };

  return (
    <input
      id={id}
      type="number"
      value={value}
      onChange={handleChange}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      step={step || (allowDecimals ? "0.01" : "1")}
      style={{
        width: "100%",
        padding: "10px 12px",
        fontSize: "14px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        backgroundColor: disabled ? "#f3f4f6" : "#ffffff",
        color: "#111827",
        outline: "none",
      }}
      onFocus={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = "#ec4899";
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
      }}
    />
  );
};

export default NumberInput;

