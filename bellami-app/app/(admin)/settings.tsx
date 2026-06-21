import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  FlatList,
  RefreshControl,
  Image,
  Alert,
  Share,
  Linking,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import googlePlacesService, {
  type AddressComponents,
} from "@/src/services/googlePlacesService";
import ApiService from "@/src/services/apiService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import branchService from "@/src/services/branchService";
import { getDeviceTimeZone, getSupportedTimeZones } from "@/src/utils/timezones";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

const FRONTEND_ORIGIN =
  process.env.EXPO_PUBLIC_FRONTEND_URL ||
  (__DEV__ ? "http://localhost:5173" : "https://nextfoody.com");

type Settings = {
  businessName?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  timezone?: string | null;
  serviceType?: "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK";
  businessLogo?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoOgImage?: string;
  country?: string;
  state?: string;
  city?: string;
  addressLineOne?: string;
  latitude?: number;
  longitude?: number;
  taxPercentage?: number;
  serviceTaxPercentage?: number;
  deliveryTaxPercentage?: number;
  deliveryFee?: number;
  minimumOrderAmount?: number;
  enableMinimumOrder?: boolean;
  currency?: string;
  taxInclusive?: boolean;
  orderPreparationTime?: number;
  maxOrderQuantity?: number;
  allowExcludeOptionalIngredients?: boolean;
  orderMergeTimeframeMinutes?: number;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  deliveryRadius?: number;
  deliveryRatePerKilometer?: number;
  useDynamicDeliveryFee?: boolean;
  useTieredDeliveryFee?: boolean;
  initialDeliveryRange?: number;
  initialDeliveryPrice?: number;
  extendedDeliveryThreshold?: number | null;
  extendedDeliveryRate?: number | null;
  deliveryTimeEstimate?: number;
  enableFreeDelivery?: boolean;
  freeDeliveryThreshold?: number;
  acceptCash?: boolean;
  acceptCard?: boolean;
  acceptOnlinePayment?: boolean;
  pickupAcceptCash?: boolean;
  pickupAcceptCard?: boolean;
  pickupAcceptOnlinePayment?: boolean;
  pickupAcceptPayPal?: boolean;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  // Application Status
  appStatus?: string;
  // Serving Hours
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
  // Future Order Settings
  futureOrdersEnabled?: boolean;
  enableFuturePickupOrders?: boolean;
  futurePickupOrderDays?: number;
  enableFutureDeliveryOrders?: boolean;
  futureDeliveryOrderDays?: number;
  // Scheduled Order Merge Settings
  allowScheduledOrderMerge?: boolean;
  scheduledOrderMergeCutoffHours?: number;
  // Scheduled Order Management Settings
  scheduledOrderAllowCancellation?: boolean;
  scheduledOrderCancellationWindowHours?: number;
  scheduledOrderFullRefundHoursBefore?: number;
  scheduledOrderPartialRefundHoursBefore?: number;
  scheduledOrderNoRefundHoursBefore?: number;
  scheduledOrderPartialRefundPercentage?: number;
  scheduledOrderReducedRefundPercentage?: number;
  scheduledOrderAutoConfirm?: boolean;
  scheduledOrderMinimumAmount?: number;
  scheduledOrderAllowModification?: boolean;
  scheduledOrderAllowShallowModification?: boolean;
  scheduledOrderModificationWindowHours?: number;
  // Scheduled Order Time Slot Settings
  scheduledOrderTimeSlotInterval?: number;
  scheduledOrderMaxOrdersPerSlot?: number | null;
};

// These will be populated with translations in the component
const CURRENCIES = [
  { value: "USD", labelKey: "admin.settings.financialSettings.currencies.USD" },
  { value: "EUR", labelKey: "admin.settings.financialSettings.currencies.EUR" },
  { value: "GBP", labelKey: "admin.settings.financialSettings.currencies.GBP" },
  { value: "INR", labelKey: "admin.settings.financialSettings.currencies.INR" },
  { value: "AED", labelKey: "admin.settings.financialSettings.currencies.AED" },
];

const APP_STATUSES = [
  { value: "LIVE", labelKey: "admin.settings.appStatus.statusLabels.LIVE" },
  { value: "COMING_SOON", labelKey: "admin.settings.appStatus.statusLabels.COMING_SOON" },
  { value: "MAINTENANCE", labelKey: "admin.settings.appStatus.statusLabels.MAINTENANCE" },
  { value: "OUT_OF_SERVICE", labelKey: "admin.settings.appStatus.statusLabels.OUT_OF_SERVICE" },
];

const SERVICE_TYPES = [
  { value: "RESTAURANT", labelKey: "admin.serviceType.restaurant" },
  { value: "MEAT_SHOP", labelKey: "admin.serviceType.meatShop" },
  { value: "BAKERY", labelKey: "admin.serviceType.bakery" },
  { value: "FOOD_TRUCK", labelKey: "admin.serviceType.foodTruck" },
] as const;

