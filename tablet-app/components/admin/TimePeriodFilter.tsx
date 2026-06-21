import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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

const getTimePeriods = (t: (key: string) => string): Array<{
  value: TimePeriod;
  label: string;
  description: string;
}> => [
  {
    value: "today",
    label: t("admin.dashboard.timePeriods.today"),
    description: t("admin.dashboard.timePeriods.todayDescription"),
  },
  {
    value: "this_week",
    label: t("admin.dashboard.timePeriods.thisWeek"),
    description: t("admin.dashboard.timePeriods.thisWeekDescription"),
  },
  {
    value: "this_month",
    label: t("admin.dashboard.timePeriods.thisMonth"),
    description: t("admin.dashboard.timePeriods.thisMonthDescription"),
  },
  {
    value: "last_7_days",
    label: t("admin.dashboard.timePeriods.last7Days"),
    description: t("admin.dashboard.timePeriods.last7DaysDescription"),
  },
  {
    value: "last_30_days",
    label: t("admin.dashboard.timePeriods.last30Days"),
    description: t("admin.dashboard.timePeriods.last30DaysDescription"),
  },
  {
    value: "last_3_months",
    label: t("admin.dashboard.timePeriods.last3Months"),
    description: t("admin.dashboard.timePeriods.last3MonthsDescription"),
  },
  {
    value: "last_6_months",
    label: t("admin.dashboard.timePeriods.last6Months"),
    description: t("admin.dashboard.timePeriods.last6MonthsDescription"),
  },
  {
    value: "this_year",
    label: t("admin.dashboard.timePeriods.thisYear"),
    description: t("admin.dashboard.timePeriods.thisYearDescription"),
  },
];

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function TimePeriodFilter({
  selectedPeriod,
  onPeriodChange,
}: TimePeriodFilterProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const timePeriods = getTimePeriods(t);
  const selectedPeriodData = timePeriods.find(
    (p) => p.value === selectedPeriod
  );

  React.useEffect(() => {
    if (isOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen]);

  const handleSelect = (period: TimePeriod) => {
    onPeriodChange(period);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.button} onPress={() => setIsOpen(true)}>
        <MaterialCommunityIcons name="calendar" size={14} color="#ec4899" />
        <Text style={styles.buttonText}>{selectedPeriodData?.label}</Text>
        <MaterialCommunityIcons name="chevron-down" size={14} color="#ec4899" />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={handleClose}
          />
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.handleBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("admin.dashboard.timePeriods.selectTimePeriod")}</Text>
              <TouchableOpacity onPress={handleClose}>
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.optionsContainer}>
              {timePeriods.map((period) => {
                const isSelected = selectedPeriod === period.value;
                return (
                  <TouchableOpacity
                    key={period.value}
                    onPress={() => handleSelect(period.value)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={{
                        backgroundColor: "#ffffff",
                        paddingVertical: 16,
                        paddingHorizontal: 20,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: "#e5e7eb",
                        borderRadius: 12,
                        borderLeftWidth: 3,
                        borderLeftColor: isSelected ? "#ec4899" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: isSelected ? "600" : "500",
                          color: isSelected ? "#ec4899" : "#374151",
                          letterSpacing: 0.2,
                        }}
                      >
                        {period.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ec4899",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  optionsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  option: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "visible",
    zIndex: 1,
  },
  optionSelected: {
    backgroundColor: "#ec4899",
    borderLeftColor: "#ec4899",
    borderColor: "#ec4899",
  },
  optionContent: {
    flex: 1,
    zIndex: 10,
    elevation: 10,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  optionLabelSelected: {
    fontWeight: "800",
  },
  optionDescription: {
    fontSize: 14,
    fontWeight: "400",
  },
  selectedIndicator: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ec4899",
  },
});
