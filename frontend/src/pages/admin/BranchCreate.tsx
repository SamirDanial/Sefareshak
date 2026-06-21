import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import moment from "moment-timezone";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker12Hour } from "@/components/ui/time-picker-12hour";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiLoading, mdiOfficeBuilding, mdiCurrencyUsd, mdiCart, mdiTruck, mdiCreditCard, mdiClock, mdiWeb, mdiNavigation, mdiRefresh, mdiDelete, mdiPlus } from "@mdi/js";
import branchService, { type Branch } from "@/services/branchService";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import googlePlacesService, {
  type AddressComponents,
} from "@/services/googlePlacesService";
import { SettingsService } from "@/services/settingsService";
import { usePermissions } from "@/contexts/PermissionContext";

type BranchForm = {
  // basic
  name: string;
  code?: string;
  isActive?: boolean;
  serviceType?: "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK" | null;
  timezone?: string;
  // business
  branchImage?: string;
  businessEmail?: string;
  businessPhone?: string;
  // location
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  businessAddress?: string;
  // delivery / fees / taxes
  deliveryRadius?: string | null;
  deliveryFee?: string | null;
  deliveryRatePerKilometer?: string;
  useDynamicDeliveryFee?: boolean;
  useTieredDeliveryFee?: boolean;
  initialDeliveryRange?: string;
  initialDeliveryPrice?: string;
  extendedDeliveryThreshold?: string;
  extendedDeliveryRate?: string;
  deliveryTimeEstimate?: string;
  enableFreeDelivery?: boolean;
  freeDeliveryThreshold?: string;
  taxPercentage?: string;
  serviceTaxPercentage?: string;
  deliveryTaxPercentage?: string;
  enableMinimumOrder?: boolean;
  minimumOrderAmount?: string;
  currency?: string;
  taxInclusive?: boolean;
  // order settings
  orderPreparationTime?: string;
  maxOrderQuantity?: string;
  allowExcludeOptionalIngredients?: boolean;
  orderMergeTimeframeMinutes?: string;
  pickupEnabled?: boolean | null;
  deliveryEnabled?: boolean | null;
  // future order settings (null = inherit from global)
  futureOrdersEnabled?: boolean | null;
  enableFuturePickupOrders?: boolean | null;
  futurePickupOrderDays?: number | null;
  enableFutureDeliveryOrders?: boolean | null;
  futureDeliveryOrderDays?: number | null;
  // scheduled order merge settings (null = inherit from global)
  allowScheduledOrderMerge?: boolean | null;
  scheduledOrderMergeCutoffHours?: number | null;
  // scheduled order management settings (null = inherit from global)
  scheduledOrderAllowCancellation?: boolean | null;
  scheduledOrderCancellationWindowHours?: number | null;
  scheduledOrderFullRefundHoursBefore?: number | null;
  scheduledOrderPartialRefundHoursBefore?: number | null;
  scheduledOrderNoRefundHoursBefore?: number | null;
  scheduledOrderPartialRefundPercentage?: number | null;
  scheduledOrderReducedRefundPercentage?: number | null;
  scheduledOrderAllowModification?: boolean | null;
  scheduledOrderModificationWindowHours?: number | null;
  scheduledOrderAllowShallowModification?: boolean | null;
  scheduledOrderAutoConfirm?: boolean | null;
  scheduledOrderMinimumAmount?: number | null;
  // scheduled order time slot settings (null = inherit from global)
  scheduledOrderTimeSlotInterval?: number | null;
  // scheduled order capacity (null = inherit from global; global null = unlimited)
  scheduledOrderMaxOrdersPerSlot?: number | null;
  // payment
  acceptCash?: boolean;
  acceptCard?: boolean;
  acceptOnlinePayment?: boolean;
  acceptPayPal?: boolean;
  pickupAcceptCash?: boolean;
  pickupAcceptCard?: boolean;
  pickupAcceptOnlinePayment?: boolean;
  pickupAcceptPayPal?: boolean;
  pickupTakeawayServiceFee?: number | null;
  // hours
  allowOrdersOutsideHours?: boolean;
  mondayIsOff?: boolean;
  mondayOpen?: string; // Deprecated: kept for backward compatibility
  mondayClose?: string; // Deprecated: kept for backward compatibility
  mondayPeriods?: Array<{ open: string; close: string }>;
  tuesdayIsOff?: boolean;
  tuesdayOpen?: string; // Deprecated
  tuesdayClose?: string; // Deprecated
  tuesdayPeriods?: Array<{ open: string; close: string }>;
  wednesdayIsOff?: boolean;
  wednesdayOpen?: string; // Deprecated
  wednesdayClose?: string; // Deprecated
  wednesdayPeriods?: Array<{ open: string; close: string }>;
  thursdayIsOff?: boolean;
  thursdayOpen?: string; // Deprecated
  thursdayClose?: string; // Deprecated
  thursdayPeriods?: Array<{ open: string; close: string }>;
  fridayIsOff?: boolean;
  fridayOpen?: string; // Deprecated
  fridayClose?: string; // Deprecated
  fridayPeriods?: Array<{ open: string; close: string }>;
  saturdayIsOff?: boolean;
  saturdayOpen?: string; // Deprecated
  saturdayClose?: string; // Deprecated
  saturdayPeriods?: Array<{ open: string; close: string }>;
  sundayIsOff?: boolean;
  sundayOpen?: string; // Deprecated
  sundayClose?: string; // Deprecated
  sundayPeriods?: Array<{ open: string; close: string }>;
  // socials
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  // status
  appStatus?: string;
  // branch override master Future Order Scheduling toggle
  overrideFutureOrderScheduling?: boolean;
};

const defaultForm: BranchForm = {
  name: "",
  code: "",
  isActive: true,
  serviceType: null,
  timezone: "",
  branchImage: "",
  businessEmail: "",
  businessPhone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  latitude: "",
  longitude: "",
  businessAddress: "",
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
  enableMinimumOrder: false,
  minimumOrderAmount: "",
  currency: "",
  taxInclusive: false,
  orderPreparationTime: "",
  maxOrderQuantity: "",
  allowExcludeOptionalIngredients: true,
  orderMergeTimeframeMinutes: "",
  pickupEnabled: null,
  deliveryEnabled: null,
  // future order settings (null = inherit from global)
  futureOrdersEnabled: null,
  enableFuturePickupOrders: null,
  futurePickupOrderDays: null,
  enableFutureDeliveryOrders: null,
  futureDeliveryOrderDays: null,
  // scheduled order merge settings (null = inherit from global)
  allowScheduledOrderMerge: null,
  scheduledOrderMergeCutoffHours: null,
  // scheduled order management settings (null = inherit from global)
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
  pickupAcceptCash: undefined,
  pickupAcceptCard: undefined,
  pickupAcceptOnlinePayment: undefined,
  pickupAcceptPayPal: undefined,
  pickupTakeawayServiceFee: null,
  allowOrdersOutsideHours: false,
  mondayIsOff: false,
  mondayOpen: "",
  mondayClose: "",
  tuesdayIsOff: false,
  tuesdayOpen: "",
  tuesdayClose: "",
  wednesdayIsOff: false,
  wednesdayOpen: "",
  wednesdayClose: "",
  thursdayIsOff: false,
  thursdayOpen: "",
  thursdayClose: "",
  fridayIsOff: false,
  fridayOpen: "",
  fridayClose: "",
  saturdayIsOff: false,
  saturdayOpen: "",
  saturdayClose: "",
  sundayIsOff: false,
  sundayOpen: "",
  sundayClose: "",
  facebookUrl: "",
  instagramUrl: "",
  twitterUrl: "",
  websiteUrl: "",
  appStatus: "LIVE",
};

