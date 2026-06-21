import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TimePicker } from "@/components/ui/time-picker";
import { DatePicker } from "@/components/ui/date-picker";
import Icon from "@mdi/react";
import { mdiContentSave, mdiRefresh, mdiCalendar, mdiClock, mdiAccountGroup, mdiCog, mdiPlus, mdiClose, mdiDelete, mdiCreditCard } from "@mdi/js";
import {
  type ReservationSettingsFormData,
} from "@/services/reservationService";
import branchService from "@/services/branchService";
import { toast } from "sonner";
import { usePermissions } from "@/contexts/PermissionContext";

const ReservationSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin, isOrgAdmin, rbacUser } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgReservationsAllowed, setOrgReservationsAllowed] = useState(true);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem("bellami:selectedOrganizationId");
      return stored ? stored : "";
    } catch {
      return "";
    }
  });
  const [orgSettingsLoading, setOrgSettingsLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<ReservationSettingsFormData>>({
    tier: "SIMPLE", // Default to Simple tier
  });
  
  // Excluded dates state
  const [excludedSingleDates, setExcludedSingleDates] = useState<string[]>([]);
  const [excludedDateRanges, setExcludedDateRanges] = useState<Array<{ start: string; end: string; startDate?: Date; endDate?: Date }>>([]);
  const [newSingleDate, setNewSingleDate] = useState<Date | undefined>(undefined);

  const daysOfWeek = [
    { key: "monday", label: t("admin.reservationSettings.operatingHours.monday") },
    { key: "tuesday", label: t("admin.reservationSettings.operatingHours.tuesday") },
    { key: "wednesday", label: t("admin.reservationSettings.operatingHours.wednesday") },
    { key: "thursday", label: t("admin.reservationSettings.operatingHours.thursday") },
    { key: "friday", label: t("admin.reservationSettings.operatingHours.friday") },
    { key: "saturday", label: t("admin.reservationSettings.operatingHours.saturday") },
    { key: "sunday", label: t("admin.reservationSettings.operatingHours.sunday") },
  ];

  const orgAdminOrganizationId = (rbacUser as any)?.organizationId as string | null | undefined;

  const canAccess = isSuperAdmin || isOrgAdmin;

  useEffect(() => {
    if (isOrgAdmin && orgAdminOrganizationId) {
      setSelectedOrganizationId(String(orgAdminOrganizationId));
    }
  }, [isOrgAdmin, orgAdminOrganizationId]);

  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const stored = window.localStorage.getItem("bellami:selectedOrganizationId") || "";
        if (stored && stored !== selectedOrganizationId) {
          setSelectedOrganizationId(stored);
        }
      } catch {
        // ignore
      }
    };

    if (isSuperAdmin) {
      window.addEventListener("storage", syncFromStorage);
      window.addEventListener("focus", syncFromStorage);
      return () => {
        window.removeEventListener("storage", syncFromStorage);
        window.removeEventListener("focus", syncFromStorage);
      };
    }

    return;
  }, [isSuperAdmin, selectedOrganizationId]);

  useEffect(() => {
    loadSettings();
  }, [selectedOrganizationId]);

  useEffect(() => {
    try {
      if (!selectedOrganizationId) return;
      window.localStorage.setItem("bellami:selectedOrganizationId", selectedOrganizationId);
    } catch {
      // ignore
    }
  }, [selectedOrganizationId]);


  const loadSettings = async () => {
    try {
      if (!selectedOrganizationId) {
        setLoading(false);
        setOrgReservationsAllowed(true);
        return;
      }

      setLoading(true);
      setOrgSettingsLoading(true);
      const token = (await getToken()) || undefined;
      if (!token) {
        setLoading(false);
        return;
      }

      // Entitlement check: if reservations are disabled for the selected org, show hint and prevent edits.
      try {
        if (isSuperAdmin) {
          const orgs = await branchService.getOrganizations(token);
          const org = (orgs || []).find((o) => String(o.id) === String(selectedOrganizationId));
          const allowed = (org as any)?.reservationsAllowed !== false;
          setOrgReservationsAllowed(allowed);
          if (!allowed) {
            setLoading(false);
            setOrgSettingsLoading(false);
            return;
          }
        } else if (isOrgAdmin) {
          const allowed = (rbacUser as any)?.organizationEntitlements?.reservationsAllowed !== false;
          setOrgReservationsAllowed(allowed);
          if (!allowed) {
            setLoading(false);
            setOrgSettingsLoading(false);
            return;
          }
        }
      } catch {
        // If entitlement fetch fails, default to allowing and let the API respond.
        setOrgReservationsAllowed(true);
      }

      const data = await branchService.getOrganizationReservationSettings(
        selectedOrganizationId,
        token
      );

      if (!data) {
        setFormData({ tier: "SIMPLE" });
        setExcludedSingleDates([]);
        setExcludedDateRanges([]);
        return;
      }

      // Ensure tier defaults to "SIMPLE" if not set
      const tierValue = data.tier && (data.tier === "SIMPLE" || data.tier === "MEDIUM" || data.tier === "COMPLEX") 
        ? data.tier 
        : "SIMPLE";
      
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
      
      // Normalize nulls coming from API into undefined for form state.
      // ReservationSettingsFormData uses optional fields (undefined) rather than null.
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

        timeSlotInterval: data.timeSlotInterval ?? undefined,
        maxGuestsPerReservation: data.maxGuestsPerReservation ?? undefined,
        minAdvanceBookingHours: data.minAdvanceBookingHours ?? undefined,
        maxAdvanceBookingDays: data.maxAdvanceBookingDays ?? undefined,
        allowSameDayBooking: data.allowSameDayBooking ?? undefined,
        allowCancellation: data.allowCancellation ?? undefined,
        modificationWindowHours: data.modificationWindowHours ?? undefined,
        enablePreOrder: data.enablePreOrder ?? undefined,
        preOrderMinAmount:
          data.preOrderMinAmount !== undefined && data.preOrderMinAmount !== null
            ? Number(data.preOrderMinAmount)
            : undefined,
        fullRefundHoursBefore: data.fullRefundHoursBefore ?? undefined,
        partialRefundHoursBefore: data.partialRefundHoursBefore ?? undefined,
        noRefundHoursBefore: data.noRefundHoursBefore ?? undefined,
        maxCapacityPerTimeSlot: data.maxCapacityPerTimeSlot ?? undefined,
        bufferTimeMinutes: data.bufferTimeMinutes ?? undefined,

        depositPercentage,
        allowedPaymentMethods,
      };

      setFormData(normalized);
      
      // Load excluded dates
      if (data.excludedDates) {
        const excluded = typeof data.excludedDates === 'string' 
          ? JSON.parse(data.excludedDates) 
          : data.excludedDates;
        setExcludedSingleDates(excluded.singleDates || []);
        // Convert date strings to Date objects for DatePicker
        const ranges = (excluded.dateRanges || []).map((range: { start: string; end: string }) => ({
          start: range.start,
          end: range.end,
          startDate: range.start ? new Date(range.start + 'T00:00:00') : undefined,
          endDate: range.end ? new Date(range.end + 'T00:00:00') : undefined,
        }));
        setExcludedDateRanges(ranges);
      } else {
        setExcludedSingleDates([]);
        setExcludedDateRanges([]);
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
      toast.error(t("admin.reservationSettings.loadError"));
    } finally {
      setLoading(false);
      setOrgSettingsLoading(false);
    }
  };

  const handleInputChange = (
    field: keyof ReservationSettingsFormData,
    value: any
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDayChange = (day: string, field: "Open" | "Close", value: string) => {
    const fieldKey = `${day.toLowerCase()}${field}` as keyof ReservationSettingsFormData;
    // If value is empty string, set to undefined to unset the day
    handleInputChange(fieldKey, value === "" ? undefined : value);
  };

  const handleSave = async () => {
    try {
      if (!selectedOrganizationId) {
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

      setSaving(true);
      const token = (await getToken()) || undefined;
      if (!token) return;
      
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
        const value = formData[field as keyof ReservationSettingsFormData];
        // Convert undefined, null, or empty string to null so it's included in JSON
        if (value === undefined || value === null || value === '') {
          cleanedFormData[field] = null;
        }
      });
      
      // Prepare excluded dates data - only send start and end strings, not Date objects
      const excludedDates = {
        singleDates: excludedSingleDates,
        dateRanges: excludedDateRanges
          .filter(range => range.start && range.end)
          .map(range => ({
            start: range.start,
            end: range.end,
          })),
      };
      
      await branchService.upsertOrganizationReservationSettings(
        selectedOrganizationId,
        {
          ...cleanedFormData,
          excludedDates,
        },
        token
      );
      toast.success(t("admin.reservationSettings.saveSuccess"));
      await loadSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.response?.data?.error || t("admin.reservationSettings.saveError"));
    } finally {
      setSaving(false);
    }
  };
  
  // Helper functions for excluded dates
  const addSingleDate = (date: Date | undefined) => {
    if (!date) return;
    // Use local date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    if (!excludedSingleDates.includes(dateStr)) {
      setExcludedSingleDates([...excludedSingleDates, dateStr].sort());
      setNewSingleDate(undefined);
    } else {
      toast.error(t("admin.reservationSettings.excludedDates.dateAlreadyExcluded"));
    }
  };
  
  const removeSingleDate = (dateStr: string) => {
    setExcludedSingleDates(excludedSingleDates.filter(d => d !== dateStr));
  };
  
  const addDateRange = () => {
    setExcludedDateRanges([...excludedDateRanges, { start: '', end: '', startDate: undefined, endDate: undefined }]);
  };
  
  const updateDateRangeStart = (index: number, date: Date | undefined) => {
    if (!date) return;
    const updated = [...excludedDateRanges];
    // Use local date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    updated[index] = { 
      ...updated[index], 
      start: dateStr,
      startDate: date,
    };
    setExcludedDateRanges(updated);
  };
  
  const updateDateRangeEnd = (index: number, date: Date | undefined) => {
    if (!date) return;
    const updated = [...excludedDateRanges];
    // Use local date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    updated[index] = { 
      ...updated[index], 
      end: dateStr,
      endDate: date,
    };
    setExcludedDateRanges(updated);
  };
  
  const removeDateRange = (index: number) => {
    setExcludedDateRanges(excludedDateRanges.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.reservationSettings.title")}
          </h2>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">{t("admin.reservationSettings.loading")}</span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.reservationSettings.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.reservationSettings.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="text-sm text-muted-foreground">Access denied</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.reservationSettings.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.reservationSettings.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || orgSettingsLoading || !selectedOrganizationId || !orgReservationsAllowed}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {saving ? (
              <>
                <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                {t("admin.reservationSettings.saving")}
              </>
            ) : (
              <>
                <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                {t("admin.reservationSettings.saveSettings")}
              </>
            )}
          </Button>
        </div>
      </div>

      {!orgReservationsAllowed && selectedOrganizationId && (
        <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-4 py-3 text-sm text-pink-600 dark:text-pink-300">
          {t("admin.reservationSettings.notAllowed", {
            defaultValue: "Reservations are disabled for this organization",
          })}
        </div>
      )}

      <div className={"grid gap-6" + (!orgReservationsAllowed ? " opacity-60 pointer-events-none" : "")}> 
        {/* Master Toggle */}
        <CollapsibleCard
          icon={<Icon path={mdiCog} size={0.83} />}
          title={t("admin.reservationSettings.systemSettings.title")}
          description={t("admin.reservationSettings.systemSettings.description")}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-0.5 flex-1 min-w-0">
                <Label>{t("admin.reservationSettings.systemSettings.enableReservations")}</Label>
                <p className="text-sm text-muted-foreground break-words">
                  {t("admin.reservationSettings.systemSettings.enableReservationsDescription")}
                </p>
              </div>
              <Switch
                checked={formData.isEnabled || false}
                onCheckedChange={(checked) =>
                  handleInputChange("isEnabled", checked)
                }
                className="flex-shrink-0"
              />
            </div>

            {formData.isEnabled && (
              <div className="space-y-2">
                <Label>{t("admin.reservationSettings.systemSettings.tierSelection")}</Label>
                <Select
                  value={formData.tier && (formData.tier === "SIMPLE" || formData.tier === "COMPLEX") ? formData.tier : "SIMPLE"}
                  onValueChange={(value) => {
                    handleInputChange("tier", value as "SIMPLE" | "MEDIUM" | "COMPLEX");
                  }}
                >
                  <SelectTrigger className="w-full bg-transparent">
                    <SelectValue placeholder={t("admin.reservationSettings.systemSettings.tierSimple")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIMPLE">{t("admin.reservationSettings.systemSettings.tierSimple")}</SelectItem>
                    <SelectItem value="COMPLEX" disabled>
                      {t("admin.reservationSettings.systemSettings.tierComplex")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {formData.tier === "SIMPLE" &&
                    t("admin.reservationSettings.systemSettings.tierSimpleDescription")}
                  {formData.tier === "COMPLEX" &&
                    t("admin.reservationSettings.systemSettings.tierComplexDescription")}
                </p>
              </div>
            )}
          </div>
        </CollapsibleCard>

        {formData.isEnabled && (
          <>
            {/* Operating Hours */}
            <CollapsibleCard
              icon={<Icon path={mdiClock} size={0.83} />}
              title={t("admin.reservationSettings.operatingHours.title")}
              description={t("admin.reservationSettings.operatingHours.description")}
            >
              <div className="space-y-4">
                {daysOfWeek.map((day) => {
                  const openTime = formData[`${day.key}Open` as keyof ReservationSettingsFormData] as string | undefined;
                  const closeTime = formData[`${day.key}Close` as keyof ReservationSettingsFormData] as string | undefined;
                  const isDaySet = !!(openTime && closeTime);
                  
                  return (
                  <div key={day.key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-start sm:items-center">
                    <Label className="font-medium text-sm sm:text-base">{day.label}</Label>
                      <div className="flex flex-row gap-2 sm:gap-4 col-span-1 sm:col-span-2 items-center">
                      <TimePicker
                          time={openTime}
                        onTimeChange={(time) =>
                          handleDayChange(day.key, "Open", time || "")
                        }
                        placeholder={t("admin.reservationSettings.operatingHours.openTime")}
                        className="flex-1 min-w-0"
                      />
                      <TimePicker
                          time={closeTime}
                        onTimeChange={(time) =>
                          handleDayChange(day.key, "Close", time || "")
                        }
                        placeholder={t("admin.reservationSettings.operatingHours.closeTime")}
                        className="flex-1 min-w-0"
                      />
                        {isDaySet && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              handleDayChange(day.key, "Open", "");
                              handleDayChange(day.key, "Close", "");
                            }}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 p-0"
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

            {/* Booking Rules */}
            <CollapsibleCard
              icon={<Icon path={mdiCalendar} size={0.83} />}
              title={t("admin.reservationSettings.bookingRules.title")}
              description={t("admin.reservationSettings.bookingRules.description")}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.bookingRules.timeSlotInterval")}</Label>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.timeSlotIntervalPlaceholder")}
                      value={formData.timeSlotInterval !== undefined ? String(formData.timeSlotInterval) : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || /^\d+$/.test(value)) {
                          handleInputChange(
                            "timeSlotInterval",
                            value === "" ? undefined : Number(value)
                          );
                        }
                      }}
                      className="bg-transparent"
                    />
                    <p className="text-xs text-muted-foreground break-words">
                      {t("admin.reservationSettings.bookingRules.timeSlotIntervalDescription")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.bookingRules.maxGuestsPerReservation")}</Label>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.maxGuestsPlaceholder")}
                      value={formData.maxGuestsPerReservation || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        if (value === "" || /^\d+$/.test(value)) {
                        handleInputChange(
                          "maxGuestsPerReservation",
                            value === "" ? undefined : Number(value)
                          );
                      }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.bookingRules.minAdvanceBooking")}</Label>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.minAdvanceBookingPlaceholder")}
                      value={formData.minAdvanceBookingHours || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        if (value === "" || /^\d+$/.test(value)) {
                        handleInputChange(
                          "minAdvanceBookingHours",
                            value === "" ? undefined : Number(value)
                          );
                      }
                      }}
                    />
                    <p className="text-xs text-muted-foreground break-words">
                      {t("admin.reservationSettings.bookingRules.minAdvanceBookingDescription")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.bookingRules.maxAdvanceBooking")}</Label>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.maxAdvanceBookingPlaceholder")}
                      value={formData.maxAdvanceBookingDays || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        if (value === "" || /^\d+$/.test(value)) {
                        handleInputChange(
                          "maxAdvanceBookingDays",
                            value === "" ? undefined : Number(value)
                          );
                      }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("admin.reservationSettings.bookingRules.modificationWindow")}</Label>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.modificationWindowPlaceholder")}
                      value={formData.modificationWindowHours || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        if (value === "" || /^\d+$/.test(value)) {
                          handleInputChange(
                            "modificationWindowHours",
                            value === "" ? undefined : Number(value)
                          );
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground break-words">
                      {t("admin.reservationSettings.bookingRules.modificationWindowDescription")}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <Label>{t("admin.reservationSettings.bookingRules.allowSameDayBooking")}</Label>
                      <p className="text-sm text-muted-foreground break-words">
                        {t("admin.reservationSettings.bookingRules.allowSameDayBookingDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={formData.allowSameDayBooking ?? true}
                      onCheckedChange={(checked) =>
                        handleInputChange("allowSameDayBooking", checked)
                      }
                      className="flex-shrink-0"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <Label>{t("admin.reservationSettings.bookingRules.allowCancellation")}</Label>
                      <p className="text-sm text-muted-foreground break-words">
                        {t("admin.reservationSettings.bookingRules.allowCancellationDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={formData.allowCancellation ?? true}
                      onCheckedChange={(checked) =>
                        handleInputChange("allowCancellation", checked)
                      }
                      className="flex-shrink-0"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleCard>

            {/* Pre-Order Settings */}
            <CollapsibleCard
              icon={<Icon path={mdiAccountGroup} size={0.83} />}
              title={t("admin.reservationSettings.preOrderSettings.title")}
              description={t("admin.reservationSettings.preOrderSettings.description")}
            >
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <Label>{t("admin.reservationSettings.preOrderSettings.enablePreOrder")}</Label>
                    <p className="text-sm text-muted-foreground break-words">
                      {t("admin.reservationSettings.preOrderSettings.enablePreOrderDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={formData.enablePreOrder ?? true}
                    onCheckedChange={(checked) =>
                      handleInputChange("enablePreOrder", checked)
                    }
                    className="flex-shrink-0"
                  />
                </div>

                {formData.enablePreOrder && (
                  <>
                    <div className="space-y-2">
                      <Label>{t("admin.reservationSettings.preOrderSettings.minimumOrderAmount")}</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.preOrderMinAmount || ""}
                        onChange={(e) =>
                          handleInputChange(
                            "preOrderMinAmount",
                            e.target.value ? Number(e.target.value) : undefined
                          )
                        }
                        placeholder={t("admin.reservationSettings.preOrderSettings.minimumOrderAmountPlaceholder")}
                      />
                    </div>

                    <Separator />

                    {/* Deposit & Payment Settings */}
                    <div className="space-y-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <Icon path={mdiCreditCard} size={0.67} />
                        {t("admin.reservationSettings.preOrderSettings.depositAndPayment")}
                      </h4>
                      
                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.depositPercentage")}</Label>
                        <div className="flex items-center gap-2">
                          <NumberInput
                            value={formData.depositPercentage ?? 100}
                            onChange={(value) =>
                              handleInputChange("depositPercentage", value)
                            }
                            allowDecimals={true}
                            min={0}
                            max={100}
                            placeholder="0-100"
                            className="w-32"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("admin.reservationSettings.preOrderSettings.depositPercentageDescription")}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.allowedPaymentMethods")}</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="payment-online-card"
                              checked={Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("ONLINE_CARD")}
                              onCheckedChange={(checked) => {
                                const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
                                if (checked) {
                                  if (!current.includes("ONLINE_CARD")) {
                                    handleInputChange("allowedPaymentMethods", [...current, "ONLINE_CARD"]);
                                  }
                                } else {
                                  handleInputChange("allowedPaymentMethods", current.filter((m) => m !== "ONLINE_CARD"));
                                }
                              }}
                            />
                            <Label htmlFor="payment-online-card" className="font-normal cursor-pointer">
                              {t("admin.reservationSettings.preOrderSettings.paymentMethodOnlineCard")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="payment-paypal"
                              checked={Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("PAYPAL")}
                              onCheckedChange={(checked) => {
                                const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
                                if (checked) {
                                  if (!current.includes("PAYPAL")) {
                                    handleInputChange("allowedPaymentMethods", [...current, "PAYPAL"]);
                                  }
                                } else {
                                  handleInputChange("allowedPaymentMethods", current.filter((m) => m !== "PAYPAL"));
                                }
                              }}
                            />
                            <Label htmlFor="payment-paypal" className="font-normal cursor-pointer">
                              {t("admin.reservationSettings.preOrderSettings.paymentMethodPayPal")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="payment-none"
                              checked={Array.isArray(formData.allowedPaymentMethods) && formData.allowedPaymentMethods.includes("NONE")}
                              onCheckedChange={(checked) => {
                                const current = Array.isArray(formData.allowedPaymentMethods) ? formData.allowedPaymentMethods : [];
                                if (checked) {
                                  if (!current.includes("NONE")) {
                                    handleInputChange("allowedPaymentMethods", [...current, "NONE"]);
                                  }
                                } else {
                                  handleInputChange("allowedPaymentMethods", current.filter((m) => m !== "NONE"));
                                }
                              }}
                            />
                            <Label htmlFor="payment-none" className="font-normal cursor-pointer">
                              {t("admin.reservationSettings.preOrderSettings.paymentMethodNone")}
                            </Label>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("admin.reservationSettings.preOrderSettings.allowedPaymentMethodsDescription")}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium">{t("admin.reservationSettings.preOrderSettings.cancellationRefundPolicy")}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.fullRefundHoursBefore")}</Label>
                          <Input
                            type="text"
                            placeholder={t("admin.reservationSettings.preOrderSettings.fullRefundPlaceholder")}
                            value={formData.fullRefundHoursBefore || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Only allow numbers
                              if (value === "" || /^\d+$/.test(value)) {
                              handleInputChange(
                                "fullRefundHoursBefore",
                                  value === "" ? undefined : Number(value)
                                );
                            }
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.partialRefundHoursBefore")}</Label>
                          <Input
                            type="text"
                            placeholder={t("admin.reservationSettings.preOrderSettings.partialRefundPlaceholder")}
                            value={formData.partialRefundHoursBefore || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Only allow numbers
                              if (value === "" || /^\d+$/.test(value)) {
                              handleInputChange(
                                "partialRefundHoursBefore",
                                  value === "" ? undefined : Number(value)
                                );
                            }
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.noRefundHoursBefore")}</Label>
                          <Input
                            type="text"
                            placeholder={t("admin.reservationSettings.preOrderSettings.noRefundPlaceholder")}
                            value={formData.noRefundHoursBefore || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Only allow numbers
                              if (value === "" || /^\d+$/.test(value)) {
                              handleInputChange(
                                "noRefundHoursBefore",
                                  value === "" ? undefined : Number(value)
                                );
                            }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleCard>

            {/* Advanced Settings */}
            <CollapsibleCard
              title={t("admin.reservationSettings.advancedSettings.title")}
              description={t("admin.reservationSettings.advancedSettings.description")}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("admin.reservationSettings.advancedSettings.maxCapacityPerTimeSlot")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.maxCapacityPerTimeSlot || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "maxCapacityPerTimeSlot",
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                    placeholder={t("admin.reservationSettings.advancedSettings.maxCapacityPlaceholder")}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationSettings.advancedSettings.maxCapacityDescription")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{t("admin.reservationSettings.advancedSettings.bufferTimeMinutes")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.bufferTimeMinutes || 15}
                    onChange={(e) =>
                      handleInputChange(
                        "bufferTimeMinutes",
                        Number(e.target.value)
                      )
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationSettings.advancedSettings.bufferTimeDescription")}
                  </p>
                </div>
              </div>
            </CollapsibleCard>

            {/* Excluded Dates */}
            <CollapsibleCard
              icon={<Icon path={mdiCalendar} size={0.83} />}
              title={t("admin.reservationSettings.excludedDates.title")}
              description={t("admin.reservationSettings.excludedDates.description")}
            >
              <div className="space-y-6">
                {/* Single Dates */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <Label className="text-sm font-medium">{t("admin.reservationSettings.excludedDates.singleExcludedDates")}</Label>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <DatePicker
                        date={newSingleDate}
                        onDateChange={(date) => {
                          setNewSingleDate(date);
                          if (date) addSingleDate(date);
                        }}
                        minDate={new Date()}
                        className="w-full sm:w-auto"
                      />
                    </div>
                  </div>
                  
                  {excludedSingleDates.length > 0 && (
                    <div className="space-y-2">
                      {excludedSingleDates.map((dateStr) => {
                        const date = new Date(dateStr + 'T00:00:00');
                        return (
                          <div
                            key={dateStr}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border border-border"
                          >
                            <span className="text-sm text-foreground break-words flex-1 min-w-0">
                              {date.toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeSingleDate(dateStr)}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                            >
                              <Icon path={mdiClose} size={0.67} />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {excludedSingleDates.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      {t("admin.reservationSettings.excludedDates.noSingleDatesExcluded")}
                    </p>
                  )}
                </div>

                <div className="h-32" />

                <Separator />

                {/* Date Ranges */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <Label className="text-sm font-medium">{t("admin.reservationSettings.excludedDates.excludedDateRanges")}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDateRange}
                      className="h-9 px-3 bg-transparent w-full sm:w-auto"
                    >
                      <Icon path={mdiPlus} size={0.67} className="mr-1" />
                      {t("admin.reservationSettings.excludedDates.addRange")}
                    </Button>
                  </div>
                  
                  {excludedDateRanges.length > 0 && (
                    <div className="space-y-3">
                      {excludedDateRanges.map((range, index) => (
                        <div
                          key={index}
                          className="p-3 bg-muted/50 rounded-lg border border-border space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <Label className="text-xs mb-1.5 block">{t("admin.reservationSettings.excludedDates.startDate")}</Label>
                              <DatePicker
                                date={range.startDate}
                                onDateChange={(date) => updateDateRangeStart(index, date)}
                                minDate={new Date()}
                                className="w-full"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <Label className="text-xs mb-1.5 block">{t("admin.reservationSettings.excludedDates.endDate")}</Label>
                              <DatePicker
                                date={range.endDate}
                                onDateChange={(date) => updateDateRangeEnd(index, date)}
                                minDate={range.startDate || new Date()}
                                className="w-full"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeDateRange(index)}
                              className="h-9 w-9 p-0 sm:mt-6 text-destructive hover:text-destructive hover:bg-destructive/10 self-end sm:self-start flex-shrink-0"
                            >
                              <Icon path={mdiDelete} size={0.67} />
                            </Button>
                          </div>
                          {range.start && range.end && (
                            <p className="text-xs text-muted-foreground break-words">
                              {new Date(range.start + 'T00:00:00').toLocaleDateString()} - {new Date(range.end + 'T00:00:00').toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {excludedDateRanges.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      {t("admin.reservationSettings.excludedDates.noDateRangesExcluded")}
                    </p>
                  )}
                </div>
              </div>
            </CollapsibleCard>
          </>
        )}
      </div>
    </div>
  );
};

export default ReservationSettingsPage;

