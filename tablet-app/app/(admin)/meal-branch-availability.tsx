import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { Toast } from "@/components/Toast";

import { useAuthRole } from "@/src/contexts/AuthContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useBranch } from "@/src/contexts/BranchContext";
import ApiService from "@/src/services/apiService";
import { mealService, type MealBranchAvailability } from "@/src/services/mealService";

type AvailabilityWindowDraft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

const DAY_KEYS: Array<
  "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"
> = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatTimeString = (d: Date): string => {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const parseTimeStringToDate = (time: string): Date => {
  const now = new Date();
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((time || "").trim());
  if (!m) return now;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  return d;
};

export default function MealBranchAvailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mealId?: string; mealName?: string }>();
  const mealId = params.mealId;
  const mealName = typeof params.mealName === "string" ? params.mealName : "";
  const { getToken } = useAuthRole();

  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [records, setRecords] = useState<Record<string, MealBranchAvailability | null>>({});

  const { selectedBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const setSelectedBranchId = (id: string) => setSelectedBranch(id);
  const [isAllWeek, setIsAllWeek] = useState(true);
  const [windows, setWindows] = useState<AvailabilityWindowDraft[]>([]);

  const [branchPickerVisible, setBranchPickerVisible] = useState(false);
  const [dayPickerState, setDayPickerState] = useState<{ visible: boolean; windowIndex: number }>({
    visible: false,
    windowIndex: -1,
  });

  const [timePickerState, setTimePickerState] = useState<{
    visible: boolean;
    date: Date;
    windowIndex: number;
    field: "startTime" | "endTime";
  }>({
    visible: false,
    date: new Date(),
    windowIndex: 0,
    field: "startTime",
  });

  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" }>({
    visible: false,
    message: "",
    type: "success",
  });

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  };

  const getUnusedDay = (currentWindows: AvailabilityWindowDraft[]): number | null => {
    const used = new Set(currentWindows.map((w) => w.dayOfWeek));
    for (let d = 0; d <= 6; d++) {
      if (!used.has(d)) return d;
    }
    return null;
  };

  const updateWindowDay = (windowIndex: number, newDay: number) => {
    setWindows((prev) => {
      const existsElsewhere = prev.some((w, idx) => idx !== windowIndex && w.dayOfWeek === newDay);
      if (existsElsewhere) return prev;
      return prev.map((w, idx) => (idx === windowIndex ? { ...w, dayOfWeek: newDay } : w));
    });
  };

  const updateWindowTime = (windowIndex: number, field: "startTime" | "endTime", value: string) => {
    setWindows((prev) => prev.map((w, idx) => (idx === windowIndex ? { ...w, [field]: value } : w)));
  };

  const handleTimePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setTimePickerState((prev) => ({ ...prev, visible: false }));
    }

    if (event.type === "set" && selectedDate) {
      const timeStr = formatTimeString(selectedDate);
      updateWindowTime(timePickerState.windowIndex, timePickerState.field, timeStr);

      if (Platform.OS === "ios") {
        setTimePickerState((prev) => ({ ...prev, date: selectedDate }));
      }
    } else if (event.type === "dismissed") {
      setTimePickerState((prev) => ({ ...prev, visible: false }));
    }
  };

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const authToken = token || undefined;
      const apiService = ApiService.getInstance();

      try {
        const result = await apiService.get("/api/admin/branches", authToken);
        if (result.success && result.data) {
          setBranches(result.data);
          return result.data;
        }
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isForbidden = msg.includes("status: 403");
        if (!isForbidden) {
          throw err;
        }
      }

      const fallbackResult = await apiService.get("/api/user/branches/my", authToken);
      if (fallbackResult.success && fallbackResult.data) {
        setBranches(fallbackResult.data);
        return fallbackResult.data;
      }

      setBranches([]);
      return [];
    } catch (error) {
      console.error("Error loading branches:", error);
      setBranches([]);
      return [];
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadRecords = async (id: string) => {
    try {
      const token = await getToken();
      const rows = await mealService.getMealBranchAvailability(id, token || undefined);
      const map: Record<string, MealBranchAvailability | null> = {};
      for (const r of rows || []) {
        map[r.branchId] = r;
      }
      setRecords(map);
      return map;
    } catch (error) {
      console.error("Failed to load branch availability:", error);
      setRecords({});
      return {};
    }
  };

  const applyForBranch = (branchId: string, recMap?: Record<string, MealBranchAvailability | null>) => {
    const map = recMap ?? records;
    setSelectedBranchId(branchId);
    const rec = map[branchId];

    if (rec) {
      setIsAllWeek(Boolean(rec.isAvailableAllWeek));
      const nextWindows = Array.isArray(rec.windows)
        ? rec.windows
            .map((w) => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }))
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        : [];
      setWindows(nextWindows);
      return;
    }

    setIsAllWeek(true);
    setWindows([]);
  };

  const loadAll = async (opts?: { silent?: boolean }) => {
    if (!mealId) return;

    try {
      if (!opts?.silent) {
        setLoading(true);
      }

      const [nextBranches, nextRecords] = await Promise.all([loadBranches(), loadRecords(mealId)]);

      const branchList = Array.isArray(nextBranches) ? nextBranches : [];
      const currentIsValid = selectedBranchId && branchList.some((b: any) => b.id === selectedBranchId);
      const targetBranchId = currentIsValid ? selectedBranchId : (branchList[0]?.id || "");
      if (targetBranchId) {
        applyForBranch(targetBranchId, nextRecords);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branchLoading) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealId, branchLoading]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadAll({ silent: true });
    } finally {
      setRefreshing(false);
    }
  };

  const canSave = useMemo(() => {
    if (!mealId) return false;
    if (!selectedBranchId) return false;
    if (saving) return false;
    return true;
  }, [mealId, selectedBranchId, saving]);

  const handleSave = async () => {
    if (!mealId) return;
    if (!selectedBranchId) return;

    try {
      setSaving(true);
      const token = await getToken();

      const payload = {
        branchId: selectedBranchId,
        isAvailableAllWeek: isAllWeek,
        windows: isAllWeek
          ? []
          : windows.map((w) => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime })),
      };

      const saved = await mealService.upsertMealBranchAvailability(mealId, payload, token || undefined);

      setRecords((prev) => ({ ...prev, [selectedBranchId]: saved }));

      setToast({
        visible: true,
        message: t("admin.menuManagement.branchAvailabilitySaved", { defaultValue: "Availability saved" }),
        type: "success",
      });

      setTimeout(() => {
        router.back();
      }, 350);
    } catch (error) {
      console.error("Failed to save availability:", error);
      setToast({
        visible: true,
        message: t("admin.menuManagement.branchAvailabilitySaveError"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AnimatedHeader title={t("admin.menuManagement.branchAvailability")} onBackPress={() => router.back()} />
        <View style={[styles.loadingContainer, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("admin.menuManagement.loading")}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedHeader title={t("admin.menuManagement.branchAvailability")} onBackPress={() => router.back()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: 140 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
      >
        <View style={styles.content}>
          {mealName ? <Text style={styles.mealName}>{mealName}</Text> : null}

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{t("admin.menuManagement.branch")}</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => {
                  if (loadingBranches) return;
                  setBranchPickerVisible(true);
                }}
              >
                <Text style={styles.selectText} numberOfLines={1}>
                  {selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name || t("admin.menuManagement.selectBranch")
                    : t("admin.menuManagement.selectBranch")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{t("admin.menuManagement.branchAvailabilityAllWeek")}</Text>
                <Text style={styles.hint}>{t("admin.menuManagement.branchAvailabilityAllWeekHint")}</Text>
              </View>
              <Switch
                value={isAllWeek}
                onValueChange={(v) => setIsAllWeek(v)}
                trackColor={{ false: "#e5e7eb", true: "#ec4899" }}
                thumbColor={isAllWeek ? "#fff" : "#9ca3af"}
              />
            </View>
          </View>

          {!isAllWeek && (
            <View style={styles.card}>
              <View style={styles.windowsHeader}>
                <Text style={styles.label}>{t("admin.menuManagement.branchAvailabilityWindows")}</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    const nextDay = getUnusedDay(windows);
                    if (nextDay === null) return;
                    setWindows((prev) => [...prev, { dayOfWeek: nextDay, startTime: "09:00", endTime: "17:00" }]);
                  }}
                  disabled={getUnusedDay(windows) === null}
                >
                  <MaterialCommunityIcons name="plus" size={14} color="#ec4899" />
                  <Text style={styles.addButtonText}>{t("admin.menuManagement.addWindow", { defaultValue: "Add" })}</Text>
                </TouchableOpacity>
              </View>

              {windows.length === 0 ? <Text style={styles.hint}>{t("admin.menuManagement.noWindows")}</Text> : null}

              {windows.map((w, idx) => {
                const usedDays = new Set(windows.filter((_, i) => i !== idx).map((x) => x.dayOfWeek));

                return (
                  <View key={`${w.dayOfWeek}-${idx}`} style={styles.windowCard}>
                    <View style={styles.windowHeader}>
                      <TouchableOpacity
                        style={styles.daySelect}
                        onPress={() => setDayPickerState({ visible: true, windowIndex: idx })}
                      >
                        <Text style={styles.dayText}>{t(`home.servingHours.${DAY_KEYS[w.dayOfWeek]}`)}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => setWindows((prev) => prev.filter((_, i) => i !== idx))}>
                        <MaterialCommunityIcons name="delete" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.timeRow}>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          setTimePickerState({
                            visible: true,
                            date: parseTimeStringToDate(w.startTime),
                            windowIndex: idx,
                            field: "startTime",
                          })
                        }
                      >
                        <Text style={styles.timeLabel}>{t("admin.menuManagement.branchAvailabilityStart")}</Text>
                        <Text style={styles.timeValue}>{w.startTime}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          setTimePickerState({
                            visible: true,
                            date: parseTimeStringToDate(w.endTime),
                            windowIndex: idx,
                            field: "endTime",
                          })
                        }
                      >
                        <Text style={styles.timeLabel}>{t("admin.menuManagement.branchAvailabilityEnd")}</Text>
                        <Text style={styles.timeValue}>{w.endTime}</Text>
                      </TouchableOpacity>
                    </View>

                    {dayPickerState.visible && dayPickerState.windowIndex === idx ? (
                      <Modal
                        visible={dayPickerState.visible}
                        transparent
                        animationType="fade"
                        onRequestClose={() => setDayPickerState((prev) => ({ ...prev, visible: false }))}
                      >
                        <Pressable
                          style={styles.modalOverlay}
                          onPress={() => setDayPickerState((prev) => ({ ...prev, visible: false }))}
                        >
                          <Pressable style={styles.dayPickerContent} onPress={(e) => e.stopPropagation()}>
                            {DAY_KEYS.map((k, dayNum) => {
                              const disabled = usedDays.has(dayNum);
                              const selected = w.dayOfWeek === dayNum;

                              return (
                                <TouchableOpacity
                                  key={k}
                                  style={[
                                    styles.dayPickerItem,
                                    selected && styles.dayPickerItemActive,
                                    disabled && !selected && styles.dayPickerItemDisabled,
                                  ]}
                                  onPress={() => {
                                    if (disabled && !selected) return;
                                    updateWindowDay(idx, dayNum);
                                    setDayPickerState((prev) => ({ ...prev, visible: false }));
                                  }}
                                  disabled={disabled && !selected}
                                >
                                  <Text
                                    style={[
                                      styles.dayPickerItemText,
                                      selected && styles.dayPickerItemTextActive,
                                      disabled && !selected && styles.dayPickerItemTextDisabled,
                                    ]}
                                  >
                                    {t(`home.servingHours.${k}`)}
                                  </Text>
                                  {selected ? <MaterialCommunityIcons name="check" size={18} color="#ec4899" /> : null}
                                </TouchableOpacity>
                              );
                            })}
                          </Pressable>
                        </Pressable>
                      </Modal>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={saving}>
          <Text style={styles.cancelText}>{t("common.cancel")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={!canSave}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="check-circle" size={16} color="#fff" />
          )}
          <Text style={styles.saveText}>{saving ? t("admin.menuManagement.saving") : t("common.save")}</Text>
        </TouchableOpacity>
      </View>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        topOffset={headerHeight + 12}
      />

      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />

      <Modal
        visible={branchPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBranchPickerVisible(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setBranchPickerVisible(false)}>
          <Pressable style={styles.bottomSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.menuManagement.selectBranch")}</Text>
              <TouchableOpacity onPress={() => setBranchPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bottomSheetBody} keyboardShouldPersistTaps="handled">
              {loadingBranches ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : (
                branches.map((b) => {
                  const selected = b.id === selectedBranchId;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.bottomSheetOption, selected && styles.bottomSheetOptionActive]}
                      onPress={() => {
                        applyForBranch(b.id);
                        setBranchPickerVisible(false);
                      }}
                    >
                      <Text style={[styles.bottomSheetOptionText, selected && styles.bottomSheetOptionTextActive]}>
                        {b.name}
                      </Text>
                      {selected ? <MaterialCommunityIcons name="check-circle" size={18} color="#ec4899" /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {timePickerState.visible ? (
        Platform.OS === "ios" ? (
          <Modal
            visible={timePickerState.visible}
            transparent
            animationType="slide"
            onRequestClose={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.timePickerModalContent}>
                <View style={styles.timePickerHeader}>
                  <Text style={styles.timePickerTitle}>
                    {timePickerState.field === "startTime"
                      ? t("admin.menuManagement.branchAvailabilityStart")
                      : t("admin.menuManagement.branchAvailabilityEnd")}
                  </Text>
                  <TouchableOpacity onPress={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}>
                    <MaterialCommunityIcons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.timePickerContainer}>
                  <DateTimePicker
                    value={timePickerState.date}
                    mode="time"
                    is24Hour={false}
                    display="spinner"
                    onChange={handleTimePickerChange}
                    textColor="#fff"
                    themeVariant="dark"
                    style={styles.timePicker}
                  />
                </View>

                <View style={styles.timePickerActions}>
                  <TouchableOpacity
                    style={[styles.timePickerButton, styles.timePickerButtonCancel]}
                    onPress={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
                  >
                    <Text style={styles.timePickerButtonTextCancel}>{t("common.cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.timePickerButton, styles.timePickerButtonConfirm]}
                    onPress={() => {
                      const timeStr = formatTimeString(timePickerState.date);
                      updateWindowTime(timePickerState.windowIndex, timePickerState.field, timeStr);
                      setTimePickerState((prev) => ({ ...prev, visible: false }));
                    }}
                  >
                    <Text style={styles.timePickerButtonTextConfirm}>{t("common.confirm")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={timePickerState.date}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={handleTimePickerChange}
            textColor="#fff"
            themeVariant="dark"
            positiveButton={{ label: t("common.confirm"), textColor: "#ec4899" }}
            negativeButton={{ label: t("common.cancel"), textColor: "#9CA3AF" }}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  mealName: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 14,
  },
  row: {
    gap: 10,
  },
  label: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectText: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  windowsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.35)",
    backgroundColor: "rgba(236, 72, 153, 0.12)",
  },
  addButtonText: {
    color: "#ec4899",
    fontWeight: "700",
    fontSize: 12,
  },
  windowCard: {
    marginTop: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 12,
  },
  windowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  daySelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dayText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeButton: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  timeLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  timeValue: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#ec4899",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    opacity: 1,
  },
  saveText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  dayPickerContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    overflow: "hidden",
  },
  dayPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dayPickerItemActive: {
    backgroundColor: "rgba(236, 72, 153, 0.12)",
  },
  dayPickerItemDisabled: {
    opacity: 0.4,
  },
  dayPickerItemText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  dayPickerItemTextActive: {
    color: "#ec4899",
  },
  dayPickerItemTextDisabled: {
    color: "#9ca3af",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: "75%",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  bottomSheetBody: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bottomSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.12)",
  },
  bottomSheetOptionText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
  },
  timePickerModalContent: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  timePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#f3f4f6",
  },
  timePickerTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  timePickerContainer: {
    padding: 16,
    alignItems: "center",
  },
  timePicker: {
    width: 300,
    height: 180,
  },
  timePickerActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  timePickerButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timePickerButtonCancel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  timePickerButtonConfirm: {
    backgroundColor: "#ec4899",
  },
  timePickerButtonTextCancel: {
    color: "#E5E7EB",
    fontWeight: "700",
  },
  timePickerButtonTextConfirm: {
    color: "#fff",
    fontWeight: "700",
  },
});
