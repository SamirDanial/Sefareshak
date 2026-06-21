import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Switch from "@/components/Switch";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import branchService, { type Branch } from "@/services/branchService";
import { toast } from "@/components/Toast";
import { SettingsService } from "@/services/settingsService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const buildTimeOptions = (stepMinutes: number): string[] => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const hour12 = ((h + 11) % 12) + 1;
      const ampm = h < 12 ? "AM" : "PM";
      const mm = String(m).padStart(2, "0");
      opts.push(`${hour12}:${mm} ${ampm}`);
    }
  }
  return opts;
};

const normalizeTimeValue = (value: any): string => {
  const raw = (value ?? "").toString().trim();
  if (!raw) return "";
  if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(raw)) {
    const parts = raw.replace(/\s+/g, " ").toUpperCase();
    const [time, ampm] = parts.split(" ");
    const [hhRaw, mm] = time.split(":");
    const hh = String(Number(hhRaw));
    return `${hh}:${mm} ${ampm}`;
  }
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [hhStr, mm] = raw.split(":");
    const hh24 = Number(hhStr);
    const hour12 = ((hh24 + 11) % 12) + 1;
    const ampm = hh24 < 12 ? "AM" : "PM";
    return `${hour12}:${mm} ${ampm}`;
  }
  return raw;
};

type BranchFormState = {
  name: string;
  code: string;
  isActive: boolean;
  serviceType: "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK" | "";
  branchImage: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: string;
  longitude: string;

  deliveryRadius: string | null;
  deliveryFee: string | null;
  deliveryRatePerKilometer: string;
  useDynamicDeliveryFee: boolean;
  useTieredDeliveryFee: boolean;
  initialDeliveryRange: string;
  initialDeliveryPrice: string;
  extendedDeliveryThreshold: string;
  extendedDeliveryRate: string;
  deliveryTimeEstimate: string;
  enableFreeDelivery: boolean;
  freeDeliveryThreshold: string;

  taxPercentage: string;
  serviceTaxPercentage: string;
  deliveryTaxPercentage: string;
  taxInclusive: boolean;
  currency: string;
  enableMinimumOrder: boolean;
  minimumOrderAmount: string;

  orderPreparationTime: string;
  maxOrderQuantity: string;
  allowExcludeOptionalIngredients: boolean;
  orderMergeTimeframeMinutes: string;

  pickupEnabled: boolean | null;
  deliveryEnabled: boolean | null;

  futureOrdersEnabled: boolean | null;
  enableFuturePickupOrders: boolean | null;
  futurePickupOrderDays: number | null;
  enableFutureDeliveryOrders: boolean | null;
  futureDeliveryOrderDays: number | null;

  allowScheduledOrderMerge: boolean | null;
  scheduledOrderMergeCutoffHours: number | null;

  scheduledOrderAllowCancellation: boolean | null;
  scheduledOrderCancellationWindowHours: number | null;
  scheduledOrderFullRefundHoursBefore: number | null;
  scheduledOrderPartialRefundHoursBefore: number | null;
  scheduledOrderNoRefundHoursBefore: number | null;
  scheduledOrderPartialRefundPercentage: number | null;
  scheduledOrderReducedRefundPercentage: number | null;

  scheduledOrderAllowModification: boolean | null;
  scheduledOrderModificationWindowHours: number | null;
  scheduledOrderAllowShallowModification: boolean | null;

  scheduledOrderAutoConfirm: boolean | null;
  scheduledOrderMinimumAmount: number | null;

  scheduledOrderTimeSlotInterval: number | null;
  scheduledOrderMaxOrdersPerSlot: number | null | undefined;
  acceptCash: boolean;
  acceptCard: boolean;
  acceptOnlinePayment: boolean;
  acceptPayPal: boolean;

  pickupAcceptCash: boolean;
  pickupAcceptCard: boolean;
  pickupAcceptOnlinePayment: boolean;
  pickupAcceptPayPal: boolean;
  pickupTakeawayServiceFee: string;

  allowOrdersOutsideHours: boolean;
  mondayIsOff: boolean;
  mondayOpen: string;
  mondayClose: string;
  mondayPeriods: Array<{ open: string; close: string }>;
  tuesdayIsOff: boolean;
  tuesdayOpen: string;
  tuesdayClose: string;
  tuesdayPeriods: Array<{ open: string; close: string }>;
  wednesdayIsOff: boolean;
  wednesdayOpen: string;
  wednesdayClose: string;
  wednesdayPeriods: Array<{ open: string; close: string }>;
  thursdayIsOff: boolean;
  thursdayOpen: string;
  thursdayClose: string;
  thursdayPeriods: Array<{ open: string; close: string }>;
  fridayIsOff: boolean;
  fridayOpen: string;
  fridayClose: string;
  fridayPeriods: Array<{ open: string; close: string }>;
  saturdayIsOff: boolean;
  saturdayOpen: string;
  saturdayClose: string;
  saturdayPeriods: Array<{ open: string; close: string }>;
  sundayIsOff: boolean;
  sundayOpen: string;
  sundayClose: string;
  sundayPeriods: Array<{ open: string; close: string }>;

  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  websiteUrl: string;
  appStatus: string;
};

const defaultState: BranchFormState = {
  name: "",
  code: "",
  isActive: true,
  serviceType: "",
  branchImage: "",
  businessEmail: "",
  businessPhone: "",
  businessAddress: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  latitude: "",
  longitude: "",

  deliveryRadius: null,
  deliveryFee: null,
  deliveryRatePerKilometer: "",
  useDynamicDeliveryFee: false,
  useTieredDeliveryFee: false,
  initialDeliveryRange: "",
  initialDeliveryPrice: "",
  extendedDeliveryThreshold: "",
  extendedDeliveryRate: "",
  deliveryTimeEstimate: "",
  enableFreeDelivery: false,
  freeDeliveryThreshold: "",

  taxPercentage: "",
  serviceTaxPercentage: "",
  deliveryTaxPercentage: "",
  taxInclusive: false,
  currency: "",
  enableMinimumOrder: false,
  minimumOrderAmount: "",

  orderPreparationTime: "",
  maxOrderQuantity: "",
  allowExcludeOptionalIngredients: true,
  orderMergeTimeframeMinutes: "",

  pickupEnabled: null,
  deliveryEnabled: null,

  futureOrdersEnabled: null,
  enableFuturePickupOrders: null,
  futurePickupOrderDays: null,
  enableFutureDeliveryOrders: null,
  futureDeliveryOrderDays: null,

  allowScheduledOrderMerge: null,
  scheduledOrderMergeCutoffHours: null,

  scheduledOrderAllowCancellation: null,
  scheduledOrderCancellationWindowHours: null,
  scheduledOrderFullRefundHoursBefore: null,
  scheduledOrderPartialRefundHoursBefore: null,
  scheduledOrderNoRefundHoursBefore: null,
  scheduledOrderPartialRefundPercentage: null,
  scheduledOrderReducedRefundPercentage: null,

  scheduledOrderAllowModification: null,
  scheduledOrderModificationWindowHours: null,
  scheduledOrderAllowShallowModification: null,

  scheduledOrderAutoConfirm: null,
  scheduledOrderMinimumAmount: null,

  scheduledOrderTimeSlotInterval: null,
  scheduledOrderMaxOrdersPerSlot: null,
  acceptCash: true,
  acceptCard: true,
  acceptOnlinePayment: true,
  acceptPayPal: false,

  pickupAcceptCash: true,
  pickupAcceptCard: true,
  pickupAcceptOnlinePayment: true,
  pickupAcceptPayPal: false,
  pickupTakeawayServiceFee: "",

  allowOrdersOutsideHours: false,
  mondayIsOff: false,
  mondayOpen: "",
  mondayClose: "",
  mondayPeriods: [{ open: "", close: "" }],
  tuesdayIsOff: false,
  tuesdayOpen: "",
  tuesdayClose: "",
  tuesdayPeriods: [{ open: "", close: "" }],
  wednesdayIsOff: false,
  wednesdayOpen: "",
  wednesdayClose: "",
  wednesdayPeriods: [{ open: "", close: "" }],
  thursdayIsOff: false,
  thursdayOpen: "",
  thursdayClose: "",
  thursdayPeriods: [{ open: "", close: "" }],
  fridayIsOff: false,
  fridayOpen: "",
  fridayClose: "",
  fridayPeriods: [{ open: "", close: "" }],
  saturdayIsOff: false,
  saturdayOpen: "",
  saturdayClose: "",
  saturdayPeriods: [{ open: "", close: "" }],
  sundayIsOff: false,
  sundayOpen: "",
  sundayClose: "",
  sundayPeriods: [{ open: "", close: "" }],

  facebookUrl: "",
  instagramUrl: "",
  twitterUrl: "",
  websiteUrl: "",
  appStatus: "LIVE",
};

const BranchForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const { getToken } = useAuth();
  const { rbacUser } = usePermissions();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [globalServiceType, setGlobalServiceType] = useState<
    "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK"
  >("RESTAURANT");
  const [gettingLocation, setGettingLocation] = useState(false);
  const [globalOrderMergeTimeframeMinutes, setGlobalOrderMergeTimeframeMinutes] = useState<number>(10);
  const [globalScheduledOrderTimeSlotInterval, setGlobalScheduledOrderTimeSlotInterval] = useState<number>(30);
  const [globalScheduledOrderMaxOrdersPerSlot, setGlobalScheduledOrderMaxOrdersPerSlot] = useState<number | null>(null);
  const [globalAllowScheduledOrderMerge, setGlobalAllowScheduledOrderMerge] = useState<boolean>(false);
  const [globalScheduledOrderMergeCutoffHours, setGlobalScheduledOrderMergeCutoffHours] = useState<number>(2);
  const [globalFutureOrdersEnabled, setGlobalFutureOrdersEnabled] = useState<boolean>(false);
  const [globalEnableFuturePickupOrders, setGlobalEnableFuturePickupOrders] = useState<boolean>(false);
  const [globalEnableFutureDeliveryOrders, setGlobalEnableFutureDeliveryOrders] = useState<boolean>(false);
  const [globalFuturePickupOrderDays, setGlobalFuturePickupOrderDays] = useState<number>(0);
  const [globalFutureDeliveryOrderDays, setGlobalFutureDeliveryOrderDays] = useState<number>(0);
  const [globalPickupEnabled, setGlobalPickupEnabled] = useState<boolean>(true);
  const [globalDeliveryEnabled, setGlobalDeliveryEnabled] = useState<boolean>(true);
  const [globalDeliveryRadius, setGlobalDeliveryRadius] = useState<number>(0);
  const [globalDeliveryFee, setGlobalDeliveryFee] = useState<number>(0);
  const [state, setState] = useState<BranchFormState>(defaultState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeOptions = useMemo(() => buildTimeOptions(15), []);

  const orgOnlinePaymentsAllowed =
    (rbacUser as any)?.organizationEntitlements?.onlinePaymentsAllowed !== false;
  const orgCardPaymentsAllowed =
    (rbacUser as any)?.organizationEntitlements?.cardPaymentsAllowed !== false;
  const orgPaypalAllowed =
    (rbacUser as any)?.organizationEntitlements?.paypalAllowed !== false;

  // Enforce org-level payment entitlements.
  // If an entitlement is disabled, force-disable the corresponding branch-level toggles.
  useEffect(() => {
    setState((p) => {
      const next = { ...p };

      if (!orgOnlinePaymentsAllowed) {
        next.acceptOnlinePayment = false;
        next.acceptCard = false;
        next.acceptPayPal = false;
        next.pickupAcceptOnlinePayment = false;
        next.pickupAcceptCard = false;
        next.pickupAcceptPayPal = false;
      } else {
        if (!orgCardPaymentsAllowed) {
          next.acceptCard = false;
          next.pickupAcceptCard = false;
        }
        if (!orgPaypalAllowed) {
          next.acceptPayPal = false;
          next.pickupAcceptPayPal = false;
        }
      }

      return next;
    });
  }, [orgOnlinePaymentsAllowed, orgCardPaymentsAllowed, orgPaypalAllowed]);

  useEffect(() => {
    const loadGlobals = async () => {
      try {
        const token = await getToken();
        const resp = await SettingsService.getSettings(token || undefined);
        const data = (resp as any)?.data?.data || (resp as any)?.data || null;
        if (!data) return;
        if (typeof data.orderMergeTimeframeMinutes === "number") {
          setGlobalOrderMergeTimeframeMinutes(data.orderMergeTimeframeMinutes);
        }
        if (typeof data.scheduledOrderTimeSlotInterval === "number") {
          setGlobalScheduledOrderTimeSlotInterval(data.scheduledOrderTimeSlotInterval);
        }
        if (data.scheduledOrderMaxOrdersPerSlot === null || typeof data.scheduledOrderMaxOrdersPerSlot === "number") {
          setGlobalScheduledOrderMaxOrdersPerSlot(data.scheduledOrderMaxOrdersPerSlot);
        }
        if (typeof data.allowScheduledOrderMerge === "boolean") {
          setGlobalAllowScheduledOrderMerge(data.allowScheduledOrderMerge);
        }
        if (typeof data.scheduledOrderMergeCutoffHours === "number") {
          setGlobalScheduledOrderMergeCutoffHours(data.scheduledOrderMergeCutoffHours);
        }
        if (typeof data.futureOrdersEnabled === "boolean") {
          setGlobalFutureOrdersEnabled(data.futureOrdersEnabled);
        }
        if (typeof data.enableFuturePickupOrders === "boolean") {
          setGlobalEnableFuturePickupOrders(data.enableFuturePickupOrders);
        }
        if (typeof data.enableFutureDeliveryOrders === "boolean") {
          setGlobalEnableFutureDeliveryOrders(data.enableFutureDeliveryOrders);
        }
        if (typeof data.futurePickupOrderDays === "number") {
          setGlobalFuturePickupOrderDays(data.futurePickupOrderDays);
        }
        if (typeof data.futureDeliveryOrderDays === "number") {
          setGlobalFutureDeliveryOrderDays(data.futureDeliveryOrderDays);
        }
        if (typeof data.pickupEnabled === "boolean") {
          setGlobalPickupEnabled(data.pickupEnabled);
        }
        if (typeof data.deliveryEnabled === "boolean") {
          setGlobalDeliveryEnabled(data.deliveryEnabled);
        }
        if (typeof data.deliveryRadius === "number") {
          setGlobalDeliveryRadius(data.deliveryRadius);
        }
        if (typeof data.deliveryFee === "number") {
          setGlobalDeliveryFee(data.deliveryFee);
        }
      } catch {
        // ignore
      }
    };

    loadGlobals();
  }, [getToken]);

  const branchImagePreviewSrc = useMemo(() => {
    const raw = (state.branchImage || "").trim();
    if (!raw) return "";
    if (raw.startsWith("blob:")) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/uploads/images/")) return `${API_BASE_URL}${raw}`;
    if (raw.startsWith("uploads/images/")) return `${API_BASE_URL}/${raw}`;
    if (raw.startsWith("/")) return `${API_BASE_URL}${raw}`;
    return `${API_BASE_URL}/uploads/images/${raw}`;
  }, [state.branchImage]);

  const loadParentServiceType = async (organizationId: string) => {
    if (!organizationId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const orgSettings = await branchService.getOrganizationSettings(organizationId, token);
      const st = ((orgSettings as any)?.serviceType || "RESTAURANT") as any;
      setGlobalServiceType(st);
    } catch {
      // ignore
    }
  };

  const getCurrentLocation = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error(t("admin.branchManagement.form.gpsNotAvailable", { defaultValue: "GPS not available" }));
      return;
    }

    try {
      setGettingLocation(true);
      const readCoords = (opts: PositionOptions) =>
        new Promise<GeolocationCoordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            opts
          );
        });

      let coords: GeolocationCoordinates;
      try {
        coords = await readCoords({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
      } catch (err: any) {
        if (typeof err?.code === "number" && err.code === 3) {
          coords = await readCoords({ enableHighAccuracy: false, timeout: 30000, maximumAge: 0 });
        } else {
          throw err;
        }
      }

      setState((p) => ({
        ...p,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      }));
    } catch (e: any) {
      const msg =
        typeof e?.code === "number" && e.code === 1
          ? t("admin.branchManagement.form.gpsPermissionDenied", { defaultValue: "Location permission denied" })
          : typeof e?.code === "number" && e.code === 2
          ? t("admin.branchManagement.form.gpsUnavailable", { defaultValue: "Location unavailable" })
          : typeof e?.code === "number" && e.code === 3
          ? t("admin.branchManagement.form.gpsTimeout", { defaultValue: "Timeout expired" })
          : e?.message || t("admin.branchManagement.form.gpsFailed", { defaultValue: "Failed to get location" });

      toast.error(msg);
    } finally {
      setGettingLocation(false);
    }
  };

  const title = useMemo(() => {
    if (isEditMode) return t("admin.branchManagement.form.editTitle", { defaultValue: "Edit Branch" });
    return t("admin.branchManagement.form.createTitle", { defaultValue: "Create Branch" });
  }, [isEditMode, t]);

  const description = useMemo(() => {
    if (isEditMode)
      return t("admin.branchManagement.form.editDescription", {
        defaultValue: "Update branch details.",
      });
    return t("admin.branchManagement.form.createDescription", {
      defaultValue: "Create a new branch for the current organization.",
    });
  }, [isEditMode, t]);

  useEffect(() => {
    const load = async () => {
      if (!isEditMode || !id) return;
      try {
        setLoading(true);
        const token = await getToken();
        const branch = await branchService.getBranch(id, token || undefined);

        const orgId = ((branch as any)?.organizationId || "") as string;
        if (orgId) {
          await loadParentServiceType(orgId);
        }

        setState({
          name: (branch?.name || "") as string,
          code: (branch?.code || "") as string,
          isActive: branch?.isActive !== false,
          serviceType: ((branch as any)?.serviceType || "") as any,
          branchImage: (branch?.branchImage || "") as string,
          businessEmail: ((branch as any)?.businessEmail || "") as string,
          businessPhone: ((branch as any)?.businessPhone || "") as string,
          businessAddress: ((branch as any)?.businessAddress || "") as string,
          address: (branch?.address || "") as string,
          city: (branch?.city || "") as string,
          state: (branch?.state || "") as string,
          zipCode: (branch as any)?.zipCode ? String((branch as any).zipCode) : "",
          country: (branch?.country || "") as string,
          latitude:
            branch?.latitude === null || branch?.latitude === undefined
              ? ""
              : String(branch.latitude),
          longitude:
            branch?.longitude === null || branch?.longitude === undefined
              ? ""
              : String(branch.longitude),

          deliveryRadius:
            (branch as any)?.deliveryRadius === null ? null : String((branch as any)?.deliveryRadius ?? ""),
          deliveryFee:
            (branch as any)?.deliveryFee === null ? null : String((branch as any)?.deliveryFee ?? ""),
          deliveryRatePerKilometer:
            (branch as any)?.deliveryRatePerKilometer === null ||
            (branch as any)?.deliveryRatePerKilometer === undefined
              ? ""
              : String((branch as any).deliveryRatePerKilometer),
          useDynamicDeliveryFee: (branch as any)?.useDynamicDeliveryFee === true,
          useTieredDeliveryFee: (branch as any)?.useTieredDeliveryFee === true,
          initialDeliveryRange:
            (branch as any)?.initialDeliveryRange === null || (branch as any)?.initialDeliveryRange === undefined
              ? ""
              : String((branch as any).initialDeliveryRange),
          initialDeliveryPrice:
            (branch as any)?.initialDeliveryPrice === null || (branch as any)?.initialDeliveryPrice === undefined
              ? ""
              : String((branch as any).initialDeliveryPrice),
          extendedDeliveryThreshold:
            (branch as any)?.extendedDeliveryThreshold === null ||
            (branch as any)?.extendedDeliveryThreshold === undefined
              ? ""
              : String((branch as any).extendedDeliveryThreshold),
          extendedDeliveryRate:
            (branch as any)?.extendedDeliveryRate === null || (branch as any)?.extendedDeliveryRate === undefined
              ? ""
              : String((branch as any).extendedDeliveryRate),
          deliveryTimeEstimate:
            (branch as any)?.deliveryTimeEstimate === null || (branch as any)?.deliveryTimeEstimate === undefined
              ? ""
              : String((branch as any).deliveryTimeEstimate),
          enableFreeDelivery: (branch as any)?.enableFreeDelivery === true,
          freeDeliveryThreshold:
            (branch as any)?.freeDeliveryThreshold === null || (branch as any)?.freeDeliveryThreshold === undefined
              ? ""
              : String((branch as any).freeDeliveryThreshold),
          taxPercentage:
            (branch as any)?.taxPercentage === null || (branch as any)?.taxPercentage === undefined
              ? ""
              : String((branch as any).taxPercentage),
          serviceTaxPercentage:
            (branch as any)?.serviceTaxPercentage === null ||
            (branch as any)?.serviceTaxPercentage === undefined
              ? ""
              : String((branch as any).serviceTaxPercentage),
          deliveryTaxPercentage:
            (branch as any)?.deliveryTaxPercentage === null ||
            (branch as any)?.deliveryTaxPercentage === undefined
              ? ""
              : String((branch as any).deliveryTaxPercentage),
          taxInclusive: (branch as any)?.taxInclusive === true,
          currency: ((branch as any)?.currency || "") as string,
          enableMinimumOrder: (branch as any)?.enableMinimumOrder === true,
          minimumOrderAmount:
            (branch as any)?.minimumOrderAmount === null || (branch as any)?.minimumOrderAmount === undefined
              ? ""
              : String((branch as any).minimumOrderAmount),

          orderPreparationTime:
            (branch as any)?.orderPreparationTime === null || (branch as any)?.orderPreparationTime === undefined
              ? ""
              : String((branch as any).orderPreparationTime),
          maxOrderQuantity:
            (branch as any)?.maxOrderQuantity === null || (branch as any)?.maxOrderQuantity === undefined
              ? ""
              : String((branch as any).maxOrderQuantity),
          allowExcludeOptionalIngredients: (branch as any)?.allowExcludeOptionalIngredients !== false,
          orderMergeTimeframeMinutes:
            (branch as any)?.orderMergeTimeframeMinutes === null || (branch as any)?.orderMergeTimeframeMinutes === undefined
              ? ""
              : String((branch as any).orderMergeTimeframeMinutes),

          pickupEnabled: (branch as any)?.pickupEnabled ?? null,
          deliveryEnabled: (branch as any)?.deliveryEnabled ?? null,

          futureOrdersEnabled: (branch as any)?.futureOrdersEnabled ?? null,
          enableFuturePickupOrders: (branch as any)?.enableFuturePickupOrders ?? null,
          futurePickupOrderDays: (branch as any)?.futurePickupOrderDays ?? null,
          enableFutureDeliveryOrders: (branch as any)?.enableFutureDeliveryOrders ?? null,
          futureDeliveryOrderDays: (branch as any)?.futureDeliveryOrderDays ?? null,

          allowScheduledOrderMerge: (branch as any)?.allowScheduledOrderMerge ?? null,
          scheduledOrderMergeCutoffHours: (branch as any)?.scheduledOrderMergeCutoffHours ?? null,

          scheduledOrderAllowCancellation: (branch as any)?.scheduledOrderAllowCancellation ?? null,
          scheduledOrderCancellationWindowHours: (branch as any)?.scheduledOrderCancellationWindowHours ?? null,
          scheduledOrderFullRefundHoursBefore: (branch as any)?.scheduledOrderFullRefundHoursBefore ?? null,
          scheduledOrderPartialRefundHoursBefore: (branch as any)?.scheduledOrderPartialRefundHoursBefore ?? null,
          scheduledOrderNoRefundHoursBefore: (branch as any)?.scheduledOrderNoRefundHoursBefore ?? null,
          scheduledOrderPartialRefundPercentage: (branch as any)?.scheduledOrderPartialRefundPercentage ?? null,
          scheduledOrderReducedRefundPercentage: (branch as any)?.scheduledOrderReducedRefundPercentage ?? null,

          scheduledOrderAllowModification: (branch as any)?.scheduledOrderAllowModification ?? null,
          scheduledOrderModificationWindowHours: (branch as any)?.scheduledOrderModificationWindowHours ?? null,
          scheduledOrderAllowShallowModification: (branch as any)?.scheduledOrderAllowShallowModification ?? null,

          scheduledOrderAutoConfirm: (branch as any)?.scheduledOrderAutoConfirm ?? null,
          scheduledOrderMinimumAmount: (branch as any)?.scheduledOrderMinimumAmount ?? null,

          scheduledOrderTimeSlotInterval: (branch as any)?.scheduledOrderTimeSlotInterval ?? null,
          scheduledOrderMaxOrdersPerSlot: (branch as any)?.scheduledOrderMaxOrdersPerSlot ?? null,
          acceptCash: (branch as any)?.acceptCash !== false,
          acceptCard: (branch as any)?.acceptCard !== false,
          acceptOnlinePayment: (branch as any)?.acceptOnlinePayment !== false,
          acceptPayPal: (branch as any)?.acceptPayPal === true,

          pickupAcceptCash: (branch as any)?.pickupAcceptCash !== false,
          pickupAcceptCard: (branch as any)?.pickupAcceptCard !== false,
          pickupAcceptOnlinePayment: (branch as any)?.pickupAcceptOnlinePayment !== false,
          pickupAcceptPayPal: (branch as any)?.pickupAcceptPayPal === true,
          pickupTakeawayServiceFee:
            (branch as any)?.pickupTakeawayServiceFee === null ||
            (branch as any)?.pickupTakeawayServiceFee === undefined
              ? ""
              : String((branch as any).pickupTakeawayServiceFee),

          allowOrdersOutsideHours: (branch as any)?.allowOrdersOutsideHours === true,
          mondayIsOff: (branch as any)?.mondayIsOff === true,
          mondayOpen: normalizeTimeValue((branch as any)?.mondayOpen || ""),
          mondayClose: normalizeTimeValue((branch as any)?.mondayClose || ""),
          mondayPeriods:
            Array.isArray((branch as any)?.mondayPeriods) && (branch as any).mondayPeriods.length > 0
              ? (branch as any).mondayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.mondayOpen && (branch as any)?.mondayClose
                  ? [{ open: normalizeTimeValue((branch as any).mondayOpen), close: normalizeTimeValue((branch as any).mondayClose) }]
                  : [{ open: "", close: "" }]),
          tuesdayIsOff: (branch as any)?.tuesdayIsOff === true,
          tuesdayOpen: normalizeTimeValue((branch as any)?.tuesdayOpen || ""),
          tuesdayClose: normalizeTimeValue((branch as any)?.tuesdayClose || ""),
          tuesdayPeriods:
            Array.isArray((branch as any)?.tuesdayPeriods) && (branch as any).tuesdayPeriods.length > 0
              ? (branch as any).tuesdayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.tuesdayOpen && (branch as any)?.tuesdayClose
                  ? [{ open: normalizeTimeValue((branch as any).tuesdayOpen), close: normalizeTimeValue((branch as any).tuesdayClose) }]
                  : [{ open: "", close: "" }]),
          wednesdayIsOff: (branch as any)?.wednesdayIsOff === true,
          wednesdayOpen: normalizeTimeValue((branch as any)?.wednesdayOpen || ""),
          wednesdayClose: normalizeTimeValue((branch as any)?.wednesdayClose || ""),
          wednesdayPeriods:
            Array.isArray((branch as any)?.wednesdayPeriods) && (branch as any).wednesdayPeriods.length > 0
              ? (branch as any).wednesdayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.wednesdayOpen && (branch as any)?.wednesdayClose
                  ? [{ open: normalizeTimeValue((branch as any).wednesdayOpen), close: normalizeTimeValue((branch as any).wednesdayClose) }]
                  : [{ open: "", close: "" }]),
          thursdayIsOff: (branch as any)?.thursdayIsOff === true,
          thursdayOpen: normalizeTimeValue((branch as any)?.thursdayOpen || ""),
          thursdayClose: normalizeTimeValue((branch as any)?.thursdayClose || ""),
          thursdayPeriods:
            Array.isArray((branch as any)?.thursdayPeriods) && (branch as any).thursdayPeriods.length > 0
              ? (branch as any).thursdayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.thursdayOpen && (branch as any)?.thursdayClose
                  ? [{ open: normalizeTimeValue((branch as any).thursdayOpen), close: normalizeTimeValue((branch as any).thursdayClose) }]
                  : [{ open: "", close: "" }]),
          fridayIsOff: (branch as any)?.fridayIsOff === true,
          fridayOpen: normalizeTimeValue((branch as any)?.fridayOpen || ""),
          fridayClose: normalizeTimeValue((branch as any)?.fridayClose || ""),
          fridayPeriods:
            Array.isArray((branch as any)?.fridayPeriods) && (branch as any).fridayPeriods.length > 0
              ? (branch as any).fridayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.fridayOpen && (branch as any)?.fridayClose
                  ? [{ open: normalizeTimeValue((branch as any).fridayOpen), close: normalizeTimeValue((branch as any).fridayClose) }]
                  : [{ open: "", close: "" }]),
          saturdayIsOff: (branch as any)?.saturdayIsOff === true,
          saturdayOpen: normalizeTimeValue((branch as any)?.saturdayOpen || ""),
          saturdayClose: normalizeTimeValue((branch as any)?.saturdayClose || ""),
          saturdayPeriods:
            Array.isArray((branch as any)?.saturdayPeriods) && (branch as any).saturdayPeriods.length > 0
              ? (branch as any).saturdayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.saturdayOpen && (branch as any)?.saturdayClose
                  ? [{ open: normalizeTimeValue((branch as any).saturdayOpen), close: normalizeTimeValue((branch as any).saturdayClose) }]
                  : [{ open: "", close: "" }]),
          sundayIsOff: (branch as any)?.sundayIsOff === true,
          sundayOpen: normalizeTimeValue((branch as any)?.sundayOpen || ""),
          sundayClose: normalizeTimeValue((branch as any)?.sundayClose || ""),
          sundayPeriods:
            Array.isArray((branch as any)?.sundayPeriods) && (branch as any).sundayPeriods.length > 0
              ? (branch as any).sundayPeriods.map((p: any) => ({
                  open: normalizeTimeValue(p?.open || ""),
                  close: normalizeTimeValue(p?.close || ""),
                }))
              : ((branch as any)?.sundayOpen && (branch as any)?.sundayClose
                  ? [{ open: normalizeTimeValue((branch as any).sundayOpen), close: normalizeTimeValue((branch as any).sundayClose) }]
                  : [{ open: "", close: "" }]),

          facebookUrl: ((branch as any)?.facebookUrl || "") as string,
          instagramUrl: ((branch as any)?.instagramUrl || "") as string,
          twitterUrl: ((branch as any)?.twitterUrl || "") as string,
          websiteUrl: ((branch as any)?.websiteUrl || "") as string,
          appStatus: ((branch as any)?.appStatus || "LIVE") as string,
        });
      } catch (e: any) {
        console.error("Failed to load branch", e);
        toast.error(
          e?.response?.data?.error ||
            e?.message ||
            t("admin.branchManagement.loadError", { defaultValue: "Failed to load branches" })
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [getToken, id, isEditMode, t]);

  const uploadBranchImage = async (file: File) => {
    try {
      setUploadingImage(true);
      const token = await getToken();
      const result = await branchService.uploadImage(file, token || undefined);
      setState((prev) => ({ ...prev, branchImage: result.filename }));
      toast.success(t("admin.branchManagement.form.imageUploaded", { defaultValue: "Image uploaded" }));
    } catch (e: any) {
      console.error("Failed to upload branch image", e);
      toast.error(
        e?.response?.data?.error ||
          e?.message ||
          t("admin.branchManagement.form.imageUploadFailed", {
            defaultValue: "Failed to upload image",
          })
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const onSave = async () => {
    if (!state.name.trim()) {
      toast.error(
        t("admin.branchManagement.form.nameRequired", {
          defaultValue: "Name is required",
        })
      );
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();

      const payload: Partial<Branch> = {
        name: state.name.trim(),
        code: state.code.trim() || undefined,
        isActive: state.isActive,
        serviceType: state.serviceType ? (state.serviceType as any) : null,
        branchImage: state.branchImage.trim() || null,
        businessEmail: state.businessEmail.trim() || undefined,
        businessPhone: state.businessPhone.trim() || undefined,
        businessAddress: state.businessAddress.trim() || undefined,
        address: state.address.trim() || undefined,
        city: state.city.trim() || undefined,
        state: state.state.trim() || undefined,
        zipCode: state.zipCode.trim() || undefined,
        country: state.country.trim() || undefined,
        latitude: state.latitude.trim() ? Number(state.latitude) : undefined,
        longitude: state.longitude.trim() ? Number(state.longitude) : undefined,

        deliveryRadius:
          state.deliveryRadius === null
            ? null
            : (state.deliveryRadius || "").trim()
              ? Number(state.deliveryRadius)
              : undefined,
        deliveryFee:
          state.deliveryFee === null
            ? null
            : (state.deliveryFee || "").trim()
              ? Number(state.deliveryFee)
              : undefined,
        deliveryRatePerKilometer: state.deliveryRatePerKilometer.trim()
          ? Number(state.deliveryRatePerKilometer)
          : undefined,
        useDynamicDeliveryFee: state.useDynamicDeliveryFee,
        useTieredDeliveryFee: state.useTieredDeliveryFee,
        initialDeliveryRange: state.initialDeliveryRange.trim() ? Number(state.initialDeliveryRange) : undefined,
        initialDeliveryPrice: state.initialDeliveryPrice.trim() ? Number(state.initialDeliveryPrice) : undefined,
        extendedDeliveryThreshold: state.extendedDeliveryThreshold.trim()
          ? Number(state.extendedDeliveryThreshold)
          : undefined,
        extendedDeliveryRate: state.extendedDeliveryRate.trim() ? Number(state.extendedDeliveryRate) : undefined,
        deliveryTimeEstimate: state.deliveryTimeEstimate.trim() ? Number(state.deliveryTimeEstimate) : undefined,
        enableFreeDelivery: state.enableFreeDelivery,
        freeDeliveryThreshold: state.freeDeliveryThreshold.trim() ? Number(state.freeDeliveryThreshold) : undefined,
        taxPercentage: state.taxPercentage.trim() ? Number(state.taxPercentage) : undefined,
        serviceTaxPercentage: state.serviceTaxPercentage.trim() ? Number(state.serviceTaxPercentage) : undefined,
        deliveryTaxPercentage: state.deliveryTaxPercentage.trim() ? Number(state.deliveryTaxPercentage) : undefined,
        taxInclusive: state.taxInclusive,
        currency: state.currency.trim() || undefined,
        enableMinimumOrder: state.enableMinimumOrder,
        minimumOrderAmount: state.minimumOrderAmount.trim() ? Number(state.minimumOrderAmount) : undefined,

        orderPreparationTime: state.orderPreparationTime.trim() ? Number(state.orderPreparationTime) : undefined,
        maxOrderQuantity: state.maxOrderQuantity.trim() ? Number(state.maxOrderQuantity) : undefined,
        allowExcludeOptionalIngredients: state.allowExcludeOptionalIngredients,
        orderMergeTimeframeMinutes: state.orderMergeTimeframeMinutes.trim()
          ? Number(state.orderMergeTimeframeMinutes)
          : null,

        pickupEnabled: state.pickupEnabled,
        deliveryEnabled: state.deliveryEnabled,

        futureOrdersEnabled: state.futureOrdersEnabled,
        enableFuturePickupOrders: state.enableFuturePickupOrders,
        futurePickupOrderDays: state.futurePickupOrderDays,
        enableFutureDeliveryOrders: state.enableFutureDeliveryOrders,
        futureDeliveryOrderDays: state.futureDeliveryOrderDays,

        allowScheduledOrderMerge: state.allowScheduledOrderMerge,
        scheduledOrderMergeCutoffHours: state.scheduledOrderMergeCutoffHours,

        scheduledOrderAllowCancellation: state.scheduledOrderAllowCancellation,
        scheduledOrderCancellationWindowHours: state.scheduledOrderCancellationWindowHours,
        scheduledOrderFullRefundHoursBefore: state.scheduledOrderFullRefundHoursBefore,
        scheduledOrderPartialRefundHoursBefore: state.scheduledOrderPartialRefundHoursBefore,
        scheduledOrderNoRefundHoursBefore: state.scheduledOrderNoRefundHoursBefore,
        scheduledOrderPartialRefundPercentage: state.scheduledOrderPartialRefundPercentage,
        scheduledOrderReducedRefundPercentage: state.scheduledOrderReducedRefundPercentage,

        scheduledOrderAllowModification: state.scheduledOrderAllowModification,
        scheduledOrderModificationWindowHours: state.scheduledOrderModificationWindowHours,
        scheduledOrderAllowShallowModification: state.scheduledOrderAllowShallowModification,

        scheduledOrderAutoConfirm: state.scheduledOrderAutoConfirm,
        scheduledOrderMinimumAmount: state.scheduledOrderMinimumAmount,

        scheduledOrderTimeSlotInterval: state.scheduledOrderTimeSlotInterval,
        scheduledOrderMaxOrdersPerSlot: state.scheduledOrderMaxOrdersPerSlot,
        acceptCash: state.acceptCash,
        acceptCard: state.acceptCard,
        acceptOnlinePayment: state.acceptOnlinePayment,
        acceptPayPal: state.acceptPayPal,

        pickupAcceptCash: state.pickupAcceptCash,
        pickupAcceptCard: state.pickupAcceptCard,
        pickupAcceptOnlinePayment: state.pickupAcceptOnlinePayment,
        pickupAcceptPayPal: state.pickupAcceptPayPal,
        pickupTakeawayServiceFee: state.pickupTakeawayServiceFee.trim()
          ? Number(state.pickupTakeawayServiceFee)
          : undefined,

        allowOrdersOutsideHours: state.allowOrdersOutsideHours,
        mondayIsOff: state.mondayIsOff,
        mondayPeriods: state.mondayPeriods,
        mondayOpen: (state.mondayPeriods?.[0]?.open || state.mondayOpen || "").trim() || undefined,
        mondayClose: (state.mondayPeriods?.[0]?.close || state.mondayClose || "").trim() || undefined,
        tuesdayIsOff: state.tuesdayIsOff,
        tuesdayPeriods: state.tuesdayPeriods,
        tuesdayOpen: (state.tuesdayPeriods?.[0]?.open || state.tuesdayOpen || "").trim() || undefined,
        tuesdayClose: (state.tuesdayPeriods?.[0]?.close || state.tuesdayClose || "").trim() || undefined,
        wednesdayIsOff: state.wednesdayIsOff,
        wednesdayPeriods: state.wednesdayPeriods,
        wednesdayOpen: (state.wednesdayPeriods?.[0]?.open || state.wednesdayOpen || "").trim() || undefined,
        wednesdayClose: (state.wednesdayPeriods?.[0]?.close || state.wednesdayClose || "").trim() || undefined,
        thursdayIsOff: state.thursdayIsOff,
        thursdayPeriods: state.thursdayPeriods,
        thursdayOpen: (state.thursdayPeriods?.[0]?.open || state.thursdayOpen || "").trim() || undefined,
        thursdayClose: (state.thursdayPeriods?.[0]?.close || state.thursdayClose || "").trim() || undefined,
        fridayIsOff: state.fridayIsOff,
        fridayPeriods: state.fridayPeriods,
        fridayOpen: (state.fridayPeriods?.[0]?.open || state.fridayOpen || "").trim() || undefined,
        fridayClose: (state.fridayPeriods?.[0]?.close || state.fridayClose || "").trim() || undefined,
        saturdayIsOff: state.saturdayIsOff,
        saturdayPeriods: state.saturdayPeriods,
        saturdayOpen: (state.saturdayPeriods?.[0]?.open || state.saturdayOpen || "").trim() || undefined,
        saturdayClose: (state.saturdayPeriods?.[0]?.close || state.saturdayClose || "").trim() || undefined,
        sundayIsOff: state.sundayIsOff,
        sundayPeriods: state.sundayPeriods,
        sundayOpen: (state.sundayPeriods?.[0]?.open || state.sundayOpen || "").trim() || undefined,
        sundayClose: (state.sundayPeriods?.[0]?.close || state.sundayClose || "").trim() || undefined,

        facebookUrl: state.facebookUrl.trim() || undefined,
        instagramUrl: state.instagramUrl.trim() || undefined,
        twitterUrl: state.twitterUrl.trim() || undefined,
        websiteUrl: state.websiteUrl.trim() || undefined,
        appStatus: state.appStatus.trim() || undefined,
      } as any;

      if (isEditMode && id) {
        await branchService.updateBranch(id, payload, token || undefined);
      } else {
        await branchService.createBranch(payload, token || undefined);
      }

      toast.success(
        t("admin.branchManagement.form.saved", {
          defaultValue: "Saved successfully",
        })
      );
      navigate("/admin/branches");
    } catch (e: any) {
      console.error("Failed to save branch", e);
      toast.error(
        e?.response?.data?.error ||
          e?.message ||
          t("admin.branchManagement.form.saveFailed", {
            defaultValue: "Failed to save branch",
          })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-pink-500">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/branches")}
            className="border border-border text-foreground hover:bg-muted/60"
          >
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || loading}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {saving
              ? t("common.saving", { defaultValue: "Saving..." })
              : t("common.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </div>

      <CollapsibleCard
        defaultOpen
        title={t("admin.branchManagement.create.businessInformation.title", {
          defaultValue: "Business Information",
        })}
        description={t("admin.branchManagement.create.businessInformation.description", {
          defaultValue: "Branch name, contact, and location details.",
        })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.name", { defaultValue: "Name" })}</Label>
              <Input
                value={state.name}
                onChange={(e) => setState((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("admin.branchManagement.form.namePlaceholder", {
                  defaultValue: "Branch name",
                })}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.code", { defaultValue: "Code" })}</Label>
              <Input
                value={state.code}
                onChange={(e) => setState((p) => ({ ...p, code: e.target.value }))}
                placeholder={t("admin.branchManagement.form.codePlaceholder", {
                  defaultValue: "Optional",
                })}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.serviceType", { defaultValue: "Service type" })}</Label>
              <Select
                value={(state.serviceType ? state.serviceType : "USE_SETTINGS") as any}
                onValueChange={(v) =>
                  setState((p) => ({
                    ...p,
                    serviceType: v === "USE_SETTINGS" ? ("" as any) : (v as any),
                  }))
                }
                disabled={loading}
              >
                <SelectTrigger className="w-full bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.branchManagement.form.serviceTypePlaceholder", {
                      defaultValue: "Select",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USE_SETTINGS">
                    {t("admin.serviceType.useSettings", {
                      defaultValue: "Use settings ({{value}})",
                      value:
                        globalServiceType === "RESTAURANT"
                          ? t("admin.serviceType.restaurant", { defaultValue: "Restaurant" })
                          : globalServiceType === "MEAT_SHOP"
                          ? t("admin.serviceType.meatShop", { defaultValue: "Meat shop" })
                          : globalServiceType === "BAKERY"
                          ? t("admin.serviceType.bakery", { defaultValue: "Bakery" })
                          : t("admin.serviceType.foodTruck", { defaultValue: "Food truck" }),
                    })}
                  </SelectItem>
                  <SelectItem value="RESTAURANT">{t("admin.serviceType.restaurant", { defaultValue: "Restaurant" })}</SelectItem>
                  <SelectItem value="MEAT_SHOP">{t("admin.serviceType.meatShop", { defaultValue: "Meat shop" })}</SelectItem>
                  <SelectItem value="BAKERY">{t("admin.serviceType.bakery", { defaultValue: "Bakery" })}</SelectItem>
                  <SelectItem value="FOOD_TRUCK">{t("admin.serviceType.foodTruck", { defaultValue: "Food truck" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.image", { defaultValue: "Branch image" })}</Label>
              <div className="space-y-2">
                {branchImagePreviewSrc ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                        <img src={branchImagePreviewSrc} alt="Branch" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{t("admin.branchManagement.form.image", { defaultValue: "Branch image" })}</div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setState((p) => ({ ...p, branchImage: "" }));
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }

                        if (isEditMode && id) {
                          void (async () => {
                            try {
                              const token = await getToken();
                              if (!token) return;
                              await branchService.updateBranch(id, { branchImage: null } as any, token || undefined);
                            } catch (e: any) {
                              toast.error(e?.message || t("admin.branchManagement.form.imageRemoveFailed", { defaultValue: "Failed to remove image" }));
                            }
                          })();
                        }
                      }}
                      disabled={uploadingImage || loading}
                      className="gap-2"
                    >
                      {t("common.remove", { defaultValue: "Remove" })}
                    </Button>
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage || loading}
                    className="flex-1 bg-transparent text-foreground border-border hover:bg-muted"
                  >
                    {uploadingImage
                      ? t("common.loading", { defaultValue: "Loading..." })
                      : t("admin.branchManagement.form.selectImage", { defaultValue: "Select image" })}
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      uploadBranchImage(file);
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.businessEmail", { defaultValue: "Business email" })}</Label>
              <Input
                value={state.businessEmail}
                onChange={(e) => setState((p) => ({ ...p, businessEmail: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.businessPhone", { defaultValue: "Business phone" })}</Label>
              <Input
                value={state.businessPhone}
                onChange={(e) => setState((p) => ({ ...p, businessPhone: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.isActive}
                onCheckedChange={(checked) => setState((p) => ({ ...p, isActive: checked }))}
                disabled={loading}
              />
              <span>{t("common.active", { defaultValue: "Active" })}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              {t("admin.branchManagement.form.branchAddress", { defaultValue: "Branch address" })}
            </Label>
            <Button
              type="button"
              variant="outline"
              onClick={getCurrentLocation}
              disabled={gettingLocation || loading}
              className="bg-transparent text-foreground border-border hover:bg-muted"
            >
              {gettingLocation
                ? t("common.loading", { defaultValue: "Loading..." })
                : t("admin.branchManagement.form.useGPS", { defaultValue: "Use GPS" })}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.country", { defaultValue: "Country" })}</Label>
              <Input
                value={state.country}
                onChange={(e) => setState((p) => ({ ...p, country: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.state", { defaultValue: "State" })}</Label>
              <Input
                value={state.state}
                onChange={(e) => setState((p) => ({ ...p, state: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.city", { defaultValue: "City" })}</Label>
              <Input
                value={state.city}
                onChange={(e) => setState((p) => ({ ...p, city: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.address", { defaultValue: "Address" })}</Label>
              <Input
                value={state.address}
                onChange={(e) => setState((p) => ({ ...p, address: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.zipCode", { defaultValue: "Zip code" })}</Label>
              <Input
                value={state.zipCode}
                onChange={(e) => setState((p) => ({ ...p, zipCode: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.latitude", { defaultValue: "Latitude" })}</Label>
              <Input
                value={state.latitude}
                onChange={(e) => setState((p) => ({ ...p, latitude: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.longitude", { defaultValue: "Longitude" })}</Label>
              <Input
                value={state.longitude}
                onChange={(e) => setState((p) => ({ ...p, longitude: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>{t("admin.branchManagement.form.businessAddress", { defaultValue: "Business address" })}</Label>
              <Input
                value={state.businessAddress}
                onChange={(e) => setState((p) => ({ ...p, businessAddress: e.target.value }))}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.financialSettings.title", {
          defaultValue: "Financial Settings",
        })}
        description={t("admin.branchManagement.create.financialSettings.description", {
          defaultValue: "Taxes, currency, and minimum order.",
        })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.taxPercentage", { defaultValue: "Tax %" })}</Label>
              <Input
                value={state.taxPercentage}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                    setState((p) => ({ ...p, taxPercentage: v }));
                  }
                }}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.serviceTaxPercentage", { defaultValue: "Service tax %" })}</Label>
              <Input
                value={state.serviceTaxPercentage}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, serviceTaxPercentage: v }));
                }}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.deliveryTaxPercentage", { defaultValue: "Delivery tax %" })}</Label>
              <Input
                value={state.deliveryTaxPercentage}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, deliveryTaxPercentage: v }));
                }}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.deliveryFee", { defaultValue: "Delivery fee" })}</Label>
              <Input
                value={state.deliveryFee ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) {
                    setState((p) => ({ ...p, deliveryFee: v }));
                  }
                }}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={state.taxInclusive}
              onCheckedChange={(checked) => setState((p) => ({ ...p, taxInclusive: checked }))}
              disabled={loading}
            />
            <span>{t("admin.branchManagement.form.taxInclusive", { defaultValue: "Tax inclusive" })}</span>
          </label>

          <div className="space-y-1">
            <div className="text-sm font-medium">
              {t("admin.branchManagement.form.asapMinimumOrderTitle", {
                defaultValue: "ASAP minimum order",
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("admin.branchManagement.form.asapMinimumOrderDescription", {
                defaultValue: "Set a minimum order amount for ASAP orders.",
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.minimumOrderAmount", { defaultValue: "Minimum order" })}</Label>
              <Input
                value={state.minimumOrderAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, minimumOrderAmount: v }));
                }}
                className="bg-transparent text-foreground border-border"
                disabled={loading || !state.enableMinimumOrder}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.currency", { defaultValue: "Currency" })}</Label>
              <Select
                value={state.currency || "USD"}
                onValueChange={(v) => setState((p) => ({ ...p, currency: v }))}
                disabled={loading}
              >
                <SelectTrigger className="w-full bg-transparent text-foreground border-border">
                  <SelectValue
                    placeholder={t("admin.branchManagement.form.selectCurrency", {
                      defaultValue: "Select currency",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">Euro</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={state.enableMinimumOrder}
              onCheckedChange={(checked) => setState((p) => ({ ...p, enableMinimumOrder: checked }))}
              disabled={loading}
            />
            <span>{t("admin.branchManagement.form.enableMinimumOrder", { defaultValue: "Enable minimum order" })}</span>
          </label>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.orderSettings.title", {
          defaultValue: "Order Settings",
        })}
        description={t("admin.branchManagement.create.orderSettings.description", {
          defaultValue: "Pickup/delivery toggles, prep time, and scheduled order configuration.",
        })}
      >
        <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.pickupEnabled", { defaultValue: "Pickup enabled" })}
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    {state.pickupEnabled === null
                      ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                      : t("admin.branchManagement.create.orderSettings.overriding", { defaultValue: "Overriding" })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setState((p) => ({
                      ...p,
                      pickupEnabled: p.pickupEnabled === null ? false : null,
                    }))
                  }
                  disabled={loading}
                  className="bg-transparent text-foreground border-border hover:bg-muted"
                >
                  {state.pickupEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.override", { defaultValue: "Override" })
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal", { defaultValue: "Inherit global" })}
                </Button>
              </div>

              {state.pickupEnabled !== null ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={Boolean(state.pickupEnabled)}
                    onCheckedChange={(checked) =>
                      setState((p) => ({ ...p, pickupEnabled: checked }))
                    }
                    disabled={loading}
                  />
                  <span>{t("admin.branchManagement.create.orderSettings.pickupEnabled", { defaultValue: "Pickup enabled" })}</span>
                </label>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalPickupEnabled ? t("common.active", { defaultValue: "Active" }) : t("common.inactive", { defaultValue: "Inactive" })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.deliveryEnabled", { defaultValue: "Delivery enabled" })}
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    {state.deliveryEnabled === null
                      ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                      : t("admin.branchManagement.create.orderSettings.overriding", { defaultValue: "Overriding" })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setState((p) => ({
                      ...p,
                      deliveryEnabled: p.deliveryEnabled === null ? false : null,
                    }))
                  }
                  disabled={loading}
                  className="bg-transparent text-foreground border-border hover:bg-muted"
                >
                  {state.deliveryEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.override", { defaultValue: "Override" })
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal", { defaultValue: "Inherit global" })}
                </Button>
              </div>

              {state.deliveryEnabled !== null ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={Boolean(state.deliveryEnabled)}
                    onCheckedChange={(checked) =>
                      setState((p) => ({ ...p, deliveryEnabled: checked }))
                    }
                    disabled={loading}
                  />
                  <span>{t("admin.branchManagement.create.orderSettings.deliveryEnabled", { defaultValue: "Delivery enabled" })}</span>
                </label>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalDeliveryEnabled ? t("common.active", { defaultValue: "Active" }) : t("common.inactive", { defaultValue: "Inactive" })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("admin.branchManagement.create.orderSettings.prepTime", { defaultValue: "Preparation time" })}</Label>
                <Input
                  value={state.orderPreparationTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) setState((p) => ({ ...p, orderPreparationTime: v }));
                  }}
                  placeholder="30"
                  className="bg-transparent text-foreground border-border"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("admin.branchManagement.create.orderSettings.maxOrderQuantity", { defaultValue: "Max order quantity" })}</Label>
                <Input
                  value={state.maxOrderQuantity}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) setState((p) => ({ ...p, maxOrderQuantity: v }));
                  }}
                  placeholder="10"
                  className="bg-transparent text-foreground border-border"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5 flex-1 pr-4">
                <Label className="text-sm font-medium">
                  {t("admin.branchManagement.create.orderSettings.allowExcludeOptionalIngredients", { defaultValue: "Allow Users to Exclude Optional Ingredients" })}
                </Label>
                <div className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.orderSettings.allowExcludingOptionalIngredientsDescription", { defaultValue: "When enabled, users can uncheck optional ingredients. When disabled, ingredients become required and cannot be excluded." })}
                </div>
              </div>
              <Switch
                checked={state.allowExcludeOptionalIngredients}
                onCheckedChange={(checked) =>
                  setState((p) => ({ ...p, allowExcludeOptionalIngredients: checked }))
                }
                disabled={loading}
              />
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.orderSettings.orderMergeTimeframe", { defaultValue: "Order Merge Timeframe (minutes)" })}</Label>
              <Input
                value={state.orderMergeTimeframeMinutes}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d+$/.test(v)) setState((p) => ({ ...p, orderMergeTimeframeMinutes: v }));
                }}
                placeholder={String(globalOrderMergeTimeframeMinutes)}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
              <div className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.orderMergeTimeframeDescription", { defaultValue: "How long after placing an order can customers merge a new order with it. Set to 0 to disable order merging entirely." })}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-1">
              <div className="text-sm font-medium">
                {t("admin.branchManagement.create.orderSettings.futureOrders.title", { defaultValue: "Future Order Scheduling" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.futureOrders.description", { defaultValue: "Allow customers to schedule orders for future dates" })}
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.futureOrders.enabled", { defaultValue: "Enable Future Order Scheduling" })}
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    {state.futureOrdersEnabled === null
                      ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                      : t("admin.branchManagement.create.orderSettings.futureOrders.overriding", { defaultValue: "Overriding" })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setState((p) => ({
                      ...p,
                      futureOrdersEnabled: p.futureOrdersEnabled === null ? false : null,
                    }))
                  }
                  disabled={loading}
                  className="bg-transparent text-foreground border-border hover:bg-muted"
                >
                  {state.futureOrdersEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.futureOrders.override", { defaultValue: "Override" })
                    : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal", { defaultValue: "Inherit global" })}
                </Button>
              </div>

              {state.futureOrdersEnabled !== null ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={Boolean(state.futureOrdersEnabled)}
                    onCheckedChange={(checked) =>
                      setState((p) => ({ ...p, futureOrdersEnabled: checked }))
                    }
                    disabled={loading}
                  />
                  <span>{t("admin.branchManagement.create.orderSettings.futureOrders.enabled", { defaultValue: "Enable Future Order Scheduling" })}</span>
                </label>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalFutureOrdersEnabled ? t("common.active", { defaultValue: "Active" }) : t("common.inactive", { defaultValue: "Inactive" })}
                </div>
              )}
            </div>

            {Boolean((state.futureOrdersEnabled === null ? globalFutureOrdersEnabled : state.futureOrdersEnabled) || false) ? (
              <>
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.futureOrders.pickupTitle", { defaultValue: "Pickup Future Orders" })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.enableFuturePickupOrders === null
                          ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.futureOrders.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          enableFuturePickupOrders: p.enableFuturePickupOrders === null ? false : null,
                          futurePickupOrderDays: p.enableFuturePickupOrders === null ? (p.futurePickupOrderDays ?? 0) : null,
                        }))
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.enableFuturePickupOrders === null
                        ? t("admin.branchManagement.create.orderSettings.futureOrders.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.enableFuturePickupOrders !== null ? (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.enableFuturePickupOrders)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, enableFuturePickupOrders: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.futureOrders.enablePickup", { defaultValue: "Enable Future Pickup Orders" })}
                        </span>
                      </div>

                      {Boolean(state.enableFuturePickupOrders) && (
                        <div className="space-y-2">
                          <Label>
                            {t("admin.branchManagement.create.orderSettings.futureOrders.maxDaysPickup", { defaultValue: "Max Days in Advance (Pickup)" })}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={state.futurePickupOrderDays ?? 0}
                            placeholder="7"
                            onChange={(e) => {
                              const v = e.target.value;
                              setState((p) => ({
                                ...p,
                                futurePickupOrderDays: v === "" ? 0 : Number(v),
                              }));
                            }}
                            className="bg-transparent text-foreground border-border"
                            disabled={loading}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalEnableFuturePickupOrders ? t("common.active", { defaultValue: "Active" }) : t("common.inactive", { defaultValue: "Inactive" })}
                      {globalEnableFuturePickupOrders ? ` (${globalFuturePickupOrderDays})` : ""}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.futureOrders.deliveryTitle", { defaultValue: "Delivery Future Orders" })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.enableFutureDeliveryOrders === null
                          ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.futureOrders.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          enableFutureDeliveryOrders: p.enableFutureDeliveryOrders === null ? false : null,
                          futureDeliveryOrderDays: p.enableFutureDeliveryOrders === null ? (p.futureDeliveryOrderDays ?? 0) : null,
                        }))
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.enableFutureDeliveryOrders === null
                        ? t("admin.branchManagement.create.orderSettings.futureOrders.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.enableFutureDeliveryOrders !== null ? (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.enableFutureDeliveryOrders)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, enableFutureDeliveryOrders: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.futureOrders.enableDelivery", { defaultValue: "Enable Future Delivery Orders" })}
                        </span>
                      </div>

                      {Boolean(state.enableFutureDeliveryOrders) && (
                        <div className="space-y-2">
                          <Label>
                            {t("admin.branchManagement.create.orderSettings.futureOrders.maxDaysDelivery", { defaultValue: "Max Days in Advance (Delivery)" })}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={state.futureDeliveryOrderDays ?? 0}
                            placeholder="7"
                            onChange={(e) => {
                              const v = e.target.value;
                              setState((p) => ({
                                ...p,
                                futureDeliveryOrderDays: v === "" ? 0 : Number(v),
                              }));
                            }}
                            className="bg-transparent text-foreground border-border"
                            disabled={loading}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalEnableFutureDeliveryOrders ? t("common.active", { defaultValue: "Active" }) : t("common.inactive", { defaultValue: "Inactive" })}
                      {globalEnableFutureDeliveryOrders ? ` (${globalFutureDeliveryOrderDays})` : ""}
                    </div>
                  )}
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.title", { defaultValue: "Scheduled Order Merge" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.description", { defaultValue: "Configure whether customers can merge scheduled orders" })}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.mergeTitle", { defaultValue: "Allow scheduled order merge" })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.allowScheduledOrderMerge === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => {
                          if (p.allowScheduledOrderMerge === null) {
                            return {
                              ...p,
                              allowScheduledOrderMerge: false,
                              scheduledOrderMergeCutoffHours: globalScheduledOrderMergeCutoffHours,
                            };
                          }
                          return {
                            ...p,
                            allowScheduledOrderMerge: null,
                            scheduledOrderMergeCutoffHours: null,
                          };
                        })
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.allowScheduledOrderMerge === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.allowScheduledOrderMerge !== null ? (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.allowScheduledOrderMerge)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, allowScheduledOrderMerge: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.enable", { defaultValue: "Enable scheduled order merge" })}
                        </span>
                      </div>

                      {Boolean(state.allowScheduledOrderMerge) && (
                        <div className="space-y-2">
                          <Label>
                            {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.cutoffHours", { defaultValue: "Merge cutoff hours" })}
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={48}
                            value={state.scheduledOrderMergeCutoffHours ?? globalScheduledOrderMergeCutoffHours}
                            placeholder="2"
                            onChange={(e) =>
                              setState((p) => ({
                                ...p,
                                scheduledOrderMergeCutoffHours:
                                  e.target.value === "" ? 0 : Number(e.target.value),
                              }))
                            }
                            className="bg-transparent text-foreground border-border"
                            disabled={loading}
                          />
                          <div className="text-xs text-muted-foreground">
                            {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.cutoffHoursDescription", { defaultValue: "Scheduled orders can be merged until this many hours before the scheduled time." })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalAllowScheduledOrderMerge ? t("common.active", { defaultValue: "Active" }) : t("common.inactive", { defaultValue: "Inactive" })}
                      {globalAllowScheduledOrderMerge ? ` (${globalScheduledOrderMergeCutoffHours})` : ""}
                    </div>
                  )}
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.title", { defaultValue: "Scheduled Order Time Slot Interval" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.description", { defaultValue: "How many minutes between available time slots for scheduled orders" })}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.label", { defaultValue: "Scheduled Order Time Slot Interval (minutes)" })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.scheduledOrderTimeSlotInterval === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.inheritingFromGlobal", {
                              defaultValue: "Inheriting from global: {{value}}",
                              value: globalScheduledOrderTimeSlotInterval,
                            })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          scheduledOrderTimeSlotInterval:
                            p.scheduledOrderTimeSlotInterval === null
                              ? globalScheduledOrderTimeSlotInterval
                              : null,
                        }))
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.scheduledOrderTimeSlotInterval === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.scheduledOrderTimeSlotInterval !== null && (
                    <div className="space-y-2">
                      <Label>
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.minutes", { defaultValue: "Minutes" })}
                      </Label>
                      <Input
                        type="number"
                        min={5}
                        max={240}
                        value={state.scheduledOrderTimeSlotInterval ?? ""}
                        placeholder={String(globalScheduledOrderTimeSlotInterval)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setState((p) => ({
                            ...p,
                            scheduledOrderTimeSlotInterval: v === "" ? 0 : Number(v),
                          }));
                        }}
                        className="bg-transparent text-foreground border-border"
                        disabled={loading}
                      />
                    </div>
                  )}
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.title", { defaultValue: "Max scheduled orders per time slot" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.description", { defaultValue: "Maximum number of scheduled orders allowed in a single time slot. Leave empty for unlimited." })}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.label", { defaultValue: "Max scheduled orders per time slot" })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.scheduledOrderMaxOrdersPerSlot === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.inheritingFromGlobal", {
                              defaultValue: "Inheriting from global: {{value}}",
                              value:
                                globalScheduledOrderMaxOrdersPerSlot === null
                                  ? t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.unlimited", { defaultValue: "Unlimited" })
                                  : globalScheduledOrderMaxOrdersPerSlot,
                            })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          scheduledOrderMaxOrdersPerSlot:
                            p.scheduledOrderMaxOrdersPerSlot === null
                              ? globalScheduledOrderMaxOrdersPerSlot
                              : null,
                        }))
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.scheduledOrderMaxOrdersPerSlot === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.scheduledOrderMaxOrdersPerSlot !== null && (
                    <div className="space-y-2">
                      <Label>
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.maxOrders", { defaultValue: "Max orders" })}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={state.scheduledOrderMaxOrdersPerSlot ?? ""}
                        placeholder={
                          globalScheduledOrderMaxOrdersPerSlot === null
                            ? t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.unlimited", { defaultValue: "Unlimited" })
                            : String(globalScheduledOrderMaxOrdersPerSlot)
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setState((p) => ({
                            ...p,
                            scheduledOrderMaxOrdersPerSlot: v === "" ? undefined : Number(v),
                          }));
                        }}
                        className="bg-transparent text-foreground border-border"
                        disabled={loading}
                      />
                      <div className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.hint", { defaultValue: "Leave empty for unlimited" })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.title", {
                      defaultValue: "Scheduled Order Management",
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.description", {
                      defaultValue: "Configure cancellation, modification, and refund policies for scheduled orders",
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.label", {
                          defaultValue: "Auto-confirm scheduled orders",
                        })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.scheduledOrderAutoConfirm === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          scheduledOrderAutoConfirm: p.scheduledOrderAutoConfirm === null ? true : null,
                        }))
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.scheduledOrderAutoConfirm === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.scheduledOrderAutoConfirm !== null && (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.scheduledOrderAutoConfirm ?? true)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, scheduledOrderAutoConfirm: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.label", {
                            defaultValue: "Auto-confirm scheduled orders",
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.description", {
                          defaultValue: "If disabled, scheduled orders will start as pending and require admin confirmation",
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.label", {
                          defaultValue: "Minimum order amount",
                        })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.scheduledOrderMinimumAmount === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => ({
                          ...p,
                          scheduledOrderMinimumAmount: p.scheduledOrderMinimumAmount === null ? 0 : null,
                        }))
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.scheduledOrderMinimumAmount === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.scheduledOrderMinimumAmount !== null && (
                    <div className="space-y-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={state.scheduledOrderMinimumAmount ?? 0}
                        onChange={(e) =>
                          setState((p) => ({
                            ...p,
                            scheduledOrderMinimumAmount:
                              e.target.value === "" ? 0 : Number(e.target.value),
                          }))
                        }
                        className="bg-transparent text-foreground border-border max-w-xs"
                        disabled={loading}
                      />
                      <div className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.description", {
                          defaultValue: "Set a minimum order amount for scheduled orders (0 = no minimum). Does not apply when merging orders.",
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.title", {
                          defaultValue: "Cancellation & Refund",
                        })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.scheduledOrderAllowCancellation === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => {
                          if (p.scheduledOrderAllowCancellation === null) {
                            return {
                              ...p,
                              scheduledOrderAllowCancellation: false,
                              scheduledOrderCancellationWindowHours: 0,
                              scheduledOrderFullRefundHoursBefore: 24,
                              scheduledOrderPartialRefundHoursBefore: 12,
                              scheduledOrderNoRefundHoursBefore: 2,
                              scheduledOrderPartialRefundPercentage: 50,
                              scheduledOrderReducedRefundPercentage: 25,
                            };
                          }
                          return {
                            ...p,
                            scheduledOrderAllowCancellation: null,
                            scheduledOrderCancellationWindowHours: null,
                            scheduledOrderFullRefundHoursBefore: null,
                            scheduledOrderPartialRefundHoursBefore: null,
                            scheduledOrderNoRefundHoursBefore: null,
                            scheduledOrderPartialRefundPercentage: null,
                            scheduledOrderReducedRefundPercentage: null,
                          };
                        })
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.scheduledOrderAllowCancellation === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.scheduledOrderAllowCancellation !== null && (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.scheduledOrderAllowCancellation)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, scheduledOrderAllowCancellation: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.enable", {
                            defaultValue: "Allow Scheduled Order Cancellation",
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.enableDescription", {
                          defaultValue: "Allow customers to cancel scheduled orders",
                        })}
                      </div>

                      {Boolean(state.scheduledOrderAllowCancellation) && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>
                              {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.windowHours", {
                                defaultValue: "Cancellation Window (hours before scheduled time)",
                              })}
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              value={state.scheduledOrderCancellationWindowHours ?? 0}
                              placeholder="0"
                              onChange={(e) =>
                                setState((p) => ({
                                  ...p,
                                  scheduledOrderCancellationWindowHours:
                                    e.target.value === "" ? 0 : Number(e.target.value),
                                }))
                              }
                              className="bg-transparent text-foreground border-border"
                              disabled={loading}
                            />
                          </div>

                          <div className="h-px bg-border" />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>
                                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.fullHoursBefore", {
                                  defaultValue: "Full Refund (hours before scheduled time)",
                                })}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                value={state.scheduledOrderFullRefundHoursBefore ?? 24}
                                placeholder="24"
                                onChange={(e) =>
                                  setState((p) => ({
                                    ...p,
                                    scheduledOrderFullRefundHoursBefore:
                                      e.target.value === "" ? 0 : Number(e.target.value),
                                  }))
                                }
                                className="bg-transparent text-foreground border-border"
                                disabled={loading}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>
                                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.partialHoursBefore", {
                                  defaultValue: "Partial Refund (hours before scheduled time)",
                                })}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                value={state.scheduledOrderPartialRefundHoursBefore ?? 12}
                                placeholder="12"
                                onChange={(e) =>
                                  setState((p) => ({
                                    ...p,
                                    scheduledOrderPartialRefundHoursBefore:
                                      e.target.value === "" ? 0 : Number(e.target.value),
                                  }))
                                }
                                className="bg-transparent text-foreground border-border"
                                disabled={loading}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>
                                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.noRefundHoursBefore", {
                                  defaultValue: "No Refund (hours before scheduled time)",
                                })}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                value={state.scheduledOrderNoRefundHoursBefore ?? 2}
                                placeholder="2"
                                onChange={(e) =>
                                  setState((p) => ({
                                    ...p,
                                    scheduledOrderNoRefundHoursBefore:
                                      e.target.value === "" ? 0 : Number(e.target.value),
                                  }))
                                }
                                className="bg-transparent text-foreground border-border"
                                disabled={loading}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>
                                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.partialPercentage", {
                                  defaultValue: "Partial Refund Percentage (%)",
                                })}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={state.scheduledOrderPartialRefundPercentage ?? 50}
                                placeholder="50"
                                onChange={(e) =>
                                  setState((p) => ({
                                    ...p,
                                    scheduledOrderPartialRefundPercentage:
                                      e.target.value === "" ? 0 : Number(e.target.value),
                                  }))
                                }
                                className="bg-transparent text-foreground border-border"
                                disabled={loading}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>
                                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.reducedPercentage", {
                                  defaultValue: "Reduced Refund Percentage (%)",
                                })}
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={state.scheduledOrderReducedRefundPercentage ?? 25}
                                placeholder="25"
                                onChange={(e) =>
                                  setState((p) => ({
                                    ...p,
                                    scheduledOrderReducedRefundPercentage:
                                      e.target.value === "" ? 0 : Number(e.target.value),
                                  }))
                                }
                                className="bg-transparent text-foreground border-border"
                                disabled={loading}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.title", {
                          defaultValue: "Allow modification",
                        })}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {state.scheduledOrderAllowModification === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding", { defaultValue: "Overriding" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setState((p) => {
                          if (p.scheduledOrderAllowModification === null) {
                            return {
                              ...p,
                              scheduledOrderAllowModification: false,
                              scheduledOrderModificationWindowHours: 0,
                              scheduledOrderAllowShallowModification: false,
                            };
                          }
                          return {
                            ...p,
                            scheduledOrderAllowModification: null,
                            scheduledOrderModificationWindowHours: null,
                            scheduledOrderAllowShallowModification: null,
                          };
                        })
                      }
                      disabled={loading}
                      className="bg-transparent text-foreground border-border hover:bg-muted"
                    >
                      {state.scheduledOrderAllowModification === null
                        ? t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.override", { defaultValue: "Override" })
                        : t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal", { defaultValue: "Inherit global" })}
                    </Button>
                  </div>

                  {state.scheduledOrderAllowModification !== null && (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.scheduledOrderAllowModification)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, scheduledOrderAllowModification: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.enable", {
                            defaultValue: "Allow modification",
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={Boolean(state.scheduledOrderAllowShallowModification)}
                          onCheckedChange={(checked) =>
                            setState((p) => ({ ...p, scheduledOrderAllowShallowModification: checked }))
                          }
                          disabled={loading}
                        />
                        <span>
                          {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.shallowEnable", {
                            defaultValue: "Allow Rescheduling (date/time only)",
                          })}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.shallowEnableDescription", {
                          defaultValue: "Allow customers to change only the scheduled date/time without cancelling and re-ordering",
                        })}
                      </div>

                      {Boolean(state.scheduledOrderAllowModification) && (
                        <div className="space-y-2">
                          <Label>
                            {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.windowHours", {
                              defaultValue: "Modification window (hours)",
                            })}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={state.scheduledOrderModificationWindowHours ?? 0}
                            placeholder="0"
                            onChange={(e) =>
                              setState((p) => ({
                                ...p,
                                scheduledOrderModificationWindowHours:
                                  e.target.value === "" ? 0 : Number(e.target.value),
                              }))
                            }
                            className="bg-transparent text-foreground border-border"
                            disabled={loading}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

              </>
            ) : null}
          </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.deliverySettings.title", {
          defaultValue: "Delivery Settings",
        })}
        description={t("admin.branchManagement.create.deliverySettings.description", {
          defaultValue: "Radius, fees, and tiered/dynamic delivery options.",
        })}
      >
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="deliveryRadius">
                      {t("admin.branchManagement.create.deliverySettings.deliveryRadius", { defaultValue: "Delivery Radius (km)" })}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {state.deliveryRadius === null
                        ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                        : t("admin.branchManagement.create.orderSettings.overriding", { defaultValue: "Overriding" })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setState((p) => ({
                        ...p,
                        deliveryRadius: p.deliveryRadius === null ? String(globalDeliveryRadius) : null,
                      }))
                    }
                    disabled={loading}
                    className="bg-transparent text-foreground border-border hover:bg-muted"
                  >
                    {state.deliveryRadius === null
                      ? t("admin.branchManagement.create.orderSettings.override", { defaultValue: "Override" })
                      : t("admin.branchManagement.create.orderSettings.inheritGlobal", { defaultValue: "Inherit global" })}
                  </Button>
                </div>
                <Input
                  id="deliveryRadius"
                  value={state.deliveryRadius === null ? String(globalDeliveryRadius) : state.deliveryRadius ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (state.deliveryRadius === null) return;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, deliveryRadius: v }));
                  }}
                  className="bg-transparent text-foreground border-border"
                  disabled={loading || state.deliveryRadius === null}
                  placeholder={String(globalDeliveryRadius)}
                />
                {state.deliveryRadius === null && (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalDeliveryRadius}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="deliveryFee">
                      {t("admin.branchManagement.create.financialSettings.deliveryFee", { defaultValue: "Delivery Fee" })}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {state.deliveryFee === null
                        ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })
                        : t("admin.branchManagement.create.orderSettings.overriding", { defaultValue: "Overriding" })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setState((p) => ({
                        ...p,
                        deliveryFee: p.deliveryFee === null ? String(globalDeliveryFee) : null,
                      }))
                    }
                    disabled={loading}
                    className="bg-transparent text-foreground border-border hover:bg-muted"
                  >
                    {state.deliveryFee === null
                      ? t("admin.branchManagement.create.orderSettings.override", { defaultValue: "Override" })
                      : t("admin.branchManagement.create.orderSettings.inheritGlobal", { defaultValue: "Inherit global" })}
                  </Button>
                </div>
                <Input
                  id="deliveryFee"
                  value={state.deliveryFee === null ? String(globalDeliveryFee) : state.deliveryFee ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (state.deliveryFee === null) return;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, deliveryFee: v }));
                  }}
                  className="bg-transparent text-foreground border-border"
                  disabled={loading || state.deliveryFee === null}
                  placeholder={String(globalDeliveryFee)}
                />
                {state.deliveryFee === null && (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal", { defaultValue: "Inheriting from global" })}: {globalDeliveryFee}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryRatePerKilometer">
                  {t("admin.branchManagement.create.deliverySettings.ratePerKm", { defaultValue: "Rate per km" })}
                </Label>
                <Input
                  id="deliveryRatePerKilometer"
                  value={state.deliveryRatePerKilometer}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, deliveryRatePerKilometer: v }));
                  }}
                  className="bg-transparent text-foreground border-border"
                  disabled={loading}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useDynamicDeliveryFee"
                    checked={state.useDynamicDeliveryFee || false}
                    onCheckedChange={(checked) =>
                      setState((p) => ({
                        ...p,
                        useDynamicDeliveryFee: checked,
                        useTieredDeliveryFee: checked ? false : p.useTieredDeliveryFee,
                      }))
                    }
                    disabled={loading}
                  />
                  <Label htmlFor="useDynamicDeliveryFee">
                    {t("admin.branchManagement.create.deliverySettings.useDynamicDeliveryFee", { defaultValue: "Use Dynamic Delivery Fee" })}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.deliverySettings.useDynamicDeliveryFeeDescription", { defaultValue: "Calculate delivery fee based on distance from the restaurant" })}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useTieredDeliveryFee"
                    checked={state.useTieredDeliveryFee || false}
                    onCheckedChange={(checked) =>
                      setState((p) => ({
                        ...p,
                        useTieredDeliveryFee: checked,
                        useDynamicDeliveryFee: checked ? false : p.useDynamicDeliveryFee,
                      }))
                    }
                    disabled={loading}
                  />
                  <Label htmlFor="useTieredDeliveryFee">
                    {t("admin.branchManagement.create.deliverySettings.useTieredDeliveryFee", { defaultValue: "Use Tiered Delivery Fee" })}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.deliverySettings.useTieredDeliveryFeeDescription", { defaultValue: "Set different delivery fees based on distance ranges" })}
                </p>
              </div>

              {Boolean(state.useTieredDeliveryFee) && (
                <div className="space-y-4 pl-6 border-l-2 border-pink-200 md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="initialDeliveryRange">
                        {t("admin.branchManagement.create.deliverySettings.initialRange", { defaultValue: "Initial Range (km)" })}
                      </Label>
                      <Input
                        id="initialDeliveryRange"
                        value={state.initialDeliveryRange}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, initialDeliveryRange: v }));
                        }}
                        className="bg-transparent text-foreground border-border"
                        disabled={loading}
                        placeholder="3"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.deliverySettings.initialRangeDescription", { defaultValue: "Distance covered by the initial delivery price" })}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="initialDeliveryPrice">
                        {t("admin.branchManagement.create.deliverySettings.initialPrice", { defaultValue: "Initial Price" })}
                      </Label>
                      <Input
                        id="initialDeliveryPrice"
                        value={state.initialDeliveryPrice}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, initialDeliveryPrice: v }));
                        }}
                        className="bg-transparent text-foreground border-border"
                        disabled={loading}
                        placeholder="2.00"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.deliverySettings.initialPriceDescription", { defaultValue: "Fixed price for deliveries within the initial range" })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="extendedDeliveryThreshold">
                        {t("admin.branchManagement.create.deliverySettings.extendedThresholdOptional", { defaultValue: "Extended Threshold (km) (Optional)" })}
                      </Label>
                      <Input
                        id="extendedDeliveryThreshold"
                        value={state.extendedDeliveryThreshold}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, extendedDeliveryThreshold: v }));
                        }}
                        className="bg-transparent text-foreground border-border"
                        disabled={loading}
                        placeholder="10"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.deliverySettings.extendedThresholdDescription", { defaultValue: "Distance threshold for extended delivery pricing (leave empty to disable)" })}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extendedDeliveryRate">
                        {t("admin.branchManagement.create.deliverySettings.extendedRateOptional", { defaultValue: "Extended Rate (Optional)" })}
                      </Label>
                      <Input
                        id="extendedDeliveryRate"
                        value={state.extendedDeliveryRate}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, extendedDeliveryRate: v }));
                        }}
                        className="bg-transparent text-foreground border-border"
                        disabled={loading}
                        placeholder="0.65"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.deliverySettings.extendedRateDescription", { defaultValue: "Rate per km for deliveries beyond the extended threshold" })}
                      </p>
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      <strong>{t("admin.branchManagement.create.deliverySettings.howItWorks", { defaultValue: "How it works:" })}</strong>{" "}
                      {t("admin.branchManagement.create.deliverySettings.howItWorksDescription", { defaultValue: "Deliveries within the initial range pay the initial price. If extended threshold is set, deliveries beyond it pay the extended rate per km. Otherwise, deliveries beyond the initial range use the standard rate per km." })}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="deliveryTimeEstimate">
                  {t("admin.branchManagement.create.deliverySettings.deliveryTimeEstimate", { defaultValue: "Delivery Time Estimate (min)" })}
                </Label>
                <Input
                  id="deliveryTimeEstimate"
                  value={state.deliveryTimeEstimate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) setState((p) => ({ ...p, deliveryTimeEstimate: v }));
                  }}
                  className="bg-transparent text-foreground border-border"
                  disabled={loading}
                  placeholder="45"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="freeDeliveryThreshold">
                  {t("admin.branchManagement.create.deliverySettings.freeDeliveryThreshold", { defaultValue: "Free Delivery Threshold" })}
                </Label>
                <Input
                  id="freeDeliveryThreshold"
                  value={state.freeDeliveryThreshold}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, freeDeliveryThreshold: v }));
                  }}
                  className="bg-transparent text-foreground border-border"
                  disabled={loading || !state.enableFreeDelivery}
                  placeholder="50.00"
                />
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableFreeDelivery"
                    checked={state.enableFreeDelivery || false}
                    onCheckedChange={(checked) => setState((p) => ({ ...p, enableFreeDelivery: checked }))}
                    disabled={loading}
                  />
                  <Label htmlFor="enableFreeDelivery">
                    {t("admin.branchManagement.create.deliverySettings.enableFreeDelivery", { defaultValue: "Enable Free Delivery" })}
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.servingHours.title", {
          defaultValue: "Serving Hours",
        })}
        description={t("admin.branchManagement.create.servingHours.description", {
          defaultValue: "Daily schedules; leave blank to inherit defaults.",
        })}
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-2 p-4 bg-pink-50 dark:bg-pink-950/20 rounded-lg border border-pink-200 dark:border-pink-800">
            <Switch
              id="allowOrdersOutsideHours"
              checked={state.allowOrdersOutsideHours || false}
              onCheckedChange={(checked) => setState((p) => ({ ...p, allowOrdersOutsideHours: checked }))}
              disabled={loading}
            />
            <div className="flex-1">
              <Label htmlFor="allowOrdersOutsideHours" className="text-base font-semibold cursor-pointer">
                {t("admin.branchManagement.create.servingHours.allowOrdersOutsideHours", { defaultValue: "Allow Orders Outside Hours" })}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t("admin.branchManagement.create.servingHours.allowOrdersOutsideHoursDescription", { defaultValue: "Allow customers to place orders even when the restaurant is closed" })}
              </p>
            </div>
          </div>

          {(
            [
              { key: "monday", label: t("admin.branchManagement.create.servingHours.monday", { defaultValue: "Monday" }) },
              { key: "tuesday", label: t("admin.branchManagement.create.servingHours.tuesday", { defaultValue: "Tuesday" }) },
              { key: "wednesday", label: t("admin.branchManagement.create.servingHours.wednesday", { defaultValue: "Wednesday" }) },
              { key: "thursday", label: t("admin.branchManagement.create.servingHours.thursday", { defaultValue: "Thursday" }) },
              { key: "friday", label: t("admin.branchManagement.create.servingHours.friday", { defaultValue: "Friday" }) },
              { key: "saturday", label: t("admin.branchManagement.create.servingHours.saturday", { defaultValue: "Saturday" }) },
              { key: "sunday", label: t("admin.branchManagement.create.servingHours.sunday", { defaultValue: "Sunday" }) },
            ] as const
          ).map((day) => {
            const isOffKey = `${day.key}IsOff` as keyof BranchFormState;
            const openKey = `${day.key}Open` as keyof BranchFormState;
            const closeKey = `${day.key}Close` as keyof BranchFormState;
            const periodsKey = `${day.key}Periods` as keyof BranchFormState;

            const isOff = Boolean(state[isOffKey] as any);
            const periods = (state[periodsKey] as any as Array<{ open: string; close: string }>) || [{ open: "", close: "" }];

            const updatePeriods = (next: Array<{ open: string; close: string }>) => {
              setState((p) => {
                const first = next?.[0] || { open: "", close: "" };
                return {
                  ...p,
                  [periodsKey]: next,
                  [openKey]: first.open,
                  [closeKey]: first.close,
                } as any;
              });
            };

            const updatePeriodTime = (periodIndex: number, type: "open" | "close", value: string) => {
              const next = [...periods];
              while (next.length <= periodIndex) {
                next.push({ open: "", close: "" });
              }
              next[periodIndex] = { ...next[periodIndex], [type]: value };
              updatePeriods(next);
            };

            const addPeriod = () => {
              updatePeriods([...(periods || []), { open: "", close: "" }]);
            };

            const removePeriod = (periodIndex: number) => {
              if ((periods || []).length <= 1) {
                updatePeriods([{ open: "", close: "" }]);
                return;
              }
              updatePeriods((periods || []).filter((_, idx) => idx !== periodIndex));
            };

            return (
              <div key={day.key} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">{day.label}</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${day.key}IsOff`}
                      checked={isOff}
                      onCheckedChange={(checked) => setState((p) => ({ ...p, [isOffKey]: checked } as any))}
                      disabled={loading}
                    />
                    <Label htmlFor={`${day.key}IsOff`} className="text-sm">
                      {t("admin.branchManagement.create.servingHours.closed", { defaultValue: "Closed" })}
                    </Label>
                  </div>
                </div>

                {!isOff && (
                  <div className="space-y-4">
                    {(periods || [{ open: "", close: "" }]).map((period, periodIndex) => (
                      <div key={periodIndex} className="space-y-3 p-3 bg-muted/50 rounded-lg border">
                        {(periods || []).length > 1 && (
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-pink-500">
                              {t("admin.branchManagement.create.servingHours.period", { defaultValue: "Period" })} {periodIndex + 1}
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removePeriod(periodIndex)}
                              className="text-destructive hover:text-destructive p-2"
                              disabled={loading}
                            >
                              {t("admin.branchManagement.create.servingHours.remove", { defaultValue: "Remove" })}
                            </Button>
                          </div>
                        )}
                        <div className="flex flex-row gap-4 items-end">
                          <div className="flex-1 space-y-2">
                            <Label htmlFor={`${day.key}Period${periodIndex}Open`}>
                              {t("admin.branchManagement.create.servingHours.openTime", { defaultValue: "Open Time" })}
                            </Label>
                            <Select
                              value={period.open || ""}
                              onValueChange={(v) => updatePeriodTime(periodIndex, "open", v)}
                              disabled={loading}
                            >
                              <SelectTrigger className="bg-transparent text-foreground border-border">
                                <SelectValue
                                  placeholder={t("admin.branchManagement.create.servingHours.openTime", {
                                    defaultValue: "Open Time",
                                  })}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {timeOptions.map((opt) => (
                                  <SelectItem key={`${day.key}-open-${periodIndex}-${opt}`} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label htmlFor={`${day.key}Period${periodIndex}Close`}>
                              {t("admin.branchManagement.create.servingHours.closeTime", { defaultValue: "Close Time" })}
                            </Label>
                            <Select
                              value={period.close || ""}
                              onValueChange={(v) => updatePeriodTime(periodIndex, "close", v)}
                              disabled={loading}
                            >
                              <SelectTrigger className="bg-transparent text-foreground border-border">
                                <SelectValue
                                  placeholder={t("admin.branchManagement.create.servingHours.closeTime", {
                                    defaultValue: "Close Time",
                                  })}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {timeOptions.map((opt) => (
                                  <SelectItem key={`${day.key}-close-${periodIndex}-${opt}`} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addPeriod}
                      className="w-full border-pink-500 text-pink-500 hover:bg-pink-50"
                      disabled={loading}
                    >
                      {t("admin.branchManagement.create.servingHours.addPeriod", { defaultValue: "Add Period" })}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.deliveryPaymentSettings.title", {
          defaultValue: "Delivery Payment Settings",
        })}
        description={t("admin.branchManagement.create.deliveryPaymentSettings.description", {
          defaultValue: "Choose payment methods available for delivery orders.",
        })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={state.acceptCash} onCheckedChange={(checked) => setState((p) => ({ ...p, acceptCash: checked }))} disabled={loading} />
              <span>{t("admin.branchManagement.form.acceptCash", { defaultValue: "Accept cash" })}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.acceptCard}
                onCheckedChange={(checked) => setState((p) => ({ ...p, acceptCard: checked }))}
                disabled={loading || !orgOnlinePaymentsAllowed || !orgCardPaymentsAllowed}
              />
              <span>{t("admin.branchManagement.form.acceptCard", { defaultValue: "Accept card" })}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.acceptOnlinePayment}
                onCheckedChange={(checked) => setState((p) => ({ ...p, acceptOnlinePayment: checked }))}
                disabled={loading || !orgOnlinePaymentsAllowed}
              />
              <span>{t("admin.branchManagement.form.acceptOnlinePayment", { defaultValue: "Accept online payment" })}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.acceptPayPal}
                onCheckedChange={(checked) => setState((p) => ({ ...p, acceptPayPal: checked }))}
                disabled={loading || !orgOnlinePaymentsAllowed || !orgPaypalAllowed}
              />
              <span>{t("admin.branchManagement.form.acceptPayPal", { defaultValue: "Accept PayPal" })}</span>
            </label>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.title", {
          defaultValue: "Pickup Payment Settings",
        })}
        description={t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.description", {
          defaultValue: "Choose payment methods available for pickup orders.",
        })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.pickupAcceptCash}
                onCheckedChange={(checked) => setState((p) => ({ ...p, pickupAcceptCash: checked }))}
                disabled={loading}
              />
              <span>{t("admin.branchManagement.form.pickupAcceptCash", { defaultValue: "Pickup: cash" })}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.pickupAcceptCard}
                onCheckedChange={(checked) => setState((p) => ({ ...p, pickupAcceptCard: checked }))}
                disabled={loading || !orgOnlinePaymentsAllowed || !orgCardPaymentsAllowed}
              />
              <span>{t("admin.branchManagement.form.pickupAcceptCard", { defaultValue: "Pickup: card" })}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.pickupAcceptOnlinePayment}
                onCheckedChange={(checked) =>
                  setState((p) => ({ ...p, pickupAcceptOnlinePayment: checked }))
                }
                disabled={loading || !orgOnlinePaymentsAllowed}
              />
              <span>{t("admin.branchManagement.form.pickupAcceptOnlinePayment", { defaultValue: "Pickup: online" })}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={state.pickupAcceptPayPal}
                onCheckedChange={(checked) => setState((p) => ({ ...p, pickupAcceptPayPal: checked }))}
                disabled={loading || !orgOnlinePaymentsAllowed || !orgPaypalAllowed}
              />
              <span>{t("admin.branchManagement.form.pickupAcceptPayPal", { defaultValue: "Pickup: PayPal" })}</span>
            </label>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("admin.branchManagement.form.pickupTakeawayServiceFee", { defaultValue: "Pickup service fee" })}</Label>
              <Input
                value={state.pickupTakeawayServiceFee}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setState((p) => ({ ...p, pickupTakeawayServiceFee: v }));
                }}
                className="bg-transparent text-foreground border-border"
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title={t("admin.branchManagement.create.socialMedia.title", {
          defaultValue: "Social Media & Contact",
        })}
        description={t("admin.branchManagement.create.socialMedia.description", {
          defaultValue: "Links and public contact info.",
        })}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.facebookUrl", { defaultValue: "Facebook URL" })}</Label>
              <Input value={state.facebookUrl} onChange={(e) => setState((p) => ({ ...p, facebookUrl: e.target.value }))} className="bg-transparent text-foreground border-border" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.instagramUrl", { defaultValue: "Instagram URL" })}</Label>
              <Input value={state.instagramUrl} onChange={(e) => setState((p) => ({ ...p, instagramUrl: e.target.value }))} className="bg-transparent text-foreground border-border" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.twitterUrl", { defaultValue: "Twitter URL" })}</Label>
              <Input value={state.twitterUrl} onChange={(e) => setState((p) => ({ ...p, twitterUrl: e.target.value }))} className="bg-transparent text-foreground border-border" disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.form.websiteUrl", { defaultValue: "Website URL" })}</Label>
              <Input value={state.websiteUrl} onChange={(e) => setState((p) => ({ ...p, websiteUrl: e.target.value }))} className="bg-transparent text-foreground border-border" disabled={loading} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("admin.branchManagement.form.appStatus", { defaultValue: "App status" })}</Label>
              <Input value={state.appStatus} onChange={(e) => setState((p) => ({ ...p, appStatus: e.target.value }))} className="bg-transparent text-foreground border-border" disabled={loading} />
            </div>
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
};

export default BranchForm;
