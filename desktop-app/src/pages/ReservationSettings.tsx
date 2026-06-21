import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import {
  Select as TimeSelect,
  SelectTrigger as TimeSelectTrigger,
  SelectContent as TimeSelectContent,
  SelectItem as TimeSelectItem,
  SelectValue as TimeSelectValue,
} from "@/components/ui/select";
import Switch from "@/components/Switch";
import Select from "@/components/Select";

import Icon from "@mdi/react";
import {
  mdiContentSave,
  mdiRefresh,
  mdiCog,
  mdiClock,
  mdiCalendar,
  mdiAccountGroup,
  mdiClose,
  mdiPlus,
  mdiDelete,
} from "@mdi/js";

import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { toast } from "@/components/Toast";

import branchService, { type OrganizationReservationSettings } from "@/services/branchService";
import { type ReservationSettingsFormData, type ReservationTier } from "@/services/reservationService";

type ExcludedDatesPayload = {
  singleDates: string[];
  dateRanges: Array<{ start: string; end: string }>;
};

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const daysOfWeek: Array<{ key: string; labelKey: string }> = [
  { key: "monday", labelKey: "admin.reservationSettings.operatingHours.monday" },
  { key: "tuesday", labelKey: "admin.reservationSettings.operatingHours.tuesday" },
  { key: "wednesday", labelKey: "admin.reservationSettings.operatingHours.wednesday" },
  { key: "thursday", labelKey: "admin.reservationSettings.operatingHours.thursday" },
  { key: "friday", labelKey: "admin.reservationSettings.operatingHours.friday" },
  { key: "saturday", labelKey: "admin.reservationSettings.operatingHours.saturday" },
  { key: "sunday", labelKey: "admin.reservationSettings.operatingHours.sunday" },
];

const safeParseExcludedDates = (raw: any): ExcludedDatesPayload => {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const singleDates = Array.isArray(value?.singleDates) ? value.singleDates : [];
    const dateRanges = Array.isArray(value?.dateRanges) ? value.dateRanges : [];
    return {
      singleDates: singleDates.filter((s: any) => typeof s === "string"),
      dateRanges: dateRanges
        .map((r: any) => ({ start: String(r?.start || ""), end: String(r?.end || "") }))
        .filter((r: any) => r.start && r.end),
    };
  } catch {
    return { singleDates: [], dateRanges: [] };
  }
};

const formatExcludedDate = (value: string): string => {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;

  const day = d.getDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()] || "";
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const formatTime12HourLabel = (hhmm: string): string => {
  const raw = (hhmm || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return raw;

  const [hhStr, mm] = raw.split(":");
  const hh = Number(hhStr);
  const hour12 = ((hh + 11) % 12) + 1;
  const ampm = hh < 12 ? "AM" : "PM";
  return `${hour12}:${mm} ${ampm}`;
};

const buildTimeOptions = (stepMinutes: number): string[] => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      opts.push(`${hh}:${mm}`);
    }
  }
  return opts;
};

const ReservationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin, isOrgAdmin, canAny, rbacUser } = usePermissions();

  const canAccess = isSuperAdmin || isOrgAdmin;
  const canUpdate = canAny([{ resource: RESOURCES.SETTINGS, action: ACTIONS.UPDATE }]);

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(ORG_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const orgAdminOrganizationId = (rbacUser as any)?.organizationId as string | null | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgReservationsAllowed, setOrgReservationsAllowed] = useState(true);

  const [formData, setFormData] = useState<Partial<ReservationSettingsFormData>>({
    tier: "SIMPLE" as ReservationTier,
  });

  const [excludedSingleDates, setExcludedSingleDates] = useState<string[]>([]);
  const [excludedDateRanges, setExcludedDateRanges] = useState<Array<{ start: string; end: string }>>([]);
  const [newSingleDate, setNewSingleDate] = useState<string>("");

  const timeOptions = useMemo(() => buildTimeOptions(15), []);

  useEffect(() => {
    if (!isOrgAdmin) return;
    if (!orgAdminOrganizationId) return;
    setSelectedOrganizationId(String(orgAdminOrganizationId));
  }, [isOrgAdmin, orgAdminOrganizationId]);

  useEffect(() => {
    const applyOrgId = (next: string | null | undefined) => {
      const normalized = String(next || "").trim();
      setSelectedOrganizationId(normalized);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== ORG_STORAGE_KEY) return;
      applyOrgId(e.newValue);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgId(detail?.organizationId);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    };
  }, []);

  const normalizeFromApi = useCallback(
    (data: OrganizationReservationSettings | null): {
      form: Partial<ReservationSettingsFormData>;
      excluded: ExcludedDatesPayload;
      allowed: boolean;
    } => {
      if (!data) {
        return {
          form: { tier: "SIMPLE" as ReservationTier },
          excluded: { singleDates: [], dateRanges: [] },
          allowed: true,
        };
      }

      const tierValue =
        data.tier === "SIMPLE" || data.tier === "MEDIUM" || data.tier === "COMPLEX"
          ? (data.tier as ReservationTier)
          : ("SIMPLE" as ReservationTier);

      const depositPercentage =
        data.depositPercentage !== undefined && data.depositPercentage !== null
          ? Number(data.depositPercentage)
          : 100;

      let allowedPaymentMethods: string[] = [];
      if (data.allowedPaymentMethods !== undefined) {
        if (data.allowedPaymentMethods === null) {
          allowedPaymentMethods = [];
        } else if (Array.isArray(data.allowedPaymentMethods)) {
          allowedPaymentMethods = data.allowedPaymentMethods;
        } else {
          allowedPaymentMethods = [];
        }
      } else {
        allowedPaymentMethods = ["ONLINE_CARD", "PAYPAL"]; // match web default only when field missing
      }

      const normalized: Partial<ReservationSettingsFormData> = {
        isEnabled: data.isEnabled ?? undefined,
        tier: tierValue,

        mondayOpen: data.mondayOpen ?? undefined,
        mondayClose: data.mondayClose ?? undefined,
        tuesdayOpen: data.tuesdayOpen ?? undefined,
        tuesdayClose: data.tuesdayClose ?? undefined,
        wednesdayOpen: data.wednesdayOpen ?? undefined,
        wednesdayClose: data.wednesdayClose ?? undefined,
        thursdayOpen: data.thursdayOpen ?? undefined,
        thursdayClose: data.thursdayClose ?? undefined,
        fridayOpen: data.fridayOpen ?? undefined,
        fridayClose: data.fridayClose ?? undefined,
        saturdayOpen: data.saturdayOpen ?? undefined,
        saturdayClose: data.saturdayClose ?? undefined,
        sundayOpen: data.sundayOpen ?? undefined,
        sundayClose: data.sundayClose ?? undefined,

        timeSlotInterval: (data as any).timeSlotInterval ?? undefined,
        maxGuestsPerReservation: (data as any).maxGuestsPerReservation ?? undefined,
        minAdvanceBookingHours: (data as any).minAdvanceBookingHours ?? undefined,
        maxAdvanceBookingDays: (data as any).maxAdvanceBookingDays ?? undefined,
        allowSameDayBooking: (data as any).allowSameDayBooking ?? undefined,
        allowCancellation: (data as any).allowCancellation ?? undefined,
        modificationWindowHours: (data as any).modificationWindowHours ?? undefined,
        enablePreOrder: (data as any).enablePreOrder ?? undefined,
        preOrderMinAmount:
          (data as any).preOrderMinAmount !== undefined && (data as any).preOrderMinAmount !== null
            ? Number((data as any).preOrderMinAmount)
            : undefined,
        fullRefundHoursBefore: (data as any).fullRefundHoursBefore ?? undefined,
        partialRefundHoursBefore: (data as any).partialRefundHoursBefore ?? undefined,
        noRefundHoursBefore: (data as any).noRefundHoursBefore ?? undefined,
        maxCapacityPerTimeSlot: (data as any).maxCapacityPerTimeSlot ?? undefined,
        bufferTimeMinutes: (data as any).bufferTimeMinutes ?? undefined,

        depositPercentage,
        allowedPaymentMethods,
      };

      const excluded = safeParseExcludedDates((data as any)?.excludedDates);
      return { form: normalized, excluded, allowed: true };
    },
    []
  );

  const loadSettings = useCallback(async () => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    if (isSuperAdmin && !selectedOrganizationId.trim()) {
      setLoading(false);
      setOrgReservationsAllowed(true);
      setFormData({ tier: "SIMPLE" as ReservationTier });
      setExcludedSingleDates([]);
      setExcludedDateRanges([]);
      return;
    }

    if (!selectedOrganizationId.trim()) {
      setLoading(false);
      setOrgReservationsAllowed(true);
      setFormData({ tier: "SIMPLE" as ReservationTier });
      setExcludedSingleDates([]);
      setExcludedDateRanges([]);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      const tkn = token || undefined;
      if (!tkn) return;

      if (isSuperAdmin) {
        try {
          const orgs = await branchService.getOrganizations(tkn);
          const org = (orgs || []).find((o) => String(o.id) === String(selectedOrganizationId));
          const allowed = (org as any)?.reservationsAllowed !== false;
          setOrgReservationsAllowed(allowed);
          if (!allowed) {
            setFormData({ tier: "SIMPLE" as ReservationTier });
            setExcludedSingleDates([]);
            setExcludedDateRanges([]);
            return;
          }
        } catch {
          setOrgReservationsAllowed(true);
        }
      } else {
        setOrgReservationsAllowed(true);
      }

      const data = await branchService.getOrganizationReservationSettings(selectedOrganizationId, tkn);
      const normalized = normalizeFromApi(data);

      setFormData(normalized.form);
      setExcludedSingleDates(normalized.excluded.singleDates);
      setExcludedDateRanges(normalized.excluded.dateRanges);
    } catch (e: any) {
      console.error("Failed to load reservation settings", e);
      const status = e?.status || e?.response?.status;
      const message = e?.response?.data?.error || e?.message;
      if (status === 403 && String(message || "").toLowerCase().includes("disabled")) {
        setOrgReservationsAllowed(false);
        return;
      }
      toast.error(
        t("admin.reservationSettings.loadError", {
          defaultValue: "Failed to load reservation settings",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [canAccess, getToken, isSuperAdmin, normalizeFromApi, selectedOrganizationId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleInputChange = useCallback(
    (field: keyof ReservationSettingsFormData, value: any) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleDayChange = useCallback(
    (dayKey: string, field: "Open" | "Close", value: string) => {
      const key = `${dayKey}${field}` as keyof ReservationSettingsFormData;
      handleInputChange(key, value === "" ? undefined : value);
    },
    [handleInputChange]
  );

  const addSingleDate = () => {
    const dateStr = (newSingleDate || "").trim();
    if (!dateStr) return;
    if (excludedSingleDates.includes(dateStr)) {
      toast.error(
        t("admin.reservationSettings.excludedDates.dateAlreadyExcluded", {
          defaultValue: "Date already excluded",
        })
      );
      return;
    }
    const next = [...excludedSingleDates, dateStr].sort();
    setExcludedSingleDates(next);
    setNewSingleDate("");
  };

  const removeSingleDate = (dateStr: string) => {
    setExcludedSingleDates((prev) => prev.filter((d) => d !== dateStr));
  };

  const addDateRange = () => {
    setExcludedDateRanges((prev) => [...prev, { start: "", end: "" }]);
  };

  const updateDateRange = (index: number, patch: Partial<{ start: string; end: string }>) => {
    setExcludedDateRanges((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeDateRange = (index: number) => {
    setExcludedDateRanges((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!canAccess) return;
    if (!canUpdate) return;

    const orgId = selectedOrganizationId.trim();
    if (!orgId) {
      toast.error(
        t("admin.organizations.select", {
          defaultValue: "Select organization",
        })
      );
      return;
    }

    if (!orgReservationsAllowed) {
      toast.error(
        t("admin.reservationSettings.notAllowed", {
          defaultValue: "Reservations are disabled for this organization",
        })
      );
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();
      const tkn = token || undefined;
      if (!tkn) return;

      const dayFields = [
        "mondayOpen",
        "mondayClose",
        "tuesdayOpen",
        "tuesdayClose",
        "wednesdayOpen",
        "wednesdayClose",
        "thursdayOpen",
        "thursdayClose",
        "fridayOpen",
        "fridayClose",
        "saturdayOpen",
        "saturdayClose",
        "sundayOpen",
        "sundayClose",
      ] as const;

      const cleanedFormData: any = { ...formData };
      dayFields.forEach((field) => {
        const value = (formData as any)[field];
        if (value === undefined || value === null || value === "") {
          cleanedFormData[field] = null;
        }
      });

      const excludedDates: ExcludedDatesPayload = {
        singleDates: excludedSingleDates,
        dateRanges: excludedDateRanges
          .filter((r) => r.start && r.end)
          .map((r) => ({ start: r.start, end: r.end })),
      };

      await branchService.upsertOrganizationReservationSettings(
        orgId,
        {
          ...(cleanedFormData || {}),
          excludedDates,
        },
        tkn
      );

      toast.success(
        t("admin.reservationSettings.saveSuccess", {
          defaultValue: "Saved",
        })
      );

      await loadSettings();
    } catch (e: any) {
      console.error("Failed to save reservation settings", e);
      toast.error(
        e?.response?.data?.error ||
          t("admin.reservationSettings.saveError", {
            defaultValue: "Failed to save",
          })
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t("common.accessDenied", { defaultValue: "Access is denied" })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={t("admin.reservationSettings.title", { defaultValue: "Reservation Settings" })}
        description={t("admin.reservationSettings.description", {
          defaultValue: "Configure your reservation system settings",
        })}
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadSettings()}
              disabled={loading || saving}
            >
              <Icon path={mdiRefresh} size={0.67} className={loading ? "mr-2 animate-spin" : "mr-2"} />
              {t("common.refresh", { defaultValue: "Refresh" })}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || loading || !canUpdate || !orgReservationsAllowed}
              className="bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-60"
            >
              <Icon path={mdiContentSave} size={0.67} className="mr-2" />
              {saving
                ? t("admin.reservationSettings.saving", { defaultValue: "Saving..." })
                : t("admin.reservationSettings.saveSettings", { defaultValue: "Save settings" })}
            </Button>
          </div>
        }
      />

      {!orgReservationsAllowed && selectedOrganizationId.trim() ? (
        <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-4 py-3 text-sm text-pink-600">
          {t("admin.reservationSettings.notAllowed", {
            defaultValue: "Reservations are disabled for this organization",
          })}
        </div>
      ) : null}

      {loading ? (
        <Card className="border-border">
          <CardContent className="py-10 text-sm text-muted-foreground">
            {t("admin.reservationSettings.loading", { defaultValue: "Loading..." })}
          </CardContent>
        </Card>
      ) : (
        <div className={"space-y-6" + (!orgReservationsAllowed ? " opacity-60 pointer-events-none" : "")}>
          <CollapsibleCard
            defaultOpen
            icon={<Icon path={mdiCog} size={0.83} className="text-pink-500" />}
            title={t("admin.reservationSettings.systemSettings.title", { defaultValue: "System Settings" })}
            description={t("admin.reservationSettings.systemSettings.description", {
              defaultValue: "Enable or disable the reservation system",
            })}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label>
                    {t("admin.reservationSettings.systemSettings.enableReservations", {
                      defaultValue: "Enable Reservations",
                    })}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationSettings.systemSettings.enableReservationsDescription", {
                      defaultValue: "Allow customers to make reservations",
                    })}
                  </p>
                </div>
                <Switch
                  checked={Boolean(formData.isEnabled)}
                  onCheckedChange={(checked) => handleInputChange("isEnabled", Boolean(checked))}
                  disabled={!canUpdate}
                />
              </div>

              {Boolean(formData.isEnabled) && (
                <div className="space-y-2">
                  <Label>
                    {t("admin.reservationSettings.systemSettings.tierSelection", {
                      defaultValue: "Tier Selection",
                    })}
                  </Label>
                  <Select
                    value={String(formData.tier || "SIMPLE")}
                    onValueChange={(value) => handleInputChange("tier", value as ReservationTier)}
                    disabled={!canUpdate}
                  >
                    <Select.Trigger>
                      <Select.Value
                        placeholder={t("admin.reservationSettings.systemSettings.tierSimple", {
                          defaultValue: "Simple",
                        })}
                      />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="SIMPLE">
                        {t("admin.reservationSettings.systemSettings.tierSimple", {
                          defaultValue: "Simple",
                        })}
                      </Select.Item>
                      <Select.Item value="COMPLEX">
                        {t("admin.reservationSettings.systemSettings.tierComplex", {
                          defaultValue: "Complex",
                        })}
                      </Select.Item>
                    </Select.Content>
                  </Select>
                </div>
              )}
            </div>
          </CollapsibleCard>

          {Boolean(formData.isEnabled) ? (
            <>
              <CollapsibleCard
                defaultOpen
                icon={<Icon path={mdiClock} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.operatingHours.title", { defaultValue: "Operating Hours" })}
                description={t("admin.reservationSettings.operatingHours.description", {
                  defaultValue: "Set your restaurant operating hours for each day",
                })}
              >
                <div className="space-y-4">
                  {daysOfWeek.map((day) => {
                    const openKey = `${day.key}Open` as keyof ReservationSettingsFormData;
                    const closeKey = `${day.key}Close` as keyof ReservationSettingsFormData;
                    const openValue = (formData as any)[openKey] as string | undefined;
                    const closeValue = (formData as any)[closeKey] as string | undefined;
                    const isDaySet = Boolean(openValue && closeValue);

                    return (
                      <div key={day.key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                        <div>
                          <Label>{t(day.labelKey, { defaultValue: day.key })}</Label>
                        </div>
                        <div className="flex flex-row gap-2 sm:gap-4 col-span-1 sm:col-span-2 items-center">
                          <div className="flex-1 min-w-0">
                            <TimeSelect
                              value={openValue === undefined ? "" : openValue}
                              onValueChange={(v) => handleDayChange(day.key, "Open", v)}
                              disabled={!canUpdate}
                            >
                              <TimeSelectTrigger>
                                <TimeSelectValue
                                  placeholder={t("admin.reservationSettings.operatingHours.openTime", {
                                    defaultValue: "Open",
                                  })}
                                />
                              </TimeSelectTrigger>
                              <TimeSelectContent>
                                {timeOptions.map((opt) => (
                                  <TimeSelectItem key={`open-${day.key}-${opt}`} value={opt}>
                                    {formatTime12HourLabel(opt)}
                                  </TimeSelectItem>
                                ))}
                              </TimeSelectContent>
                            </TimeSelect>
                          </div>

                          <div className="flex-1 min-w-0">
                            <TimeSelect
                              value={closeValue === undefined ? "" : closeValue}
                              onValueChange={(v) => handleDayChange(day.key, "Close", v)}
                              disabled={!canUpdate}
                            >
                              <TimeSelectTrigger>
                                <TimeSelectValue
                                  placeholder={t("admin.reservationSettings.operatingHours.closeTime", {
                                    defaultValue: "Close",
                                  })}
                                />
                              </TimeSelectTrigger>
                              <TimeSelectContent>
                                {timeOptions.map((opt) => (
                                  <TimeSelectItem key={`close-${day.key}-${opt}`} value={opt}>
                                    {formatTime12HourLabel(opt)}
                                  </TimeSelectItem>
                                ))}
                              </TimeSelectContent>
                            </TimeSelect>
                          </div>

                          {isDaySet ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                handleInputChange(openKey, undefined);
                                handleInputChange(closeKey, undefined);
                              }}
                              disabled={!canUpdate}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-10 w-10 p-0"
                            >
                              <Icon path={mdiClose} size={0.67} />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                icon={<Icon path={mdiCalendar} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.bookingRules.title", { defaultValue: "Booking Rules" })}
                description={t("admin.reservationSettings.bookingRules.description", {
                  defaultValue: "Configure reservation booking rules and constraints",
                })}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.bookingRules.timeSlotInterval", { defaultValue: "Time Slot Interval (minutes)" })}</Label>
                      <Input
                        type="text"
                        placeholder={t("admin.reservationSettings.bookingRules.timeSlotIntervalPlaceholder", { defaultValue: "30" })}
                        value={formData.timeSlotInterval !== undefined ? String(formData.timeSlotInterval) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d+$/.test(v)) {
                            handleInputChange("timeSlotInterval", v === "" ? undefined : Number(v));
                          }
                        }}
                        disabled={!canUpdate}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.bookingRules.maxGuestsPerReservation", { defaultValue: "Max Guests Per Reservation" })}</Label>
                      <Input
                        type="text"
                        placeholder={t("admin.reservationSettings.bookingRules.maxGuestsPlaceholder", { defaultValue: "e.g., 20" })}
                        value={formData.maxGuestsPerReservation !== undefined ? String(formData.maxGuestsPerReservation) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d+$/.test(v)) {
                            handleInputChange("maxGuestsPerReservation", v === "" ? undefined : Number(v));
                          }
                        }}
                        disabled={!canUpdate}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.bookingRules.minAdvanceBooking", { defaultValue: "Min Advance Booking (hours)" })}</Label>
                      <Input
                        type="text"
                        placeholder={t("admin.reservationSettings.bookingRules.minAdvanceBookingPlaceholder", { defaultValue: "e.g., 4" })}
                        value={formData.minAdvanceBookingHours !== undefined ? String(formData.minAdvanceBookingHours) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d+$/.test(v)) {
                            handleInputChange("minAdvanceBookingHours", v === "" ? undefined : Number(v));
                          }
                        }}
                        disabled={!canUpdate}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.bookingRules.maxAdvanceBooking", { defaultValue: "Max Advance Booking (days)" })}</Label>
                      <Input
                        type="text"
                        placeholder={t("admin.reservationSettings.bookingRules.maxAdvanceBookingPlaceholder", { defaultValue: "e.g., 30" })}
                        value={formData.maxAdvanceBookingDays !== undefined ? String(formData.maxAdvanceBookingDays) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d+$/.test(v)) {
                            handleInputChange("maxAdvanceBookingDays", v === "" ? undefined : Number(v));
                          }
                        }}
                        disabled={!canUpdate}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.bookingRules.modificationWindow", { defaultValue: "Modification Window (hours)" })}</Label>
                      <Input
                        type="text"
                        placeholder={t("admin.reservationSettings.bookingRules.modificationWindowPlaceholder", { defaultValue: "e.g., 24" })}
                        value={formData.modificationWindowHours !== undefined ? String(formData.modificationWindowHours) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d+$/.test(v)) {
                            handleInputChange("modificationWindowHours", v === "" ? undefined : Number(v));
                          }
                        }}
                        disabled={!canUpdate}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("admin.reservationSettings.bookingRules.allowSameDayBooking", { defaultValue: "Allow Same-Day Booking" })}</Label>
                    <Switch
                      checked={Boolean(formData.allowSameDayBooking ?? true)}
                      onCheckedChange={(checked) => handleInputChange("allowSameDayBooking", Boolean(checked))}
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("admin.reservationSettings.bookingRules.allowCancellation", { defaultValue: "Allow Cancellation" })}</Label>
                    <Switch
                      checked={Boolean(formData.allowCancellation ?? true)}
                      onCheckedChange={(checked) => handleInputChange("allowCancellation", Boolean(checked))}
                      disabled={!canUpdate}
                    />
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                icon={<Icon path={mdiAccountGroup} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.preOrderSettings.title", { defaultValue: "Pre-Order Settings" })}
                description={t("admin.reservationSettings.preOrderSettings.description", {
                  defaultValue: "Configure pre-order reservation options",
                })}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("admin.reservationSettings.preOrderSettings.enablePreOrder", { defaultValue: "Enable Pre-Order Reservations" })}</Label>
                    <Switch
                      checked={Boolean(formData.enablePreOrder ?? true)}
                      onCheckedChange={(checked) => handleInputChange("enablePreOrder", Boolean(checked))}
                      disabled={!canUpdate}
                    />
                  </div>

                  {Boolean(formData.enablePreOrder) ? (
                    <>
                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.minimumOrderAmount", { defaultValue: "Minimum Order Amount (optional)" })}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.preOrderMinAmount !== undefined ? String(formData.preOrderMinAmount) : ""}
                          onChange={(e) =>
                            handleInputChange("preOrderMinAmount", e.target.value ? Number(e.target.value) : undefined)
                          }
                          disabled={!canUpdate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.depositPercentage", { defaultValue: "Deposit Percentage" })}</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={formData.depositPercentage !== undefined ? String(formData.depositPercentage) : ""}
                          onChange={(e) =>
                            handleInputChange("depositPercentage", e.target.value ? Number(e.target.value) : undefined)
                          }
                          disabled={!canUpdate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.allowedPaymentMethods", { defaultValue: "Allowed Payment Methods" })}</Label>
                        <div className="space-y-2">
                          {[
                            {
                              key: "ONLINE_CARD",
                              labelKey: "admin.reservationSettings.preOrderSettings.paymentMethodOnlineCard",
                              fallback: "Online Card Payment (Stripe)",
                            },
                            {
                              key: "PAYPAL",
                              labelKey: "admin.reservationSettings.preOrderSettings.paymentMethodPayPal",
                              fallback: "PayPal",
                            },
                            {
                              key: "NONE",
                              labelKey: "admin.reservationSettings.preOrderSettings.paymentMethodNone",
                              fallback: "No Payment Required (COD)",
                            },
                          ].map((m) => {
                            const current = Array.isArray(formData.allowedPaymentMethods)
                              ? (formData.allowedPaymentMethods as string[])
                              : [];
                            const checked = current.includes(m.key);
                            return (
                              <div key={m.key} className="flex items-center space-x-2">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    const next = new Set(current);
                                    if (c) next.add(m.key);
                                    else next.delete(m.key);
                                    handleInputChange("allowedPaymentMethods", Array.from(next));
                                  }}
                                  disabled={!canUpdate}
                                />
                                <Label className="font-normal">
                                  {t(m.labelKey, { defaultValue: m.fallback })}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.fullRefundHoursBefore", { defaultValue: "Full Refund (hours before)" })}</Label>
                          <Input
                            type="text"
                            value={formData.fullRefundHoursBefore !== undefined ? String(formData.fullRefundHoursBefore) : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v)) {
                                handleInputChange("fullRefundHoursBefore", v === "" ? undefined : Number(v));
                              }
                            }}
                            disabled={!canUpdate}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.partialRefundHoursBefore", { defaultValue: "Partial Refund (hours before)" })}</Label>
                          <Input
                            type="text"
                            value={formData.partialRefundHoursBefore !== undefined ? String(formData.partialRefundHoursBefore) : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v)) {
                                handleInputChange("partialRefundHoursBefore", v === "" ? undefined : Number(v));
                              }
                            }}
                            disabled={!canUpdate}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.noRefundHoursBefore", { defaultValue: "No Refund (hours before)" })}</Label>
                          <Input
                            type="text"
                            value={formData.noRefundHoursBefore !== undefined ? String(formData.noRefundHoursBefore) : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v)) {
                                handleInputChange("noRefundHoursBefore", v === "" ? undefined : Number(v));
                              }
                            }}
                            disabled={!canUpdate}
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title={t("admin.reservationSettings.advancedSettings.title", { defaultValue: "Advanced Settings" })}
                description={t("admin.reservationSettings.advancedSettings.description", {
                  defaultValue: "Additional reservation management settings",
                })}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.advancedSettings.maxCapacityPerTimeSlot", { defaultValue: "Max Capacity Per Time Slot" })}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.maxCapacityPerTimeSlot !== undefined ? String(formData.maxCapacityPerTimeSlot) : ""}
                      onChange={(e) =>
                        handleInputChange("maxCapacityPerTimeSlot", e.target.value ? Number(e.target.value) : undefined)
                      }
                      disabled={!canUpdate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.advancedSettings.bufferTimeMinutes", { defaultValue: "Buffer Time Between Reservations (minutes)" })}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.bufferTimeMinutes !== undefined ? String(formData.bufferTimeMinutes) : ""}
                      onChange={(e) =>
                        handleInputChange("bufferTimeMinutes", e.target.value ? Number(e.target.value) : undefined)
                      }
                      disabled={!canUpdate}
                    />
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                icon={<Icon path={mdiCalendar} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.excludedDates.title", { defaultValue: "Excluded Dates" })}
                description={t("admin.reservationSettings.excludedDates.description", {
                  defaultValue: "Define dates or date ranges when reservations will not be accepted",
                })}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.excludedDates.singleExcludedDates", { defaultValue: "Single Excluded Dates" })}</Label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newSingleDate}
                        onChange={(e) => setNewSingleDate(e.target.value)}
                        disabled={!canUpdate}
                        style={{
                          flex: 1,
                          height: "40px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          padding: "0 10px",
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addSingleDate}
                        disabled={!canUpdate || !newSingleDate}
                      >
                        <Icon path={mdiPlus} size={0.67} className="mr-1" />
                        {t("common.add", { defaultValue: "Add" })}
                      </Button>
                    </div>

                    {excludedSingleDates.length > 0 ? (
                      <div className="space-y-2">
                        {excludedSingleDates.map((d) => (
                          <div
                            key={d}
                            className="flex items-center justify-between border border-border rounded-md px-3 py-2"
                          >
                            <span className="text-sm">{formatExcludedDate(d)}</span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeSingleDate(d)}
                              disabled={!canUpdate}
                              className="text-white"
                            >
                              {t("common.remove", { defaultValue: "Remove" })}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("admin.reservationSettings.excludedDates.noSingleDatesExcluded", {
                          defaultValue: "No single dates excluded",
                        })}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t("admin.reservationSettings.excludedDates.excludedDateRanges", { defaultValue: "Excluded Date Ranges" })}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addDateRange}
                        disabled={!canUpdate}
                      >
                        <Icon path={mdiPlus} size={0.67} className="mr-1" />
                        {t("admin.reservationSettings.excludedDates.addRange", { defaultValue: "Add Range" })}
                      </Button>
                    </div>

                    {excludedDateRanges.length > 0 ? (
                      <div className="space-y-3">
                        {excludedDateRanges.map((r, idx) => (
                          <div key={idx} className="border border-border rounded-md p-3 space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {r.start || r.end
                                ? `${r.start ? formatExcludedDate(r.start) : ""}${r.start && r.end ? " - " : ""}${r.end ? formatExcludedDate(r.end) : ""}`
                                : t("admin.reservationSettings.excludedDates.selectRange", {
                                    defaultValue: "Select a date range",
                                  })}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  {t("admin.reservationSettings.excludedDates.startDate", { defaultValue: "Start Date" })}
                                </Label>
                                <input
                                  type="date"
                                  value={r.start}
                                  onChange={(e) => updateDateRange(idx, { start: e.target.value })}
                                  disabled={!canUpdate}
                                  style={{
                                    width: "100%",
                                    height: "40px",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "8px",
                                    padding: "0 10px",
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  {t("admin.reservationSettings.excludedDates.endDate", { defaultValue: "End Date" })}
                                </Label>
                                <input
                                  type="date"
                                  value={r.end}
                                  onChange={(e) => updateDateRange(idx, { end: e.target.value })}
                                  disabled={!canUpdate}
                                  style={{
                                    width: "100%",
                                    height: "40px",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "8px",
                                    padding: "0 10px",
                                  }}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => removeDateRange(idx)}
                                disabled={!canUpdate}
                                className="text-white"
                              >
                                <Icon path={mdiDelete} size={0.67} className="mr-1" />
                                {t("common.delete", { defaultValue: "Delete" })}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("admin.reservationSettings.excludedDates.noDateRangesExcluded", {
                          defaultValue: "No date ranges excluded",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </CollapsibleCard>
            </>
          ) : null}
        </div>
      )}

      {isSuperAdmin && !selectedOrganizationId.trim() ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle>{t("admin.reservationSettings.title", { defaultValue: "Reservation Settings" })}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("admin.organizations.select", { defaultValue: "Select organization" })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default ReservationSettings;
