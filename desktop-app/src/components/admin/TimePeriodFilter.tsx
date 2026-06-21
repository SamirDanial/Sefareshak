import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, ChevronDown } from "lucide-react";

export type TimePeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_7_days"
  | "last_30_days"
  | "last_3_months"
  | "last_6_months"
  | "this_year";

interface TimePeriodFilterProps {
  selectedPeriod: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

const TimePeriodFilter: React.FC<TimePeriodFilterProps> = ({
  selectedPeriod,
  onPeriodChange,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const timePeriods: Array<{
    value: TimePeriod;
    label: string;
    description: string;
  }> = [
    {
      value: "today",
      label: t("admin.dashboard.periods.today"),
      description: t("admin.dashboard.periods.last24Hours"),
    },
    {
      value: "this_week",
      label: t("admin.dashboard.periods.thisWeek"),
      description: t("admin.dashboard.periods.currentWeek"),
    },
    {
      value: "this_month",
      label: t("admin.dashboard.periods.thisMonth"),
      description: t("admin.dashboard.periods.currentMonth"),
    },
    {
      value: "last_7_days",
      label: t("admin.dashboard.periods.last7Days"),
      description: t("admin.dashboard.periods.past7Days"),
    },
    {
      value: "last_30_days",
      label: t("admin.dashboard.periods.last30Days"),
      description: t("admin.dashboard.periods.past30Days"),
    },
    {
      value: "last_3_months",
      label: t("admin.dashboard.periods.last3Months"),
      description: t("admin.dashboard.periods.past3Months"),
    },
    {
      value: "last_6_months",
      label: t("admin.dashboard.periods.last6Months"),
      description: t("admin.dashboard.periods.past6Months"),
    },
    {
      value: "this_year",
      label: t("admin.dashboard.periods.thisYear"),
      description: t("admin.dashboard.periods.currentYear"),
    },
  ];

  const selectedPeriodData = timePeriods.find(
    (p) => p.value === selectedPeriod
  );

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          fontSize: "14px",
          fontWeight: "500",
          color: "#ec4899",
          backgroundColor: "#ffffff",
          border: "1px solid #fce7f3",
          borderRadius: "8px",
          cursor: "pointer",
          minWidth: "140px",
          justifyContent: "space-between",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#fdf2f8";
          e.currentTarget.style.borderColor = "#fbcfe8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#ffffff";
          e.currentTarget.style.borderColor = "#fce7f3";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Calendar style={{ height: "16px", width: "16px" }} />
          <span>{selectedPeriodData?.label || ""}</span>
        </div>
        <ChevronDown style={{ height: "16px", width: "16px" }} />
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 40,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              boxShadow: "0 10px 15px rgba(0, 0, 0, 0.1)",
              minWidth: "240px",
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            {timePeriods.map((period) => {
              const isSelected = selectedPeriod === period.value;

              return (
                <button
                  key={period.value}
                  onClick={() => {
                    onPeriodChange(period.value);
                    setIsOpen(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                    border: "none",
                    backgroundColor: isSelected ? "#fdf2f8" : "transparent",
                    borderLeft: isSelected ? "3px solid #ec4899" : "3px solid transparent",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    transition: "all 0.2s",
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
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: isSelected ? "#ec4899" : "#111827",
                    }}
                  >
                    {period.label}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                    }}
                  >
                    {period.description}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TimePeriodFilter;