const BranchCreate: React.FC = () => {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { rbacUser, isSuperAdmin } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const [form, setForm] = useState<BranchForm>(defaultForm);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem("bellami:selectedOrganizationId");
      return stored ? stored : "";
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [branchImageFile, setBranchImageFile] = useState<File | null>(null);
  const [uploadingBranchImage, setUploadingBranchImage] = useState(false);
  const [branchImagePreviewUrl, setBranchImagePreviewUrl] = useState<string>("");
  const branchImageInputRef = useRef<HTMLInputElement>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [showStateSuggestions, setShowStateSuggestions] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [countryHasStates, setCountryHasStates] = useState(true); // Default to showing state field
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [globalOrderMergeTimeframe, setGlobalOrderMergeTimeframe] = useState<number>(10); // Global setting for placeholder
  const [globalScheduledOrderTimeSlotInterval, setGlobalScheduledOrderTimeSlotInterval] = useState<number>(30);
  const [globalScheduledOrderMaxOrdersPerSlot, setGlobalScheduledOrderMaxOrdersPerSlot] = useState<number | null>(null);
  const [globalServiceType, setGlobalServiceType] = useState<
    "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK"
  >("RESTAURANT");

  // Comprehensive list of all IANA timezones using moment-timezone's database
  const commonTimeZones = useMemo(() => {
    const EXCLUDED_PREFIXES = ["Etc/", "SystemV/", "GMT", "UCT"];
    try {
      const allZones = moment.tz.names();
      // Filter out system/non-location zones while keeping all geographic zones
      return allZones.filter((zone: string) => {
        // Keep UTC explicitly
        if (zone === "UTC") return true;
        // Exclude system-only zones
        return !EXCLUDED_PREFIXES.some((prefix) => zone.startsWith(prefix));
      });
    } catch {
      // Fallback to common timezones if moment-timezone fails
      return [
        "UTC",
        "Europe/Berlin",
        "Europe/London",
        "Europe/Paris",
        "Europe/Madrid",
        "Europe/Rome",
        "Europe/Istanbul",
        "Asia/Kabul",
        "Asia/Dubai",
        "Asia/Tehran",
        "Asia/Riyadh",
        "Asia/Kolkata",
        "Asia/Bangkok",
        "Asia/Singapore",
        "Asia/Tokyo",
        "Australia/Sydney",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "America/Sao_Paulo",
      ];
    }
  }, []);

  const [globalFutureOrdersEnabled, setGlobalFutureOrdersEnabled] = useState<boolean>(false);
  const [globalPickupEnabled, setGlobalPickupEnabled] = useState<boolean>(true);
  const [globalDeliveryEnabled, setGlobalDeliveryEnabled] = useState<boolean>(true);
  const [globalDeliveryRadius, setGlobalDeliveryRadius] = useState<number>(5);
  const [globalDeliveryFee, setGlobalDeliveryFee] = useState<number>(0);

  const [orgPaymentEntitlements, setOrgPaymentEntitlements] = useState<{
    onlinePaymentsAllowed: boolean;
    cardPaymentsAllowed: boolean;
    paypalAllowed: boolean;
  }>({ onlinePaymentsAllowed: true, cardPaymentsAllowed: true, paypalAllowed: true });

  const orgAdminOrganizationId = useMemo(() => {
    const id = (rbacUser as any)?.organizationId as string | null | undefined;
    return id && String(id).trim().length > 0 ? String(id) : "";
  }, [rbacUser]);

  const handleChange = (key: keyof BranchForm, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const loadOrganizationServiceType = useCallback(
    async (organizationId: string) => {
      if (!organizationId) return;
      try {
        const token = await getToken();
        if (!token) return;
        const orgSettings = await branchService.getOrganizationSettings(organizationId, token);
        const st = ((orgSettings as any)?.serviceType || "RESTAURANT") as any;
        setGlobalServiceType(st);
      } catch {
        // Ignore - leave default
      }
    },
    [getToken]
  );

  useEffect(() => {
    googlePlacesService.loadScript(() => setGoogleLoaded(true));
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
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

    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [isSuperAdmin, selectedOrganizationId]);

  useEffect(() => {
    if (isSuperAdmin) return;
    const ent = (rbacUser as any)?.organizationEntitlements;
    if (!ent) return;
    setOrgPaymentEntitlements({
      onlinePaymentsAllowed: ent.onlinePaymentsAllowed !== false,
      cardPaymentsAllowed: ent.cardPaymentsAllowed !== false,
      paypalAllowed: ent.paypalAllowed !== false,
    });
  }, [rbacUser, isSuperAdmin]);

  // Load settings from main settings to inherit initial values
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const token = await getToken();
        const response = await SettingsService.getSettings(token || undefined);
        if (response.success && response.data) {
          const settings = response.data;
          setGlobalFutureOrdersEnabled(Boolean((settings as any).futureOrdersEnabled));
          setGlobalPickupEnabled((settings as any).pickupEnabled !== false);
          setGlobalDeliveryEnabled((settings as any).deliveryEnabled !== false);
          const effectiveOrgId = isSuperAdmin
            ? selectedOrganizationId
            : orgAdminOrganizationId;
          if (effectiveOrgId) {
            await loadOrganizationServiceType(effectiveOrgId);
          }
          if ((settings as any).deliveryRadius !== undefined && (settings as any).deliveryRadius !== null) {
            setGlobalDeliveryRadius(Number((settings as any).deliveryRadius));
          }
          if ((settings as any).deliveryFee !== undefined && (settings as any).deliveryFee !== null) {
            setGlobalDeliveryFee(Number((settings as any).deliveryFee));
          }
          // Store global order merge timeframe for placeholder display
          if (settings.orderMergeTimeframeMinutes !== undefined) {
            setGlobalOrderMergeTimeframe(settings.orderMergeTimeframeMinutes);
          }
          if ((settings as any).scheduledOrderTimeSlotInterval !== undefined) {
            setGlobalScheduledOrderTimeSlotInterval((settings as any).scheduledOrderTimeSlotInterval);
          }
          if ((settings as any).scheduledOrderMaxOrdersPerSlot !== undefined) {
            setGlobalScheduledOrderMaxOrdersPerSlot((settings as any).scheduledOrderMaxOrdersPerSlot ?? null);
          }
          // Inherit settings from main settings
          setForm((prev) => ({
            ...prev,
            // Business Information - inherit if current value is empty
            businessEmail: !prev.businessEmail && settings.businessEmail ? settings.businessEmail : prev.businessEmail,
            businessPhone: !prev.businessPhone && settings.businessPhone ? settings.businessPhone : prev.businessPhone,
            timezone:
              !prev.timezone && (settings as any).timezone
                ? String((settings as any).timezone)
                : prev.timezone,
            // Address Information - inherit if current value is empty
            country: !prev.country && settings.country ? settings.country : prev.country,
            state: !prev.state && settings.state ? settings.state : prev.state,
            city: !prev.city && settings.city ? settings.city : prev.city,
            address: !prev.address && settings.addressLineOne ? settings.addressLineOne : prev.address,
            businessAddress: !prev.businessAddress && settings.businessAddress ? settings.businessAddress : prev.businessAddress,
            // Convert latitude/longitude from number to string if they exist
            latitude: !prev.latitude && settings.latitude !== undefined 
              ? (typeof settings.latitude === "number" ? String(settings.latitude) : settings.latitude) 
              : prev.latitude,
            longitude: !prev.longitude && settings.longitude !== undefined 
              ? (typeof settings.longitude === "number" ? String(settings.longitude) : settings.longitude) 
              : prev.longitude,
            // Financial Settings - inherit if current value is empty
            taxPercentage: !prev.taxPercentage && settings.taxPercentage !== undefined ? String(settings.taxPercentage) : prev.taxPercentage,
            serviceTaxPercentage: !prev.serviceTaxPercentage && (settings as any).serviceTaxPercentage !== undefined ? String((settings as any).serviceTaxPercentage) : prev.serviceTaxPercentage,
            deliveryTaxPercentage: !prev.deliveryTaxPercentage && settings.deliveryTaxPercentage !== undefined ? String(settings.deliveryTaxPercentage) : prev.deliveryTaxPercentage,
            deliveryFee: !prev.deliveryFee && settings.deliveryFee !== undefined ? String(settings.deliveryFee) : prev.deliveryFee,
            minimumOrderAmount: !prev.minimumOrderAmount && settings.minimumOrderAmount !== undefined ? String(settings.minimumOrderAmount) : prev.minimumOrderAmount,
            currency: !prev.currency && settings.currency ? settings.currency : prev.currency,
            // Always inherit boolean values from settings (they're simple true/false)
            enableMinimumOrder: settings.enableMinimumOrder !== undefined ? settings.enableMinimumOrder : prev.enableMinimumOrder,
            taxInclusive: settings.taxInclusive !== undefined ? settings.taxInclusive : prev.taxInclusive,
            // Order Settings - inherit if current value is empty
            orderPreparationTime: !prev.orderPreparationTime && settings.orderPreparationTime !== undefined ? String(settings.orderPreparationTime) : prev.orderPreparationTime,
            maxOrderQuantity: !prev.maxOrderQuantity && settings.maxOrderQuantity !== undefined ? String(settings.maxOrderQuantity) : prev.maxOrderQuantity,
            // Always inherit boolean values from settings
            allowExcludeOptionalIngredients: settings.allowExcludeOptionalIngredients !== undefined ? settings.allowExcludeOptionalIngredients : prev.allowExcludeOptionalIngredients,
            // Service availability defaults for branch (branch overrides explicitly; null = inherit)
            pickupEnabled: prev.pickupEnabled === null || prev.pickupEnabled === undefined ? null : prev.pickupEnabled,
            deliveryEnabled: prev.deliveryEnabled === null || prev.deliveryEnabled === undefined ? null : prev.deliveryEnabled,
            // Order merge timeframe - don't inherit, branches override explicitly
            // Scheduled order time slot interval - branches override explicitly
            // Delivery Settings - org-first defaults (null = inherit; explicit values mean override)
            deliveryRatePerKilometer: !prev.deliveryRatePerKilometer && settings.deliveryRatePerKilometer !== undefined ? String(settings.deliveryRatePerKilometer) : prev.deliveryRatePerKilometer,
            deliveryTimeEstimate: !prev.deliveryTimeEstimate && settings.deliveryTimeEstimate !== undefined ? String(settings.deliveryTimeEstimate) : prev.deliveryTimeEstimate,
            freeDeliveryThreshold: !prev.freeDeliveryThreshold && settings.freeDeliveryThreshold !== undefined ? String(settings.freeDeliveryThreshold) : prev.freeDeliveryThreshold,
            initialDeliveryRange: !prev.initialDeliveryRange && settings.initialDeliveryRange !== undefined ? String(settings.initialDeliveryRange) : prev.initialDeliveryRange,
            initialDeliveryPrice: !prev.initialDeliveryPrice && settings.initialDeliveryPrice !== undefined ? String(settings.initialDeliveryPrice) : prev.initialDeliveryPrice,
            extendedDeliveryThreshold: !prev.extendedDeliveryThreshold && settings.extendedDeliveryThreshold !== undefined && settings.extendedDeliveryThreshold !== null ? String(settings.extendedDeliveryThreshold) : prev.extendedDeliveryThreshold,
            extendedDeliveryRate: !prev.extendedDeliveryRate && settings.extendedDeliveryRate !== undefined && settings.extendedDeliveryRate !== null ? String(settings.extendedDeliveryRate) : prev.extendedDeliveryRate,
            // Always inherit boolean values from settings
            useDynamicDeliveryFee: settings.useDynamicDeliveryFee !== undefined ? settings.useDynamicDeliveryFee : prev.useDynamicDeliveryFee,
            useTieredDeliveryFee: settings.useTieredDeliveryFee !== undefined ? settings.useTieredDeliveryFee : prev.useTieredDeliveryFee,
            enableFreeDelivery: settings.enableFreeDelivery !== undefined ? settings.enableFreeDelivery : prev.enableFreeDelivery,
            // Serving Hours - inherit if current value is empty
            allowOrdersOutsideHours: settings.allowOrdersOutsideHours !== undefined ? settings.allowOrdersOutsideHours : prev.allowOrdersOutsideHours,
            mondayIsOff: settings.mondayIsOff !== undefined ? settings.mondayIsOff : prev.mondayIsOff,
            mondayOpen: !prev.mondayOpen && settings.mondayOpen ? settings.mondayOpen : prev.mondayOpen,
            mondayClose: !prev.mondayClose && settings.mondayClose ? settings.mondayClose : prev.mondayClose,
            mondayPeriods: !prev.mondayPeriods && settings.mondayPeriods ? settings.mondayPeriods : prev.mondayPeriods,
            tuesdayIsOff: settings.tuesdayIsOff !== undefined ? settings.tuesdayIsOff : prev.tuesdayIsOff,
            tuesdayOpen: !prev.tuesdayOpen && settings.tuesdayOpen ? settings.tuesdayOpen : prev.tuesdayOpen,
            tuesdayClose: !prev.tuesdayClose && settings.tuesdayClose ? settings.tuesdayClose : prev.tuesdayClose,
            tuesdayPeriods: !prev.tuesdayPeriods && settings.tuesdayPeriods ? settings.tuesdayPeriods : prev.tuesdayPeriods,
            wednesdayIsOff: settings.wednesdayIsOff !== undefined ? settings.wednesdayIsOff : prev.wednesdayIsOff,
            wednesdayOpen: !prev.wednesdayOpen && settings.wednesdayOpen ? settings.wednesdayOpen : prev.wednesdayOpen,
            wednesdayClose: !prev.wednesdayClose && settings.wednesdayClose ? settings.wednesdayClose : prev.wednesdayClose,
            wednesdayPeriods: !prev.wednesdayPeriods && settings.wednesdayPeriods ? settings.wednesdayPeriods : prev.wednesdayPeriods,
            thursdayIsOff: settings.thursdayIsOff !== undefined ? settings.thursdayIsOff : prev.thursdayIsOff,
            thursdayOpen: !prev.thursdayOpen && settings.thursdayOpen ? settings.thursdayOpen : prev.thursdayOpen,
            thursdayClose: !prev.thursdayClose && settings.thursdayClose ? settings.thursdayClose : prev.thursdayClose,
            thursdayPeriods: !prev.thursdayPeriods && settings.thursdayPeriods ? settings.thursdayPeriods : prev.thursdayPeriods,
            fridayIsOff: settings.fridayIsOff !== undefined ? settings.fridayIsOff : prev.fridayIsOff,
            fridayOpen: !prev.fridayOpen && settings.fridayOpen ? settings.fridayOpen : prev.fridayOpen,
            fridayClose: !prev.fridayClose && settings.fridayClose ? settings.fridayClose : prev.fridayClose,
            fridayPeriods: !prev.fridayPeriods && settings.fridayPeriods ? settings.fridayPeriods : prev.fridayPeriods,
            saturdayIsOff: settings.saturdayIsOff !== undefined ? settings.saturdayIsOff : prev.saturdayIsOff,
            saturdayOpen: !prev.saturdayOpen && settings.saturdayOpen ? settings.saturdayOpen : prev.saturdayOpen,
            saturdayClose: !prev.saturdayClose && settings.saturdayClose ? settings.saturdayClose : prev.saturdayClose,
            saturdayPeriods: !prev.saturdayPeriods && settings.saturdayPeriods ? settings.saturdayPeriods : prev.saturdayPeriods,
            sundayIsOff: settings.sundayIsOff !== undefined ? settings.sundayIsOff : prev.sundayIsOff,
            sundayOpen: !prev.sundayOpen && settings.sundayOpen ? settings.sundayOpen : prev.sundayOpen,
            sundayClose: !prev.sundayClose && settings.sundayClose ? settings.sundayClose : prev.sundayClose,
            sundayPeriods: !prev.sundayPeriods && settings.sundayPeriods ? settings.sundayPeriods : prev.sundayPeriods,
            // Payment Settings - always inherit boolean values from settings
            acceptCash: settings.acceptCash !== undefined ? settings.acceptCash : prev.acceptCash,
            acceptCard: settings.acceptCard !== undefined ? settings.acceptCard : prev.acceptCard,
            acceptOnlinePayment: settings.acceptOnlinePayment !== undefined ? settings.acceptOnlinePayment : prev.acceptOnlinePayment,
            acceptPayPal: settings.acceptPayPal !== undefined ? settings.acceptPayPal : prev.acceptPayPal,
            pickupAcceptCash:
              settings.pickupAcceptCash !== undefined
                ? settings.pickupAcceptCash
                : prev.pickupAcceptCash,
            pickupAcceptCard:
              settings.pickupAcceptCard !== undefined
                ? settings.pickupAcceptCard
                : prev.pickupAcceptCard,
            pickupAcceptOnlinePayment:
              settings.pickupAcceptOnlinePayment !== undefined
                ? settings.pickupAcceptOnlinePayment
                : prev.pickupAcceptOnlinePayment,
            pickupAcceptPayPal:
              settings.pickupAcceptPayPal !== undefined
                ? settings.pickupAcceptPayPal
                : prev.pickupAcceptPayPal,
            // Social Media - inherit if current value is empty
            facebookUrl: !prev.facebookUrl && settings.facebookUrl ? settings.facebookUrl : prev.facebookUrl,
            instagramUrl: !prev.instagramUrl && settings.instagramUrl ? settings.instagramUrl : prev.instagramUrl,
            twitterUrl: !prev.twitterUrl && settings.twitterUrl ? settings.twitterUrl : prev.twitterUrl,
            websiteUrl: !prev.websiteUrl && settings.websiteUrl ? settings.websiteUrl : prev.websiteUrl,
          }));
          
          // Also update addressInput if address is inherited
          if (!addressInput && settings.addressLineOne) {
            setAddressInput(settings.addressLineOne);
          }

        }
      } catch (error) {
        console.error("Error loading settings:", error);
        // Silently fail - don't show error toast as this is just for inheritance
      }
    };

    // Only load settings if not in edit mode (edit mode will load branch data instead)
    if (!isEditMode) {
      loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, isSuperAdmin, orgAdminOrganizationId, selectedOrganizationId, loadOrganizationServiceType]);

  // Load branch data if in edit mode
  useEffect(() => {
    const loadBranch = async () => {
      if (!isEditMode || !id) return;

      try {
        setLoadingBranch(true);
        const token = await getToken();
        const branch = await branchService.getBranch(id, token || undefined);

        const branchOrgId = (branch as any)?.organizationId as string | null | undefined;
        if (branchOrgId) {
          await loadOrganizationServiceType(branchOrgId);
        }

        if (isSuperAdmin) {
          const o = (branch as any)?.organization;
          if (o) {
            setOrgPaymentEntitlements({
              onlinePaymentsAllowed: o.onlinePaymentsAllowed !== false,
              cardPaymentsAllowed: o.cardPaymentsAllowed !== false,
              paypalAllowed: o.paypalAllowed !== false,
            });
          }
        }

        // Populate form with branch data
        const nextForm: BranchForm = {
          name: branch.name || "",
          code: (branch as any).code || "",
          isActive: branch.isActive ?? true,
          branchImage: (branch as any).branchImage || "",
          serviceType: (branch as any).serviceType ?? null,
          timezone: (branch as any).timezone || "",
          businessEmail: (branch as any).businessEmail || "",
          businessPhone: (branch as any).businessPhone || "",
          address: (branch as any).address || "",
          city: (branch as any).city || "",
          state: (branch as any).state || "",
          zipCode: (branch as any).zipCode || "",
          country: (branch as any).country || "",
          latitude: branch.latitude ? String(branch.latitude) : "",
          longitude: branch.longitude ? String(branch.longitude) : "",
          businessAddress: (branch as any).businessAddress || "",
          deliveryRadius:
            (branch as any).deliveryRadius === null || (branch as any).deliveryRadius === undefined
              ? null
              : String((branch as any).deliveryRadius),
          deliveryFee:
            (branch as any).deliveryFee === null || (branch as any).deliveryFee === undefined
              ? null
              : String((branch as any).deliveryFee),
          deliveryRatePerKilometer: (branch as any).deliveryRatePerKilometer ? String((branch as any).deliveryRatePerKilometer) : "",
          useDynamicDeliveryFee: (branch as any).useDynamicDeliveryFee ?? false,
          useTieredDeliveryFee: (branch as any).useTieredDeliveryFee ?? false,
          initialDeliveryRange: (branch as any).initialDeliveryRange ? String((branch as any).initialDeliveryRange) : "",
          initialDeliveryPrice: (branch as any).initialDeliveryPrice ? String((branch as any).initialDeliveryPrice) : "",
          extendedDeliveryThreshold: (branch as any).extendedDeliveryThreshold ? String((branch as any).extendedDeliveryThreshold) : "",
          extendedDeliveryRate: (branch as any).extendedDeliveryRate ? String((branch as any).extendedDeliveryRate) : "",
          deliveryTimeEstimate: (branch as any).deliveryTimeEstimate ? String((branch as any).deliveryTimeEstimate) : "",
          enableFreeDelivery: (branch as any).enableFreeDelivery ?? false,
          freeDeliveryThreshold: (branch as any).freeDeliveryThreshold ? String((branch as any).freeDeliveryThreshold) : "",
          taxPercentage: (branch as any).taxPercentage ? String((branch as any).taxPercentage) : "",
          serviceTaxPercentage: (branch as any).serviceTaxPercentage ? String((branch as any).serviceTaxPercentage) : "",
          deliveryTaxPercentage: (branch as any).deliveryTaxPercentage ? String((branch as any).deliveryTaxPercentage) : "",
          enableMinimumOrder: (branch as any).enableMinimumOrder ?? false,
          minimumOrderAmount: (branch as any).minimumOrderAmount ? String((branch as any).minimumOrderAmount) : "",
          currency: (branch as any).currency || "",
          taxInclusive: (branch as any).taxInclusive ?? false,
          orderPreparationTime: (branch as any).orderPreparationTime ? String((branch as any).orderPreparationTime) : "",
          maxOrderQuantity: (branch as any).maxOrderQuantity ? String((branch as any).maxOrderQuantity) : "",
          allowExcludeOptionalIngredients: (branch as any).allowExcludeOptionalIngredients ?? false,
          orderMergeTimeframeMinutes: (branch as any).orderMergeTimeframeMinutes ? String((branch as any).orderMergeTimeframeMinutes) : "",
          pickupEnabled: (branch as any).pickupEnabled ?? null,
          deliveryEnabled: (branch as any).deliveryEnabled ?? null,
          futureOrdersEnabled: (branch as any).futureOrdersEnabled ?? null,
          enableFuturePickupOrders: (branch as any).enableFuturePickupOrders ?? null,
          futurePickupOrderDays: (branch as any).futurePickupOrderDays ?? null,
          enableFutureDeliveryOrders: (branch as any).enableFutureDeliveryOrders ?? null,
          futureDeliveryOrderDays: (branch as any).futureDeliveryOrderDays ?? null,
          allowScheduledOrderMerge: (branch as any).allowScheduledOrderMerge ?? null,
          scheduledOrderMergeCutoffHours: (branch as any).scheduledOrderMergeCutoffHours ?? null,
          scheduledOrderAllowCancellation: (branch as any).scheduledOrderAllowCancellation ?? null,
          scheduledOrderCancellationWindowHours: (branch as any).scheduledOrderCancellationWindowHours ?? null,
          scheduledOrderFullRefundHoursBefore: (branch as any).scheduledOrderFullRefundHoursBefore ?? null,
          scheduledOrderPartialRefundHoursBefore: (branch as any).scheduledOrderPartialRefundHoursBefore ?? null,
          scheduledOrderNoRefundHoursBefore: (branch as any).scheduledOrderNoRefundHoursBefore ?? null,
          scheduledOrderPartialRefundPercentage: (branch as any).scheduledOrderPartialRefundPercentage ?? null,
          scheduledOrderReducedRefundPercentage: (branch as any).scheduledOrderReducedRefundPercentage ?? null,
          scheduledOrderAllowModification: (branch as any).scheduledOrderAllowModification ?? null,
          scheduledOrderModificationWindowHours: (branch as any).scheduledOrderModificationWindowHours ?? null,
          scheduledOrderAllowShallowModification: (branch as any).scheduledOrderAllowShallowModification ?? null,
          scheduledOrderAutoConfirm: (branch as any).scheduledOrderAutoConfirm ?? null,
          scheduledOrderMinimumAmount: (branch as any).scheduledOrderMinimumAmount ?? null,
          scheduledOrderTimeSlotInterval: (branch as any).scheduledOrderTimeSlotInterval ?? null,
          scheduledOrderMaxOrdersPerSlot: (branch as any).scheduledOrderMaxOrdersPerSlot ?? null,
          acceptCash: (branch as any).acceptCash ?? false,
          acceptCard: (branch as any).acceptCard ?? false,
          acceptOnlinePayment: (branch as any).acceptOnlinePayment ?? false,
          acceptPayPal: (branch as any).acceptPayPal ?? false,
          pickupAcceptCash: (branch as any).pickupAcceptCash ?? undefined,
          pickupAcceptCard: (branch as any).pickupAcceptCard ?? undefined,
          pickupAcceptOnlinePayment: (branch as any).pickupAcceptOnlinePayment ?? undefined,
          pickupAcceptPayPal: (branch as any).pickupAcceptPayPal ?? undefined,
          pickupTakeawayServiceFee:
            (branch as any).pickupTakeawayServiceFee !== null && (branch as any).pickupTakeawayServiceFee !== undefined
              ? Number((branch as any).pickupTakeawayServiceFee)
              : null,
          allowOrdersOutsideHours: (branch as any).allowOrdersOutsideHours ?? false,
          mondayIsOff: (branch as any).mondayIsOff ?? false,
          mondayOpen: (branch as any).mondayOpen || "",
          mondayClose: (branch as any).mondayClose || "",
          mondayPeriods: (branch as any).mondayPeriods ? (typeof (branch as any).mondayPeriods === "string" ? JSON.parse((branch as any).mondayPeriods) : (branch as any).mondayPeriods) : undefined,
          tuesdayIsOff: (branch as any).tuesdayIsOff ?? false,
          tuesdayOpen: (branch as any).tuesdayOpen || "",
          tuesdayClose: (branch as any).tuesdayClose || "",
          tuesdayPeriods: (branch as any).tuesdayPeriods ? (typeof (branch as any).tuesdayPeriods === "string" ? JSON.parse((branch as any).tuesdayPeriods) : (branch as any).tuesdayPeriods) : undefined,
          wednesdayIsOff: (branch as any).wednesdayIsOff ?? false,
          wednesdayOpen: (branch as any).wednesdayOpen || "",
          wednesdayClose: (branch as any).wednesdayClose || "",
          wednesdayPeriods: (branch as any).wednesdayPeriods ? (typeof (branch as any).wednesdayPeriods === "string" ? JSON.parse((branch as any).wednesdayPeriods) : (branch as any).wednesdayPeriods) : undefined,
          thursdayIsOff: (branch as any).thursdayIsOff ?? false,
          thursdayOpen: (branch as any).thursdayOpen || "",
          thursdayClose: (branch as any).thursdayClose || "",
          thursdayPeriods: (branch as any).thursdayPeriods ? (typeof (branch as any).thursdayPeriods === "string" ? JSON.parse((branch as any).thursdayPeriods) : (branch as any).thursdayPeriods) : undefined,
          fridayIsOff: (branch as any).fridayIsOff ?? false,
          fridayOpen: (branch as any).fridayOpen || "",
          fridayClose: (branch as any).fridayClose || "",
          fridayPeriods: (branch as any).fridayPeriods ? (typeof (branch as any).fridayPeriods === "string" ? JSON.parse((branch as any).fridayPeriods) : (branch as any).fridayPeriods) : undefined,
          saturdayIsOff: (branch as any).saturdayIsOff ?? false,
          saturdayOpen: (branch as any).saturdayOpen || "",
          saturdayClose: (branch as any).saturdayClose || "",
          saturdayPeriods: (branch as any).saturdayPeriods ? (typeof (branch as any).saturdayPeriods === "string" ? JSON.parse((branch as any).saturdayPeriods) : (branch as any).saturdayPeriods) : undefined,
          sundayIsOff: (branch as any).sundayIsOff ?? false,
          sundayOpen: (branch as any).sundayOpen || "",
          sundayClose: (branch as any).sundayClose || "",
          sundayPeriods: (branch as any).sundayPeriods ? (typeof (branch as any).sundayPeriods === "string" ? JSON.parse((branch as any).sundayPeriods) : (branch as any).sundayPeriods) : undefined,
          facebookUrl: (branch as any).facebookUrl || "",
          instagramUrl: (branch as any).instagramUrl || "",
          twitterUrl: (branch as any).twitterUrl || "",
          websiteUrl: (branch as any).websiteUrl || "",
          appStatus: (branch as any).appStatus || "LIVE",
        };

        const onlineAllowed = (branch as any)?.organization?.onlinePaymentsAllowed !== false;
        const cardAllowed = (branch as any)?.organization?.cardPaymentsAllowed !== false;
        const paypalAllowed = (branch as any)?.organization?.paypalAllowed !== false;
        if (!onlineAllowed) {
          nextForm.acceptOnlinePayment = false;
          nextForm.acceptCard = false;
          nextForm.acceptPayPal = false;
          nextForm.pickupAcceptOnlinePayment = false;
          nextForm.pickupAcceptCard = false;
          nextForm.pickupAcceptPayPal = false;
        } else {
          if (!cardAllowed) {
            nextForm.acceptCard = false;
            nextForm.pickupAcceptCard = false;
          }
          if (!paypalAllowed) {
            nextForm.acceptPayPal = false;
            nextForm.pickupAcceptPayPal = false;
          }
        }

        setForm(nextForm);

        if ((branch as any).country) {
          googlePlacesService.checkCountryHasStates(
            (branch as any).country,
            (hasStates) => {
              setCountryHasStates(hasStates);
            }
          );
        }
      } catch (error) {
        console.error("Failed to load branch", error);
        toast.error(t("admin.branchManagement.create.loadError"));
        navigate("/admin/branches");
      } finally {
        setLoadingBranch(false);
      }
    };

    loadBranch();
  }, [getToken, id, isEditMode, isSuperAdmin, navigate, t, loadOrganizationServiceType]);

  const getBranchImageSrc = useCallback((val?: string | null) => {
    if (!val) return "";
    const trimmed = String(val).trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("blob:") || isExternalImage(trimmed)) return trimmed;
    if (trimmed.startsWith("/uploads/images/")) return trimmed;
    return getOptimizedImageUrl(trimmed);
  }, []);

  const handleUploadBranchImage = useCallback(async (): Promise<boolean> => {
    if (!branchImageFile) return false;

    try {
      const token = (await getToken()) || undefined;
      if (!token) return false;

      setUploadingBranchImage(true);
      const { filename } = await branchService.uploadImage(branchImageFile, token);
      handleChange("branchImage", filename);

      if (isEditMode && id) {
        await branchService.updateBranch(id, { branchImage: filename } as any, token);
      }

      setBranchImageFile(null);
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload branch image");
      return false;
    } finally {
      setUploadingBranchImage(false);
    }
  }, [branchImageFile, getToken, handleChange, id, isEditMode]);

  const handleBranchImageFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      // Reset input value
      e.target.value = "";
      return;
    }

    setBranchImageFile(file);
  }, []);

  useEffect(() => {
    if (!branchImageFile) {
      setBranchImagePreviewUrl("");
      return;
    }

    const next = URL.createObjectURL(branchImageFile);
    setBranchImagePreviewUrl(next);
    
    return () => {
      try {
        if (next) {
          URL.revokeObjectURL(next);
        }
      } catch {
        // ignore
      }
    };
  }, [branchImageFile]);

  const applyAddressComponents = useCallback((components: AddressComponents) => {
    setForm((prev) => ({
      ...prev,
      country: components.country || prev.country,
      state: components.state || prev.state,
      city: components.city || prev.city,
      address: components.addressLineOne || prev.address,
      zipCode: components.zipCode || prev.zipCode,
      latitude:
        components.latitude !== undefined
          ? String(components.latitude)
          : prev.latitude,
      longitude:
        components.longitude !== undefined
          ? String(components.longitude)
          : prev.longitude,
      businessAddress: components.formattedAddress || prev.businessAddress,
    }));
    setAddressInput(components.addressLineOne || components.formattedAddress || "");
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);

    // Check if the country has states when address is set via GPS
    if (googleLoaded && components.country) {
      googlePlacesService.checkCountryHasStates(
        components.country,
        (hasStates) => {
          setCountryHasStates(hasStates);
        }
      );
    }
  }, [googleLoaded]);

  const getCurrentLocation = useCallback(() => {
    if (!googleLoaded) return;
    setGettingLocation(true);
    googlePlacesService.getCurrentLocation(
      (components) => {
        setGettingLocation(false);
        applyAddressComponents(components);
      },
      () => setGettingLocation(false)
    );
  }, [googleLoaded, applyAddressComponents]);

  const geocodeAddress = useCallback(
    (address: string) => {
      if (!googleLoaded || !address) return;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results: any, status: string) => {
        if (status === "OK" && results && results[0]) {
          const res = results[0];
          const comps = res.address_components || [];
          const find = (type: string) =>
            comps.find((c: any) => c.types?.includes(type))?.long_name || "";
          const loc = res.geometry?.location;
          const latitude =
            typeof loc?.lat === "function" ? loc.lat() : loc?.lat ?? undefined;
          const longitude =
            typeof loc?.lng === "function" ? loc.lng() : loc?.lng ?? undefined;
          applyAddressComponents({
            country: find("country"),
            state:
              find("administrative_area_level_1") ||
              find("administrative_area_level_2"),
            city: find("locality") || find("sublocality") || find("postal_town"),
            addressLineOne: res.formatted_address || address,
            zipCode: find("postal_code"),
            latitude,
            longitude,
            formattedAddress: res.formatted_address || address,
          });
          // Also update businessAddress directly
          handleChange("businessAddress", res.formatted_address || address);
        }
      });
    },
    [googleLoaded, applyAddressComponents]
  );

  // Reverse geocode when latitude and longitude are manually entered
  useEffect(() => {
    const lat = form.latitude;
    const lng = form.longitude;

    // Check if both lat and lng are provided and are valid numbers
    if (
      googleLoaded &&
      lat !== undefined &&
      lat !== null &&
      lat !== "" &&
      lng !== undefined &&
      lng !== null &&
      lng !== ""
    ) {
      const latNum = typeof lat === "string" ? parseFloat(lat) : lat;
      const lngNum = typeof lng === "string" ? parseFloat(lng) : lng;

      // Validate they are numbers and within valid ranges
      if (
        !isNaN(latNum) &&
        !isNaN(lngNum) &&
        latNum >= -90 &&
        latNum <= 90 &&
        lngNum >= -180 &&
        lngNum <= 180
      ) {
        // Debounce to avoid too many API calls
        const timeoutId = setTimeout(() => {
          setReverseGeocoding(true);
          googlePlacesService.reverseGeocode(
            latNum,
            lngNum,
            (components) => {
              setReverseGeocoding(false);
              applyAddressComponents(components);
            },
            () => {
              setReverseGeocoding(false);
            }
          );
        }, 1000); // Wait 1 second after user stops typing

        return () => clearTimeout(timeoutId);
      }
    }
  }, [googleLoaded, form.latitude, form.longitude, applyAddressComponents]);

  const handleAddressInputChange = useCallback((value: string) => {
    setAddressInput(value);
    handleChange("address", value);

    // Search addresses if city is selected
    if (
      value.length >= 1 &&
      googleLoaded &&
      form.country &&
      form.city
    ) {
      setShowAddressSuggestions(true);
      googlePlacesService.searchAddresses(
        value,
        form.country,
        form.city,
        form.state || undefined,
        (addresses) => {
          setAddressSuggestions(addresses);
        },
        (loading) => {
          setAddressLoading(loading);
        }
      );
    } else {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLoading(false);
    }
  }, [googleLoaded, form.country, form.city, form.state]);

  const handleAddressSelect = (addr: string) => {
    setAddressInput(addr);
    setShowAddressSuggestions(false);
    setAddressSuggestions([]);
    geocodeAddress(addr);
    // Update businessAddress when address is selected
    handleChange("businessAddress", addr);
  };

  const handleCountryInputChange = useCallback((value: string) => {
    handleChange("country", value);

    // Check if country has states when user types a complete country name
    if (value.length >= 3 && googleLoaded) {
      // Check if it might be a complete country name (no active search)
      const trimmedValue = value.trim();
      if (
        trimmedValue.length > 2 &&
        trimmedValue.split(" ").length <= 3 &&
        !showCountrySuggestions
      ) {
        googlePlacesService.checkCountryHasStates(
          trimmedValue,
          (hasStates) => {
            setCountryHasStates(hasStates);
          }
        );
      }
    }

    if (value.length >= 2 && googleLoaded) {
    setShowCountrySuggestions(true);
      googlePlacesService.searchCountries(
        value,
        (countries) => {
          setCountrySuggestions(countries);
          // If suggestions match exactly, check for states
          const trimmedValue = value.trim();
          const exactMatch = countries.find(
            (c) => c.toLowerCase() === trimmedValue.toLowerCase()
          );
          if (exactMatch && googleLoaded) {
            googlePlacesService.checkCountryHasStates(
              exactMatch,
              (hasStates) => {
                setCountryHasStates(hasStates);
              }
            );
          }
        },
        (loading) => setCountryLoading(loading)
      );
    } else {
      setCountrySuggestions([]);
      setShowCountrySuggestions(false);
      setCountryLoading(false);
    }
  }, [googleLoaded, showCountrySuggestions]);

  const handleCountrySelect = useCallback((country: string) => {
    handleChange("country", country);
    // Clear state when country changes
    handleChange("state", "");
    setCountrySuggestions([]);
    setShowCountrySuggestions(false);
    setCountryLoading(false);
    setStateSuggestions([]);
    setShowStateSuggestions(false);

    // Check if the selected country has states
    if (googleLoaded && country) {
      googlePlacesService.checkCountryHasStates(country, (hasStates) => {
        setCountryHasStates(hasStates);
      });
    } else {
      // Default to showing state field if Google not loaded
      setCountryHasStates(true);
    }
  }, [googleLoaded]);

  const handleStateInputChange = useCallback((value: string) => {
    handleChange("state", value);

    // Only search if country is selected and country has states
    if (
      value.length >= 1 &&
      googleLoaded &&
      form.country &&
      countryHasStates
    ) {
    setShowStateSuggestions(true);
      googlePlacesService.searchStates(
        value,
        form.country,
        (states) => {
          setStateSuggestions(states);
        },
        (loading) => {
          setStateLoading(loading);
        }
      );
    } else {
      setStateSuggestions([]);
      setShowStateSuggestions(false);
      setStateLoading(false);
    }
  }, [googleLoaded, form.country, countryHasStates]);

  const handleStateSelect = useCallback((state: string) => {
    handleChange("state", state);
    // Clear city when state changes
    handleChange("city", "");
    setStateSuggestions([]);
    setShowStateSuggestions(false);
    setStateLoading(false);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
  }, []);

  const handleCityInputChange = useCallback((value: string) => {
    handleChange("city", value);

    // Search cities if country is selected
    if (value.length >= 1 && googleLoaded && form.country) {
    setShowCitySuggestions(true);
      googlePlacesService.searchCities(
        value,
        form.country,
        (cities) => {
          setCitySuggestions(cities);
        },
        form.state || undefined, // Use state if available
        (loading) => {
          setCityLoading(loading);
        }
      );
    } else {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      setCityLoading(false);
    }
    // Clear address suggestions when city changes
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }, [googleLoaded, form.country, form.state]);

  const handleCitySelect = useCallback((city: string) => {
    handleChange("city", city);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    setCityLoading(false);
    // Clear address suggestions when city changes
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t("admin.branchManagement.create.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const payload: Partial<Branch> = {
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        isActive: form.isActive,
        branchImage: form.branchImage?.trim() || null,
        serviceType: form.serviceType ?? null,
        ...(form.timezone?.trim() ? { timezone: form.timezone.trim() } : { timezone: null }),
        businessEmail: form.businessEmail?.trim() || undefined,
        businessPhone: form.businessPhone?.trim() || undefined,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        state: form.state?.trim() || undefined,
        country: form.country?.trim() || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        businessAddress: form.businessAddress?.trim() || undefined,
        ...(form.zipCode ? { zipCode: form.zipCode } : {}),
        ...(form.deliveryRadius === null
          ? { deliveryRadius: null }
          : form.deliveryRadius
          ? { deliveryRadius: Number(form.deliveryRadius) }
          : {}),
        ...(form.deliveryFee === null
          ? { deliveryFee: null }
          : form.deliveryFee
          ? { deliveryFee: Number(form.deliveryFee) }
          : {}),
        ...(form.deliveryRatePerKilometer
          ? { deliveryRatePerKilometer: Number(form.deliveryRatePerKilometer) }
          : {}),
        useDynamicDeliveryFee: form.useDynamicDeliveryFee,
        useTieredDeliveryFee: form.useTieredDeliveryFee,
        ...(form.initialDeliveryRange
          ? { initialDeliveryRange: Number(form.initialDeliveryRange) }
          : {}),
        ...(form.initialDeliveryPrice
          ? { initialDeliveryPrice: Number(form.initialDeliveryPrice) }
          : {}),
        ...(form.extendedDeliveryThreshold
          ? { extendedDeliveryThreshold: Number(form.extendedDeliveryThreshold) }
          : {}),
        ...(form.extendedDeliveryRate
          ? { extendedDeliveryRate: Number(form.extendedDeliveryRate) }
          : {}),
        ...(form.deliveryTimeEstimate
          ? { deliveryTimeEstimate: Number(form.deliveryTimeEstimate) }
          : {}),
        enableFreeDelivery: form.enableFreeDelivery,
        ...(form.freeDeliveryThreshold
          ? { freeDeliveryThreshold: Number(form.freeDeliveryThreshold) }
          : {}),
        ...(form.taxPercentage
          ? { taxPercentage: Number(form.taxPercentage) }
          : {}),
        ...(form.serviceTaxPercentage
          ? { serviceTaxPercentage: Number(form.serviceTaxPercentage) }
          : {}),
        ...(form.deliveryTaxPercentage
          ? { deliveryTaxPercentage: Number(form.deliveryTaxPercentage) }
          : {}),
        enableMinimumOrder: form.enableMinimumOrder,
        ...(form.minimumOrderAmount
          ? { minimumOrderAmount: Number(form.minimumOrderAmount) }
          : {}),
        currency: form.currency?.trim() || undefined,
        taxInclusive: form.taxInclusive,
        ...(form.orderPreparationTime
          ? { orderPreparationTime: Number(form.orderPreparationTime) }
          : {}),
        ...(form.maxOrderQuantity
          ? { maxOrderQuantity: Number(form.maxOrderQuantity) }
          : {}),
        allowExcludeOptionalIngredients: form.allowExcludeOptionalIngredients,
        ...(form.orderMergeTimeframeMinutes !== "" && form.orderMergeTimeframeMinutes !== undefined
          ? { orderMergeTimeframeMinutes: Number(form.orderMergeTimeframeMinutes) }
          : { orderMergeTimeframeMinutes: null }), // null means inherit from global
        pickupEnabled: form.pickupEnabled,
        deliveryEnabled: form.deliveryEnabled,
        // Future order settings (null = inherit from global)
        futureOrdersEnabled: form.futureOrdersEnabled,
        enableFuturePickupOrders: form.enableFuturePickupOrders,
        futurePickupOrderDays: form.futurePickupOrderDays,
        enableFutureDeliveryOrders: form.enableFutureDeliveryOrders,
        futureDeliveryOrderDays: form.futureDeliveryOrderDays,
        // Scheduled order merge settings (null = inherit from global)
        allowScheduledOrderMerge: form.allowScheduledOrderMerge,
        scheduledOrderMergeCutoffHours: form.scheduledOrderMergeCutoffHours,

        // Scheduled order management settings (null = inherit from global)
        scheduledOrderAllowCancellation: form.scheduledOrderAllowCancellation,
        scheduledOrderCancellationWindowHours: form.scheduledOrderCancellationWindowHours,
        scheduledOrderFullRefundHoursBefore: form.scheduledOrderFullRefundHoursBefore,
        scheduledOrderPartialRefundHoursBefore: form.scheduledOrderPartialRefundHoursBefore,
        scheduledOrderNoRefundHoursBefore: form.scheduledOrderNoRefundHoursBefore,
        scheduledOrderPartialRefundPercentage: form.scheduledOrderPartialRefundPercentage,
        scheduledOrderReducedRefundPercentage: form.scheduledOrderReducedRefundPercentage,
        scheduledOrderAllowModification: form.scheduledOrderAllowModification,
        scheduledOrderModificationWindowHours: form.scheduledOrderModificationWindowHours,
        scheduledOrderAllowShallowModification: (form as any).scheduledOrderAllowShallowModification,
        scheduledOrderAutoConfirm: (form as any).scheduledOrderAutoConfirm,
        scheduledOrderMinimumAmount: (form as any).scheduledOrderMinimumAmount,
        scheduledOrderTimeSlotInterval: form.scheduledOrderTimeSlotInterval,
        scheduledOrderMaxOrdersPerSlot: form.scheduledOrderMaxOrdersPerSlot,
        acceptCash: form.acceptCash,
        acceptCard: form.acceptCard,
        acceptOnlinePayment: form.acceptOnlinePayment,
        acceptPayPal: form.acceptPayPal,
        pickupAcceptCash: form.pickupAcceptCash,
        pickupAcceptCard: form.pickupAcceptCard,
        pickupAcceptOnlinePayment: form.pickupAcceptOnlinePayment,
        pickupAcceptPayPal: form.pickupAcceptPayPal,
        pickupTakeawayServiceFee:
          form.pickupTakeawayServiceFee === null ||
          form.pickupTakeawayServiceFee === undefined
            ? null
            : Number(form.pickupTakeawayServiceFee),
        allowOrdersOutsideHours: form.allowOrdersOutsideHours,
        mondayIsOff: form.mondayIsOff,
        mondayOpen: form.mondayOpen?.trim() || undefined,
        mondayClose: form.mondayClose?.trim() || undefined,
        mondayPeriods: form.mondayPeriods || undefined,
        tuesdayIsOff: form.tuesdayIsOff,
        tuesdayOpen: form.tuesdayOpen?.trim() || undefined,
        tuesdayClose: form.tuesdayClose?.trim() || undefined,
        tuesdayPeriods: form.tuesdayPeriods || undefined,
        wednesdayIsOff: form.wednesdayIsOff,
        wednesdayOpen: form.wednesdayOpen?.trim() || undefined,
        wednesdayClose: form.wednesdayClose?.trim() || undefined,
        wednesdayPeriods: form.wednesdayPeriods || undefined,
        thursdayIsOff: form.thursdayIsOff,
        thursdayOpen: form.thursdayOpen?.trim() || undefined,
        thursdayClose: form.thursdayClose?.trim() || undefined,
        thursdayPeriods: form.thursdayPeriods || undefined,
        fridayIsOff: form.fridayIsOff,
        fridayOpen: form.fridayOpen?.trim() || undefined,
        fridayClose: form.fridayClose?.trim() || undefined,
        fridayPeriods: form.fridayPeriods || undefined,
        saturdayIsOff: form.saturdayIsOff,
        saturdayOpen: form.saturdayOpen?.trim() || undefined,
        saturdayClose: form.saturdayClose?.trim() || undefined,
        saturdayPeriods: form.saturdayPeriods || undefined,
        sundayIsOff: form.sundayIsOff,
        sundayOpen: form.sundayOpen?.trim() || undefined,
        sundayClose: form.sundayClose?.trim() || undefined,
        sundayPeriods: form.sundayPeriods || undefined,
        facebookUrl: form.facebookUrl?.trim() || undefined,
        instagramUrl: form.instagramUrl?.trim() || undefined,
        twitterUrl: form.twitterUrl?.trim() || undefined,
        websiteUrl: form.websiteUrl?.trim() || undefined,
        appStatus: form.appStatus as any,
      } as any;

      if (isEditMode && id) {
        await branchService.updateBranch(id, payload, token || undefined);
        toast.success(t("admin.branchManagement.create.updateSuccess"));
      } else {
      await branchService.createBranch(payload, token || undefined);
      toast.success(t("admin.branchManagement.create.saveSuccess"));
      }
      navigate("/admin/branches");
    } catch (error) {
      console.error("Failed to create branch", error);
      toast.error(t("admin.branchManagement.create.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-pink-500">
            {isEditMode
              ? `Settings - ${form.name || t("admin.branchManagement.create.editTitle")}`
              : t("admin.branchManagement.create.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEditMode ? t("admin.branchManagement.create.editDescription") : t("admin.branchManagement.create.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/admin/branches")}
            className="border border-border text-foreground hover:bg-muted/60"
          >
            {t("admin.branchManagement.create.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            className="bg-pink-500 hover:bg-pink-600 text-white"
            disabled={saving || loadingBranch}
          >
            {(saving || loadingBranch) && <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />}
            {isEditMode ? t("admin.branchManagement.create.update") : t("admin.branchManagement.create.save")}
          </Button>
        </div>
      </div>

      {/* Business (includes location + contact to mirror settings) */}
      <CollapsibleCard
        icon={<Icon path={mdiOfficeBuilding} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.businessInformation.title")}
        description={t("admin.branchManagement.create.businessInformation.description")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.code")}</Label>
              <Input
                value={form.code}
                onChange={(e) => handleChange("code", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.codePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.serviceType.label")}</Label>
              <Select
                value={(form.serviceType === null ? "USE_SETTINGS" : (form.serviceType || "USE_SETTINGS")) as any}
                onValueChange={(value) =>
                  handleChange(
                    "serviceType",
                    value === "USE_SETTINGS" ? null : (value as any)
                  )
                }
              >
                <SelectTrigger className="w-full bg-transparent">
                  <SelectValue placeholder={t("admin.serviceType.useSettingsShort")} />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="USE_SETTINGS">
                    {t("admin.serviceType.useSettings", {
                      value:
                        globalServiceType === "RESTAURANT"
                          ? t("admin.serviceType.restaurant")
                          : globalServiceType === "MEAT_SHOP"
                          ? t("admin.serviceType.meatShop")
                          : globalServiceType === "BAKERY"
                          ? t("admin.serviceType.bakery")
                          : t("admin.serviceType.foodTruck"),
                    })}
                  </SelectItem>
                  <SelectItem value="RESTAURANT">{t("admin.serviceType.restaurant")}</SelectItem>
                  <SelectItem value="MEAT_SHOP">{t("admin.serviceType.meatShop")}</SelectItem>
                  <SelectItem value="BAKERY">{t("admin.serviceType.bakery")}</SelectItem>
                  <SelectItem value="FOOD_TRUCK">{t("admin.serviceType.foodTruck")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.timezone")}</Label>
              <div className="flex gap-2">
                <Input
                  value={form.timezone || ""}
                  onChange={(e) => handleChange("timezone", e.target.value)}
                  placeholder={t("admin.branchManagement.create.businessInformation.timezonePlaceholder")}
                  list="branch-timezone-options"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="border border-border text-foreground hover:bg-muted/60"
                  onClick={() => {
                    try {
                      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                      if (tz) {
                        handleChange("timezone", tz);
                      }
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {t("admin.branchManagement.create.businessInformation.useBrowserTimezone")}
                </Button>
              </div>
              <datalist id="branch-timezone-options">
                {commonTimeZones.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.businessInformation.timezoneHelper")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.branchImage")}</Label>
              <div className="space-y-3">
                {branchImagePreviewUrl || getBranchImageSrc(form.branchImage as any) ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-700 bg-neutral-900/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-16 w-16 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 shrink-0">
                        <img
                          src={branchImagePreviewUrl || getBranchImageSrc(form.branchImage as any)}
                          alt="Branch"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">
                          {branchImageFile?.name || t("admin.branchManagement.create.businessInformation.branchImage")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBranchImageFile(null);
                          handleChange("branchImage", "");
                          if (branchImageInputRef.current) {
                            branchImageInputRef.current.value = "";
                          }

                          if (isEditMode && id) {
                            void (async () => {
                              try {
                                const token = (await getToken()) || undefined;
                                if (!token) return;
                                await branchService.updateBranch(id, { branchImage: null } as any, token);
                              } catch (e: any) {
                                toast.error(e?.message || "Failed to remove branch image");
                              }
                            })();
                          }
                        }}
                        disabled={uploadingBranchImage}
                        className="gap-2"
                      >
                        <Icon path={mdiDelete} size={0.67} />
                        {t("admin.branchManagement.create.businessInformation.branchImageRemove")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {branchImageFile ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleUploadBranchImage}
                          disabled={uploadingBranchImage}
                          className="gap-2 bg-transparent"
                        >
                          {uploadingBranchImage ? (
                            <Icon
                              path={mdiRefresh}
                              size={0.67}
                              className="animate-spin"
                            />
                          ) : null}
                          {t("admin.branchManagement.create.businessInformation.branchImageUpload")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setBranchImageFile(null);
                            if (branchImageInputRef.current) {
                              branchImageInputRef.current.value = "";
                            }
                          }}
                          disabled={uploadingBranchImage}
                          className="bg-transparent"
                        >
                          {t("admin.branchManagement.create.businessInformation.branchImageCancel")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => branchImageInputRef.current?.click()}
                        disabled={uploadingBranchImage}
                        className="flex-1 border-border bg-card hover:bg-muted"
                      >
                        {t("admin.branchManagement.create.businessInformation.branchImageSelect")}
                      </Button>
                    )}
                  </div>

                  <input
                    ref={branchImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    key="branch-image-input"
                    onChange={handleBranchImageFileChange}
                    disabled={uploadingBranchImage}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.businessEmail")}</Label>
              <Input
                value={form.businessEmail}
                onChange={(e) => handleChange("businessEmail", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.businessEmailPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.businessPhone")}</Label>
              <Input
                value={form.businessPhone}
                onChange={(e) => handleChange("businessPhone", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.businessPhonePlaceholder")}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  handleChange("isActive", checked)
                }
              />
              <Label>{t("admin.branchManagement.create.businessInformation.active")}</Label>
            </div>
          </div>
          <div className="space-y-4 pt-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <Label className="text-base font-semibold">{t("admin.branchManagement.create.businessInformation.branchAddress")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={getCurrentLocation}
                disabled={!googleLoaded || gettingLocation}
                className="gap-2 bg-transparent"
              >
                {gettingLocation ? (
                  <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                ) : (
                  <Icon path={mdiNavigation} size={0.67} />
                )}
                {t("admin.branchManagement.create.businessInformation.useGPS")}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.country")}</Label>
              <div className="relative">
                <Input
                  value={form.country}
                  onChange={(e) => handleCountryInputChange(e.target.value)}
                    onFocus={() => {
                      if (form.country && form.country.length >= 2) {
                        setShowCountrySuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => {
                        setShowCountrySuggestions(false);
                      }, 200);
                    }}
                  placeholder={t("admin.branchManagement.create.businessInformation.countryPlaceholder")}
                  disabled={!googleLoaded}
                />
                {showCountrySuggestions && countrySuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <div className="max-h-60 overflow-y-auto">
                      {countrySuggestions.map((c) => (
                        <button
                          type="button"
                          key={c}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                          onClick={() => handleCountrySelect(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showCountrySuggestions && countryLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon path={mdiLoading} size={0.67} className="animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

              {countryHasStates && (
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.stateProvince")}</Label>
              <div className="relative">
                <Input
                  value={form.state}
                  onChange={(e) => handleStateInputChange(e.target.value)}
                      onFocus={() => {
                        if (form.state && form.state.length >= 1) {
                          setShowStateSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => {
                          setShowStateSuggestions(false);
                        }, 200);
                      }}
                  placeholder={t("admin.branchManagement.create.businessInformation.stateProvincePlaceholder")}
                  disabled={!googleLoaded || !form.country}
                />
                {showStateSuggestions && stateSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <div className="max-h-60 overflow-y-auto">
                      {stateSuggestions.map((s) => (
                        <button
                          type="button"
                          key={s}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                          onClick={() => handleStateSelect(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showStateSuggestions && stateLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon path={mdiLoading} size={0.67} className="animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
              )}

            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.city")}</Label>
              <div className="relative">
                <Input
                  value={form.city}
                  onChange={(e) => handleCityInputChange(e.target.value)}
                    onFocus={() => {
                      if (form.city && form.city.length >= 1) {
                        setShowCitySuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => {
                        setShowCitySuggestions(false);
                      }, 200);
                    }}
                  placeholder={t("admin.branchManagement.create.businessInformation.cityPlaceholder")}
                  disabled={!googleLoaded || !form.country}
                />
                {showCitySuggestions && citySuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <div className="max-h-60 overflow-y-auto">
                      {citySuggestions.map((c) => (
                        <button
                          type="button"
                          key={c}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                          onClick={() => handleCitySelect(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showCitySuggestions && cityLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon path={mdiLoading} size={0.67} className="animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

              <div className="space-y-2">
                <Label>{t("admin.branchManagement.create.businessInformation.address")}</Label>
                <div className="relative">
                <Input
                  value={addressInput}
                  onChange={(e) => handleAddressInputChange(e.target.value)}
                    onFocus={() => {
                      if (
                        addressInput &&
                        addressInput.length >= 1 &&
                        form.country &&
                        form.city
                      ) {
                        setShowAddressSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => {
                        setShowAddressSuggestions(false);
                      }, 200);
                    }}
                  placeholder={t("admin.branchManagement.create.businessInformation.addressPlaceholder")}
                    disabled={!googleLoaded || !form.city || !form.country}
                />
                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <div className="max-h-60 overflow-y-auto">
                      {addressSuggestions.map((addr) => (
                        <button
                          type="button"
                          key={addr}
                          className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                          onClick={() => handleAddressSelect(addr)}
                        >
                          {addr}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showAddressSuggestions && addressLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon path={mdiLoading} size={0.67} className="animate-spin text-muted-foreground" />
                  </div>
                )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.zipPostal")}</Label>
              <Input
                value={form.zipCode}
                onChange={(e) => handleChange("zipCode", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.zipPostalPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.latitude")}</Label>
              <div className="relative">
              <Input
                value={form.latitude}
                onChange={(e) => handleChange("latitude", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.latitudePlaceholder")}
                  type="number"
                  step="any"
                />
                {reverseGeocoding && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.branchManagement.create.businessInformation.longitude")}</Label>
              <div className="relative">
              <Input
                value={form.longitude}
                onChange={(e) => handleChange("longitude", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.longitudePlaceholder")}
                  type="number"
                  step="any"
              />
                {reverseGeocoding && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
            </div>
                )}
            </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("admin.branchManagement.create.businessInformation.fullAddress")}</Label>
              <Textarea
                value={form.businessAddress || ""}
                onChange={(e) => handleChange("businessAddress", e.target.value)}
                placeholder={t("admin.branchManagement.create.businessInformation.fullAddressPlaceholder")}
                rows={2}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Financial */}
      <CollapsibleCard
        icon={<Icon path={mdiCurrencyUsd} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.financialSettings.title")}
        description={t("admin.branchManagement.create.financialSettings.description")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxPercentage">{t("admin.branchManagement.create.financialSettings.taxPercentage")}</Label>
              <NumberInput
                id="taxPercentage"
                value={form.taxPercentage ? Number(form.taxPercentage) : 0}
                onChange={(value) =>
                  handleChange("taxPercentage", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                max={100}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceTaxPercentage">{t("admin.branchManagement.create.financialSettings.serviceTaxPercentage")}</Label>
              <NumberInput
                id="serviceTaxPercentage"
                value={form.serviceTaxPercentage ? Number(form.serviceTaxPercentage) : 0}
                onChange={(value) =>
                  handleChange("serviceTaxPercentage", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                max={100}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryTaxPercentage">{t("admin.branchManagement.create.financialSettings.deliveryTaxPercentage")}</Label>
              <NumberInput
                id="deliveryTaxPercentage"
                value={form.deliveryTaxPercentage ? Number(form.deliveryTaxPercentage) : 0}
                onChange={(value) =>
                  handleChange("deliveryTaxPercentage", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                max={100}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryFee">{t("admin.branchManagement.create.financialSettings.deliveryFee")}</Label>
              <NumberInput
                id="deliveryFee"
                value={form.deliveryFee ? Number(form.deliveryFee) : 0}
                onChange={(value) =>
                  handleChange("deliveryFee", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                placeholder="0.00"
              />
            </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
              id="taxInclusive"
              checked={form.taxInclusive || false}
              onCheckedChange={(checked: boolean) =>
                handleChange("taxInclusive", checked)
                }
              />
            <Label htmlFor="taxInclusive">{t("admin.branchManagement.create.financialSettings.taxInclusive")}</Label>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">
                {t("admin.branchManagement.create.financialSettings.asapMinimumOrderTitle")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.financialSettings.asapMinimumOrderDescription")}
              </div>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minimumOrderAmount">{t("admin.branchManagement.create.financialSettings.minimumOrderAmount")}</Label>
              <NumberInput
                id="minimumOrderAmount"
                value={
                  form.minimumOrderAmount !== undefined && form.minimumOrderAmount !== ""
                    ? Number(form.minimumOrderAmount)
                    : undefined
                }
                onChange={(value) =>
                  handleChange("minimumOrderAmount", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                placeholder={t("admin.branchManagement.create.financialSettings.minimumOrderAmountPlaceholder")}
                disabled={false}
              />
            <div className="flex items-center space-x-2">
              <Switch
                  id="enableMinimumOrder"
                  checked={form.enableMinimumOrder || false}
                  onCheckedChange={(checked: boolean) =>
                    handleChange("enableMinimumOrder", checked)
                }
              />
                <Label htmlFor="enableMinimumOrder">{t("admin.branchManagement.create.financialSettings.enableMinimumOrder")}</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">{t("admin.branchManagement.create.financialSettings.currency")}</Label>
              <Select
                value={form.currency || "USD"}
                onValueChange={(value: string) =>
                  handleChange("currency", value)
                }
              >
                <SelectTrigger id="currency" className="w-full bg-transparent">
                  <SelectValue placeholder={t("admin.branchManagement.create.financialSettings.selectCurrency")} />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">Euro</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Order Settings */}
      <CollapsibleCard
        icon={<Icon path={mdiCart} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.orderSettings.title")}
        description={t("admin.branchManagement.create.orderSettings.description")}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {t("admin.branchManagement.create.orderSettings.pickupEnabled")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {form.pickupEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")
                    : t("admin.branchManagement.create.orderSettings.overriding")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleChange(
                      "pickupEnabled",
                      form.pickupEnabled === null ? false : null
                    )
                  }
                >
                  {form.pickupEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.override")
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal")}
                </Button>
              </div>
            </div>
            {form.pickupEnabled !== null && (
              <div className="flex items-center gap-2">
                <Switch
                  id="pickupEnabled"
                  checked={!!form.pickupEnabled}
                  onCheckedChange={(checked: boolean) =>
                    handleChange("pickupEnabled", checked)
                  }
                />
                <Label htmlFor="pickupEnabled">
                  {t("admin.branchManagement.create.orderSettings.pickupEnabled")}
                </Label>
              </div>
            )}
            {form.pickupEnabled === null && (
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")}: {globalPickupEnabled ? t("common.active") : t("common.inactive")}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {t("admin.branchManagement.create.orderSettings.deliveryEnabled")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {form.deliveryEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")
                    : t("admin.branchManagement.create.orderSettings.overriding")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleChange(
                      "deliveryEnabled",
                      form.deliveryEnabled === null ? false : null
                    )
                  }
                >
                  {form.deliveryEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.override")
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal")}
                </Button>
              </div>
            </div>
            {form.deliveryEnabled !== null && (
              <div className="flex items-center gap-2">
                <Switch
                  id="deliveryEnabled"
                  checked={!!form.deliveryEnabled}
                  onCheckedChange={(checked: boolean) =>
                    handleChange("deliveryEnabled", checked)
                  }
                />
                <Label htmlFor="deliveryEnabled">
                  {t("admin.branchManagement.create.orderSettings.deliveryEnabled")}
                </Label>
              </div>
            )}
            {form.deliveryEnabled === null && (
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")}: {globalDeliveryEnabled ? t("common.active") : t("common.inactive")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderPreparationTime">{t("admin.branchManagement.create.orderSettings.prepTime")}</Label>
              <NumberInput
                id="orderPreparationTime"
                value={form.orderPreparationTime ? Number(form.orderPreparationTime) : 30}
                onChange={(value) =>
                  handleChange("orderPreparationTime", value !== undefined ? String(value) : "")
                }
                allowDecimals={false}
                min={1}
                placeholder="30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxOrderQuantity">{t("admin.branchManagement.create.orderSettings.maxOrderQuantity")}</Label>
              <NumberInput
                id="maxOrderQuantity"
                value={form.maxOrderQuantity ? Number(form.maxOrderQuantity) : 10}
                onChange={(value) =>
                  handleChange("maxOrderQuantity", value !== undefined ? String(value) : "")
                }
                allowDecimals={false}
                min={1}
                placeholder="10"
              />
            </div>
            </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5 flex-1 pr-4">
              <Label htmlFor="allowExcludeOptionalIngredients" className="text-sm font-medium">
                {t("admin.branchManagement.create.orderSettings.allowExcludeOptionalIngredients")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.allowExcludingOptionalIngredientsDescription")}
              </p>
            </div>
              <Switch
              id="allowExcludeOptionalIngredients"
              checked={form.allowExcludeOptionalIngredients !== false}
              onCheckedChange={(checked: boolean) =>
                  handleChange("allowExcludeOptionalIngredients", checked)
                }
              />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="orderMergeTimeframeMinutes">
              {t("admin.branchManagement.create.orderSettings.orderMergeTimeframe")}
            </Label>
            <NumberInput
              id="orderMergeTimeframeMinutes"
              value={form.orderMergeTimeframeMinutes !== "" && form.orderMergeTimeframeMinutes !== undefined ? Number(form.orderMergeTimeframeMinutes) : undefined}
              onChange={(value) =>
                handleChange("orderMergeTimeframeMinutes", value !== undefined ? String(value) : "")
              }
              allowDecimals={false}
              min={0}
              max={120}
              placeholder={String(globalOrderMergeTimeframe)}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.branchManagement.create.orderSettings.orderMergeTimeframeDescription")}
            </p>
          </div>
          <Separator />
          {/* Future Order Settings */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">
                {t("admin.branchManagement.create.orderSettings.futureOrders.title")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.futureOrders.description")}
              </p>
            </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.futureOrders.enabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {form.futureOrdersEnabled === null
                      ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal")
                      : t("admin.branchManagement.create.orderSettings.futureOrders.overriding")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="border border-border"
                    onClick={() => {
                      if (form.futureOrdersEnabled === null) {
                        handleChange("futureOrdersEnabled", false);
                      } else {
                        handleChange("futureOrdersEnabled", null);
                      }
                    }}
                  >
                    {form.futureOrdersEnabled === null
                      ? t("admin.branchManagement.create.orderSettings.futureOrders.override")
                      : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal")}
                  </Button>
                </div>
              </div>

              {form.futureOrdersEnabled !== null && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="futureOrdersEnabled"
                    checked={form.futureOrdersEnabled || false}
                    onCheckedChange={(checked: boolean) =>
                      handleChange("futureOrdersEnabled", checked)
                    }
                  />
                  <Label htmlFor="futureOrdersEnabled">
                    {t("admin.branchManagement.create.orderSettings.futureOrders.enabled")}
                  </Label>
                </div>
              )}
            </div>

            {((form.futureOrdersEnabled === null
              ? globalFutureOrdersEnabled
              : form.futureOrdersEnabled) || false) && (
              <>
                {/* Pickup Future Orders */}
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.futureOrders.pickupTitle")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {form.enableFuturePickupOrders === null
                          ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal")
                          : t("admin.branchManagement.create.orderSettings.futureOrders.overriding")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border border-border"
                        onClick={() => {
                          if (form.enableFuturePickupOrders === null) {
                            handleChange("enableFuturePickupOrders", false);
                          } else {
                            handleChange("enableFuturePickupOrders", null);
                            handleChange("futurePickupOrderDays", null);
                          }
                        }}
                      >
                        {form.enableFuturePickupOrders === null
                          ? t("admin.branchManagement.create.orderSettings.futureOrders.override")
                          : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal")}
                      </Button>
                    </div>
                  </div>
                  {form.enableFuturePickupOrders !== null && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="enableFuturePickupOrders"
                          checked={form.enableFuturePickupOrders || false}
                          onCheckedChange={(checked: boolean) =>
                            handleChange("enableFuturePickupOrders", checked)
                          }
                        />
                        <Label htmlFor="enableFuturePickupOrders">
                          {t("admin.branchManagement.create.orderSettings.futureOrders.enablePickup")}
                        </Label>
                      </div>
                      {form.enableFuturePickupOrders && (
                        <div className="space-y-2">
                          <Label htmlFor="futurePickupOrderDays">
                            {t("admin.branchManagement.create.orderSettings.futureOrders.maxDaysPickup")}
                          </Label>
                          <NumberInput
                            id="futurePickupOrderDays"
                            value={form.futurePickupOrderDays ?? 0}
                            onChange={(value) =>
                              handleChange("futurePickupOrderDays", value ?? 0)
                            }
                            allowDecimals={false}
                            min={0}
                            max={365}
                            placeholder="7"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Delivery Future Orders */}
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.futureOrders.deliveryTitle")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {form.enableFutureDeliveryOrders === null
                          ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal")
                          : t("admin.branchManagement.create.orderSettings.futureOrders.overriding")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border border-border"
                        onClick={() => {
                          if (form.enableFutureDeliveryOrders === null) {
                            handleChange("enableFutureDeliveryOrders", false);
                          } else {
                            handleChange("enableFutureDeliveryOrders", null);
                            handleChange("futureDeliveryOrderDays", null);
                          }
                        }}
                      >
                        {form.enableFutureDeliveryOrders === null
                          ? t("admin.branchManagement.create.orderSettings.futureOrders.override")
                          : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal")}
                      </Button>
                    </div>
                  </div>
                  {form.enableFutureDeliveryOrders !== null && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="enableFutureDeliveryOrders"
                          checked={form.enableFutureDeliveryOrders || false}
                          onCheckedChange={(checked: boolean) =>
                            handleChange("enableFutureDeliveryOrders", checked)
                          }
                        />
                        <Label htmlFor="enableFutureDeliveryOrders">
                          {t("admin.branchManagement.create.orderSettings.futureOrders.enableDelivery")}
                        </Label>
                      </div>
                      {form.enableFutureDeliveryOrders && (
                        <div className="space-y-2">
                          <Label htmlFor="futureDeliveryOrderDays">
                            {t("admin.branchManagement.create.orderSettings.futureOrders.maxDaysDelivery")}
                          </Label>
                          <NumberInput
                            id="futureDeliveryOrderDays"
                            value={form.futureDeliveryOrderDays ?? 0}
                            onChange={(value) =>
                              handleChange("futureDeliveryOrderDays", value ?? 0)
                            }
                            allowDecimals={false}
                            min={0}
                            max={365}
                            placeholder="3"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          
          <Separator />
          
          {/* Scheduled Order Merge Settings */}
          {((form.futureOrdersEnabled === null
            ? globalFutureOrdersEnabled
            : form.futureOrdersEnabled) || false) && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">
                {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.title")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.description")}
              </p>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.mergeTitle")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {form.allowScheduledOrderMerge === null
                      ? t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.inheritingFromGlobal")
                      : t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.overriding")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="border border-border"
                    onClick={() => {
                      if (form.allowScheduledOrderMerge === null) {
                        handleChange("allowScheduledOrderMerge", false);
                      } else {
                        handleChange("allowScheduledOrderMerge", null);
                        handleChange("scheduledOrderMergeCutoffHours", null);
                      }
                    }}
                  >
                    {form.allowScheduledOrderMerge === null
                      ? t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.override")
                      : t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.inheritGlobal")}
                  </Button>
                </div>
              </div>
              {form.allowScheduledOrderMerge !== null && (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="allowScheduledOrderMerge"
                      checked={form.allowScheduledOrderMerge || false}
                      onCheckedChange={(checked: boolean) =>
                        handleChange("allowScheduledOrderMerge", checked)
                      }
                    />
                    <Label htmlFor="allowScheduledOrderMerge">
                      {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.enable")}
                    </Label>
                  </div>
                  {form.allowScheduledOrderMerge && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderMergeCutoffHours">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.cutoffHours")}
                      </Label>
                      <NumberInput
                        id="scheduledOrderMergeCutoffHours"
                        value={form.scheduledOrderMergeCutoffHours ?? 2}
                        onChange={(value) =>
                          handleChange("scheduledOrderMergeCutoffHours", value ?? 2)
                        }
                        allowDecimals={false}
                        min={1}
                        max={48}
                        placeholder="2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.cutoffHoursDescription")}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )}

          {((form.futureOrdersEnabled === null
            ? globalFutureOrdersEnabled
            : form.futureOrdersEnabled) || false) && (
            <>
              <Separator />

              {/* Scheduled Order Time Slot Settings */}
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.title")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.description")}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.label")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {form.scheduledOrderTimeSlotInterval === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.inheritingFromGlobal", { value: globalScheduledOrderTimeSlotInterval })
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.overriding")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border border-border"
                        onClick={() => {
                          if (form.scheduledOrderTimeSlotInterval === null) {
                            handleChange("scheduledOrderTimeSlotInterval", globalScheduledOrderTimeSlotInterval);
                          } else {
                            handleChange("scheduledOrderTimeSlotInterval", null);
                          }
                        }}
                      >
                        {form.scheduledOrderTimeSlotInterval === null
                          ? t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.override")
                          : t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.inheritGlobal")}
                      </Button>
                    </div>
                  </div>

                  {form.scheduledOrderTimeSlotInterval !== null && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderTimeSlotInterval">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.minutes")}
                      </Label>
                      <NumberInput
                        id="scheduledOrderTimeSlotInterval"
                        value={form.scheduledOrderTimeSlotInterval ?? undefined}
                        onChange={(value) =>
                          handleChange("scheduledOrderTimeSlotInterval", value)
                        }
                        allowDecimals={false}
                        min={5}
                        max={240}
                        placeholder={String(globalScheduledOrderTimeSlotInterval)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Scheduled Order Capacity Settings */}
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.title")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.description")}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.label")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {form.scheduledOrderMaxOrdersPerSlot === null
                          ? t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.inheritingFromGlobal",
                              {
                                value:
                                  globalScheduledOrderMaxOrdersPerSlot === null
                                    ? t(
                                        "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.unlimited"
                                      )
                                    : globalScheduledOrderMaxOrdersPerSlot,
                              }
                            )
                          : t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.overriding"
                            )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border border-border"
                        onClick={() => {
                          if (form.scheduledOrderMaxOrdersPerSlot === null) {
                            handleChange(
                              "scheduledOrderMaxOrdersPerSlot",
                              globalScheduledOrderMaxOrdersPerSlot ?? undefined
                            );
                          } else {
                            handleChange("scheduledOrderMaxOrdersPerSlot", null);
                          }
                        }}
                      >
                        {form.scheduledOrderMaxOrdersPerSlot === null
                          ? t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.override"
                            )
                          : t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.inheritGlobal"
                            )}
                      </Button>
                    </div>
                  </div>

                  {form.scheduledOrderMaxOrdersPerSlot !== null && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderMaxOrdersPerSlot">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.maxOrders")}
                      </Label>
                      <NumberInput
                        id="scheduledOrderMaxOrdersPerSlot"
                        value={form.scheduledOrderMaxOrdersPerSlot ?? undefined}
                        onChange={(value) =>
                          handleChange("scheduledOrderMaxOrdersPerSlot", value)
                        }
                        allowDecimals={false}
                        placeholder={
                          globalScheduledOrderMaxOrdersPerSlot === null
                            ? t(
                                "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.unlimited"
                              )
                            : String(globalScheduledOrderMaxOrdersPerSlot)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.hint")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Scheduled Order Management Settings */}
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.title")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "admin.branchManagement.create.orderSettings.scheduledOrderManagement.description"
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.label"
                        )}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {(form as any).scheduledOrderAutoConfirm === null
                          ? t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal"
                            )
                          : t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding"
                            )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border border-border"
                        onClick={() => {
                          if ((form as any).scheduledOrderAutoConfirm === null) {
                            handleChange("scheduledOrderAutoConfirm" as any, true);
                          } else {
                            handleChange("scheduledOrderAutoConfirm" as any, null);
                          }
                        }}
                      >
                        {(form as any).scheduledOrderAutoConfirm === null
                          ? t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.override"
                            )
                          : t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal"
                            )}
                      </Button>
                    </div>
                  </div>

                  {(form as any).scheduledOrderAutoConfirm !== null && (
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="scheduledOrderAutoConfirm"
                        checked={(form as any).scheduledOrderAutoConfirm ?? true}
                        onCheckedChange={(checked: boolean) =>
                          handleChange("scheduledOrderAutoConfirm" as any, checked)
                        }
                      />
                      <Label htmlFor="scheduledOrderAutoConfirm">
                        {t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.label"
                        )}
                      </Label>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.label"
                        )}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {(form as any).scheduledOrderMinimumAmount === null
                          ? t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal"
                            )
                          : t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding"
                            )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border border-border"
                        onClick={() => {
                          if ((form as any).scheduledOrderMinimumAmount === null) {
                            handleChange("scheduledOrderMinimumAmount" as any, 0);
                          } else {
                            handleChange("scheduledOrderMinimumAmount" as any, null);
                          }
                        }}
                      >
                        {(form as any).scheduledOrderMinimumAmount === null
                          ? t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.override"
                            )
                          : t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal"
                            )}
                      </Button>
                    </div>
                  </div>

                  {(form as any).scheduledOrderMinimumAmount !== null && (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderMinimumAmount" className="text-sm font-medium">
                        {t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.label"
                        )}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.description"
                        )}
                      </p>
                      <Input
                        id="scheduledOrderMinimumAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={(form as any).scheduledOrderMinimumAmount ?? 0}
                        onChange={(e) =>
                          handleChange(
                            "scheduledOrderMinimumAmount" as any,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="max-w-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.title"
                        )}
                      </Label>
                  <p className="text-xs text-muted-foreground">
                    {form.scheduledOrderAllowCancellation === null
                      ? t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal"
                        )
                      : t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding"
                        )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="border border-border"
                    onClick={() => {
                      if (form.scheduledOrderAllowCancellation === null) {
                        handleChange("scheduledOrderAllowCancellation", false);
                        handleChange("scheduledOrderCancellationWindowHours", 0);
                        handleChange("scheduledOrderFullRefundHoursBefore", 24);
                        handleChange("scheduledOrderPartialRefundHoursBefore", 12);
                        handleChange("scheduledOrderNoRefundHoursBefore", 2);
                        handleChange("scheduledOrderPartialRefundPercentage", 50);
                        handleChange("scheduledOrderReducedRefundPercentage", 25);
                      } else {
                        handleChange("scheduledOrderAllowCancellation", null);
                        handleChange("scheduledOrderCancellationWindowHours", null);
                        handleChange("scheduledOrderFullRefundHoursBefore", null);
                        handleChange("scheduledOrderPartialRefundHoursBefore", null);
                        handleChange("scheduledOrderNoRefundHoursBefore", null);
                        handleChange("scheduledOrderPartialRefundPercentage", null);
                        handleChange("scheduledOrderReducedRefundPercentage", null);
                      }
                    }}
                  >
                    {form.scheduledOrderAllowCancellation === null
                      ? t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.override"
                        )
                      : t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal"
                        )}
                  </Button>
                </div>
              </div>

              {form.scheduledOrderAllowCancellation !== null && (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="scheduledOrderAllowCancellation"
                      checked={form.scheduledOrderAllowCancellation || false}
                      onCheckedChange={(checked: boolean) =>
                        handleChange("scheduledOrderAllowCancellation", checked)
                      }
                    />
                    <Label htmlFor="scheduledOrderAllowCancellation">
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.enable"
                      )}
                    </Label>
                  </div>

                  {form.scheduledOrderAllowCancellation && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="scheduledOrderCancellationWindowHours">
                          {t(
                            "admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.windowHours"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderCancellationWindowHours"
                          value={form.scheduledOrderCancellationWindowHours ?? undefined}
                          onChange={(value) =>
                            handleChange(
                              "scheduledOrderCancellationWindowHours",
                              value
                            )
                          }
                          allowDecimals={false}
                          min={0}
                          max={168}
                          placeholder="0"
                        />
                      </div>

                      <Separator />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderFullRefundHoursBefore">
                            {t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.fullHoursBefore"
                            )}
                          </Label>
                          <NumberInput
                            id="scheduledOrderFullRefundHoursBefore"
                            value={form.scheduledOrderFullRefundHoursBefore ?? undefined}
                            onChange={(value) =>
                              handleChange(
                                "scheduledOrderFullRefundHoursBefore",
                                value
                              )
                            }
                            allowDecimals={false}
                            min={0}
                            max={720}
                            placeholder="24"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderPartialRefundHoursBefore">
                            {t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.partialHoursBefore"
                            )}
                          </Label>
                          <NumberInput
                            id="scheduledOrderPartialRefundHoursBefore"
                            value={form.scheduledOrderPartialRefundHoursBefore ?? undefined}
                            onChange={(value) =>
                              handleChange(
                                "scheduledOrderPartialRefundHoursBefore",
                                value
                              )
                            }
                            allowDecimals={false}
                            min={0}
                            max={720}
                            placeholder="12"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderNoRefundHoursBefore">
                            {t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.noRefundHoursBefore"
                            )}
                          </Label>
                          <NumberInput
                            id="scheduledOrderNoRefundHoursBefore"
                            value={form.scheduledOrderNoRefundHoursBefore ?? undefined}
                            onChange={(value) =>
                              handleChange(
                                "scheduledOrderNoRefundHoursBefore",
                                value
                              )
                            }
                            allowDecimals={false}
                            min={0}
                            max={720}
                            placeholder="2"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderPartialRefundPercentage">
                            {t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.partialPercentage"
                            )}
                          </Label>
                          <NumberInput
                            id="scheduledOrderPartialRefundPercentage"
                            value={form.scheduledOrderPartialRefundPercentage ?? undefined}
                            onChange={(value) =>
                              handleChange(
                                "scheduledOrderPartialRefundPercentage",
                                value
                              )
                            }
                            allowDecimals={false}
                            min={0}
                            max={100}
                            placeholder="50"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderReducedRefundPercentage">
                            {t(
                              "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.reducedPercentage"
                            )}
                          </Label>
                          <NumberInput
                            id="scheduledOrderReducedRefundPercentage"
                            value={form.scheduledOrderReducedRefundPercentage ?? undefined}
                            onChange={(value) =>
                              handleChange(
                                "scheduledOrderReducedRefundPercentage",
                                value
                              )
                            }
                            allowDecimals={false}
                            min={0}
                            max={100}
                            placeholder="25"
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
                    {t(
                      "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.title"
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {form.scheduledOrderAllowModification === null
                      ? t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritingFromGlobal"
                        )
                      : t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.overriding"
                        )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="border border-border"
                    onClick={() => {
                      if (form.scheduledOrderAllowModification === null) {
                        handleChange("scheduledOrderAllowModification", false);
                        handleChange("scheduledOrderModificationWindowHours", 0);
                      } else {
                        handleChange("scheduledOrderAllowModification", null);
                        handleChange("scheduledOrderModificationWindowHours", null);
                      }
                    }}
                  >
                    {form.scheduledOrderAllowModification === null
                      ? t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.override"
                        )
                      : t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.inheritGlobal"
                        )}
                  </Button>
                </div>
              </div>

              {form.scheduledOrderAllowModification !== null && (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="scheduledOrderAllowModification"
                      checked={form.scheduledOrderAllowModification || false}
                      onCheckedChange={(checked: boolean) =>
                        handleChange("scheduledOrderAllowModification", checked)
                      }
                    />
                    <Label htmlFor="scheduledOrderAllowModification">
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.enable"
                      )}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="scheduledOrderAllowShallowModification"
                      checked={(form as any).scheduledOrderAllowShallowModification || false}
                      onCheckedChange={(checked: boolean) =>
                        handleChange(
                          "scheduledOrderAllowShallowModification" as any,
                          checked
                        )
                      }
                    />
                    <Label htmlFor="scheduledOrderAllowShallowModification">
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.shallowEnable"
                      )}
                    </Label>
                  </div>

                  {form.scheduledOrderAllowModification && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="scheduledOrderModificationWindowHours">
                          {t(
                            "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.windowHours"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderModificationWindowHours"
                          value={form.scheduledOrderModificationWindowHours ?? undefined}
                          onChange={(value) =>
                            handleChange(
                              "scheduledOrderModificationWindowHours",
                              value
                            )
                          }
                          allowDecimals={false}
                          min={0}
                          max={168}
                          placeholder="0"
                        />
                      </div>

                      <Separator />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
            </>
          )}

        </div>
      </CollapsibleCard>

      {/* Delivery Settings */}
      <CollapsibleCard
        icon={<Icon path={mdiTruck} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.deliverySettings.title")}
        description={t("admin.branchManagement.create.deliverySettings.description")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="deliveryRadius">{t("admin.branchManagement.create.deliverySettings.deliveryRadius")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {form.deliveryRadius === null
                      ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")
                      : t("admin.branchManagement.create.orderSettings.overriding")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleChange(
                      "deliveryRadius",
                      form.deliveryRadius === null ? String(globalDeliveryRadius) : null
                    )
                  }
                >
                  {form.deliveryRadius === null
                    ? t("admin.branchManagement.create.orderSettings.override")
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal")}
                </Button>
              </div>
              <NumberInput
                id="deliveryRadius"
                value={
                  form.deliveryRadius === null
                    ? globalDeliveryRadius
                    : form.deliveryRadius
                    ? Number(form.deliveryRadius)
                    : undefined
                }
                onChange={(value) =>
                  handleChange(
                    "deliveryRadius",
                    form.deliveryRadius === null
                      ? null
                      : value !== undefined
                      ? String(value)
                      : ""
                  )
                }
                allowDecimals={true}
                min={0}
                placeholder={String(globalDeliveryRadius)}
                disabled={form.deliveryRadius === null}
              />
              {form.deliveryRadius === null && (
                <p className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")}: {globalDeliveryRadius}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="deliveryFee">{t("admin.branchManagement.create.financialSettings.deliveryFee")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {form.deliveryFee === null
                      ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")
                      : t("admin.branchManagement.create.orderSettings.overriding")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleChange(
                      "deliveryFee",
                      form.deliveryFee === null ? String(globalDeliveryFee) : null
                    )
                  }
                >
                  {form.deliveryFee === null
                    ? t("admin.branchManagement.create.orderSettings.override")
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal")}
                </Button>
              </div>
              <NumberInput
                id="deliveryFee"
                value={
                  form.deliveryFee === null
                    ? globalDeliveryFee
                    : form.deliveryFee
                    ? Number(form.deliveryFee)
                    : undefined
                }
                onChange={(value) =>
                  handleChange(
                    "deliveryFee",
                    form.deliveryFee === null
                      ? null
                      : value !== undefined
                      ? String(value)
                      : ""
                  )
                }
                allowDecimals={true}
                min={0}
                placeholder={String(globalDeliveryFee)}
                disabled={form.deliveryFee === null}
              />
              {form.deliveryFee === null && (
                <p className="text-xs text-muted-foreground">
                  {t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")}: {globalDeliveryFee}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryRatePerKilometer">{t("admin.branchManagement.create.deliverySettings.ratePerKm")}</Label>
              <NumberInput
                id="deliveryRatePerKilometer"
                value={form.deliveryRatePerKilometer ? Number(form.deliveryRatePerKilometer) : 0}
                onChange={(value) =>
                  handleChange("deliveryRatePerKilometer", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="useDynamicDeliveryFee"
                  checked={form.useDynamicDeliveryFee || false}
                  onCheckedChange={(checked: boolean) => {
                    handleChange("useDynamicDeliveryFee", checked);
                    // Disable tiered if enabling dynamic
                    if (checked) {
                      handleChange("useTieredDeliveryFee", false);
                    }
                  }}
                />
                <Label htmlFor="useDynamicDeliveryFee">{t("admin.branchManagement.create.deliverySettings.useDynamicDeliveryFee")}</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.deliverySettings.useDynamicDeliveryFeeDescription")}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="useTieredDeliveryFee"
                  checked={form.useTieredDeliveryFee || false}
                  onCheckedChange={(checked: boolean) => {
                    handleChange("useTieredDeliveryFee", checked);
                    // Disable dynamic if enabling tiered
                    if (checked) {
                      handleChange("useDynamicDeliveryFee", false);
                    }
                  }}
                />
                <Label htmlFor="useTieredDeliveryFee">{t("admin.branchManagement.create.deliverySettings.useTieredDeliveryFee")}</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.deliverySettings.useTieredDeliveryFeeDescription")}
              </p>
            </div>
            {/* Tiered Delivery Configuration */}
            {(form.useTieredDeliveryFee || false) && (
              <div className="space-y-4 pl-6 border-l-2 border-pink-200 md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initialDeliveryRange">{t("admin.branchManagement.create.deliverySettings.initialRange")}</Label>
                    <NumberInput
                      id="initialDeliveryRange"
                      value={form.initialDeliveryRange ? Number(form.initialDeliveryRange) : 3}
                      onChange={(value) =>
                        handleChange("initialDeliveryRange", value !== undefined ? String(value) : "")
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder="3"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.deliverySettings.initialRangeDescription")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="initialDeliveryPrice">{t("admin.branchManagement.create.deliverySettings.initialPrice")}</Label>
                    <NumberInput
                      id="initialDeliveryPrice"
                      value={form.initialDeliveryPrice ? Number(form.initialDeliveryPrice) : 2.0}
                      onChange={(value) =>
                        handleChange("initialDeliveryPrice", value !== undefined ? String(value) : "")
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder="2.00"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.deliverySettings.initialPriceDescription")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="extendedDeliveryThreshold">
                      {t("admin.branchManagement.create.deliverySettings.extendedThresholdOptional")}
                    </Label>
                    <NumberInput
                      id="extendedDeliveryThreshold"
                      value={form.extendedDeliveryThreshold ? Number(form.extendedDeliveryThreshold) : 0}
                      onChange={(value) =>
                        handleChange(
                          "extendedDeliveryThreshold",
                          value !== undefined && value > 0 ? String(value) : ""
                        )
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder="10"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.deliverySettings.extendedThresholdDescription")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extendedDeliveryRate">
                      {t("admin.branchManagement.create.deliverySettings.extendedRateOptional")}
                    </Label>
                    <NumberInput
                      id="extendedDeliveryRate"
                      value={form.extendedDeliveryRate ? Number(form.extendedDeliveryRate) : 0}
                      onChange={(value) =>
                        handleChange(
                          "extendedDeliveryRate",
                          value !== undefined && value > 0 ? String(value) : ""
                        )
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder="0.65"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("admin.branchManagement.create.deliverySettings.extendedRateDescription")}
                    </p>
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>{t("admin.branchManagement.create.deliverySettings.howItWorks")}</strong>{" "}
                    {t("admin.branchManagement.create.deliverySettings.howItWorksDescription")}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="deliveryTimeEstimate">{t("admin.branchManagement.create.deliverySettings.deliveryTimeEstimate")}</Label>
              <NumberInput
                id="deliveryTimeEstimate"
                value={form.deliveryTimeEstimate ? Number(form.deliveryTimeEstimate) : 45}
                onChange={(value) =>
                  handleChange("deliveryTimeEstimate", value !== undefined ? String(value) : "")
                }
                allowDecimals={false}
                min={1}
                placeholder="45"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="freeDeliveryThreshold">{t("admin.branchManagement.create.deliverySettings.freeDeliveryThreshold")}</Label>
              <NumberInput
                id="freeDeliveryThreshold"
                value={form.freeDeliveryThreshold ? Number(form.freeDeliveryThreshold) : 50}
                onChange={(value) =>
                  handleChange("freeDeliveryThreshold", value !== undefined ? String(value) : "")
                }
                allowDecimals={true}
                min={0}
                placeholder="50.00"
                disabled={!form.enableFreeDelivery}
              />
            <div className="flex items-center space-x-2">
              <Switch
                  id="enableFreeDelivery"
                  checked={form.enableFreeDelivery || false}
                  onCheckedChange={(checked: boolean) =>
                  handleChange("enableFreeDelivery", checked)
                }
              />
                <Label htmlFor="enableFreeDelivery">{t("admin.branchManagement.create.deliverySettings.enableFreeDelivery")}</Label>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Serving Hours */}
      <CollapsibleCard
        icon={<Icon path={mdiClock} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.servingHours.title")}
        description={t("admin.branchManagement.create.servingHours.description")}
      >
        <div className="space-y-4">
          {/* Allow Orders Outside Hours Toggle */}
          <div className="flex items-center space-x-2 p-4 bg-pink-50 dark:bg-pink-950/20 rounded-lg border border-pink-200 dark:border-pink-800">
            <Switch
              id="allowOrdersOutsideHours"
              checked={form.allowOrdersOutsideHours || false}
              onCheckedChange={(checked: boolean) =>
                handleChange("allowOrdersOutsideHours", checked)
              }
            />
            <div className="flex-1">
              <Label htmlFor="allowOrdersOutsideHours" className="text-base font-semibold cursor-pointer">
                {t("admin.branchManagement.create.servingHours.allowOrdersOutsideHours")}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {t("admin.branchManagement.create.servingHours.allowOrdersOutsideHoursDescription")}
              </p>
            </div>
          </div>
          {[
            { key: "monday", label: t("admin.branchManagement.create.servingHours.monday") },
            { key: "tuesday", label: t("admin.branchManagement.create.servingHours.tuesday") },
            { key: "wednesday", label: t("admin.branchManagement.create.servingHours.wednesday") },
            { key: "thursday", label: t("admin.branchManagement.create.servingHours.thursday") },
            { key: "friday", label: t("admin.branchManagement.create.servingHours.friday") },
            { key: "saturday", label: t("admin.branchManagement.create.servingHours.saturday") },
            { key: "sunday", label: t("admin.branchManagement.create.servingHours.sunday") },
          ].map((day) => {
            const isOff = (form as any)[`${day.key}IsOff`] || false;
            const periodsKey = `${day.key}Periods` as keyof BranchForm;
            const openKey = `${day.key}Open` as keyof BranchForm;
            const closeKey = `${day.key}Close` as keyof BranchForm;
            
            // Get periods with backward compatibility
            const getDayPeriods = (): Array<{ open: string; close: string }> => {
              const periods = (form as any)[periodsKey] as Array<{ open: string; close: string }> | undefined;
              if (periods && Array.isArray(periods) && periods.length > 0) {
                return periods;
              }
              // Fallback to single open/close
              const open = (form as any)[openKey] as string | undefined;
              const close = (form as any)[closeKey] as string | undefined;
              if (open && close) {
                return [{ open, close }];
              }
              return [{ open: "", close: "" }];
            };

            const periods = getDayPeriods();

            const updatePeriodTime = (periodIndex: number, type: "open" | "close", time: string) => {
              const newPeriods = [...periods];
              while (newPeriods.length <= periodIndex) {
                newPeriods.push({ 
                  open: "9:00 AM", 
                  close: "10:00 PM" 
                });
              }
              newPeriods[periodIndex] = {
                ...newPeriods[periodIndex],
                [type]: time,
              };
              handleChange(periodsKey, newPeriods);
            };

            const addPeriod = () => {
              const newPeriods = [...periods, { 
                open: "9:00 AM", 
                close: "10:00 PM" 
              }];
              handleChange(periodsKey, newPeriods);
            };

            const removePeriod = (periodIndex: number) => {
              if (periods.length <= 1) {
                handleChange(periodsKey, [{ open: "", close: "" }]);
                return;
              }
              const newPeriods = periods.filter((_, index) => index !== periodIndex);
              handleChange(periodsKey, newPeriods);
            };

            return (
              <div key={day.key} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">{day.label}</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${day.key}IsOff`}
                      checked={isOff}
                      onCheckedChange={(checked: boolean) =>
                        handleChange(`${day.key}IsOff` as keyof BranchForm, checked)
                      }
                    />
                    <Label htmlFor={`${day.key}IsOff`} className="text-sm">
                      {t("admin.branchManagement.create.servingHours.closed")}
                    </Label>
                  </div>
                </div>
                {!isOff && (
                  <div className="space-y-4">
                    {periods.map((period, periodIndex) => (
                      <div key={periodIndex} className="space-y-3 p-3 bg-muted/50 rounded-lg border">
                        {periods.length > 1 && (
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium text-pink-500">
                              {t("admin.branchManagement.create.servingHours.period")} {periodIndex + 1}
                            </Label>
                            {periods.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removePeriod(periodIndex)}
                                className="text-destructive hover:text-destructive p-2"
                              >
                                <Icon path={mdiDelete} size={0.67} />
                              </Button>
                            )}
                          </div>
                        )}
                        <div className="flex flex-row gap-4 items-end">
                          <div className="flex-1 space-y-2">
                            <Label htmlFor={`${day.key}Period${periodIndex}Open`}>
                              {t("admin.branchManagement.create.servingHours.openTime")}
                            </Label>
                            <TimePicker12Hour
                              time={period.open || undefined}
                              onTimeChange={(time) =>
                                updatePeriodTime(periodIndex, "open", time || "")
                    }
                              placeholder={t("admin.branchManagement.create.servingHours.openTime")}
                              className="w-full"
                  />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label htmlFor={`${day.key}Period${periodIndex}Close`}>
                              {t("admin.branchManagement.create.servingHours.closeTime")}
                            </Label>
                            <TimePicker12Hour
                              time={period.close || undefined}
                              onTimeChange={(time) =>
                                updatePeriodTime(periodIndex, "close", time || "")
                    }
                              placeholder={t("admin.branchManagement.create.servingHours.closeTime")}
                              className="w-full"
                  />
                          </div>
                </div>
              </div>
            ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addPeriod}
                      className="w-full border-pink-500 text-pink-600 hover:border-pink-600 hover:bg-pink-50 hover:text-pink-700 dark:border-pink-400 dark:text-pink-400 dark:hover:border-pink-300 dark:hover:bg-pink-500/10 dark:hover:text-pink-300"
                    >
                      <Icon path={mdiPlus} size={0.67} className="mr-2" />
                      {t("admin.branchManagement.create.servingHours.addPeriod")}
                    </Button>
          </div>
                )}
          </div>
            );
          })}
        </div>
      </CollapsibleCard>

       {/* Delivery Payment */}
      <CollapsibleCard
        icon={<Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.deliveryPaymentSettings.title", { defaultValue: "Delivery Payment Settings" })}
        description={t("admin.branchManagement.create.deliveryPaymentSettings.description", { defaultValue: "Configure payment methods available for delivery orders" })}
      >
        <div className="space-y-4">
          {orgPaymentEntitlements.onlinePaymentsAllowed === false && (
            <div className="text-xs text-muted-foreground">
              {t("admin.branchManagement.create.paymentSettings.disabledByOrg", {
                defaultValue: "Disabled by organization policy.",
              })}
            </div>
          )}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="acceptCash"
                checked={form.acceptCash || false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("acceptCash", checked)
                }
              />
              <Label htmlFor="acceptCash">{t("admin.branchManagement.create.paymentSettings.acceptCash")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="acceptCard"
                checked={form.acceptCard || false}
                disabled={orgPaymentEntitlements.onlinePaymentsAllowed === false || orgPaymentEntitlements.cardPaymentsAllowed === false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("acceptCard", checked)
                }
              />
              <Label htmlFor="acceptCard">{t("admin.branchManagement.create.paymentSettings.acceptCard")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="acceptOnlinePayment"
                checked={form.acceptOnlinePayment || false}
                disabled={orgPaymentEntitlements.onlinePaymentsAllowed === false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("acceptOnlinePayment", checked)
                }
              />
              <Label htmlFor="acceptOnlinePayment">{t("admin.branchManagement.create.paymentSettings.acceptOnlinePayment")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="acceptPayPal"
                checked={form.acceptPayPal || false}
                disabled={orgPaymentEntitlements.onlinePaymentsAllowed === false || orgPaymentEntitlements.paypalAllowed === false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("acceptPayPal", checked)
                }
              />
              <Label htmlFor="acceptPayPal">{t("admin.branchManagement.create.paymentSettings.acceptPayPal")}</Label>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Pickup Payment */}
      <CollapsibleCard
        icon={<Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.title")}
        description={t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.description")}
      >
        <div className="space-y-4">
          {orgPaymentEntitlements.onlinePaymentsAllowed === false && (
            <div className="text-xs text-muted-foreground">
              {t("admin.branchManagement.create.paymentSettings.disabledByOrg", {
                defaultValue: "Disabled by organization policy.",
              })}
            </div>
          )}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="pickupAcceptCash"
                checked={form.pickupAcceptCash ?? false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("pickupAcceptCash", checked)
                }
              />
              <Label htmlFor="pickupAcceptCash">{t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.acceptCash")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="pickupAcceptCard"
                checked={form.pickupAcceptCard ?? false}
                disabled={orgPaymentEntitlements.onlinePaymentsAllowed === false || orgPaymentEntitlements.cardPaymentsAllowed === false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("pickupAcceptCard", checked)
                }
              />
              <Label htmlFor="pickupAcceptCard">{t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.acceptCard")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="pickupAcceptOnlinePayment"
                checked={form.pickupAcceptOnlinePayment ?? false}
                disabled={orgPaymentEntitlements.onlinePaymentsAllowed === false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("pickupAcceptOnlinePayment", checked)
                }
              />
              <Label htmlFor="pickupAcceptOnlinePayment">{t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.acceptOnlinePayment")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="pickupAcceptPayPal"
                checked={form.pickupAcceptPayPal ?? false}
                disabled={orgPaymentEntitlements.onlinePaymentsAllowed === false || orgPaymentEntitlements.paypalAllowed === false}
                onCheckedChange={(checked: boolean) =>
                  handleChange("pickupAcceptPayPal", checked)
                }
              />
              <Label htmlFor="pickupAcceptPayPal">{t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.acceptPayPal")}</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pickupTakeawayServiceFee">
                {t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.takeawayServiceFee", { defaultValue: "Takeaway service fee" })}
              </Label>
              <NumberInput
                id="pickupTakeawayServiceFee"
                value={form.pickupTakeawayServiceFee ?? undefined}
                onChange={(value) =>
                  handleChange("pickupTakeawayServiceFee", value ?? null)
                }
                allowDecimals={true}
                min={0}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.branchManagement.create.paymentSettings.pickupPaymentSettings.takeawayServiceFeeInheritHint", { defaultValue: "Leave empty to inherit from global settings." })}
              </p>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Social Media & Contact */}
      <CollapsibleCard
        icon={<Icon path={mdiWeb} size={0.83} className="text-pink-500" />}
        title={t("admin.branchManagement.create.socialMedia.title")}
        description={t("admin.branchManagement.create.socialMedia.description")}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="facebookUrl">{t("admin.branchManagement.create.socialMedia.facebookUrl")}</Label>
              <Input
                id="facebookUrl"
                value={form.facebookUrl || ""}
                onChange={(e) => handleChange("facebookUrl", e.target.value)}
                placeholder={t("admin.branchManagement.create.socialMedia.facebookUrlPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagramUrl">{t("admin.branchManagement.create.socialMedia.instagramUrl")}</Label>
              <Input
                id="instagramUrl"
                value={form.instagramUrl || ""}
                onChange={(e) => handleChange("instagramUrl", e.target.value)}
                placeholder={t("admin.branchManagement.create.socialMedia.instagramUrlPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitterUrl">{t("admin.branchManagement.create.socialMedia.twitterUrl")}</Label>
              <Input
                id="twitterUrl"
                value={form.twitterUrl || ""}
                onChange={(e) => handleChange("twitterUrl", e.target.value)}
                placeholder={t("admin.branchManagement.create.socialMedia.twitterUrlPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">{t("admin.branchManagement.create.socialMedia.websiteUrl")}</Label>
              <Input
                id="websiteUrl"
                value={form.websiteUrl || ""}
                onChange={(e) => handleChange("websiteUrl", e.target.value)}
                placeholder={t("admin.branchManagement.create.socialMedia.websiteUrlPlaceholder")}
              />
            </div>
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
};

export default BranchCreate;

