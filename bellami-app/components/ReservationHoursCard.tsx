import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatInTimeZone } from "date-fns-tz";
import type { ReservationSettings } from "@/src/services/reservationService";

interface ReservationHoursCardProps {
  settings: ReservationSettings;
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

// Convert 24-hour format (e.g., "11:00") to 12-hour format (e.g., "11:00 AM")
const formatTime12Hour = (time24: string | undefined | null): string => {
  if (!time24) return "";

  const trimmed = String(time24).trim();
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

// Check if current time is within operating hours
const isCurrentlyOpen = (
  openTime: string | undefined | null,
  closeTime: string | undefined | null,
  tz?: string
): boolean => {
  if (!openTime || !closeTime) return false;

  const currentTimeMinutes = (() => {
    if (!tz) {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    }

    const currentHours = Number(formatInTimeZone(new Date(), tz, "H"));
    const currentMinutes = Number(formatInTimeZone(new Date(), tz, "m"));
    return currentHours * 60 + currentMinutes;
  })();
  
  const [openHours, openMins] = openTime.split(":").map(Number);
  const [closeHours, closeMins] = closeTime.split(":").map(Number);
  
  const openTimeMinutes = openHours * 60 + openMins;
  const closeTimeMinutes = closeHours * 60 + closeMins;
  
  // Handle case where closing time is next day (e.g., 22:00 - 02:00)
  if (closeTimeMinutes < openTimeMinutes) {
    return currentTimeMinutes >= openTimeMinutes || currentTimeMinutes <= closeTimeMinutes;
  }
  
  return currentTimeMinutes >= openTimeMinutes && currentTimeMinutes <= closeTimeMinutes;
};

export default function ReservationHoursCard({
  settings,
  effectiveTimezone,
}: ReservationHoursCardProps) {
  const { t } = useTranslation();
  const [showFullWeek, setShowFullWeek] = useState(false);

  const getDayHours = (dayKey: string) => {
    const openKey = `${dayKey}Open` as keyof ReservationSettings;
    const closeKey = `${dayKey}Close` as keyof ReservationSettings;
    const openTime = settings[openKey] as string | undefined;
    const closeTime = settings[closeKey] as string | undefined;
    
    return {
      open: openTime,
      close: closeTime,
      isOff: !openTime || !closeTime,
    };
  };

  const formatHours = (dayHours: {
    isOff: boolean;
    open?: string;
    close?: string;
  }): string => {
    if (dayHours.isOff) {
      return t("home.reservationHours.closed") || "Closed";
    }
    
    const openFormatted = formatTime12Hour(dayHours.open);
    const closeFormatted = formatTime12Hour(dayHours.close);
    
    return `${openFormatted} - ${closeFormatted}`;
  };

  const renderHours = (
    dayHours: {
      isOff: boolean;
      open?: string;
      close?: string;
    },
    fontSize: number = 14,
    textStyle?: any
  ): React.ReactNode => {
    if (dayHours.isOff) {
      return (
        <Text style={[{ fontSize, color: "#9CA3AF" }, textStyle]}>
          {t("home.reservationHours.closed") || "Closed"}
        </Text>
      );
    }
    
    const openFormatted = formatTime12Hour(dayHours.open);
    const closeFormatted = formatTime12Hour(dayHours.close);
    
    return (
      <Text style={[{ fontSize, color: textStyle?.color || "#fff" }, textStyle]}>
        {openFormatted} - {closeFormatted}
      </Text>
    );
  };

  const getDayName = (dayIndex: number): string => {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
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
    return getDayHours(dayName);
  };

  const todayHours = getTodayHours();
  const currentDayIndex = effectiveTimezone ? getZonedDayIndex0(effectiveTimezone) : new Date().getDay();
  const isOpen = useMemo(() => {
    if (todayHours.isOff || !todayHours.open || !todayHours.close) return false;
    return isCurrentlyOpen(todayHours.open, todayHours.close, effectiveTimezone);
  }, [todayHours, effectiveTimezone]);

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="calendar-clock" size={20} color="#ec4899" />
            <Text style={styles.title}>
              {t("home.reservationHours.title") || "Reservation Hours"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowFullWeek(!showFullWeek)}
          >
            <Text style={styles.toggleButtonText}>
              {showFullWeek
                ? t("home.reservationHours.hideWeek") || "Hide Week"
                : t("home.reservationHours.showWeek") || "Show Week"}
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
              isOpen && !todayHours.isOff ? styles.todayCardOpen : styles.todayCardClosed,
            ]}
          >
            <View style={styles.todayContent}>
              <Text style={styles.todayLabel}>
                {t("home.reservationHours.today") || "Today"}
              </Text>
              <View style={styles.todayHoursContainer}>
                {renderHours(
                  todayHours,
                  18,
                  [
                    styles.todayHours,
                    isOpen && !todayHours.isOff ? styles.todayHoursOpen : styles.todayHoursClosed,
                  ]
                )}
              </View>
            </View>
            <View
              style={[
                styles.statusBadge,
                isOpen && !todayHours.isOff ? styles.statusBadgeOpen : styles.statusBadgeClosed,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isOpen && !todayHours.isOff
                    ? styles.statusBadgeTextOpen
                    : styles.statusBadgeTextClosed,
                ]}
              >
                {isOpen && !todayHours.isOff
                  ? t("home.reservationHours.open") || "Open"
                  : t("home.reservationHours.closed") || "Closed"}
              </Text>
            </View>
          </View>
        )}

        {/* Full Week Hours */}
        {showFullWeek && (
          <View style={styles.weekContainer}>
            {DAYS.map((day) => {
              const dayHours = getDayHours(day.key);
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
                    {t(`home.reservationHours.${day.key}`) || day.key.charAt(0).toUpperCase() + day.key.slice(1)}
                  </Text>
                  <View style={styles.dayHoursContainer}>
                    {renderHours(dayHours, 14, isToday ? { color: "#ec4899", fontWeight: "600" } : undefined)}
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
  dayHoursContainer: {
    alignItems: "flex-end",
    flex: 1,
    marginLeft: 12,
    maxWidth: "60%",
  },
  todayHoursContainer: {
    marginTop: 4,
  },
});

