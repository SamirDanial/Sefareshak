import React, { useEffect, useMemo, useRef, useState } from "react";

type Branch = {
  id: string;
  name: string;
};

type Props = {
  branches: Branch[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
};

const BranchSearchSelect: React.FC<Props> = ({
  branches,
  value,
  onValueChange,
  placeholder = "Select branch",
  disabled,
  searchPlaceholder = "Search...",
  noResultsText = "No results",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => branches.find((b) => b.id === value) || null,
    [branches, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => (b.name || "").toLowerCase().includes(q));
  }, [branches, query]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
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
          color: "#111827",
          backgroundColor: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selected ? "#111827" : "#6b7280",
          }}
        >
          {selected?.name || placeholder}
        </span>
        <span style={{ opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "8px",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            style={{
              width: "100%",
              height: "32px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "0 10px",
              fontSize: "12px",
              outline: "none",
            }}
          />

          <div
            style={{
              marginTop: "8px",
              maxHeight: "240px",
              overflowY: "auto",
              border: "1px solid #f3f4f6",
              borderRadius: "8px",
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: "10px", fontSize: "12px", color: "#6b7280" }}>
                {noResultsText}
              </div>
            ) : (
              filtered.map((branch) => {
                const isSelected = branch.id === value;
                return (
                  <button
                    type="button"
                    key={branch.id}
                    onClick={() => {
                      onValueChange(branch.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      border: "none",
                      backgroundColor: isSelected ? "#f9fafb" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected
                        ? "#f9fafb"
                        : "transparent";
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
                      {branch.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BranchSearchSelect;
