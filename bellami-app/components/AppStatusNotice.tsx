import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type AppStatus = "LIVE" | "COMING_SOON" | "MAINTENANCE" | "OUT_OF_SERVICE";

interface AppStatusNoticeProps {
  status: AppStatus;
  className?: string;
}

const statusDetails: Record<
  AppStatus,
  {
    key: "live" | "comingSoon" | "maintenance" | "outOfService";
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    iconColor: string;
    badgeColor: string;
    borderColor: string;
  }
> = {
  LIVE: {
    key: "live",
    icon: "shimmer",
    iconColor: "#10b981",
    badgeColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  COMING_SOON: {
    key: "comingSoon",
    icon: "clock",
    iconColor: "#f59e0b",
    badgeColor: "rgba(245, 158, 11, 0.2)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  MAINTENANCE: {
    key: "maintenance",
    icon: "wrench",
    iconColor: "#3b82f6",
    badgeColor: "rgba(59, 130, 246, 0.2)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  OUT_OF_SERVICE: {
    key: "outOfService",
    icon: "power",
    iconColor: "#ef4444",
    badgeColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
};

export default function AppStatusNotice({
  status,
}: AppStatusNoticeProps) {
  const { t } = useTranslation();
  const details = statusDetails[status] ?? statusDetails.LIVE;
  
  const statusKeyMap: Record<string, string> = {
    LIVE: "live",
    COMING_SOON: "comingSoon",
    MAINTENANCE: "maintenance",
    OUT_OF_SERVICE: "outOfService",
  };
  const translationKey = statusKeyMap[status] || "live";

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconBadge, { backgroundColor: details.badgeColor, borderColor: details.borderColor }]}>
          <MaterialCommunityIcons name={details.icon} size={40} color={details.iconColor} />
        </View>
        
        <View style={styles.textContainer}>
          <Text style={styles.bannerLabel}>
            {t("appStatus.bannerLabel")}
          </Text>
          <Text style={styles.title}>
            {t(`appStatus.states.${translationKey}.title`)}
          </Text>
        </View>
        
        <Text style={styles.description}>
          {t(`appStatus.states.${translationKey}.description`)}
        </Text>
        
        <Text style={styles.retryText}>
          {t("appStatus.retry")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    width: "100%",
  },
  content: {
    width: "100%",
    maxWidth: 500,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
    backgroundColor: "rgba(17, 17, 17, 0.95)",
    padding: 40,
    alignItems: "center",
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginHorizontal: "auto",
  },
  iconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 2,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  bannerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 24,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
    textAlign: "center",
  },
});
