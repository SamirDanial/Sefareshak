import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  RefreshControl,
  Modal,
  FlatList,
  Image,
  Alert,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useScroll } from "@/src/contexts/ScrollContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { AnimatedHeader, getAnimatedHeaderHeight } from "@/components/AnimatedHeader";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import ApiService from "@/src/services/apiService";
import googlePlacesService, {
  type AddressComponents,
} from "@/src/services/googlePlacesService";
import { getDeviceTimeZone, getSupportedTimeZones } from "@/src/utils/timezones";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const CURRENCIES = [
  { value: "USD", labelKey: "admin.settings.financialSettings.currencies.USD" },
  { value: "EUR", labelKey: "admin.settings.financialSettings.currencies.EUR" },
  { value: "GBP", labelKey: "admin.settings.financialSettings.currencies.GBP" },
  { value: "INR", labelKey: "admin.settings.financialSettings.currencies.INR" },
  { value: "AED", labelKey: "admin.settings.financialSettings.currencies.AED" },
];

const DAYS_OF_WEEK = [
  { key: "monday", labelKey: "admin.branchManagement.create.servingHours.monday" },
  { key: "tuesday", labelKey: "admin.branchManagement.create.servingHours.tuesday" },
  { key: "wednesday", labelKey: "admin.branchManagement.create.servingHours.wednesday" },
  { key: "thursday", labelKey: "admin.branchManagement.create.servingHours.thursday" },
  { key: "friday", labelKey: "admin.branchManagement.create.servingHours.friday" },
  { key: "saturday", labelKey: "admin.branchManagement.create.servingHours.saturday" },
  { key: "sunday", labelKey: "admin.branchManagement.create.servingHours.sunday" },
];

type BranchForm = {
  // basic
  name: string;
  code?: string;
  isActive?: boolean;
  serviceType?: "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK" | null;
  // business
  branchImage?: string;
  businessEmail?: string;
  businessPhone?: string;
  timezone?: string | null;
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
  deliveryRadius?: string;
  deliveryFee?: string;
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
  // scheduled order merge (null = inherit)
  allowScheduledOrderMerge?: boolean | null;
  scheduledOrderMergeCutoffHours?: number | null;
  // scheduled order management (null = inherit)
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
  // scheduled order time slot + capacity (null = inherit)
  scheduledOrderTimeSlotInterval?: number | null;
  scheduledOrderMaxOrdersPerSlot?: number | null;
  // payment
  acceptCash?: boolean;
  acceptCard?: boolean;
  acceptOnlinePayment?: boolean;
  pickupAcceptCash?: boolean;
  pickupAcceptCard?: boolean;
  pickupAcceptOnlinePayment?: boolean;
  pickupAcceptPayPal?: boolean;
  // hours
  allowOrdersOutsideHours?: boolean;
  mondayIsOff?: boolean;
  mondayOpen?: string;
  mondayClose?: string;
  mondayPeriods?: Array<{ open: string; close: string }>;
  tuesdayIsOff?: boolean;
  tuesdayOpen?: string;
  tuesdayClose?: string;
  tuesdayPeriods?: Array<{ open: string; close: string }>;
  wednesdayIsOff?: boolean;
  wednesdayOpen?: string;
  wednesdayClose?: string;
  wednesdayPeriods?: Array<{ open: string; close: string }>;
  thursdayIsOff?: boolean;
  thursdayOpen?: string;
  thursdayClose?: string;
  thursdayPeriods?: Array<{ open: string; close: string }>;
  fridayIsOff?: boolean;
  fridayOpen?: string;
  fridayClose?: string;
  fridayPeriods?: Array<{ open: string; close: string }>;
  saturdayIsOff?: boolean;
  saturdayOpen?: string;
  saturdayClose?: string;
  saturdayPeriods?: Array<{ open: string; close: string }>;
  sundayIsOff?: boolean;
  sundayOpen?: string;
  sundayClose?: string;
  sundayPeriods?: Array<{ open: string; close: string }>;
  // Social Media
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
};

const defaultForm: BranchForm = {
  name: "",
  code: "",
  isActive: true,
  serviceType: null,
  branchImage: "",
  businessEmail: "",
  businessPhone: "",
  timezone: null,
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  latitude: "",
  longitude: "",
  businessAddress: "",
  deliveryRadius: "",
  deliveryFee: "",
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
  // future order settings (null = inherit)
  futureOrdersEnabled: null,
  enableFuturePickupOrders: null,
  futurePickupOrderDays: null,
  enableFutureDeliveryOrders: null,
  futureDeliveryOrderDays: null,
  // scheduled order merge (null = inherit)
  allowScheduledOrderMerge: null,
  scheduledOrderMergeCutoffHours: null,
  // scheduled order management (null = inherit)
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
  // scheduled order time slot + capacity (null = inherit)
  scheduledOrderTimeSlotInterval: null,
  scheduledOrderMaxOrdersPerSlot: null,
  acceptCash: true,
  acceptCard: true,
  acceptOnlinePayment: true,
  pickupAcceptCash: true,
  pickupAcceptCard: true,
  pickupAcceptOnlinePayment: true,
  pickupAcceptPayPal: false,
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
};

