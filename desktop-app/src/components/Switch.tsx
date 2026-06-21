import React from "react";

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  onCheckedChange,
  disabled = false,
}) => {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "44px",
        height: "24px",
        padding: 0,
        border: "none",
        borderRadius: "12px",
        backgroundColor: checked ? "#ec4899" : "#d1d5db",
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        transition: "background-color 0.2s",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = checked ? "#db2777" : "#9ca3af";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = checked ? "#ec4899" : "#d1d5db";
        }
      }}
    >
      <span
        style={{
          position: "absolute",
          left: checked ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          transition: "left 0.2s",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
        }}
      />
    </button>
  );
};

export default Switch;

