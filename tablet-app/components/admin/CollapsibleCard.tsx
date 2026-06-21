import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Enable LayoutAnimation for Android
if (
  Platform.OS === "android" &&
  !Boolean((global as any)?.nativeFabricUIManager) &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleCardProps {
  titleIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  showOverride?: boolean;
  children: React.ReactNode;
}

export function CollapsibleCard({
  titleIcon,
  title,
  description,
  defaultOpen = false,
  showOverride,
  children,
}: CollapsibleCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const rotationAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotationAnim, {
      toValue: isOpen ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isOpen, rotationAnim]);

  const toggleOpen = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsOpen(!isOpen);
  };

  const rotation = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={toggleOpen}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name={titleIcon} size={18} color="#ec4899" />
          <View style={styles.titleContainer}>
            <Text style={styles.cardTitle}>{title}</Text>
            {showOverride && (
              <View style={styles.overrideBadge}>
                <Text style={styles.overrideBadgeText}>
                  {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <MaterialCommunityIcons name="chevron-down" size={18} color="#6b7280" />
        </Animated.View>
      </TouchableOpacity>
      {description && <Text style={styles.cardDescription}>{description}</Text>}
      {isOpen && <View style={styles.cardBody}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 16,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 16,
  },
  overrideBadge: {
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overrideBadgeText: {
    color: "#ec4899",
    fontSize: 10,
    fontWeight: "600",
  },
  cardDescription: {
    color: "#6b7280",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cardBody: {
    padding: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
});
