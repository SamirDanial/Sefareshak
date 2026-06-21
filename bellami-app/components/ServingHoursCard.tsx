import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatInTimeZone } from "date-fns-tz";
import type {
  DeliveryHours,
  ServingHoursStatus,
} from "@/src/services/servingHoursService";

interface ServingHoursCardProps {
  hours: DeliveryHours;
  status: ServingHoursStatus;
  effectiveTimezone?: string;
}

const DAYS = [
  { key: "monday", index: 1 },
  { key: "tuesday", index: 2 },
  { key: "wednesday", index: 3 },
  { key: "thursday", index: 4 },
  { key: "friday", index: 5 },
  { key: "saturday", index: 6 },
  { key: "sunday", index: 0 },
] as const;

export default function ServingHoursCard({
  hours,
  status,
  effectiveTimezone,
}: ServingHoursCardProps) {
  const { t } = useTranslation();
  const [showFullWeek, setShowFullWeek] = useState(false);

  const formatTimeEu = (time: string | undefined | null): string => {
    if (!time) return "";
    const trimmed = String(time).trim();
    const m12 = trimmed.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i);
    if (m12) {
      const rawH = Number(m12[1]);
      const rawM = Number(m12[2] ?? "0");
      const period = m12[3].toUpperCase();
      if (Number.isFinite(rawH) && Number.isFinite(rawM)) {
        let h = rawH % 12;
        if (period === "PM") h += 12;
        return `${h.toString().padStart(2, "0")}:${rawM.toString().padStart(2, "0")}`;
      }
      return trimmed;
    }

    const m24 = trimmed.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (m24) {
      const h = Number(m24[1]);
      const m = Number(m24[2]);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      }
    }

    return trimmed;
  };

  const formatServingHours = (dayHours: {
    isOff: boolean;
    open?: string;
    close?: string;
    periods?: Array<{ open: string; close: string }>;
  }): string => {
    if (dayHours.isOff) {
      return t("home.servingHours.closed");
    }
    
    // Use periods if available
    if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
      return dayHours.periods
        .map((p) => `${formatTimeEu(p.open)} - ${formatTimeEu(p.close)}`)
        .join(", ");
    }
    
    // Fallback to single open/close
    if (!dayHours.open || !dayHours.close) {
      return t("home.servingHours.open24h");
    }
    return `${formatTimeEu(dayHours.open)} - ${formatTimeEu(dayHours.close)}`;
  };

  const renderServingHours = (
    dayHours: {
      isOff: boolean;
      open?: string;
      close?: string;
      periods?: Array<{ open: string; close: string }>;
    },
    fontSize: number = 14,
    textStyle?: any
  ): React.ReactNode => {
    if (dayHours.isOff) {
      return <Text style={[{ fontSize, color: "#9CA3AF" }, textStyle]}>{t("home.servingHours.closed")}</Text>;
    }
    
    // Use periods if available - render vertically with better spacing
    if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
      return (
        <View style={{ gap: 6 }}>
          {dayHours.periods.map((p, index) => (
            <Text key={index} style={[{ fontSize, color: textStyle?.color || "#fff", lineHeight: fontSize * 1.4 }, textStyle]}>
              {formatTimeEu(p.open)} - {formatTimeEu(p.close)}
            </Text>
          ))}
        </View>
      );
    }
    
    // Fallback to single open/close
    if (!dayHours.open || !dayHours.close) {
      return <Text style={[{ fontSize, color: textStyle?.color || "#fff" }, textStyle]}>{t("home.servingHours.open24h")}</Text>;
    }
    return <Text style={[{ fontSize, color: textStyle?.color || "#fff" }, textStyle]}>{formatTimeEu(dayHours.open)} - {formatTimeEu(dayHours.close)}</Text>;
  };

  const getDayName = (dayIndex: number): keyof DeliveryHours => {
    const days: (keyof DeliveryHours)[] = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[dayIndex];
  };

  const getZonedDayIndex0 = (tz: string): number => {
    // ISO: 1..7 (Mon..Sun)
    const iso = Number(formatInTimeZone(new Date(), tz, "i"));
    // Convert to JS: 0..6 (Sun..Sat)
    return iso === 7 ? 0 : iso;
  };

  const getTodayHours = () => {
    const dayIndex = effectiveTimezone ? getZonedDayIndex0(effectiveTimezone) : new Date().getDay();
    const dayName = getDayName(dayIndex);
    return hours[dayName];
  };

  const getServingHoursMessage = (status: ServingHoursStatus): string => {
    if (status.isOff) {
      if (status.nextOpenDay && status.nextOpenTimeString) {
        return t("home.servingHours.closedTodayNextDay", {
          day: status.nextOpenDay,
          time: formatTimeEu(status.nextOpenTimeString),
        });
      }
      return t("home.servingHours.closedToday");
    }

    if (
      status.hoursUntilOpen !== undefined &&
      status.minutesUntilOpen !== undefined
    ) {
      const parts: string[] = [];

      if (status.hoursUntilOpen > 0) {
        const hourText =
          status.hoursUntilOpen === 1
            ? t("home.servingHours.hour", { count: 1 })
            : t("home.servingHours.hours", { count: status.hoursUntilOpen });
        parts.push(`${status.hoursUntilOpen} ${hourText}`);
      }

      if (status.minutesUntilOpen > 0) {
        const minuteText =
          status.minutesUntilOpen === 1
            ? t("home.servingHours.minute", { count: 1 })
            : t("home.servingHours.minutes", {
                count: status.minutesUntilOpen,
              });
        parts.push(`${status.minutesUntilOpen} ${minuteText}`);
      }

      let message = t("home.servingHours.currentlyClosed");
      if (parts.length > 0) {
        message +=
          " " +
          t("home.servingHours.willOpenIn", {
            time: parts.join(" " + t("home.servingHours.and") + " "),
          });
      } else if (status.minutesUntilOpen === 0) {
        message += " " + t("home.servingHours.willOpenSoon");
      }

      if (status.nextOpenTimeString) {
        message +=
          " " +
          t("home.servingHours.orderWillBeServed", {
            time: formatTimeEu(status.nextOpenTimeString),
          });
      }

      return message;
    }

    return status.message || t("home.servingHours.closed");
  };

  const todayHours = getTodayHours();
  const currentDayIndex = effectiveTimezone ? getZonedDayIndex0(effectiveTimezone) : new Date().getDay();

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="clock" size={20} color="#ec4899" />
            <Text style={styles.title}>{t("home.servingHours.title")}</Text>
          </View>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowFullWeek(!showFullWeek)}
          >
            <Text style={styles.toggleButtonText}>
              {showFullWeek
                ? t("home.servingHours.hideWeek")
                : t("home.servingHours.showWeek")}
            </Text>
            <MaterialCommunityIcons
              name={showFullWeek ? "chevron-up" : "chevron-down"}
              size={16}
              color="#ec4899"
            />
          </TouchableOpacity>
        </View>

        {/* Today's Hours */}
        {todayHours && (
          <View
            style={[
              styles.todayCard,
              status.isOpen ? styles.todayCardOpen : styles.todayCardClosed,
            ]}
          >
            <View style={styles.todayContent}>
              <Text style={styles.todayLabel}>
                {t("home.servingHours.today")}
              </Text>
              <View style={styles.todayHoursContainer}>
                {renderServingHours(
                  todayHours,
                  18,
                  [
                    styles.todayHours,
                    status.isOpen ? styles.todayHoursOpen : styles.todayHoursClosed,
                  ]
                )}
              </View>
              {!status.isOpen && (
                <Text style={styles.todayMessage}>
                  {getServingHoursMessage(status)}
                </Text>
              )}
            </View>
            <View
              style={[
                styles.statusBadge,
                status.isOpen ? styles.statusBadgeOpen : styles.statusBadgeClosed,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  status.isOpen
                    ? styles.statusBadgeTextOpen
                    : styles.statusBadgeTextClosed,
                ]}
              >
                {status.isOpen
                  ? t("home.servingHours.open")
                  : t("home.servingHours.closed")}
              </Text>
            </View>
          </View>
        )}

        {/* Full Week Hours */}
        {showFullWeek && (
          <View style={styles.weekContainer}>
            {DAYS.map((day) => {
              const dayHours = hours[day.key];
              const isToday = getDayName(currentDayIndex) === day.key;
              return (
                <View
                  key={day.key}
                  style={[
                    styles.dayRow,
                    isToday && styles.dayRowToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      isToday && styles.dayLabelToday,
                    ]}
                  >
                    {t(`home.servingHours.${day.key}`)}
                  </Text>
                  <View
                    style={[
                      styles.dayHoursContainer,
                    ]}
                  >
                    {renderServingHours(dayHours, 14, isToday ? { color: "#ec4899", fontWeight: "600" } : undefined)}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#262626",
    overflow: "hidden",
  },
  cardContent: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ec4899",
  },
  todayCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  todayCardOpen: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  todayCardClosed: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  todayContent: {
    flex: 1,
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 4,
  },
  todayHours: {
    fontSize: 18,
    fontWeight: "700",
  },
  todayHoursOpen: {
    color: "#10b981",
  },
  todayHoursClosed: {
    color: "#ef4444",
  },
  todayMessage: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeOpen: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  statusBadgeClosed: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadgeTextOpen: {
    color: "#10b981",
  },
  statusBadgeTextClosed: {
    color: "#ef4444",
  },
  weekContainer: {
    marginTop: 8,
    gap: 8,
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    minHeight: 44,
  },
  dayRowToday: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D1D5DB",
    flex: 1,
    marginRight: 8,
  },
  dayLabelToday: {
    color: "#ec4899",
    fontWeight: "600",
  },
  dayHours: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  dayHoursContainer: {
    alignItems: "flex-end",
    flex: 1,
    marginLeft: 12,
    maxWidth: "60%",
  },
  dayHoursToday: {
    color: "#ec4899",
    fontWeight: "600",
  },
  todayHoursContainer: {
    marginTop: 4,
  },
});