const DAYS_OF_WEEK = [
  { key: "monday", labelKey: "admin.settings.servingHours.monday" },
  { key: "tuesday", labelKey: "admin.settings.servingHours.tuesday" },
  { key: "wednesday", labelKey: "admin.settings.servingHours.wednesday" },
  { key: "thursday", labelKey: "admin.settings.servingHours.thursday" },
  { key: "friday", labelKey: "admin.settings.servingHours.friday" },
  { key: "saturday", labelKey: "admin.settings.servingHours.saturday" },
  { key: "sunday", labelKey: "admin.settings.servingHours.sunday" },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { getToken } = useAuthRole();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Settings>({});
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  // Address autocomplete states
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [countryLoading, setCountryLoading] = useState(false);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [showStateSuggestions, setShowStateSuggestions] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [countryHasStates, setCountryHasStates] = useState(true);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showAppStatusPicker, setShowAppStatusPicker] = useState(false);
  const [showServiceTypePicker, setShowServiceTypePicker] = useState(false);
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [timePickerState, setTimePickerState] = useState<{
    visible: boolean;
    day: string;
    periodIndex: number;
    type: "open" | "close";
    date: Date;
  }>({
    visible: false,
    day: "",
    periodIndex: 0,
    type: "open",
    date: new Date(),
  });

  // Number input text states
  const [taxText, setTaxText] = useState("");
  const [serviceTaxText, setServiceTaxText] = useState("");
  const [deliveryTaxText, setDeliveryTaxText] = useState("");
  const [deliveryFeeText, setDeliveryFeeText] = useState("");
  const [minOrderText, setMinOrderText] = useState("");
  const [prepTimeText, setPrepTimeText] = useState("");
  const [maxQtyText, setMaxQtyText] = useState("");
  const [orderMergeText, setOrderMergeText] = useState("");

  const timeZones = useMemo(() => getSupportedTimeZones(), []);
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const filteredTimeZones = useMemo(() => {
    const q = timezoneSearch.trim().toLowerCase();
    if (!q) return timeZones;
    const matches = timeZones.filter((tz) => tz.toLowerCase().includes(q));
    return matches.length > 0 ? matches : timeZones;
  }, [timeZones, timezoneSearch]);
  const [radiusText, setRadiusText] = useState("");
  const [ratePerKmText, setRatePerKmText] = useState("");
  const [initialRangeText, setInitialRangeText] = useState("");
  const [initialPriceText, setInitialPriceText] = useState("");
  const [extendedThresholdText, setExtendedThresholdText] = useState("");
  const [extendedRateText, setExtendedRateText] = useState("");
  const [timeEstimateText, setTimeEstimateText] = useState("");
  const [freeDeliveryText, setFreeDeliveryText] = useState("");
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  // Future order settings text states
  const [futurePickupDaysText, setFuturePickupDaysText] = useState("");
  const [futureDeliveryDaysText, setFutureDeliveryDaysText] = useState("");
  const [timeSlotIntervalText, setTimeSlotIntervalText] = useState("");
  const [mergeCutoffHoursText, setMergeCutoffHoursText] = useState("");
  const [cancellationWindowText, setCancellationWindowText] = useState("");
  const [fullRefundHoursText, setFullRefundHoursText] = useState("");
  const [partialRefundHoursText, setPartialRefundHoursText] = useState("");
  const [noRefundHoursText, setNoRefundHoursText] = useState("");
  const [partialRefundPercentText, setPartialRefundPercentText] = useState("");
  const [reducedRefundPercentText, setReducedRefundPercentText] = useState("");
  const [scheduledMinAmountText, setScheduledMinAmountText] = useState("");
  const [modificationWindowText, setModificationWindowText] = useState("");
  const [maxOrdersPerSlotText, setMaxOrdersPerSlotText] = useState("");

  const MAX_LOGO_BYTES = 1024 * 1024; // 1MB

  const [showLogoPickerModal, setShowLogoPickerModal] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);

  const [showSeoImagePickerModal, setShowSeoImagePickerModal] = useState(false);
  const [isUploadingSeoImage, setIsUploadingSeoImage] = useState(false);
  const [seoImageLocalUri, setSeoImageLocalUri] = useState<string | null>(null);

  const [organizationMeta, setOrganizationMeta] = useState<{
    id: string;
    name: string;
    slug: string;
  } | null>(null);

  const getImageSrc = useCallback((val?: string | null) => {
    if (!val) return "";
    const trimmed = String(val).trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("file:") || trimmed.startsWith("http")) return trimmed;
    if (trimmed.startsWith("/api/upload/images/") || trimmed.startsWith("/uploads/images/")) {
      return `${API_BASE_URL}${trimmed}`;
    }
    return `${API_BASE_URL}/api/upload/images/${trimmed}`;
  }, []);

  const orgQrUrl = (() => {
    const slug = (organizationMeta?.slug || "").trim();
    if (!slug) return "";
    return `${FRONTEND_ORIGIN}/?org=${encodeURIComponent(slug)}`;
  })();

  const orgQrImageUrl = orgQrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(orgQrUrl)}`
    : "";

  const updateNumber = (
    key: keyof Settings,
    text: string,
    allowDecimal = true
  ) => {
    let cleaned = text.replace(/[^0-9.]/g, "");
    if (!allowDecimal) cleaned = cleaned.replace(/\./g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    setFormData((prev) => ({
      ...prev,
      [key]: cleaned === "" || cleaned === "." ? undefined : Number(cleaned),
    }));
    return cleaned;
  };

  // Convert time string (e.g., "9:00 AM") to Date object
  const parseTimeString = (timeStr: string): Date => {
    if (!timeStr) {
      const now = new Date();
      now.setHours(9, 0, 0, 0);
      return now;
    }
    
    // Parse "9:00 AM" or "10:00 PM" format
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const isPM = match[3].toUpperCase() === "PM";
      
      let hour24 = hours;
      if (isPM && hours !== 12) hour24 = hours + 12;
      if (!isPM && hours === 12) hour24 = 0;
      
      const date = new Date();
      date.setHours(hour24, minutes, 0, 0);
      return date;
    }
    
    // Fallback: try to parse as 24-hour format "HH:mm"
    const parts = timeStr.split(":");
    if (parts.length === 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    }
    
    // Default to 9:00 AM
    const date = new Date();
    date.setHours(9, 0, 0, 0);
    return date;
  };

  // Convert Date object to 12-hour time string (e.g., "9:00 AM")
  const formatTimeString = (date: Date): string => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const isPM = hours >= 12;
    
    if (hours === 0) hours = 12;
    else if (hours > 12) hours = hours - 12;
    
    const minutesStr = minutes.toString().padStart(2, "0");
    return `${hours}:${minutesStr} ${isPM ? "PM" : "AM"}`;
  };

  // Open time picker
  const openTimePicker = (day: string, periodIndex: number, type: "open" | "close", currentTime: string) => {
    const date = parseTimeString(currentTime);
    setTimePickerState({
      visible: true,
      day,
      periodIndex,
      type,
      date,
    });
  };

  // Get periods for a day (with backward compatibility)
  const getDayPeriods = (day: string): Array<{ open: string; close: string }> => {
    const periodsKey = `${day}Periods` as keyof Settings;
    const periods = formData[periodsKey] as Array<{ open: string; close: string }> | undefined;
    
    if (periods && Array.isArray(periods) && periods.length > 0) {
      return periods;
    }
    
    // Fallback to single open/close for backward compatibility
    const openKey = `${day}Open` as keyof Settings;
    const closeKey = `${day}Close` as keyof Settings;
    const open = formData[openKey] as string | undefined;
    const close = formData[closeKey] as string | undefined;
    
    if (open && close) {
      // Convert single period to array format
      return [{ open, close }];
    }
    
    // Return default period if nothing is set
    return [{ open: "", close: "" }];
  };

  // Update period time
  const updatePeriodTime = (day: string, periodIndex: number, type: "open" | "close", time: string) => {
    const periodsKey = `${day}Periods` as keyof Settings;
    const currentPeriods = getDayPeriods(day);
    
    // Ensure period exists
    while (currentPeriods.length <= periodIndex) {
      currentPeriods.push({ 
        open: t("admin.settings.servingHours.defaultOpenTime"), 
        close: t("admin.settings.servingHours.defaultCloseTime") 
      });
    }
    
    // Update the period
    currentPeriods[periodIndex] = {
      ...currentPeriods[periodIndex],
      [type]: time,
    };
    
    setFormData({
      ...formData,
      [periodsKey]: currentPeriods,
    });
  };

  // Add new period
  const addPeriod = (day: string) => {
    const periodsKey = `${day}Periods` as keyof Settings;
    const currentPeriods = getDayPeriods(day);
    const newPeriods = [...currentPeriods, { 
      open: t("admin.settings.servingHours.defaultOpenTime"), 
      close: t("admin.settings.servingHours.defaultCloseTime") 
    }];
    
    setFormData({
      ...formData,
      [periodsKey]: newPeriods,
    });
  };

  // Remove period
  const removePeriod = (day: string, periodIndex: number) => {
    const periodsKey = `${day}Periods` as keyof Settings;
    const currentPeriods = getDayPeriods(day);
    
    if (currentPeriods.length <= 1) {
      // Can't remove the last period, just clear it
      setFormData({
        ...formData,
        [periodsKey]: [{ open: "", close: "" }],
      });
      return;
    }
    
    const newPeriods = currentPeriods.filter((_, index) => index !== periodIndex);
    setFormData({
      ...formData,
      [periodsKey]: newPeriods,
    });
  };

  // Handle time picker change
  const handleTimePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setTimePickerState((prev) => ({ ...prev, visible: false }));
    }
    
    if (event.type === "set" && selectedDate) {
      const timeStr = formatTimeString(selectedDate);
      updatePeriodTime(timePickerState.day, timePickerState.periodIndex, timePickerState.type, timeStr);
      
      if (Platform.OS === "ios") {
        setTimePickerState((prev) => ({ ...prev, date: selectedDate }));
      }
    } else if (event.type === "dismissed") {
      setTimePickerState((prev) => ({ ...prev, visible: false }));
    }
  };

  // Get app status color
  const getAppStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      LIVE: "#10b981",
      COMING_SOON: "#f59e0b",
      MAINTENANCE: "#f97316",
      OUT_OF_SERVICE: "#ef4444",
    };
    return colors[status] || "#6b7280";
  };

  // Get app status label
  const getAppStatusLabel = (status: string, t: any): string => {
    const statusKeyMap: Record<string, string> = {
      LIVE: "live",
      COMING_SOON: "comingSoon",
      MAINTENANCE: "maintenance",
      OUT_OF_SERVICE: "outOfService",
    };
    const statusKey = statusKeyMap[status] || status.toLowerCase();
    return t(`appStatus.states.${statusKey}.label`, { defaultValue: status });
  };

  // Check country states when country changes
  useEffect(() => {
    if (formData.country) {
      googlePlacesService
        .checkCountryHasStates(formData.country)
        .then(setCountryHasStates);
    }
  }, [formData.country]);

  // Reverse geocode when lat/lng are manually entered
  useEffect(() => {
    const lat = formData.latitude;
    const lng = formData.longitude;

    // Skip if values are undefined or null
    if (
      lat === undefined ||
      lat === null ||
      lng === undefined ||
      lng === null
    ) {
      return;
    }

    // Convert to numbers and validate
    const latNum = Number(lat);
    const lngNum = Number(lng);

    // Validate that they are valid numbers and within valid ranges
    // Exclude 0,0 as it's likely invalid (Gulf of Guinea)
    if (
      typeof latNum === "number" &&
      typeof lngNum === "number" &&
      !isNaN(latNum) &&
      !isNaN(lngNum) &&
      isFinite(latNum) &&
      isFinite(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180 &&
      !(latNum === 0 && lngNum === 0)
    ) {
      const timeoutId = setTimeout(() => {
        setReverseGeocoding(true);
        googlePlacesService
          .reverseGeocode(latNum, lngNum)
          .then((components) => {
            setReverseGeocoding(false);
            if (components) {
              handleAddressChange(components);
            }
          })
          .catch(() => {
            setReverseGeocoding(false);
          });
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [formData.latitude, formData.longitude]);

  const handleAddressChange = useCallback((components: AddressComponents) => {
    setFormData((prev) => ({
      ...prev,
      country: components.country,
      state: components.state,
      city: components.city,
      addressLineOne: components.addressLineOne,
      latitude: components.latitude,
      longitude: components.longitude,
      businessAddress: components.formattedAddress,
    }));
    setLatText(String(components.latitude));
    setLngText(String(components.longitude));
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setGettingLocation(true);
    googlePlacesService.getCurrentLocation(
      (components) => {
        setGettingLocation(false);
        handleAddressChange(components);
      },
      () => {
        setGettingLocation(false);
      }
    );
  }, [handleAddressChange]);

  const handleCountryInputChange = useCallback(async (value: string) => {
    setFormData((prev) => ({ ...prev, country: value }));
    setShowCountrySuggestions(false);

    if (value.length >= 2) {
      setShowCountrySuggestions(true);
      setCountryLoading(true);
      const countries = await googlePlacesService.searchCountries(value);
      setCountrySuggestions(countries);
      setCountryLoading(false);

      // Check if country has states
      if (countries.length > 0) {
        const hasStates = await googlePlacesService.checkCountryHasStates(
          countries[0]
        );
        setCountryHasStates(hasStates);
      }
    } else {
      setCountrySuggestions([]);
      setShowCountrySuggestions(false);
    }
  }, []);

  const handleStateInputChange = useCallback(
    async (value: string) => {
      setFormData((prev) => ({ ...prev, state: value }));
      setShowStateSuggestions(false);

      if (value.length >= 1 && formData.country) {
        setShowStateSuggestions(true);
        setStateLoading(true);
        const states = await googlePlacesService.searchStates(
          value,
          formData.country
        );
        setStateSuggestions(states);
        setStateLoading(false);
      } else {
        setStateSuggestions([]);
        setShowStateSuggestions(false);
      }
    },
    [formData.country]
  );

  const handleCityInputChange = useCallback(
    async (value: string) => {
      setFormData((prev) => ({ ...prev, city: value }));
      setShowCitySuggestions(false);

      if (value.length >= 1 && formData.country) {
        setShowCitySuggestions(true);
        setCityLoading(true);
        const cities = await googlePlacesService.searchCities(
          value,
          formData.country,
          formData.state
        );
        setCitySuggestions(cities);
        setCityLoading(false);
      } else {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
      }
    },
    [formData.country, formData.state]
  );

  const handleAddressInputChange = useCallback(
    async (value: string) => {
      setFormData((prev) => ({ ...prev, addressLineOne: value }));
      setShowAddressSuggestions(false);

      if (value.length >= 1 && formData.country && formData.city) {
        setShowAddressSuggestions(true);
        setAddressLoading(true);
        const addresses = await googlePlacesService.searchAddresses(
          value,
          formData.country,
          formData.city,
          formData.state
        );
        setAddressSuggestions(addresses.map((a) => a.description));
        setAddressLoading(false);
      } else {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      }
    },
    [formData.country, formData.city, formData.state]
  );

  const loadSettings = useCallback(
    async (opts?: { isRefresh?: boolean }) => {
    try {
      if (!selectedOrganizationId) {
        setFormData({});
        return;
      }

      const isRefresh = !!opts?.isRefresh;
      if (!isRefresh) {
        setLoading(true);
      }
      const token = (await getToken()) || undefined;
      const apiService = ApiService.getInstance();
      const response = await apiService.get(
        `/api/admin/organizations/${selectedOrganizationId}/settings`,
        token,
        {
          skipOrgHeader: true,
          headers: {
            "x-organization-id": selectedOrganizationId,
          },
        }
      );
      const payload = (response as any)?.data?.data ?? (response as any)?.data ?? {};
      const d: Settings = (payload || {}) as Settings;
      setFormData({
        ...d,
        serviceType: (d.serviceType as any) || "RESTAURANT",
      });
      // Seed text fields
      setTaxText(d.taxPercentage != null ? String(d.taxPercentage) : "");
      setServiceTaxText(
        d.serviceTaxPercentage != null ? String(d.serviceTaxPercentage) : ""
      );
      setDeliveryTaxText(
        d.deliveryTaxPercentage != null ? String(d.deliveryTaxPercentage) : ""
      );
      setDeliveryFeeText(d.deliveryFee != null ? String(d.deliveryFee) : "");
      setMinOrderText(
        d.minimumOrderAmount != null ? String(d.minimumOrderAmount) : ""
      );
      setPrepTimeText(
        d.orderPreparationTime != null ? String(d.orderPreparationTime) : ""
      );
      setMaxQtyText(
        d.maxOrderQuantity != null ? String(d.maxOrderQuantity) : ""
      );
      setOrderMergeText(
        d.orderMergeTimeframeMinutes != null ? String(d.orderMergeTimeframeMinutes) : ""
      );
      setRadiusText(d.deliveryRadius != null ? String(d.deliveryRadius) : "");
      setRatePerKmText(
        d.deliveryRatePerKilometer != null
          ? String(d.deliveryRatePerKilometer)
          : ""
      );
      setInitialRangeText(
        d.initialDeliveryRange != null ? String(d.initialDeliveryRange) : ""
      );
      setInitialPriceText(
        d.initialDeliveryPrice != null ? String(d.initialDeliveryPrice) : ""
      );
      setExtendedThresholdText(
        d.extendedDeliveryThreshold != null
          ? String(d.extendedDeliveryThreshold)
          : ""
      );
      setExtendedRateText(
        d.extendedDeliveryRate != null ? String(d.extendedDeliveryRate) : ""
      );
      setTimeEstimateText(
        d.deliveryTimeEstimate != null ? String(d.deliveryTimeEstimate) : ""
      );
      setFreeDeliveryText(
        d.freeDeliveryThreshold != null ? String(d.freeDeliveryThreshold) : ""
      );
      setLatText(d.latitude != null ? String(d.latitude) : "");
      setLngText(d.longitude != null ? String(d.longitude) : "");
      // Future order settings
      setFuturePickupDaysText(
        d.futurePickupOrderDays != null ? String(d.futurePickupOrderDays) : ""
      );
      setFutureDeliveryDaysText(
        d.futureDeliveryOrderDays != null ? String(d.futureDeliveryOrderDays) : ""
      );
      setTimeSlotIntervalText(
        d.scheduledOrderTimeSlotInterval != null ? String(d.scheduledOrderTimeSlotInterval) : "30"
      );
      setMergeCutoffHoursText(
        d.scheduledOrderMergeCutoffHours != null ? String(d.scheduledOrderMergeCutoffHours) : ""
      );
      setCancellationWindowText(
        d.scheduledOrderCancellationWindowHours != null ? String(d.scheduledOrderCancellationWindowHours) : ""
      );
      setFullRefundHoursText(
        d.scheduledOrderFullRefundHoursBefore != null ? String(d.scheduledOrderFullRefundHoursBefore) : ""
      );
      setPartialRefundHoursText(
        d.scheduledOrderPartialRefundHoursBefore != null ? String(d.scheduledOrderPartialRefundHoursBefore) : ""
      );
      setNoRefundHoursText(
        d.scheduledOrderNoRefundHoursBefore != null ? String(d.scheduledOrderNoRefundHoursBefore) : ""
      );
      setPartialRefundPercentText(
        d.scheduledOrderPartialRefundPercentage != null ? String(d.scheduledOrderPartialRefundPercentage) : ""
      );
      setReducedRefundPercentText(
        d.scheduledOrderReducedRefundPercentage != null ? String(d.scheduledOrderReducedRefundPercentage) : ""
      );
      setScheduledMinAmountText(
        d.scheduledOrderMinimumAmount != null ? String(d.scheduledOrderMinimumAmount) : ""
      );
      setModificationWindowText(
        d.scheduledOrderModificationWindowHours != null ? String(d.scheduledOrderModificationWindowHours) : ""
      );
      setMaxOrdersPerSlotText(
        d.scheduledOrderMaxOrdersPerSlot != null ? String(d.scheduledOrderMaxOrdersPerSlot) : ""
      );
    } catch (e) {
      console.error("Load settings error:", e);
      setToast({
        visible: true,
        message: t("admin.settings.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    },
    [getToken, selectedOrganizationId, t]
  );

  useEffect(() => {
    const loadOrgMeta = async () => {
      try {
        if (!selectedOrganizationId) {
          setOrganizationMeta(null);
          return;
        }
        const token = (await getToken()) || undefined;
        if (!token) return;

        const org = await branchService.getOrganizationById(selectedOrganizationId, token);
        const slug = String((org as any)?.slug || "").trim();
        if (!slug) {
          setOrganizationMeta(null);
          return;
        }
        setOrganizationMeta({
          id: org.id,
          name: String(org.name || ""),
          slug,
        });
      } catch {
        setOrganizationMeta(null);
      }
    };

    void loadOrgMeta();
  }, [getToken, selectedOrganizationId]);

  useEffect(() => {
    if (organizationLoading) return;

    setFormData({});
    setTaxText("");
    setServiceTaxText("");
    setDeliveryTaxText("");
    setDeliveryFeeText("");
    setMinOrderText("");
    setPrepTimeText("");
    setMaxQtyText("");
    setOrderMergeText("");
    setRadiusText("");
    setRatePerKmText("");
    setInitialRangeText("");
    setInitialPriceText("");
    setExtendedThresholdText("");
    setExtendedRateText("");
    setTimeEstimateText("");
    setFreeDeliveryText("");
    setLatText("");
    setLngText("");
    setFuturePickupDaysText("");
    setFutureDeliveryDaysText("");
    setTimeSlotIntervalText("30");
    setMergeCutoffHoursText("");
    setCancellationWindowText("");
    setFullRefundHoursText("");
    setPartialRefundHoursText("");
    setNoRefundHoursText("");
    setPartialRefundPercentText("");
    setReducedRefundPercentText("");
    setScheduledMinAmountText("");
    setModificationWindowText("");
    setMaxOrdersPerSlotText("");

    setLogoLocalUri(null);
    setSeoImageLocalUri(null);

    loadSettings();
  }, [selectedOrganizationId, organizationLoading, loadSettings]);

  useEffect(() => {
    (async () => {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!cameraPermission.granted || !mediaPermission.granted) {
        Alert.alert(
          t("admin.menuManagement.permissionsRequired"),
          t("admin.menuManagement.grantPermissions")
        );
      }
    })();
  }, [t]);

  const uploadImageToServer = useCallback(
    async (imageUri: string): Promise<string> => {
      const token = await getToken();
      const uploadFormData = new FormData();
      const filename = imageUri.split("/").pop() || `image_${Date.now()}.jpg`;
      const match = /(\.\w+)$/.exec(filename);
      const type = match ? `image/${match[1].replace(".", "")}` : "image/jpeg";

      // @ts-ignore - RN FormData file
      uploadFormData.append("image", {
        uri: imageUri,
        name: filename,
        type,
      } as any);

      const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadFormData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const json = await response.json();
      if (json?.success && json?.data?.filename) {
        return String(json.data.filename);
      }
      throw new Error("Invalid upload response");
    },
    [getToken]
  );

  const pickAndUploadLogo = useCallback(
    async (mode: "library" | "camera") => {
      try {
        setShowLogoPickerModal(false);
        let result;
        if (mode === "camera") {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          });
        } else {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          });
        }

        if (result.canceled || !result.assets?.[0]?.uri) return;
        const asset = result.assets[0];

        if (asset.fileSize && asset.fileSize > MAX_LOGO_BYTES) {
          setToast({
            visible: true,
            message: t("admin.settings.businessInformation.businessLogoTooLarge"),
            type: "error",
          });
          return;
        }

        setIsUploadingLogo(true);
        setLogoLocalUri(asset.uri);

        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        const filename = await uploadImageToServer(manipulated.uri);
        setFormData((prev) => ({ ...prev, businessLogo: filename }));

        setToast({
          visible: true,
          message: t("admin.settings.businessInformation.businessLogoUploaded"),
          type: "success",
        });
      } catch (e) {
        console.error("Logo upload error:", e);
        setToast({
          visible: true,
          message: t("admin.settings.businessInformation.businessLogoUploadError"),
          type: "error",
        });
      } finally {
        setIsUploadingLogo(false);
      }
    },
    [MAX_LOGO_BYTES, t, uploadImageToServer]
  );

  const removeLogo = useCallback(() => {
    setLogoLocalUri(null);
    setFormData((prev) => ({ ...prev, businessLogo: "" }));
  }, []);

  const pickAndUploadSeoImage = useCallback(
    async (mode: "library" | "camera") => {
      try {
        setShowSeoImagePickerModal(false);
        let result;
        if (mode === "camera") {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          });
        } else {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          });
        }

        if (result.canceled || !result.assets?.[0]?.uri) return;
        const asset = result.assets[0];

        if (asset.fileSize && asset.fileSize > MAX_LOGO_BYTES) {
          setToast({
            visible: true,
            message: t("admin.settings.seo.ogImageTooLarge"),
            type: "error",
          });
          return;
        }

        setIsUploadingSeoImage(true);
        setSeoImageLocalUri(asset.uri);

        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        const filename = await uploadImageToServer(manipulated.uri);
        setFormData((prev) => ({ ...prev, seoOgImage: filename }));

        setToast({
          visible: true,
          message: t("admin.settings.seo.ogImageUploaded"),
          type: "success",
        });
      } catch (e) {
        console.error("SEO image upload error:", e);
        setToast({
          visible: true,
          message: t("admin.settings.seo.ogImageUploadError"),
          type: "error",
        });
      } finally {
        setIsUploadingSeoImage(false);
      }
    },
    [MAX_LOGO_BYTES, t, uploadImageToServer]
  );

  const removeSeoImage = useCallback(() => {
    setSeoImageLocalUri(null);
    setFormData((prev) => ({ ...prev, seoOgImage: "" }));
  }, []);

  const shareQrLink = useCallback(async () => {
    if (!orgQrUrl) return;
    try {
      await Share.share({ message: orgQrUrl });
    } catch {
      // ignore
    }
  }, [orgQrUrl]);

  const downloadQrCode = useCallback(async () => {
    if (!orgQrImageUrl) return;
    try {
      const supported = await Linking.canOpenURL(orgQrImageUrl);
      if (!supported) {
        throw new Error("Unsupported URL");
      }
      await Linking.openURL(orgQrImageUrl);
    } catch (e) {
      console.error("Download QR error:", e);
      setToast({
        visible: true,
        message: t("admin.settings.qrCode.downloadError"),
        type: "error",
      });
    }
  }, [orgQrImageUrl, t]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSettings({ isRefresh: true });
  };

  const handleSave = async () => {
    try {
      if (!selectedOrganizationId) {
        setToast({
          visible: true,
          message: t("admin.settings.loadError"),
          type: "error",
        });
        return;
      }

      setSaving(true);
      const token = (await getToken()) || undefined;
      const apiService = ApiService.getInstance();
      await apiService.put(
        `/api/admin/organizations/${selectedOrganizationId}/settings`,
        formData,
        token,
        {
          skipOrgHeader: true,
          headers: {
            "x-organization-id": selectedOrganizationId,
          },
        }
      );
      setToast({
        visible: true,
        message: t("admin.settings.saveSuccess"),
        type: "success",
      });
    } catch (e) {
      console.error("Save settings error:", e);
      setToast({
        visible: true,
        message: t("admin.settings.saveError"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      if (!selectedOrganizationId) {
        return;
      }

      setSaving(true);
      await loadSettings({ isRefresh: true });
      setToast({
        visible: true,
        message: t("admin.settings.resetSuccess"),
        type: "success",
      });
    } catch (e) {
      console.error("Reset settings error:", e);
      setToast({
        visible: true,
        message: t("admin.settings.resetError"),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  // Only show full-screen loader when loading and no data exists
  const hasData = formData.businessName !== undefined || formData.businessEmail !== undefined;
  if (loading && !hasData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>
          {t("admin.settings.loadingTitle")}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: headerHeight - 8, paddingBottom: 40 }}
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
        {/* Header actions */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerButtonOutline}
            onPress={handleReset}
            disabled={saving}
          >
            <MaterialCommunityIcons name="restore" size={16} color="#D1D5DB" />
            <Text style={styles.headerButtonOutlineText}>
              {t("admin.settings.resetToDefaults")}
            </Text>
          </TouchableOpacity>
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
              {t("admin.settings.saveChanges")}
            </Text>
          </TouchableOpacity>
        </View>
        {/* Business Information */}
        <CollapsibleCard
          titleIcon="account"
          title={t("admin.settings.businessInformation.title")}
          description={t("admin.settings.businessInformation.description")}
        >
            <InputField
              label={t("admin.settings.businessInformation.businessName")}
              value={formData.businessName || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, businessName: text })
              }
              placeholder={t(
                "admin.settings.businessInformation.businessNamePlaceholder"
              )}
            />

            <View style={styles.selectField}>
              <Text style={styles.label}>{t("admin.serviceType.label")}</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowServiceTypePicker(true)}
              >
                <Text style={styles.selectButtonText}>
                  {(() => {
                    const current = (formData.serviceType || "RESTAURANT") as any;
                    const opt = SERVICE_TYPES.find((s) => s.value === current);
                    return opt ? t(opt.labelKey) : String(current);
                  })()}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.selectField}>
              <Text style={styles.label}>{t("admin.settings.businessInformation.timezone")}</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowTimezonePicker(true)}
              >
                <Text style={styles.selectButtonText} numberOfLines={1}>
                  {(formData.timezone && String(formData.timezone).trim()) || deviceTimeZone}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.headerButtonPrimary, { alignSelf: "flex-start", marginBottom: 12 }]}
              onPress={() => setFormData({ ...formData, timezone: deviceTimeZone })}
            >
              <MaterialCommunityIcons name="target" size={16} color="#fff" />
              <Text style={styles.headerButtonPrimaryText}>
                {t("admin.settings.businessInformation.useDeviceTimezone")}
              </Text>
            </TouchableOpacity>

            <InputField
              label={t("admin.settings.businessInformation.businessEmail")}
              value={formData.businessEmail || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, businessEmail: text })
              }
              placeholder={t(
                "admin.settings.businessInformation.businessEmailPlaceholder"
              )}
              keyboardType="email-address"
            />
            <InputField
              label={t("admin.settings.businessInformation.businessPhone")}
              value={formData.businessPhone || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, businessPhone: text })
              }
              placeholder={t(
                "admin.settings.businessInformation.businessPhonePlaceholder"
              )}
              keyboardType="phone-pad"
            />

            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>
                {t("admin.settings.businessInformation.businessLogo")}
              </Text>

              {(logoLocalUri || formData.businessLogo) ? (
                <View style={styles.imageRowCard}>
                  <View style={styles.imageRowLeft}>
                    <View style={styles.imageThumbWrap}>
                      <Image
                        source={{
                          uri:
                            logoLocalUri ||
                            getImageSrc(formData.businessLogo || "") ||
                            undefined,
                        }}
                        style={styles.imageThumb}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.imageRowTitle} numberOfLines={1}>
                        {t("admin.settings.businessInformation.businessLogo")}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.imageRowAction}
                    onPress={removeLogo}
                    disabled={isUploadingLogo}
                  >
                    <MaterialCommunityIcons name="delete" size={18} color="#fff" />
                    <Text style={styles.imageRowActionText}>
                      {t("admin.settings.businessInformation.businessLogoRemove")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.imageActionsRow}>
                <TouchableOpacity
                  style={styles.imagePickButton}
                  onPress={() => setShowLogoPickerModal(true)}
                  disabled={isUploadingLogo}
                >
                  {isUploadingLogo ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    <MaterialCommunityIcons name="upload" size={18} color="#ec4899" />
                  )}
                  <Text style={styles.imagePickButtonText}>
                    {t("admin.settings.businessInformation.businessLogoSelect")}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>
                {t("admin.settings.businessInformation.businessLogoHint")}
              </Text>
            </View>

            <Separator />
            <View style={styles.addressSection}>
              <View style={styles.addressHeader}>
                <Text style={styles.sectionTitle}>
                  {t("admin.settings.businessInformation.addressInformation")}
                </Text>
                <TouchableOpacity
                  style={styles.gpsButton}
                  onPress={getCurrentLocation}
                  disabled={gettingLocation}
                >
                  {gettingLocation ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    <MaterialCommunityIcons name="map-marker" size={16} color="#ec4899" />
                  )}
                  <Text style={styles.gpsButtonText}>
                    {gettingLocation
                      ? t("admin.settings.businessInformation.gettingLocation")
                      : t("admin.settings.businessInformation.useGPS")}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>
                {t("admin.settings.businessInformation.addressInformationDescription")}
              </Text>
              <AutocompleteField
                label={t("admin.settings.businessInformation.country")}
                value={formData.country || ""}
                onChangeText={handleCountryInputChange}
                suggestions={countrySuggestions}
                showSuggestions={showCountrySuggestions}
                onSelectSuggestion={(suggestion) => {
                  setFormData((prev) => ({ ...prev, country: suggestion }));
                  setShowCountrySuggestions(false);
                  googlePlacesService
                    .checkCountryHasStates(suggestion)
                    .then(setCountryHasStates);
                }}
                loading={countryLoading}
                placeholder={t(
                  "admin.settings.businessInformation.countryPlaceholder"
                )}
              />
              {countryHasStates && (
                <AutocompleteField
                  label={t("admin.settings.businessInformation.stateProvince")}
                  value={formData.state || ""}
                  onChangeText={handleStateInputChange}
                  suggestions={stateSuggestions}
                  showSuggestions={showStateSuggestions}
                  onSelectSuggestion={(suggestion) => {
                    setFormData((prev) => ({ ...prev, state: suggestion }));
                    setShowStateSuggestions(false);
                  }}
                  loading={stateLoading}
                  placeholder={t(
                    "admin.settings.businessInformation.stateProvincePlaceholder"
                  )}
                  disabled={!formData.country}
                />
              )}
              <AutocompleteField
                label={t("admin.settings.businessInformation.city")}
                value={formData.city || ""}
                onChangeText={handleCityInputChange}
                suggestions={citySuggestions}
                showSuggestions={showCitySuggestions}
                onSelectSuggestion={(suggestion) => {
                  setFormData((prev) => ({ ...prev, city: suggestion }));
                  setShowCitySuggestions(false);
                }}
                loading={cityLoading}
                placeholder={t(
                  "admin.settings.businessInformation.cityPlaceholder"
                )}
                disabled={!formData.country}
              />
              <AutocompleteField
                label={t("admin.settings.businessInformation.addressLineOne")}
                value={formData.addressLineOne || ""}
                onChangeText={handleAddressInputChange}
                suggestions={addressSuggestions}
                showSuggestions={showAddressSuggestions}
                onSelectSuggestion={(suggestion) => {
                  setFormData((prev) => ({
                    ...prev,
                    addressLineOne: suggestion,
                  }));
                  setShowAddressSuggestions(false);
                }}
                loading={addressLoading}
                placeholder={t(
                  "admin.settings.businessInformation.addressLineOnePlaceholder"
                )}
                disabled={!formData.city || !formData.country}
              />
              <View style={styles.row}>
                <NumberField
                  label={t("admin.settings.businessInformation.latitude")}
                  text={latText}
                  setText={(txt) => {
                    setLatText(txt);
                    const num = parseFloat(txt);
                    if (!isNaN(num)) {
                      setFormData((prev) => ({ ...prev, latitude: num }));
                    }
                  }}
                  placeholder={t(
                    "admin.settings.businessInformation.latitudePlaceholder"
                  )}
                  loading={reverseGeocoding}
                />
                <NumberField
                  label={t("admin.settings.businessInformation.longitude")}
                  text={lngText}
                  setText={(txt) => {
                    setLngText(txt);
                    const num = parseFloat(txt);
                    if (!isNaN(num)) {
                      setFormData((prev) => ({ ...prev, longitude: num }));
                    }
                  }}
                  placeholder={t(
                    "admin.settings.businessInformation.longitudePlaceholder"
                  )}
                  loading={reverseGeocoding}
                />
              </View>
              <InputField
                label={t("admin.settings.businessInformation.fullAddress")}
                value={formData.businessAddress || ""}
                onChangeText={(text) =>
                  setFormData({ ...formData, businessAddress: text })
                }
                placeholder={t(
                  "admin.settings.businessInformation.fullAddressPlaceholder"
                )}
                multiline
                editable={false}
              />
            </View>
        </CollapsibleCard>

        <CollapsibleCard
          titleIcon="magnify"
          title={t("admin.settings.seo.title")}
          description={t("admin.settings.seo.description")}
        >
          <Text style={styles.helpText}>{t("admin.settings.seo.seoTitleHint")}</Text>
          <InputField
            label={t("admin.settings.seo.seoTitle")}
            value={formData.seoTitle || ""}
            onChangeText={(text) => setFormData({ ...formData, seoTitle: text })}
            placeholder={t("admin.settings.seo.seoTitlePlaceholder")}
          />

          <Text style={styles.helpText}>{t("admin.settings.seo.seoDescriptionHint")}</Text>
          <InputField
            label={t("admin.settings.seo.seoDescription")}
            value={formData.seoDescription || ""}
            onChangeText={(text) =>
              setFormData({ ...formData, seoDescription: text })
            }
            placeholder={t("admin.settings.seo.seoDescriptionPlaceholder")}
            multiline
          />

          <Text style={styles.helpText}>{t("admin.settings.seo.ogImageHint")}</Text>
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>{t("admin.settings.seo.ogImage")}</Text>

            {(seoImageLocalUri || formData.seoOgImage) ? (
              <View style={styles.imageRowCard}>
                <View style={styles.imageRowLeft}>
                  <View style={styles.imageThumbWrap}>
                    <Image
                      source={{
                        uri:
                          seoImageLocalUri ||
                          getImageSrc(formData.seoOgImage || "") ||
                          undefined,
                      }}
                      style={styles.imageThumb}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.imageRowTitle} numberOfLines={1}>
                      {t("admin.settings.seo.ogImage")}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.imageRowAction}
                  onPress={removeSeoImage}
                  disabled={isUploadingSeoImage}
                >
                  <MaterialCommunityIcons name="delete" size={18} color="#fff" />
                  <Text style={styles.imageRowActionText}>
                    {t("admin.settings.seo.ogImageRemove")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.imageActionsRow}>
              <TouchableOpacity
                style={styles.imagePickButton}
                onPress={() => setShowSeoImagePickerModal(true)}
                disabled={isUploadingSeoImage}
              >
                {isUploadingSeoImage ? (
                  <ActivityIndicator size="small" color="#ec4899" />
                ) : (
                  <MaterialCommunityIcons name="upload" size={18} color="#ec4899" />
                )}
                <Text style={styles.imagePickButtonText}>
                  {t("admin.settings.seo.chooseImage")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </CollapsibleCard>

        <CollapsibleCard
          titleIcon="qrcode"
          title={t("admin.settings.qrCode.title")}
          description={t("admin.settings.qrCode.description")}
        >
          {!organizationMeta?.slug ? (
            <Text style={styles.helpText}>
              {t("admin.settings.qrCode.selectOrganizationHint")}
            </Text>
          ) : (
            <>
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.label}>{t("admin.settings.qrCode.link")}</Text>
                <View style={styles.qrLinkRow}>
                  <Text style={styles.qrLinkText} numberOfLines={2}>
                    {orgQrUrl}
                  </Text>
                  <TouchableOpacity
                    style={styles.qrShareButton}
                    onPress={shareQrLink}
                  >
                    <MaterialCommunityIcons name="share" size={18} color="#fff" />
                    <Text style={styles.qrShareButtonText}>
                      {t("admin.settings.qrCode.share")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.qrCenter}>
                {orgQrImageUrl ? (
                  <View style={styles.qrImageWrap}>
                    <Image
                      source={{ uri: orgQrImageUrl }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.qrDownloadButtonBelow}
                  onPress={() => void downloadQrCode()}
                >
                  <MaterialCommunityIcons name="download" size={18} color="#fff" />
                  <Text style={styles.qrDownloadButtonBelowText}>
                    {t("admin.settings.qrCode.download")}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.helpText}>{t("admin.settings.qrCode.note")}</Text>
              </View>
            </>
          )}
        </CollapsibleCard>

        {/* Financial Settings */}
        <CollapsibleCard
          titleIcon="currency-usd"
          title={t("admin.settings.financialSettings.title")}
          description={t("admin.settings.financialSettings.description")}
        >
            <NumberField
              label={t("admin.settings.financialSettings.taxPercentage")}
              text={taxText}
              setText={(txt) =>
                setTaxText(updateNumber("taxPercentage", txt, true))
              }
              placeholder={t(
                "admin.settings.financialSettings.taxPercentagePlaceholder"
              )}
            />
            <NumberField
              label={t("admin.settings.financialSettings.serviceTaxPercentage")}
              text={serviceTaxText}
              setText={(txt) =>
                setServiceTaxText(updateNumber("serviceTaxPercentage", txt, true))
              }
              placeholder={t(
                "admin.settings.financialSettings.serviceTaxPercentagePlaceholder"
              )}
            />
            <NumberField
              label={t(
                "admin.settings.financialSettings.deliveryTaxPercentage"
              )}
              text={deliveryTaxText}
              setText={(txt) =>
                setDeliveryTaxText(
                  updateNumber("deliveryTaxPercentage", txt, true)
                )
              }
              placeholder={t(
                "admin.settings.financialSettings.deliveryTaxPercentagePlaceholder"
              )}
            />
            <NumberField
              label={t("admin.settings.financialSettings.deliveryFee")}
              text={deliveryFeeText}
              setText={(txt) =>
                setDeliveryFeeText(updateNumber("deliveryFee", txt, true))
              }
              placeholder={t(
                "admin.settings.financialSettings.deliveryFeePlaceholder"
              )}
            />
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.financialSettings.taxInclusive")}
              </Text>
              <Switch
                value={!!formData.taxInclusive}
                onValueChange={(v) =>
                  setFormData({ ...formData, taxInclusive: v })
                }
              />
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <NumberField
                  label={t(
                    "admin.settings.financialSettings.minimumOrderAmount"
                  )}
                  text={minOrderText}
                  setText={(txt) =>
                    setMinOrderText(
                      updateNumber("minimumOrderAmount", txt, true)
                    )
                  }
                  placeholder={t(
                    "admin.settings.financialSettings.minimumOrderAmountPlaceholder"
                  )}
                />
              </View>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.financialSettings.enableMinimumOrder")}
              </Text>
              <Switch
                value={!!formData.enableMinimumOrder}
                onValueChange={(v) =>
                  setFormData({ ...formData, enableMinimumOrder: v })
                }
              />
            </View>
            <View style={styles.selectField}>
              <Text style={styles.label}>
                {t("admin.settings.financialSettings.currency")}
              </Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowCurrencyPicker(true)}
              >
                <Text style={styles.selectButtonText}>
                  {formData.currency || t("admin.settings.financialSettings.defaultCurrency")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
        </CollapsibleCard>

        {/* Order Settings */}
        <CollapsibleCard
          titleIcon="cart"
          title={t("admin.settings.orderSettings.title")}
          description={t("admin.settings.orderSettings.description")}
        >
            <NumberField
              label={t("admin.settings.orderSettings.orderPreparationTime")}
              text={prepTimeText}
              setText={(txt) =>
                setPrepTimeText(
                  updateNumber("orderPreparationTime", txt, false)
                )
              }
              placeholder={t(
                "admin.settings.orderSettings.orderPreparationTimePlaceholder"
              )}
            />
            <NumberField
              label={t("admin.settings.orderSettings.maxOrderQuantity")}
              text={maxQtyText}
              setText={(txt) =>
                setMaxQtyText(updateNumber("maxOrderQuantity", txt, false))
              }
              placeholder={t(
                "admin.settings.orderSettings.maxOrderQuantityPlaceholder"
              )}
            />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t(
                    "admin.settings.orderSettings.allowExcludeOptionalIngredients"
                  )}
                </Text>
                <Text style={styles.helpText}>
                  {t(
                    "admin.settings.orderSettings.allowExcludeOptionalIngredientsDescription"
                  )}
                </Text>
              </View>
              <Switch
                value={formData.allowExcludeOptionalIngredients !== false}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    allowExcludeOptionalIngredients: v,
                  })
                }
              />
            </View>

            <View style={styles.borderedSection}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {t("admin.settings.orderSettings.pickupEnabled")}
                  </Text>
                  <Text style={styles.helpText}>
                    {t("admin.settings.orderSettings.pickupEnabledDescription")}
                  </Text>
                </View>
                <Switch
                  value={formData.pickupEnabled !== false}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      pickupEnabled: v,
                    })
                  }
                />
              </View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {t("admin.settings.orderSettings.deliveryEnabled")}
                  </Text>
                  <Text style={styles.helpText}>
                    {t("admin.settings.orderSettings.deliveryEnabledDescription")}
                  </Text>
                </View>
                <Switch
                  value={formData.deliveryEnabled !== false}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      deliveryEnabled: v,
                    })
                  }
                />
              </View>
            </View>
            <NumberField
              label={t("admin.settings.orderSettings.orderMergeTimeframe")}
              text={orderMergeText}
              setText={(txt) =>
                setOrderMergeText(
                  updateNumber("orderMergeTimeframeMinutes", txt, false)
                )
              }
              placeholder="10"
            />
            <Text style={styles.helpText}>
              {t("admin.settings.orderSettings.orderMergeTimeframeDescription")}
            </Text>

            {/* Future Order Settings - Inside Order Settings */}
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionTitle}>
              {t("admin.settings.orderSettings.futureOrders.title")}
            </Text>
            <Text style={styles.helpText}>
              {t("admin.settings.orderSettings.futureOrders.description")}
            </Text>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t("admin.settings.orderSettings.futureOrders.enabled")}
                </Text>
                <Text style={styles.helpText}>
                  {t("admin.settings.orderSettings.futureOrders.enabledDescription")}
                </Text>
              </View>
              <Switch
                value={!!formData.futureOrdersEnabled}
                onValueChange={(v) =>
                  setFormData({ ...formData, futureOrdersEnabled: v })
                }
              />
            </View>

            {formData.futureOrdersEnabled && (
              <>
                {/* Pickup Future Orders */}
                <View style={styles.borderedSection}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.futureOrders.enablePickup")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.futureOrders.enablePickupDescription")}
                      </Text>
                    </View>
                    <Switch
                      value={!!formData.enableFuturePickupOrders}
                      onValueChange={(v) =>
                        setFormData({ ...formData, enableFuturePickupOrders: v })
                      }
                    />
                  </View>
                  {formData.enableFuturePickupOrders && (
                    <NumberField
                      label={t("admin.settings.orderSettings.futureOrders.maxDaysPickup")}
                      text={futurePickupDaysText}
                      setText={(txt) =>
                        setFuturePickupDaysText(
                          updateNumber("futurePickupOrderDays", txt, false)
                        )
                      }
                      placeholder="7"
                    />
                  )}
                  {formData.enableFuturePickupOrders && (
                    <Text style={styles.helpText}>
                      {t("admin.settings.orderSettings.futureOrders.maxDaysDescription")}
                    </Text>
                  )}
                </View>

                {/* Delivery Future Orders */}
                <View style={styles.borderedSection}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.futureOrders.enableDelivery")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.futureOrders.enableDeliveryDescription")}
                      </Text>
                    </View>
                    <Switch
                      value={!!formData.enableFutureDeliveryOrders}
                      onValueChange={(v) =>
                        setFormData({ ...formData, enableFutureDeliveryOrders: v })
                      }
                    />
                  </View>
                  {formData.enableFutureDeliveryOrders && (
                    <NumberField
                      label={t("admin.settings.orderSettings.futureOrders.maxDaysDelivery")}
                      text={futureDeliveryDaysText}
                      setText={(txt) =>
                        setFutureDeliveryDaysText(
                          updateNumber("futureDeliveryOrderDays", txt, false)
                        )
                      }
                      placeholder="3"
                    />
                  )}
                  {formData.enableFutureDeliveryOrders && (
                    <Text style={styles.helpText}>
                      {t("admin.settings.orderSettings.futureOrders.maxDaysDescription")}
                    </Text>
                  )}
                </View>

                {/* Scheduled Order Merge Settings */}
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionTitle}>
                  {t("admin.settings.orderSettings.scheduledOrderMerge.title")}
                </Text>
                <Text style={styles.helpText}>
                  {t("admin.settings.orderSettings.scheduledOrderMerge.description")}
                </Text>

                <View style={styles.borderedSection}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.scheduledOrderMerge.enable")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.scheduledOrderMerge.enableDescription")}
                      </Text>
                    </View>
                    <Switch
                      value={!!formData.allowScheduledOrderMerge}
                      onValueChange={(v) =>
                        setFormData({ ...formData, allowScheduledOrderMerge: v })
                      }
                    />
                  </View>
                  {formData.allowScheduledOrderMerge && (
                    <NumberField
                      label={t("admin.settings.orderSettings.scheduledOrderMerge.cutoffHours")}
                      text={mergeCutoffHoursText}
                      setText={(txt) =>
                        setMergeCutoffHoursText(
                          updateNumber("scheduledOrderMergeCutoffHours", txt, false)
                        )
                      }
                      placeholder="2"
                    />
                  )}
                  {formData.allowScheduledOrderMerge && (
                    <Text style={styles.helpText}>
                      {t(
                        "admin.settings.orderSettings.scheduledOrderMerge.cutoffHoursDescription"
                      )}
                    </Text>
                  )}
                </View>

                {/* Scheduled Order Management */}
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionTitle}>
                  {t("admin.settings.orderSettings.scheduledOrderManagement.title")}
                </Text>
                <Text style={styles.helpText}>
                  {t("admin.settings.orderSettings.scheduledOrderManagement.description")}
                </Text>

                {/* Cancellation Settings */}
                <View style={styles.borderedSection}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.cancellation.enable")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.cancellation.enableDescription")}
                      </Text>
                    </View>
                    <Switch
                      value={!!formData.scheduledOrderAllowCancellation}
                      onValueChange={(v) =>
                        setFormData({ ...formData, scheduledOrderAllowCancellation: v })
                      }
                    />
                  </View>

                  {formData.scheduledOrderAllowCancellation && (
                    <>
                      <NumberField
                        label={t("admin.settings.orderSettings.scheduledOrderManagement.cancellation.windowHours")}
                        text={cancellationWindowText}
                        setText={(txt) =>
                          setCancellationWindowText(
                            updateNumber("scheduledOrderCancellationWindowHours", txt, false)
                          )
                        }
                        placeholder="0"
                      />

                      <View style={styles.sectionDivider} />
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.refund.title")}
                      </Text>

                      <NumberField
                        label={t("admin.settings.orderSettings.scheduledOrderManagement.refund.fullHoursBefore")}
                        text={fullRefundHoursText}
                        setText={(txt) =>
                          setFullRefundHoursText(
                            updateNumber("scheduledOrderFullRefundHoursBefore", txt, false)
                          )
                        }
                        placeholder="24"
                      />
                      <NumberField
                        label={t("admin.settings.orderSettings.scheduledOrderManagement.refund.partialHoursBefore")}
                        text={partialRefundHoursText}
                        setText={(txt) =>
                          setPartialRefundHoursText(
                            updateNumber("scheduledOrderPartialRefundHoursBefore", txt, false)
                          )
                        }
                        placeholder="12"
                      />
                      <NumberField
                        label={t("admin.settings.orderSettings.scheduledOrderManagement.refund.noRefundHoursBefore")}
                        text={noRefundHoursText}
                        setText={(txt) =>
                          setNoRefundHoursText(
                            updateNumber("scheduledOrderNoRefundHoursBefore", txt, false)
                          )
                        }
                        placeholder="2"
                      />
                      <NumberField
                        label={t("admin.settings.orderSettings.scheduledOrderManagement.refund.partialPercentage")}
                        text={partialRefundPercentText}
                        setText={(txt) =>
                          setPartialRefundPercentText(
                            updateNumber("scheduledOrderPartialRefundPercentage", txt, false)
                          )
                        }
                        placeholder="50"
                      />
                      <NumberField
                        label={t("admin.settings.orderSettings.scheduledOrderManagement.refund.reducedPercentage")}
                        text={reducedRefundPercentText}
                        setText={(txt) =>
                          setReducedRefundPercentText(
                            updateNumber("scheduledOrderReducedRefundPercentage", txt, false)
                          )
                        }
                        placeholder="25"
                      />
                    </>
                  )}
                </View>

                {/* Auto Confirm & Minimum Amount */}
                <View style={styles.borderedSection}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.autoConfirm.label")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.autoConfirm.description")}
                      </Text>
                    </View>
                    <Switch
                      value={formData.scheduledOrderAutoConfirm !== false}
                      onValueChange={(v) =>
                        setFormData({ ...formData, scheduledOrderAutoConfirm: v })
                      }
                    />
                  </View>

                  <NumberField
                    label={t("admin.settings.orderSettings.scheduledOrderManagement.minimumAmount.label")}
                    text={scheduledMinAmountText}
                    setText={(txt) =>
                      setScheduledMinAmountText(
                        updateNumber("scheduledOrderMinimumAmount", txt, true)
                      )
                    }
                    placeholder="0"
                  />
                  <Text style={styles.helpText}>
                    {t("admin.settings.orderSettings.scheduledOrderManagement.minimumAmount.description")}
                  </Text>
                </View>

                {/* Modification Settings */}
                <View style={styles.borderedSection}>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.modification.enable")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.modification.enableDescription")}
                      </Text>
                    </View>
                    <Switch
                      value={!!formData.scheduledOrderAllowModification}
                      onValueChange={(v) =>
                        setFormData({ ...formData, scheduledOrderAllowModification: v })
                      }
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.modification.shallowEnable")}
                      </Text>
                      <Text style={styles.helpText}>
                        {t("admin.settings.orderSettings.scheduledOrderManagement.modification.shallowEnableDescription")}
                      </Text>
                    </View>
                    <Switch
                      value={!!formData.scheduledOrderAllowShallowModification}
                      onValueChange={(v) =>
                        setFormData({ ...formData, scheduledOrderAllowShallowModification: v })
                      }
                    />
                  </View>

                  {formData.scheduledOrderAllowModification && (
                    <NumberField
                      label={t("admin.settings.orderSettings.scheduledOrderManagement.modification.windowHours")}
                      text={modificationWindowText}
                      setText={(txt) =>
                        setModificationWindowText(
                          updateNumber("scheduledOrderModificationWindowHours", txt, false)
                        )
                      }
                      placeholder="0"
                    />
                  )}
                </View>

                {/* Time Slot Settings */}
                <View style={styles.borderedSection}>
                  <NumberField
                    label={t("admin.settings.orderSettings.scheduledOrderTimeSlotInterval.label")}
                    text={timeSlotIntervalText}
                    setText={(txt) =>
                      setTimeSlotIntervalText(
                        updateNumber("scheduledOrderTimeSlotInterval", txt, false)
                      )
                    }
                    placeholder="30"
                  />
                  <Text style={styles.helpText}>
                    {t("admin.settings.orderSettings.scheduledOrderTimeSlotInterval.description")}
                  </Text>
                </View>

                {/* Max Orders Per Slot */}
                <View style={styles.borderedSection}>
                  <NumberField
                    label={t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.label")}
                    text={maxOrdersPerSlotText}
                    setText={(txt) =>
                      setMaxOrdersPerSlotText(
                        updateNumber("scheduledOrderMaxOrdersPerSlot", txt, false)
                      )
                    }
                    placeholder={t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.placeholder")}
                  />
                  <Text style={styles.helpText}>
                    {t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.description")}
                  </Text>
                </View>
              </>
            )}
        </CollapsibleCard>

        {/* Delivery Settings */}
        <CollapsibleCard
          titleIcon="truck"
          title={t("admin.settings.deliverySettings.title")}
          description={t("admin.settings.deliverySettings.description")}
        >
            <NumberField
              label={t("admin.settings.deliverySettings.deliveryRadius")}
              text={radiusText}
              setText={(txt) =>
                setRadiusText(updateNumber("deliveryRadius", txt, true))
              }
              placeholder={t(
                "admin.settings.deliverySettings.deliveryRadiusPlaceholder"
              )}
            />
            <NumberField
              label={t(
                "admin.settings.deliverySettings.deliveryRatePerKilometer"
              )}
              text={ratePerKmText}
              setText={(txt) =>
                setRatePerKmText(
                  updateNumber("deliveryRatePerKilometer", txt, true)
                )
              }
              placeholder={t(
                "admin.settings.deliverySettings.deliveryRatePerKilometerPlaceholder"
              )}
            />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t("admin.settings.deliverySettings.useDynamicDeliveryFee")}
                </Text>
                <Text style={styles.helpText}>
                  {t(
                    "admin.settings.deliverySettings.useDynamicDeliveryFeeDescription"
                  )}
                </Text>
              </View>
              <Switch
                value={!!formData.useDynamicDeliveryFee}
                onValueChange={(v) => {
                  setFormData({
                    ...formData,
                    useDynamicDeliveryFee: v,
                    useTieredDeliveryFee: v
                      ? false
                      : formData.useTieredDeliveryFee,
                  });
                }}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t("admin.settings.deliverySettings.useTieredDeliveryFee")}
                </Text>
                <Text style={styles.helpText}>
                  {t(
                    "admin.settings.deliverySettings.useTieredDeliveryFeeDescription"
                  )}
                </Text>
              </View>
              <Switch
                value={!!formData.useTieredDeliveryFee}
                onValueChange={(v) => {
                  setFormData({
                    ...formData,
                    useTieredDeliveryFee: v,
                    useDynamicDeliveryFee: v
                      ? false
                      : formData.useDynamicDeliveryFee,
                  });
                }}
              />
            </View>
            {formData.useTieredDeliveryFee && (
              <View style={styles.tieredSection}>
                <Text style={styles.tieredTitle}>
                  {t("admin.settings.deliverySettings.tieredTitle")}
                </Text>
                <NumberField
                  label={t(
                    "admin.settings.deliverySettings.initialDeliveryRange"
                  )}
                  text={initialRangeText}
                  setText={(txt) =>
                    setInitialRangeText(
                      updateNumber("initialDeliveryRange", txt, true)
                    )
                  }
                  placeholder={t(
                    "admin.settings.deliverySettings.initialDeliveryRangePlaceholder"
                  )}
                />
                <Text style={styles.helpText}>
                  {t("admin.settings.deliverySettings.initialDeliveryRangeDescription")}
                </Text>
                <NumberField
                  label={t(
                    "admin.settings.deliverySettings.initialDeliveryPrice"
                  )}
                  text={initialPriceText}
                  setText={(txt) =>
                    setInitialPriceText(
                      updateNumber("initialDeliveryPrice", txt, true)
                    )
                  }
                  placeholder={t(
                    "admin.settings.deliverySettings.initialDeliveryPricePlaceholder"
                  )}
                />
                <Text style={styles.helpText}>
                  {t("admin.settings.deliverySettings.initialDeliveryPriceDescription")}
                </Text>
                <NumberField
                  label={t(
                    "admin.settings.deliverySettings.extendedDeliveryThreshold"
                  )}
                  text={extendedThresholdText}
                  setText={(txt) => {
                    setExtendedThresholdText(txt);
                    const num = parseFloat(txt);
                    setFormData((prev) => ({
                      ...prev,
                      extendedDeliveryThreshold: txt === "" ? null : num,
                    }));
                  }}
                  placeholder={t(
                    "admin.settings.deliverySettings.extendedDeliveryThresholdPlaceholder"
                  )}
                />
                <Text style={styles.helpText}>
                  {t("admin.settings.deliverySettings.extendedDeliveryThresholdDescription")} {t("admin.settings.deliverySettings.extendedThresholdOptional")}
                </Text>
                <NumberField
                  label={t(
                    "admin.settings.deliverySettings.extendedDeliveryRate"
                  )}
                  text={extendedRateText}
                  setText={(txt) => {
                    setExtendedRateText(txt);
                    const num = parseFloat(txt);
                    setFormData((prev) => ({
                      ...prev,
                      extendedDeliveryRate: txt === "" ? null : num,
                    }));
                  }}
                  placeholder={t(
                    "admin.settings.deliverySettings.extendedDeliveryRatePlaceholder"
                  )}
                />
                <Text style={styles.helpText}>
                  {t("admin.settings.deliverySettings.extendedDeliveryRateDescription")} {t("admin.settings.deliverySettings.extendedThresholdOptional")}
                </Text>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    <Text style={styles.infoBold}>
                      {t("admin.settings.deliverySettings.howItWorks")}
                    </Text>{" "}
                    {t("admin.settings.deliverySettings.howItWorksDescription")}
                  </Text>
                </View>
              </View>
            )}
            <NumberField
              label={t("admin.settings.deliverySettings.deliveryTimeEstimate")}
              text={timeEstimateText}
              setText={(txt) =>
                setTimeEstimateText(
                  updateNumber("deliveryTimeEstimate", txt, false)
                )
              }
              placeholder={t(
                "admin.settings.deliverySettings.deliveryTimeEstimatePlaceholder"
              )}
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <NumberField
                  label={t(
                    "admin.settings.deliverySettings.freeDeliveryThreshold"
                  )}
                  text={freeDeliveryText}
                  setText={(txt) =>
                    setFreeDeliveryText(
                      updateNumber("freeDeliveryThreshold", txt, true)
                    )
                  }
                  placeholder={t(
                    "admin.settings.deliverySettings.freeDeliveryThresholdPlaceholder"
                  )}
                />
              </View>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.deliverySettings.enableFreeDelivery")}
              </Text>
              <Switch
                value={!!formData.enableFreeDelivery}
                onValueChange={(v) =>
                  setFormData({ ...formData, enableFreeDelivery: v })
                }
              />
            </View>
        </CollapsibleCard>

        {/* Serving Hours */}
        <CollapsibleCard
          titleIcon="clock"
          title={t("admin.settings.servingHours.title")}
          description={t("admin.settings.servingHours.description")}
        >
          {/* Allow Orders Outside Hours */}
            <View style={styles.infoBox}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {t("admin.settings.servingHours.allowOrdersOutsideHours")}
                  </Text>
                  <Text style={styles.helpText}>
                    {t("admin.settings.servingHours.allowOrdersOutsideHoursDescription")}
                  </Text>
                </View>
                <Switch
                  value={!!formData.allowOrdersOutsideHours}
                  onValueChange={(v) =>
                    setFormData({ ...formData, allowOrdersOutsideHours: v })
                  }
                />
              </View>
            </View>

            {/* Days of Week */}
            {DAYS_OF_WEEK.map((day) => {
              const isOffKey = `${day.key}IsOff` as keyof Settings;
              const isOff = formData[isOffKey] as boolean || false;
              const periods = getDayPeriods(day.key);

              return (
                <View key={day.key} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayLabel}>
                      {t(day.labelKey)}
                    </Text>
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>
                        {t("admin.settings.servingHours.closed")}
                      </Text>
                      <Switch
                        value={isOff}
                        onValueChange={(v) =>
                          setFormData({ ...formData, [isOffKey]: v })
                        }
                      />
                    </View>
                  </View>
                  {!isOff && (
                    <View style={styles.periodsContainer}>
                      {periods.map((period, periodIndex) => (
                        <View key={periodIndex} style={styles.periodCard}>
                          {periods.length > 1 && (
                            <View style={styles.periodHeader}>
                              <Text style={styles.periodLabel}>
                                {t("admin.settings.servingHours.period")} {periodIndex + 1}
                              </Text>
                              {periods.length > 1 && (
                                <TouchableOpacity
                                  style={styles.removePeriodButton}
                                  onPress={() => removePeriod(day.key, periodIndex)}
                                >
                                  <MaterialCommunityIcons name="delete" size={16} color="#ef4444" />
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                          <View style={styles.timeRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.label}>
                                {t("admin.settings.servingHours.openTime")}
                              </Text>
                              <TouchableOpacity
                                style={styles.timeInput}
                                onPress={() => openTimePicker(day.key, periodIndex, "open", period.open || "")}
                              >
                                <Text style={[styles.timeInputText, !period.open && styles.timeInputPlaceholder]}>
                                  {period.open || t("admin.settings.servingHours.defaultOpenTime")}
                                </Text>
                                <MaterialCommunityIcons name="clock" size={18} color="#666" />
                              </TouchableOpacity>
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.label}>
                                {t("admin.settings.servingHours.closeTime")}
                              </Text>
                              <TouchableOpacity
                                style={styles.timeInput}
                                onPress={() => openTimePicker(day.key, periodIndex, "close", period.close || "")}
                              >
                                <Text style={[styles.timeInputText, !period.close && styles.timeInputPlaceholder]}>
                                  {period.close || t("admin.settings.servingHours.defaultCloseTime")}
                                </Text>
                                <MaterialCommunityIcons name="clock" size={18} color="#666" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.addPeriodButton}
                        onPress={() => addPeriod(day.key)}
                      >
                        <MaterialCommunityIcons name="plus-circle" size={20} color="#ec4899" />
                        <Text style={styles.addPeriodButtonText}>
                          {t("admin.settings.servingHours.addPeriod")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
        </CollapsibleCard>

        {/* Delivery Payment Settings */}
        <CollapsibleCard
          titleIcon="credit-card"
          title={t("admin.settings.deliveryPaymentSettings.title")}
          description={t("admin.settings.deliveryPaymentSettings.description")}
        >
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.acceptCash")}
              </Text>
              <Switch
                value={!!formData.acceptCash}
                onValueChange={(v) =>
                  setFormData({ ...formData, acceptCash: v })
                }
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.acceptCard")}
              </Text>
              <Switch
                value={!!formData.acceptCard}
                onValueChange={(v) =>
                  setFormData({ ...formData, acceptCard: v })
                }
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.acceptOnlinePayment")}
              </Text>
              <Switch
                value={!!formData.acceptOnlinePayment}
                onValueChange={(v) =>
                  setFormData({ ...formData, acceptOnlinePayment: v })
                }
              />
            </View>
        </CollapsibleCard>

        {/* Pickup Payment Settings */}
        <CollapsibleCard
          titleIcon="credit-card"
          title={t("admin.settings.paymentSettings.pickupPaymentSettings.title")}
          description={t("admin.settings.paymentSettings.pickupPaymentSettings.description")}
        >
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptCash")}
              </Text>
              <Switch
                value={!!formData.pickupAcceptCash}
                onValueChange={(v) =>
                  setFormData({ ...formData, pickupAcceptCash: v })
                }
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptCard")}
              </Text>
              <Switch
                value={!!formData.pickupAcceptCard}
                onValueChange={(v) =>
                  setFormData({ ...formData, pickupAcceptCard: v })
                }
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptOnlinePayment")}
              </Text>
              <Switch
                value={!!formData.pickupAcceptOnlinePayment}
                onValueChange={(v) =>
                  setFormData({ ...formData, pickupAcceptOnlinePayment: v })
                }
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>
                {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptPayPal")}
              </Text>
              <Switch
                value={!!formData.pickupAcceptPayPal}
                onValueChange={(v) =>
                  setFormData({ ...formData, pickupAcceptPayPal: v })
                }
              />
            </View>
        </CollapsibleCard>

        {/* Social Media & Contact */}
        <CollapsibleCard
          titleIcon="email"
          title={t("admin.settings.socialMedia.title")}
          description={t("admin.settings.socialMedia.description")}
        >
            <InputField
              label={t("admin.settings.socialMedia.facebookUrl")}
              value={formData.facebookUrl || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, facebookUrl: text })
              }
              placeholder={t(
                "admin.settings.socialMedia.facebookUrlPlaceholder"
              )}
            />
            <InputField
              label={t("admin.settings.socialMedia.instagramUrl")}
              value={formData.instagramUrl || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, instagramUrl: text })
              }
              placeholder={t(
                "admin.settings.socialMedia.instagramUrlPlaceholder"
              )}
            />
            <InputField
              label={t("admin.settings.socialMedia.twitterUrl")}
              value={formData.twitterUrl || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, twitterUrl: text })
              }
              placeholder={t(
                "admin.settings.socialMedia.twitterUrlPlaceholder"
              )}
            />
            <InputField
              label={t("admin.settings.socialMedia.websiteUrl")}
              value={formData.websiteUrl || ""}
              onChangeText={(text) =>
                setFormData({ ...formData, websiteUrl: text })
              }
              placeholder={t(
                "admin.settings.socialMedia.websiteUrlPlaceholder"
              )}
            />
        </CollapsibleCard>

        {/* Application Status */}
        <CollapsibleCard
          titleIcon="shield-alert"
          title={t("admin.settings.appStatus.title")}
          description={t("admin.settings.appStatus.description")}
        >
            <View style={styles.selectField}>
              <Text style={styles.label}>
                {t("admin.settings.appStatus.label")}
              </Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowAppStatusPicker(true)}
              >
                <Text style={styles.selectButtonText}>
                  {formData.appStatus || t("admin.settings.appStatus.defaultStatus")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            {formData.appStatus && (
              <View style={styles.statusPreview}>
                <Text style={styles.statusPreviewLabel}>
                  {t("admin.settings.appStatus.previewLabel")}
                </Text>
                <View style={[
                  styles.statusBadge,
                  {
                    backgroundColor: getAppStatusColor(formData.appStatus),
                  }
                ]}>
                  <Text style={styles.statusPreviewText}>
                    {getAppStatusLabel(formData.appStatus, t)}
                  </Text>
                </View>
              </View>
            )}
        </CollapsibleCard>
      </ScrollView>

      {/* Service type picker modal */}
      <Modal
        visible={showServiceTypePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowServiceTypePicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowServiceTypePicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.serviceType.label")}
              </Text>
              <TouchableOpacity onPress={() => setShowServiceTypePicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bottomSheetBody}>
              {SERVICE_TYPES.map((item) => {
                const current = (formData.serviceType || "RESTAURANT") as any;
                const isActive = current === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      setFormData((prev) => ({
                        ...prev,
                        serviceType: item.value,
                      }));
                      setShowServiceTypePicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isActive && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {t(item.labelKey)}
                    </Text>
                    {isActive && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={18}
                        color="#ec4899"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showTimezonePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimezonePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("admin.settings.businessInformation.selectTimezone")}</Text>
              <TouchableOpacity onPress={() => setShowTimezonePicker(false)} style={styles.modalCloseButton}>
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, paddingBottom: 8 }}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.settings.businessInformation.selectTimezone")}
                  placeholderTextColor="#6B7280"
                  value={timezoneSearch}
                  onChangeText={setTimezoneSearch}
                />
              </View>
            </View>

            <FlatList
              data={filteredTimeZones}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.currencyItem}
                  onPress={() => {
                    setFormData({ ...formData, timezone: item });
                    setShowTimezonePicker(false);
                    setTimezoneSearch("");
                  }}
                >
                  <Text style={styles.currencyItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Logo picker modal */}
      <Modal
        visible={showLogoPickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLogoPickerModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowLogoPickerModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.settings.businessInformation.businessLogo")}
              </Text>
              <TouchableOpacity onPress={() => setShowLogoPickerModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 12, gap: 10 }}>
              <TouchableOpacity
                style={styles.bottomSheetOption}
                onPress={() => void pickAndUploadLogo("camera")}
                disabled={isUploadingLogo}
              >
                <Text style={styles.bottomSheetOptionText}>
                  {t("admin.settings.imagePicker.takePhoto")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bottomSheetOption}
                onPress={() => void pickAndUploadLogo("library")}
                disabled={isUploadingLogo}
              >
                <Text style={styles.bottomSheetOptionText}>
                  {t("admin.settings.imagePicker.chooseFromLibrary")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* SEO image picker modal */}
      <Modal
        visible={showSeoImagePickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeoImagePickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t("admin.settings.seo.ogImage")}</Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => void pickAndUploadSeoImage("camera")}
              disabled={isUploadingSeoImage}
            >
              <Text style={styles.modalOptionText}>{t("admin.settings.imagePicker.takePhoto")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => void pickAndUploadSeoImage("library")}
              disabled={isUploadingSeoImage}
            >
              <Text style={styles.modalOptionText}>{t("admin.settings.imagePicker.chooseFromLibrary")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSeoImagePickerModal(false)}
              disabled={isUploadingSeoImage}
            >
              <Text style={styles.modalCloseButtonText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Toast - Positioned above navbar */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "box-none", zIndex: 10000 }}>
        <Toast
          message={toast.message}
          type={toast.type}
          visible={toast.visible}
          onHide={() => setToast({ ...toast, visible: false })}
          topOffset={headerHeight + 12}
        />
      </View>

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />

      {/* Currency Picker Modal */}
      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.settings.financialSettings.selectCurrency")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCurrencyPicker(false)}
                style={styles.modalCloseButton}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={CURRENCIES}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.currencyItem}
                  onPress={() => {
                    setFormData({ ...formData, currency: item.value });
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={styles.currencyItemText}>{t(item.labelKey)}</Text>
                  {formData.currency === item.value && (
                    <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* App Status Picker Modal */}
      <Modal
        visible={showAppStatusPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAppStatusPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("admin.settings.appStatus.label")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAppStatusPicker(false)}
                style={styles.modalCloseButton}
              >
                <MaterialCommunityIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={APP_STATUSES}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.currencyItem}
                  onPress={() => {
                    setFormData({ ...formData, appStatus: item.value });
                    setShowAppStatusPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.currencyItemText}>{t(item.labelKey)}</Text>
                    <Text style={styles.statusDescription}>
                      {(() => {
                        const statusKeyMap: Record<string, string> = {
                          LIVE: "live",
                          COMING_SOON: "comingSoon",
                          MAINTENANCE: "maintenance",
                          OUT_OF_SERVICE: "outOfService",
                        };
                        const statusKey = statusKeyMap[item.value] || item.value.toLowerCase();
                        return t(`appStatus.states.${statusKey}.adminDescription`, { defaultValue: "" });
                      })()}
                    </Text>
                  </View>
                  {formData.appStatus === item.value && (
                    <MaterialCommunityIcons name="check" size={20} color="#ec4899" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      {timePickerState.visible && (
        <>
          {Platform.OS === "ios" ? (
            <Modal
              visible={timePickerState.visible}
              transparent
              animationType="slide"
              onRequestClose={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.timePickerModalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {timePickerState.type === "open"
                        ? t("admin.settings.servingHours.openTime")
                        : t("admin.settings.servingHours.closeTime")}
                      {timePickerState.periodIndex > 0 && ` (${t("admin.settings.servingHours.period")} ${timePickerState.periodIndex + 1})`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setTimePickerState((prev) => ({ ...prev, visible: false }))}
                      style={styles.modalCloseButton}
                    >
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
                      <Text style={styles.timePickerButtonTextCancel}>
                        {t("common.cancel")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.timePickerButton, styles.timePickerButtonConfirm]}
                      onPress={() => {
                        const timeStr = formatTimeString(timePickerState.date);
                        updatePeriodTime(timePickerState.day, timePickerState.periodIndex, timePickerState.type, timeStr);
                        setTimePickerState((prev) => ({ ...prev, visible: false }));
                      }}
                    >
                      <Text style={styles.timePickerButtonTextConfirm}>
                        {t("common.confirm")}
                      </Text>
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
          )}
        </>
      )}

    </KeyboardAvoidingView>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && { minHeight: 90, textAlignVertical: "top" },
          !editable && { backgroundColor: "#1a1a1a", color: "#6B7280" },
        ]}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
      />
    </View>
  );
}

function NumberField({
  label,
  text,
  setText,
  placeholder,
  loading = false,
}: {
  label: string;
  text: string;
  setText: (t: string) => void;
  placeholder?: string;
  loading?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
        />
        {loading && (
          <View style={styles.loadingIndicator}>
            <ActivityIndicator size="small" color="#ec4899" />
          </View>
        )}
      </View>
    </View>
  );
}

function AutocompleteField({
  label,
  value,
  onChangeText,
  suggestions,
  showSuggestions,
  onSelectSuggestion,
  loading,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  suggestions: string[];
  showSuggestions: boolean;
  onSelectSuggestion: (suggestion: string) => void;
  loading: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            disabled && { backgroundColor: "#1a1a1a", color: "#6B7280" },
          ]}
          placeholder={placeholder}
          placeholderTextColor="#6B7280"
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
        />
        {loading && (
          <View style={styles.loadingIndicator}>
            <ActivityIndicator size="small" color="#ec4899" />
          </View>
        )}
      </View>
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionItem}
              onPress={() => onSelectSuggestion(suggestion)}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#9CA3AF" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerButtonOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#262626",
  },
  headerButtonOutlineText: { color: "#D1D5DB", fontWeight: "600" },

  imageRowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "rgba(23, 23, 23, 0.7)",
    marginBottom: 10,
  },
  imageRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  imageThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
  },
  imageRowTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  imageRowAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#262626",
  },
  imageRowActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  imageActionsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  imagePickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
    flex: 1,
  },
  imagePickButtonText: {
    color: "#D1D5DB",
    fontWeight: "700",
    fontSize: 12,
  },

  qrLinkRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  qrLinkText: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
  },
  qrShareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#ec4899",
  },
  qrShareButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  qrDownloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#262626",
  },
  qrDownloadButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  qrDownloadButtonBelow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#262626",
  },
  qrDownloadButtonBelowText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  qrCenter: {
    alignItems: "center",
    gap: 10,
  },
  qrImageWrap: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  qrImage: {
    width: 240,
    height: 240,
  },

  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0f0f0f",
    marginBottom: 10,
  },
  modalOptionText: {
    color: "#fff",
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
  },
  modalCloseButtonText: {
    color: "#D1D5DB",
    fontWeight: "700",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  bottomSheetBody: { padding: 8, maxHeight: 400 },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bottomSheetOptionActive: { backgroundColor: "rgba(236, 72, 153, 0.1)" },
  bottomSheetOptionText: { fontSize: 15, color: "#D1D5DB", fontWeight: "500" },
  bottomSheetOptionTextActive: { color: "#ec4899", fontWeight: "600" },
  headerButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  headerButtonPrimaryText: { color: "#fff", fontWeight: "700" },
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    marginTop: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  cardTitle: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cardDescription: {
    color: "#9CA3AF",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  cardBody: { padding: 16 },
  label: { fontSize: 12, color: "#D1D5DB", marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
  },
  inputContainer: {
    position: "relative",
  },
  loadingIndicator: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: -10 }],
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  separator: {
    height: 1,
    backgroundColor: "#262626",
    marginVertical: 16,
  },
  addressSection: {
    marginTop: 8,
  },
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#262626",
    marginVertical: 16,
  },
  borderedSection: {
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#0f0f0f",
  },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "transparent",
  },
  gpsButtonText: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionsContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    marginTop: 4,
    maxHeight: 200,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  suggestionText: {
    color: "#fff",
    fontSize: 14,
  },
  selectField: {
    marginBottom: 12,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
  },
  selectButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  modalCloseButton: {
    padding: 4,
  },
  currencyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  currencyItemText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  statusDescription: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  dayCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  switchLabel: {
    fontSize: 12,
    color: "#D1D5DB",
    marginRight: 8,
  },
  timeRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeInput: {
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#262626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
  timeInputText: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
  timeInputPlaceholder: {
    color: "#666",
  },
  statusPreview: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  statusPreviewLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  statusPreviewText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  tieredSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ec4899",
  },
  tieredTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  infoText: {
    color: "#93c5fd",
    fontSize: 12,
    lineHeight: 18,
  },
  infoBold: {
    fontWeight: "700",
  },
  helpText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  timePickerModalContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
    maxHeight: "60%",
  },
  timePickerContainer: {
    backgroundColor: "#0f0f0f",
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#262626",
    minHeight: 220,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  timePicker: {
    backgroundColor: "transparent",
    height: 220,
    width: "100%",
  },
  timePickerActions: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  timePickerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timePickerButtonCancel: {
    backgroundColor: "#262626",
  },
  timePickerButtonConfirm: {
    backgroundColor: "#ec4899",
  },
  timePickerButtonTextCancel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  timePickerButtonTextConfirm: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  periodsContainer: {
    gap: 12,
  },
  periodCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#262626",
  },
  periodHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ec4899",
  },
  removePeriodButton: {
    padding: 4,
  },
  addPeriodButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  addPeriodButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ec4899",
  },
});
