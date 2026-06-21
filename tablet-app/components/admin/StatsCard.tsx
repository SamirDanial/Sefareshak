import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: string;
  iconColor?: string;
}

export function StatsCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  iconColor = "#9CA3AF",
}: StatsCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === 0 || change === undefined;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <MaterialCommunityIcons name={icon as any} size={16} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.value}>{value}</Text>
        {change !== undefined && (
          <View style={styles.changeContainer}>
            {isPositive && <Text style={styles.trendUp}>▲</Text>}
            {isNegative && <Text style={styles.trendDown}>▼</Text>}
            {isNeutral && <Text style={styles.neutralSymbol}>—</Text>}
            <Text
              style={[
                styles.changeText,
                isPositive && styles.changePositive,
                isNegative && styles.changeNegative,
                isNeutral && styles.changeNeutral,
              ]}
            >
              {isPositive ? "+" : ""}
              {change}%
            </Text>
            {changeLabel && (
              <Text style={styles.changeLabel}> {changeLabel}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    flex: 1,
    marginRight: 8,
  },
  content: {
    marginTop: 0,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    lineHeight: 26,
  },
  changeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 0,
    flexWrap: "wrap",
  },
  neutralSymbol: {
    fontSize: 12,
    color: "#6b7280",
    marginRight: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  changePositive: {
    color: "#22c55e",
  },
  changeNegative: {
    color: "#ef4444",
  },
  changeNeutral: {
    color: "#6b7280",
  },
  changeLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  trendUp: {
    fontSize: 10,
    color: "#22c55e",
    marginRight: 4,
  },
  trendDown: {
    fontSize: 10,
    color: "#ef4444",
    marginRight: 4,
  },
});
