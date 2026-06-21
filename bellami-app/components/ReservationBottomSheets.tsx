import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FloorPlanViewer from "./FloorPlanViewer";
import type {
  Zone,
  ZoneFloorPlan,
  FloorPlanTable,
  FloorElement,
} from "@/src/services/reservationService";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ============================================
// TIME SLOT BOTTOM SHEET
// ============================================

type TimeSlotFilter = "all" | "morning" | "afternoon" | "evening";

interface TimeSlotBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  timeSlots: string[];
  selectedTime: string;
  onSelectTime: (time: string) => void;
  loading?: boolean;
  filter: TimeSlotFilter;
  onFilterChange: (filter: TimeSlotFilter) => void;
}

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const getTimeSlotPeriod = (time: string): TimeSlotFilter => {
  const [hours] = time.split(":").map(Number);
  if (hours >= 6 && hours < 12) return "morning";
  if (hours >= 12 && hours < 17) return "afternoon";
  if (hours >= 17 && hours <= 23) return "evening";
  return "all";
};

export function TimeSlotBottomSheet({
  visible,
  onClose,
  timeSlots,
  selectedTime,
  onSelectTime,
  loading = false,
  filter,
  onFilterChange,
}: TimeSlotBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Group time slots by period
  const groupedTimeSlots = useMemo(() => {
    const groups: Record<TimeSlotFilter, string[]> = {
      all: timeSlots,
      morning: [],
      afternoon: [],
      evening: [],
    };

    timeSlots.forEach((time) => {
      const period = getTimeSlotPeriod(time);
      if (period !== "all") {
        groups[period].push(time);
      }
    });

    return groups;
  }, [timeSlots]);

  const filteredTimeSlots = useMemo(() => {
    return groupedTimeSlots[filter];
  }, [groupedTimeSlots, filter]);

  const filterLabels: Record<TimeSlotFilter, string> = {
    all: t("reservations.booking.allTimes") || "All",
    morning: t("reservations.booking.morning") || "Morning",
    afternoon: t("reservations.booking.afternoon") || "Afternoon",
    evening: t("reservations.booking.evening") || "Evening",
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View />
      </Pressable>
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="clock-outline" size={20} color="#ec4899" />
            <Text style={styles.headerTitle}>
              {t("reservations.booking.selectTimeSlot") || "Select Time Slot"}
            </Text>
          </View>
          {selectedTime && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{formatTime(selectedTime)}</Text>
            </View>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        ) : timeSlots.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="clock-alert-outline" size={48} color="#6b7280" />
            <Text style={styles.emptyTitle}>
              {t("reservations.booking.noTimeSlots") || "No Time Slots Available"}
            </Text>
            <Text style={styles.emptyText}>
              {t("reservations.booking.noTimeSlotsDescription") || "Please try a different date."}
            </Text>
          </View>
        ) : (
          <>
            {/* Filter Tabs - Segmented Control */}
            <View style={styles.filterContainer}>
              <View style={styles.segmentedControl}>
                {(["all", "morning", "afternoon", "evening"] as TimeSlotFilter[]).map(
                  (period) => {
                    const count =
                      period === "all"
                        ? timeSlots.length
                        : groupedTimeSlots[period].length;
                    const isActive = filter === period;
                    const isDisabled = period !== "all" && count === 0;

                    return (
                      <TouchableOpacity
                        key={period}
                        onPress={() => !isDisabled && onFilterChange(period)}
                        disabled={isDisabled}
                        style={[
                          styles.segmentButton,
                          isActive && styles.segmentButtonActive,
                          isDisabled && styles.segmentButtonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentButtonText,
                            isActive && styles.segmentButtonTextActive,
                            isDisabled && styles.segmentButtonTextDisabled,
                          ]}
                        >
                          {filterLabels[period]} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            </View>

            {/* Time Slots Grid */}
            <ScrollView
              style={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredTimeSlots.length === 0 ? (
                <View style={styles.emptyFilterContainer}>
                  <Text style={styles.emptyFilterText}>
                    {t("reservations.booking.noSlotsInPeriod") ||
                      "No slots available in this period"}
                  </Text>
                </View>
              ) : (
                <View style={styles.timeSlotsGrid}>
                  {filteredTimeSlots.map((time) => (
                    <TouchableOpacity
                      key={time}
                      onPress={() => {
                        onSelectTime(time);
                        onClose();
                      }}
                      style={[
                        styles.timeSlotButton,
                        selectedTime === time && styles.timeSlotButtonSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeSlotText,
                          selectedTime === time && styles.timeSlotTextSelected,
                        ]}
                      >
                        {formatTime(time)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

// ============================================
// ZONE SELECTION BOTTOM SHEET
// ============================================

interface ZoneSelectionBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (zone: Zone) => void;
  loading?: boolean;
}

export function ZoneSelectionBottomSheet({
  visible,
  onClose,
  zones,
  selectedZoneId,
  onSelectZone,
  loading = false,
}: ZoneSelectionBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View />
      </Pressable>
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="map-marker" size={20} color="#ec4899" />
            <Text style={styles.headerTitle}>
              {t("reservations.booking.selectZone") || "Select Zone"}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        ) : zones.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="map-marker-off" size={48} color="#6b7280" />
            <Text style={styles.emptyTitle}>
              {t("reservations.booking.noZonesAvailable") || "No Zones Available"}
            </Text>
            <Text style={styles.emptyText}>
              {t("reservations.booking.noZonesDescription") ||
                "There are no zones configured for this branch."}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.zoneList}>
              {zones.map((zone) => {
                const isSelected = selectedZoneId === zone.id;
                const hasFloorPlan = !!zone.canvasWidth;

                return (
                  <TouchableOpacity
                    key={zone.id}
                    onPress={() => {
                      onSelectZone(zone);
                      onClose();
                    }}
                    style={[
                      styles.zoneItem,
                      isSelected && styles.zoneItemSelected,
                    ]}
                  >
                    <View style={styles.zoneIconContainer}>
                      <MaterialCommunityIcons
                        name={hasFloorPlan ? "floor-plan" : "map-marker"}
                        size={24}
                        color="#ec4899"
                      />
                    </View>
                    <View style={styles.zoneInfo}>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      {zone.description && (
                        <Text style={styles.zoneDescription} numberOfLines={2}>
                          {zone.description}
                        </Text>
                      )}
                      {hasFloorPlan && (
                        <View style={styles.floorPlanBadge}>
                          <MaterialCommunityIcons
                            name="floor-plan"
                            size={12}
                            color="#ec4899"
                          />
                          <Text style={styles.floorPlanBadgeText}>
                            {t("reservations.booking.hasFloorPlan") || "Floor Plan"}
                          </Text>
                        </View>
                      )}
                    </View>
                    {isSelected ? (
                      <View style={styles.checkmark}>
                        <MaterialCommunityIcons name="check" size={16} color="#fff" />
                      </View>
                    ) : (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={24}
                        color="#6b7280"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ============================================
// TABLE SELECTION BOTTOM SHEET
// ============================================

interface TableSelectionBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  floorPlanData: ZoneFloorPlan | null;
  selectedTableIds: string[];
  availableTableIds: string[];
  onTableSelect: (tableId: string) => void;
  numberOfGuests: number;
  loading?: boolean;
}

export function TableSelectionBottomSheet({
  visible,
  onClose,
  floorPlanData,
  selectedTableIds,
  availableTableIds,
  onTableSelect,
  numberOfGuests,
  loading = false,
}: TableSelectionBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Calculate total capacity of selected tables
  const selectedCapacity = useMemo(() => {
    if (!floorPlanData) return 0;
    return floorPlanData.tables
      .filter((t) => selectedTableIds.includes(t.id))
      .reduce((sum, t) => sum + (t.capacity || 0), 0);
  }, [floorPlanData, selectedTableIds]);

  const isCapacityMet = selectedCapacity >= numberOfGuests;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlayFull} onPress={onClose}>
        <View />
      </Pressable>
      <View
        style={[
          styles.bottomSheetFull,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="floor-plan" size={20} color="#ec4899" />
            <Text style={styles.headerTitle}>
              {floorPlanData?.name || t("reservations.booking.floorPlan") || "Floor Plan"}
            </Text>
          </View>
          {selectedTableIds.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {selectedTableIds.length} {t("reservations.booking.tablesSelected") || "selected"}
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ec4899" />
          </View>
        ) : !floorPlanData ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="floor-plan" size={48} color="#6b7280" />
            <Text style={styles.emptyTitle}>
              {t("reservations.booking.noFloorPlan") || "No Floor Plan"}
            </Text>
            <Text style={styles.emptyText}>
              {t("reservations.booking.noFloorPlanDescription") ||
                "This zone does not have a floor plan configured."}
            </Text>
          </View>
        ) : (
          <View style={styles.floorPlanContainer}>
            <Text style={styles.tableFitHint}>
              {`Tip: Try to choose table(s) that best fit ${numberOfGuests} guest${numberOfGuests === 1 ? "" : "s"}.`}
            </Text>
            <FloorPlanViewer
              canvasWidth={floorPlanData.canvasWidth || 800}
              canvasHeight={floorPlanData.canvasHeight || 600}
              tables={floorPlanData.tables}
              floorElements={floorPlanData.floorElements || []}
              selectedTableIds={selectedTableIds}
              availableTableIds={availableTableIds}
              onTableSelect={onTableSelect}
              numberOfGuests={numberOfGuests}
            />
          </View>
        )}

        {/* Footer with Done button */}
        <View style={styles.footer}>
          <View style={styles.footerCapacity}>
            <MaterialCommunityIcons
              name="account-group"
              size={18}
              color={isCapacityMet ? "#22c55e" : "#f59e0b"}
            />
            <Text
              style={[
                styles.footerCapacityText,
                { color: isCapacityMet ? "#22c55e" : "#f59e0b" },
              ]}
            >
              {selectedCapacity} / {numberOfGuests} {t("reservations.booking.seats") || "seats"}
              {isCapacityMet && " ✓"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.doneButton}
          >
            <Text style={styles.doneButtonText}>
              {t("reservations.booking.done") || "Done"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  overlayFull: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.15,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  bottomSheetFull: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#151718",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SCREEN_HEIGHT * 0.85,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#404040",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    padding: 8,
    marginLeft: 8,
    backgroundColor: "#262626",
    borderRadius: 20,
  },
  badge: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginTop: 16,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
    textAlign: "center",
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  // Filter tabs styles
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#262626",
    borderRadius: 12,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#ec4899",
  },
  segmentButtonDisabled: {
    opacity: 0.5,
  },
  segmentButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
  },
  segmentButtonTextActive: {
    color: "#fff",
  },
  segmentButtonTextDisabled: {
    color: "#6b7280",
  },
  // Time slots grid
  timeSlotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  timeSlotButton: {
    width: "31%",
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: "#262626",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#404040",
    alignItems: "center",
  },
  timeSlotButtonSelected: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#d1d5db",
  },
  timeSlotTextSelected: {
    color: "#fff",
  },
  emptyFilterContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyFilterText: {
    color: "#6b7280",
    fontSize: 14,
  },
  // Zone list styles
  zoneList: {
    gap: 12,
    paddingBottom: 16,
  },
  zoneItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262626",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "#333",
  },
  zoneItemSelected: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  zoneIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(236, 72, 153, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  zoneDescription: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
  },
  floorPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  floorPlanBadgeText: {
    fontSize: 11,
    color: "#ec4899",
    fontWeight: "500",
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ec4899",
    justifyContent: "center",
    alignItems: "center",
  },
  // Floor plan container
  floorPlanContainer: {
    flex: 1,
  },
  tableFitHint: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    color: "#9ca3af",
    fontSize: 12,
    textAlign: "center",
  },
  // Footer styles
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  footerCapacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerCapacityText: {
    fontSize: 14,
    fontWeight: "600",
  },
  doneButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

