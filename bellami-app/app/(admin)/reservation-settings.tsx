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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import DatePicker from "react-native-date-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import {
  reservationService,
  type ReservationSettings,
  type ReservationTier,
  type ExcludedDatesPayload,
} from "@/src/services/reservationService";

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

export default function ReservationSettingsScreen() {
  const { t, i18n, ready } = useTranslation();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const headerHeight = insets.top + getAdminHeaderHeight();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [languageKey, setLanguageKey] = useState(i18n.language);

  // Force re-render when language changes
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setLanguageKey(lng);
    };
    
    i18n.on("languageChanged", handleLanguageChanged);
    
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [i18n]);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ReservationSettings>({
    tier: DEFAULT_TIER,
  });
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

  const daysOfWeek = useMemo(() => [
    { key: "monday", label: t("admin.reservationSettings.operatingHours.monday") },
    { key: "tuesday", label: t("admin.reservationSettings.operatingHours.tuesday") },
    { key: "wednesday", label: t("admin.reservationSettings.operatingHours.wednesday") },
    { key: "thursday", label: t("admin.reservationSettings.operatingHours.thursday") },
    { key: "friday", label: t("admin.reservationSettings.operatingHours.friday") },
    { key: "saturday", label: t("admin.reservationSettings.operatingHours.saturday") },
    { key: "sunday", label: t("admin.reservationSettings.operatingHours.sunday") },
  ], [t, i18n.language]);

  useEffect(() => {
    if (organizationLoading) return;
    loadSettings();
  }, [selectedOrganizationId, organizationLoading]);

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

  const loadSettings = async () => {
    try {
      if (!selectedOrganizationId) {
        setFormData({ tier: DEFAULT_TIER });
        setExcludedSingleDates([]);
        setExcludedDateRanges([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!refreshing) {
        setLoading(true);
      }
      const token = await getToken();
      const data = await reservationService.getSettings(
        token ?? undefined,
        undefined,
        selectedOrganizationId ?? undefined
      );
      const tierValue: ReservationTier =
        data.tier === "MEDIUM" || data.tier === "COMPLEX" ? data.tier : DEFAULT_TIER;

      // Handle depositPercentage - use database value, default to 100 only if completely missing
      let depositPercentage = 100; // default
      if (data.depositPercentage !== undefined && data.depositPercentage !== null) {
        depositPercentage = Number(data.depositPercentage);
      }
      
      // Handle allowedPaymentMethods - use EXACT database value, no defaults
      // If database has null/undefined/empty array, use that - don't default
      // Only default if the field is completely missing from the response
      let allowedPaymentMethods: string[] = [];
      if (data.allowedPaymentMethods !== undefined) {
        if (data.allowedPaymentMethods === null) {
          allowedPaymentMethods = []; // null means empty
        } else if (Array.isArray(data.allowedPaymentMethods)) {
          allowedPaymentMethods = data.allowedPaymentMethods; // Use actual value, even if empty
        } else {
          allowedPaymentMethods = []; // Invalid type, treat as empty
        }
      } else {
        // Field is completely missing - only then use default
        allowedPaymentMethods = ["ONLINE_CARD", "PAYPAL"];
      }

      const parsedExcluded = parseExcludedDates(data.excludedDates);
      setFormData({
        ...data,
        tier: tierValue,
        depositPercentage,
        allowedPaymentMethods,
      });
      setExcludedSingleDates(parsedExcluded.singleDates);
      setExcludedDateRanges(
        parsedExcluded.dateRanges.map((range, index) => ({
          id: `${range.start}-${range.end}-${index}`,
          ...range,
        }))
      );
    } catch (error) {
      console.error("Error loading reservation settings:", error);
      showToast("error", t("admin.reservationSettings.loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSettings();
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

  const handleInputChange = (key: keyof ReservationSettings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const validateDateString = (value: string) => DATE_REGEX.test(value.trim());

  const handleSingleDatePicked = (dateISO: string) => {
    if (excludedSingleDates.includes(dateISO)) {
      showToast("error", t("admin.reservationSettings.excludedDates.dateAlreadyExcluded"));
      return;
    }
    setExcludedSingleDates([...excludedSingleDates, dateISO].sort());
  };

  const removeSingleDate = (date: string) => {
    setExcludedSingleDates(excludedSingleDates.filter((d) => d !== date));
  };

  const addDateRange = () => {
    setExcludedDateRanges([
      ...excludedDateRanges,
      { id: `${Date.now()}`, start: "", end: "" },
    ]);
  };

  const updateDateRange = (id: string, field: "start" | "end", value: string) => {
    const updated = excludedDateRanges.map((range) =>
      range.id === id ? { ...range, [field]: value.trim() } : range
    );
    setExcludedDateRanges(updated);
  };

  const removeDateRange = (id: string) => {
    setExcludedDateRanges(excludedDateRanges.filter((range) => range.id !== id));
  };

  const formatDateForDisplay = (date: string) => {
    if (!validateDateString(date)) return date;
    const dateObj = new Date(`${date}T00:00:00`);
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = dateObj
      .toLocaleString("en-US", { month: "short" })
      .replace(".", "");
    const shortYear = String(dateObj.getFullYear()).slice(-2);
    return `${day}-${month}-${shortYear}`;
  };

  const showToast = (type: ToastState["type"], message: string) => {
    setToast({ visible: true, type, message });
  };

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
      handleInputChange(
        `${datePickerContext.dayKey}${datePickerContext.slot === "open" ? "Open" : "Close"}` as keyof ReservationSettings,
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

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = await getToken();
      
      // Convert undefined/empty day fields to null so backend can properly unset them
      // This ensures fields are included in the JSON payload (undefined values are omitted by JSON.stringify)
      const dayFields = [
        'mondayOpen', 'mondayClose',
        'tuesdayOpen', 'tuesdayClose',
        'wednesdayOpen', 'wednesdayClose',
        'thursdayOpen', 'thursdayClose',
        'fridayOpen', 'fridayClose',
        'saturdayOpen', 'saturdayClose',
        'sundayOpen', 'sundayClose',
      ] as const;
      
      const cleanedFormData: any = { ...formData };
      dayFields.forEach((field) => {
        const value = formData[field as keyof ReservationSettings];
        // Convert undefined, null, or empty string to null so it's included in JSON
        if (value === undefined || value === null || value === '') {
          cleanedFormData[field] = null;
        }
      });
      
      const payload: Partial<ReservationSettings> = {
        ...cleanedFormData,
        tier: formData.tier || DEFAULT_TIER,
        excludedDates: {
          singleDates: excludedSingleDates,
          dateRanges: excludedDateRanges
            .filter((range) => validateDateString(range.start) && validateDateString(range.end))
            .map((range) => ({ start: range.start, end: range.end })),
        },
      };

      await reservationService.updateSettings(
        payload,
        token ?? undefined,
        selectedOrganizationId ?? undefined
      );
      showToast("success", t("admin.reservationSettings.saveSuccess"));
      await loadSettings();
    } catch (error) {
      console.error("Error saving reservation settings:", error);
      showToast("error", t("admin.reservationSettings.saveError"));
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

  if (!selectedOrganizationId) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("admin.reservationSettings.selectOrgTitle")}</Text>
        <Text style={styles.loadingSubText}>
          {t("admin.reservationSettings.selectOrgDescription")}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      key={languageKey}
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight - 8,
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
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerButtonPrimary}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="check" size={16} color="#fff" />
            )}
            <Text style={styles.headerButtonPrimaryText}>
              {saving
                ? t("admin.reservationSettings.saving")
                : t("admin.reservationSettings.save")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* System Settings */}
        <CollapsibleCard
          titleIcon="cog"
          title={t("admin.reservationSettings.systemSettings.title")}
          description={t("admin.reservationSettings.systemSettings.description")}
        >
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t("admin.reservationSettings.systemSettings.enableReservations")}
              </Text>
              <Text style={styles.helpText}>
                {t(
                  "admin.reservationSettings.systemSettings.enableReservationsDescription"
                )}
              </Text>
            </View>
            <Switch
              value={!!formData.isEnabled}
              onValueChange={(value) => handleInputChange("isEnabled", value)}
            />
          </View>

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
                
                return (
                  <View key={day.key} style={styles.dayRow}>
                    <View style={styles.dayLabelContainer}>
                      <Text style={styles.dayLabel}>{day.label}</Text>
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
                            handleInputChange(`${day.key}Open` as keyof ReservationSettings, undefined);
                            handleInputChange(`${day.key}Close` as keyof ReservationSettings, undefined);
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
              <View style={styles.gridRow}>
                <NumberInput
                  label={t("admin.reservationSettings.bookingRules.timeSlotInterval")}
                  value={
                    formData.timeSlotInterval != null
                      ? String(formData.timeSlotInterval)
                      : ""
                  }
                  placeholder={t("admin.reservationSettings.bookingRules.timeSlotIntervalPlaceholder")}
                  onChangeText={(text) =>
                    handleInputChange(
                      "timeSlotInterval",
                      text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                    )
                  }
                />
                <NumberInput
                  label={t(
                    "admin.reservationSettings.bookingRules.maxGuestsPerReservation"
                  )}
                  value={
                    formData.maxGuestsPerReservation != null
                      ? String(formData.maxGuestsPerReservation)
                      : ""
                  }
                  placeholder={t(
                    "admin.reservationSettings.bookingRules.maxGuestsPlaceholder"
                  )}
                  onChangeText={(text) =>
                    handleInputChange(
                      "maxGuestsPerReservation",
                      text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                    )
                  }
                />
              </View>
              <View style={styles.gridRow}>
                <NumberInput
                  label={t(
                    "admin.reservationSettings.bookingRules.minAdvanceBooking"
                  )}
                  value={
                    formData.minAdvanceBookingHours != null
                      ? String(formData.minAdvanceBookingHours)
                      : ""
                  }
                  placeholder={t(
                    "admin.reservationSettings.bookingRules.minAdvanceBookingPlaceholder"
                  )}
                  helperText={t(
                    "admin.reservationSettings.bookingRules.minAdvanceBookingDescription"
                  )}
                  onChangeText={(text) =>
                    handleInputChange(
                      "minAdvanceBookingHours",
                      text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                    )
                  }
                />
                <NumberInput
                  label={t(
                    "admin.reservationSettings.bookingRules.maxAdvanceBooking"
                  )}
                  value={
                    formData.maxAdvanceBookingDays != null
                      ? String(formData.maxAdvanceBookingDays)
                      : ""
                  }
                  placeholder={t(
                    "admin.reservationSettings.bookingRules.maxAdvanceBookingPlaceholder"
                  )}
                  onChangeText={(text) =>
                    handleInputChange(
                      "maxAdvanceBookingDays",
                      text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                    )
                  }
                />
              </View>
              <NumberInput
                label={t("admin.reservationSettings.bookingRules.modificationWindow")}
                value={
                  formData.modificationWindowHours != null
                    ? String(formData.modificationWindowHours)
                    : ""
                }
                placeholder={t(
                  "admin.reservationSettings.bookingRules.modificationWindowPlaceholder"
                )}
                helperText={t(
                  "admin.reservationSettings.bookingRules.modificationWindowDescription"
                )}
                onChangeText={(text) =>
                  handleInputChange(
                    "modificationWindowHours",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {t("admin.reservationSettings.bookingRules.allowSameDayBooking")}
                  </Text>
                  <Text style={styles.helpText}>
                    {t(
                      "admin.reservationSettings.bookingRules.allowSameDayBookingDescription"
                    )}
                  </Text>
                </View>
                <Switch
                  value={formData.allowSameDayBooking !== false}
                  onValueChange={(value) =>
                    handleInputChange("allowSameDayBooking", value)
                  }
                />
              </View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {t("admin.reservationSettings.bookingRules.allowCancellation")}
                  </Text>
                  <Text style={styles.helpText}>
                    {t(
                      "admin.reservationSettings.bookingRules.allowCancellationDescription"
                    )}
                  </Text>
                </View>
                <Switch
                  value={formData.allowCancellation !== false}
                  onValueChange={(value) =>
                    handleInputChange("allowCancellation", value)
                  }
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
                  <Text style={styles.label}>
                    {t("admin.reservationSettings.preOrderSettings.enablePreOrder")}
                  </Text>
                  <Text style={styles.helpText}>
                    {t(
                      "admin.reservationSettings.preOrderSettings.enablePreOrderDescription"
                    )}
                  </Text>
                </View>
                <Switch
                  value={formData.enablePreOrder !== false}
                  onValueChange={(value) =>
                    handleInputChange("enablePreOrder", value)
                  }
                />
              </View>

              {formData.enablePreOrder !== false && (
                <>
                  <NumberInput
                    label={t(
                      "admin.reservationSettings.preOrderSettings.minimumOrderAmount"
                    )}
                    value={
                      formData.preOrderMinAmount != null
                        ? String(formData.preOrderMinAmount)
                        : ""
                    }
                    placeholder={t(
                      "admin.reservationSettings.preOrderSettings.minimumOrderAmountPlaceholder"
                    )}
                    onChangeText={(text) =>
                      handleInputChange(
                        "preOrderMinAmount",
                        text === "" ? undefined : Number(text.replace(/[^0-9.]/g, ""))
                      )
                    }
                  />
                  <View style={styles.separator} />
                  <Text style={styles.sectionTitle}>
                    {t(
                      "admin.reservationSettings.preOrderSettings.depositAndPayment"
                    )}
                  </Text>
                  <NumberInput
                    label={t(
                      "admin.reservationSettings.preOrderSettings.depositPercentage"
                    )}
                    value={
                      formData.depositPercentage != null
                        ? String(formData.depositPercentage)
                        : ""
                    }
                    placeholder="0-100"
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
                    {t(
                      "admin.reservationSettings.preOrderSettings.depositPercentageDescription"
                    )}
                  </Text>
                  <View style={styles.separator} />
                  <Text style={styles.label}>
                    {t(
                      "admin.reservationSettings.preOrderSettings.allowedPaymentMethods"
                    )}
                  </Text>
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
                    {t(
                      "admin.reservationSettings.preOrderSettings.allowedPaymentMethodsDescription"
                    )}
                  </Text>
                  <View style={styles.separator} />
                  <Text style={styles.sectionTitle}>
                    {t(
                      "admin.reservationSettings.preOrderSettings.cancellationRefundPolicy"
                    )}
                  </Text>
                  <View style={styles.gridRow}>
                    <NumberInput
                      label={t(
                        "admin.reservationSettings.preOrderSettings.fullRefundHoursBefore"
                      )}
                      value={
                        formData.fullRefundHoursBefore != null
                          ? String(formData.fullRefundHoursBefore)
                          : ""
                      }
                      placeholder={t(
                        "admin.reservationSettings.preOrderSettings.fullRefundPlaceholder"
                      )}
                      onChangeText={(text) =>
                        handleInputChange(
                          "fullRefundHoursBefore",
                          text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                        )
                      }
                    />
                    <NumberInput
                      label={t(
                        "admin.reservationSettings.preOrderSettings.partialRefundHoursBefore"
                      )}
                      value={
                        formData.partialRefundHoursBefore != null
                          ? String(formData.partialRefundHoursBefore)
                          : ""
                      }
                      placeholder={t(
                        "admin.reservationSettings.preOrderSettings.partialRefundPlaceholder"
                      )}
                      onChangeText={(text) =>
                        handleInputChange(
                          "partialRefundHoursBefore",
                          text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                        )
                      }
                    />
                  </View>
                  <NumberInput
                    label={t(
                      "admin.reservationSettings.preOrderSettings.noRefundHoursBefore"
                    )}
                    value={
                      formData.noRefundHoursBefore != null
                        ? String(formData.noRefundHoursBefore)
                        : ""
                    }
                    placeholder={t(
                      "admin.reservationSettings.preOrderSettings.noRefundPlaceholder"
                    )}
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
                label={t(
                  "admin.reservationSettings.advancedSettings.maxCapacityPerTimeSlot"
                )}
                value={
                  formData.maxCapacityPerTimeSlot != null
                    ? String(formData.maxCapacityPerTimeSlot)
                    : ""
                }
                placeholder={t(
                  "admin.reservationSettings.advancedSettings.maxCapacityPlaceholder"
                )}
                helperText={t(
                  "admin.reservationSettings.advancedSettings.maxCapacityDescription"
                )}
                onChangeText={(text) =>
                  handleInputChange(
                    "maxCapacityPerTimeSlot",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
              />
              <NumberInput
                label={t("admin.reservationSettings.advancedSettings.bufferTimeMinutes")}
                value={
                  formData.bufferTimeMinutes != null
                    ? String(formData.bufferTimeMinutes)
                    : ""
                }
                placeholder={t("admin.reservationSettings.advancedSettings.bufferTimePlaceholder")}
                helperText={t(
                  "admin.reservationSettings.advancedSettings.bufferTimeDescription"
                )}
                onChangeText={(text) =>
                  handleInputChange(
                    "bufferTimeMinutes",
                    text === "" ? undefined : Number(text.replace(/[^0-9]/g, ""))
                  )
                }
              />
            </CollapsibleCard>

            {/* Excluded Dates */}
            <CollapsibleCard
              titleIcon="calendar-alert"
              title={t("admin.reservationSettings.excludedDates.title")}
              description={t("admin.reservationSettings.excludedDates.description")}
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

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />

      <DatePicker
        modal
        mode={datePickerMode}
        open={datePickerVisible}
        date={datePickerValue}
        minuteInterval={15}
        minimumDate={datePickerMode === "date" ? new Date() : undefined}
        onConfirm={(date) => {
          applyPickedDate(date);
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
        title={
          datePickerContext?.type === "single"
            ? t("admin.reservationSettings.excludedDates.selectDate")
            : datePickerContext?.type === "range-start"
            ? t("admin.reservationSettings.excludedDates.startDate")
            : datePickerContext?.type === "range-end"
            ? t("admin.reservationSettings.excludedDates.endDate")
            : datePickerContext?.type === "time"
            ? datePickerContext.slot === "open"
              ? t("admin.reservationSettings.operatingHours.openTime")
              : t("admin.reservationSettings.operatingHours.closeTime")
            : ""
        }
        confirmText={
          datePickerMode === "date"
            ? t("admin.reservationSettings.excludedDates.confirm")
            : t("common.confirm")
        }
        cancelText={
          datePickerMode === "date"
            ? t("admin.reservationSettings.excludedDates.cancel")
            : t("common.cancel")
        }
        theme="dark"
      />
    </KeyboardAvoidingView>
  );
}

function NumberInput({
  label,
  value,
  placeholder,
  onChangeText,
  helperText,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  helperText?: string;
}) {
  return (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
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
    backgroundColor: "#0a0a0a",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#0a0a0a",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingSubText: {
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingTop: 16,
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  screenSubtitle: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 4,
  },
  headerButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  headerButtonPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  cardDescription: {
    color: "#9CA3AF",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cardBody: {
    padding: 16,
    gap: 12,
  },
  label: {
    color: "#D1D5DB",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  helpText: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  input: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    color: "#fff",
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
  dayRow: {
    marginBottom: 12,
  },
  dayLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dayLabel: {
    color: "#F5F5F5",
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
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 0,
  },
  timeButtonText: {
    color: "#fff",
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
  separator: {
    height: 1,
    backgroundColor: "#262626",
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
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
    backgroundColor: "rgba(236, 72, 153, 0.08)",
  },
  dateSelectButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyText: {
    fontStyle: "italic",
    color: "#6B7280",
    fontSize: 12,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#262626",
    marginTop: 8,
  },
  tagText: {
    color: "#fff",
    fontSize: 13,
    flex: 1,
  },
  rangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
  },
  rangeDateButtonText: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
  },
  removeRangeButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f87171",
    alignItems: "center",
    justifyContent: "center",
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
    color: "#D1D5DB",
    fontSize: 13,
  },
});


