import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
  disabledText?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
  noResultsText = "No results",
  disabledText = "Select branch first",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node;
      const clickedInsideContainer = containerRef.current?.contains(target);
      const clickedInsideMenu = menuRef.current?.contains(target);
      if (!clickedInsideContainer && !clickedInsideMenu) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }

    const updateRect = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuRect({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };

    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const displayText = selected?.label || placeholder;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => {
            const next = !v;
            if (!next) setQuery("");
            return next;
          });
        }}
        style={{
          width: "100%",
          height: "40px",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "0 12px",
          fontSize: "14px",
          color: disabled ? "#9ca3af" : selected ? "#111827" : "#6b7280",
          backgroundColor: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {disabled && !selected ? disabledText : displayText}
        </span>
        <span style={{ opacity: 0.6, flexShrink: 0, fontSize: "12px" }}>▾</span>
      </button>

      {open && menuRect
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuRect.top,
                left: menuRect.left,
                width: menuRect.width,
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                padding: "8px",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                zIndex: 999999,
              }}
            >
              {searchable && (
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  autoFocus
                  style={{
                    width: "100%",
                    height: "36px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "0 10px",
                    fontSize: "14px",
                    outline: "none",
                    marginBottom: "8px",
                  }}
                />
              )}

              <div
                style={{
                  maxHeight: "240px",
                  overflowY: "auto",
                  border: "1px solid #f3f4f6",
                  borderRadius: "8px",
                }}
              >
                {filtered.length === 0 ? (
                  <div style={{ padding: "10px", fontSize: "14px", color: "#6b7280" }}>
                    {noResultsText}
                  </div>
                ) : (
                  filtered.map((option) => {
                    const isSelected = option.value === value;
                    const isDisabled = option.disabled;
                    return (
                      <button
                        type="button"
                        key={option.value}
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          onChange(option.value);
                          setOpen(false);
                          setQuery("");
                        }}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          fontSize: "14px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          border: "none",
                          backgroundColor: isSelected ? "#f9fafb" : "transparent",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          textAlign: "left",
                          opacity: isDisabled ? 0.5 : 1,
                          color: isDisabled ? "#9ca3af" : "#111827",
                        }}
                        onMouseEnter={(e) => {
                          if (!isDisabled) e.currentTarget.style.backgroundColor = "#f9fafb";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isSelected ? "#f9fafb" : "transparent";
                        }}
                      >
                        <span style={{ width: "16px", flexShrink: 0 }}>{isSelected ? "✓" : ""}</span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {option.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default SearchableSelect;
