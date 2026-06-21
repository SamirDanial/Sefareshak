import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

interface SelectContextType {
  value: string;
  onValueChange: (value: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SelectContext = createContext<SelectContextType | null>(null);

interface SelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

interface SelectTriggerProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
}

interface SelectContentProps {
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

const Select: React.FC<SelectProps> & {
  Trigger: React.FC<SelectTriggerProps>;
  Content: React.FC<SelectContentProps>;
  Item: React.FC<SelectItemProps>;
  Value: React.FC<SelectValueProps>;
} = ({
  value,
  onValueChange,
  placeholder,
  disabled = false,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <SelectContext.Provider
      value={{ value, onValueChange, isOpen, setIsOpen, disabled, placeholder, triggerRef }}
    >
      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        {children}
      </div>
    </SelectContext.Provider>
  );
};

const SelectTrigger: React.FC<SelectTriggerProps> = ({
  id,
  children,
}) => {
  const context = useContext(SelectContext);
  if (!context) throw new Error("SelectTrigger must be used within Select");
  
  const { value, isOpen, setIsOpen, disabled, placeholder, triggerRef } = context;
  const displayValue = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && (child.type as any)?.displayName === "SelectValue"
  ) || (value || placeholder || "Select...");

  return (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setIsOpen(!isOpen)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        fontSize: "14px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        backgroundColor: disabled ? "#f3f4f6" : "#ffffff",
        color: "#111827",
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
      }}
      onFocus={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = "#ec4899";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span style={{ flex: 1, textAlign: "left" }}>
        {typeof displayValue === "string" ? displayValue : children}
      </span>
      <ChevronDown
        style={{
          height: "16px",
          width: "16px",
          color: "#6b7280",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}
      />
    </button>
  );
};

const SelectContent: React.FC<SelectContentProps> = ({ children }) => {
  const context = useContext(SelectContext);
  if (!context) throw new Error("SelectContent must be used within Select");
  const { isOpen, triggerRef, setIsOpen } = context;

  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "bottom" | "top";
  } | null>(null);

  const computePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    const margin = 6;
    const estimatedHeight = 200;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeOnTop = spaceBelow < estimatedHeight && rect.top > spaceBelow;

    const maxHeight = Math.max(
      120,
      Math.min(260, placeOnTop ? rect.top - margin : viewportHeight - rect.bottom - margin)
    );

    setPos({
      top: placeOnTop ? rect.top - margin : rect.bottom + margin,
      left: rect.left,
      width: rect.width,
      maxHeight,
      placement: placeOnTop ? "top" : "bottom",
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    computePosition();

    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (!isOpen) return;
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  // If we cannot compute a position, avoid rendering a potentially misplaced menu.
  if (!pos) return null;

  const content = (
    <div
      style={{
        position: "fixed",
        top: pos.placement === "bottom" ? pos.top : undefined,
        bottom: pos.placement === "top" ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        backgroundColor: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        zIndex: 9999,
        maxHeight: `${pos.maxHeight}px`,
        overflow: "auto",
      }}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
};

const SelectItem: React.FC<SelectItemProps> = ({ value, children }) => {
  const context = useContext(SelectContext);
  if (!context) throw new Error("SelectItem must be used within Select");
  const { value: selectedValue, onValueChange, setIsOpen } = context;
  const isSelected = selectedValue === value;

  return (
    <button
      type="button"
      onClick={() => {
        onValueChange(value);
        setIsOpen(false);
      }}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        fontSize: "14px",
        color: "#111827",
        backgroundColor: isSelected ? "#fce7f3" : "transparent",
        border: "none",
        cursor: "pointer",
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "#f9fafb";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {children}
    </button>
  );
};

const SelectValue: React.FC<SelectValueProps> = ({ placeholder }) => {
  const context = useContext(SelectContext);
  if (!context) throw new Error("SelectValue must be used within Select");
  const { value, placeholder: ctxPlaceholder } = context;
  return <span>{value || placeholder || ctxPlaceholder || "Select..."}</span>;
};

SelectValue.displayName = "SelectValue";

Select.Trigger = SelectTrigger;
Select.Content = SelectContent;
Select.Item = SelectItem;
Select.Value = SelectValue;

export default Select;

