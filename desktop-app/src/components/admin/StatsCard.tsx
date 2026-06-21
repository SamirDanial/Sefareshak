import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: LucideIcon;
  iconNode?: React.ReactNode;
  iconColor?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconNode,
  iconColor = "#6b7280",
}) => {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  const isNeutral = change === 0 || change === undefined;

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "#6b7280",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {iconNode ? (
          <div style={{ color: iconColor }}>{iconNode}</div>
        ) : Icon ? (
          <Icon
            style={{
              height: "20px",
              width: "20px",
              color: iconColor,
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: "700",
          color: "#111827",
          marginBottom: "8px",
        }}
      >
        {value}
      </div>
      {change !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "12px",
            color: "#6b7280",
          }}
        >
          {isPositive && (
            <TrendingUp
              style={{
                height: "14px",
                width: "14px",
                color: "#10b981",
                marginRight: "4px",
              }}
            />
          )}
          {isNegative && (
            <TrendingDown
              style={{
                height: "14px",
                width: "14px",
                color: "#ef4444",
                marginRight: "4px",
              }}
            />
          )}
          {isNeutral && (
            <span style={{ marginRight: "4px", width: "14px" }}>—</span>
          )}
          <span
            style={{
              color: isPositive
                ? "#10b981"
                : isNegative
                ? "#ef4444"
                : "#6b7280",
            }}
          >
            {isPositive ? "+" : ""}
            {change}%
          </span>
          {changeLabel && (
            <span style={{ marginLeft: "4px" }}>{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatsCard;

