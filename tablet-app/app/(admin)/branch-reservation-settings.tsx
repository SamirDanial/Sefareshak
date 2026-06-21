import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import {
  reservationService,
  type ReservationSettings,
  type ReservationTier,
  type ExcludedDatesPayload,
} from "@/src/services/reservationService";
import ApiService from "@/src/services/apiService";

interface ToastState {
  visible: boolean;
  message: string;
  type: "success" | "error" | "info";
}

interface DateRange {
  id: string;
  start: string;
  end: string;
}

const DEFAULT_TIER: ReservationTier = "SIMPLE";
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export default function BranchReservationSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ branchId?: string }>();
  const branchId = params.branchId;
  const { getToken } = useAuthRole();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const { width: windowWidth } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [globalSettings, setGlobalSettings] = useState<Partial<ReservationSettings>>({});
  const [formData, setFormData] = useState<Partial<ReservationSettings>>({
    tier: DEFAULT_TIER,
  });
  const [branchOverrides, setBranchOverrides] = useState<Set<string>>(new Set());
  const [excludedSingleDates, setExcludedSingleDates] = useState<string[]>([]);
  const [excludedDateRanges, setExcludedDateRanges] = useState<DateRange[]>([]);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    type: "success",
  });
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<"date" | "time">("date");
  const [datePickerContext, setDatePickerContext] = useState<
    | { type: "single" }
    | { type: "range-start"; rangeId: string }
    | { type: "range-end"; rangeId: string }
    | { type: "time"; dayKey: string; slot: "open" | "close" }
    | null
  >(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(() => new Date());
  const [tierModalVisible, setTierModalVisible] = useState(false);
  const isWideLayout = useMemo(() => {
    return typeof windowWidth === "number" ? windowWidth >= 900 : false;
  }, [windowWidth]);

  const daysOfWeek = useMemo(() => [
    { key: "monday", label: t("admin.reservationSettings.operatingHours.monday") },
    { key: "tuesday", label: t("admin.reservationSettings.operatingHours.tuesday") },
    { key: "wednesday", label: t("admin.reservationSettings.operatingHours.wednesday") },
    { key: "thursday", label: t("admin.reservationSettings.operatingHours.thursday") },
    { key: "friday", label: t("admin.reservationSettings.operatingHours.friday") },
    { key: "saturday", label: t("admin.reservationSettings.operatingHours.saturday") },
    { key: "sunday", label: t("admin.reservationSettings.operatingHours.sunday") },
  ], [t]);

  useEffect(() => {
    if (branchId) {
      loadSettings();
    }
  }, [branchId]);

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

  const parseExcludedDates = (
    raw: ReservationSettings["excludedDates"]
  ): ExcludedDatesPayload => {
    if (!raw) {
      return { singleDates: [], dateRanges: [] };
    }

    try {
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        return {
          singleDates: parsed.singleDates || [],
          dateRanges: parsed.dateRanges || [],
        };
      }

      return {
        singleDates: raw.singleDates || [],
        dateRanges: raw.dateRanges || [],
      };
    } catch (error) {
      console.warn("Failed to parse excluded dates:", error);
      return { singleDates: [], dateRanges: [] };
    }
  };

  const loadSettings = async () => {
    if (!branchId) return;

    try {
      if (!refreshing) {
        setLoading(true);
      }
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();

      // Load branch info
      const branchResult = await apiService.get(`/api/admin/branches/${branchId}`, token);
      if (branchResult.success && branchResult.data) {
        setBranchName(branchResult.data.name || "Unknown Branch");
      }

      // Load global settings as defaults
      const global = await reservationService.getSettings(token);
      setGlobalSettings(global);

      // Load merged settings (global + branch overrides)
      const mergedResult = await apiService.get(`/api/reservations/settings?branchId=${branchId}`, token);
      const merged = mergedResult.success ? mergedResult.data : mergedResult;

      // Determine which fields are overridden by checking branch data
      const branchData = branchResult.data;
      const overrides = new Set<string>();

      if (branchData.reservationIsEnabled !== null && branchData.reservationIsEnabled !== undefined) {
        overrides.add("isEnabled");
      }
      if (branchData.reservationTier) {
        overrides.add("tier");
      }
      if (branchData.reservationTimeSlotInterval !== null && branchData.reservationTimeSlotInterval !== undefined) {
        overrides.add("timeSlotInterval");
      }
      if (branchData.reservationMaxGuestsPerReservation !== null && branchData.reservationMaxGuestsPerReservation !== undefined) {
        overrides.add("maxGuestsPerReservation");
      }
      if (branchData.reservationMinAdvanceBookingHours !== null && branchData.reservationMinAdvanceBookingHours !== undefined) {
        overrides.add("minAdvanceBookingHours");
      }
      if (branchData.reservationMaxAdvanceBookingDays !== null && branchData.reservationMaxAdvanceBookingDays !== undefined) {
        overrides.add("maxAdvanceBookingDays");
      }
      if (branchData.reservationModificationWindowHours !== null && branchData.reservationModificationWindowHours !== undefined) {
        overrides.add("modificationWindowHours");
      }
      if (branchData.reservationAllowSameDayBooking !== null && branchData.reservationAllowSameDayBooking !== undefined) {
        overrides.add("allowSameDayBooking");
      }
      if (branchData.reservationAllowCancellation !== null && branchData.reservationAllowCancellation !== undefined) {
        overrides.add("allowCancellation");
      }
      if (branchData.reservationEnablePreOrder !== null && branchData.reservationEnablePreOrder !== undefined) {
        overrides.add("enablePreOrder");
      }
      if (branchData.reservationPreOrderMinAmount !== null && branchData.reservationPreOrderMinAmount !== undefined) {
        overrides.add("preOrderMinAmount");
      }
      if (branchData.reservationFullRefundHoursBefore !== null && branchData.reservationFullRefundHoursBefore !== undefined) {
        overrides.add("fullRefundHoursBefore");
      }
      if (branchData.reservationPartialRefundHoursBefore !== null && branchData.reservationPartialRefundHoursBefore !== undefined) {
        overrides.add("partialRefundHoursBefore");
      }
      if (branchData.reservationNoRefundHoursBefore !== null && branchData.reservationNoRefundHoursBefore !== undefined) {
        overrides.add("noRefundHoursBefore");
      }
      if ((branchData as any).reservationDepositPercentage !== null && (branchData as any).reservationDepositPercentage !== undefined) {
        overrides.add("depositPercentage");
      }
      if ((branchData as any).reservationAllowedPaymentMethods !== null && (branchData as any).reservationAllowedPaymentMethods !== undefined) {
        overrides.add("allowedPaymentMethods");
      }
      if (branchData.reservationMaxCapacityPerTimeSlot !== null && branchData.reservationMaxCapacityPerTimeSlot !== undefined) {
        overrides.add("maxCapacityPerTimeSlot");
      }
      if (branchData.reservationBufferTimeMinutes !== null && branchData.reservationBufferTimeMinutes !== undefined) {
        overrides.add("bufferTimeMinutes");
      }

      // Check day fields
      daysOfWeek.forEach((day) => {
        const dayKey = day.key.charAt(0).toUpperCase() + day.key.slice(1);
        const openValue = branchData[`reservation${dayKey}Open` as keyof typeof branchData];
        const closeValue = branchData[`reservation${dayKey}Close` as keyof typeof branchData];
        if (openValue !== null && openValue !== undefined) {
          overrides.add(`${day.key}Open`);
        }
        if (closeValue !== null && closeValue !== undefined) {
          overrides.add(`${day.key}Close`);
        }
      });

      setBranchOverrides(overrides);

      // Ensure tier defaults to "SIMPLE" if not set
      const tierValue: ReservationTier =
        merged.tier && (merged.tier === "SIMPLE" || merged.tier === "MEDIUM" || merged.tier === "COMPLEX")
          ? merged.tier
          : DEFAULT_TIER;
      
      // Handle depositPercentage - use merged value, fallback to global, then default
      let depositPercentage = 100; // default
      if (merged.depositPercentage !== undefined && merged.depositPercentage !== null) {
        depositPercentage = Number(merged.depositPercentage);
      } else if (globalSettings.depositPercentage !== undefined && globalSettings.depositPercentage !== null) {
        depositPercentage = Number(globalSettings.depositPercentage);
      }
      
      // Handle allowedPaymentMethods - use EXACT database value, no defaults unless completely missing
      // If database has null/undefined/empty array, use that - don't default
      let allowedPaymentMethods: string[] = [];
      if (merged.allowedPaymentMethods !== undefined) {
        // Branch has a value (even if null or empty)
        if (merged.allowedPaymentMethods === null) {
          allowedPaymentMethods = [];
        } else if (Array.isArray(merged.allowedPaymentMethods)) {
          allowedPaymentMethods = merged.allowedPaymentMethods;
        } else {
          allowedPaymentMethods = [];
        }
      } else if (globalSettings.allowedPaymentMethods !== undefined) {
        // Fallback to global value
        if (globalSettings.allowedPaymentMethods === null) {
          allowedPaymentMethods = [];
        } else if (Array.isArray(globalSettings.allowedPaymentMethods)) {
          allowedPaymentMethods = globalSettings.allowedPaymentMethods;
        } else {
          allowedPaymentMethods = [];
        }
      } else {
        // Both are completely missing - only then use default
        allowedPaymentMethods = ["ONLINE_CARD", "PAYPAL"];
      }
      
      setFormData({
        ...merged,
        tier: tierValue,
        depositPercentage,
        allowedPaymentMethods,
      });

      // Load excluded dates
      const parsedExcluded = parseExcludedDates(merged.excludedDates);
      setExcludedSingleDates(parsedExcluded.singleDates);
      setExcludedDateRanges(
        parsedExcluded.dateRanges.map((range, index) => ({
          id: `${range.start}-${range.end}-${index}`,
          ...range,
        }))
      );
    } catch (error: any) {
      console.error("Error loading settings:", error);
      showToast("error", error.message || t("admin.branchManagement.reservationSettings.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSettings();
  };

  const showToast = (type: ToastState["type"], message: string) => {
    setToast({ visible: true, type, message });
  };

  const handleInputChange = (key: keyof ReservationSettings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Track if this field is now overridden
    const globalValue = globalSettings[key];
    const isExplicitlySet = value !== undefined;
    const isOverridden =
      key === "isEnabled"
        ? isExplicitlySet
        : isExplicitlySet && (value !== globalValue || value === null || value === "");

    setBranchOverrides((prev) => {
      const next = new Set(prev);
      if (isOverridden) {
        next.add(key as string);
      } else if (value === undefined) {
        next.delete(key as string);
      }
      return next;
    });
  };

  const handleDayChange = (day: string, field: "Open" | "Close", value: string) => {
    const fieldKey = `${day.toLowerCase()}${field}` as keyof ReservationSettings;
    const finalValue = value === "" ? "" : (value || undefined);
    handleInputChange(fieldKey, finalValue);
  };

  const isOverridden = (field: string) => branchOverrides.has(field);

  const validateDateString = (value: string) => DATE_REGEX.test(value.trim());

  const formatDateToISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseISOToDate = (value?: string) => {
    if (!value || !validateDateString(value)) return new Date();
    const [year, month, day] = value.split("-").map((part) => Number(part));
    return new Date(year, month - 1, day);
  };

  const formatDateForDisplay = (date: string) => {
    if (!validateDateString(date)) return date;
    const dateObj = new Date(`${date}T00:00:00`);
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = dateObj.toLocaleString("en-US", { month: "short" }).replace(".", "");
    const shortYear = String(dateObj.getFullYear()).slice(-2);
    return `${day}-${month}-${shortYear}`;
  };

  const parseTimeToDate = (value?: string) => {
    const date = new Date();
    if (value && /^\d{2}:\d{2}$/.test(value)) {
      const [hours, minutes] = value.split(":").map(Number);
      date.setHours(hours, minutes, 0, 0);
    } else {
      date.setHours(12, 0, 0, 0);
    }
    return date;
  };

  const openDatePicker = (
    context:
      | { type: "single" }
      | { type: "range-start"; rangeId: string }
      | { type: "range-end"; rangeId: string },
    initialDate: Date
  ) => {
    setDatePickerMode("date");
    setDatePickerContext(context);
    setDatePickerValue(initialDate);
    setDatePickerVisible(true);
  };

  const openTimePicker = (dayKey: string, slot: "open" | "close", initialDate: Date) => {
    setDatePickerMode("time");
    setDatePickerContext({ type: "time", dayKey, slot });
    setDatePickerValue(initialDate);
    setDatePickerVisible(true);
  };

  const applyPickedDate = (pickedDate: Date) => {
    if (!datePickerContext) return;
    if (datePickerContext.type === "time") {
      const hours = String(pickedDate.getHours()).padStart(2, "0");
      const minutes = String(pickedDate.getMinutes()).padStart(2, "0");
      handleDayChange(
        datePickerContext.dayKey,
        datePickerContext.slot === "open" ? "Open" : "Close",
        `${hours}:${minutes}`
      );
      return;
    }

    const iso = formatDateToISO(pickedDate);
    if (datePickerContext.type === "single") {
      handleSingleDatePicked(iso);
    } else {
      updateDateRange(
        datePickerContext.rangeId,
        datePickerContext.type === "range-start" ? "start" : "end",
        iso
      );
    }
  };

  const handleSingleDatePicked = (dateISO: string) => {
    if (excludedSingleDates.includes(dateISO)) {
      showToast("error", t("admin.reservationSettings.excludedDates.dateAlreadyExcluded"));
      return;
    }
    setExcludedSingleDates([...excludedSingleDates, dateISO].sort());
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const removeSingleDate = (date: string) => {
    setExcludedSingleDates(excludedSingleDates.filter((d) => d !== date));
    if (excludedSingleDates.length === 1 && excludedDateRanges.length === 0) {
      setBranchOverrides((prev) => {
        const next = new Set(prev);
        next.delete("excludedDates");
        return next;
      });
    }
  };

  const addDateRange = () => {
    setExcludedDateRanges([
      ...excludedDateRanges,
      { id: `${Date.now()}`, start: "", end: "" },
    ]);
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const updateDateRange = (id: string, field: "start" | "end", value: string) => {
    const updated = excludedDateRanges.map((range) =>
      range.id === id ? { ...range, [field]: value.trim() } : range
    );
    setExcludedDateRanges(updated);
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const removeDateRange = (id: string) => {
    setExcludedDateRanges(excludedDateRanges.filter((range) => range.id !== id));
    if (excludedDateRanges.length === 1 && excludedSingleDates.length === 0) {
      setBranchOverrides((prev) => {
        const next = new Set(prev);
        next.delete("excludedDates");
        return next;
      });
    }
  };

  const handleSave = async () => {
    if (!branchId) return;

    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;

      const apiService = ApiService.getInstance();
      const branchUpdate: any = {};

      // Only include fields that are overridden
      if (branchOverrides.has("isEnabled")) {
        branchUpdate.reservationIsEnabled = formData.isEnabled;
      } else {
        branchUpdate.reservationIsEnabled = null;
      }

      if (branchOverrides.has("tier")) {
        branchUpdate.reservationTier = formData.tier;
      } else {
        branchUpdate.reservationTier = null;
      }

      if (branchOverrides.has("timeSlotInterval")) {
        branchUpdate.reservationTimeSlotInterval = formData.timeSlotInterval;
      } else {
        branchUpdate.reservationTimeSlotInterval = null;
      }

      if (branchOverrides.has("maxGuestsPerReservation")) {
        branchUpdate.reservationMaxGuestsPerReservation = formData.maxGuestsPerReservation;
      } else {
        branchUpdate.reservationMaxGuestsPerReservation = null;
      }

      if (branchOverrides.has("minAdvanceBookingHours")) {
        branchUpdate.reservationMinAdvanceBookingHours = formData.minAdvanceBookingHours;
      } else {
        branchUpdate.reservationMinAdvanceBookingHours = null;
      }

      if (branchOverrides.has("maxAdvanceBookingDays")) {
        branchUpdate.reservationMaxAdvanceBookingDays = formData.maxAdvanceBookingDays;
      } else {
        branchUpdate.reservationMaxAdvanceBookingDays = null;
      }

      if (branchOverrides.has("modificationWindowHours")) {
        branchUpdate.reservationModificationWindowHours = formData.modificationWindowHours;
      } else {
        branchUpdate.reservationModificationWindowHours = null;
      }

      if (branchOverrides.has("allowSameDayBooking")) {
        branchUpdate.reservationAllowSameDayBooking = formData.allowSameDayBooking;
      } else {
        branchUpdate.reservationAllowSameDayBooking = null;
      }

      if (branchOverrides.has("allowCancellation")) {
        branchUpdate.reservationAllowCancellation = formData.allowCancellation;
      } else {
        branchUpdate.reservationAllowCancellation = null;
      }

      if (branchOverrides.has("enablePreOrder")) {
        branchUpdate.reservationEnablePreOrder = formData.enablePreOrder;
      } else {
        branchUpdate.reservationEnablePreOrder = null;
      }

      if (branchOverrides.has("preOrderMinAmount")) {
        branchUpdate.reservationPreOrderMinAmount = formData.preOrderMinAmount;
      } else {
        branchUpdate.reservationPreOrderMinAmount = null;
      }

      if (branchOverrides.has("depositPercentage")) {
        branchUpdate.reservationDepositPercentage = formData.depositPercentage;
      } else {
        branchUpdate.reservationDepositPercentage = null;
      }

      if (branchOverrides.has("allowedPaymentMethods")) {
        branchUpdate.reservationAllowedPaymentMethods = formData.allowedPaymentMethods;
      } else {
        branchUpdate.reservationAllowedPaymentMethods = null;
      }

      if (branchOverrides.has("fullRefundHoursBefore")) {
        branchUpdate.reservationFullRefundHoursBefore = formData.fullRefundHoursBefore;
      } else {
        branchUpdate.reservationFullRefundHoursBefore = null;
      }

      if (branchOverrides.has("partialRefundHoursBefore")) {
        branchUpdate.reservationPartialRefundHoursBefore = formData.partialRefundHoursBefore;
      } else {
        branchUpdate.reservationPartialRefundHoursBefore = null;
      }

      if (branchOverrides.has("noRefundHoursBefore")) {
        branchUpdate.reservationNoRefundHoursBefore = formData.noRefundHoursBefore;
      } else {
        branchUpdate.reservationNoRefundHoursBefore = null;
      }

      if (branchOverrides.has("maxCapacityPerTimeSlot")) {
        branchUpdate.reservationMaxCapacityPerTimeSlot = formData.maxCapacityPerTimeSlot;
      } else {
        branchUpdate.reservationMaxCapacityPerTimeSlot = null;
      }

      if (branchOverrides.has("bufferTimeMinutes")) {
        branchUpdate.reservationBufferTimeMinutes = formData.bufferTimeMinutes;
      } else {
        branchUpdate.reservationBufferTimeMinutes = null;
      }

      // Day fields
      daysOfWeek.forEach((day) => {
        const dayKey = day.key.charAt(0).toUpperCase() + day.key.slice(1);
        const openKey = `${day.key}Open`;
        const closeKey = `${day.key}Close`;

        if (branchOverrides.has(openKey)) {
          const openValue = formData[openKey as keyof ReservationSettings];
          branchUpdate[`reservation${dayKey}Open`] = openValue === undefined ? null : (openValue === "" ? "" : openValue);
        } else {
          branchUpdate[`reservation${dayKey}Open`] = null;
        }

        if (branchOverrides.has(closeKey)) {
          const closeValue = formData[closeKey as keyof ReservationSettings];
          branchUpdate[`reservation${dayKey}Close`] = closeValue === undefined ? null : (closeValue === "" ? "" : closeValue);
        } else {
          branchUpdate[`reservation${dayKey}Close`] = null;
        }
      });

      // Excluded dates
      if (branchOverrides.has("excludedDates") || excludedSingleDates.length > 0 || excludedDateRanges.length > 0) {
        const excludedDates = {
          singleDates: excludedSingleDates,
          dateRanges: excludedDateRanges
            .filter((range) => validateDateString(range.start) && validateDateString(range.end))
            .map((range) => ({ start: range.start, end: range.end })),
        };
        branchUpdate.reservationExcludedDates = excludedDates;
      } else {
        branchUpdate.reservationExcludedDates = null;
      }

      const response = await apiService.put(`/api/admin/branches/${branchId}`, branchUpdate, token);
      showToast("success", t("admin.branchManagement.reservationSettings.saveSuccess"));
      await loadSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      showToast("error", error.message || t("admin.branchManagement.reservationSettings.saveError"));
    } finally {
      setSaving(false);
    }
  };

  // Only show full-screen loader when loading and no data exists
  const hasData = formData.tier !== undefined;
  if (loading && !hasData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>
          {t("admin.reservationSettings.loadingTitle")}
        </Text>
        <Text style={styles.loadingSubText}>
          {t("admin.reservationSettings.loadingDescription")}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <AnimatedHeader
        title={t("admin.branchManagement.reservationSettingsAction") || "Branch Reservation"}
        onBackPress={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 24,
          paddingBottom: 40,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
      >
        <View style={styles.topRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.screenTitle}>
              {t("admin.branchManagement.reservationSettings.title", { branchName }) ||
                `Reservation Settings for ${branchName}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="check" size={16} color="#fff" />
            )}
            <Text style={styles.saveButtonText}>
              {saving
                ? t("admin.branchManagement.reservationSettings.saving") || "Saving..."
                : t("common.update") || "Update"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.screenSubtitle}>
            {t("admin.branchManagement.reservationSettings.description") ||
              "Configure reservation settings for this branch. Fields left unchanged inherit from global settings."}
          </Text>
        </View>

        {/* System Settings */}
        <CollapsibleCard
          titleIcon="cog"
          title={t("admin.reservationSettings.systemSettings.title")}
          description={t("admin.reservationSettings.systemSettings.description")}
          showOverride={isOverridden("isEnabled")}
        >
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t("admin.reservationSettings.systemSettings.enableReservations")}
              </Text>
              <Text style={styles.helpText}>
                {t("admin.reservationSettings.systemSettings.enableReservationsDescription")}
              </Text>
            </View>
            <Switch
              value={!!formData.isEnabled}
              onValueChange={(value) => handleInputChange("isEnabled", value)}
              trackColor={{ false: "#d1d5db", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#d1d5db"
            />
          </View>

          {formData.isEnabled && (
            <View style={styles.tierContainer}>
              <Text style={styles.label}>
                {t("admin.reservationSettings.systemSettings.tierSelection")}
              </Text>
              <TouchableOpacity
                style={styles.tierDropdown}
                onPress={() => setTierModalVisible(true)}
              >
                <Text style={styles.tierDropdownText}>
                  {formData.tier === "SIMPLE"
                    ? t("admin.reservationSettings.systemSettings.tierSimple")
                    : formData.tier === "COMPLEX"
                    ? t("admin.reservationSettings.systemSettings.tierComplex")
                    : t("admin.reservationSettings.systemSettings.tierSimple")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#374151" />
              </TouchableOpacity>
              <Text style={styles.helpText}>
                {formData.tier === "SIMPLE" &&
                  t("admin.reservationSettings.systemSettings.tierSimpleDescription")}
                {formData.tier === "COMPLEX" &&
                  t("admin.reservationSettings.systemSettings.tierComplexDescription")}
              </Text>
            </View>
          )}
        </CollapsibleCard>

        {formData.isEnabled && (
          <>
            {/* Operating Hours */}
            <CollapsibleCard
              titleIcon="clock"
              title={t("admin.reservationSettings.operatingHours.title")}
              description={t("admin.reservationSettings.operatingHours.description")}
            >
              {daysOfWeek.map((day) => {
                const openTime = formData[`${day.key}Open` as keyof ReservationSettings] as string | undefined;
                const closeTime = formData[`${day.key}Close` as keyof ReservationSettings] as string | undefined;
                const isDaySet = !!(openTime && closeTime);
                const isDayOverridden = isOverridden(`${day.key}Open`) || isOverridden(`${day.key}Close`);

                return (
                  <View key={day.key} style={styles.dayRow}>
                    <View style={styles.dayLabelContainer}>
                      <Text style={styles.dayLabel}>{day.label}</Text>
                      {isDayOverridden && (
                        <View style={styles.overrideBadge}>
                          <Text style={styles.overrideBadgeText}>
                            {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.timeInputs}>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          openTimePicker(
                            day.key,
                            "open",
                            parseTimeToDate(openTime)
                          )
                        }
                      >
                        <MaterialCommunityIcons name="clock" size={16} color="#ec4899" />
                        <Text style={styles.timeButtonText} numberOfLines={1}>
                          {openTime || t("admin.reservationSettings.operatingHours.openTime")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          openTimePicker(
                            day.key,
                            "close",
                            parseTimeToDate(closeTime)
                          )
                        }
                      >
                        <MaterialCommunityIcons name="clock" size={16} color="#ec4899" />
                        <Text style={styles.timeButtonText} numberOfLines={1}>
                          {closeTime || t("admin.reservationSettings.operatingHours.closeTime")}
                        </Text>
                      </TouchableOpacity>
                      {isDaySet && (
                        <TouchableOpacity
                          style={styles.clearDayButton}
                          onPress={() => {
                            handleDayChange(day.key, "Open", "");
                            handleDayChange(day.key, "Close", "");
                          }}
                        >
                          <MaterialCommunityIcons name="close-circle" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </CollapsibleCard>

            {/* Booking Rules */}
            <CollapsibleCard
              titleIcon="calendar"
              title={t("admin.reservationSettings.bookingRules.title")}
              description={t("admin.reservationSettings.bookingRules.description")}
            >
              <NumberInput
                label={t("admin.reservationSettings.bookingRules.timeSlotInterval")}
                value={
                  formData.timeSlotInterval != null
                    ? String(formData.timeSlotInterval)
                    : ""
                }
                placeholder={t("admin.reservationSettings.bookingRules.timeSlotIntervalPlaceholder")}
                helperText={t("admin.reservationSettings.bookingRules.timeSlotIntervalDescription")}
                showOverride={isOverridden("timeSlotInterval")}
                onChangeText={(text) =>
                  handleInputChange(
                    "timeSlotInterval",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCell : undefined}
              />
              <NumberInput
                label={t("admin.reservationSettings.bookingRules.maxGuestsPerReservation")}
                value={
                  formData.maxGuestsPerReservation != null
                    ? String(formData.maxGuestsPerReservation)
                    : ""
                }
                placeholder={t("admin.reservationSettings.bookingRules.maxGuestsPlaceholder")}
                showOverride={isOverridden("maxGuestsPerReservation")}
                onChangeText={(text) =>
                  handleInputChange(
                    "maxGuestsPerReservation",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCell : undefined}
              />
              <NumberInput
                label={t("admin.reservationSettings.bookingRules.minAdvanceBooking")}
                value={
                  formData.minAdvanceBookingHours != null
                    ? String(formData.minAdvanceBookingHours)
                    : ""
                }
                placeholder={t("admin.reservationSettings.bookingRules.minAdvanceBookingPlaceholder")}
                helperText={t("admin.reservationSettings.bookingRules.minAdvanceBookingDescription")}
                showOverride={isOverridden("minAdvanceBookingHours")}
                onChangeText={(text) =>
                  handleInputChange(
                    "minAdvanceBookingHours",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCell : undefined}
              />
              <NumberInput
                label={t("admin.reservationSettings.bookingRules.maxAdvanceBooking")}
                value={
                  formData.maxAdvanceBookingDays != null
                    ? String(formData.maxAdvanceBookingDays)
                    : ""
                }
                placeholder={t("admin.reservationSettings.bookingRules.maxAdvanceBookingPlaceholder")}
                showOverride={isOverridden("maxAdvanceBookingDays")}
                onChangeText={(text) =>
                  handleInputChange(
                    "maxAdvanceBookingDays",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCell : undefined}
              />
              <NumberInput
                label={t("admin.reservationSettings.bookingRules.modificationWindow")}
                value={
                  formData.modificationWindowHours != null
                    ? String(formData.modificationWindowHours)
                    : ""
                }
                placeholder={t("admin.reservationSettings.bookingRules.modificationWindowPlaceholder")}
                helperText={t("admin.reservationSettings.bookingRules.modificationWindowDescription")}
                showOverride={isOverridden("modificationWindowHours")}
                onChangeText={(text) =>
                  handleInputChange(
                    "modificationWindowHours",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCellFull : undefined}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      {t("admin.reservationSettings.bookingRules.allowSameDayBooking")}
                    </Text>
                    {isOverridden("allowSameDayBooking") && (
                      <View style={styles.overrideBadge}>
                        <Text style={styles.overrideBadgeText}>
                          {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.helpText}>
                    {t("admin.reservationSettings.bookingRules.allowSameDayBookingDescription")}
                  </Text>
                </View>
                <Switch
                  value={formData.allowSameDayBooking !== false}
                  onValueChange={(value) =>
                    handleInputChange("allowSameDayBooking", value)
                  }
                  trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                  thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                  ios_backgroundColor="#f3f4f6"
                />
              </View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      {t("admin.reservationSettings.bookingRules.allowCancellation")}
                    </Text>
                    {isOverridden("allowCancellation") && (
                      <View style={styles.overrideBadge}>
                        <Text style={styles.overrideBadgeText}>
                          {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.helpText}>
                    {t("admin.reservationSettings.bookingRules.allowCancellationDescription")}
                  </Text>
                </View>
                <Switch
                  value={formData.allowCancellation !== false}
                  onValueChange={(value) =>
                    handleInputChange("allowCancellation", value)
                  }
                  trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                  thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                  ios_backgroundColor="#f3f4f6"
                />
              </View>
            </CollapsibleCard>

            {/* Pre-Order Settings */}
            <CollapsibleCard
              titleIcon="shopping"
              title={t("admin.reservationSettings.preOrderSettings.title")}
              description={t("admin.reservationSettings.preOrderSettings.description")}
            >
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      {t("admin.reservationSettings.preOrderSettings.enablePreOrder")}
                    </Text>
                    {isOverridden("enablePreOrder") && (
                      <View style={styles.overrideBadge}>
                        <Text style={styles.overrideBadgeText}>
                          {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.helpText}>
                    {t("admin.reservationSettings.preOrderSettings.enablePreOrderDescription")}
                  </Text>
                </View>
                <Switch
                  value={formData.enablePreOrder !== false}
                  onValueChange={(value) =>
                    handleInputChange("enablePreOrder", value)
                  }
                  trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                  thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                  ios_backgroundColor="#f3f4f6"
                />
              </View>

              {formData.enablePreOrder !== false && (
                <>
                  <NumberInput
                    label={t("admin.reservationSettings.preOrderSettings.minimumOrderAmount")}
                    value={
                      formData.preOrderMinAmount != null
                        ? String(formData.preOrderMinAmount)
                        : ""
                    }
                    placeholder={t("admin.reservationSettings.preOrderSettings.minimumOrderAmountPlaceholder")}
                    showOverride={isOverridden("preOrderMinAmount")}
                    onChangeText={(text) =>
                      handleInputChange(
                        "preOrderMinAmount",
                        text === "" ? undefined : Number(text.replace(/[^0-9.]/g, ""))
                      )
                    }
                  />
                  <View style={styles.separator} />
                  <View style={styles.labelRow}>
                    <Text style={styles.sectionTitle}>
                      {t("admin.reservationSettings.preOrderSettings.depositAndPayment")}
                    </Text>
                    {(isOverridden("depositPercentage") || isOverridden("allowedPaymentMethods")) && (
                      <View style={styles.overrideBadge}>
                        <Text style={styles.overrideBadgeText}>
                          {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <NumberInput
                    label={t("admin.reservationSettings.preOrderSettings.depositPercentage")}
                    value={
                      formData.depositPercentage != null
                        ? String(formData.depositPercentage)
                        : ""
                    }
                    placeholder="0-100"
                    showOverride={isOverridden("depositPercentage")}
                    onChangeText={(text) => {
                      if (text === "") {
                        // Allow empty string - user is typing, don't force a value
                        handleInputChange("depositPercentage", undefined);
                        return;
                      }
                      const cleanedText = text.replace(/[^0-9.]/g, "");
                      if (cleanedText === "") {
                        handleInputChange("depositPercentage", undefined);
                        return;
                      }
                      const numValue = Number(cleanedText);
                      if (isNaN(numValue)) {
                        return;
                      }
                      const clampedValue = Math.max(0, Math.min(100, numValue));
                      handleInputChange("depositPercentage", clampedValue);
                    }}
                  />
                  <Text style={styles.helpText}>
                    {t("admin.reservationSettings.preOrderSettings.depositPercentageDescription")}
                  </Text>
                  <View style={styles.separator} />
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>
                      {t("admin.reservationSettings.preOrderSettings.allowedPaymentMethods")}
                    </Text>
                    {isOverridden("allowedPaymentMethods") && (
                      <View style={styles.overrideBadge}>
                        <Text style={styles.overrideBadgeText}>
                          {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.checkboxRow}>
                    <TouchableOpacity
                      style={styles.checkboxContainer}
                      onPress={() => {
                        const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
                        if (current.includes("ONLINE_CARD")) {
                          handleInputChange("allowedPaymentMethods", current.filter((m) => m !== "ONLINE_CARD"));
                        } else {
                          handleInputChange("allowedPaymentMethods", [...current, "ONLINE_CARD"]);
                        }
                      }}
                    >
                      <View style={[
                        styles.checkbox,
                        Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("ONLINE_CARD") && styles.checkboxChecked
                      ]}>
                        {Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("ONLINE_CARD") && (
                          <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>
                        {t("admin.reservationSettings.preOrderSettings.paymentMethodOnlineCard")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.checkboxRow}>
                    <TouchableOpacity
                      style={styles.checkboxContainer}
                      onPress={() => {
                        const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
                        if (current.includes("PAYPAL")) {
                          handleInputChange("allowedPaymentMethods", current.filter((m) => m !== "PAYPAL"));
                        } else {
                          handleInputChange("allowedPaymentMethods", [...current, "PAYPAL"]);
                        }
                      }}
                    >
                      <View style={[
                        styles.checkbox,
                        Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("PAYPAL") && styles.checkboxChecked
                      ]}>
                        {Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("PAYPAL") && (
                          <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>
                        {t("admin.reservationSettings.preOrderSettings.paymentMethodPayPal")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.checkboxRow}>
                    <TouchableOpacity
                      style={styles.checkboxContainer}
                      onPress={() => {
                        const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
                        if (current.includes("NONE")) {
                          handleInputChange("allowedPaymentMethods", current.filter((m) => m !== "NONE"));
                        } else {
                          handleInputChange("allowedPaymentMethods", [...current, "NONE"]);
                        }
                      }}
                    >
                      <View style={[
                        styles.checkbox,
                        Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("NONE") && styles.checkboxChecked
                      ]}>
                        {Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("NONE") && (
                          <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>
                        {t("admin.reservationSettings.preOrderSettings.paymentMethodNone")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.helpText}>
                    {t("admin.reservationSettings.preOrderSettings.allowedPaymentMethodsDescription")}
                  </Text>
                  <View style={styles.separator} />
                  <Text style={styles.sectionTitle}>
                    {t("admin.reservationSettings.preOrderSettings.cancellationRefundPolicy")}
                  </Text>
                  <View style={styles.gridRow}>
                    <NumberInput
                      label={t("admin.reservationSettings.preOrderSettings.fullRefundHoursBefore")}
                      value={
                        formData.fullRefundHoursBefore != null
                          ? String(formData.fullRefundHoursBefore)
                          : ""
                      }
                      placeholder={t("admin.reservationSettings.preOrderSettings.fullRefundPlaceholder")}
                      showOverride={isOverridden("fullRefundHoursBefore")}
                      onChangeText={(text) =>
                        handleInputChange(
                          "fullRefundHoursBefore",
                          text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                        )
                      }
                    />
                    <NumberInput
                      label={t("admin.reservationSettings.preOrderSettings.partialRefundHoursBefore")}
                      value={
                        formData.partialRefundHoursBefore != null
                          ? String(formData.partialRefundHoursBefore)
                          : ""
                      }
                      placeholder={t("admin.reservationSettings.preOrderSettings.partialRefundPlaceholder")}
                      showOverride={isOverridden("partialRefundHoursBefore")}
                      onChangeText={(text) =>
                        handleInputChange(
                          "partialRefundHoursBefore",
                          text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                        )
                      }
                    />
                  </View>
                  <NumberInput
                    label={t("admin.reservationSettings.preOrderSettings.noRefundHoursBefore")}
                    value={
                      formData.noRefundHoursBefore != null
                        ? String(formData.noRefundHoursBefore)
                        : ""
                    }
                    placeholder={t("admin.reservationSettings.preOrderSettings.noRefundPlaceholder")}
                    showOverride={isOverridden("noRefundHoursBefore")}
                    onChangeText={(text) =>
                      handleInputChange(
                        "noRefundHoursBefore",
                        text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                      )
                    }
                  />
                </>
              )}
            </CollapsibleCard>

            {/* Advanced Settings */}
            <CollapsibleCard
              titleIcon="tune-vertical"
              title={t("admin.reservationSettings.advancedSettings.title")}
              description={t("admin.reservationSettings.advancedSettings.description")}
            >
              <NumberInput
                label={t("admin.reservationSettings.advancedSettings.maxCapacityPerTimeSlot")}
                value={
                  formData.maxCapacityPerTimeSlot != null
                    ? String(formData.maxCapacityPerTimeSlot)
                    : ""
                }
                placeholder={t("admin.reservationSettings.advancedSettings.maxCapacityPlaceholder")}
                helperText={t("admin.reservationSettings.advancedSettings.maxCapacityDescription")}
                showOverride={isOverridden("maxCapacityPerTimeSlot")}
                onChangeText={(text) =>
                  handleInputChange(
                    "maxCapacityPerTimeSlot",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCell : undefined}
              />
              <NumberInput
                label={t("admin.reservationSettings.advancedSettings.bufferTimeMinutes")}
                value={
                  formData.bufferTimeMinutes != null
                    ? String(formData.bufferTimeMinutes)
                    : ""
                }
                placeholder={t("admin.reservationSettings.advancedSettings.bufferTimePlaceholder")}
                helperText={t("admin.reservationSettings.advancedSettings.bufferTimeDescription")}
                showOverride={isOverridden("bufferTimeMinutes")}
                onChangeText={(text) =>
                  handleInputChange(
                    "bufferTimeMinutes",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
                containerStyle={isWideLayout ? styles.twoColCell : undefined}
              />
            </CollapsibleCard>

            {/* Excluded Dates */}
            <CollapsibleCard
              titleIcon="calendar-alert"
              title={t("admin.reservationSettings.excludedDates.title")}
              description={t("admin.reservationSettings.excludedDates.description")}
              showOverride={isOverridden("excludedDates")}
            >
              <Text style={styles.sectionTitle}>
                {t("admin.reservationSettings.excludedDates.singleExcludedDates")}
              </Text>
              <TouchableOpacity
                style={styles.dateSelectButton}
                onPress={() =>
                  openDatePicker(
                    { type: "single" },
                    new Date()
                  )
                }
              >
                <MaterialCommunityIcons name="calendar" size={16} color="#ec4899" />
                <Text style={styles.dateSelectButtonText}>
                  {t("admin.reservationSettings.excludedDates.selectDate")}
                </Text>
              </TouchableOpacity>
              {excludedSingleDates.length === 0 ? (
                <Text style={styles.emptyText}>
                  {t("admin.reservationSettings.excludedDates.noSingleDatesExcluded")}
                </Text>
              ) : (
                excludedSingleDates.map((date) => (
                  <View key={date} style={styles.tag}>
                    <Text style={styles.tagText}>{formatDateForDisplay(date)}</Text>
                    <TouchableOpacity onPress={() => removeSingleDate(date)}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <View style={styles.separator} />

              <View style={styles.rangeHeader}>
                <Text style={styles.sectionTitle}>
                  {t("admin.reservationSettings.excludedDates.excludedDateRanges")}
                </Text>
                <TouchableOpacity style={styles.addRangeButton} onPress={addDateRange}>
                  <MaterialCommunityIcons name="plus" size={14} color="#ec4899" />
                  <Text style={styles.addRangeText}>
                    {t("admin.reservationSettings.excludedDates.addRange")}
                  </Text>
                </TouchableOpacity>
              </View>

              {excludedDateRanges.length === 0 ? (
                <Text style={styles.emptyText}>
                  {t("admin.reservationSettings.excludedDates.noDateRangesExcluded")}
                </Text>
              ) : (
                excludedDateRanges.map((range) => (
                  <View key={range.id} style={styles.rangeRow}>
                    <TouchableOpacity
                      style={styles.rangeDateButton}
                      onPress={() =>
                        openDatePicker(
                          { type: "range-start", rangeId: range.id },
                          parseISOToDate(range.start)
                        )
                      }
                    >
                      <MaterialCommunityIcons name="calendar" size={16} color="#ec4899" />
                      <Text style={styles.rangeDateButtonText}>
                        {range.start
                          ? formatDateForDisplay(range.start)
                          : t("admin.reservationSettings.excludedDates.startDate")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rangeDateButton}
                      onPress={() =>
                        openDatePicker(
                          { type: "range-end", rangeId: range.id },
                          parseISOToDate(range.end || range.start)
                        )
                      }
                    >
                      <MaterialCommunityIcons name="calendar" size={16} color="#ec4899" />
                      <Text style={styles.rangeDateButtonText}>
                        {range.end
                          ? formatDateForDisplay(range.end)
                          : t("admin.reservationSettings.excludedDates.endDate")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeRangeButton}
                      onPress={() => removeDateRange(range.id)}
                    >
                      <MaterialCommunityIcons name="delete" size={16} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </CollapsibleCard>
          </>
        )}
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        topOffset={headerHeight + 12}
      />

      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />

      {Platform.OS === "ios" ? (
        <Modal
          visible={datePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDatePickerVisible(false)}
        >
          <Pressable
            style={styles.pickerModalOverlay}
            onPress={() => setDatePickerVisible(false)}
          >
            <Pressable
              style={styles.pickerModalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.pickerTitle}>
                {datePickerContext?.type === "single"
                  ? t("admin.reservationSettings.excludedDates.selectDate")
                  : datePickerContext?.type === "range-start"
                  ? t("admin.reservationSettings.excludedDates.startDate")
                  : datePickerContext?.type === "range-end"
                  ? t("admin.reservationSettings.excludedDates.endDate")
                  : datePickerContext?.type === "time"
                  ? datePickerContext.slot === "open"
                    ? t("admin.reservationSettings.operatingHours.openTime")
                    : t("admin.reservationSettings.operatingHours.closeTime")
                  : ""}
              </Text>
              <DateTimePicker
                value={datePickerValue}
                mode={datePickerMode}
                display="spinner"
                minuteInterval={15}
                minimumDate={datePickerMode === "date" ? new Date() : undefined}
                onChange={(_, selectedDate) => {
                  if (selectedDate) setDatePickerValue(selectedDate);
                }}
                themeVariant="dark"
              />
              <View style={styles.pickerActions}>
                <TouchableOpacity
                  style={styles.pickerActionButton}
                  onPress={() => setDatePickerVisible(false)}
                >
                  <Text style={styles.pickerActionText}>
                    {t("common.cancel") || "Cancel"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickerActionButton, styles.pickerActionButtonPrimary]}
                  onPress={() => {
                    applyPickedDate(datePickerValue);
                    setDatePickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerActionText, styles.pickerActionTextPrimary]}>
                    {t("common.confirm") || "Confirm"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : datePickerVisible ? (
        <DateTimePicker
          value={datePickerValue}
          mode={datePickerMode}
          display="default"
          minuteInterval={15}
          minimumDate={datePickerMode === "date" ? new Date() : undefined}
          onChange={(event, selectedDate) => {
            if (event.type === "dismissed") {
              setDatePickerVisible(false);
              return;
            }
            if (selectedDate) {
              setDatePickerValue(selectedDate);
              applyPickedDate(selectedDate);
            }
            setDatePickerVisible(false);
          }}
        />
      ) : null}

      {/* Tier Selection Bottom Sheet Modal */}
      <Modal
        visible={tierModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTierModalVisible(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setTierModalVisible(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.reservationSettings.systemSettings.tierSelection")}
              </Text>
              <TouchableOpacity onPress={() => setTierModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  formData.tier === "SIMPLE" && styles.bottomSheetOptionActive,
                ]}
                onPress={() => {
                  handleInputChange("tier", "SIMPLE");
                  setTierModalVisible(false);
                }}
              >
                <View style={styles.bottomSheetOptionContent}>
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      formData.tier === "SIMPLE" &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {t("admin.reservationSettings.systemSettings.tierSimple")}
                  </Text>
                  <Text style={styles.bottomSheetOptionDescription}>
                    {t("admin.reservationSettings.systemSettings.tierSimpleDescription")}
                  </Text>
                </View>
                {formData.tier === "SIMPLE" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.bottomSheetOption,
                  formData.tier === "COMPLEX" && styles.bottomSheetOptionActive,
                  styles.bottomSheetOptionDisabled,
                ]}
                disabled={true}
              >
                <View style={styles.bottomSheetOptionContent}>
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      styles.bottomSheetOptionTextDisabled,
                    ]}
                  >
                    {t("admin.reservationSettings.systemSettings.tierComplex")}
                  </Text>
                  <Text style={styles.bottomSheetOptionDescription}>
                    {t("admin.reservationSettings.systemSettings.tierComplexDescription")}
                  </Text>
                </View>
                {formData.tier === "COMPLEX" && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color="#ec4899"
                  />
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function NumberInput({
  label,
  value,
  placeholder,
  onChangeText,
  helperText,
  showOverride,
  containerStyle,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  helperText?: string;
  showOverride?: boolean;
  containerStyle?: any;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.numberInputContainer, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {showOverride && (
          <View style={styles.overrideBadge}>
            <Text style={styles.overrideBadgeText}>
              {t("admin.branchManagement.reservationSettings.overridden") || "Overridden"}
            </Text>
          </View>
        )}
      </View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        keyboardType="numeric"
        value={value}
        onChangeText={onChangeText}
      />
      {helperText ? <Text style={styles.helpText}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#ffffff",
  },
  loadingText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingSubText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  titleSection: {
    marginBottom: 24,
    gap: 4,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ec4899",
  },
  screenSubtitle: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  cardTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardDescription: {
    color: "#6b7280",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cardBody: {
    padding: 16,
    gap: 12,
  },
  label: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 6,
  },
  overrideBadge: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overrideBadgeText: {
    color: "#ec4899",
    fontSize: 10,
    fontWeight: "600",
  },
  helpText: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tierContainer: {
    marginTop: 8,
  },
  tierDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 8,
  },
  tierDropdownText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "500",
  },
  dayRow: {
    marginBottom: 12,
  },
  dayLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  dayLabel: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13,
  },
  timeInputs: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  timeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 0,
  },
  timeButtonText: {
    color: "#111827",
    fontSize: 13,
    flex: 1,
    minWidth: 0,
  },
  clearDayButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  twoColCell: {
    width: "48%",
    minWidth: 0,
  },
  twoColCellFull: {
    width: "100%",
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 16,
  },
  pickerModalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
  },
  pickerTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  pickerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 12,
  },
  pickerActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  pickerActionButtonPrimary: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  pickerActionText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
  pickerActionTextPrimary: {
    color: "#ec4899",
  },
  numberInputContainer: {
    width: "100%",
    marginBottom: 12,
  },
  separator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  dateSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  dateSelectButtonText: {
    color: "#ec4899",
    fontWeight: "600",
  },
  emptyText: {
    fontStyle: "italic",
    color: "#6b7280",
    fontSize: 12,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 8,
  },
  tagText: {
    color: "#111827",
    fontSize: 13,
    flex: 1,
  },
  rangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  addRangeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  addRangeText: {
    color: "#ec4899",
    fontWeight: "600",
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },
  rangeDateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  rangeDateButtonText: {
    flex: 1,
    color: "#111827",
    fontSize: 13,
  },
  removeRangeButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "60%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  bottomSheetBody: {
    padding: 8,
  },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 4,
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  bottomSheetOptionDisabled: {
    opacity: 0.5,
  },
  bottomSheetOptionContent: {
    flex: 1,
    marginRight: 12,
  },
  bottomSheetOptionText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
    marginBottom: 4,
  },
  bottomSheetOptionTextActive: {
    color: "#ec4899",
    fontWeight: "600",
  },
  bottomSheetOptionTextDisabled: {
    color: "#6B7280",
  },
  bottomSheetOptionDescription: {
    fontSize: 12,
    color: "#374151",
    lineHeight: 16,
  },
  checkboxRow: {
    marginBottom: 8,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#6B7280",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  checkboxLabel: {
    color: "#374151",
    fontSize: 13,
  },
});

