import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Switch from "@/components/Switch";
import Select from "@/components/Select";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import {
  Select as TimeSelect,
  SelectTrigger as TimeSelectTrigger,
  SelectContent as TimeSelectContent,
  SelectItem as TimeSelectItem,
  SelectValue as TimeSelectValue,
} from "@/components/ui/select";

import Icon from "@mdi/react";
import {
  mdiContentSave,
  mdiRefresh,
  mdiArrowLeft,
  mdiClose,
  mdiCog,
  mdiClock,
  mdiCalendar,
  mdiAccountGroup,
} from "@mdi/js";

import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import { toast } from "@/components/Toast";

import branchService from "@/services/branchService";
import {
  reservationService,
  type ReservationSettingsFormData,
  type ReservationTier,
} from "@/services/reservationService";

type ExcludedDatesPayload = {
  singleDates: string[];
  dateRanges: Array<{ start: string; end: string }>;
};

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
  // Expected input: YYYY-MM-DD (as stored)
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;

  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
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

const BranchReservationSettings: React.FC = () => {
  const { id: branchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { getToken } = useAuth();
  const { canAny } = usePermissions();

  const canView = canAny([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS },
  ]);
  const canUpdate = canAny([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.UPDATE_BRANCH_RESERVATION_SETTINGS },
  ]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [branchName, setBranchName] = useState("");
  const [orgReservationsAllowed, setOrgReservationsAllowed] = useState(true);

  const [globalSettings, setGlobalSettings] = useState<Partial<ReservationSettingsFormData>>({});
  const [formData, setFormData] = useState<Partial<ReservationSettingsFormData>>({ tier: "SIMPLE" as ReservationTier });
  const [branchOverrides, setBranchOverrides] = useState<Set<string>>(new Set());

  const [excludedSingleDates, setExcludedSingleDates] = useState<string[]>([]);
  const [excludedDateRanges, setExcludedDateRanges] = useState<Array<{ start: string; end: string }>>([]);

  const [newSingleDate, setNewSingleDate] = useState<string>("");

  const isOverridden = useCallback(
    (field: string) => branchOverrides.has(field),
    [branchOverrides]
  );

  const loadSettings = useCallback(async () => {
    if (!branchId) return;

    try {
      setLoading(true);
      const token = await getToken();
      const tkn = token || undefined;

      const branch = await branchService.getBranch(branchId, tkn);
      setBranchName(branch.name || "");

      const allowed = (branch as any)?.organization?.reservationsAllowed !== false;
      setOrgReservationsAllowed(allowed);
      if (!allowed) {
        toast.error(
          t("admin.reservationSettings.notAllowed", {
            defaultValue: "Reservations are disabled for this organization",
          })
        );
        navigate("/admin/branches");
        return;
      }

      const global = await reservationService.getSettings(tkn);
      setGlobalSettings(global || {});

      const merged = await reservationService.getSettings(tkn, branchId);

      const branchData = await branchService.getBranch(branchId, tkn);
      const overrides = new Set<string>();

      if ((branchData as any).reservationIsEnabled !== null && (branchData as any).reservationIsEnabled !== undefined) {
        overrides.add("isEnabled");
      }
      if ((branchData as any).reservationTier) {
        overrides.add("tier");
      }

      const mapping: Array<[string, string]> = [
        ["reservationTimeSlotInterval", "timeSlotInterval"],
        ["reservationMaxGuestsPerReservation", "maxGuestsPerReservation"],
        ["reservationMinAdvanceBookingHours", "minAdvanceBookingHours"],
        ["reservationMaxAdvanceBookingDays", "maxAdvanceBookingDays"],
        ["reservationModificationWindowHours", "modificationWindowHours"],
        ["reservationAllowSameDayBooking", "allowSameDayBooking"],
        ["reservationAllowCancellation", "allowCancellation"],
        ["reservationEnablePreOrder", "enablePreOrder"],
        ["reservationPreOrderMinAmount", "preOrderMinAmount"],
        ["reservationFullRefundHoursBefore", "fullRefundHoursBefore"],
        ["reservationPartialRefundHoursBefore", "partialRefundHoursBefore"],
        ["reservationNoRefundHoursBefore", "noRefundHoursBefore"],
        ["reservationMaxCapacityPerTimeSlot", "maxCapacityPerTimeSlot"],
        ["reservationBufferTimeMinutes", "bufferTimeMinutes"],
        ["reservationDepositPercentage", "depositPercentage"],
        ["reservationAllowedPaymentMethods", "allowedPaymentMethods"],
      ];

      for (const [branchKey, formKey] of mapping) {
        const v = (branchData as any)[branchKey];
        if (v !== null && v !== undefined) overrides.add(formKey);
      }

      daysOfWeek.forEach((day) => {
        const dayKey = day.key.charAt(0).toUpperCase() + day.key.slice(1);
        const openValue = (branchData as any)[`reservation${dayKey}Open`];
        const closeValue = (branchData as any)[`reservation${dayKey}Close`];
        if (openValue !== null && openValue !== undefined) overrides.add(`${day.key}Open`);
        if (closeValue !== null && closeValue !== undefined) overrides.add(`${day.key}Close`);
      });

      const excludedValue = (branchData as any).reservationExcludedDates;
      if (excludedValue !== null && excludedValue !== undefined) overrides.add("excludedDates");

      setBranchOverrides(overrides);

      const tierValue = (merged as any)?.tier;
      const normalizedTier: ReservationTier =
        tierValue === "SIMPLE" || tierValue === "MEDIUM" || tierValue === "COMPLEX" ? tierValue : "SIMPLE";

      const depositFromMerged = (merged as any)?.depositPercentage;
      const depositFromGlobal = (global as any)?.depositPercentage;
      const depositPercentage =
        depositFromMerged !== undefined && depositFromMerged !== null
          ? Number(depositFromMerged)
          : depositFromGlobal !== undefined && depositFromGlobal !== null
            ? Number(depositFromGlobal)
            : 100;

      let allowedPaymentMethods: string[] = [];
      if ((merged as any)?.allowedPaymentMethods !== undefined) {
        allowedPaymentMethods = Array.isArray((merged as any)?.allowedPaymentMethods)
          ? (merged as any).allowedPaymentMethods
          : (merged as any).allowedPaymentMethods === null
            ? []
            : [];
      } else if ((global as any)?.allowedPaymentMethods !== undefined) {
        allowedPaymentMethods = Array.isArray((global as any)?.allowedPaymentMethods)
          ? (global as any).allowedPaymentMethods
          : (global as any).allowedPaymentMethods === null
            ? []
            : [];
      } else {
        allowedPaymentMethods = ["ONLINE_CARD", "PAYPAL"]; // matches React fallback when field missing
      }

      setFormData({
        ...(merged || {}),
        tier: normalizedTier,
        depositPercentage,
        allowedPaymentMethods,
      });

      const excluded = safeParseExcludedDates((merged as any)?.excludedDates);
      setExcludedSingleDates(excluded.singleDates);
      setExcludedDateRanges(excluded.dateRanges);
    } catch (e: any) {
      console.error("Failed to load branch reservation settings", e);
      toast.error(
        t("admin.branchManagement.reservationSettings.loadError", {
          defaultValue: "Failed to load reservation settings",
        })
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, getToken, navigate, t]);

  useEffect(() => {
    if (!branchId) return;
    if (!canView) return;
    loadSettings();
  }, [branchId, canView, loadSettings]);

  const handleInputChange = useCallback(
    (field: keyof ReservationSettingsFormData, value: any) => {
      setFormData((prev) => ({ ...prev, [field]: value }));

      const globalValue = (globalSettings as any)?.[field];
      const isExplicitlySet = value !== undefined;
      const isNowOverridden =
        field === "isEnabled"
          ? isExplicitlySet
          : isExplicitlySet && (value !== globalValue || value === null || value === "");

      setBranchOverrides((prev) => {
        const next = new Set(prev);
        if (isNowOverridden) next.add(field as string);
        if (value === undefined) next.delete(field as string);
        return next;
      });
    },
    [globalSettings]
  );

  const handleDayChange = useCallback(
    (dayKey: string, field: "Open" | "Close", value: string) => {
      const key = `${dayKey}${field}` as keyof ReservationSettingsFormData;
      const finalValue = value === "" ? "" : value || undefined;
      handleInputChange(key, finalValue);
    },
    [handleInputChange]
  );

  const timeOptions = useMemo(() => buildTimeOptions(15), []);

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
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const removeSingleDate = (dateStr: string) => {
    setExcludedSingleDates((prev) => prev.filter((d) => d !== dateStr));
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const addDateRange = () => {
    setExcludedDateRanges((prev) => [...prev, { start: "", end: "" }]);
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const updateDateRange = (index: number, patch: Partial<{ start: string; end: string }>) => {
    setExcludedDateRanges((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const removeDateRange = (index: number) => {
    setExcludedDateRanges((prev) => prev.filter((_, i) => i !== index));
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };

  const handleSave = async () => {
    if (!branchId) return;
    if (!canUpdate) return;
    if (!orgReservationsAllowed) return;

    try {
      setSaving(true);
      const token = await getToken();
      const tkn = token || undefined;

      const branchUpdate: any = {};

      branchUpdate.reservationIsEnabled = isOverridden("isEnabled") ? formData.isEnabled : null;
      branchUpdate.reservationTier = isOverridden("tier") ? formData.tier : null;
      branchUpdate.reservationTimeSlotInterval = isOverridden("timeSlotInterval") ? formData.timeSlotInterval : null;
      branchUpdate.reservationMaxGuestsPerReservation = isOverridden("maxGuestsPerReservation") ? formData.maxGuestsPerReservation : null;
      branchUpdate.reservationMinAdvanceBookingHours = isOverridden("minAdvanceBookingHours") ? formData.minAdvanceBookingHours : null;
      branchUpdate.reservationMaxAdvanceBookingDays = isOverridden("maxAdvanceBookingDays") ? formData.maxAdvanceBookingDays : null;
      branchUpdate.reservationModificationWindowHours = isOverridden("modificationWindowHours") ? formData.modificationWindowHours : null;
      branchUpdate.reservationAllowSameDayBooking = isOverridden("allowSameDayBooking") ? formData.allowSameDayBooking : null;
      branchUpdate.reservationAllowCancellation = isOverridden("allowCancellation") ? formData.allowCancellation : null;
      branchUpdate.reservationEnablePreOrder = isOverridden("enablePreOrder") ? formData.enablePreOrder : null;
      branchUpdate.reservationPreOrderMinAmount = isOverridden("preOrderMinAmount") ? formData.preOrderMinAmount : null;
      branchUpdate.reservationFullRefundHoursBefore = isOverridden("fullRefundHoursBefore") ? formData.fullRefundHoursBefore : null;
      branchUpdate.reservationPartialRefundHoursBefore = isOverridden("partialRefundHoursBefore") ? formData.partialRefundHoursBefore : null;
      branchUpdate.reservationNoRefundHoursBefore = isOverridden("noRefundHoursBefore") ? formData.noRefundHoursBefore : null;
      branchUpdate.reservationMaxCapacityPerTimeSlot = isOverridden("maxCapacityPerTimeSlot") ? formData.maxCapacityPerTimeSlot : null;
      branchUpdate.reservationBufferTimeMinutes = isOverridden("bufferTimeMinutes") ? formData.bufferTimeMinutes : null;
      branchUpdate.reservationDepositPercentage = isOverridden("depositPercentage") ? formData.depositPercentage : null;
      branchUpdate.reservationAllowedPaymentMethods = isOverridden("allowedPaymentMethods") ? formData.allowedPaymentMethods : null;

      daysOfWeek.forEach((day) => {
        const dayTitle = day.key.charAt(0).toUpperCase() + day.key.slice(1);
        const openKey = `${day.key}Open`;
        const closeKey = `${day.key}Close`;

        if (isOverridden(openKey)) {
          const v = (formData as any)[openKey];
          branchUpdate[`reservation${dayTitle}Open`] = v === undefined ? null : v === "" ? "" : v;
        } else {
          branchUpdate[`reservation${dayTitle}Open`] = null;
        }

        if (isOverridden(closeKey)) {
          const v = (formData as any)[closeKey];
          branchUpdate[`reservation${dayTitle}Close`] = v === undefined ? null : v === "" ? "" : v;
        } else {
          branchUpdate[`reservation${dayTitle}Close`] = null;
        }
      });

      if (
        isOverridden("excludedDates") ||
        excludedSingleDates.length > 0 ||
        excludedDateRanges.length > 0
      ) {
        branchUpdate.reservationExcludedDates = {
          singleDates: excludedSingleDates,
          dateRanges: excludedDateRanges
            .filter((r) => r.start && r.end)
            .map((r) => ({ start: r.start, end: r.end })),
        };
      } else {
        branchUpdate.reservationExcludedDates = null;
      }

      await branchService.updateBranch(branchId, branchUpdate, tkn);
      toast.success(
        t("admin.branchManagement.reservationSettings.saveSuccess", {
          defaultValue: "Saved",
        })
      );

      await loadSettings();
    } catch (e: any) {
      console.error("Failed to save reservation settings", e);
      toast.error(
        e?.response?.data?.error ||
          t("admin.branchManagement.reservationSettings.saveError", {
            defaultValue: "Failed to save",
          })
      );
    } finally {
      setSaving(false);
    }
  };

  const title = useMemo(() => {
    const name = branchName || t("admin.branchManagement.branch", { defaultValue: "Branch" });
    return t("admin.branchManagement.reservationSettings.title", {
      branchName: name,
      defaultValue: `Reservation Settings - ${name}`,
    }) as string;
  }, [branchName, t]);

  if (!canView) {
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
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-pink-500">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.branchManagement.reservationSettings.description", {
              defaultValue: "Configure reservation settings for this branch.",
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/branches")}
            className="bg-transparent hover:bg-muted text-foreground border border-border"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="mr-2" />
            {t("common.back", { defaultValue: "Back" })}
          </Button>
          <Button
            variant="outline"
            onClick={() => loadSettings()}
            disabled={loading || saving}
            className="bg-transparent hover:bg-muted text-foreground border border-border"
          >
            <Icon path={mdiRefresh} size={0.67} className={loading ? "mr-2 animate-spin" : "mr-2"} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !canUpdate || !orgReservationsAllowed}
            className="bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-60"
          >
            <Icon path={mdiContentSave} size={0.67} className="mr-2" />
            {saving
              ? t("common.saving", { defaultValue: "Saving..." })
              : t("common.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            {t("common.loading", { defaultValue: "Loading..." })}
          </CardContent>
        </Card>
      ) : (
        <>
          <CollapsibleCard
            defaultOpen
            icon={<Icon path={mdiCog} size={0.83} className="text-pink-500" />}
            title={t("admin.reservationSettings.systemSettings.title", {
              defaultValue: "System Settings",
            })}
            description={t("admin.reservationSettings.systemSettings.description", {
              defaultValue: "Enable reservations and choose a tier.",
            })}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>
                      {t("admin.reservationSettings.systemSettings.enableReservations", {
                        defaultValue: "Enable reservations",
                      })}
                    </Label>
                    {isOverridden("isEnabled") && (
                      <span className="text-xs text-pink-600">
                        {t("admin.branchManagement.reservationSettings.overridden", {
                          defaultValue: "Overridden",
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationSettings.systemSettings.enableReservationsDescription", {
                      defaultValue: "Allow customers to book reservations.",
                    })}
                  </p>
                </div>
                <div>
                  <Switch
                    checked={Boolean(formData.isEnabled)}
                    onCheckedChange={(checked) => handleInputChange("isEnabled", Boolean(checked))}
                    disabled={!canUpdate}
                  />
                </div>
              </div>

              {Boolean(formData.isEnabled) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>
                      {t("admin.reservationSettings.systemSettings.tierSelection", {
                        defaultValue: "Tier",
                      })}
                    </Label>
                    {isOverridden("tier") && (
                      <span className="text-xs text-pink-600">
                        {t("admin.branchManagement.reservationSettings.overridden", {
                          defaultValue: "Overridden",
                        })}
                      </span>
                    )}
                  </div>

                  <Select
                    value={(formData.tier as any) || "SIMPLE"}
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

          {Boolean(formData.isEnabled) && (
            <>
              <CollapsibleCard
                defaultOpen
                icon={<Icon path={mdiClock} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.operatingHours.title", {
                  defaultValue: "Operating Hours",
                })}
                description={t("admin.reservationSettings.operatingHours.description", {
                  defaultValue: "Set daily operating hours for reservations.",
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
                        <div className="flex items-center gap-2">
                          <Label>{t(day.labelKey, { defaultValue: day.key })}</Label>
                          {(isOverridden(String(openKey)) || isOverridden(String(closeKey))) && (
                            <span className="text-xs text-pink-600">
                              {t("admin.branchManagement.reservationSettings.overridden", {
                                defaultValue: "Overridden",
                              })}
                            </span>
                          )}
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

                          {isDaySet && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                handleInputChange(openKey, "");
                                handleInputChange(closeKey, "");
                              }}
                              disabled={!canUpdate}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-10 w-10 p-0"
                            >
                              <Icon path={mdiClose} size={0.67} />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                icon={<Icon path={mdiCalendar} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.bookingRules.title", {
                  defaultValue: "Booking Rules",
                })}
                description={t("admin.reservationSettings.bookingRules.description", {
                  defaultValue: "Configure time slots, advance booking, and rules.",
                })}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.bookingRules.timeSlotInterval", { defaultValue: "Time slot interval" })}</Label>
                      <Input
                        placeholder={t("admin.reservationSettings.bookingRules.timeSlotIntervalPlaceholder", {
                          defaultValue: "15",
                        })}
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
                      <Label>{t("admin.reservationSettings.bookingRules.maxGuestsPerReservation", { defaultValue: "Max guests per reservation" })}</Label>
                      <Input
                        placeholder={t("admin.reservationSettings.bookingRules.maxGuestsPlaceholder", {
                          defaultValue: "6",
                        })}
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
                      <Label>{t("admin.reservationSettings.bookingRules.minAdvanceBooking", { defaultValue: "Min advance booking (hours)" })}</Label>
                      <Input
                        placeholder={t("admin.reservationSettings.bookingRules.minAdvanceBookingPlaceholder", {
                          defaultValue: "2",
                        })}
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
                      <Label>{t("admin.reservationSettings.bookingRules.maxAdvanceBooking", { defaultValue: "Max advance booking (days)" })}</Label>
                      <Input
                        placeholder={t("admin.reservationSettings.bookingRules.maxAdvanceBookingPlaceholder", {
                          defaultValue: "30",
                        })}
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
                      <Label>{t("admin.reservationSettings.bookingRules.modificationWindow", { defaultValue: "Modification window (hours)" })}</Label>
                      <Input
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
                    <Label>{t("admin.reservationSettings.bookingRules.allowSameDayBooking", { defaultValue: "Allow same-day booking" })}</Label>
                    <Switch
                      checked={Boolean(formData.allowSameDayBooking ?? true)}
                      onCheckedChange={(checked) => handleInputChange("allowSameDayBooking", Boolean(checked))}
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("admin.reservationSettings.bookingRules.allowCancellation", { defaultValue: "Allow cancellation" })}</Label>
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
                title={t("admin.reservationSettings.preOrderSettings.title", {
                  defaultValue: "Pre-Order Settings",
                })}
                description={t("admin.reservationSettings.preOrderSettings.description", {
                  defaultValue: "Configure pre-order and deposit settings.",
                })}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("admin.reservationSettings.preOrderSettings.enablePreOrder", { defaultValue: "Enable pre-order" })}</Label>
                    <Switch
                      checked={Boolean(formData.enablePreOrder ?? true)}
                      onCheckedChange={(checked) => handleInputChange("enablePreOrder", Boolean(checked))}
                      disabled={!canUpdate}
                    />
                  </div>

                  {Boolean(formData.enablePreOrder) && (
                    <>
                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.minimumOrderAmount", { defaultValue: "Minimum order amount" })}</Label>
                        <Input
                          type="number"
                          value={formData.preOrderMinAmount !== undefined ? String(formData.preOrderMinAmount) : ""}
                          onChange={(e) => handleInputChange("preOrderMinAmount", e.target.value ? Number(e.target.value) : undefined)}
                          disabled={!canUpdate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.depositPercentage", { defaultValue: "Deposit percentage" })}</Label>
                        <Input
                          type="number"
                          value={formData.depositPercentage !== undefined ? String(formData.depositPercentage) : ""}
                          onChange={(e) => handleInputChange("depositPercentage", e.target.value ? Number(e.target.value) : undefined)}
                          disabled={!canUpdate}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.allowedPaymentMethods", { defaultValue: "Allowed payment methods" })}</Label>
                        <div className="space-y-2">
                          {[
                            { key: "ONLINE_CARD", labelKey: "admin.reservationSettings.preOrderSettings.paymentMethodOnlineCard", fallback: "Online card" },
                            { key: "PAYPAL", labelKey: "admin.reservationSettings.preOrderSettings.paymentMethodPayPal", fallback: "PayPal" },
                            { key: "NONE", labelKey: "admin.reservationSettings.preOrderSettings.paymentMethodNone", fallback: "None" },
                          ].map((m) => {
                            const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
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
                          <Label>{t("admin.reservationSettings.preOrderSettings.fullRefundHoursBefore", { defaultValue: "Full refund hours before" })}</Label>
                          <Input
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
                          <Label>{t("admin.reservationSettings.preOrderSettings.partialRefundHoursBefore", { defaultValue: "Partial refund hours before" })}</Label>
                          <Input
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
                          <Label>{t("admin.reservationSettings.preOrderSettings.noRefundHoursBefore", { defaultValue: "No refund hours before" })}</Label>
                          <Input
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
                  )}
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title={t("admin.reservationSettings.advancedSettings.title", {
                  defaultValue: "Advanced Settings",
                })}
                description={t("admin.reservationSettings.advancedSettings.description", {
                  defaultValue: "Advanced capacity and buffer settings.",
                })}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.advancedSettings.maxCapacityPerTimeSlot", { defaultValue: "Max capacity per time slot" })}</Label>
                    <Input
                      type="number"
                      value={formData.maxCapacityPerTimeSlot !== undefined ? String(formData.maxCapacityPerTimeSlot) : ""}
                      onChange={(e) => handleInputChange("maxCapacityPerTimeSlot", e.target.value ? Number(e.target.value) : undefined)}
                      disabled={!canUpdate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.advancedSettings.bufferTimeMinutes", { defaultValue: "Buffer time (minutes)" })}</Label>
                    <Input
                      type="number"
                      value={formData.bufferTimeMinutes !== undefined ? String(formData.bufferTimeMinutes) : ""}
                      onChange={(e) => handleInputChange("bufferTimeMinutes", e.target.value ? Number(e.target.value) : undefined)}
                      disabled={!canUpdate}
                    />
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                icon={<Icon path={mdiCalendar} size={0.83} className="text-pink-500" />}
                title={t("admin.reservationSettings.excludedDates.title", {
                  defaultValue: "Excluded Dates",
                })}
                description={t("admin.reservationSettings.excludedDates.description", {
                  defaultValue: "Exclude dates where reservations are not allowed.",
                })}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.excludedDates.singleExcludedDates", { defaultValue: "Single dates" })}</Label>
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
                        onClick={addSingleDate}
                        disabled={!canUpdate || !newSingleDate}
                        className="bg-transparent text-foreground border border-border hover:bg-muted"
                      >
                        {t("common.add", { defaultValue: "Add" })}
                      </Button>
                    </div>

                    {excludedSingleDates.length > 0 ? (
                      <div className="space-y-2">
                        {excludedSingleDates.map((d) => (
                          <div key={d} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
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
                        {t("admin.reservationSettings.excludedDates.noSingleDatesExcluded", { defaultValue: "No excluded single dates" })}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t("admin.reservationSettings.excludedDates.excludedDateRanges", { defaultValue: "Date ranges" })}</Label>
                      <Button
                        type="button"
                        onClick={addDateRange}
                        disabled={!canUpdate}
                        className="bg-transparent text-foreground border border-border hover:bg-muted"
                      >
                        {t("admin.reservationSettings.excludedDates.addRange", { defaultValue: "Add range" })}
                      </Button>
                    </div>

                    {excludedDateRanges.length > 0 ? (
                      <div className="space-y-3">
                        {excludedDateRanges.map((r, idx) => (
                          <div key={idx} className="border border-border rounded-md p-3 space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {(r.start || r.end)
                                ? `${r.start ? formatExcludedDate(r.start) : ""}${r.start && r.end ? " - " : ""}${r.end ? formatExcludedDate(r.end) : ""}`
                                : t("admin.reservationSettings.excludedDates.selectRange", {
                                    defaultValue: "Select a date range",
                                  })}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("admin.reservationSettings.excludedDates.startDate", { defaultValue: "Start" })}</Label>
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
                                <Label className="text-xs">{t("admin.reservationSettings.excludedDates.endDate", { defaultValue: "End" })}</Label>
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
                                {t("common.delete", { defaultValue: "Delete" })}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("admin.reservationSettings.excludedDates.noDateRangesExcluded", { defaultValue: "No excluded ranges" })}
                      </p>
                    )}
                  </div>
                </div>
              </CollapsibleCard>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default BranchReservationSettings;
