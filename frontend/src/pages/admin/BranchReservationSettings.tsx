import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@clerk/clerk-react";
import { useParams, useNavigate } from "react-router-dom";
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
  reservationService,
  type ReservationSettingsFormData,
} from "@/services/reservationService";
import branchService from "@/services/branchService";
import { toast } from "sonner";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const BranchReservationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { id: branchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAny } = usePermissions();

  const canViewBranchReservationSettings = canAny([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS },
  ]);
  const canUpdateBranchReservationSettings = canAny([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.UPDATE_BRANCH_RESERVATION_SETTINGS },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [globalSettings, setGlobalSettings] = useState<Partial<ReservationSettingsFormData>>({});
  const [formData, setFormData] = useState<Partial<ReservationSettingsFormData>>({
    tier: "SIMPLE",
  });
  const [branchOverrides, setBranchOverrides] = useState<Set<string>>(new Set());
  const [orgReservationsAllowed, setOrgReservationsAllowed] = useState<boolean>(true);
  
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

  useEffect(() => {
    if (branchId && canViewBranchReservationSettings) {
      loadSettings();
    }
  }, [branchId, canViewBranchReservationSettings]);

  const loadSettings = async () => {
    if (!branchId) return;
    
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      
      // Load branch info
      const branch = await branchService.getBranch(branchId, token);
      setBranchName(branch.name || "Unknown Branch");

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
      
      // Load global settings as defaults
      const global = await reservationService.getSettings(token);
      setGlobalSettings(global);
      
      // Load merged settings (global + branch overrides)
      const merged = await reservationService.getSettings(token, branchId);
      
      // Determine which fields are overridden by checking branch data
      const branchData = await branchService.getBranch(branchId, token);
      const overrides = new Set<string>();
      
      if ((branchData as any).reservationIsEnabled !== null && (branchData as any).reservationIsEnabled !== undefined) {
        overrides.add("isEnabled");
      }
      if ((branchData as any).reservationTier) {
        overrides.add("tier");
      }
      if ((branchData as any).reservationTimeSlotInterval !== null && (branchData as any).reservationTimeSlotInterval !== undefined) {
        overrides.add("timeSlotInterval");
      }
      if ((branchData as any).reservationMaxGuestsPerReservation !== null && (branchData as any).reservationMaxGuestsPerReservation !== undefined) {
        overrides.add("maxGuestsPerReservation");
      }
      if ((branchData as any).reservationMinAdvanceBookingHours !== null && (branchData as any).reservationMinAdvanceBookingHours !== undefined) {
        overrides.add("minAdvanceBookingHours");
      }
      if ((branchData as any).reservationMaxAdvanceBookingDays !== null && (branchData as any).reservationMaxAdvanceBookingDays !== undefined) {
        overrides.add("maxAdvanceBookingDays");
      }
      if ((branchData as any).reservationModificationWindowHours !== null && (branchData as any).reservationModificationWindowHours !== undefined) {
        overrides.add("modificationWindowHours");
      }
      if ((branchData as any).reservationAllowSameDayBooking !== null && (branchData as any).reservationAllowSameDayBooking !== undefined) {
        overrides.add("allowSameDayBooking");
      }
      if ((branchData as any).reservationAllowCancellation !== null && (branchData as any).reservationAllowCancellation !== undefined) {
        overrides.add("allowCancellation");
      }
      if ((branchData as any).reservationEnablePreOrder !== null && (branchData as any).reservationEnablePreOrder !== undefined) {
        overrides.add("enablePreOrder");
      }
      if ((branchData as any).reservationPreOrderMinAmount !== null && (branchData as any).reservationPreOrderMinAmount !== undefined) {
        overrides.add("preOrderMinAmount");
      }
      if ((branchData as any).reservationFullRefundHoursBefore !== null && (branchData as any).reservationFullRefundHoursBefore !== undefined) {
        overrides.add("fullRefundHoursBefore");
      }
      if ((branchData as any).reservationPartialRefundHoursBefore !== null && (branchData as any).reservationPartialRefundHoursBefore !== undefined) {
        overrides.add("partialRefundHoursBefore");
      }
      if ((branchData as any).reservationNoRefundHoursBefore !== null && (branchData as any).reservationNoRefundHoursBefore !== undefined) {
        overrides.add("noRefundHoursBefore");
      }
      if ((branchData as any).reservationMaxCapacityPerTimeSlot !== null && (branchData as any).reservationMaxCapacityPerTimeSlot !== undefined) {
        overrides.add("maxCapacityPerTimeSlot");
      }
      if ((branchData as any).reservationBufferTimeMinutes !== null && (branchData as any).reservationBufferTimeMinutes !== undefined) {
        overrides.add("bufferTimeMinutes");
      }
      if ((branchData as any).reservationDepositPercentage !== null && (branchData as any).reservationDepositPercentage !== undefined) {
        overrides.add("depositPercentage");
      }
      if ((branchData as any).reservationAllowedPaymentMethods !== null && (branchData as any).reservationAllowedPaymentMethods !== undefined) {
        overrides.add("allowedPaymentMethods");
      }
      
      // Check day fields
      // Note: null/undefined = inherit from global, empty string "" = explicitly cleared (no hours)
      daysOfWeek.forEach((day) => {
        const dayKey = day.key.charAt(0).toUpperCase() + day.key.slice(1);
        const openValue = (branchData as any)[`reservation${dayKey}Open`];
        const closeValue = (branchData as any)[`reservation${dayKey}Close`];
        // Add to overrides if it's explicitly set (not null/undefined)
        // Empty string "" means explicitly cleared, so it should be in overrides
        if (openValue !== null && openValue !== undefined) {
          overrides.add(`${day.key}Open`);
        }
        if (closeValue !== null && closeValue !== undefined) {
          overrides.add(`${day.key}Close`);
        }
      });
      
      setBranchOverrides(overrides);
      
      // Ensure tier defaults to "SIMPLE" if not set
      const tierValue = merged.tier && (merged.tier === "SIMPLE" || merged.tier === "MEDIUM" || merged.tier === "COMPLEX") 
        ? merged.tier 
        : "SIMPLE";
      
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
      if (merged.excludedDates) {
        const excluded = typeof merged.excludedDates === 'string' 
          ? JSON.parse(merged.excludedDates) 
          : merged.excludedDates;
        setExcludedSingleDates(excluded.singleDates || []);
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
      toast.error(t("admin.branchManagement.reservationSettings.loadError"));
    } finally {
      setLoading(false);
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
    
    // Track if this field is now overridden
    // If value is explicitly set (even if empty/null), it's an override
    // If value is undefined, it means inherit from global
    const globalValue = globalSettings[field];
    const isExplicitlySet = value !== undefined;
    // Branch Reservation Settings page does not provide an explicit "inherit" UI.
    // If a user changes the master toggle, we should persist it as a branch override
    // even if it matches the current global/org setting (common in production).
    const isOverridden =
      field === "isEnabled"
        ? isExplicitlySet
        : isExplicitlySet && (value !== globalValue || value === null || value === "");
    
    setBranchOverrides((prev) => {
      const next = new Set(prev);
      if (isOverridden) {
        next.add(field as string);
      } else if (value === undefined) {
        // If value is undefined, remove from overrides (inherit from global)
        next.delete(field as string);
      }
      return next;
    });
  };

  const handleDayChange = (day: string, field: "Open" | "Close", value: string) => {
    const fieldKey = `${day.toLowerCase()}${field}` as keyof ReservationSettingsFormData;
    // If value is empty string, set to empty string "" to explicitly clear (no hours for this day)
    // Empty string "" means "explicitly cleared" (override with no hours)
    // null/undefined means "inherit from global"
    const finalValue = value === "" ? "" : (value || undefined);
    handleInputChange(fieldKey, finalValue);
  };

  const handleSave = async () => {
    if (!branchId) return;
    if (!canUpdateBranchReservationSettings) return;
    if (!orgReservationsAllowed) return;
    
    try {
      setSaving(true);
      const token = (await getToken()) || undefined;
      
      // Build branch update payload with only reservation settings
      const branchUpdate: any = {};
      
      // Only include fields that are overridden (different from global)
      if (branchOverrides.has("isEnabled")) {
        branchUpdate.reservationIsEnabled = formData.isEnabled;
      } else {
        branchUpdate.reservationIsEnabled = null; // Clear override to inherit
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
      
      // Day fields
      daysOfWeek.forEach((day) => {
        const dayKey = day.key.charAt(0).toUpperCase() + day.key.slice(1);
        const openKey = `${day.key}Open`;
        const closeKey = `${day.key}Close`;
        
        if (branchOverrides.has(openKey)) {
          // If overridden, use the form value
          // Empty string "" means explicitly cleared (no hours)
          // A time string means specific hours
          const openValue = formData[openKey as keyof ReservationSettingsFormData];
          branchUpdate[`reservation${dayKey}Open`] = openValue === undefined ? null : (openValue === "" ? "" : openValue);
        } else {
          // Not overridden, clear to inherit from global
          branchUpdate[`reservation${dayKey}Open`] = null;
        }
        
        if (branchOverrides.has(closeKey)) {
          // If overridden, use the form value
          // Empty string "" means explicitly cleared (no hours)
          // A time string means specific hours
          const closeValue = formData[closeKey as keyof ReservationSettingsFormData];
          branchUpdate[`reservation${dayKey}Close`] = closeValue === undefined ? null : (closeValue === "" ? "" : closeValue);
        } else {
          // Not overridden, clear to inherit from global
          branchUpdate[`reservation${dayKey}Close`] = null;
        }
      });
      
      // Excluded dates - branch can override
      if (branchOverrides.has("excludedDates") || excludedSingleDates.length > 0 || excludedDateRanges.length > 0) {
        const excludedDates = {
          singleDates: excludedSingleDates,
          dateRanges: excludedDateRanges
            .filter(range => range.start && range.end)
            .map(range => ({
              start: range.start,
              end: range.end,
            })),
        };
        branchUpdate.reservationExcludedDates = excludedDates;
      } else {
        branchUpdate.reservationExcludedDates = null;
      }
      
      await branchService.updateBranch(branchId, branchUpdate, token);
      toast.success(t("admin.branchManagement.reservationSettings.saveSuccess"));
      await loadSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.response?.data?.error || t("admin.branchManagement.reservationSettings.saveError"));
    } finally {
      setSaving(false);
    }
  };
  
  // Helper functions for excluded dates
  const addSingleDate = (date: Date | undefined) => {
    if (!date) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    if (!excludedSingleDates.includes(dateStr)) {
      setExcludedSingleDates([...excludedSingleDates, dateStr].sort());
      setNewSingleDate(undefined);
      setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
    } else {
      toast.error(t("admin.reservationSettings.excludedDates.dateAlreadyExcluded"));
    }
  };
  
  const removeSingleDate = (dateStr: string) => {
    setExcludedSingleDates(excludedSingleDates.filter(d => d !== dateStr));
    if (excludedSingleDates.length === 1 && excludedDateRanges.length === 0) {
      setBranchOverrides((prev) => {
        const next = new Set(prev);
        next.delete("excludedDates");
        return next;
      });
    }
  };
  
  const addDateRange = () => {
    setExcludedDateRanges([...excludedDateRanges, { start: '', end: '', startDate: undefined, endDate: undefined }]);
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };
  
  const updateDateRangeStart = (index: number, date: Date | undefined) => {
    if (!date) return;
    const updated = [...excludedDateRanges];
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
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };
  
  const updateDateRangeEnd = (index: number, date: Date | undefined) => {
    if (!date) return;
    const updated = [...excludedDateRanges];
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
    setBranchOverrides((prev) => new Set(prev).add("excludedDates"));
  };
  
  const removeDateRange = (index: number) => {
    setExcludedDateRanges(excludedDateRanges.filter((_, i) => i !== index));
    if (excludedDateRanges.length === 1 && excludedSingleDates.length === 0) {
      setBranchOverrides((prev) => {
        const next = new Set(prev);
        next.delete("excludedDates");
        return next;
      });
    }
  };

  const isOverridden = (field: string) => branchOverrides.has(field);

  if (!canViewBranchReservationSettings) {
    return (
      <div className="space-y-4 pb-4">
        <div className="text-center py-12 text-muted-foreground">Access denied</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.0} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.reservationSettings.loading")}</h3>
            <p className="text-sm text-muted-foreground">{t("admin.reservationSettings.loadingDescription")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.branchManagement.reservationSettings.title", { branchName })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.branchManagement.reservationSettings.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin/branches")}
            className="border-border text-foreground hover:bg-muted"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className={
              !canUpdateBranchReservationSettings
                ? "bg-pink-500 text-white pointer-events-none opacity-50"
                : "bg-pink-500 hover:bg-pink-600 text-white"
            }
          >
            {saving ? (
              <>
                <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                {t("admin.branchManagement.reservationSettings.saving")}
              </>
            ) : (
              <>
                <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                {t("common.save", "Save")}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Master Toggle */}
        <CollapsibleCard
          icon={<Icon path={mdiCog} size={0.83} />}
          title={
            <>
              {t("admin.reservationSettings.systemSettings.title")}
              {isOverridden("isEnabled") && (
                <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-1 rounded ml-2">{t("admin.branchManagement.reservationSettings.overridden")}</span>
              )}
            </>
          }
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
                  const isDayOverridden = isOverridden(`${day.key}Open`) || isOverridden(`${day.key}Close`);
                  
                  return (
                  <div key={day.key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-start sm:items-center">
                    <div className="flex items-center gap-2">
                      <Label className="font-medium text-sm sm:text-base">{day.label}</Label>
                      {isDayOverridden && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
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
                              // Explicitly clear both fields by setting to empty string ""
                              // Empty string means "explicitly cleared" (no hours for this day)
                              // This keeps them in overrides so they're saved as "" in the database
                              handleInputChange(`${day.key}Open` as keyof ReservationSettingsFormData, "");
                              handleInputChange(`${day.key}Close` as keyof ReservationSettingsFormData, "");
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
                    <div className="flex items-center gap-2">
                      <Label>{t("admin.reservationSettings.bookingRules.timeSlotInterval")}</Label>
                      {isOverridden("timeSlotInterval") && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Label>{t("admin.reservationSettings.bookingRules.maxGuestsPerReservation")}</Label>
                      {isOverridden("maxGuestsPerReservation") && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.maxGuestsPlaceholder")}
                      value={formData.maxGuestsPerReservation || ""}
                      onChange={(e) => {
                        const value = e.target.value;
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
                    <div className="flex items-center gap-2">
                      <Label>{t("admin.reservationSettings.bookingRules.minAdvanceBooking")}</Label>
                      {isOverridden("minAdvanceBookingHours") && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.minAdvanceBookingPlaceholder")}
                      value={formData.minAdvanceBookingHours || ""}
                      onChange={(e) => {
                        const value = e.target.value;
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
                    <div className="flex items-center gap-2">
                      <Label>{t("admin.reservationSettings.bookingRules.maxAdvanceBooking")}</Label>
                      {isOverridden("maxAdvanceBookingDays") && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.maxAdvanceBookingPlaceholder")}
                      value={formData.maxAdvanceBookingDays || ""}
                      onChange={(e) => {
                        const value = e.target.value;
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
                    <div className="flex items-center gap-2">
                      <Label>{t("admin.reservationSettings.bookingRules.modificationWindow")}</Label>
                      {isOverridden("modificationWindowHours") && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
                    <Input
                      type="text"
                      placeholder={t("admin.reservationSettings.bookingRules.modificationWindowPlaceholder")}
                      value={formData.modificationWindowHours || ""}
                      onChange={(e) => {
                        const value = e.target.value;
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
                      <div className="flex items-center gap-2">
                        <Label>{t("admin.reservationSettings.bookingRules.allowSameDayBooking")}</Label>
                        {isOverridden("allowSameDayBooking") && (
                          <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                        )}
                      </div>
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
                      <div className="flex items-center gap-2">
                        <Label>{t("admin.reservationSettings.bookingRules.allowCancellation")}</Label>
                        {isOverridden("allowCancellation") && (
                          <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                        )}
                      </div>
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
                    <div className="flex items-center gap-2">
                      <Label>{t("admin.reservationSettings.preOrderSettings.enablePreOrder")}</Label>
                      {isOverridden("enablePreOrder") && (
                        <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                      )}
                    </div>
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
                      <div className="flex items-center gap-2">
                        <Label>{t("admin.reservationSettings.preOrderSettings.minimumOrderAmount")}</Label>
                        {isOverridden("preOrderMinAmount") && (
                          <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                        )}
                      </div>
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
                        <div className="flex items-center gap-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.depositPercentage")}</Label>
                          {isOverridden("depositPercentage") && (
                            <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                          )}
                        </div>
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
                        {!isOverridden("depositPercentage") && globalSettings.depositPercentage !== undefined && (
                          <p className="text-xs text-muted-foreground italic">
                            {t("admin.branchManagement.reservationSettings.inheritedFromGlobal")}: {globalSettings.depositPercentage}%
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label>{t("admin.reservationSettings.preOrderSettings.allowedPaymentMethods")}</Label>
                          {isOverridden("allowedPaymentMethods") && (
                            <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="branch-payment-online-card"
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
                            <Label htmlFor="branch-payment-online-card" className="font-normal cursor-pointer">
                              {t("admin.reservationSettings.preOrderSettings.paymentMethodOnlineCard")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="branch-payment-paypal"
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
                            <Label htmlFor="branch-payment-paypal" className="font-normal cursor-pointer">
                              {t("admin.reservationSettings.preOrderSettings.paymentMethodPayPal")}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="branch-payment-none"
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
                            <Label htmlFor="branch-payment-none" className="font-normal cursor-pointer">
                              {t("admin.reservationSettings.preOrderSettings.paymentMethodNone")}
                            </Label>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("admin.reservationSettings.preOrderSettings.allowedPaymentMethodsDescription")}
                        </p>
                        {!isOverridden("allowedPaymentMethods") && Array.isArray(globalSettings.allowedPaymentMethods) && globalSettings.allowedPaymentMethods.length > 0 && (
                          <p className="text-xs text-muted-foreground italic">
                            {t("admin.branchManagement.reservationSettings.inheritedFromGlobal")}: {globalSettings.allowedPaymentMethods.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium">{t("admin.reservationSettings.preOrderSettings.cancellationRefundPolicy")}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label>{t("admin.reservationSettings.preOrderSettings.fullRefundHoursBefore")}</Label>
                            {isOverridden("fullRefundHoursBefore") && (
                              <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                            )}
                          </div>
                          <Input
                            type="text"
                            placeholder={t("admin.reservationSettings.preOrderSettings.fullRefundPlaceholder")}
                            value={formData.fullRefundHoursBefore || ""}
                            onChange={(e) => {
                              const value = e.target.value;
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
                          <div className="flex items-center gap-2">
                            <Label>{t("admin.reservationSettings.preOrderSettings.partialRefundHoursBefore")}</Label>
                            {isOverridden("partialRefundHoursBefore") && (
                              <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                            )}
                          </div>
                          <Input
                            type="text"
                            placeholder={t("admin.reservationSettings.preOrderSettings.partialRefundPlaceholder")}
                            value={formData.partialRefundHoursBefore || ""}
                            onChange={(e) => {
                              const value = e.target.value;
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
                          <div className="flex items-center gap-2">
                            <Label>{t("admin.reservationSettings.preOrderSettings.noRefundHoursBefore")}</Label>
                            {isOverridden("noRefundHoursBefore") && (
                              <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                            )}
                          </div>
                          <Input
                            type="text"
                            placeholder={t("admin.reservationSettings.preOrderSettings.noRefundPlaceholder")}
                            value={formData.noRefundHoursBefore || ""}
                            onChange={(e) => {
                              const value = e.target.value;
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
                  <div className="flex items-center gap-2">
                    <Label>{t("admin.reservationSettings.advancedSettings.maxCapacityPerTimeSlot")}</Label>
                    {isOverridden("maxCapacityPerTimeSlot") && (
                      <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                    )}
                  </div>
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
                  <div className="flex items-center gap-2">
                    <Label>{t("admin.reservationSettings.advancedSettings.bufferTimeMinutes")}</Label>
                    {isOverridden("bufferTimeMinutes") && (
                      <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-0.5 rounded">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                    )}
                  </div>
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
              title={
                <>
                  {t("admin.reservationSettings.excludedDates.title")}
                  {isOverridden("excludedDates") && (
                    <span className="text-xs bg-pink-500/20 text-pink-500 px-2 py-1 rounded ml-2">{t("admin.branchManagement.reservationSettings.overridden")}</span>
                  )}
                </>
              }
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

                <div className="h-32"/>

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

export default BranchReservationSettings;

