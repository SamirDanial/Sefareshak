import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import type { Branch } from "@/src/services/branchService";
import servingHoursService, {
  type DeliveryHours,
  type ServingHoursStatus,
} from "@/src/services/servingHoursService";
import { formatGermanAddress } from "@/src/utils/addressFormatter";

interface FreeVersionBranchInfoProps {
  branch: Branch;
}

export function FreeVersionBranchInfo({ branch }: FreeVersionBranchInfoProps) {
  const { t } = useTranslation();
  const [servingHours, setServingHours] = useState<DeliveryHours | null>(null);
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);
  const [showFullWeek, setShowFullWeek] = useState(false);

  useEffect(() => {
    const fetchServingHours = async () => {
      try {
        setServingHoursLoading(true);
        const response = await servingHoursService.getServingHours(branch.id);
        if (response.success && response.data) {
          setServingHours(response.data.hours);
          setServingHoursStatus(response.data.currentStatus);
        }
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      } finally {
        setServingHoursLoading(false);
      }
    };

    fetchServingHours();
  }, [branch.id]);

  // Get contact information with fallback to organization settings
  const phoneNumber = branch.businessPhone || branch.organization?.settings?.businessPhone;
  const emailAddress = branch.businessEmail || branch.organization?.settings?.businessEmail;
  const address = formatGermanAddress(branch.address || branch.businessAddress || branch.organization?.settings?.businessAddress);
  
  // Get coordinates with fallback to organization settings
  const latitude = branch.latitude ? Number(branch.latitude) : 
                   (branch.organization?.settings?.latitude ? Number(branch.organization.settings.latitude) : null);
  const longitude = branch.longitude ? Number(branch.longitude) : 
                    (branch.organization?.settings?.longitude ? Number(branch.organization.settings.longitude) : null);

  const handlePhonePress = () => {
    if (phoneNumber) {
      try {
        // Clean phone number - remove spaces, dashes, parentheses, etc.
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        const phoneUrl = `tel:${cleanPhone}`;
        Linking.openURL(phoneUrl);
      } catch (error) {
        console.error('Error opening phone dialer:', error);
        Alert.alert("Error", "Could not open phone dialer");
      }
    }
  };

  const handleAddressPress = () => {
    let mapUrl = "";
    if (latitude && longitude) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    } else if (address) {
      mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }

    if (mapUrl) {
      try {
        Linking.openURL(mapUrl);
      } catch (error) {
        console.error('Error opening maps:', error);
        Alert.alert("Error", "Could not open maps");
      }
    }
  };

  const handleEmailPress = () => {
    if (emailAddress) {
      try {
        const emailUrl = `mailto:${emailAddress}`;
        Linking.openURL(emailUrl);
      } catch (error) {
        console.error('Error opening email client:', error);
        Alert.alert("Error", "Could not open email client");
      }
    }
  };

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

  const getTodayHours = () => {
    if (!servingHours) return null;
    const dayIndex = new Date().getDay();
    const dayName = getDayName(dayIndex);
    return servingHours[dayName];
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

  const DAYS = [
    { key: "monday", index: 1 },
    { key: "tuesday", index: 2 },
    { key: "wednesday", index: 3 },
    { key: "thursday", index: 4 },
    { key: "friday", index: 5 },
    { key: "saturday", index: 6 },
    { key: "sunday", index: 0 },
  ] as const;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {branch.name || t("home.freeVersionBranchInfo.defaultTitle", { defaultValue: "Branch Information" })}
        </Text>
        <Text style={styles.subtitle}>
          {t("home.freeVersionBranchInfo.subtitle", { defaultValue: "Contact us for more information" })}
        </Text>
      </View>

      <View style={styles.content}>
        {/* Phone Number */}
        {phoneNumber && (
          <TouchableOpacity style={styles.contactItem} onPress={handlePhonePress}>
            <MaterialIcons name="phone" size={24} color="#ec4899" />
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>
                {t("home.freeVersionBranchInfo.phone", { defaultValue: "Phone" })}
              </Text>
              <Text style={styles.contactValue}>{phoneNumber}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}

        {/* Address */}
        {address && (
          <TouchableOpacity style={styles.contactItem} onPress={handleAddressPress}>
            <MaterialIcons name="location-on" size={24} color="#ec4899" />
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>
                {t("home.freeVersionBranchInfo.address", { defaultValue: "Address" })}
              </Text>
              <Text style={styles.contactValue} numberOfLines={2}>
                {address}
              </Text>
              {(latitude && longitude) && (
                <Text style={styles.coordinates}>
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </Text>
              )}
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}

        {/* Email */}
        {emailAddress && (
          <TouchableOpacity style={styles.contactItem} onPress={handleEmailPress}>
            <MaterialIcons name="email" size={24} color="#ec4899" />
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>
                {t("home.freeVersionBranchInfo.email", { defaultValue: "Email" })}
              </Text>
              <Text style={styles.contactValue} numberOfLines={1}>
                {emailAddress}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}

        {/* Working Hours */}
        {!servingHoursLoading && servingHours && servingHoursStatus && (
          <View style={styles.workingHoursSection}>
            <View style={styles.workingHoursHeader}>
              <View style={styles.workingHoursHeaderLeft}>
                <MaterialCommunityIcons name="clock" size={20} color="#ec4899" />
                <Text style={styles.workingHoursTitle}>
                  {t("home.servingHours.title")}
                </Text>
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
            {getTodayHours() && (
              (() => {
                const isOpen = Boolean(servingHoursStatus?.isOpen);
                return (
                  <View
                    style={[
                      styles.todayCard,
                      isOpen ? styles.todayCardOpen : styles.todayCardClosed,
                    ]}
                  >
                    <View style={styles.todayContent}>
                      <Text style={styles.todayLabel}>
                        {t("home.servingHours.today")}
                      </Text>
                      <View style={styles.todayHoursContainer}>
                        {renderServingHours(
                          getTodayHours()!,
                          18,
                          [
                            styles.todayHours,
                            isOpen ? styles.todayHoursOpen : styles.todayHoursClosed,
                          ]
                        )}
                      </View>
                      {!isOpen && (
                        <Text style={styles.todayMessage}>
                          {getServingHoursMessage(servingHoursStatus)}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        isOpen ? styles.statusBadgeOpen : styles.statusBadgeClosed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isOpen
                            ? styles.statusBadgeTextOpen
                            : styles.statusBadgeTextClosed,
                        ]}
                      >
                        {isOpen
                          ? t("home.servingHours.open")
                          : t("home.servingHours.closed")}
                      </Text>
                    </View>
                  </View>
                );
              })()
            )}

            {/* Full Week Hours */}
            {showFullWeek && (
              <View style={styles.weekContainer}>
                {DAYS.map((day) => {
                  const dayHours = servingHours[day.key];
                  const currentDayIndex = new Date().getDay();
                  const isToday = getDayName(currentDayIndex) === day.key;
                  return (
                    <View
                      key={day.key}
                      style={[styles.dayRow, isToday && styles.dayRowToday]}
                    >
                      <Text
                        style={[styles.dayLabel, isToday && styles.dayLabelToday]}
                      >
                        {t(`home.servingHours.${day.key}`)}
                      </Text>
                      <View style={styles.dayHoursContainer}>
                        {renderServingHours(
                          dayHours,
                          14,
                          isToday
                            ? { color: "#ec4899", fontWeight: "600" as const }
                            : undefined
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* No contact information available */}
        {!phoneNumber && !address && !emailAddress && (
          <View style={styles.noContactInfo}>
            <MaterialIcons name="phone" size={48} color="#6b7280" />
            <Text style={styles.noContactText}>
              {t("home.freeVersionBranchInfo.noContactInfo", { defaultValue: "No contact information available" })}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t("home.freeVersionBranchInfo.freeVersionNotice", { defaultValue: "This branch is using our free version. For full menu and ordering features, please contact us directly." })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1f2937",
    margin: 16,
    borderRadius: 12,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  content: {
    gap: 16,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    padding: 16,
    borderRadius: 8,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 16,
  },
  contactLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  coordinates: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  noContactInfo: {
    alignItems: "center",
    paddingVertical: 32,
  },
  noContactText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 12,
  },
  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  footerText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 18,
  },
  workingHoursSection: {
    marginTop: 16,
  },
  workingHoursHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  workingHoursHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workingHoursTitle: {
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
  todayHoursContainer: {
    marginTop: 4,
  },
  dayHoursContainer: {
    alignItems: "flex-end",
    flex: 1,
    marginLeft: 12,
    maxWidth: "60%",
  },
});