export default function BranchFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditMode = !!params.id;
  const { getToken } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= 900;
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAnimatedHeaderHeight();
  const hasLoadedSettingsOnce = useRef(false);
  const hasLoadedBranchOnce = useRef(false);

  const [form, setForm] = useState<BranchForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branchName, setBranchName] = useState("");
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
  const [addressInput, setAddressInput] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [countryHasStates, setCountryHasStates] = useState(true);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showServiceTypePicker, setShowServiceTypePicker] = useState(false);
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [showBranchImagePickerModal, setShowBranchImagePickerModal] = useState(false);
  const [isUploadingBranchImage, setIsUploadingBranchImage] = useState(false);
  const [branchImageLocalUri, setBranchImageLocalUri] = useState<string | null>(null);
  const [globalServiceType, setGlobalServiceType] = useState<
    "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK"
  >("RESTAURANT");
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
  const [globalOrderMergeTimeframe, setGlobalOrderMergeTimeframe] = useState<number | undefined>(undefined);
  const [globalFutureOrdersEnabled, setGlobalFutureOrdersEnabled] = useState(false);
  const [globalEnableFuturePickupOrders, setGlobalEnableFuturePickupOrders] = useState(false);
  const [globalFuturePickupOrderDays, setGlobalFuturePickupOrderDays] = useState<number | null>(null);
  const [globalEnableFutureDeliveryOrders, setGlobalEnableFutureDeliveryOrders] = useState(false);
  const [globalFutureDeliveryOrderDays, setGlobalFutureDeliveryOrderDays] = useState<number | null>(null);
  const [radiusText, setRadiusText] = useState("");
  const [ratePerKmText, setRatePerKmText] = useState("");
  const [initialRangeText, setInitialRangeText] = useState("");
  const [initialPriceText, setInitialPriceText] = useState("");
  const [extendedThresholdText, setExtendedThresholdText] = useState("");
  const [extendedRateText, setExtendedRateText] = useState("");
  const [timeEstimateText, setTimeEstimateText] = useState("");
  const [freeDeliveryText, setFreeDeliveryText] = useState("");
  // future/scheduled order text states (branch overrides)
  const [futurePickupDaysText, setFuturePickupDaysText] = useState("");
  const [futureDeliveryDaysText, setFutureDeliveryDaysText] = useState("");
  const [mergeCutoffHoursText, setMergeCutoffHoursText] = useState("");
  const [cancellationWindowText, setCancellationWindowText] = useState("");
  const [fullRefundHoursText, setFullRefundHoursText] = useState("");
  const [partialRefundHoursText, setPartialRefundHoursText] = useState("");
  const [noRefundHoursText, setNoRefundHoursText] = useState("");
  const [partialRefundPercentText, setPartialRefundPercentText] = useState("");
  const [reducedRefundPercentText, setReducedRefundPercentText] = useState("");
  const [scheduledMinAmountText, setScheduledMinAmountText] = useState("");
  const [modificationWindowText, setModificationWindowText] = useState("");
  const [scheduledTimeSlotIntervalText, setScheduledTimeSlotIntervalText] = useState("");
  const [scheduledMaxOrdersPerSlotText, setScheduledMaxOrdersPerSlotText] = useState("");

  const handleScroll = useCallback((event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);

    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }

    lastScrollY.current = currentScrollY;
  }, [setScrollPosition, setScrollDirection]);

  const handleChange = (key: keyof BranchForm, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateNumber = (
    key: keyof BranchForm,
    text: string,
    allowDecimal = true
  ) => {
    let cleaned = text.replace(/[^0-9.]/g, "");
    if (!allowDecimal) cleaned = cleaned.replace(/\./g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    const numValue = cleaned === "" || cleaned === "." ? undefined : Number(cleaned);
    handleChange(key, numValue !== undefined ? String(numValue) : "");
    return cleaned;
  };

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ visible: true, type, message });
  };

  const SERVICE_TYPES = [
    { value: "USE_SETTINGS", labelKey: "admin.serviceType.useSettingsShort" },
    { value: "RESTAURANT", labelKey: "admin.serviceType.restaurant" },
    { value: "MEAT_SHOP", labelKey: "admin.serviceType.meatShop" },
    { value: "BAKERY", labelKey: "admin.serviceType.bakery" },
    { value: "FOOD_TRUCK", labelKey: "admin.serviceType.foodTruck" },
  ] as const;

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
      const uploaded = (json as any)?.data?.filename || (json as any)?.filename;
      if (!uploaded) {
        throw new Error("Upload failed: missing filename");
      }
      return String(uploaded);
    },
    [getToken]
  );

  const pickAndUploadBranchImage = useCallback(
    async (source: "camera" | "library") => {
      try {
        setShowBranchImagePickerModal(false);

        let result: ImagePicker.ImagePickerResult;
        if (source === "camera") {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.85,
          });
        } else {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.85,
          });
        }

        if (result.canceled || !result.assets?.[0]?.uri) return;
        const asset = result.assets[0];

        setIsUploadingBranchImage(true);
        setBranchImageLocalUri(asset.uri);

        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );

        const filename = await uploadImageToServer(manipulated.uri);
        handleChange("branchImage", filename);

        showToast("success", t("admin.branchManagement.create.businessInformation.branchImageUploaded"));
      } catch (e: any) {
        console.error("Branch image upload error:", e);
        showToast(
          "error",
          e?.message || t("admin.branchManagement.create.businessInformation.branchImageUploadError")
        );
      } finally {
        setIsUploadingBranchImage(false);
      }
    },
    [handleChange, showToast, t, uploadImageToServer]
  );

  const removeBranchImage = useCallback(() => {
    setBranchImageLocalUri(null);
    handleChange("branchImage", "");
  }, []);

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

  useEffect(() => {
    const loadOrgServiceType = async () => {
      try {
        if (!selectedOrganizationId) return;
        const token = await getToken();
        if (!token) return;

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
        const st = String((payload as any)?.serviceType || "RESTAURANT") as any;
        setGlobalServiceType(st);
      } catch {
        // ignore
      }
    };

    void loadOrgServiceType();
  }, [getToken, selectedOrganizationId]);

  // Convert time string (e.g., "9:00 AM") to Date object
  const parseTimeString = (timeStr: string): Date => {
    if (!timeStr) {
      const now = new Date();
      now.setHours(9, 0, 0, 0);
      return now;
    }
    
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
    
    const parts = timeStr.split(":");
    if (parts.length === 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    }
    
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
    const periodsKey = `${day}Periods` as keyof BranchForm;
    const periods = form[periodsKey] as Array<{ open: string; close: string }> | undefined;
    
    if (periods && Array.isArray(periods) && periods.length > 0) {
      return periods;
    }
    
    const openKey = `${day}Open` as keyof BranchForm;
    const closeKey = `${day}Close` as keyof BranchForm;
    const open = form[openKey] as string | undefined;
    const close = form[closeKey] as string | undefined;
    
    if (open && close) {
      return [{ open, close }];
    }
    
    return [{ open: "", close: "" }];
  };

  // Update period time
  const updatePeriodTime = (day: string, periodIndex: number, type: "open" | "close", time: string) => {
    const periodsKey = `${day}Periods` as keyof BranchForm;
    const currentPeriods = getDayPeriods(day);
    
    while (currentPeriods.length <= periodIndex) {
      currentPeriods.push({ 
        open: t("admin.branchManagement.create.servingHours.openTime"), 
        close: t("admin.branchManagement.create.servingHours.closeTime") 
      });
    }
    
    currentPeriods[periodIndex] = {
      ...currentPeriods[periodIndex],
      [type]: time,
    };
    
    handleChange(periodsKey, currentPeriods);
  };

  // Add new period
  const addPeriod = (day: string) => {
    const periodsKey = `${day}Periods` as keyof BranchForm;
    const currentPeriods = getDayPeriods(day);
    const newPeriods = [...currentPeriods, { 
      open: t("admin.branchManagement.create.servingHours.openTime"), 
      close: t("admin.branchManagement.create.servingHours.closeTime") 
    }];
    
    handleChange(periodsKey, newPeriods);
  };

  // Remove period
  const removePeriod = (day: string, periodIndex: number) => {
    const periodsKey = `${day}Periods` as keyof BranchForm;
    const currentPeriods = getDayPeriods(day);
    
    if (currentPeriods.length <= 1) {
      handleChange(periodsKey, [{ open: "", close: "" }]);
      return;
    }
    
    const newPeriods = currentPeriods.filter((_, index) => index !== periodIndex);
    handleChange(periodsKey, newPeriods);
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

  // Track if settings have been loaded to prevent re-loading
  const settingsLoadedRef = useRef(false);

  // Load settings from main settings to inherit initial values (only in create mode)
  useEffect(() => {
    const loadSettings = async () => {
      if (isEditMode) return; // Skip in edit mode
      if (settingsLoadedRef.current) return; // Only load once
      
      try {
        const token = await getToken();
        if (!token) return;
        
        const apiService = ApiService.getInstance();
        const response = await apiService.getSettings(token);
        const settings = response?.data ?? response;
        
        if (settings) {
          setGlobalFutureOrdersEnabled(Boolean((settings as any).futureOrdersEnabled));
          setGlobalEnableFuturePickupOrders(Boolean((settings as any).enableFuturePickupOrders));
          setGlobalFuturePickupOrderDays((settings as any).futurePickupOrderDays ?? null);
          setGlobalEnableFutureDeliveryOrders(Boolean((settings as any).enableFutureDeliveryOrders));
          setGlobalFutureDeliveryOrderDays((settings as any).futureDeliveryOrderDays ?? null);
          setForm((prev) => ({
            ...prev,
            pickupAcceptCash: settings.pickupAcceptCash !== undefined ? settings.pickupAcceptCash : prev.pickupAcceptCash,
            pickupAcceptCard: settings.pickupAcceptCard !== undefined ? settings.pickupAcceptCard : prev.pickupAcceptCard,
            pickupAcceptOnlinePayment: settings.pickupAcceptOnlinePayment !== undefined ? settings.pickupAcceptOnlinePayment : prev.pickupAcceptOnlinePayment,
            pickupAcceptPayPal: settings.pickupAcceptPayPal !== undefined ? settings.pickupAcceptPayPal : prev.pickupAcceptPayPal,
            businessEmail: !prev.businessEmail && settings.businessEmail ? settings.businessEmail : prev.businessEmail,
            businessPhone: !prev.businessPhone && settings.businessPhone ? settings.businessPhone : prev.businessPhone,
            country: !prev.country && settings.country ? settings.country : prev.country,
            state: !prev.state && settings.state ? settings.state : prev.state,
            city: !prev.city && settings.city ? settings.city : prev.city,
            address: !prev.address && settings.addressLineOne ? settings.addressLineOne : prev.address,
            zipCode: !prev.zipCode && settings.zipCode ? settings.zipCode : prev.zipCode,
            businessAddress: !prev.businessAddress && settings.businessAddress ? settings.businessAddress : prev.businessAddress,
            latitude: !prev.latitude && settings.latitude !== undefined 
              ? (typeof settings.latitude === "number" ? String(settings.latitude) : settings.latitude) 
              : prev.latitude,
            longitude: !prev.longitude && settings.longitude !== undefined 
              ? (typeof settings.longitude === "number" ? String(settings.longitude) : settings.longitude) 
              : prev.longitude,
            taxPercentage: !prev.taxPercentage && settings.taxPercentage !== undefined ? String(settings.taxPercentage) : prev.taxPercentage,
            serviceTaxPercentage: !prev.serviceTaxPercentage && (settings as any).serviceTaxPercentage !== undefined ? String((settings as any).serviceTaxPercentage) : prev.serviceTaxPercentage,
            deliveryTaxPercentage: !prev.deliveryTaxPercentage && settings.deliveryTaxPercentage !== undefined ? String(settings.deliveryTaxPercentage) : prev.deliveryTaxPercentage,
            deliveryFee: !prev.deliveryFee && settings.deliveryFee !== undefined ? String(settings.deliveryFee) : prev.deliveryFee,
            minimumOrderAmount: !prev.minimumOrderAmount && settings.minimumOrderAmount !== undefined ? String(settings.minimumOrderAmount) : prev.minimumOrderAmount,
            currency: !prev.currency && settings.currency ? settings.currency : prev.currency,
            enableMinimumOrder: settings.enableMinimumOrder !== undefined ? settings.enableMinimumOrder : prev.enableMinimumOrder,
            taxInclusive: settings.taxInclusive !== undefined ? settings.taxInclusive : prev.taxInclusive,
            orderPreparationTime: !prev.orderPreparationTime && settings.orderPreparationTime !== undefined ? String(settings.orderPreparationTime) : prev.orderPreparationTime,
            maxOrderQuantity: !prev.maxOrderQuantity && settings.maxOrderQuantity !== undefined ? String(settings.maxOrderQuantity) : prev.maxOrderQuantity,
            allowExcludeOptionalIngredients: settings.allowExcludeOptionalIngredients !== undefined ? settings.allowExcludeOptionalIngredients : prev.allowExcludeOptionalIngredients,
            orderMergeTimeframeMinutes: !prev.orderMergeTimeframeMinutes && settings.orderMergeTimeframeMinutes !== undefined ? String(settings.orderMergeTimeframeMinutes) : prev.orderMergeTimeframeMinutes,
            // Future order settings (inherit from global into branch override defaults)
            futureOrdersEnabled: (settings as any).futureOrdersEnabled ?? prev.futureOrdersEnabled,
            enableFuturePickupOrders: (settings as any).enableFuturePickupOrders ?? prev.enableFuturePickupOrders,
            futurePickupOrderDays: (settings as any).futurePickupOrderDays ?? prev.futurePickupOrderDays,
            enableFutureDeliveryOrders: (settings as any).enableFutureDeliveryOrders ?? prev.enableFutureDeliveryOrders,
            futureDeliveryOrderDays: (settings as any).futureDeliveryOrderDays ?? prev.futureDeliveryOrderDays,
            allowScheduledOrderMerge: (settings as any).allowScheduledOrderMerge ?? prev.allowScheduledOrderMerge,
            scheduledOrderMergeCutoffHours: (settings as any).scheduledOrderMergeCutoffHours ?? prev.scheduledOrderMergeCutoffHours,
            scheduledOrderAllowCancellation: (settings as any).scheduledOrderAllowCancellation ?? prev.scheduledOrderAllowCancellation,
            scheduledOrderCancellationWindowHours: (settings as any).scheduledOrderCancellationWindowHours ?? prev.scheduledOrderCancellationWindowHours,
            scheduledOrderFullRefundHoursBefore: (settings as any).scheduledOrderFullRefundHoursBefore ?? prev.scheduledOrderFullRefundHoursBefore,
            scheduledOrderPartialRefundHoursBefore: (settings as any).scheduledOrderPartialRefundHoursBefore ?? prev.scheduledOrderPartialRefundHoursBefore,
            scheduledOrderNoRefundHoursBefore: (settings as any).scheduledOrderNoRefundHoursBefore ?? prev.scheduledOrderNoRefundHoursBefore,
            scheduledOrderPartialRefundPercentage: (settings as any).scheduledOrderPartialRefundPercentage ?? prev.scheduledOrderPartialRefundPercentage,
            scheduledOrderReducedRefundPercentage: (settings as any).scheduledOrderReducedRefundPercentage ?? prev.scheduledOrderReducedRefundPercentage,
            scheduledOrderAllowModification: (settings as any).scheduledOrderAllowModification ?? prev.scheduledOrderAllowModification,
            scheduledOrderModificationWindowHours: (settings as any).scheduledOrderModificationWindowHours ?? prev.scheduledOrderModificationWindowHours,
            scheduledOrderAllowShallowModification: (settings as any).scheduledOrderAllowShallowModification ?? prev.scheduledOrderAllowShallowModification,
            scheduledOrderAutoConfirm: (settings as any).scheduledOrderAutoConfirm ?? prev.scheduledOrderAutoConfirm,
            scheduledOrderMinimumAmount: (settings as any).scheduledOrderMinimumAmount ?? prev.scheduledOrderMinimumAmount,
            scheduledOrderTimeSlotInterval: (settings as any).scheduledOrderTimeSlotInterval ?? prev.scheduledOrderTimeSlotInterval,
            scheduledOrderMaxOrdersPerSlot: (settings as any).scheduledOrderMaxOrdersPerSlot ?? prev.scheduledOrderMaxOrdersPerSlot,
            deliveryRadius: !prev.deliveryRadius && settings.deliveryRadius !== undefined ? String(settings.deliveryRadius) : prev.deliveryRadius,
            deliveryRatePerKilometer: !prev.deliveryRatePerKilometer && settings.deliveryRatePerKilometer !== undefined ? String(settings.deliveryRatePerKilometer) : prev.deliveryRatePerKilometer,
            deliveryTimeEstimate: !prev.deliveryTimeEstimate && settings.deliveryTimeEstimate !== undefined ? String(settings.deliveryTimeEstimate) : prev.deliveryTimeEstimate,
            freeDeliveryThreshold: !prev.freeDeliveryThreshold && settings.freeDeliveryThreshold !== undefined ? String(settings.freeDeliveryThreshold) : prev.freeDeliveryThreshold,
            initialDeliveryRange: !prev.initialDeliveryRange && settings.initialDeliveryRange !== undefined ? String(settings.initialDeliveryRange) : prev.initialDeliveryRange,
            initialDeliveryPrice: !prev.initialDeliveryPrice && settings.initialDeliveryPrice !== undefined ? String(settings.initialDeliveryPrice) : prev.initialDeliveryPrice,
            extendedDeliveryThreshold: !prev.extendedDeliveryThreshold && settings.extendedDeliveryThreshold !== undefined && settings.extendedDeliveryThreshold !== null ? String(settings.extendedDeliveryThreshold) : prev.extendedDeliveryThreshold,
            extendedDeliveryRate: !prev.extendedDeliveryRate && settings.extendedDeliveryRate !== undefined && settings.extendedDeliveryRate !== null ? String(settings.extendedDeliveryRate) : prev.extendedDeliveryRate,
            useDynamicDeliveryFee: settings.useDynamicDeliveryFee !== undefined ? settings.useDynamicDeliveryFee : prev.useDynamicDeliveryFee,
            useTieredDeliveryFee: settings.useTieredDeliveryFee !== undefined ? settings.useTieredDeliveryFee : prev.useTieredDeliveryFee,
            enableFreeDelivery: settings.enableFreeDelivery !== undefined ? settings.enableFreeDelivery : prev.enableFreeDelivery,
            allowOrdersOutsideHours: settings.allowOrdersOutsideHours !== undefined ? settings.allowOrdersOutsideHours : prev.allowOrdersOutsideHours,
            acceptCash: settings.acceptCash !== undefined ? settings.acceptCash : prev.acceptCash,
            acceptCard: settings.acceptCard !== undefined ? settings.acceptCard : prev.acceptCard,
            acceptOnlinePayment: settings.acceptOnlinePayment !== undefined ? settings.acceptOnlinePayment : prev.acceptOnlinePayment,
            // Serving Hours - inherit if current value is empty
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
          
          // Initialize text fields for number inputs from inherited values (only if empty)
          if (!taxText && settings.taxPercentage !== undefined) {
            setTaxText(String(settings.taxPercentage));
          }
          if (!serviceTaxText && (settings as any).serviceTaxPercentage !== undefined) {
            setServiceTaxText(String((settings as any).serviceTaxPercentage));
          }
          if (!deliveryTaxText && settings.deliveryTaxPercentage !== undefined) {
            setDeliveryTaxText(String(settings.deliveryTaxPercentage));
          }
          if (!deliveryFeeText && settings.deliveryFee !== undefined) {
            setDeliveryFeeText(String(settings.deliveryFee));
          }
          if (!minOrderText && settings.minimumOrderAmount !== undefined) {
            setMinOrderText(String(settings.minimumOrderAmount));
          }
          if (!prepTimeText && settings.orderPreparationTime !== undefined) {
            setPrepTimeText(String(settings.orderPreparationTime));
          }
          if (!maxQtyText && settings.maxOrderQuantity !== undefined) {
            setMaxQtyText(String(settings.maxOrderQuantity));
          }
          if (!orderMergeText && settings.orderMergeTimeframeMinutes !== undefined) {
            setOrderMergeText(String(settings.orderMergeTimeframeMinutes));
          }
          // Store global value for placeholder
          if (settings.orderMergeTimeframeMinutes !== undefined) {
            setGlobalOrderMergeTimeframe(settings.orderMergeTimeframeMinutes);
          }
          // Initialize branch future/scheduled order text fields from global settings (create mode)
          if (!futurePickupDaysText && (settings as any).futurePickupOrderDays != null) {
            setFuturePickupDaysText(String((settings as any).futurePickupOrderDays));
          }
          if (!futureDeliveryDaysText && (settings as any).futureDeliveryOrderDays != null) {
            setFutureDeliveryDaysText(String((settings as any).futureDeliveryOrderDays));
          }
          if ((settings as any).scheduledOrderMergeCutoffHours != null) {
            setMergeCutoffHoursText(String((settings as any).scheduledOrderMergeCutoffHours));
          }
          if ((settings as any).scheduledOrderCancellationWindowHours != null) {
            setCancellationWindowText(String((settings as any).scheduledOrderCancellationWindowHours));
          }
          if ((settings as any).scheduledOrderFullRefundHoursBefore != null) {
            setFullRefundHoursText(String((settings as any).scheduledOrderFullRefundHoursBefore));
          }
          if ((settings as any).scheduledOrderPartialRefundHoursBefore != null) {
            setPartialRefundHoursText(String((settings as any).scheduledOrderPartialRefundHoursBefore));
          }
          if ((settings as any).scheduledOrderNoRefundHoursBefore != null) {
            setNoRefundHoursText(String((settings as any).scheduledOrderNoRefundHoursBefore));
          }
          if ((settings as any).scheduledOrderPartialRefundPercentage != null) {
            setPartialRefundPercentText(String((settings as any).scheduledOrderPartialRefundPercentage));
          }
          if ((settings as any).scheduledOrderReducedRefundPercentage != null) {
            setReducedRefundPercentText(String((settings as any).scheduledOrderReducedRefundPercentage));
          }
          if ((settings as any).scheduledOrderMinimumAmount != null) {
            setScheduledMinAmountText(String((settings as any).scheduledOrderMinimumAmount));
          }
          if ((settings as any).scheduledOrderModificationWindowHours != null) {
            setModificationWindowText(String((settings as any).scheduledOrderModificationWindowHours));
          }
          if ((settings as any).scheduledOrderTimeSlotInterval != null) {
            setScheduledTimeSlotIntervalText(String((settings as any).scheduledOrderTimeSlotInterval));
          }
          if ((settings as any).scheduledOrderMaxOrdersPerSlot != null) {
            setScheduledMaxOrdersPerSlotText(String((settings as any).scheduledOrderMaxOrdersPerSlot));
          }
          if (!radiusText && settings.deliveryRadius !== undefined) {
            setRadiusText(String(settings.deliveryRadius));
          }
          if (!ratePerKmText && settings.deliveryRatePerKilometer !== undefined) {
            setRatePerKmText(String(settings.deliveryRatePerKilometer));
          }
          if (!initialRangeText && settings.initialDeliveryRange !== undefined) {
            setInitialRangeText(String(settings.initialDeliveryRange));
          }
          if (!initialPriceText && settings.initialDeliveryPrice !== undefined) {
            setInitialPriceText(String(settings.initialDeliveryPrice));
          }
          if (!extendedThresholdText && settings.extendedDeliveryThreshold !== undefined && settings.extendedDeliveryThreshold !== null) {
            setExtendedThresholdText(String(settings.extendedDeliveryThreshold));
          }
          if (!extendedRateText && settings.extendedDeliveryRate !== undefined && settings.extendedDeliveryRate !== null) {
            setExtendedRateText(String(settings.extendedDeliveryRate));
          }
          if (!timeEstimateText && settings.deliveryTimeEstimate !== undefined) {
            setTimeEstimateText(String(settings.deliveryTimeEstimate));
          }
          if (!freeDeliveryText && settings.freeDeliveryThreshold !== undefined) {
            setFreeDeliveryText(String(settings.freeDeliveryThreshold));
          }
          
          // Mark settings as loaded
          settingsLoadedRef.current = true;
        }
      } catch (error) {
        console.error("Error loading settings:", error);
        // Silently fail - don't show error toast as this is just for inheritance
      } finally {
        setLoading(false);
        hasLoadedSettingsOnce.current = true;
      }
    };

    if (!isEditMode) {
      loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]); // Only run once on mount, not when getToken changes

  // Always load global settings for placeholders / inherited-value display (both create + edit)
  useEffect(() => {
    const loadGlobalSettings = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const apiService = ApiService.getInstance();
        const response = await apiService.getSettings(token);
        const settings = response?.data ?? response;
        if (settings) {
          setGlobalFutureOrdersEnabled(Boolean((settings as any).futureOrdersEnabled));
          setGlobalEnableFuturePickupOrders(Boolean((settings as any).enableFuturePickupOrders));
          setGlobalFuturePickupOrderDays((settings as any).futurePickupOrderDays ?? null);
          setGlobalEnableFutureDeliveryOrders(Boolean((settings as any).enableFutureDeliveryOrders));
          setGlobalFutureDeliveryOrderDays((settings as any).futureDeliveryOrderDays ?? null);
          if (settings.orderMergeTimeframeMinutes !== undefined) {
            setGlobalOrderMergeTimeframe(settings.orderMergeTimeframeMinutes);
          }
        }
      } catch (error) {
        console.error("Error loading global settings:", error);
      }
    };

    loadGlobalSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load branch data if in edit mode
  useEffect(() => {
    const loadBranch = async () => {
      if (!isEditMode || !params.id) {
        setLoading(false);
        return;
      }
      
      try {
        if (!hasLoadedBranchOnce.current) {
          setLoading(true);
        }
        const token = await getToken();
        if (!token) return;
        
        const apiService = ApiService.getInstance();
        const response = await apiService.get(`/api/admin/branches/${params.id}`, token);
        
        if (response.success && response.data) {
          const branch = response.data;
          setBranchName(branch.name || "");
          const branchForm = {
            name: branch.name || "",
            code: branch.code || "",
            isActive: branch.isActive ?? true,
            branchImage: (branch as any).branchImage || "",
            businessEmail: branch.businessEmail || "",
            businessPhone: branch.businessPhone || "",
            address: branch.address || "",
            city: branch.city || "",
            state: branch.state || "",
            zipCode: branch.zipCode || "",
            country: branch.country || "",
            latitude: branch.latitude ? String(branch.latitude) : "",
            longitude: branch.longitude ? String(branch.longitude) : "",
            businessAddress: branch.businessAddress || "",
            deliveryRadius: branch.deliveryRadius ? String(branch.deliveryRadius) : "",
            deliveryFee: branch.deliveryFee ? String(branch.deliveryFee) : "",
            deliveryRatePerKilometer: branch.deliveryRatePerKilometer ? String(branch.deliveryRatePerKilometer) : "",
            useDynamicDeliveryFee: branch.useDynamicDeliveryFee ?? false,
            useTieredDeliveryFee: branch.useTieredDeliveryFee ?? false,
            initialDeliveryRange: branch.initialDeliveryRange ? String(branch.initialDeliveryRange) : "",
            initialDeliveryPrice: branch.initialDeliveryPrice ? String(branch.initialDeliveryPrice) : "",
            extendedDeliveryThreshold: branch.extendedDeliveryThreshold ? String(branch.extendedDeliveryThreshold) : "",
            extendedDeliveryRate: branch.extendedDeliveryRate ? String(branch.extendedDeliveryRate) : "",
            deliveryTimeEstimate: branch.deliveryTimeEstimate ? String(branch.deliveryTimeEstimate) : "",
            enableFreeDelivery: branch.enableFreeDelivery ?? false,
            freeDeliveryThreshold: branch.freeDeliveryThreshold ? String(branch.freeDeliveryThreshold) : "",
            taxPercentage: branch.taxPercentage ? String(branch.taxPercentage) : "",
            serviceTaxPercentage: (branch as any).serviceTaxPercentage ? String((branch as any).serviceTaxPercentage) : "",
            deliveryTaxPercentage: branch.deliveryTaxPercentage ? String(branch.deliveryTaxPercentage) : "",
            enableMinimumOrder: branch.enableMinimumOrder ?? false,
            minimumOrderAmount: branch.minimumOrderAmount ? String(branch.minimumOrderAmount) : "",
            currency: branch.currency || "",
            taxInclusive: branch.taxInclusive ?? false,
            orderPreparationTime: branch.orderPreparationTime ? String(branch.orderPreparationTime) : "",
            maxOrderQuantity: branch.maxOrderQuantity ? String(branch.maxOrderQuantity) : "",
            allowExcludeOptionalIngredients: branch.allowExcludeOptionalIngredients ?? false,
            orderMergeTimeframeMinutes: branch.orderMergeTimeframeMinutes != null ? String(branch.orderMergeTimeframeMinutes) : "",
            // Future order settings (null means inherit from global)
            futureOrdersEnabled: (branch as any).futureOrdersEnabled ?? null,
            enableFuturePickupOrders: (branch as any).enableFuturePickupOrders ?? null,
            futurePickupOrderDays: (branch as any).futurePickupOrderDays ?? null,
            enableFutureDeliveryOrders: (branch as any).enableFutureDeliveryOrders ?? null,
            futureDeliveryOrderDays: (branch as any).futureDeliveryOrderDays ?? null,
            // Scheduled order merge (null = inherit)
            allowScheduledOrderMerge: (branch as any).allowScheduledOrderMerge ?? null,
            scheduledOrderMergeCutoffHours: (branch as any).scheduledOrderMergeCutoffHours ?? null,
            // Scheduled order management (null = inherit)
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
            // Scheduled time slot + capacity (null = inherit)
            scheduledOrderTimeSlotInterval: (branch as any).scheduledOrderTimeSlotInterval ?? null,
            scheduledOrderMaxOrdersPerSlot: (branch as any).scheduledOrderMaxOrdersPerSlot ?? null,
            acceptCash: branch.acceptCash ?? false,
            acceptCard: branch.acceptCard ?? false,
            acceptOnlinePayment: branch.acceptOnlinePayment ?? false,
            allowOrdersOutsideHours: branch.allowOrdersOutsideHours ?? false,
            mondayIsOff: branch.mondayIsOff ?? false,
            mondayOpen: branch.mondayOpen || "",
            mondayClose: branch.mondayClose || "",
            mondayPeriods: branch.mondayPeriods ? (typeof branch.mondayPeriods === 'string' ? JSON.parse(branch.mondayPeriods) : branch.mondayPeriods) : undefined,
            tuesdayIsOff: branch.tuesdayIsOff ?? false,
            tuesdayOpen: branch.tuesdayOpen || "",
            tuesdayClose: branch.tuesdayClose || "",
            tuesdayPeriods: branch.tuesdayPeriods ? (typeof branch.tuesdayPeriods === 'string' ? JSON.parse(branch.tuesdayPeriods) : branch.tuesdayPeriods) : undefined,
            wednesdayIsOff: branch.wednesdayIsOff ?? false,
            wednesdayOpen: branch.wednesdayOpen || "",
            wednesdayClose: branch.wednesdayClose || "",
            wednesdayPeriods: branch.wednesdayPeriods ? (typeof branch.wednesdayPeriods === 'string' ? JSON.parse(branch.wednesdayPeriods) : branch.wednesdayPeriods) : undefined,
            thursdayIsOff: branch.thursdayIsOff ?? false,
            thursdayOpen: branch.thursdayOpen || "",
            thursdayClose: branch.thursdayClose || "",
            thursdayPeriods: branch.thursdayPeriods ? (typeof branch.thursdayPeriods === 'string' ? JSON.parse(branch.thursdayPeriods) : branch.thursdayPeriods) : undefined,
            fridayIsOff: branch.fridayIsOff ?? false,
            fridayOpen: branch.fridayOpen || "",
            fridayClose: branch.fridayClose || "",
            fridayPeriods: branch.fridayPeriods ? (typeof branch.fridayPeriods === 'string' ? JSON.parse(branch.fridayPeriods) : branch.fridayPeriods) : undefined,
            saturdayIsOff: branch.saturdayIsOff ?? false,
            saturdayOpen: branch.saturdayOpen || "",
            saturdayClose: branch.saturdayClose || "",
            saturdayPeriods: branch.saturdayPeriods ? (typeof branch.saturdayPeriods === 'string' ? JSON.parse(branch.saturdayPeriods) : branch.saturdayPeriods) : undefined,
            sundayIsOff: branch.sundayIsOff ?? false,
            sundayOpen: branch.sundayOpen || "",
            sundayClose: branch.sundayClose || "",
            sundayPeriods: branch.sundayPeriods ? (typeof branch.sundayPeriods === 'string' ? JSON.parse(branch.sundayPeriods) : branch.sundayPeriods) : undefined,
            facebookUrl: branch.facebookUrl || "",
            instagramUrl: branch.instagramUrl || "",
            twitterUrl: branch.twitterUrl || "",
            websiteUrl: branch.websiteUrl || "",
            timezone: (branch as any).timezone ?? null,
          };
          setForm(branchForm);
          // Initialize text fields
          setTaxText(branchForm.taxPercentage || "");
          setServiceTaxText(branchForm.serviceTaxPercentage || "");
          setDeliveryTaxText(branchForm.deliveryTaxPercentage || "");
          setDeliveryFeeText(branchForm.deliveryFee || "");
          setMinOrderText(branchForm.minimumOrderAmount || "");
          setPrepTimeText(branchForm.orderPreparationTime || "");
          setMaxQtyText(branchForm.maxOrderQuantity || "");
          setFuturePickupDaysText(branchForm.futurePickupOrderDays != null ? String(branchForm.futurePickupOrderDays) : "");
          setFutureDeliveryDaysText(branchForm.futureDeliveryOrderDays != null ? String(branchForm.futureDeliveryOrderDays) : "");
          setMergeCutoffHoursText(branchForm.scheduledOrderMergeCutoffHours != null ? String(branchForm.scheduledOrderMergeCutoffHours) : "");
          setCancellationWindowText(branchForm.scheduledOrderCancellationWindowHours != null ? String(branchForm.scheduledOrderCancellationWindowHours) : "");
          setFullRefundHoursText(branchForm.scheduledOrderFullRefundHoursBefore != null ? String(branchForm.scheduledOrderFullRefundHoursBefore) : "");
          setPartialRefundHoursText(branchForm.scheduledOrderPartialRefundHoursBefore != null ? String(branchForm.scheduledOrderPartialRefundHoursBefore) : "");
          setNoRefundHoursText(branchForm.scheduledOrderNoRefundHoursBefore != null ? String(branchForm.scheduledOrderNoRefundHoursBefore) : "");
          setPartialRefundPercentText(branchForm.scheduledOrderPartialRefundPercentage != null ? String(branchForm.scheduledOrderPartialRefundPercentage) : "");
          setReducedRefundPercentText(branchForm.scheduledOrderReducedRefundPercentage != null ? String(branchForm.scheduledOrderReducedRefundPercentage) : "");
          setScheduledMinAmountText(branchForm.scheduledOrderMinimumAmount != null ? String(branchForm.scheduledOrderMinimumAmount) : "");
          setModificationWindowText(branchForm.scheduledOrderModificationWindowHours != null ? String(branchForm.scheduledOrderModificationWindowHours) : "");
          setScheduledTimeSlotIntervalText(branchForm.scheduledOrderTimeSlotInterval != null ? String(branchForm.scheduledOrderTimeSlotInterval) : "");
          setScheduledMaxOrdersPerSlotText(branchForm.scheduledOrderMaxOrdersPerSlot != null ? String(branchForm.scheduledOrderMaxOrdersPerSlot) : "");
          setRadiusText(branchForm.deliveryRadius || "");
          setRatePerKmText(branchForm.deliveryRatePerKilometer || "");
          setInitialRangeText(branchForm.initialDeliveryRange || "");
          setInitialPriceText(branchForm.initialDeliveryPrice || "");
          setExtendedThresholdText(branchForm.extendedDeliveryThreshold || "");
          setExtendedRateText(branchForm.extendedDeliveryRate || "");
          setTimeEstimateText(branchForm.deliveryTimeEstimate || "");
          setFreeDeliveryText(branchForm.freeDeliveryThreshold || "");
          // Initialize addressInput with branch address
          setAddressInput(branchForm.address || "");
          // Mark coordinates as already geocoded to prevent reverse geocoding from overwriting the address
          if (branchForm.latitude && branchForm.longitude) {
            lastGeocodedLat.current = branchForm.latitude;
            lastGeocodedLng.current = branchForm.longitude;
          }
          // Reset initial load flag after branch data is loaded
          isInitialLoad.current = false;
        }
      } catch (error: any) {
        console.error("Failed to load branch", error);
        showToast("error", error.message || t("admin.branchManagement.create.loadError"));
        router.back();
      } finally {
        setLoading(false);
        hasLoadedBranchOnce.current = true;
      }
    };
    
    loadBranch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, params.id]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast("error", t("admin.branchManagement.create.nameRequired"));
      return;
    }
    
    try {
      setSaving(true);
      const token = await getToken();
      if (!token) return;
      
      const apiService = ApiService.getInstance();
      const payload: any = {
        name: form.name.trim(),
        code: form.code?.trim() || undefined,
        isActive: form.isActive,
        branchImage: form.branchImage?.trim() || null,
        serviceType: form.serviceType ?? null,
        businessEmail: form.businessEmail?.trim() || undefined,
        businessPhone: form.businessPhone?.trim() || undefined,
        timezone: form.timezone ? String(form.timezone).trim() : null,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        state: form.state?.trim() || undefined,
        country: form.country?.trim() || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        businessAddress: form.businessAddress?.trim() || undefined,
        zipCode: form.zipCode?.trim() || undefined,
        deliveryRadius: form.deliveryRadius ? Number(form.deliveryRadius) : undefined,
        deliveryFee: form.deliveryFee ? Number(form.deliveryFee) : undefined,
        deliveryRatePerKilometer: form.deliveryRatePerKilometer ? Number(form.deliveryRatePerKilometer) : undefined,
        useDynamicDeliveryFee: form.useDynamicDeliveryFee,
        useTieredDeliveryFee: form.useTieredDeliveryFee,
        initialDeliveryRange: form.initialDeliveryRange ? Number(form.initialDeliveryRange) : undefined,
        initialDeliveryPrice: form.initialDeliveryPrice ? Number(form.initialDeliveryPrice) : undefined,
        extendedDeliveryThreshold: form.extendedDeliveryThreshold ? Number(form.extendedDeliveryThreshold) : undefined,
        extendedDeliveryRate: form.extendedDeliveryRate ? Number(form.extendedDeliveryRate) : undefined,
        deliveryTimeEstimate: form.deliveryTimeEstimate ? Number(form.deliveryTimeEstimate) : undefined,
        enableFreeDelivery: form.enableFreeDelivery,
        freeDeliveryThreshold: form.freeDeliveryThreshold ? Number(form.freeDeliveryThreshold) : undefined,
        taxPercentage: form.taxPercentage ? Number(form.taxPercentage) : undefined,
        serviceTaxPercentage: form.serviceTaxPercentage ? Number(form.serviceTaxPercentage) : undefined,
        deliveryTaxPercentage: form.deliveryTaxPercentage ? Number(form.deliveryTaxPercentage) : undefined,
        enableMinimumOrder: form.enableMinimumOrder,
        minimumOrderAmount: form.minimumOrderAmount ? Number(form.minimumOrderAmount) : undefined,
        currency: form.currency?.trim() || undefined,
        taxInclusive: form.taxInclusive,
        orderPreparationTime: form.orderPreparationTime ? Number(form.orderPreparationTime) : undefined,
        maxOrderQuantity: form.maxOrderQuantity ? Number(form.maxOrderQuantity) : undefined,
        allowExcludeOptionalIngredients: form.allowExcludeOptionalIngredients,
        orderMergeTimeframeMinutes: form.orderMergeTimeframeMinutes ? Number(form.orderMergeTimeframeMinutes) : null,
        pickupEnabled: form.pickupEnabled,
        deliveryEnabled: form.deliveryEnabled,
        // Future order overrides (null = inherit)
        futureOrdersEnabled: form.futureOrdersEnabled,
        enableFuturePickupOrders: form.enableFuturePickupOrders,
        futurePickupOrderDays: form.futurePickupOrderDays,
        enableFutureDeliveryOrders: form.enableFutureDeliveryOrders,
        futureDeliveryOrderDays: form.futureDeliveryOrderDays,
        // Scheduled order overrides (null = inherit)
        allowScheduledOrderMerge: form.allowScheduledOrderMerge,
        scheduledOrderMergeCutoffHours: form.scheduledOrderMergeCutoffHours,
        scheduledOrderAllowCancellation: form.scheduledOrderAllowCancellation,
        scheduledOrderCancellationWindowHours: form.scheduledOrderCancellationWindowHours,
        scheduledOrderFullRefundHoursBefore: form.scheduledOrderFullRefundHoursBefore,
        scheduledOrderPartialRefundHoursBefore: form.scheduledOrderPartialRefundHoursBefore,
        scheduledOrderNoRefundHoursBefore: form.scheduledOrderNoRefundHoursBefore,
        scheduledOrderPartialRefundPercentage: form.scheduledOrderPartialRefundPercentage,
        scheduledOrderReducedRefundPercentage: form.scheduledOrderReducedRefundPercentage,
        scheduledOrderAllowModification: form.scheduledOrderAllowModification,
        scheduledOrderModificationWindowHours: form.scheduledOrderModificationWindowHours,
        scheduledOrderAllowShallowModification: form.scheduledOrderAllowShallowModification,
        scheduledOrderAutoConfirm: form.scheduledOrderAutoConfirm,
        scheduledOrderMinimumAmount: form.scheduledOrderMinimumAmount,
        scheduledOrderTimeSlotInterval: form.scheduledOrderTimeSlotInterval,
        scheduledOrderMaxOrdersPerSlot: form.scheduledOrderMaxOrdersPerSlot,
        acceptCash: form.acceptCash,
        acceptCard: form.acceptCard,
        acceptOnlinePayment: form.acceptOnlinePayment,
        pickupAcceptCash: form.pickupAcceptCash,
        pickupAcceptCard: form.pickupAcceptCard,
        pickupAcceptOnlinePayment: form.pickupAcceptOnlinePayment,
        pickupAcceptPayPal: form.pickupAcceptPayPal,
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
      };

      if (isEditMode && params.id) {
        await apiService.put(`/api/admin/branches/${params.id}`, payload, token);
        showToast("success", t("admin.branchManagement.create.updateSuccess"));
      } else {
        await apiService.post("/api/admin/branches", payload, token);
        showToast("success", t("admin.branchManagement.create.saveSuccess"));
      }
      
      router.back();
    } catch (error: any) {
      console.error("Error saving branch:", error);
      showToast("error", error.message || (isEditMode ? t("admin.branchManagement.create.updateError") : t("admin.branchManagement.create.saveError")));
    } finally {
      setSaving(false);
    }
  };

  // Check country states when country changes
  useEffect(() => {
    if (form.country) {
      googlePlacesService
        .checkCountryHasStates(form.country)
        .then(setCountryHasStates);
    }
  }, [form.country]);

  const handleAddressChange = useCallback((components: AddressComponents) => {
    const newAddress = components.addressLineOne || components.formattedAddress || "";
    setAddressInput(newAddress);
    setForm((prev) => {
      // Only update lat/lng if they actually changed to prevent infinite loop
      const newLat = String(components.latitude);
      const newLng = String(components.longitude);
      const latChanged = prev.latitude !== newLat;
      const lngChanged = prev.longitude !== newLng;
      
      return {
        ...prev,
        country: components.country || prev.country,
        state: components.state || prev.state,
        city: components.city || prev.city,
        address: newAddress,
        zipCode: components.zipCode || prev.zipCode,
        // Only update if changed to prevent triggering reverse geocoding again
        latitude: latChanged ? newLat : prev.latitude,
        longitude: lngChanged ? newLng : prev.longitude,
        businessAddress: components.formattedAddress || prev.businessAddress,
      };
    });
  }, []);

  // Reverse geocode when lat/lng are manually entered
  const lastGeocodedLat = useRef<string | undefined>(undefined);
  const lastGeocodedLng = useRef<string | undefined>(undefined);
  const isInitialLoad = useRef(true);
  
  useEffect(() => {
    const lat = form.latitude;
    const lng = form.longitude;

    if (
      lat === undefined ||
      lat === null ||
      lat === "" ||
      lng === undefined ||
      lng === null ||
      lng === ""
    ) {
      return;
    }

    // Skip if we already geocoded these exact coordinates
    if (lastGeocodedLat.current === lat && lastGeocodedLng.current === lng) {
      return;
    }

    // Skip reverse geocoding if we're in edit mode and this is the initial load
    // This prevents overwriting the address from the API with geocoded address
    if (isEditMode && isInitialLoad.current && form.address) {
      // Mark as geocoded to prevent future geocoding of these coordinates
      lastGeocodedLat.current = lat;
      lastGeocodedLng.current = lng;
      isInitialLoad.current = false;
      return;
    }

    // Mark that initial load is complete
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

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
              // Mark these coordinates as geocoded before updating
              lastGeocodedLat.current = lat;
              lastGeocodedLng.current = lng;
              handleAddressChange(components);
            }
          })
          .catch(() => {
            setReverseGeocoding(false);
          });
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [form.latitude, form.longitude, form.address, handleAddressChange, isEditMode]);

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
    handleChange("country", value);
    setShowCountrySuggestions(false);

    if (value.length >= 2) {
      setShowCountrySuggestions(true);
      setCountryLoading(true);
      const countries = await googlePlacesService.searchCountries(value);
      setCountrySuggestions(countries);
      setCountryLoading(false);

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
      handleChange("state", value);
      setShowStateSuggestions(false);

      if (value.length >= 1 && form.country) {
        setShowStateSuggestions(true);
        setStateLoading(true);
        const states = await googlePlacesService.searchStates(
          value,
          form.country
        );
        setStateSuggestions(states);
        setStateLoading(false);
      } else {
        setStateSuggestions([]);
        setShowStateSuggestions(false);
      }
    },
    [form.country]
  );

  const handleCityInputChange = useCallback(
    async (value: string) => {
      handleChange("city", value);
      setShowCitySuggestions(false);

      if (value.length >= 1 && form.country) {
        setShowCitySuggestions(true);
        setCityLoading(true);
        const cities = await googlePlacesService.searchCities(
          value,
          form.country,
          form.state
        );
        setCitySuggestions(cities);
        setCityLoading(false);
      } else {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
      }
    },
    [form.country, form.state]
  );

  const handleAddressInputChange = useCallback(
    async (value: string) => {
      setAddressInput(value);
      handleChange("address", value);
      setShowAddressSuggestions(false);

      if (value.length >= 1 && form.country && form.city) {
        setShowAddressSuggestions(true);
        setAddressLoading(true);
        const addresses = await googlePlacesService.searchAddresses(
          value,
          form.country,
          form.city,
          form.state
        );
        setAddressSuggestions(addresses.map((a) => a.description));
        setAddressLoading(false);
      } else {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      }
    },
    [form.country, form.city, form.state]
  );

  // Sync addressInput with form.address when form.address changes (e.g., when loading branch data)
  useEffect(() => {
    if (form.address && form.address !== addressInput) {
      setAddressInput(form.address);
    }
  }, [form.address]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (isEditMode && params.id) {
      // Reload branch data
      const loadBranch = async () => {
        try {
          const token = await getToken();
          if (!token) return;
          
          const apiService = ApiService.getInstance();
          const response = await apiService.get(`/api/admin/branches/${params.id}`, token);
          
          if (response.success && response.data) {
            const branch = response.data;
            setBranchName(branch.name || "");
            const branchForm = {
              name: branch.name || "",
              code: branch.code || "",
              isActive: branch.isActive ?? true,
              branchImage: (branch as any).branchImage || "",
              businessEmail: branch.businessEmail || "",
              businessPhone: branch.businessPhone || "",
              address: branch.address || "",
              city: branch.city || "",
              state: branch.state || "",
              zipCode: branch.zipCode || "",
              country: branch.country || "",
              latitude: branch.latitude ? String(branch.latitude) : "",
              longitude: branch.longitude ? String(branch.longitude) : "",
              businessAddress: branch.businessAddress || "",
              deliveryRadius: branch.deliveryRadius ? String(branch.deliveryRadius) : "",
              deliveryFee: branch.deliveryFee ? String(branch.deliveryFee) : "",
              deliveryRatePerKilometer: branch.deliveryRatePerKilometer ? String(branch.deliveryRatePerKilometer) : "",
              useDynamicDeliveryFee: branch.useDynamicDeliveryFee ?? false,
              useTieredDeliveryFee: branch.useTieredDeliveryFee ?? false,
              initialDeliveryRange: branch.initialDeliveryRange ? String(branch.initialDeliveryRange) : "",
              initialDeliveryPrice: branch.initialDeliveryPrice ? String(branch.initialDeliveryPrice) : "",
              extendedDeliveryThreshold: branch.extendedDeliveryThreshold ? String(branch.extendedDeliveryThreshold) : "",
              extendedDeliveryRate: branch.extendedDeliveryRate ? String(branch.extendedDeliveryRate) : "",
              deliveryTimeEstimate: branch.deliveryTimeEstimate ? String(branch.deliveryTimeEstimate) : "",
              enableFreeDelivery: branch.enableFreeDelivery ?? false,
              freeDeliveryThreshold: branch.freeDeliveryThreshold ? String(branch.freeDeliveryThreshold) : "",
              taxPercentage: branch.taxPercentage ? String(branch.taxPercentage) : "",
              deliveryTaxPercentage: branch.deliveryTaxPercentage ? String(branch.deliveryTaxPercentage) : "",
              enableMinimumOrder: branch.enableMinimumOrder ?? false,
              minimumOrderAmount: branch.minimumOrderAmount ? String(branch.minimumOrderAmount) : "",
              currency: branch.currency || "",
              taxInclusive: branch.taxInclusive ?? false,
              orderPreparationTime: branch.orderPreparationTime ? String(branch.orderPreparationTime) : "",
              maxOrderQuantity: branch.maxOrderQuantity ? String(branch.maxOrderQuantity) : "",
              allowExcludeOptionalIngredients: branch.allowExcludeOptionalIngredients ?? false,
              orderMergeTimeframeMinutes: branch.orderMergeTimeframeMinutes != null ? String(branch.orderMergeTimeframeMinutes) : "",
              // Future order settings (null means inherit from global)
              futureOrdersEnabled: (branch as any).futureOrdersEnabled ?? null,
              enableFuturePickupOrders: (branch as any).enableFuturePickupOrders ?? null,
              futurePickupOrderDays: (branch as any).futurePickupOrderDays ?? null,
              enableFutureDeliveryOrders: (branch as any).enableFutureDeliveryOrders ?? null,
              futureDeliveryOrderDays: (branch as any).futureDeliveryOrderDays ?? null,
              // Scheduled order merge (null = inherit)
              allowScheduledOrderMerge: (branch as any).allowScheduledOrderMerge ?? null,
              scheduledOrderMergeCutoffHours: (branch as any).scheduledOrderMergeCutoffHours ?? null,
              // Scheduled order management (null = inherit)
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
              // Scheduled time slot + capacity (null = inherit)
              scheduledOrderTimeSlotInterval: (branch as any).scheduledOrderTimeSlotInterval ?? null,
              scheduledOrderMaxOrdersPerSlot: (branch as any).scheduledOrderMaxOrdersPerSlot ?? null,
              acceptCash: branch.acceptCash ?? false,
              acceptCard: branch.acceptCard ?? false,
              acceptOnlinePayment: branch.acceptOnlinePayment ?? false,
              allowOrdersOutsideHours: branch.allowOrdersOutsideHours ?? false,
              mondayIsOff: branch.mondayIsOff ?? false,
              mondayOpen: branch.mondayOpen || "",
              mondayClose: branch.mondayClose || "",
              mondayPeriods: branch.mondayPeriods ? (typeof branch.mondayPeriods === 'string' ? JSON.parse(branch.mondayPeriods) : branch.mondayPeriods) : undefined,
              tuesdayIsOff: branch.tuesdayIsOff ?? false,
              tuesdayOpen: branch.tuesdayOpen || "",
              tuesdayClose: branch.tuesdayClose || "",
              tuesdayPeriods: branch.tuesdayPeriods ? (typeof branch.tuesdayPeriods === 'string' ? JSON.parse(branch.tuesdayPeriods) : branch.tuesdayPeriods) : undefined,
              wednesdayIsOff: branch.wednesdayIsOff ?? false,
              wednesdayOpen: branch.wednesdayOpen || "",
              wednesdayClose: branch.wednesdayClose || "",
              wednesdayPeriods: branch.wednesdayPeriods ? (typeof branch.wednesdayPeriods === 'string' ? JSON.parse(branch.wednesdayPeriods) : branch.wednesdayPeriods) : undefined,
              thursdayIsOff: branch.thursdayIsOff ?? false,
              thursdayOpen: branch.thursdayOpen || "",
              thursdayClose: branch.thursdayClose || "",
              thursdayPeriods: branch.thursdayPeriods ? (typeof branch.thursdayPeriods === 'string' ? JSON.parse(branch.thursdayPeriods) : branch.thursdayPeriods) : undefined,
              fridayIsOff: branch.fridayIsOff ?? false,
              fridayOpen: branch.fridayOpen || "",
              fridayClose: branch.fridayClose || "",
              fridayPeriods: branch.fridayPeriods ? (typeof branch.fridayPeriods === 'string' ? JSON.parse(branch.fridayPeriods) : branch.fridayPeriods) : undefined,
              saturdayIsOff: branch.saturdayIsOff ?? false,
              saturdayOpen: branch.saturdayOpen || "",
              saturdayClose: branch.saturdayClose || "",
              saturdayPeriods: branch.saturdayPeriods ? (typeof branch.saturdayPeriods === 'string' ? JSON.parse(branch.saturdayPeriods) : branch.saturdayPeriods) : undefined,
              sundayIsOff: branch.sundayIsOff ?? false,
              sundayOpen: branch.sundayOpen || "",
              sundayClose: branch.sundayClose || "",
              sundayPeriods: branch.sundayPeriods ? (typeof branch.sundayPeriods === 'string' ? JSON.parse(branch.sundayPeriods) : branch.sundayPeriods) : undefined,
              facebookUrl: branch.facebookUrl || "",
              instagramUrl: branch.instagramUrl || "",
              twitterUrl: branch.twitterUrl || "",
              websiteUrl: branch.websiteUrl || "",
              timezone: (branch as any).timezone ?? null,
            };
          }
        } catch (error) {
          console.error("Failed to reload branch", error);
        } finally {
          setRefreshing(false);
        }
      };
      loadBranch();
    } else {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>
          {isEditMode ? t("admin.branchManagement.create.loading") : t("admin.branchManagement.create.loading")}
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
        title={isEditMode ? (t("admin.branchManagement.create.editTitle") || "Edit Branch") : (t("admin.branchManagement.create.title") || "Create Branch")}
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
            {isEditMode && branchName ? (
              <Text style={styles.screenTitle}>
                {t("admin.branchManagement.create.branchSettingsFor", {
                  branchName,
                  defaultValue: `Settings - ${branchName}`,
                })}
              </Text>
            ) : null}
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
              {isEditMode
                ? t("common.update", { defaultValue: "Update" })
                : t("admin.branchManagement.create.save", { defaultValue: "Save" })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Business Information Section */}
        <CollapsibleCard
          titleIcon="office-building"
          title={t("admin.branchManagement.create.businessInformation.title")}
          description={t("admin.branchManagement.create.businessInformation.description")}
        >
          <View style={isWideLayout ? styles.twoColWrap : undefined}>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <View style={styles.inputRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.businessInformation.name")}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("admin.branchManagement.create.businessInformation.namePlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={form.name}
                  onChangeText={(text) => handleChange("name", text)}
                />
              </View>
            </View>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <View style={styles.inputRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.businessInformation.code")}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("admin.branchManagement.create.businessInformation.codePlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={form.code || ""}
                  onChangeText={(text) => handleChange("code", text)}
                />
              </View>
            </View>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <View style={styles.inputRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.businessInformation.businessEmail")}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("admin.branchManagement.create.businessInformation.businessEmailPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={form.businessEmail || ""}
                  onChangeText={(text) => handleChange("businessEmail", text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <View style={styles.inputRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.businessInformation.businessPhone")}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("admin.branchManagement.create.businessInformation.businessPhonePlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={form.businessPhone || ""}
                  onChangeText={(text) => handleChange("businessPhone", text)}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.selectField}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.businessInformation.serviceType")}
            </Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowServiceTypePicker(true)}
            >
              <Text style={styles.selectButtonText}>
                {(() => {
                  const current = form.serviceType;
                  if (current == null) {
                    const globalLabel =
                      globalServiceType === "RESTAURANT"
                        ? t("admin.serviceType.restaurant")
                        : globalServiceType === "MEAT_SHOP"
                        ? t("admin.serviceType.meatShop")
                        : globalServiceType === "BAKERY"
                        ? t("admin.serviceType.bakery")
                        : t("admin.serviceType.foodTruck");
                    return t("admin.serviceType.useSettings", { value: globalLabel });
                  }
                  const opt = SERVICE_TYPES.find((s) => s.value === current);
                  return opt ? t(opt.labelKey) : String(current);
                })()}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.selectField}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.businessInformation.timezone")}
            </Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowTimezonePicker(true)}
            >
              <Text style={styles.selectButtonText} numberOfLines={1}>
                {(form.timezone && String(form.timezone).trim()) || deviceTimeZone}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.headerButtonPrimary, { alignSelf: "flex-start", marginBottom: 12 }]}
            onPress={() => handleChange("timezone", deviceTimeZone)}
          >
            <MaterialCommunityIcons name="target" size={16} color="#fff" />
            <Text style={styles.headerButtonPrimaryText}>
              {t("admin.branchManagement.create.businessInformation.useDeviceTimezone")}
            </Text>
          </TouchableOpacity>

          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.businessInformation.branchImage")}
            </Text>
            {(branchImageLocalUri || form.branchImage) ? (
              <View style={styles.imageRowCard}>
                <View style={styles.imageRowLeft}>
                  <View style={styles.imageThumbWrap}>
                    <Image
                      source={{
                        uri:
                          branchImageLocalUri ||
                          getImageSrc(form.branchImage || "") ||
                          undefined,
                      }}
                      style={styles.imageThumb}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.imageRowTitle}>
                      {t("admin.branchManagement.create.businessInformation.branchImage")}
                    </Text>
                    <Text style={styles.helpText}>
                      {t("admin.branchManagement.create.businessInformation.branchImageHint")}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.imageRowAction}
                  onPress={removeBranchImage}
                  disabled={isUploadingBranchImage}
                >
                  <MaterialCommunityIcons name="delete" size={18} color="#fff" />
                  <Text style={styles.imageRowActionText}>
                    {t("admin.branchManagement.create.businessInformation.branchImageRemove")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.imageActionsRow}>
                <TouchableOpacity
                  style={styles.imagePickButton}
                  onPress={() => setShowBranchImagePickerModal(true)}
                  disabled={isUploadingBranchImage}
                >
                  {isUploadingBranchImage ? (
                    <ActivityIndicator size="small" color="#ec4899" />
                  ) : (
                    <MaterialCommunityIcons name="image" size={18} color="#D1D5DB" />
                  )}
                  <Text style={styles.imagePickButtonText}>
                    {t("admin.branchManagement.create.businessInformation.branchImageSelect")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.businessInformation.active")}
            </Text>
            <Switch
              value={form.isActive ?? true}
              onValueChange={(value) => handleChange("isActive", value)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          
          <View style={styles.separator} />
          
          <View style={styles.addressSection}>
            <View style={styles.addressHeader}>
              <Text style={styles.sectionTitle}>
                {t("admin.branchManagement.create.businessInformation.branchAddress")}
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
                    ? t("admin.branchManagement.create.businessInformation.gettingLocation", { defaultValue: "Getting location..." })
                    : t("admin.branchManagement.create.businessInformation.useGPS", { defaultValue: "Use GPS" })}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={isWideLayout ? styles.twoColWrap : undefined}>
              <View style={isWideLayout ? styles.twoColCell : undefined}>
                <AutocompleteField
                  label={t("admin.branchManagement.create.businessInformation.country")}
                  value={form.country || ""}
                  onChangeText={handleCountryInputChange}
                  suggestions={countrySuggestions}
                  showSuggestions={showCountrySuggestions}
                  onSelectSuggestion={(suggestion) => {
                    handleChange("country", suggestion);
                    setShowCountrySuggestions(false);
                    googlePlacesService
                      .checkCountryHasStates(suggestion)
                      .then(setCountryHasStates);
                  }}
                  loading={countryLoading}
                  placeholder={t("admin.branchManagement.create.businessInformation.countryPlaceholder")}
                />
              </View>

              {countryHasStates && (
                <View style={isWideLayout ? styles.twoColCell : undefined}>
                  <AutocompleteField
                    label={t("admin.branchManagement.create.businessInformation.stateProvince")}
                    value={form.state || ""}
                    onChangeText={handleStateInputChange}
                    suggestions={stateSuggestions}
                    showSuggestions={showStateSuggestions}
                    onSelectSuggestion={(suggestion) => {
                      handleChange("state", suggestion);
                      setShowStateSuggestions(false);
                    }}
                    loading={stateLoading}
                    placeholder={t("admin.branchManagement.create.businessInformation.stateProvincePlaceholder")}
                    disabled={!form.country}
                  />
                </View>
              )}

              <View style={isWideLayout ? styles.twoColCell : undefined}>
                <AutocompleteField
                  label={t("admin.branchManagement.create.businessInformation.city")}
                  value={form.city || ""}
                  onChangeText={handleCityInputChange}
                  suggestions={citySuggestions}
                  showSuggestions={showCitySuggestions}
                  onSelectSuggestion={(suggestion) => {
                    handleChange("city", suggestion);
                    setShowCitySuggestions(false);
                  }}
                  loading={cityLoading}
                  placeholder={t("admin.branchManagement.create.businessInformation.cityPlaceholder")}
                  disabled={!form.country}
                />
              </View>

              <View style={isWideLayout ? styles.twoColCell : undefined}>
                <AutocompleteField
                  label={t("admin.branchManagement.create.businessInformation.address")}
                  value={addressInput}
                  onChangeText={handleAddressInputChange}
                  suggestions={addressSuggestions}
                  showSuggestions={showAddressSuggestions}
                  onSelectSuggestion={(suggestion) => {
                    setAddressInput(suggestion);
                    handleChange("address", suggestion);
                    setShowAddressSuggestions(false);
                  }}
                  loading={addressLoading}
                  placeholder={t("admin.branchManagement.create.businessInformation.addressPlaceholder")}
                  disabled={!form.city || !form.country}
                />
              </View>
            </View>
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.businessInformation.zipPostal")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("admin.branchManagement.create.businessInformation.zipPostalPlaceholder")}
              placeholderTextColor="#6B7280"
              value={form.zipCode || ""}
              onChangeText={(text) => handleChange("zipCode", text)}
            />
          </View>
          <View style={styles.gridRow}>
            <View style={[styles.inputRow, { flex: 1, minWidth: 0 }]}>
              <Text style={styles.label}>
                {t("admin.branchManagement.create.businessInformation.latitude")}
              </Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder={t("admin.branchManagement.create.businessInformation.latitudePlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={form.latitude || ""}
                  onChangeText={(text) => handleChange("latitude", text.replace(/[^0-9.-]/g, ""))}
                  keyboardType="numeric"
                />
                {reverseGeocoding && (
                  <View style={styles.loadingIndicator}>
                    <ActivityIndicator size="small" color="#ec4899" />
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.inputRow, { flex: 1, minWidth: 0 }]}>
              <Text style={styles.label}>
                {t("admin.branchManagement.create.businessInformation.longitude")}
              </Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder={t("admin.branchManagement.create.businessInformation.longitudePlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={form.longitude || ""}
                  onChangeText={(text) => handleChange("longitude", text.replace(/[^0-9.-]/g, ""))}
                  keyboardType="numeric"
                />
                {reverseGeocoding && (
                  <View style={styles.loadingIndicator}>
                    <ActivityIndicator size="small" color="#ec4899" />
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.businessInformation.fullAddress")}
            </Text>
            <TextInput
              style={[styles.input, styles.readOnlyInput]}
              placeholder={t("admin.branchManagement.create.businessInformation.fullAddressPlaceholder")}
              placeholderTextColor="#6B7280"
              value={form.businessAddress || ""}
              editable={false}
              multiline
            />
          </View>
        </CollapsibleCard>

        {/* Financial Settings */}
        <CollapsibleCard
          titleIcon="currency-usd"
          title={t("admin.branchManagement.create.financialSettings.title")}
          description={t("admin.branchManagement.create.financialSettings.description")}
        >
          <View style={isWideLayout ? styles.twoColRow : undefined}>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.financialSettings.taxPercentage")}
                text={taxText}
                setText={(txt) => setTaxText(updateNumber("taxPercentage", txt, true))}
                placeholder={t("admin.branchManagement.create.financialSettings.taxPercentagePlaceholder") || "0.00"}
              />
            </View>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.financialSettings.serviceTaxPercentage")}
                text={serviceTaxText}
                setText={(txt) => setServiceTaxText(updateNumber("serviceTaxPercentage", txt, true))}
                placeholder={t("admin.branchManagement.create.financialSettings.serviceTaxPercentagePlaceholder") || "0.00"}
              />
            </View>
          </View>
          <View style={isWideLayout ? styles.twoColRow : undefined}>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.financialSettings.deliveryTaxPercentage")}
                text={deliveryTaxText}
                setText={(txt) => setDeliveryTaxText(updateNumber("deliveryTaxPercentage", txt, true))}
                placeholder={t("admin.branchManagement.create.financialSettings.deliveryTaxPercentagePlaceholder") || "0.00"}
              />
            </View>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.financialSettings.deliveryFee")}
                text={deliveryFeeText}
                setText={(txt) => setDeliveryFeeText(updateNumber("deliveryFee", txt, true))}
                placeholder={t("admin.branchManagement.create.financialSettings.deliveryFeePlaceholder") || "0.00"}
              />
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.financialSettings.taxInclusive")}
            </Text>
            <Switch
              value={!!form.taxInclusive}
              onValueChange={(v) => handleChange("taxInclusive", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={isWideLayout ? styles.twoColRow : undefined}>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.financialSettings.minimumOrderAmount")}
                text={minOrderText}
                setText={(txt) => setMinOrderText(updateNumber("minimumOrderAmount", txt, true))}
                placeholder={t("admin.branchManagement.create.financialSettings.minimumOrderAmountPlaceholder") || "0.00"}
              />
            </View>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <View style={styles.selectField}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.financialSettings.currency")}
                </Text>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowCurrencyPicker(true)}
                >
                  <Text style={styles.selectButtonText}>
                    {form.currency || t("admin.branchManagement.create.financialSettings.selectCurrency")}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.financialSettings.enableMinimumOrder")}
            </Text>
            <Switch
              value={!!form.enableMinimumOrder}
              onValueChange={(v) => handleChange("enableMinimumOrder", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.separator} />
        </CollapsibleCard>

        {/* Order Settings */}
        <CollapsibleCard
          titleIcon="cart"
          title={t("admin.branchManagement.create.orderSettings.title")}
          description={t("admin.branchManagement.create.orderSettings.description")}
        >
          <View style={isWideLayout ? styles.twoColRow : undefined}>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.orderSettings.prepTime")}
                text={prepTimeText}
                setText={(txt) => setPrepTimeText(updateNumber("orderPreparationTime", txt, false))}
                placeholder={t("admin.branchManagement.create.orderSettings.prepTimePlaceholder") || "30"}
              />
            </View>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.orderSettings.maxOrderQuantity")}
                text={maxQtyText}
                setText={(txt) => setMaxQtyText(updateNumber("maxOrderQuantity", txt, false))}
                placeholder={t("admin.branchManagement.create.orderSettings.maxOrderQuantityPlaceholder") || "10"}
              />
            </View>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t("admin.branchManagement.create.orderSettings.allowExcludingOptionalIngredients")}
              </Text>
              <Text style={styles.helpText}>
                {t("admin.branchManagement.create.orderSettings.allowExcludingOptionalIngredientsDescription")}
              </Text>
            </View>
            <Switch
              value={form.allowExcludeOptionalIngredients !== false}
              onValueChange={(v) => handleChange("allowExcludeOptionalIngredients", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>

          <View style={styles.borderedSection}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {t("admin.branchManagement.create.orderSettings.pickupEnabled")}
                </Text>
                <Text style={styles.helpText}>
                  {form.pickupEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")
                    : t("admin.branchManagement.create.orderSettings.overriding")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.headerButtonOutline}
                onPress={() =>
                  handleChange(
                    "pickupEnabled",
                    form.pickupEnabled === null ? false : null
                  )
                }
              >
                <Text style={styles.headerButtonOutlineText}>
                  {form.pickupEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.override")
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal")}
                </Text>
              </TouchableOpacity>
            </View>
            {form.pickupEnabled !== null && (
              <View style={styles.switchRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.orderSettings.pickupEnabled")}
                </Text>
                <Switch
                  value={!!form.pickupEnabled}
                  onValueChange={(v) => handleChange("pickupEnabled", v)}
                  trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                  thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                  ios_backgroundColor="#f3f4f6"
                />
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {t("admin.branchManagement.create.orderSettings.deliveryEnabled")}
                </Text>
                <Text style={styles.helpText}>
                  {form.deliveryEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.inheritingFromGlobal")
                    : t("admin.branchManagement.create.orderSettings.overriding")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.headerButtonOutline}
                onPress={() =>
                  handleChange(
                    "deliveryEnabled",
                    form.deliveryEnabled === null ? false : null
                  )
                }
              >
                <Text style={styles.headerButtonOutlineText}>
                  {form.deliveryEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.override")
                    : t("admin.branchManagement.create.orderSettings.inheritGlobal")}
                </Text>
              </TouchableOpacity>
            </View>
            {form.deliveryEnabled !== null && (
              <View style={styles.switchRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.orderSettings.deliveryEnabled")}
                </Text>
                <Switch
                  value={!!form.deliveryEnabled}
                  onValueChange={(v) => handleChange("deliveryEnabled", v)}
                  trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                  thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                  ios_backgroundColor="#f3f4f6"
                />
              </View>
            )}
          </View>

          <NumberField
            label={t("admin.branchManagement.create.orderSettings.orderMergeTimeframe")}
            text={orderMergeText}
            setText={(txt) => setOrderMergeText(updateNumber("orderMergeTimeframeMinutes", txt, false))}
            placeholder={globalOrderMergeTimeframe !== undefined ? String(globalOrderMergeTimeframe) : t("admin.branchManagement.create.orderSettings.orderMergeTimeframePlaceholder") || "10"}
          />
          <Text style={styles.helpText}>
            {t("admin.branchManagement.create.orderSettings.orderMergeTimeframeDescription")}
          </Text>

          <Separator />

          {/* Future Order Scheduling */}
          <Text style={styles.sectionTitle}>
            {t("admin.branchManagement.create.orderSettings.futureOrders.title")}
          </Text>
          <Text style={styles.helpText}>
            {t("admin.branchManagement.create.orderSettings.futureOrders.description")}
          </Text>

          <View style={styles.borderedSection}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.orderSettings.futureOrders.enabled")}
                </Text>
                <Text style={styles.helpText}>
                  {form.futureOrdersEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal")
                    : t("admin.branchManagement.create.orderSettings.futureOrders.overriding")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.headerButtonOutline}
                onPress={() =>
                  handleChange(
                    "futureOrdersEnabled",
                    form.futureOrdersEnabled === null ? false : null
                  )
                }
              >
                <Text style={styles.headerButtonOutlineText}>
                  {form.futureOrdersEnabled === null
                    ? t("admin.branchManagement.create.orderSettings.futureOrders.override")
                    : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal")}
                </Text>
              </TouchableOpacity>
            </View>

            {form.futureOrdersEnabled !== null && (
              <View style={styles.switchRow}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.orderSettings.futureOrders.enabled")}
                </Text>
                <Switch
                  value={!!form.futureOrdersEnabled}
                  onValueChange={(v) => handleChange("futureOrdersEnabled", v)}
                  trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                  thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                  ios_backgroundColor="#f3f4f6"
                />
              </View>
            )}
          </View>

          {((form.futureOrdersEnabled === null
            ? globalFutureOrdersEnabled
            : form.futureOrdersEnabled) || false) && (
            <>
              <View style={styles.borderedSection}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>
                      {t("admin.branchManagement.create.orderSettings.futureOrders.pickupTitle")}
                    </Text>
                    <Text style={styles.helpText}>
                      {form.enableFuturePickupOrders === null
                        ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal")
                        : t("admin.branchManagement.create.orderSettings.futureOrders.overriding")}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.headerButtonOutline}
                    onPress={() => {
                      if (form.enableFuturePickupOrders === null) {
                        handleChange("enableFuturePickupOrders", false);
                      } else {
                        handleChange("enableFuturePickupOrders", null);
                        handleChange("futurePickupOrderDays", null);
                      }
                    }}
                  >
                    <Text style={styles.headerButtonOutlineText}>
                      {form.enableFuturePickupOrders === null
                        ? t("admin.branchManagement.create.orderSettings.futureOrders.override")
                        : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {form.enableFuturePickupOrders !== null && (
                  <>
                    <View style={styles.switchRow}>
                      <Text style={styles.label}>
                        {t("admin.branchManagement.create.orderSettings.futureOrders.enablePickup")}
                      </Text>
                      <Switch
                        value={!!form.enableFuturePickupOrders}
                        onValueChange={(v) => handleChange("enableFuturePickupOrders", v)}
                        trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                        thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                        ios_backgroundColor="#f3f4f6"
                      />
                    </View>

                    {!!form.enableFuturePickupOrders && (
                      <NumberField
                        label={t("admin.branchManagement.create.orderSettings.futureOrders.maxDaysPickup")}
                        text={futurePickupDaysText}
                        setText={(txt) => {
                          setFuturePickupDaysText(txt.replace(/[^0-9]/g, ""));
                          const cleaned = txt.replace(/[^0-9]/g, "");
                          handleChange(
                            "futurePickupOrderDays",
                            cleaned === "" ? null : Number(cleaned)
                          );
                          return cleaned;
                        }}
                        placeholder={
                          globalFuturePickupOrderDays != null
                            ? String(globalFuturePickupOrderDays)
                            : "7"
                        }
                      />
                    )}
                  </>
                )}
              </View>

              <View style={styles.borderedSection}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>
                      {t("admin.branchManagement.create.orderSettings.futureOrders.deliveryTitle")}
                    </Text>
                    <Text style={styles.helpText}>
                      {form.enableFutureDeliveryOrders === null
                        ? t("admin.branchManagement.create.orderSettings.futureOrders.inheritingFromGlobal")
                        : t("admin.branchManagement.create.orderSettings.futureOrders.overriding")}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.headerButtonOutline}
                    onPress={() => {
                      if (form.enableFutureDeliveryOrders === null) {
                        handleChange("enableFutureDeliveryOrders", false);
                      } else {
                        handleChange("enableFutureDeliveryOrders", null);
                        handleChange("futureDeliveryOrderDays", null);
                      }
                    }}
                  >
                    <Text style={styles.headerButtonOutlineText}>
                      {form.enableFutureDeliveryOrders === null
                        ? t("admin.branchManagement.create.orderSettings.futureOrders.override")
                        : t("admin.branchManagement.create.orderSettings.futureOrders.inheritGlobal")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {form.enableFutureDeliveryOrders !== null && (
                  <>
                    <View style={styles.switchRow}>
                      <Text style={styles.label}>
                        {t("admin.branchManagement.create.orderSettings.futureOrders.enableDelivery")}
                      </Text>
                      <Switch
                        value={!!form.enableFutureDeliveryOrders}
                        onValueChange={(v) => handleChange("enableFutureDeliveryOrders", v)}
                        trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                        thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                        ios_backgroundColor="#f3f4f6"
                      />
                    </View>

                    {!!form.enableFutureDeliveryOrders && (
                      <NumberField
                        label={t("admin.branchManagement.create.orderSettings.futureOrders.maxDaysDelivery")}
                        text={futureDeliveryDaysText}
                        setText={(txt) => {
                          setFutureDeliveryDaysText(txt.replace(/[^0-9]/g, ""));
                          const cleaned = txt.replace(/[^0-9]/g, "");
                          handleChange(
                            "futureDeliveryOrderDays",
                            cleaned === "" ? null : Number(cleaned)
                          );
                          return cleaned;
                        }}
                        placeholder={
                          globalFutureDeliveryOrderDays != null
                            ? String(globalFutureDeliveryOrderDays)
                            : "3"
                        }
                      />
                    )}
                  </>
                )}
              </View>

              <Separator />

              {/* Scheduled Order Merge */}
              <Text style={styles.sectionTitle}>
                {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.title")}
              </Text>
              <Text style={styles.helpText}>
                {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.description")}
              </Text>
              <View style={styles.borderedSection}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>
                    {t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.enable")}
                  </Text>
                  <Switch
                    value={!!form.allowScheduledOrderMerge}
                    onValueChange={(v) => handleChange("allowScheduledOrderMerge", v)}
                    trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                    thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                    ios_backgroundColor="#f3f4f6"
                  />
                </View>
                {!!form.allowScheduledOrderMerge && (
                  <>
                    <NumberField
                      label={t("admin.branchManagement.create.orderSettings.scheduledOrderMerge.cutoffHours")}
                      text={mergeCutoffHoursText}
                      setText={(txt) => {
                        setMergeCutoffHoursText(txt.replace(/[^0-9]/g, ""));
                        const cleaned = txt.replace(/[^0-9]/g, "");
                        handleChange(
                          "scheduledOrderMergeCutoffHours",
                          cleaned === "" ? null : Number(cleaned)
                        );
                        return cleaned;
                      }}
                      placeholder="2"
                    />
                    <Text style={styles.helpText}>
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderMerge.cutoffHoursDescription"
                      )}
                    </Text>
                  </>
                )}
              </View>

              <Separator />

              {/* Scheduled Order Management */}
              <Text style={styles.sectionTitle}>
                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.title")}
              </Text>
              <Text style={styles.helpText}>
                {t("admin.branchManagement.create.orderSettings.scheduledOrderManagement.description")}
              </Text>

              <View style={styles.borderedSection}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>
                    {t(
                      "admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.enable"
                    )}
                  </Text>
                  <Switch
                    value={!!form.scheduledOrderAllowCancellation}
                    onValueChange={(v) =>
                      handleChange("scheduledOrderAllowCancellation", v)
                    }
                    trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                    thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                    ios_backgroundColor="#f3f4f6"
                  />
                </View>

                {!!form.scheduledOrderAllowCancellation && (
                  <>
                    <NumberField
                      label={t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.windowHours"
                      )}
                      text={cancellationWindowText}
                      setText={(txt) => {
                        setCancellationWindowText(txt.replace(/[^0-9]/g, ""));
                        const cleaned = txt.replace(/[^0-9]/g, "");
                        handleChange(
                          "scheduledOrderCancellationWindowHours",
                          cleaned === "" ? null : Number(cleaned)
                        );
                        return cleaned;
                      }}
                      placeholder="0"
                    />

                    <Text style={styles.sectionTitle}>
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.cancellation.title"
                      )}
                    </Text>

                    <View style={isWideLayout ? styles.twoColRow : undefined}>
                      <View style={isWideLayout ? styles.twoColItem : undefined}>
                        <NumberField
                          label={t(
                            "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.fullHoursBefore"
                          )}
                          text={fullRefundHoursText}
                          setText={(txt) => {
                            setFullRefundHoursText(txt.replace(/[^0-9]/g, ""));
                            const cleaned = txt.replace(/[^0-9]/g, "");
                            handleChange(
                              "scheduledOrderFullRefundHoursBefore",
                              cleaned === "" ? null : Number(cleaned)
                            );
                            return cleaned;
                          }}
                          placeholder="24"
                        />
                      </View>
                      <View style={isWideLayout ? styles.twoColItem : undefined}>
                        <NumberField
                          label={t(
                            "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.partialHoursBefore"
                          )}
                          text={partialRefundHoursText}
                          setText={(txt) => {
                            setPartialRefundHoursText(txt.replace(/[^0-9]/g, ""));
                            const cleaned = txt.replace(/[^0-9]/g, "");
                            handleChange(
                              "scheduledOrderPartialRefundHoursBefore",
                              cleaned === "" ? null : Number(cleaned)
                            );
                            return cleaned;
                          }}
                          placeholder="12"
                        />
                      </View>
                    </View>

                    <View style={isWideLayout ? styles.twoColRow : undefined}>
                      <View style={isWideLayout ? styles.twoColItem : undefined}>
                        <NumberField
                          label={t(
                            "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.noRefundHoursBefore"
                          )}
                          text={noRefundHoursText}
                          setText={(txt) => {
                            setNoRefundHoursText(txt.replace(/[^0-9]/g, ""));
                            const cleaned = txt.replace(/[^0-9]/g, "");
                            handleChange(
                              "scheduledOrderNoRefundHoursBefore",
                              cleaned === "" ? null : Number(cleaned)
                            );
                            return cleaned;
                          }}
                          placeholder="2"
                        />
                      </View>
                      <View style={isWideLayout ? styles.twoColItem : undefined}>
                        <NumberField
                          label={t(
                            "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.partialPercentage"
                          )}
                          text={partialRefundPercentText}
                          setText={(txt) => {
                            setPartialRefundPercentText(txt.replace(/[^0-9]/g, ""));
                            const cleaned = txt.replace(/[^0-9]/g, "");
                            handleChange(
                              "scheduledOrderPartialRefundPercentage",
                              cleaned === "" ? null : Number(cleaned)
                            );
                            return cleaned;
                          }}
                          placeholder="50"
                        />
                      </View>
                    </View>

                    <NumberField
                      label={t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.refund.reducedPercentage"
                      )}
                      text={reducedRefundPercentText}
                      setText={(txt) => {
                        setReducedRefundPercentText(txt.replace(/[^0-9]/g, ""));
                        const cleaned = txt.replace(/[^0-9]/g, "");
                        handleChange(
                          "scheduledOrderReducedRefundPercentage",
                          cleaned === "" ? null : Number(cleaned)
                        );
                        return cleaned;
                      }}
                      placeholder="25"
                    />
                  </>
                )}
              </View>

              <View style={styles.borderedSection}>
                <Text style={styles.sectionTitle}>
                  {t(
                    "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.title"
                  )}
                </Text>

                <View style={styles.switchRow}>
                  <Text style={styles.label}>
                    {t(
                      "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.enable"
                    )}
                  </Text>
                  <Switch
                    value={!!form.scheduledOrderAllowModification}
                    onValueChange={(v) =>
                      handleChange("scheduledOrderAllowModification", v)
                    }
                    trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                    thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                    ios_backgroundColor="#f3f4f6"
                  />
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.label}>
                    {t(
                      "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.shallowEnable"
                    )}
                  </Text>
                  <Switch
                    value={!!form.scheduledOrderAllowShallowModification}
                    onValueChange={(v) =>
                      handleChange("scheduledOrderAllowShallowModification", v)
                    }
                    trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                    thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                    ios_backgroundColor="#f3f4f6"
                  />
                </View>

                {!!form.scheduledOrderAllowModification && (
                  <NumberField
                    label={t(
                      "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.windowHours"
                    )}
                    text={modificationWindowText}
                    setText={(txt) => {
                      setModificationWindowText(txt.replace(/[^0-9]/g, ""));
                      const cleaned = txt.replace(/[^0-9]/g, "");
                      handleChange(
                        "scheduledOrderModificationWindowHours",
                        cleaned === "" ? null : Number(cleaned)
                      );
                      return cleaned;
                    }}
                    placeholder="0"
                  />
                )}
              </View>

              <View style={styles.borderedSection}>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.label"
                      )}
                    </Text>
                    <Text style={styles.helpText}>
                      {t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.autoConfirm.description"
                      )}
                    </Text>
                  </View>
                  <Switch
                    value={form.scheduledOrderAutoConfirm !== false}
                    onValueChange={(v) =>
                      handleChange("scheduledOrderAutoConfirm", v)
                    }
                    trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                    thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                    ios_backgroundColor="#f3f4f6"
                  />
                </View>

                <View style={isWideLayout ? styles.twoColRow : undefined}>
                  <View style={isWideLayout ? styles.twoColItem : undefined}>
                    <NumberField
                      label={t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.label"
                      )}
                      text={scheduledMinAmountText}
                      setText={(txt) => {
                        setScheduledMinAmountText(txt.replace(/[^0-9.]/g, ""));
                        const cleaned = txt.replace(/[^0-9.]/g, "");
                        handleChange(
                          "scheduledOrderMinimumAmount",
                          cleaned === "" ? null : Number(cleaned)
                        );
                        return cleaned;
                      }}
                      placeholder="0"
                    />
                  </View>
                  <View style={isWideLayout ? styles.twoColItem : undefined}>
                    {!!form.scheduledOrderAllowModification && (
                      <NumberField
                        label={t(
                          "admin.branchManagement.create.orderSettings.scheduledOrderManagement.modification.windowHours"
                        )}
                        text={modificationWindowText}
                        setText={(txt) => {
                          setModificationWindowText(txt.replace(/[^0-9]/g, ""));
                          const cleaned = txt.replace(/[^0-9]/g, "");
                          handleChange(
                            "scheduledOrderModificationWindowHours",
                            cleaned === "" ? null : Number(cleaned)
                          );
                          return cleaned;
                        }}
                        placeholder="0"
                      />
                    )}
                  </View>
                </View>
                <Text style={styles.helpText}>
                  {t(
                    "admin.branchManagement.create.orderSettings.scheduledOrderManagement.minimumAmount.description"
                  )}
                </Text>
              </View>

              <Separator />

              {/* Scheduled Order Time Slot Interval */}
              <Text style={styles.sectionTitle}>
                {t(
                  "admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.title"
                )}
              </Text>
              <Text style={styles.helpText}>
                {t(
                  "admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.description"
                )}
              </Text>
              <View style={styles.borderedSection}>
                <View style={isWideLayout ? styles.twoColRow : undefined}>
                  <View style={isWideLayout ? styles.twoColItem : undefined}>
                    <NumberField
                      label={t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderTimeSlotInterval.label"
                      )}
                      text={scheduledTimeSlotIntervalText}
                      setText={(txt) => {
                        setScheduledTimeSlotIntervalText(txt.replace(/[^0-9]/g, ""));
                        const cleaned = txt.replace(/[^0-9]/g, "");
                        handleChange(
                          "scheduledOrderTimeSlotInterval",
                          cleaned === "" ? null : Number(cleaned)
                        );
                        return cleaned;
                      }}
                      placeholder="30"
                    />
                  </View>
                  <View style={isWideLayout ? styles.twoColItem : undefined}>
                    <NumberField
                      label={t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.label"
                      )}
                      text={scheduledMaxOrdersPerSlotText}
                      setText={(txt) => {
                        setScheduledMaxOrdersPerSlotText(txt.replace(/[^0-9]/g, ""));
                        const cleaned = txt.replace(/[^0-9]/g, "");
                        handleChange(
                          "scheduledOrderMaxOrdersPerSlot",
                          cleaned === "" ? null : Number(cleaned)
                        );
                        return cleaned;
                      }}
                      placeholder={t(
                        "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.unlimited"
                      )}
                    />
                  </View>
                </View>
                <Text style={styles.helpText}>
                  {t(
                    "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.hint"
                  )}
                </Text>
              </View>

              {/* Scheduled Order Capacity */}
              <Text style={styles.sectionTitle}>
                {t(
                  "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.title"
                )}
              </Text>
              <Text style={styles.helpText}>
                {t(
                  "admin.branchManagement.create.orderSettings.scheduledOrderMaxOrdersPerSlot.description"
                )}
              </Text>
            </>
          )}
        </CollapsibleCard>

        {/* Delivery Settings */}
        <CollapsibleCard
          titleIcon="truck"
          title={t("admin.branchManagement.create.deliverySettings.title")}
          description={t("admin.branchManagement.create.deliverySettings.description")}
        >
          <View style={isWideLayout ? styles.twoColRow : undefined}>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.deliverySettings.deliveryRadius")}
                text={radiusText}
                setText={(txt) => setRadiusText(updateNumber("deliveryRadius", txt, true))}
                placeholder={t("admin.branchManagement.create.deliverySettings.deliveryRadiusPlaceholder") || "5"}
              />
            </View>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.deliverySettings.ratePerKm")}
                text={ratePerKmText}
                setText={(txt) => setRatePerKmText(updateNumber("deliveryRatePerKilometer", txt, true))}
                placeholder={t("admin.branchManagement.create.deliverySettings.ratePerKmPlaceholder") || "0.00"}
              />
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t("admin.branchManagement.create.deliverySettings.useDynamicDeliveryFee")}
              </Text>
              <Text style={styles.helpText}>
                {t("admin.branchManagement.create.deliverySettings.useDynamicDeliveryFeeDescription")}
              </Text>
            </View>
            <Switch
              value={!!form.useDynamicDeliveryFee}
              onValueChange={(v) => {
                handleChange("useDynamicDeliveryFee", v);
                handleChange("useTieredDeliveryFee", v ? false : form.useTieredDeliveryFee);
              }}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t("admin.branchManagement.create.deliverySettings.useTieredDeliveryFee")}
              </Text>
              <Text style={styles.helpText}>
                {t("admin.branchManagement.create.deliverySettings.useTieredDeliveryFeeDescription")}
              </Text>
            </View>
            <Switch
              value={!!form.useTieredDeliveryFee}
              onValueChange={(v) => {
                handleChange("useTieredDeliveryFee", v);
                handleChange("useDynamicDeliveryFee", v ? false : form.useDynamicDeliveryFee);
              }}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          {form.useTieredDeliveryFee && (
            <View style={styles.tieredSection}>
              <Text style={styles.tieredTitle}>
                {t("admin.branchManagement.create.deliverySettings.tieredTitle") || t("admin.branchManagement.create.deliverySettings.howItWorks")}
              </Text>
              <View style={isWideLayout ? styles.twoColRow : undefined}>
                <View style={isWideLayout ? styles.twoColItem : undefined}>
                  <NumberField
                    label={t("admin.branchManagement.create.deliverySettings.initialRange")}
                    text={initialRangeText}
                    setText={(txt) => setInitialRangeText(updateNumber("initialDeliveryRange", txt, true))}
                    placeholder={t("admin.branchManagement.create.deliverySettings.initialRangePlaceholder") || "0"}
                  />
                </View>
                <View style={isWideLayout ? styles.twoColItem : undefined}>
                  <NumberField
                    label={t("admin.branchManagement.create.deliverySettings.initialPrice")}
                    text={initialPriceText}
                    setText={(txt) => setInitialPriceText(updateNumber("initialDeliveryPrice", txt, true))}
                    placeholder={t("admin.branchManagement.create.deliverySettings.initialPricePlaceholder") || "0.00"}
                  />
                </View>
              </View>

              <View style={isWideLayout ? styles.twoColRow : undefined}>
                <View style={isWideLayout ? styles.twoColItem : undefined}>
                  <NumberField
                    label={t("admin.branchManagement.create.deliverySettings.extendedThresholdOptional")}
                    text={extendedThresholdText}
                    setText={(txt) => {
                      setExtendedThresholdText(txt);
                      const num = parseFloat(txt);
                      handleChange("extendedDeliveryThreshold", txt === "" ? "" : String(num));
                    }}
                    placeholder={t("admin.branchManagement.create.deliverySettings.extendedThresholdPlaceholder") || "0"}
                  />
                </View>
                <View style={isWideLayout ? styles.twoColItem : undefined}>
                  <NumberField
                    label={t("admin.branchManagement.create.deliverySettings.extendedRateOptional")}
                    text={extendedRateText}
                    setText={(txt) => {
                      setExtendedRateText(txt);
                      const num = parseFloat(txt);
                      handleChange("extendedDeliveryRate", txt === "" ? "" : String(num));
                    }}
                    placeholder={t("admin.branchManagement.create.deliverySettings.extendedRatePlaceholder") || "0.00"}
                  />
                </View>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  <Text style={styles.infoBold}>
                    {t("admin.branchManagement.create.deliverySettings.howItWorks")}
                  </Text>{" "}
                  {t("admin.branchManagement.create.deliverySettings.howItWorksDescription")}
                </Text>
              </View>
            </View>
          )}
          <View style={isWideLayout ? styles.twoColRow : undefined}>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.deliverySettings.deliveryTimeEstimate")}
                text={timeEstimateText}
                setText={(txt) => setTimeEstimateText(updateNumber("deliveryTimeEstimate", txt, false))}
                placeholder={t("admin.branchManagement.create.deliverySettings.deliveryTimeEstimatePlaceholder") || "45"}
              />
            </View>
            <View style={isWideLayout ? styles.twoColItem : undefined}>
              <NumberField
                label={t("admin.branchManagement.create.deliverySettings.freeDeliveryThreshold")}
                text={freeDeliveryText}
                setText={(txt) => setFreeDeliveryText(updateNumber("freeDeliveryThreshold", txt, true))}
                placeholder={t("admin.branchManagement.create.deliverySettings.freeDeliveryThresholdPlaceholder") || "0.00"}
              />
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.deliverySettings.enableFreeDelivery")}
            </Text>
            <Switch
              value={!!form.enableFreeDelivery}
              onValueChange={(v) => handleChange("enableFreeDelivery", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
        </CollapsibleCard>

        {/* Delivery Payment Settings */}
        <CollapsibleCard
          titleIcon="credit-card"
          title={t("admin.branchManagement.create.deliveryPaymentSettings.title")}
          description={t("admin.branchManagement.create.deliveryPaymentSettings.description")}
        >
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.paymentSettings.acceptCash")}
            </Text>
            <Switch
              value={!!form.acceptCash}
              onValueChange={(v) => handleChange("acceptCash", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.paymentSettings.acceptCard")}
            </Text>
            <Switch
              value={!!form.acceptCard}
              onValueChange={(v) => handleChange("acceptCard", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.paymentSettings.acceptOnlinePayment")}
            </Text>
            <Switch
              value={!!form.acceptOnlinePayment}
              onValueChange={(v) => handleChange("acceptOnlinePayment", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
        </CollapsibleCard>

        {/* Pickup Payment Settings */}
        <CollapsibleCard
          titleIcon="credit-card"
          title={t("admin.branchManagement.create.pickupPaymentSettings.title")}
          description={t("admin.branchManagement.create.pickupPaymentSettings.description")}
        >
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.pickupPaymentSettings.acceptCash")}
            </Text>
            <Switch
              value={!!form.pickupAcceptCash}
              onValueChange={(v) => handleChange("pickupAcceptCash", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.pickupPaymentSettings.acceptCard")}
            </Text>
            <Switch
              value={!!form.pickupAcceptCard}
              onValueChange={(v) => handleChange("pickupAcceptCard", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.pickupPaymentSettings.acceptOnlinePayment")}
            </Text>
            <Switch
              value={!!form.pickupAcceptOnlinePayment}
              onValueChange={(v) => handleChange("pickupAcceptOnlinePayment", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>
              {t("admin.branchManagement.create.pickupPaymentSettings.acceptPayPal")}
            </Text>
            <Switch
              value={!!form.pickupAcceptPayPal}
              onValueChange={(v) => handleChange("pickupAcceptPayPal", v)}
              trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
              thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
              ios_backgroundColor="#f3f4f6"
            />
          </View>
        </CollapsibleCard>

        {/* Serving Hours */}
        <CollapsibleCard
          titleIcon="clock"
          title={t("admin.branchManagement.create.servingHours.title")}
          description={t("admin.branchManagement.create.servingHours.description")}
        >
          <View style={styles.infoBox}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {t("admin.branchManagement.create.servingHours.allowOrdersOutsideHours")}
                </Text>
                <Text style={styles.helpText}>
                  {t("admin.branchManagement.create.servingHours.allowOrdersOutsideHoursDescription")}
                </Text>
              </View>
              <Switch
                value={!!form.allowOrdersOutsideHours}
                onValueChange={(v) => handleChange("allowOrdersOutsideHours", v)}
                trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                ios_backgroundColor="#f3f4f6"
              />
            </View>
          </View>

          {DAYS_OF_WEEK.map((day) => {
            const isOffKey = `${day.key}IsOff` as keyof BranchForm;
            const isOff = (form[isOffKey] as boolean) || false;
            const periods = getDayPeriods(day.key);

            return (
              <View key={day.key} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>
                    {t(day.labelKey)}
                  </Text>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>
                      {t("admin.branchManagement.create.servingHours.closed")}
                    </Text>
                    <Switch
                      value={isOff}
                      onValueChange={(v) => handleChange(isOffKey, v)}
                      trackColor={{ false: "#f3f4f6", true: "#ec4899" }}
                      thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                      ios_backgroundColor="#f3f4f6"
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
                              {t("admin.branchManagement.create.servingHours.period") || "Period"} {periodIndex + 1}
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
                              {t("admin.branchManagement.create.servingHours.openTime")}
                            </Text>
                            <TouchableOpacity
                              style={styles.timeInput}
                              onPress={() => openTimePicker(day.key, periodIndex, "open", period.open || "")}
                            >
                              <Text style={[styles.timeInputText, !period.open && styles.timeInputPlaceholder]}>
                                {period.open || t("admin.branchManagement.create.servingHours.openTime") || "9:00 AM"}
                              </Text>
                              <MaterialCommunityIcons name="clock" size={18} color="#666" />
                            </TouchableOpacity>
                          </View>
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.label}>
                              {t("admin.branchManagement.create.servingHours.closeTime")}
                            </Text>
                            <TouchableOpacity
                              style={styles.timeInput}
                              onPress={() => openTimePicker(day.key, periodIndex, "close", period.close || "")}
                            >
                              <Text style={[styles.timeInputText, !period.close && styles.timeInputPlaceholder]}>
                                {period.close || t("admin.branchManagement.create.servingHours.closeTime") || "5:00 PM"}
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
                        {t("admin.branchManagement.create.servingHours.addPeriod") || "Add Period"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </CollapsibleCard>

        {/* Social Media & Contact */}
        <CollapsibleCard
          titleIcon="email"
          title={t("admin.branchManagement.create.socialMedia.title")}
          description={t("admin.branchManagement.create.socialMedia.description")}
        >
          <View style={isWideLayout ? styles.twoColWrap : undefined}>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <InputField
                label={t("admin.branchManagement.create.socialMedia.facebookUrl")}
                value={form.facebookUrl || ""}
                onChangeText={(text) => handleChange("facebookUrl", text)}
                placeholder={t("admin.branchManagement.create.socialMedia.facebookUrlPlaceholder")}
              />
            </View>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <InputField
                label={t("admin.branchManagement.create.socialMedia.instagramUrl")}
                value={form.instagramUrl || ""}
                onChangeText={(text) => handleChange("instagramUrl", text)}
                placeholder={t("admin.branchManagement.create.socialMedia.instagramUrlPlaceholder")}
              />
            </View>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <InputField
                label={t("admin.branchManagement.create.socialMedia.twitterUrl")}
                value={form.twitterUrl || ""}
                onChangeText={(text) => handleChange("twitterUrl", text)}
                placeholder={t("admin.branchManagement.create.socialMedia.twitterUrlPlaceholder")}
              />
            </View>
            <View style={isWideLayout ? styles.twoColCell : undefined}>
              <InputField
                label={t("admin.branchManagement.create.socialMedia.websiteUrl")}
                value={form.websiteUrl || ""}
                onChangeText={(text) => handleChange("websiteUrl", text)}
                placeholder={t("admin.branchManagement.create.socialMedia.websiteUrlPlaceholder")}
              />
            </View>
          </View>
        </CollapsibleCard>
      </ScrollView>

      {/* Service type picker bottom sheet */}
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
                {t("admin.branchManagement.create.businessInformation.serviceType")}
              </Text>
              <TouchableOpacity onPress={() => setShowServiceTypePicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {SERVICE_TYPES.map((item) => {
                const current = form.serviceType;
                const isActive =
                  item.value === "USE_SETTINGS"
                    ? current == null
                    : current === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.bottomSheetOption,
                      isActive && styles.bottomSheetOptionActive,
                    ]}
                    onPress={() => {
                      handleChange(
                        "serviceType",
                        item.value === "USE_SETTINGS" ? null : item.value
                      );
                      setShowServiceTypePicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.bottomSheetOptionText,
                        isActive && styles.bottomSheetOptionTextActive,
                      ]}
                    >
                      {item.value === "USE_SETTINGS"
                        ? t("admin.serviceType.useSettings", {
                            value:
                              globalServiceType === "RESTAURANT"
                                ? t("admin.serviceType.restaurant")
                                : globalServiceType === "MEAT_SHOP"
                                ? t("admin.serviceType.meatShop")
                                : globalServiceType === "BAKERY"
                                ? t("admin.serviceType.bakery")
                                : t("admin.serviceType.foodTruck"),
                          })
                        : t(item.labelKey)}
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
              <Text style={styles.modalTitle}>
                {t("admin.branchManagement.create.businessInformation.selectTimezone")}
              </Text>
              <TouchableOpacity onPress={() => setShowTimezonePicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, paddingBottom: 8 }}>
              <View style={styles.searchContainer}>
                <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("admin.branchManagement.create.businessInformation.selectTimezone")}
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
                    handleChange("timezone", item);
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

      {/* Branch image picker modal */}
      <Modal
        visible={showBranchImagePickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchImagePickerModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchImagePickerModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.branchManagement.create.businessInformation.branchImage")}
              </Text>
              <TouchableOpacity onPress={() => setShowBranchImagePickerModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 12, gap: 10 }}>
              <TouchableOpacity
                style={styles.bottomSheetOption}
                onPress={() => void pickAndUploadBranchImage("camera")}
                disabled={isUploadingBranchImage}
              >
                <Text style={styles.bottomSheetOptionText}>
                  {t("admin.settings.imagePicker.takePhoto")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bottomSheetOption}
                onPress={() => void pickAndUploadBranchImage("library")}
                disabled={isUploadingBranchImage}
              >
                <Text style={styles.bottomSheetOptionText}>
                  {t("admin.settings.imagePicker.chooseFromLibrary")}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        topOffset={headerHeight + 12}
      />

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
                {t("admin.branchManagement.create.financialSettings.selectCurrency")}
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
                    handleChange("currency", item.value);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={styles.currencyItemText}>{t(item.labelKey)}</Text>
                  {form.currency === item.value && (
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
                        ? t("admin.branchManagement.create.servingHours.openTime")
                        : t("admin.branchManagement.create.servingHours.closeTime")}
                      {timePickerState.periodIndex > 0 && ` (${t("admin.branchManagement.create.servingHours.period") || "Period"} ${timePickerState.periodIndex + 1})`}
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
          !editable && { backgroundColor: "#f3f4f6", color: "#6B7280" },
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
            disabled && { backgroundColor: "#f3f4f6", color: "#6B7280" },
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
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  twoColRow: {
    flexDirection: "row",
    gap: 12,
  },
  twoColItem: {
    flex: 1,
    minWidth: 0,
  },
  twoColWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
  },
  twoColCell: {
    width: "48%",
    minWidth: 0,
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ec4899",
    marginBottom: 4,
  },
  titleSection: {
    marginBottom: 24,
    gap: 4,
  },
  saveButtonContainer: {
    marginBottom: 16,
    alignItems: "flex-end",
  },
  screenSubtitle: {
    color: "#374151",
    fontSize: 13,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  headerButtonOutline: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "transparent",
  },
  headerButtonOutlineText: {
    color: "#ec4899",
    fontWeight: "700",
    fontSize: 12,
  },
  headerButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ec4899",
  },
  headerButtonPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "transparent",
  },
  cancelButtonText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13,
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
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardDescription: {
    color: "#374151",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cardBody: {
    padding: 16,
    gap: 12,
  },
  inputRow: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  label: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  separator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  helpText: {
    color: "#374151",
    fontSize: 11,
    marginTop: 4,
    marginBottom: 8,
  },
  readOnlyInput: {
    backgroundColor: "#ffffff",
    opacity: 0.7,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  selectButtonText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "500",
  },
  imageRowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
  },
  imageRowTitle: {
    color: "#111827",
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
    backgroundColor: "#e5e7eb",
  },
  imageRowActionText: {
    color: "#111827",
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
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    flex: 1,
  },
  imagePickButtonText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 12,
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
    paddingBottom: 40,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
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
  bottomSheetOptionText: { fontSize: 15, color: "#374151", fontWeight: "500" },
  bottomSheetOptionTextActive: { color: "#ec4899", fontWeight: "600" },
  inputDisabled: {
    opacity: 0.5,
  },
  dayRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
    backgroundColor: "#ffffff",
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
  addressSection: {
    marginTop: 8,
  },
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  gpsButtonText: {
    color: "#ec4899",
    fontSize: 12,
    fontWeight: "600",
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
  suggestionsContainer: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    maxHeight: 200,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  suggestionText: {
    color: "#111827",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  selectField: {
    marginBottom: 12,
  },
  borderedSection: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    gap: 12,
    marginBottom: 12,
    backgroundColor: "#ffffff",
  },
  tieredSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tieredTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ec4899",
    marginBottom: 12,
  },
  infoBox: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 8,
  },
  infoText: {
    color: "#374151",
    fontSize: 12,
    lineHeight: 18,
  },
  infoBold: {
    fontWeight: "700",
    color: "#111827",
  },
  dayCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  switchLabel: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
  },
  periodsContainer: {
    gap: 12,
  },
  periodCard: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
  timeRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeInput: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
  timeInputText: {
    color: "#111827",
    fontSize: 14,
    flex: 1,
  },
  timeInputPlaceholder: {
    color: "#666",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
  },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    marginBottom: 10,
  },
  modalOptionText: {
    color: "#111827",
    fontWeight: "700",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseButtonText: {
    color: "#374151",
    fontWeight: "700",
  },
  currencyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  currencyItemText: {
    color: "#111827",
    fontSize: 16,
  },
  timePickerModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  timePickerContainer: {
    padding: 20,
    alignItems: "center",
  },
  timePicker: {
    width: "100%",
  },
  timePickerActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  timePickerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timePickerButtonCancel: {
    backgroundColor: "#e5e7eb",
  },
  timePickerButtonConfirm: {
    backgroundColor: "#ec4899",
  },
  timePickerButtonTextCancel: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  timePickerButtonTextConfirm: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

