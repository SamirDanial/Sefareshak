import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image as RNImage,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { GestureHandlerRootView, ScrollView as GestureHandlerScrollView } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { Toast } from "@/components/Toast";
import FloorPlanViewer from "@/components/FloorPlanViewer";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { useAppMode } from "@/src/contexts/AppModeContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { usePosDevice } from "@/src/contexts/PosDeviceContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useBranch } from "@/src/contexts/BranchContext";
import ApiService from "@/src/services/apiService";
import branchService, { type Branch, type Organization } from "@/src/services/branchService";
import { categoryService, type Category } from "@/src/services/categoryService";
import { dealService, type Deal } from "@/src/services/dealService";
import { mealService, type Meal } from "@/src/services/mealService";
import { orderService } from "@/src/services/orderService";
import { posOrderService, type PosCartItem, type PosPaymentMethod, type PosPaymentStatus, type PosServiceMode } from "@/src/services/posOrderService";
import { voucherService } from "@/src/services/voucherService";
import { printerService } from "@/src/services/printerService";
import { buildEscPosBytes } from "@/src/utils/receiptBuilder";
import LocalDbService from "@/src/services/localDbService";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import { ItemAdjustmentSheet } from "@/components/pos/ItemAdjustmentSheet";
import { reservationService as reservationsApi, type Table, type ZoneFloorPlan } from "@/src/services/reservationService";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { CameraView, useCameraPermissions } from "expo-camera";

/** Legacy combined POS drafts; migrated once into dine-in-only storage */
const LEGACY_DRAFT_STORAGE_KEY = "bellami:pos:drafts:v1";
const LEGACY_DINE_IN_DRAFT_STORAGE_KEY = "bellami:pos:dine-in:drafts:v1";
const DINE_IN_DRAFT_STORAGE_KEY = "nf:pos:dine-in:drafts:v1";
const COUNTER_TABS_STORAGE_KEY = "nf:pos:counter:tabs:v1";
const CART_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getCartStorageKey = (branchId: string, variant: string) =>
  `nf:pos:${variant === "dine_in" ? "dine-in" : "counter"}:cart:${branchId}`;

export type PosVariant = "counter" | "dine_in";

export type PosSellingExperienceProps = {
  variant: PosVariant;
  /** Optional deep link: select this table when tables load */
  initialTableId?: string;
};
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";
const FALLBACK_CATEGORY_IMAGE = "https://placehold.co/320x200?text=Category";
const SIZE_ORDER: ("S" | "M" | "L" | "XL")[] = ["S", "M", "L", "XL"];

type PosDraftTicket = {
  id: string;
  createdAt: string;
  branchId: string;
  tableId?: string;
  tableNumber?: string;
  cartItems: PosCartItem[];
};

type PosOpenTab = {
  id: string;
  name: string;
  branchId: string;
  createdAt: string;
  cartItems: PosCartItem[];
  discountType: "FIXED" | "PERCENTAGE" | null;
  discountValue: string;
};

type MealCustomizationState = {
  meal: Meal;
  cartItemId?: string;
  quantity: number;
  sizeName?: string;
  mealSizeType: "S" | "M" | "L" | "XL";
  mealSizePrice: number;
  addOns: NonNullable<PosCartItem["addOns"]>;
  optionalIngredients: NonNullable<PosCartItem["optionalIngredients"]>;
};

type PosTaxBreakdown = {
  itemTaxAmount: number;
  addonTaxAmount: number;
  deliveryTaxAmount: number;
  totalTaxAmount: number;
  taxInclusive: boolean;
  takeawayServiceFee: number;
  takeawayServiceTaxAmount: number;
  subtotal: number;
  total: number;
  currency: string;
};

const getBranchOrSettingsValue = <T,>(branchValue: T | null | undefined, settingsValue: T | null | undefined, fallback: T): T => {
  if (branchValue !== null && branchValue !== undefined) return branchValue;
  if (settingsValue !== null && settingsValue !== undefined) return settingsValue;
  return fallback;
};

const currencyFormatter = (amount: number, currency: string = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const truncate = (text: string, maxLength: number) => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
};

const getOptimizedImageUrl = (imagePath?: string | null, fallback?: string) => {
  const normalizedImagePath = String(imagePath || "").trim();
  if (
    !normalizedImagePath ||
    normalizedImagePath.toLowerCase() === "null" ||
    normalizedImagePath.toLowerCase() === "undefined"
  ) {
    return fallback || "";
  }
  if (normalizedImagePath.startsWith("http://") || normalizedImagePath.startsWith("https://")) {
    return normalizedImagePath;
  }
  return `${API_BASE_URL}/uploads/images/${normalizedImagePath}`;
};

const getEffectiveMealBasePrice = (meal?: Meal | null) =>
  Number((meal as any)?.effectiveBasePrice ?? meal?.basePrice ?? 0);

const getNearestSmallerSizeType = (
  mealSizeType: "S" | "M" | "L" | "XL" | null | undefined,
  availableSizeTypes: ("S" | "M" | "L" | "XL")[]
) => {
  const targetSize = mealSizeType || "M";
  if (!availableSizeTypes.length) return null;

  const sorted = [...availableSizeTypes].sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
  );
  const targetIndex = SIZE_ORDER.indexOf(targetSize);
  let bestMatch: "S" | "M" | "L" | "XL" | null = null;

  for (const size of sorted) {
    const sizeIndex = SIZE_ORDER.indexOf(size);
    if (sizeIndex <= targetIndex) {
      bestMatch = size;
    } else {
      break;
    }
  }

  return bestMatch || sorted[0];
};

const getAddonPriceAndSizeForMeal = (
  addOn: Meal["mealAddOns"][number]["addOn"] | undefined,
  mealSizeType: "S" | "M" | "L" | "XL" | null | undefined
) => {
  const originalBasePrice = Number(addOn?.price ?? 0);
  const branchBasePrice =
    (addOn as any)?.effectiveBasePrice !== undefined && (addOn as any)?.effectiveBasePrice !== null
      ? Number((addOn as any).effectiveBasePrice)
      : originalBasePrice;

  if (addOn?.addonSizes?.length) {
    const matchedSizeType = getNearestSmallerSizeType(
      mealSizeType,
      addOn.addonSizes.map((size) => size.sizeType)
    );
    const matchedSize = addOn.addonSizes.find((size) => size.sizeType === matchedSizeType);

    if (matchedSize) {
      const originalSizePrice = Number(matchedSize.price ?? 0);
      const sizePriceAdjustment = originalSizePrice - originalBasePrice;
      return {
        price: branchBasePrice + sizePriceAdjustment,
        sizeType: matchedSizeType || undefined,
      };
    }

    return {
      price: 0,
      sizeType: matchedSizeType || undefined,
    };
  }

  if ((addOn as any)?.effectiveBasePrice !== undefined) {
    return { price: Number((addOn as any).effectiveBasePrice), sizeType: undefined };
  }

  return { price: originalBasePrice, sizeType: undefined };
};

const isExcludedFromBranch = (excludedBranches: string[] | undefined, branchId: string | null | undefined) => {
  if (!branchId) return false;
  return Array.isArray(excludedBranches) && excludedBranches.includes(branchId);
};

const isMealVisibleInBranch = (meal: Meal, branchId: string | null | undefined) => {
  if (meal.isActive === false) return false;
  if (isExcludedFromBranch((meal as any)?.excludedBranches, branchId)) return false;
  if (isExcludedFromBranch((meal.category as any)?.excludedBranches, branchId)) return false;
  return true;
};

const isDealVisibleInBranch = (deal: { isActive: boolean; excludedBranches?: string[]; category?: { excludedBranches?: string[] } }, branchId: string | null | undefined) => {
  if (!deal.isActive) return false;
  if (isExcludedFromBranch(deal.excludedBranches, branchId)) return false;
  if (isExcludedFromBranch(deal.category?.excludedBranches, branchId)) return false;
  return true;
};

const getVisibleMealAddOns = (meal: Meal, branchId: string | null | undefined) =>
  (meal.mealAddOns || []).filter((entry) => {
    const addOn = entry.addOn;
    if (!addOn) return false;
    if (addOn.isActive === false) return false;
    if (isExcludedFromBranch((addOn as any)?.excludedBranches, branchId)) return false;
    return true;
  });

const buildCustomizationAddOns = (
  meal: Meal,
  branchId: string | null | undefined,
  mealSizeType: "S" | "M" | "L" | "XL",
  selectedAddOns?: NonNullable<PosCartItem["addOns"]>
) => {
  const selectedAddOnMap = new Map((selectedAddOns || []).map((addOn) => [addOn.id, addOn] as const));
  return getVisibleMealAddOns(meal, branchId).map((entry) => {
    const selectedAddOn = selectedAddOnMap.get(entry.addOn.id);
    const { price, sizeType } = getAddonPriceAndSizeForMeal(entry.addOn, mealSizeType);
    return {
      id: entry.addOn.id,
      name: entry.addOn.name,
      quantity:
        entry.addOn.type === "BOOLEAN"
          ? selectedAddOn
            ? 1
            : 0
          : Number(selectedAddOn?.quantity || 0),
      price,
      type: entry.addOn.type,
      description: entry.addOn.description,
      sizeType: sizeType || mealSizeType,
    };
  });
};

const getEffectiveTimezone = (params: {
  branchTimezone?: string | null;
  settingsTimezone?: string | null;
}) => {
  const candidates = [params.branchTimezone, params.settingsTimezone, Intl.DateTimeFormat().resolvedOptions().timeZone];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
    }
  }
  return "UTC";
};

const parseTimeToMinutes = (value: string) => {
  const s = String(value || "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const nowIsoDayAndMinutes = (tz: string) => {
  const now = new Date();
  const isoDay = Number(formatInTimeZone(now, tz, "i"));
  const hh = Number(formatInTimeZone(now, tz, "H"));
  const mm = Number(formatInTimeZone(now, tz, "m"));
  return {
    isoDay: Number.isFinite(isoDay) ? isoDay : 1,
    minutes: (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0),
  };
};

const isWithinWindow = (nowMinutes: number, start: number, end: number) => {
  if (start === end) return true;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
};

const nextStartForWindow = (params: {
  tz: string;
  nowIsoDay: number;
  nowMinutes: number;
  windowIsoDay: number;
  startMinutes: number;
}) => {
  const { tz, nowIsoDay, nowMinutes, windowIsoDay, startMinutes } = params;
  const daysAheadRaw = (windowIsoDay - nowIsoDay + 7) % 7;
  const needsNextWeek = daysAheadRaw === 0 && startMinutes <= nowMinutes;
  const daysAhead = needsNextWeek ? 7 : daysAheadRaw;
  const base = new Date();
  const yyyy = Number(formatInTimeZone(base, tz, "yyyy"));
  const MM = Number(formatInTimeZone(base, tz, "MM"));
  const dd = Number(formatInTimeZone(base, tz, "dd"));
  const utcMidnight = new Date(Date.UTC(yyyy, (MM || 1) - 1, dd || 1, 0, 0, 0));
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + daysAhead);
  const h = Math.floor(startMinutes / 60);
  const m = startMinutes % 60;

  try {
    return fromZonedTime(
      `${utcMidnight.getUTCFullYear()}-${String(utcMidnight.getUTCMonth() + 1).padStart(2, "0")}-${String(utcMidnight.getUTCDate()).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
      tz
    );
  } catch {
    return null;
  }
};

// Validation status helper for organization
const getOrganizationValidationStatus = (organization: Organization | null | undefined) => {
  if (!organization) return { status: 'unknown', message: 'No organization', isValid: false };
  if (!organization.isActive) return { status: 'inactive', message: 'Organization inactive', isValid: false };
  
  const latestValidation = organization.validations && organization.validations.length > 0 ? organization.validations[0] : null;
  const expiresAt = latestValidation?.expiresAt ? new Date(latestValidation.expiresAt) : (organization.validationExpiresAt ? new Date(organization.validationExpiresAt) : null);
  const gracePeriodEndsAt = latestValidation?.gracePeriodEndsAt ? new Date(latestValidation.gracePeriodEndsAt) : (organization.gracePeriodEndsAt ? new Date(organization.gracePeriodEndsAt) : null);

  // Temporarily unvalidated (has validations but org.isValidated is false)
  if (organization.isValidated === false && organization.validations && organization.validations.length > 0) {
    const latest = organization.validations[0];
    if (latest.isActive === false && latest.unvalidatedAt) {
      return { status: 'temporarily_invalid', message: 'Validation temporarily inactive', isValid: false };
    }
  }

  // Not validated at all
  if (organization.isValidated === false) {
    return { status: 'unvalidated', message: 'Organization not validated', isValid: false };
  }

  const now = new Date();

  if (!expiresAt) {
    return { status: 'unvalidated', message: 'No expiration date found', isValid: false };
  }

  // Still valid
  if (now <= expiresAt) {
    return { status: 'valid', message: 'Valid', isValid: true, expiresAt };
  }

  // In grace period
  if (gracePeriodEndsAt && now <= gracePeriodEndsAt) {
    return { status: 'grace_period', message: 'In grace period', isValid: true, gracePeriodEndsAt };
  }

  // Expired
  return { status: 'expired', message: 'Validation expired', isValid: false, expiredOn: expiresAt };
};

const getMealAvailabilityNow = (params: {
  meal: Meal | null | undefined;
  branchId: string | null | undefined;
  tz: string;
}) => {
  const { meal, branchId, tz } = params;
  if (!branchId) return { isAvailableNow: true, nextAvailableAt: null as Date | null };

  const records =
    ((meal as any)?.mealBranchAvailabilities as any[]) ||
    ((meal as any)?.mealBranchAvailability as any[]) ||
    ((meal as any)?.branchAvailabilities as any[]) ||
    [];

  if (!Array.isArray(records) || records.length === 0) {
    return { isAvailableNow: true, nextAvailableAt: null as Date | null };
  }

  const record = records.find((entry) => String(entry?.branchId) === String(branchId));
  if (!record) {
    return { isAvailableNow: true, nextAvailableAt: null as Date | null };
  }

  if (record.isAvailableAllWeek !== false) {
    return { isAvailableNow: true, nextAvailableAt: null as Date | null };
  }

  const windows = Array.isArray(record.windows) ? record.windows : [];
  if (windows.length === 0) {
    return { isAvailableNow: false, nextAvailableAt: null as Date | null };
  }

  const { isoDay: nowIsoDay, minutes: nowMinutes } = nowIsoDayAndMinutes(tz);
  const normalizeDay = (backendDay: number) => {
    const values = windows.map((w: any) => Number(w.dayOfWeek)).filter((n: number) => Number.isFinite(n));
    if (values.includes(0) && values.includes(6)) return Number(backendDay) === 0 ? 7 : Number(backendDay);
    return Number(backendDay);
  };

  for (const window of windows) {
    const start = parseTimeToMinutes(String(window.startTime || ""));
    const end = parseTimeToMinutes(String(window.endTime || ""));
    if (start === null || end === null) continue;
    const windowIsoDay = normalizeDay(window.dayOfWeek);
    if (windowIsoDay === nowIsoDay && isWithinWindow(nowMinutes, start, end)) {
      return { isAvailableNow: true, nextAvailableAt: null as Date | null };
    }
  }

  let nextAvailableAt: Date | null = null;
  for (const window of windows) {
    const start = parseTimeToMinutes(String(window.startTime || ""));
    if (start === null) continue;
    const candidate = nextStartForWindow({
      tz,
      nowIsoDay,
      nowMinutes,
      windowIsoDay: normalizeDay(window.dayOfWeek),
      startMinutes: start,
    });
    if (candidate && (!nextAvailableAt || candidate.getTime() < nextAvailableAt.getTime())) {
      nextAvailableAt = candidate;
    }
  }

  return { isAvailableNow: false, nextAvailableAt };
};

async function migrateLegacyDineInDraftsOnce(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(DINE_IN_DRAFT_STORAGE_KEY);
    if (existing) return;
    // Migrate from bellami:pos:dine-in:drafts:v1 → nf:pos:dine-in:drafts:v1
    const legacyDineIn = await AsyncStorage.getItem(LEGACY_DINE_IN_DRAFT_STORAGE_KEY);
    if (legacyDineIn) {
      await AsyncStorage.setItem(DINE_IN_DRAFT_STORAGE_KEY, legacyDineIn);
      await AsyncStorage.removeItem(LEGACY_DINE_IN_DRAFT_STORAGE_KEY);
      return;
    }
    // Migrate from original combined bellami:pos:drafts:v1 → nf:pos:dine-in:drafts:v1
    const legacy = await AsyncStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
    if (legacy) {
      await AsyncStorage.setItem(DINE_IN_DRAFT_STORAGE_KEY, legacy);
      await AsyncStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

// Data comparison helpers for cache-first loading
const deepCompare = (a: any, b: any): boolean => {
  try {
    return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
  } catch {
    return false;
  }
};

const areCategoriesEqual = (cached: Category[], fresh: Category[]): boolean => {
  if (cached.length !== fresh.length) return false;
  const cachedMap = new Map(cached.map(c => [c.id, c]));
  for (const f of fresh) {
    const c = cachedMap.get(f.id);
    if (!c || !deepCompare(c, f)) return false;
  }
  return true;
};

const areMealsEqual = (cached: Meal[], fresh: Meal[]): boolean => {
  if (cached.length !== fresh.length) return false;
  const cachedMap = new Map(cached.map(m => [m.id, m]));
  for (const f of fresh) {
    const c = cachedMap.get(f.id);
    if (!c || !deepCompare(c, f)) return false;
  }
  return true;
};

// Transform helpers for converting between cache and API formats
const transformCachedCategories = (cached: any[]): Category[] => {
  return cached.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: null,
    image: c.image,
    taxPercentage: c.taxPercentage,
    isActive: true,
    isFeatured: false,
    listOrder: c.displayOrder,
    excludedBranches: c.excludedBranches,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { meals: 0 },
  }));
};

const transformCachedMeals = (cached: any[]): Meal[] => {
  return cached.map((m: any) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    basePrice: String(m.price),
    taxPercentage: m.taxPercentage,
    image: m.image,
    isActive: true,
    categoryId: m.categoryId,
    sku: m.sku,
    listOrder: m.listOrder,
    excludedBranches: m.excludedBranches,
    effectiveBasePrice: m.effectiveBasePrice,
    effectiveTaxPercentage: m.effectiveTaxPercentage,
    mealSizes: m.mealSizes || [],
    mealAddOns: m.mealAddOns || [],
    mealOptionalIngredients: m.mealOptionalIngredients || [],
    mealDeclarations: m.mealDeclarations || [],
    branchAvailabilities: m.branchAvailabilities,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: m.categoryId, name: "" },
    _count: { orderItems: 0 },
  }));
};

const transformCategoriesToCache = (categories: Category[]): any[] => {
  return categories.map((c) => ({
    id: c.id,
    name: c.name || "",
    displayOrder: c.listOrder ?? 0,
    image: c.image || null,
    excludedBranches: c.excludedBranches,
    taxPercentage: c.taxPercentage,
  }));
};

const transformMealsToCache = (meals: Meal[]): any[] => {
  return meals.map((m) => ({
    id: m.id,
    categoryId: m.categoryId || "",
    name: m.name || "",
    sku: m.sku || null,
    listOrder: m.listOrder ?? 0,
    price: typeof m.basePrice === 'string' ? parseFloat(m.basePrice) : (m.basePrice || 0),
    description: m.description || null,
    image: m.image || null,
    excludedBranches: m.excludedBranches,
    taxPercentage: m.taxPercentage,
    effectiveBasePrice: m.effectiveBasePrice,
    effectiveTaxPercentage: m.effectiveTaxPercentage,
    mealSizes: m.mealSizes?.map((s: any) => ({
      id: s.id,
      name: s.name,
      sizeType: s.sizeType,
      price: typeof s.price === 'string' ? parseFloat(s.price) : s.price,
      taxPercentage: s.taxPercentage,
    })),
    mealAddOns: m.mealAddOns?.map((ao: any) => ({
      addOn: {
        id: ao.addOn.id,
        name: ao.addOn.name,
        description: ao.addOn.description,
        price: ao.addOn.price,
        effectiveBasePrice: ao.addOn.effectiveBasePrice,
        effectiveTaxPercentage: ao.addOn.effectiveTaxPercentage,
        type: ao.addOn.type,
        isActive: ao.addOn.isActive,
        excludedBranches: ao.addOn.excludedBranches,
        addonSizes: ao.addOn.addonSizes,
      },
    })),
    mealOptionalIngredients: m.mealOptionalIngredients,
    mealDeclarations: m.mealDeclarations,
    branchAvailabilities: (m as any).branchAvailabilities || (m as any).mealBranchAvailabilities || (m as any).mealBranchAvailability,
  }));
};

export function PosSellingExperience({ variant, initialTableId }: PosSellingExperienceProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken, userType } = useAuthRole();
  const { selectedOrganizationId } = useOrganization();
  const { selectedDevice } = usePosDevice();
  const { can, assignedBranchIds, isLoading: permissionsLoading } = usePermissions();
  const { selectedBranchId, setSelectedBranch } = useBranch();
  const { isPosOnlyMode, exitPosMode } = useAppMode();

  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mealsLimit, setMealsLimit] = useState(50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const cartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBranchIdRef = useRef<string>("");
  const activeTabIdRef = useRef<string | null>(null);
  const cartItemsRef = useRef<PosCartItem[]>([]);
  const discountTypeRef = useRef<"FIXED" | "PERCENTAGE" | null>(null);
  const discountValueRef = useRef<string>("");
  const hasLoadedInitialDataRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const lastLoadedOrgIdRef = useRef<string | null>(null);
  const lastLoadedBranchIdRef = useRef<string | null>(null);
  const categoriesRef = useRef<Category[]>([]);
  const mealsRef = useRef<Meal[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [requireBranchSelection, setRequireBranchSelection] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [adjustmentSheetItem, setAdjustmentSheetItem] = useState<PosCartItem | null>(null);
  const serviceMode: PosServiceMode = variant === "dine_in" ? "DINE_IN" : "COUNTER_TAKEAWAY";
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState<PosPaymentStatus>(
    variant === "dine_in" ? "PENDING" : "PAID"
  );
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [drafts, setDrafts] = useState<PosDraftTicket[]>([]);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [openTabs, setOpenTabs] = useState<PosOpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabSavesCart, setNewTabSavesCart] = useState(true);
  const [showCloseTabModal, setShowCloseTabModal] = useState(false);
  const [tabToClose, setTabToClose] = useState<{ id: string; name: string } | null>(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneFloorPlan, setZoneFloorPlan] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);
  const [showBranchSheet, setShowBranchSheet] = useState(false);
  const [showBranchOfflineDialog, setShowBranchOfflineDialog] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showMealCustomizationModal, setShowMealCustomizationModal] = useState(false);
  const [showDealBuilderModal, setShowDealBuilderModal] = useState(false);
  const [dealCustomization, setDealCustomization] = useState<{ deal: Deal; quantity: number; cartItemId?: string } | null>(null);
  const [showEmptyCartConfirm, setShowEmptyCartConfirm] = useState(false);
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENTAGE" | null>(null);
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountCents, setDiscountCents] = useState(0);
  const [activeView, setActiveView] = useState<"catalog" | "cart">("catalog");
  const [mealCustomization, setMealCustomization] = useState<MealCustomizationState | null>(null);
  const [failedMealImageIds, setFailedMealImageIds] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<any>(null);
  const [organizationSettings, setOrganizationSettings] = useState<any>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" | "warning" }>({
    visible: false,
    message: "",
    type: "info",
  });

  // Voucher Feature State Variables
  const [showSellVoucherModal, setShowSellVoucherModal] = useState(false);
  const [voucherSaleType, setVoucherSaleType] = useState<"SINGLE_PURPOSE" | "MULTI_PURPOSE">("MULTI_PURPOSE");
  const [voucherSaleCents, setVoucherSaleCents] = useState(0);
  const [voucherSaleAmount, setVoucherSaleAmount] = useState("");
  const [voucherSaleVatRate, setVoucherSaleVatRate] = useState<7 | 19>(19);
  const [editingVoucherItemId, setEditingVoucherItemId] = useState<string | null>(null);

  const [showRedeemVoucherModal, setShowRedeemVoucherModal] = useState(false);
  const [voucherRedeemCode, setVoucherRedeemCode] = useState("");
  const [voucherError, setVoucherError] = useState("");
  const [validatedVoucher, setValidatedVoucher] = useState<any | null>(null);
  const [appliedVoucher, setAppliedVoucher] = useState<{
    voucherCode: string;
    amount: number;
    type: string;
    voucherBalance: number;
    vatRate?: number | null;
    remainingBalance?: number;
  } | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Connection state tracking for offline checks
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineVoucherDialog, setShowOfflineVoucherDialog] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      const netInfo = await NetInfo.fetch();
      const offline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);
      setIsOffline(offline);
    };

    checkConnection();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
    });

    return () => unsubscribe();
  }, []);

  
  const [showReceiptPrintModal, setShowReceiptPrintModal] = useState(false);
  const [lastCreatedVoucherCode, setLastCreatedVoucherCode] = useState("");
  const [lastCreatedVoucherType, setLastCreatedVoucherType] = useState("");
  const [lastCreatedVoucherExpires, setLastCreatedVoucherExpires] = useState("");
  const [lastCreatedVoucherAmount, setLastCreatedVoucherAmount] = useState(0);
  const [lastCreatedVoucherVatRate, setLastCreatedVoucherVatRate] = useState<number | null>(null);

  const triggerVoucherPrint = async (voucherCode: string, amount: number, type: string, expires: string, remainingBalance?: number, vatRate?: number | null) => {
    try {
      if (!printerService.isAvailable()) {
        showToast("Bluetooth printing is not available in this build.", "error");
        return;
      }

      const busName = selectedBranch?.name || currentOrganization?.name || "Bellami Store";
      const typeText = type === "SINGLE_PURPOSE" ? "SINGLE-PURPOSE VOUCHER" : "MULTI-PURPOSE VOUCHER";
      const taxText = type === "SINGLE_PURPOSE" ? "Tax was immediately charged" : "Tax charged upon redemption";
      const moneyText = currencyFormatter(amount, taxBreakdown.currency);
      const balanceText = remainingBalance !== undefined ? currencyFormatter(remainingBalance, taxBreakdown.currency) : null;

      const receiptLines = [
        "================================",
        `         ${busName.toUpperCase()}`,
        "      Tax Voucher Receipt",
        "================================\n",
        "VOUCHER TYPE:",
        typeText,
        `(${taxText})\n`,
        "VOUCHER VALUE:",
        moneyText,
      ];

      // Show VAT rate for single-purpose vouchers
      if (type === "SINGLE_PURPOSE" && vatRate !== undefined && vatRate !== null) {
        receiptLines.push(
          "",
          `VAT RATE: ${vatRate}%`
        );
      }

      receiptLines.push(
        "",
        "VOUCHER CODE:",
        voucherCode
      );

      if (balanceText) {
        receiptLines.push(
          "",
          t("admin.pos.remainingAmountUpper", { defaultValue: "REMAINING AMOUNT" }) + ":",
          balanceText
        );
      }

      receiptLines.push(
        "\n================================",
        `Valid until:         ${expires}\n`,
        "__QR__\n\n\n\n\n"
      );

      const receiptLinesJoined: string = receiptLines.join("\n");

      const bytes = buildEscPosBytes(receiptLinesJoined, { qrData: voucherCode, printWidthChars: 32 });

      let addr = await printerService.getLastPrinterAddress();
      if (!addr) {
        const paired = await printerService.listPairedPrinters();
        if (!paired || paired.length === 0) {
          Alert.alert("No Printers Found", "Please pair a Bluetooth thermal printer in your device settings first.");
          return;
        }

        if (paired.length === 1) {
          addr = paired[0].address || paired[0].id;
          await printerService.setLastPrinterAddress(addr);
        } else {
          const buttons = paired.slice(0, 2).map((p) => ({
            text: p.name || p.address || p.id,
            onPress: async () => {
              const selectedAddr = p.address || p.id;
              await printerService.setLastPrinterAddress(selectedAddr);
              try {
                await printerService.printBytes(selectedAddr, bytes);
                showToast(t("admin.pos.voucherReceiptPrinted", { defaultValue: "Voucher receipt successfully printed!" }), "success");
              } catch (err: any) {
                Alert.alert("Print failed", err?.message || "Failed to print");
              }
            }
          }));
          buttons.push({ text: "Cancel", onPress: () => {}, style: "cancel" } as any);
          Alert.alert(
            "Select Printer",
            "Please select a Bluetooth thermal printer to print the voucher:",
            buttons as any
          );
          return;
        }
      }

      if (addr) {
        await printerService.printBytes(addr, bytes);
        showToast(t("admin.pos.voucherReceiptPrinted", { defaultValue: "Voucher receipt successfully printed!" }), "success");
      }
    } catch (err: any) {
      Alert.alert("Print failed", err?.message || "Failed to print");
    }
  };

  const { isSuperAdmin, isOrgAdmin, rbacUser } = usePermissions();
  const viewerOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
  const canSwitchToManagement = isSuperAdmin || isOrgAdmin || viewerOrgRole === 'ORG_OWNER' || viewerOrgRole === 'ORG_ADMIN';

  const canAccessPos = useMemo(
    () => !permissionsLoading && (
      isSuperAdmin ||
      isOrgAdmin ||
      can(RESOURCES.POS, ACTIONS.VIEW)
    ),
    [permissionsLoading, isSuperAdmin, isOrgAdmin, can]
  );
  const isBranchScoped = userType === "BRANCH_ADMIN" || userType === "EMPLOYEE" || userType === "WAITER";

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  );

  const selectedTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) || null,
    [selectedTableId, tables]
  );

  const cartContainsVoucherItem = useMemo(
    () => cartItems.some((item) => (item as any).itemType === "VOUCHER"),
    [cartItems]
  );

  const zones = useMemo(() => {
    const zoneMap = new Map<string, { id: string; name: string }>();
    tables.forEach((table) => {
      if (table.zoneRelation?.id && table.zoneRelation?.name) {
        zoneMap.set(table.zoneRelation.id, {
          id: table.zoneRelation.id,
          name: table.zoneRelation.name,
        });
      }
    });
    return Array.from(zoneMap.values());
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (!selectedZoneId) return tables;
    return tables.filter((table) => table.zoneRelation?.id === selectedZoneId);
  }, [tables, selectedZoneId]);

  const getDealDisplayPrice = (deal: Deal): number => {
    if (!Array.isArray(deal.components) || deal.components.length === 0) return 0;
    const raw = deal.components.reduce((sum, c) => {
      const qty = Number(c.quantity ?? 1);
      return sum + Number(c.price || 0) * (qty > 0 ? qty : 1);
    }, 0);
    return Math.round(raw * 100) / 100;
  };

  const resolvedCurrency = String(getBranchOrSettingsValue(selectedBranch?.currency, settings?.currency, "USD") || "USD");
  const effectiveTimezone = useMemo(
    () => getEffectiveTimezone({ branchTimezone: (selectedBranch as any)?.timezone ?? null, settingsTimezone: (settings as any)?.timezone ?? null }),
    [selectedBranch, settings]
  );

  const activeCategoryIds = useMemo(
    () => new Set(
      categories
        .filter((category) => category.isActive !== false && !isExcludedFromBranch(category.excludedBranches, selectedBranchId || null))
        .map((category) => category.id)
    ),
    [categories, selectedBranchId]
  );

  const filteredDeals = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return deals.filter((deal) => {
      const visibleInBranch = isDealVisibleInBranch(deal, selectedBranchId || null);
      const dealCategoryActive = activeCategoryIds.has(deal.categoryId);
      const byCategory = !selectedCategoryId || deal.categoryId === selectedCategoryId;
      const bySearch =
        !normalized ||
        deal.name.toLowerCase().includes(normalized) ||
        String(deal.description || "").toLowerCase().includes(normalized) ||
        String(deal.sku || "").toLowerCase().includes(normalized);
      return visibleInBranch && dealCategoryActive && (normalized ? true : byCategory) && bySearch;
    }).sort((a, b) => {
      const skuA = a.sku && a.sku.trim() !== "" ? a.sku.trim() : null;
      const skuB = b.sku && b.sku.trim() !== "" ? b.sku.trim() : null;
      if (skuA !== null && skuB !== null) {
        const numA = Number(skuA);
        const numB = Number(skuB);
        const bothNumeric = !isNaN(numA) && !isNaN(numB);
        const skuCmp = bothNumeric ? numA - numB : skuA.localeCompare(skuB);
        if (skuCmp !== 0) return skuCmp;
      } else if (skuA !== null) {
        return -1;
      } else if (skuB !== null) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [activeCategoryIds, deals, searchTerm, selectedBranchId, selectedCategoryId]);

  const filteredMeals = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const filtered = meals.filter((meal) => {
      const mealVisibleInBranch = isMealVisibleInBranch(meal, selectedBranchId || null);
      const mealCategoryActive = activeCategoryIds.has(meal.categoryId);
      const byCategory = !selectedCategoryId || meal.categoryId === selectedCategoryId;
      const bySearch =
        !normalized ||
        meal.name.toLowerCase().includes(normalized) ||
        String(meal.description || "").toLowerCase().includes(normalized) ||
        String(meal.sku || "").toLowerCase().includes(normalized);
      return mealVisibleInBranch && mealCategoryActive && (normalized ? true : byCategory) && bySearch;
    });
    // Deduplicate by meal ID to prevent React key errors
    const uniqueMeals = Array.from(
      new Map(filtered.map((meal) => [meal.id, meal])).values()
    );
    return uniqueMeals.sort((a, b) => {
      const skuA = a.sku && a.sku.trim() !== "" ? a.sku.trim() : null;
      const skuB = b.sku && b.sku.trim() !== "" ? b.sku.trim() : null;
      if (skuA !== null && skuB !== null) {
        const numA = Number(skuA);
        const numB = Number(skuB);
        const bothNumeric = !isNaN(numA) && !isNaN(numB);
        const skuCmp = bothNumeric ? numA - numB : skuA.localeCompare(skuB);
        if (skuCmp !== 0) return skuCmp;
      } else if (skuA !== null) {
        return -1;
      } else if (skuB !== null) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [activeCategoryIds, meals, searchTerm, selectedBranchId, selectedCategoryId]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const qty = item.quantity;
      const baseGross = Math.round(item.price * qty * 100);
      const discVal = item.itemDiscountValue ?? 0;
      const discCents =
        item.itemDiscountType === "PERCENTAGE"
          ? Math.round(baseGross * (Math.min(discVal, 100) / 100))
          : item.itemDiscountType === "FIXED"
          ? item.itemDiscountScope === "PER_UNIT"
            ? Math.round(discVal * qty * 100)
            : Math.round(discVal * 100)
          : 0;
      const surchargeRaw = item.itemSurchargeAmount ?? 0;
      const surchargeCents =
        item.itemSurchargeScope === "PER_UNIT"
          ? Math.round(surchargeRaw * qty * 100)
          : Math.round(surchargeRaw * 100);
      const lineCents = Math.max(0, baseGross + surchargeCents - discCents);
      return sum + lineCents / 100;
    }, 0);
  }, [cartItems]);

  const taxBreakdown = useMemo<PosTaxBreakdown>(() => {
    const taxPercentage = Number(getBranchOrSettingsValue(selectedBranch?.taxPercentage, settings?.taxPercentage, 8.5));
    const taxInclusive = Boolean(getBranchOrSettingsValue(selectedBranch?.taxInclusive, settings?.taxInclusive, false));
    const pickupTakeawayServiceFee = Number(
      getBranchOrSettingsValue((selectedBranch as any)?.pickupTakeawayServiceFee, (settings as any)?.pickupTakeawayServiceFee, 0)
    );
    const takeawayServiceTaxPercentage = Number(
      getBranchOrSettingsValue((selectedBranch as any)?.serviceTaxPercentage, (settings as any)?.serviceTaxPercentage, 0)
    );

    let itemTaxAmount = 0;
    let addonTaxAmount = 0;

    for (const item of cartItems) {
      const meal = meals.find((entry) => entry.id === item.mealId);
      const addonTotalPerUnit = (item.addOns || []).reduce(
        (sum, addon) => sum + Number(addon.price || 0) * Number(addon.quantity || 0),
        0
      );
      const mealUnitPrice = Math.max(0, Number(item.price || 0) - addonTotalPerUnit);
      const matchedSize = meal?.mealSizes?.find((size) => size.name === item.size);
      const mealTaxPercentage = matchedSize?.taxPercentage !== null && matchedSize?.taxPercentage !== undefined
        ? Number(matchedSize.taxPercentage)
        : (meal as any)?.effectiveTaxPercentage !== null && (meal as any)?.effectiveTaxPercentage !== undefined
        ? Number((meal as any).effectiveTaxPercentage)
        : meal?.taxPercentage !== null && meal?.taxPercentage !== undefined
        ? Number(meal.taxPercentage)
        : meal?.category?.taxPercentage !== null && meal?.category?.taxPercentage !== undefined
        ? Number(meal.category.taxPercentage)
        : taxPercentage;

      const unitMealTax = taxInclusive
        ? (mealUnitPrice * mealTaxPercentage) / (100 + mealTaxPercentage)
        : (mealUnitPrice * mealTaxPercentage) / 100;
      itemTaxAmount += unitMealTax * Number(item.quantity || 1);

      for (const addon of item.addOns || []) {
        const sourceAddon = meal?.mealAddOns?.find((entry) => entry.addOn.id === addon.id)?.addOn;
        const matchedAddonSize = addon.sizeType && Array.isArray(sourceAddon?.addonSizes)
          ? sourceAddon.addonSizes.find((size) => String(size.sizeType) === String(addon.sizeType))
          : null;
        const addonTaxPercentage = matchedAddonSize?.taxPercentage !== null && matchedAddonSize?.taxPercentage !== undefined
          ? Number(matchedAddonSize.taxPercentage)
          : (sourceAddon as any)?.taxPercentage !== null && (sourceAddon as any)?.taxPercentage !== undefined
          ? Number((sourceAddon as any).taxPercentage)
          : (sourceAddon as any)?.effectiveTaxPercentage !== null && (sourceAddon as any)?.effectiveTaxPercentage !== undefined
          ? Number((sourceAddon as any).effectiveTaxPercentage)
          : taxPercentage;
        const addonUnitTotal = Number(addon.price || 0) * Number(addon.quantity || 0);
        const unitAddonTax = taxInclusive
          ? (addonUnitTotal * addonTaxPercentage) / (100 + addonTaxPercentage)
          : (addonUnitTotal * addonTaxPercentage) / 100;
        addonTaxAmount += unitAddonTax * Number(item.quantity || 1);
      }
    }

    const takeawayServiceFee = serviceMode === "COUNTER_TAKEAWAY" ? pickupTakeawayServiceFee : 0;
    const takeawayServiceTaxAmount = !taxInclusive && takeawayServiceFee > 0 && takeawayServiceTaxPercentage > 0
      ? (takeawayServiceFee * takeawayServiceTaxPercentage) / 100
      : 0;
    const totalTaxAmount = itemTaxAmount + addonTaxAmount;
    const total = subtotal + takeawayServiceFee + (taxInclusive ? 0 : totalTaxAmount + takeawayServiceTaxAmount);

    return {
      itemTaxAmount,
      addonTaxAmount,
      deliveryTaxAmount: 0,
      totalTaxAmount,
      taxInclusive,
      takeawayServiceFee,
      takeawayServiceTaxAmount,
      subtotal,
      total,
      currency: resolvedCurrency,
    };
  }, [cartItems, meals, resolvedCurrency, selectedBranch, serviceMode, settings, subtotal]);

  const discountAmount = useMemo(() => {
    if (discountType === "FIXED") {
      const raw = discountCents / 100;
      return Math.min(Math.max(raw, 0), taxBreakdown.subtotal);
    }
    if (discountType === "PERCENTAGE") {
      const raw = parseFloat(discountValue) || 0;
      return taxBreakdown.subtotal * (Math.min(Math.max(raw, 0), 100) / 100);
    }
    return 0;
  }, [discountType, discountValue, discountCents, taxBreakdown.subtotal]);

  const taxGrossTotals = useMemo<Record<number, number>>(() => {
    const taxPercentage = Number(getBranchOrSettingsValue(selectedBranch?.taxPercentage, settings?.taxPercentage, 8.5));
    const taxInclusive = Boolean(getBranchOrSettingsValue(selectedBranch?.taxInclusive, settings?.taxInclusive, false));
    const pickupTakeawayServiceFee = Number(
      getBranchOrSettingsValue((selectedBranch as any)?.pickupTakeawayServiceFee, (settings as any)?.pickupTakeawayServiceFee, 0)
    );

    const totals: Record<number, number> = {};

    const addGross = (rate: number, amount: number) => {
      const roundedRate = Math.round(rate * 100) / 100;
      totals[roundedRate] = (totals[roundedRate] || 0) + amount;
    };

    for (const item of cartItems) {
      const qty = item.quantity;
      const baseGross = Math.round(item.price * qty * 100);
      const discVal = item.itemDiscountValue ?? 0;
      const discCents =
        item.itemDiscountType === "PERCENTAGE"
          ? Math.round(baseGross * (Math.min(discVal, 100) / 100))
          : item.itemDiscountType === "FIXED"
          ? item.itemDiscountScope === "PER_UNIT"
            ? Math.round(discVal * qty * 100)
            : Math.round(discVal * 100)
          : 0;
      const surchargeRaw = item.itemSurchargeAmount ?? 0;
      const surchargeCents =
        item.itemSurchargeScope === "PER_UNIT"
          ? Math.round(surchargeRaw * qty * 100)
          : Math.round(surchargeRaw * 100);
      const lineCents = Math.max(0, baseGross + surchargeCents - discCents);
      const lineTotal = lineCents / 100;

      if (lineTotal <= 0) continue;

      const meal = meals.find((entry) => entry.id === item.mealId);
      const addonTotalPerUnit = (item.addOns || []).reduce(
        (sum, addon) => sum + Number(addon.price || 0) * Number(addon.quantity || 0),
        0
      );
      const mealUnitPrice = Math.max(0, Number(item.price || 0) - addonTotalPerUnit);

      // Determine Meal tax rate
      const matchedSize = meal?.mealSizes?.find((size) => size.name === item.size);
      const mealTaxPercentage = matchedSize?.taxPercentage !== null && matchedSize?.taxPercentage !== undefined
        ? Number(matchedSize.taxPercentage)
        : (meal as any)?.effectiveTaxPercentage !== null && (meal as any)?.effectiveTaxPercentage !== undefined
        ? Number((meal as any).effectiveTaxPercentage)
        : meal?.taxPercentage !== null && meal?.taxPercentage !== undefined
        ? Number(meal.taxPercentage)
        : meal?.category?.taxPercentage !== null && meal?.category?.taxPercentage !== undefined
        ? Number(meal.category.taxPercentage)
        : taxPercentage;

      // Proportional fractions
      const lineGrossTotalBeforeDiscounts = item.price * qty;
      const mealGrossFraction = lineGrossTotalBeforeDiscounts > 0 ? (mealUnitPrice * qty) / lineGrossTotalBeforeDiscounts : 1;

      // Meal portion
      const mealLineTotal = lineTotal * mealGrossFraction;
      const mealGross = taxInclusive ? mealLineTotal : mealLineTotal * (1 + mealTaxPercentage / 100);
      addGross(mealTaxPercentage, mealGross);

      // Addons portion
      for (const addon of item.addOns || []) {
        const sourceAddon = meal?.mealAddOns?.find((entry) => entry.addOn.id === addon.id)?.addOn;
        const matchedAddonSize = addon.sizeType && Array.isArray(sourceAddon?.addonSizes)
          ? sourceAddon.addonSizes.find((size) => String(size.sizeType) === String(addon.sizeType))
          : null;
        const addonTaxPercentage = matchedAddonSize?.taxPercentage !== null && matchedAddonSize?.taxPercentage !== undefined
          ? Number(matchedAddonSize.taxPercentage)
          : (sourceAddon as any)?.taxPercentage !== null && (sourceAddon as any)?.taxPercentage !== undefined
          ? Number((sourceAddon as any).taxPercentage)
          : (sourceAddon as any)?.effectiveTaxPercentage !== null && (sourceAddon as any)?.effectiveTaxPercentage !== undefined
          ? Number((sourceAddon as any).effectiveTaxPercentage)
          : taxPercentage;

        const addonGrossBeforeDiscount = Number(addon.price || 0) * Number(addon.quantity || 0) * qty;
        const addonFraction = lineGrossTotalBeforeDiscounts > 0 ? addonGrossBeforeDiscount / lineGrossTotalBeforeDiscounts : 0;
        const addonLineTotal = lineTotal * addonFraction;
        const addonGross = taxInclusive ? addonLineTotal : addonLineTotal * (1 + addonTaxPercentage / 100);
        addGross(addonTaxPercentage, addonGross);
      }
    }

    // Allocate takeaway service fee if any
    const takeawayServiceFee = serviceMode === "COUNTER_TAKEAWAY" ? pickupTakeawayServiceFee : 0;
    if (takeawayServiceFee > 0) {
      const takeawayServiceTaxPercentage = Number(
        getBranchOrSettingsValue((selectedBranch as any)?.serviceTaxPercentage, (settings as any)?.serviceTaxPercentage, 0)
      );
      const feeGross = taxInclusive ? takeawayServiceFee : takeawayServiceFee * (1 + takeawayServiceTaxPercentage / 100);
      addGross(takeawayServiceTaxPercentage, feeGross);
    }

    return totals;
  }, [cartItems, meals, selectedBranch, settings, serviceMode]);

  const finalTaxGrossTotals = useMemo<Record<number, number>>(() => {
    const totals: Record<number, number> = {};
    const factor = subtotal > 0 ? Math.max(0, (subtotal - discountAmount) / subtotal) : 1;
    for (const [rateStr, amount] of Object.entries(taxGrossTotals)) {
      const rate = Number(rateStr);
      totals[rate] = amount * factor;
    }
    return totals;
  }, [taxGrossTotals, subtotal, discountAmount]);

  const checkSinglePurposeVoucherApplicability = useCallback((voucher: any): { valid: boolean; error?: string } => {
    if (!voucher || voucher.voucherType !== "SINGLE_PURPOSE") {
      return { valid: true };
    }
    const rate = Number(voucher.vatRate);
    if (isNaN(rate)) {
      return { valid: true };
    }
    const lookupRate = Math.round(rate * 100) / 100;
    const matchingTotal = finalTaxGrossTotals[lookupRate] || 0;
    if (matchingTotal <= 0.01) {
      return {
        valid: false,
        error: t("admin.pos.voucherVatRateMismatch", {
          defaultValue: "This single-purpose voucher is for {{vatRate}}% VAT items, but there are no matching items in your cart.",
          vatRate: rate,
        }),
      };
    }
    return { valid: true };
  }, [finalTaxGrossTotals, t]);

  const dynamicVoucherDeduction = useMemo(() => {
    if (!appliedVoucher) return 0;
    const orderTotal = Math.max(taxBreakdown.total - discountAmount, 0);
    if (appliedVoucher.type === "SINGLE_PURPOSE" && appliedVoucher.vatRate !== undefined && appliedVoucher.vatRate !== null) {
      const lookupRate = Math.round(appliedVoucher.vatRate * 100) / 100;
      const matchingTaxTotal = finalTaxGrossTotals[lookupRate] || 0;
      return Math.min(appliedVoucher.voucherBalance, matchingTaxTotal);
    }
    return Math.min(appliedVoucher.voucherBalance, orderTotal);
  }, [appliedVoucher, taxBreakdown.total, discountAmount, finalTaxGrossTotals]);

  const fiskalyEnabled = Boolean((settings as any)?.fiskalyEnabled);
  const fiskalyEnvironment = String((settings as any)?.fiskalyEnvironment || "").toUpperCase();
  const fiskalyLive = fiskalyEnabled && fiskalyEnvironment === "LIVE";
  // Check organization settings for Fiskaly status (this is what backend uses)
  const orgFiskalyEnabled = Boolean((organizationSettings as any)?.fiskalyEnabled);
  const selectedDeviceBranchId = String((selectedDevice as any)?.branchId || "").trim();
  const selectedDeviceFiskalyClientId = String((selectedDevice as any)?.fiskalyClientId || "").trim();
  // Require POS device when Fiskaly is enabled for the organization
  const posDeviceRequiredButMissing = Boolean(
    orgFiskalyEnabled &&
      (!selectedDevice ||
        !selectedDeviceFiskalyClientId ||
        (selectedBranchId && selectedDeviceBranchId && selectedDeviceBranchId !== selectedBranchId))
  );

  const mealCustomizationUnitPrice = useMemo(() => {
    if (!mealCustomization) return 0;
    const mealBasePrice = getEffectiveMealBasePrice(mealCustomization.meal);
    const addonTotal = (mealCustomization.addOns || []).reduce(
      (sum, addon) => sum + Number(addon.price || 0) * Number(addon.quantity || 0),
      0
    );
    return mealBasePrice + Number(mealCustomization.mealSizePrice || 0) + addonTotal;
  }, [mealCustomization]);

  const mealCustomizationTotalPrice = useMemo(
    () => mealCustomizationUnitPrice * Number(mealCustomization?.quantity || 1),
    [mealCustomization?.quantity, mealCustomizationUnitPrice]
  );

  const dealBuilderTotalPrice = useMemo(() => {
    if (!dealCustomization) return 0;
    const deal = dealCustomization.deal;
    const unitPrice = Array.isArray(deal.components)
      ? deal.components.reduce((sum, c) => {
          const qty = Number(c.quantity ?? 1);
          return sum + Number(c.price || 0) * (qty > 0 ? qty : 1);
        }, 0)
      : 0;
    return unitPrice * dealCustomization.quantity;
  }, [dealCustomization]);

  const mealCustomizationAvailability = useMemo(
    () => getMealAvailabilityNow({ meal: mealCustomization?.meal, branchId: selectedBranchId || null, tz: effectiveTimezone }),
    [effectiveTimezone, mealCustomization?.meal, selectedBranchId]
  );

  const shouldShowMealSizeSection = Number(mealCustomization?.meal?.mealSizes?.length || 0) > 1;

  const mealCustomizationNextAvailableText = useMemo(
    () =>
      mealCustomizationAvailability.nextAvailableAt
        ? formatInTimeZone(mealCustomizationAvailability.nextAvailableAt, effectiveTimezone, "EEE HH:mm")
        : null,
    [effectiveTimezone, mealCustomizationAvailability.nextAvailableAt]
  );

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const mealBasketCountMap = useMemo(() => {
    return cartItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.mealId] = (acc[item.mealId] || 0) + item.quantity;
      return acc;
    }, {});
  }, [cartItems]);

  const dealBasketCountMap = useMemo(() => {
    return cartItems.reduce<Record<string, number>>((acc, item) => {
      const dealId = (item as any).dealId;
      if (dealId) acc[dealId] = (acc[dealId] || 0) + item.quantity;
      return acc;
    }, {});
  }, [cartItems]);

  const loadDrafts = useCallback(async () => {
    if (variant !== "dine_in") {
      setDrafts([]);
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(DINE_IN_DRAFT_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as PosDraftTicket[]) : [];
      setDrafts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDrafts([]);
    }
  }, [variant]);

  const persistDrafts = useCallback(async (next: PosDraftTicket[]) => {
    try {
      await AsyncStorage.setItem(DINE_IN_DRAFT_STORAGE_KEY, JSON.stringify(next));
      setDrafts(next);
    } catch {
      // ignore
    }
  }, []);

  const loadOpenTabs = useCallback(async () => {
    if (variant !== "counter") return;
    try {
      const raw = await AsyncStorage.getItem(COUNTER_TABS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as PosOpenTab[]) : [];
      setOpenTabs(Array.isArray(parsed) ? parsed : []);
    } catch {
      setOpenTabs([]);
    }
  }, [variant]);

  const persistOpenTabs = useCallback(async (next: PosOpenTab[]) => {
    try {
      await AsyncStorage.setItem(COUNTER_TABS_STORAGE_KEY, JSON.stringify(next));
      setOpenTabs(next);
    } catch {
      // ignore
    }
  }, []);

  const saveCurrentCartToTab = useCallback(
    (tabs: PosOpenTab[], tabId: string | null, currentCartItems: PosCartItem[], currentDiscountType: typeof discountType, currentDiscountValue: string): PosOpenTab[] => {
      if (!tabId) return tabs;
      return tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, cartItems: currentCartItems, discountType: currentDiscountType, discountValue: currentDiscountValue }
          : tab
      );
    },
    []
  );

  const createOpenTab = useCallback(
    async (name: string, saveCurrentCart = true) => {
      if (!selectedBranchId) return;
      const latestCartItems = cartItemsRef.current;
      const latestDiscountType = discountTypeRef.current;
      const latestDiscountValue = discountValueRef.current;
      const latestActiveTabId = activeTabIdRef.current;
      const trimmedName = name.trim() || `Tab ${openTabs.length + 1}`;

      if (saveCurrentCart) {
        // "Open Tab" / "New Tab from meal builder": current cart goes INTO the new tab
        const newTab: PosOpenTab = {
          id: `tab-${Date.now()}`,
          name: trimmedName,
          branchId: selectedBranchId,
          createdAt: new Date().toISOString(),
          cartItems: latestCartItems,
          discountType: latestDiscountType,
          discountValue: latestDiscountValue,
        };
        // Also flush back into any previously active tab
        const updatedTabs = saveCurrentCartToTab(openTabs, latestActiveTabId, latestCartItems, latestDiscountType, latestDiscountValue);
        const next = [...updatedTabs, newTab];
        await persistOpenTabs(next);
        activeTabIdRef.current = newTab.id;
        setActiveTabId(newTab.id);
        // Cart stays as-is — it now belongs to the new tab
      } else {
        // "+" button: flush current cart back into the active tab, new tab starts empty
        const newTab: PosOpenTab = {
          id: `tab-${Date.now()}`,
          name: trimmedName,
          branchId: selectedBranchId,
          createdAt: new Date().toISOString(),
          cartItems: [],
          discountType: null,
          discountValue: "",
        };
        const updatedTabs = saveCurrentCartToTab(openTabs, latestActiveTabId, latestCartItems, latestDiscountType, latestDiscountValue);
        const next = [...updatedTabs, newTab];
        await persistOpenTabs(next);
        activeTabIdRef.current = newTab.id;
        setActiveTabId(newTab.id);
        setCartItems([]);
        setDiscountType(null);
        setDiscountValue("");
      }
    },
    [openTabs, persistOpenTabs, saveCurrentCartToTab, selectedBranchId]
  );

  const switchToTab = useCallback(
    async (tabId: string) => {
      if (tabId === activeTabIdRef.current) {
        // Tapping the active tab again deselects it: save its cart and go to a blank state
        const updatedTabs = saveCurrentCartToTab(openTabs, activeTabIdRef.current, cartItemsRef.current, discountTypeRef.current, discountValueRef.current);
        await persistOpenTabs(updatedTabs);
        activeTabIdRef.current = null;
        setActiveTabId(null);
        setCartItems([]);
        setDiscountType(null);
        setDiscountValue("");
        return;
      }
      const updatedTabs = saveCurrentCartToTab(openTabs, activeTabIdRef.current, cartItemsRef.current, discountTypeRef.current, discountValueRef.current);
      await persistOpenTabs(updatedTabs);
      const target = updatedTabs.find((t) => t.id === tabId);
      if (!target) return;
      activeTabIdRef.current = tabId;
      setActiveTabId(tabId);
      setCartItems(target.cartItems);
      setDiscountType(target.discountType);
      setDiscountValue(target.discountValue);
      // Stay on whichever view (catalog or cart) the user is already on
    },
    [openTabs, persistOpenTabs, saveCurrentCartToTab]
  );

  const deleteOpenTab = useCallback(
    async (tabId: string) => {
      const next = openTabs.filter((t) => t.id !== tabId);
      await persistOpenTabs(next);
      if (tabId === activeTabId) {
        if (next.length > 0) {
          const first = next[0];
          setActiveTabId(first.id);
          setCartItems(first.cartItems);
          setDiscountType(first.discountType);
          setDiscountValue(first.discountValue);
        } else {
          setActiveTabId(null);
          setCartItems([]);
          setDiscountType(null);
          setDiscountValue("");
        }
      }
    },
    [activeTabId, openTabs, persistOpenTabs]
  );

  const loadBranches = useCallback(async () => {
    const token = (await getToken()) || undefined;
    if (!token) return;

    if (selectedOrganizationId) {
      try {
        const org = await branchService.getOrganizationById(selectedOrganizationId, token);
        setCurrentOrganization(org);
      } catch {
        setCurrentOrganization(null);
      }
    }

    // Check if offline first
    const netInfo = await NetInfo.fetch();
    const isOffline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);

    let nextBranches: Branch[] = [];

    if (isOffline) {
      // Load from local cache when offline
      try {
        const localDb = LocalDbService.getInstance();
        const cachedBranches = await localDb.getCachedBranches(selectedOrganizationId || undefined);
        nextBranches = cachedBranches as Branch[];
      } catch (err) {
        console.error("[PosSellingExperience] Failed to load cached branches:", err);
      }
    } else {
      // Load from API when online
      nextBranches = await branchService.getBranches(token, {
        organizationId: selectedOrganizationId || undefined,
      });
    }

    if (isBranchScoped && assignedBranchIds.length > 0) {
      nextBranches = nextBranches.filter((branch) => assignedBranchIds.includes(branch.id));
    }
    setBranches(nextBranches);

    // Auto-select logic based on branch count
    if (nextBranches.length === 1) {
      // Single branch - auto-select it
      setSelectedBranch(nextBranches[0].id, nextBranches[0].name || null);
      setRequireBranchSelection(false);
    } else if (nextBranches.length > 1) {
      // Multiple branches - require selection
      setRequireBranchSelection(true);
    } else {
      // No branches
      setRequireBranchSelection(false);
    }
  }, [assignedBranchIds, getToken, isBranchScoped, selectedOrganizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      const token = (await getToken()) || undefined;
      const localDb = LocalDbService.getInstance();

      // Stage 1: Try SQLite cache first (instant display)
      let hasCachedData = false;
      try {
        const cachedCats = await localDb.getCategories(selectedBranchId);
        const cachedMeals = await localDb.getMeals(selectedBranchId);

        if (cachedCats.length > 0 || cachedMeals.length > 0) {
          // Filter categories by branch availability
          const filteredCats = cachedCats.filter((c) => {
            if (!c.excludedBranches || c.excludedBranches.length === 0) return true;
            return !c.excludedBranches.includes(selectedBranchId);
          });

          // Filter meals by branch availability
          const filteredMeals = cachedMeals.filter((m) => {
            if (!m.excludedBranches || m.excludedBranches.length === 0) return true;
            return !m.excludedBranches.includes(selectedBranchId);
          });

          setCategories(transformCachedCategories(filteredCats));
          setMeals(transformCachedMeals(filteredMeals));
          setDeals([]); // Deals not cached yet
          hasCachedData = true;
          setCatalogLoading(false);
        }
      } catch (cacheErr) {
        console.warn("[PosSellingExperience] Cache load failed:", cacheErr);
      }

      // Stage 2: Always fetch from API in background (if online)
      const netInfo = await NetInfo.fetch();
      const isOnline = netInfo.isConnected && netInfo.isInternetReachable !== false;

      if (isOnline && token && selectedBranchId) {
        try {
          const categoryResult = await categoryService.getCategories(1, 200, "", "listOrder", "asc", token, "ACTIVE");
          const [mealResult, dealResult] = await Promise.all([
            mealService.getMeals(1, 300, "", "listOrder", "asc", "", "ACTIVE", token, undefined, selectedBranchId),
            dealService.getDeals(1, 300, "", "listOrder", "asc", "", token, { status: "ACTIVE", branchId: selectedBranchId || undefined }),
          ]);

          const nextCategories = Array.isArray(categoryResult?.categories) ? categoryResult.categories : [];
          const nextMeals = Array.isArray(mealResult?.meals) ? mealResult.meals : [];
          const nextDeals = Array.isArray(dealResult?.deals) ? dealResult.deals : [];

          // Compare and update only if changed (use refs to avoid dependency loop)
          const currentCategories = categoriesRef.current;
          const currentMeals = mealsRef.current;

          const categoriesChanged = !areCategoriesEqual(currentCategories, nextCategories);
          const mealsChanged = !areMealsEqual(currentMeals, nextMeals);

          if (categoriesChanged) {
            setCategories(nextCategories);
            await localDb.cacheCategories(selectedBranchId, transformCategoriesToCache(nextCategories));
          }

          if (mealsChanged) {
            setMeals(nextMeals);
            await localDb.cacheMeals(selectedBranchId, transformMealsToCache(nextMeals));
          }

          setDeals(nextDeals); // Always update deals (not cached yet)

          if (selectedCategoryId && !nextCategories.some((category) => category.id === selectedCategoryId)) {
            setSelectedCategoryId("");
          }

        } catch (apiErr) {
          console.error("[PosSellingExperience] Background API fetch failed:", apiErr);
          if (!hasCachedData) {
            showToast("Failed to load catalog. Please check your connection.", "error");
          }
        }
      } else if (!hasCachedData) {
        showToast("Offline mode: No cached menu found. Please connect to the internet.", "error");
      }
    } catch (err) {
      console.error("[PosSellingExperience] Catalog load failed:", err);
      setCatalogLoading(false);
    }
  }, [getToken, selectedBranchId]);

  const refreshCatalogInBackground = useCallback(async () => {
    try {
      const token = (await getToken()) || undefined;
      const netInfo = await NetInfo.fetch();
      const isOnline = netInfo.isConnected && netInfo.isInternetReachable !== false;

      if (!isOnline || !token || !selectedBranchId) {
        return;
      }

      const localDb = LocalDbService.getInstance();

      try {
        const categoryResult = await categoryService.getCategories(1, 200, "", "listOrder", "asc", token, "ACTIVE");
        const [mealResult, dealResult] = await Promise.all([
          mealService.getMeals(1, 300, "", "listOrder", "asc", "", "ACTIVE", token, undefined, selectedBranchId),
          dealService.getDeals(1, 300, "", "listOrder", "asc", "", token, { status: "ACTIVE", branchId: selectedBranchId || undefined }),
        ]);

        const nextCategories = Array.isArray(categoryResult?.categories) ? categoryResult.categories : [];
        const nextMeals = Array.isArray(mealResult?.meals) ? mealResult.meals : [];
        const nextDeals = Array.isArray(dealResult?.deals) ? dealResult.deals : [];

        // Use refs to avoid dependency loop
        const currentCategories = categoriesRef.current;
        const currentMeals = mealsRef.current;

        const categoriesChanged = !areCategoriesEqual(currentCategories, nextCategories);
        const mealsChanged = !areMealsEqual(currentMeals, nextMeals);

        if (categoriesChanged) {
          setCategories(nextCategories);
          await localDb.cacheCategories(selectedBranchId, transformCategoriesToCache(nextCategories));
        }

        if (mealsChanged) {
          setMeals(nextMeals);
          await localDb.cacheMeals(selectedBranchId, transformMealsToCache(nextMeals));
        }

        setDeals(nextDeals);
      } catch (apiErr) {
        console.error("[PosSellingExperience] Background refresh failed:", apiErr);
      }
    } catch (err) {
      console.error("[PosSellingExperience] Background refresh error:", err);
    }
  }, [getToken, selectedBranchId]);

  const loadSettings = useCallback(async () => {
    try {
      const netInfo = await NetInfo.fetch();
      const isOnline = netInfo.isConnected && netInfo.isInternetReachable !== false;
      const token = (await getToken()) || undefined;

      if (isOnline && token) {
        const raw = await ApiService.getInstance().getSettings(token, selectedBranchId || undefined);
        const settingsData = (raw as any)?.data ?? raw;
        setSettings(settingsData);

        // Load organization settings to check Fiskaly status
        if (selectedOrganizationId) {
          try {
            const branchService = (await import("../../src/services/branchService")).default;
            const orgSettings = await branchService.getOrganizationSettings(selectedOrganizationId, token);
            setOrganizationSettings(orgSettings);
          } catch (orgSettingsErr) {
            console.error("[PosSellingExperience] Failed to load organization settings:", orgSettingsErr);
          }
        }

        // Update local settings cache
        try {
          const localDb = LocalDbService.getInstance();
          await localDb.cacheSettings(selectedBranchId || "global", settingsData);
        } catch (sqliteErr) {
          console.error("[PosSellingExperience] Failed to update SQLite settings cache:", sqliteErr);
        }
      } else {
        throw new Error("Device is offline");
      }
    } catch {
      // Offline fallback: load from local SQLite cache
      try {
        const localDb = LocalDbService.getInstance();
        const cached = await localDb.getCachedSettings(selectedBranchId || "global");
        if (cached) {
          setSettings(cached);
        } else {
          setSettings(null);
        }
      } catch (err) {
        console.error("[PosSellingExperience] Failed to load cached settings:", err);
        setSettings(null);
      }
    }
  }, [getToken, selectedBranchId]);

  // Persist cart to AsyncStorage (debounced, per branch)
  const persistCart = useCallback(
    (items: PosCartItem[], discount: typeof discountType, discountVal: string, branchId: string) => {
      if (!branchId) return;
      if (cartDebounceRef.current) clearTimeout(cartDebounceRef.current);
      cartDebounceRef.current = setTimeout(async () => {
        try {
          const key = getCartStorageKey(branchId, variant);
          if (items.length === 0 && !discount) {
            await AsyncStorage.removeItem(key);
          } else {
            await AsyncStorage.setItem(
              key,
              JSON.stringify({ cartItems: items, discountType: discount, discountValue: discountVal, savedAt: Date.now() })
            );
          }
        } catch {
          // ignore
        }
      }, 250);
    },
    [variant]
  );

  // Load cart from AsyncStorage when branch is first selected
  const loadCartForBranch = useCallback(async (branchId: string) => {
    if (!branchId) return;
    try {
      const key = getCartStorageKey(branchId, variant);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { cartItems?: PosCartItem[]; discountType?: typeof discountType; discountValue?: string; savedAt?: number };
      if (parsed.savedAt && Date.now() - parsed.savedAt > CART_MAX_AGE_MS) {
        await AsyncStorage.removeItem(key);
        return;
      }
      if (Array.isArray(parsed.cartItems) && parsed.cartItems.length > 0) {
        setCartItems(parsed.cartItems);
        setDiscountType(parsed.discountType ?? null);
        setDiscountValue(parsed.discountValue ?? "");
      }
    } catch {
      // ignore
    }
  }, [variant]);

  // Clear persisted cart for a branch
  const clearPersistedCart = useCallback(async (branchId: string) => {
    if (!branchId) return;
    try {
      await AsyncStorage.removeItem(getCartStorageKey(branchId, variant));
    } catch {
      // ignore
    }
  }, [variant]);

  // Effect: Reset state when organization changes
  useEffect(() => {
    setBranches([]);
    setCategories([]);
    setMeals([]);
    setTables([]);
    setCartItems([]);
    setSelectedTableId("");
    setSelectedZoneId(null);
    setSettings(null);
    setRequireBranchSelection(false);
  }, [selectedOrganizationId]);

  // When branch changes: load persisted cart for new branch
  useEffect(() => {
    const prev = prevBranchIdRef.current;
    if (prev === selectedBranchId) return;
    prevBranchIdRef.current = selectedBranchId;
    setSelectedTableId("");
    setSelectedZoneId(null);
    if (variant !== "dine_in") {
      setShowTableModal(false);
    }
    if (selectedBranchId) {
      if (variant === "counter") {
        // Load the first tab for this branch into the active cart (if no tab is currently active)
        // But keep ALL tabs in state - don't filter or overwrite storage
        const branchTabs = openTabs.filter((tab) => tab.branchId === selectedBranchId);
        if (branchTabs.length > 0 && !activeTabId) {
          const firstTab = branchTabs[0];
          setActiveTabId(firstTab.id);
          setCartItems(firstTab.cartItems);
          setDiscountType(firstTab.discountType);
          setDiscountValue(firstTab.discountValue);
        } else if (branchTabs.length === 0 && !activeTabId) {
          // No tabs for this branch and no active tab - start fresh
          setActiveTabId(null);
          setCartItems([]);
          setDiscountType(null);
          setDiscountValue("");
        }
        // Note: we intentionally don't filter openTabs here - show all tabs from all branches
        // and don't call persistOpenTabs here - that would overwrite other branches' tabs
      } else {
        setCartItems([]);
        setDiscountType(null);
        setDiscountValue("");
        void loadCartForBranch(selectedBranchId);
      }
    }
  }, [selectedBranchId, variant, loadCartForBranch, openTabs, activeTabId, persistOpenTabs]);

  useEffect(() => {
    if (showTableModal) {
      setSelectedZoneId(null);
      setZoneFloorPlan(null);
    }
  }, [showTableModal]);

  useEffect(() => {
    const loadZoneFloorPlan = async () => {
      if (!selectedZoneId) {
        setZoneFloorPlan(null);
        return;
      }

      try {
        setLoadingFloorPlan(true);
        const token = (await getToken()) || undefined;
        if (!token) return;

        const floorPlan = await reservationsApi.getZoneFloorPlan(selectedZoneId, token);

        setZoneFloorPlan(floorPlan);
      } catch (error) {
        console.error("Failed to load floor plan:", error);
        setZoneFloorPlan(null);
      } finally {
        setLoadingFloorPlan(false);
      }
    };

    void loadZoneFloorPlan();
  }, [selectedZoneId, getToken]);



  useEffect(() => {
    if (activeView === "cart" && cartItems.length === 0 && !(variant === "counter" && activeTabId)) {
      setActiveView("catalog");
    }
  }, [activeView, cartItems.length, variant, activeTabId]);

  // Persist cart to AsyncStorage whenever it changes (skip for counter when a tab is active — tabs manage their own storage)
  useEffect(() => {
    if (selectedBranchId && !(variant === "counter" && activeTabId)) {
      persistCart(cartItems, discountType, discountValue, selectedBranchId);
    }
  }, [cartItems, discountType, discountValue, selectedBranchId, persistCart, variant, activeTabId]);

  // Keep refs in sync with state so async callbacks always read latest values
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { cartItemsRef.current = cartItems; }, [cartItems]);
  useEffect(() => { discountTypeRef.current = discountType; }, [discountType]);
  useEffect(() => { discountValueRef.current = discountValue; }, [discountValue]);

  const loadTables = useCallback(async () => {
    const token = (await getToken()) || undefined;
    if (!token || !selectedBranchId) return;
    const response = await reservationsApi.getTables(1, 100, "tableNumber", "asc", undefined, undefined, undefined, "true", selectedBranchId, undefined, token);
    const nextTables = Array.isArray((response as any)?.data) ? ((response as any).data as Table[]) : [];
    setTables(nextTables.filter((table) => table.isActive));
  }, [getToken, selectedBranchId]);

  // Effect: Load initial data when permissions are ready or organization changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Skip if permissions are loading
      if (permissionsLoading) {
        return;
      }
      // Skip if user doesn't have access
      if (!canAccessPos) {
        setLoading(false);
        return;
      }
      // Skip if we've already loaded data for this organization (prevent redundant loads)
      if (lastLoadedOrgIdRef.current === selectedOrganizationId && hasLoadedInitialDataRef.current) {
        return;
      }
      try {
        // Only show loading spinner on initial load, not on subsequent refreshes
        if (isInitialLoadRef.current) {
          setLoading(true);
        }
        if (variant === "dine_in") {
          await migrateLegacyDineInDraftsOnce();
        }
        await loadDrafts();
        await loadOpenTabs();
        await loadBranches();
        // Track that we've loaded data for this organization
        lastLoadedOrgIdRef.current = selectedOrganizationId;
      } finally {
        if (!cancelled) {
          hasLoadedInitialDataRef.current = true;
          isInitialLoadRef.current = false;
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [canAccessPos, permissionsLoading, variant, selectedOrganizationId]);

  useEffect(() => {
    if (!selectedBranchId) return;
    // Skip if we've already loaded for this branch (prevent redundant loads)
    if (lastLoadedBranchIdRef.current === selectedBranchId) {
      return;
    }
    void loadCatalog();
    void loadSettings();
    if (variant === "dine_in") {
      void loadTables();
    }
    lastLoadedBranchIdRef.current = selectedBranchId;
  }, [selectedBranchId, variant]);

  useEffect(() => {
    if (variant !== "dine_in" || !initialTableId?.trim() || tables.length === 0) return;
    const match = tables.find((table) => table.id === initialTableId.trim());
    if (match) setSelectedTableId(match.id);
  }, [variant, initialTableId, tables]);

  useEffect(() => {
    setMealsLimit(50);
    setIsLoadingMore(false);
  }, [selectedCategoryId]);

  // Background refresh on category change with debounce
  useEffect(() => {
    if (!selectedBranchId) return;

    const debounceTimer = setTimeout(() => {
      void refreshCatalogInBackground();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [selectedCategoryId, refreshCatalogInBackground]);

  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 200;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && !isLoadingMore && filteredMeals.length > mealsLimit) {
      setIsLoadingMore(true);
      setMealsLimit(prev => {
        const newLimit = prev + 50;
        setIsLoadingMore(false);
        return newLimit;
      });
    }
  }, [isLoadingMore, filteredMeals.length, mealsLimit]);

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setToast({ visible: true, message, type });
  };

  const clearCurrentCart = useCallback(() => {
    setCartItems([]);
    setSelectedTableId("");
    setShowMealCustomizationModal(false);
    setMealCustomization(null);
    setShowTicketModal(false);
    setDiscountType(null);
    setDiscountValue("");
    setDiscountCents(0);
    if (variant === "counter" && activeTabId) {
      setOpenTabs((prev) => {
        const next = prev.map((tab) =>
          tab.id === activeTabId ? { ...tab, cartItems: [], discountType: null, discountValue: "" } : tab
        );
        void persistOpenTabs(next);
        return next;
      });
    } else {
      void clearPersistedCart(selectedBranchId);
    }
  }, [selectedBranchId, clearPersistedCart, variant, activeTabId, persistOpenTabs]);

  const closeTicketModal = useCallback(() => {
    setShowTicketModal(false);
    setDiscountType(null);
    setDiscountValue("");
    setDiscountCents(0);
  }, []);

  const closeMealCustomizationModal = useCallback(() => {
    setShowMealCustomizationModal(false);
    setMealCustomization(null);
  }, []);

  // Validation status computation
  const validationStatus = useMemo(() => {
    return getOrganizationValidationStatus(currentOrganization);
  }, [currentOrganization]);

  const handleBranchChange = useCallback(
    (branchId: string, branchName?: string | null) => {
      const isSameBranch = branchId === selectedBranchId;
      setSelectedBranch(branchId, branchName);
      setShowBranchSheet(false);
      if (isSameBranch) return;
      if (activeView === "cart") {
        setActiveView("catalog");
      }
    },
    [activeView, selectedBranchId, setSelectedBranch]
  );

  const updateCustomizationMealQuantity = (delta: number) => {
    setMealCustomization((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        quantity: Math.max(1, Number(prev.quantity || 1) + delta),
      };
    });
  };

  const addMealToCart = (meal: Meal, customization?: MealCustomizationState) => {
    if (!isMealVisibleInBranch(meal, selectedBranchId || null)) {
      showToast("This meal is not available in the selected branch.", "error");
      return false;
    }
    const branchAvailability = getMealAvailabilityNow({ meal, branchId: selectedBranchId || null, tz: effectiveTimezone });
    if (!branchAvailability.isAvailableNow) {
      const nextAvailableText = branchAvailability.nextAvailableAt
        ? formatInTimeZone(branchAvailability.nextAvailableAt, effectiveTimezone, "EEE HH:mm")
        : null;
      showToast(
        nextAvailableText ? `This meal is not available right now. Next available: ${nextAvailableText}.` : "This meal is not available right now.",
        "error"
      );
      return false;
    }
    const basePrice = getEffectiveMealBasePrice(meal);
    const firstSize = meal.mealSizes?.[0];
    const visibleMealAddOns = getVisibleMealAddOns(meal, selectedBranchId || null);
    const visibleMealAddOnIds = new Set(visibleMealAddOns.map((entry) => entry.addOn.id));
    const resolvedCustomization = customization || {
      meal,
      quantity: 1,
      sizeName: firstSize?.name,
      mealSizeType: firstSize?.sizeType || "M",
      mealSizePrice: firstSize ? Number(firstSize.price || 0) : 0,
      addOns: [],
      optionalIngredients: (meal.mealOptionalIngredients || []).map((entry) => ({
        id: entry.optionalIngredient.id,
        name: entry.optionalIngredient.name,
        isIncluded: true,
      })),
    };
    const resolvedAddons = (resolvedCustomization.addOns || []).filter(
      (addon) => Number(addon.quantity || 0) > 0 && visibleMealAddOnIds.has(addon.id)
    );
    const resolvedOptionalIngredients = (resolvedCustomization.optionalIngredients || []).map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      isIncluded: ingredient.isIncluded !== false,
    }));
    const addonTotal = resolvedAddons.reduce(
      (sum, addon) => sum + Number(addon.price || 0) * Number(addon.quantity || 0),
      0
    );
    const finalPrice = Math.round((basePrice + Number(resolvedCustomization.mealSizePrice || 0) + addonTotal) * 100) / 100;
    setCartItems((prev) => {
      if (resolvedCustomization.cartItemId) {
        return prev.map((item) =>
          item.id === resolvedCustomization.cartItemId
            ? {
                ...item,
                name: meal.name,
                quantity: resolvedCustomization.quantity,
                price: finalPrice,
                size: resolvedCustomization.sizeName,
                mealSizeType: resolvedCustomization.mealSizeType,
                mealSizePrice: resolvedCustomization.mealSizePrice,
                addOns: resolvedAddons,
                optionalIngredients: resolvedOptionalIngredients,
              }
            : item
        );
      }
      const existing = prev.find(
        (item) =>
          item.mealId === meal.id &&
          item.size === resolvedCustomization.sizeName &&
          JSON.stringify(item.addOns || []) === JSON.stringify(resolvedAddons) &&
          JSON.stringify(item.optionalIngredients || []) === JSON.stringify(resolvedOptionalIngredients)
      );
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + Number(resolvedCustomization.quantity || 1) } : item
        );
      }
      return [
        ...prev,
        {
          id: `${meal.id}-${Date.now()}`,
          mealId: meal.id,
          name: meal.name,
          quantity: Number(resolvedCustomization.quantity || 1),
          price: finalPrice,
          size: resolvedCustomization.sizeName,
          mealSizeType: resolvedCustomization.mealSizeType,
          mealSizePrice: resolvedCustomization.mealSizePrice,
          addOns: resolvedAddons,
          optionalIngredients: resolvedOptionalIngredients,
        },
      ];
    });
    setSearchTerm("");
    return true;
  };

  const addDealToCart = (deal: Deal, quantity: number = 1, cartItemId?: string) => {
    const dealPrice = getDealDisplayPrice(deal);
    setCartItems((prev) => {
      if (cartItemId) {
        return prev.map((item) =>
          item.id === cartItemId ? { ...item, quantity } : item
        );
      }
      const existing = prev.find((item) => (item as any).dealId === deal.id);
      if (existing) {
        return prev.map((item) =>
          (item as any).dealId === deal.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prev,
        {
          id: `deal-${deal.id}-${Date.now()}`,
          mealId: "",
          dealId: deal.id,
          itemType: "DEAL",
          name: deal.name,
          quantity,
          price: dealPrice,
        } as PosCartItem & { dealId: string; itemType: string },
      ];
    });
    setSearchTerm("");
  };

  const openDealBuilder = (deal: Deal) => {
    setDealCustomization({ deal, quantity: 1 });
    setShowDealBuilderModal(true);
  };

  const editDealCartItem = (itemId: string) => {
    const cartItem = cartItems.find((entry) => entry.id === itemId);
    if (!cartItem) return;
    const deal = deals.find((d) => d.id === (cartItem as any).dealId);
    if (!deal) return;
    setDealCustomization({ deal, quantity: cartItem.quantity, cartItemId: cartItem.id });
    setShowDealBuilderModal(true);
  };

  const updateDealBuilderQuantity = (delta: number) => {
    setDealCustomization((prev) => {
      if (!prev) return prev;
      return { ...prev, quantity: Math.max(1, prev.quantity + delta) };
    });
  };

  const applyDealCustomization = () => {
    if (!dealCustomization) return;
    addDealToCart(dealCustomization.deal, dealCustomization.quantity, dealCustomization.cartItemId);
    setShowDealBuilderModal(false);
    setDealCustomization(null);
  };

  const openMealCustomization = (meal: Meal) => {
    if (!isMealVisibleInBranch(meal, selectedBranchId || null)) {
      showToast("This meal is not available in the selected branch.", "error");
      return;
    }
    const firstSize = meal.mealSizes?.[0];
    setMealCustomization({
      meal,
      quantity: 1,
      sizeName: firstSize?.name,
      mealSizeType: firstSize?.sizeType || "M",
      mealSizePrice: firstSize ? Number(firstSize.price || 0) : 0,
      addOns: buildCustomizationAddOns(meal, selectedBranchId || null, firstSize?.sizeType || "M"),
      optionalIngredients: (meal.mealOptionalIngredients || []).map((entry) => ({
        id: entry.optionalIngredient.id,
        name: entry.optionalIngredient.name,
        isIncluded: true,
      })),
    });
    setShowMealCustomizationModal(true);
  };

  const editCartItem = (itemId: string) => {
    const cartItem = cartItems.find((entry) => entry.id === itemId);
    if (!cartItem) return;
    const meal = meals.find((entry) => entry.id === cartItem.mealId);
    if (!meal || !isMealVisibleInBranch(meal, selectedBranchId || null)) {
      showToast("This meal is not available in the selected branch.", "error");
      return;
    }

    setMealCustomization({
      meal,
      cartItemId: cartItem.id,
      quantity: cartItem.quantity,
      sizeName: cartItem.size,
      mealSizeType: cartItem.mealSizeType || meal.mealSizes?.[0]?.sizeType || "M",
      mealSizePrice: Number(cartItem.mealSizePrice || 0),
      addOns: buildCustomizationAddOns(
        meal,
        selectedBranchId || null,
        cartItem.mealSizeType || meal.mealSizes?.[0]?.sizeType || "M",
        cartItem.addOns || []
      ),
      optionalIngredients: cartItem.optionalIngredients || [],
    });
    setShowMealCustomizationModal(true);
  };

  const updateCustomizationAddOnQuantity = (addonId: string, delta: number) => {
    setMealCustomization((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        addOns: (prev.addOns || []).map((addon) =>
          addon.id === addonId
            ? { ...addon, quantity: Math.max(0, Number(addon.quantity || 0) + delta) }
            : addon
        ),
      };
    });
  };

  const toggleCustomizationBooleanAddOn = (addonId: string) => {
    setMealCustomization((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        addOns: (prev.addOns || []).map((addon) =>
          addon.id === addonId
            ? { ...addon, quantity: Number(addon.quantity || 0) > 0 ? 0 : 1 }
            : addon
        ),
      };
    });
  };

  const updateCustomizationMealSize = (selectedSize: Meal["mealSizes"][number]) => {
    setMealCustomization((prev) => {
      if (!prev) return prev;
      const nextSizeType = selectedSize?.sizeType || prev.mealSizeType || "M";
      const visibleMealAddOns = getVisibleMealAddOns(prev.meal, selectedBranchId || null);
      const visibleMealAddOnIds = new Set(visibleMealAddOns.map((entry) => entry.addOn.id));

      return {
        ...prev,
        sizeName: selectedSize?.name || prev.sizeName,
        mealSizeType: nextSizeType,
        mealSizePrice: selectedSize ? Number(selectedSize.price || 0) : prev.mealSizePrice,
        addOns: (prev.addOns || [])
          .filter((addon) => visibleMealAddOnIds.has(addon.id))
          .map((addon) => {
          const sourceAddon = visibleMealAddOns.find((entry) => entry.addOn.id === addon.id)?.addOn;
          const { price, sizeType: matchedSizeType } = getAddonPriceAndSizeForMeal(sourceAddon, nextSizeType);
          return {
            ...addon,
            price,
            sizeType: matchedSizeType || nextSizeType,
          };
        }),
      };
    });
  };

  const toggleCustomizationOptionalIngredient = (ingredientId: string) => {
    setMealCustomization((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        optionalIngredients: (prev.optionalIngredients || []).map((ingredient) =>
          ingredient.id === ingredientId
            ? { ...ingredient, isIncluded: ingredient.isIncluded === false }
            : ingredient
        ),
      };
    });
  };

  const applyMealCustomization = () => {
    if (!mealCustomization) return;
    const applied = addMealToCart(mealCustomization.meal, mealCustomization);
    if (!applied) return;
    closeMealCustomizationModal();
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const saveCurrentDraft = async () => {
    if (!selectedBranchId || cartItems.length === 0) {
      showToast("Add items before saving a draft.", "info");
      return;
    }
    if (variant !== "dine_in") {
      showToast("Draft tickets are available for dine-in only.", "info");
      return;
    }
    if (!selectedTableId) {
      showToast(t("admin.posDineIn.selectTableBeforeSave"), "info");
      return;
    }
    const ticket: PosDraftTicket = {
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
      branchId: selectedBranchId,
      tableId: selectedTable?.id,
      tableNumber: selectedTable?.tableNumber,
      cartItems,
    };
    const next = [ticket, ...drafts.filter((draft) => draft.branchId !== ticket.branchId || draft.tableId !== ticket.tableId)];
    await persistDrafts(next);
    setCartItems([]);
    setSelectedTableId("");
    showToast("Dine-in ticket saved.", "success");
  };

  const loadDraft = (draft: PosDraftTicket) => {
    setSelectedBranch(draft.branchId);
    setSelectedTableId(draft.tableId || "");
    setCartItems(draft.cartItems);
    setShowDraftsModal(false);
  };

  const deleteDraft = async (draftId: string) => {
    const next = drafts.filter((draft) => draft.id !== draftId);
    await persistDrafts(next);
  };

  const goToTableSettlement = () => {
    const tableLabel = String(selectedTable?.tableNumber || "").trim();
    const search = encodeURIComponent(tableLabel ? `Table ${tableLabel}` : "");
    router.push(`/(admin)/orders?search=${search}&paymentStatus=PENDING` as any);
  };

  const openTicketModal = () => {
    if (!selectedBranchId || cartItems.length === 0) {
      showToast("Choose a branch and add items first.", "error");
      return;
    }
    if (variant === "dine_in" && !selectedTableId) {
      showToast("Select a table before opening ticket details.", "error");
      return;
    }
    setShowTicketModal(true);
  };

  const handleCheckout = async () => {
    if (!selectedBranchId || cartItems.length === 0) {
      showToast("Choose a branch and add items first.", "error");
      return;
    }
    if (serviceMode === "DINE_IN" && !selectedTableId) {
      showToast("Select a table for dine-in checkout.", "error");
      return;
    }
    if (posDeviceRequiredButMissing) {
      showToast(
        t("pos.posDeviceNotConnected"),
        "error"
      );
      return;
    }

    try {
      setSubmitting(true);

      // Check connectivity first before deciding whether to require an auth token or online features
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected && netState.isInternetReachable !== false;

      let token: string | undefined = undefined;
      if (isConnected) {
        token = (await getToken()) || undefined;
        if (!token) {
          showToast("Authentication required.", "error");
          return;
        }
      }

      // 1. Issue any sold vouchers FIRST and record their generated codes on the cart items (only when online)
      const nextCartItems = cartItems.map((item) => ({ ...item }));
      const voucherSaleItems = nextCartItems.filter((item) => (item as any).itemType === "VOUCHER");
      
      let showedReceiptPrintModal = false;
      if (isConnected && token && voucherSaleItems.length > 0) {
        for (const vItem of voucherSaleItems) {
          try {
            const voucherType = String(vItem.id).includes("MULTI") ? "MULTI_PURPOSE" : "SINGLE_PURPOSE";
            const issued = await voucherService.issueVoucher({
              voucherType,
              amount: vItem.price,
              vatRate: (vItem as any).vatRate,
              organizationId: selectedOrganizationId || "",
              branchId: selectedBranchId || "",
            }, token);

            // Store the details on the cart item as specialInstructions so they are saved to order_items.specialInstructions in database
            vItem.specialInstructions = `CODE: ${issued.voucherCode}\nTYPE: ${issued.voucherType}\nEXPIRES: ${new Date(issued.expiresAt).toLocaleDateString("de-DE")}\nVAT: ${issued.vatRate || ''}`;

            setLastCreatedVoucherCode(issued.voucherCode);
            setLastCreatedVoucherType(issued.voucherType);
            setLastCreatedVoucherAmount(Number(issued.initialAmount));
            setLastCreatedVoucherExpires(new Date(issued.expiresAt).toLocaleDateString("de-DE"));
            setLastCreatedVoucherVatRate(issued.vatRate);
            showedReceiptPrintModal = true;
          } catch (vErr: any) {
            console.error("[DSFinV-K][VOUCHER] Failed to issue sold voucher:", vErr);
            showToast("Failed to register sold voucher on backend.", "error");
          }
        }
      }

      const effectivePaymentStatus: PosPaymentStatus =
        variant === "dine_in" ? "PENDING" : paymentStatus;

      const orderPayload = {
        branchId: selectedBranchId,
        cartItems: nextCartItems,
        paymentMethod,
        paymentStatus: effectivePaymentStatus,
        serviceMode,
        tableId: selectedTable?.id,
        tableNumber: selectedTable?.tableNumber,
        ticketName: serviceMode === "DINE_IN" ? selectedTable?.tableNumber || undefined : undefined,
        sendToKitchen: true,
        discountType: discountType || null,
        discountValue: discountType ? (discountType === "FIXED" ? discountCents / 100 : (parseFloat(discountValue) || 0)) : null,
        appliedVoucher: appliedVoucher ? {
          voucherCode: appliedVoucher.voucherCode,
          amount: dynamicVoucherDeduction,
          type: appliedVoucher.type,
          remainingBalance: Math.max(0, appliedVoucher.voucherBalance - dynamicVoucherDeduction),
        } : null,
      };

      const processOfflineCheckout = async (payload: any, paymentStatus: PosPaymentStatus) => {
        const localId = generateUUID();
        const localDb = LocalDbService.getInstance();
        
        const payloadWithBreakdown = {
          ...payload,
          taxBreakdown,
          discountAmount,
        };

        const localSeq = await localDb.saveOfflineOrder({
          id: localId,
          branchId: selectedBranchId,
          amount: taxBreakdown.total - discountAmount,
          paymentMethod: paymentMethod,
          paymentStatus: paymentStatus,
          cartData: JSON.stringify(payloadWithBreakdown),
          createdAt: new Date().toISOString(),
        });

        // Mock a finalizedOrder object so the UI can proceed cleanly without crashing
        const mockOrder = {
          id: localId,
          orderNumber: `OFFLINE-${localSeq}-${localId.slice(-6).toUpperCase()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          totalAmount: taxBreakdown.total - discountAmount,
          currency: taxBreakdown.currency || resolvedCurrency || "EUR",
          deliveryFee: taxBreakdown.deliveryTaxAmount || 0,
          taxAmount: taxBreakdown.totalTaxAmount || 0,
          taxInclusive: taxBreakdown.taxInclusive || false,
          takeawayServiceFee: taxBreakdown.takeawayServiceFee || 0,
          takeawayServiceTaxAmount: taxBreakdown.takeawayServiceTaxAmount || 0,
          discountAmount: discountAmount || 0,
          paymentMethod: paymentMethod === "CARD" ? "CARD_ON_DELIVERY" : "CASH_ON_DELIVERY",
          paymentStatus: paymentStatus === "PAID" ? "PAID" : "PENDING",
          orderType: "PICKUP",
          status: paymentStatus === "PAID" ? "PICKED_UP" : "PENDING",
          orderItems: nextCartItems.map((item: any) => ({
            id: item.id,
            orderId: localId,
            mealId: item.mealId || item.id,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
            specialInstructions: item.specialInstructions,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            meal: {
              id: item.mealId || item.id,
              name: item.name,
              basePrice: item.price,
            },
            orderItemAddOns: (item.addOns || []).map((ao: any) => ({
              id: ao.id,
              addOnName: ao.name,
              addOnPrice: ao.price || 0,
              quantity: ao.quantity || 1,
            }))
          })),
        };

        return {
          order: mockOrder,
          sequenceNumber: localSeq,
        };
      };

      let finalizedOrder: any = null;
      let isOfflineOrderCreated = false;
      let offlineSeqNumCreated: number | undefined = undefined;

      if (isConnected) {
        try {
          const result = await posOrderService.createPosOrder(orderPayload, token);
          finalizedOrder =
            variant === "dine_in"
              ? result.order
              : await orderService.updateOrder(
                  result.order.id,
                  {
                    status: "PICKED_UP",
                    paymentStatus: "PAID",
                  },
                  token
                );
        } catch (apiError: any) {
          console.warn("[POS] Online checkout failed, falling back to local SQLite:", apiError);
          // Check if this is a validation / unavailable items error. If so, throw it immediately
          const isUnavailableError = apiError?.data?.unavailableItems && apiError.data.unavailableItems.length > 0;
          if (isUnavailableError) {
            throw apiError;
          }
          // Else, fall back to offline storage
          const fallback = await processOfflineCheckout(orderPayload, effectivePaymentStatus);
          finalizedOrder = fallback.order;
          isOfflineOrderCreated = true;
          offlineSeqNumCreated = fallback.sequenceNumber;
        }
      } else {
        const fallback = await processOfflineCheckout(orderPayload, effectivePaymentStatus);
        finalizedOrder = fallback.order;
        isOfflineOrderCreated = true;
        offlineSeqNumCreated = fallback.sequenceNumber;
      }

      // Voucher receipt modal disabled - no longer showing after checkout
      // if (showedReceiptPrintModal) {
      //   setShowReceiptPrintModal(true);
      // }

      // Note: Voucher redemption is handled by the backend during order creation
      // No need to redeem again here - that would cause double deduction
      if (appliedVoucher) {
        setAppliedVoucher(null);
      }

      if (serviceMode === "DINE_IN" && selectedTable?.id) {
        if (isConnected && token) {
          try {
            await reservationsApi.updateTable(selectedTable.id, { status: "OCCUPIED" }, token);
          } catch {
          }
        }
        const nextDrafts = drafts.filter((draft) => !(draft.branchId === selectedBranchId && draft.tableId === selectedTable.id));
        await persistDrafts(nextDrafts);
      }

      if (variant !== "dine_in") {
        setSelectedTableId("");
        if (activeTabId) {
          const remainingTabs = openTabs.filter((t) => t.id !== activeTabId);
          await persistOpenTabs(remainingTabs);
          if (remainingTabs.length > 0) {
            const nextTab = remainingTabs[0];
            setActiveTabId(nextTab.id);
            setCartItems(nextTab.cartItems);
            setDiscountType(nextTab.discountType);
            setDiscountValue(nextTab.discountValue);
          } else {
            setActiveTabId(null);
            setCartItems([]);
            setDiscountType(null);
            setDiscountValue("");
          }
        } else {
          setCartItems([]);
          void clearPersistedCart(selectedBranchId);
        }
      } else {
        setCartItems([]);
        void clearPersistedCart(selectedBranchId);
      }
      setPaymentStatus(variant === "dine_in" ? "PENDING" : "PAID");
      setPaymentMethod("CASH");
      closeTicketModal();
      closeMealCustomizationModal();
      setShowDealBuilderModal(false);
      setActiveView("catalog");
      if (variant === "dine_in") {
        const tableLabel = selectedTable?.tableNumber ? `Table ${selectedTable.tableNumber}` : "this table";
        showToast("Dine-in order sent. Table payment remains open.", "success");
        Alert.alert(
          "Order sent to kitchen",
          `${tableLabel} stays on an open tab. You can continue adding items now, and mark payment as paid later from Orders.`,
          [
            { text: "Continue ordering", style: "cancel" },
            {
              text: "Settle Table",
              onPress: () => goToTableSettlement(),
            },
          ]
        );
      } else {
        if (isOfflineOrderCreated) {
          showToast(`Offline checkout saved locally. Tx-Nr: ${offlineSeqNumCreated}`, "warning");
          router.push(`/(admin)/order-details?id=${finalizedOrder.id}` as any);
        } else {
          showToast("POS checkout completed successfully.", "success");
          router.push(`/(admin)/order-details?id=${finalizedOrder.id}` as any);
        }
      }
    } catch (error: any) {
      // Check for availability validation error from backend
      const unavailableItems = error?.data?.unavailableItems as Array<{ itemType: string; name: string; reason: string }> | undefined;
      if (unavailableItems && unavailableItems.length > 0) {
        const itemDetails = unavailableItems.map((item) => `• ${item.name}: ${item.reason}`).join("\n");
        Alert.alert(
          "Items Not Available",
          `The following items cannot be ordered:\n\n${itemDetails}\n\nPlease remove them from your cart or check their availability settings.`,
          [{ text: "OK", style: "default" }]
        );
      } else {
        showToast(error?.message || error?.error || "Failed to create POS order.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (!canAccessPos) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t("admin.pos.noPermission", { defaultValue: "You do not have permission to use POS." })}</Text>
      </View>
    );
  }

  // Validation error block - prevent POS usage for expired/unvalidated orgs
  if (validationStatus.status === 'expired' || validationStatus.status === 'unvalidated' || validationStatus.status === 'temporarily_invalid' || validationStatus.status === 'inactive') {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="alert-circle" size={64} color="#ef4444" />
        <Text style={[styles.emptyText, { marginTop: 16, textAlign: 'center' }]}>
          {validationStatus.status === 'expired'
            ? t("admin.pos.validationExpired", { defaultValue: "Organization validation has expired. POS is not available." })
            : validationStatus.status === 'unvalidated'
            ? t("admin.pos.validationRequired", { defaultValue: "Organization requires validation. POS is not available." })
            : validationStatus.status === 'temporarily_invalid'
            ? t("admin.pos.validationTemporarilyInvalid", { defaultValue: "Organization validation is temporarily inactive. POS is not available." })
            : t("admin.pos.organizationInactive", { defaultValue: "Organization is inactive. POS is not available." })}
        </Text>
      </View>
    );
  }

  const headerSection = (
    <>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>
            {variant === "dine_in"
              ? t("admin.posDineIn.title", { defaultValue: "Dine-in POS" })
              : t("admin.pos.title")}
          </Text>
          <Text style={styles.subtitle}>
            {variant === "dine_in"
              ? t("admin.posDineIn.subtitle", {
                  defaultValue: "Choose a table, add items, then complete checkout. Tickets are saved per table.",
                })
              : t("admin.pos.subtitle", {
                  defaultValue: "Browse the menu first, then complete ticket details in checkout.",
                })}
          </Text>
        </View>
        <View style={styles.topBarActions}>
          {canSwitchToManagement && isPosOnlyMode && (
            <TouchableOpacity
              style={styles.exitPosButton}
              onPress={async () => {
                await exitPosMode();
              }}
            >
              <MaterialCommunityIcons name="exit-to-app" size={18} color="#fff" />
              <Text style={styles.exitPosButtonText}>
                {t("admin.pos.exitPos", { defaultValue: "Exit POS" })}
              </Text>
            </TouchableOpacity>
          )}
          {variant === "dine_in" ? (
            <TouchableOpacity style={styles.ghostButton} onPress={() => setShowDraftsModal(true)}>
              <MaterialCommunityIcons name="folder-clock-outline" size={18} color="#fff" />
              <Text style={styles.ghostButtonText}>
                {t("admin.posDineIn.openTickets", { defaultValue: "Open Tickets" })}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.cartFab} onPress={() => setActiveView(activeView === "catalog" ? "cart" : "catalog")}>
            <MaterialCommunityIcons name={activeView === "catalog" ? "cart-outline" : "storefront-outline"} size={18} color="#111827" />
            <Text style={styles.cartFabText}>{activeView === "catalog" ? t("admin.pos.cartWithCount", { count: cartCount, defaultValue: `Cart (${cartCount})` }) : t("admin.pos.menu", { defaultValue: "Menu" })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pageSwitcher}>
        <TouchableOpacity
          style={[styles.pageSwitchButton, activeView === "catalog" && styles.pageSwitchButtonActive]}
          onPress={() => setActiveView("catalog")}
        >
          <Text style={[styles.pageSwitchText, activeView === "catalog" && styles.pageSwitchTextActive]}>{t("admin.pos.catalog", { defaultValue: "Catalog" })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pageSwitchButton, activeView === "cart" && styles.pageSwitchButtonActive]}
          onPress={() => setActiveView("cart")}
        >
          <Text style={[styles.pageSwitchText, activeView === "cart" && styles.pageSwitchTextActive]}>{t("admin.pos.cart", { defaultValue: "Cart" })}</Text>
        </TouchableOpacity>
      </View>

      {variant === "counter" && openTabs.length > 0 ? (
        <View style={styles.tabBarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarRow}>
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              // For the active tab, always use live cartItems so the badge reflects real-time additions
              const tabCartItems = isActive ? cartItems : tab.cartItems;
              const tabItemCount = tabCartItems.reduce((s, i) => s + i.quantity, 0);
              return (
                <View key={tab.id} style={[styles.tabChip, isActive && styles.tabChipActive]}>
                  <TouchableOpacity onPress={() => void switchToTab(tab.id)} style={styles.tabChipLabel}>
                    <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]} numberOfLines={1}>
                      {tab.name}
                    </Text>
                    {tabItemCount > 0 ? (
                      <View style={[styles.tabChipBadge, isActive && styles.tabChipBadgeActive]}>
                        <Text style={[styles.tabChipBadgeText, isActive && styles.tabChipBadgeTextActive]}>
                          {tabItemCount}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tabChipClose}
                    onPress={() => { setTabToClose({ id: tab.id, name: tab.name }); setShowCloseTabModal(true); }}
                  >
                    <MaterialCommunityIcons name="close" size={12} color={isActive ? "#111827" : "#9ca3af"} />
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.tabBarNewButton}
              onPress={() => { setNewTabName(""); setNewTabSavesCart(false); setShowNewTabModal(true); }}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#fb923c" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {catalogLoading && (
        <View style={styles.catalogLoadingOverlay}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.catalogLoadingText}>{t("admin.pos.loadingMenu", { defaultValue: "Loading menu..." })}</Text>
        </View>
      )}
      {activeView === "catalog" ? (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={400}>
            {headerSection}
          <View style={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroLabel}>{t("admin.branchManagement.branch", { defaultValue: "Branch" })}</Text>
                <TouchableOpacity style={styles.branchSelectButton} onPress={() => {
                  if (isOffline) {
                    setShowBranchOfflineDialog(true);
                    return;
                  }
                  setShowBranchSheet(true);
                }}>
                  <MaterialCommunityIcons name="office-building" size={18} color="#fb923c" />
                  <Text style={styles.branchSelectText} numberOfLines={1}>
                    {selectedBranch?.name || selectedBranch?.code || t("admin.pos.selectBranch", { defaultValue: "Select a branch" })}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {variant === "dine_in" ? (
                <View style={styles.tableHeroColumn}>
                  <Text style={styles.heroLabel}>{t("admin.posDineIn.tableLabel", { defaultValue: "Table" })}</Text>
                  <TouchableOpacity style={styles.tableHeroButton} onPress={() => setShowTableModal(true)}>
                    <MaterialCommunityIcons name="table-furniture" size={18} color="#fb923c" />
                    <Text style={styles.tableHeroButtonText} numberOfLines={1}>
                      {selectedTable
                        ? t("admin.posDineIn.tableSelected", {
                            defaultValue: "Table {{number}}",
                            number: selectedTable.tableNumber,
                          })
                        : t("admin.posDineIn.selectTable", { defaultValue: "Select table" })}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.searchInputContainer}>
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder={t("admin.pos.searchMeals", { defaultValue: "Search meals" })}
                placeholderTextColor="#737373"
                style={styles.searchInput}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchTerm("")}
                  style={styles.clearButton}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Branch Selection Required Placeholder */}
          {requireBranchSelection && !selectedBranchId ? (
            <View style={styles.selectBranchPlaceholder}>
              <MaterialCommunityIcons name="office-building-outline" size={64} color="#6b7280" />
              <Text style={styles.selectBranchTitle}>
                {t("admin.pos.selectBranchPrompt", { defaultValue: "Please select a branch to continue" })}
              </Text>
              <Text style={styles.selectBranchSubtitle}>
                {t("admin.pos.selectBranchDescription", { defaultValue: "Choose a branch from the selector above to view available meals and categories." })}
              </Text>
            </View>
          ) : null}

          <View style={[styles.sectionBlock, requireBranchSelection && !selectedBranchId ? styles.hiddenSection : undefined]}>
            <Text style={styles.sectionTitle}>{t("admin.pos.categories", { defaultValue: "Categories" })}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryCardRow}>
              {currentOrganization?.vouchersAllowed !== false && (
                <TouchableOpacity
                  style={[styles.categoryShowAllCard, { borderColor: "#ec4899", borderWidth: 2, marginRight: 8 }]}
                  onPress={() => {
                    if (!selectedBranchId) {
                      showToast("Please select a branch first.", "error");
                      return;
                    }
                    if (isOffline) {
                      setShowOfflineVoucherDialog(true);
                      return;
                    }
                    setShowSellVoucherModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="ticket-outline" size={24} color="#ec4899" />
                  <Text style={[styles.categoryShowAllText, { color: "#ec4899", fontWeight: "700" }]}>{t("admin.pos.voucherCategory", { defaultValue: "Voucher" })}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.categoryShowAllCard, !selectedCategoryId && styles.categoryShowAllCardActive]}
                onPress={() => setSelectedCategoryId("")}
              >
                <MaterialCommunityIcons name="view-grid-outline" size={24} color={!selectedCategoryId ? "#111827" : "#fb923c"} />
                <Text style={[styles.categoryShowAllText, !selectedCategoryId && styles.categoryShowAllTextActive]}>{t("admin.pos.allCategories", { defaultValue: "All" })}</Text>
              </TouchableOpacity>
              {categories.filter((category) => !isExcludedFromBranch(category.excludedBranches, selectedBranchId || null)).map((category) => {
                const imageUri = getOptimizedImageUrl((category as any).image, FALLBACK_CATEGORY_IMAGE);
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.categoryVisualCard, selectedCategoryId === category.id && styles.categoryVisualCardActive]}
                    onPress={() => setSelectedCategoryId((prev) => (prev === category.id ? "" : category.id))}
                  >
                    <Image source={{ uri: imageUri }} style={styles.categoryVisualImage} resizeMode="cover" />
                    <View style={styles.categoryVisualOverlay} />
                    <View style={styles.categoryVisualContent}>
                      <Text style={styles.categoryVisualTitle} numberOfLines={1}>{category.name}</Text>
                      <Text style={styles.categoryVisualMeta} numberOfLines={1}>
                        {(category as any)?._count?.meals ? `${(category as any)._count.meals} ${t("admin.pos.items", { defaultValue: "items" })}` : t("admin.pos.browse", { defaultValue: "Browse" })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={[styles.sectionBlock, requireBranchSelection && !selectedBranchId ? styles.hiddenSection : undefined]}>
            <View style={styles.mealsHeaderRow}>
              <Text style={styles.sectionTitle}>{t("admin.pos.meals", { defaultValue: "Meals" })}</Text>
              <Text style={styles.mealsCount}>{filteredMeals.length + filteredDeals.length} {t("admin.pos.shown", { defaultValue: "shown" })}</Text>
            </View>

            <View style={styles.mealGrid}>
              {filteredMeals.slice(0, mealsLimit).map((meal) => {
                const normalizedMealImage = String(meal.image || "").trim();
                const hasValidMealImageValue =
                  normalizedMealImage.length > 0 &&
                  normalizedMealImage.toLowerCase() !== "null" &&
                  normalizedMealImage.toLowerCase() !== "undefined";
                const shouldShowMealImage = hasValidMealImageValue && !failedMealImageIds[meal.id];
                const imageUri = shouldShowMealImage ? getOptimizedImageUrl(meal.image) : "";
                const basketCount = mealBasketCountMap[meal.id] || 0;
                const catalogMealPrice = getEffectiveMealBasePrice(meal);
                const mealAvailability = getMealAvailabilityNow({ meal, branchId: selectedBranchId || null, tz: effectiveTimezone });
                const isUnavailableNow = !mealAvailability.isAvailableNow;
                const nextAvailableText = mealAvailability.nextAvailableAt
                  ? formatInTimeZone(mealAvailability.nextAvailableAt, effectiveTimezone, "EEE HH:mm")
                  : null;
                return (
                  <TouchableOpacity key={meal.id} style={[styles.mealCard, isUnavailableNow && styles.mealCardUnavailable]} onPress={() => openMealCustomization(meal)}>
                    {shouldShowMealImage ? (
                      <Image
                        source={{ uri: imageUri }}
                        style={[styles.mealCardImage, isUnavailableNow && styles.mealCardImageUnavailable]}
                        contentFit="cover"
                        fadeDuration={0}
                        onError={() =>
                          setFailedMealImageIds((prev) =>
                            prev[meal.id] ? prev : { ...prev, [meal.id]: true }
                          )
                        }
                      />
                    ) : (
                      <View style={[styles.mealCardImage, styles.mealCardImagePlaceholder, isUnavailableNow && styles.mealCardImageUnavailable]}>
                        <MaterialCommunityIcons name="food-outline" size={32} color="#fb923c" />
                        <Text style={styles.mealCardImagePlaceholderText}>{t("admin.pos.food", { defaultValue: "Food" })}</Text>
                      </View>
                    )}
                    {basketCount > 0 ? (
                      <View style={styles.mealBasketBadge}>
                        <Text style={styles.mealBasketBadgeText}>{basketCount}</Text>
                      </View>
                    ) : null}
                    {isUnavailableNow ? (
                      <View style={styles.mealUnavailableBadge}>
                        <Text style={styles.mealUnavailableBadgeText}>{t("admin.pos.unavailableNow", { defaultValue: "Unavailable now" })}</Text>
                      </View>
                    ) : null}
                    <View style={styles.mealCardBody}>
                      <View style={styles.mealCardTopRow}>
                        <Text style={styles.mealName} numberOfLines={2}>{meal.name}</Text>
                        <TouchableOpacity style={styles.addBadge} onPress={() => openMealCustomization(meal)}>
                          <MaterialCommunityIcons name="plus" size={14} color="#111827" />
                        </TouchableOpacity>
                      </View>
                      {isUnavailableNow ? (
                        <Text style={styles.mealMeta} numberOfLines={1}>
                          {truncate(nextAvailableText
                            ? `Not available now • ${nextAvailableText}`
                            : t("admin.pos.notAvailableAtThisTime", { defaultValue: "Not available at this time" }), 24)}
                        </Text>
                      ) : null}
                      <View style={styles.mealCardFooter}>
                        <Text style={styles.mealPrice}>{currencyFormatter(catalogMealPrice, resolvedCurrency)}</Text>
                        <Text style={styles.mealCategoryChip}>{truncate(meal.category?.name || t("admin.pos.meal", { defaultValue: "Meal" }), 10)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {isLoadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color="#f97316" />
                <Text style={styles.loadingMoreText}>{t("admin.pos.loadingMore", { defaultValue: "Loading more..." })}</Text>
              </View>
            )}

            {filteredDeals.length > 0 ? (
              <View style={styles.mealGrid}>
                {filteredDeals.map((deal) => {
                  const normalizedDealImage = String(deal.image || "").trim();
                  const hasValidDealImage =
                    normalizedDealImage.length > 0 &&
                    normalizedDealImage.toLowerCase() !== "null" &&
                    normalizedDealImage.toLowerCase() !== "undefined";
                  const dealImageUri = hasValidDealImage ? getOptimizedImageUrl(deal.image) : "";
                  const dealBasketCount = dealBasketCountMap[deal.id] || 0;
                  const dealDisplayPrice = getDealDisplayPrice(deal);
                  return (
                    <TouchableOpacity
                      key={deal.id}
                      style={styles.mealCard}
                      onPress={() => openDealBuilder(deal)}
                    >
                      {hasValidDealImage ? (
                        <Image
                          source={{ uri: dealImageUri }}
                          style={styles.mealCardImage}
                          contentFit="cover"
                          fadeDuration={0}
                        />
                      ) : (
                        <View style={[styles.mealCardImage, styles.mealCardImagePlaceholder]}>
                          <MaterialCommunityIcons name="tag-outline" size={32} color="#fb923c" />
                          <Text style={styles.mealCardImagePlaceholderText}>{t("admin.pos.offer", { defaultValue: "Offer" })}</Text>
                        </View>
                      )}
                      {dealBasketCount > 0 ? (
                        <View style={styles.mealBasketBadge}>
                          <Text style={styles.mealBasketBadgeText}>{dealBasketCount}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.mealBasketBadge, styles.dealOfferBadge]}>
                        <Text style={styles.dealOfferBadgeText}>{t("admin.pos.deal", { defaultValue: "Deal" })}</Text>
                      </View>
                      <View style={styles.mealCardBody}>
                        <View style={styles.mealCardTopRow}>
                          <Text style={styles.mealName}>{truncate(deal.name, 10)}</Text>
                          <TouchableOpacity style={styles.addBadge} onPress={() => openDealBuilder(deal)}>
                            <MaterialCommunityIcons name="plus" size={14} color="#111827" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.mealMeta} numberOfLines={1}>
                          {truncate(deal.description || deal.category?.name || t("admin.pos.offer", { defaultValue: "Offer" }), 15)}
                        </Text>
                        <View style={styles.mealCardFooter}>
                          <Text style={styles.mealPrice}>{currencyFormatter(dealDisplayPrice, resolvedCurrency)}</Text>
                          <Text style={styles.mealCategoryChip}>{truncate(deal.category?.name || t("admin.pos.deal", { defaultValue: "Deal" }), 10)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
          </ScrollView>
          {cartCount > 0 ? (
            <TouchableOpacity
              style={styles.floatingCartButton}
              onPress={() => setActiveView("cart")}
            >
              <MaterialCommunityIcons name="cart" size={22} color="#111827" />
              <Text style={styles.floatingCartButtonText}>
                {t("admin.pos.cartWithCount", { count: cartCount, defaultValue: `Cart (${cartCount})` })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {headerSection}

          <View style={styles.cartPageCard}>
            <View style={styles.cartPageHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>
                  {variant === "counter"
                    ? activeTabId
                      ? openTabs.find((t) => t.id === activeTabId)?.name || t("admin.pos.currentCart", { defaultValue: "Current Cart" })
                      : t("admin.pos.newSale", { defaultValue: "New Sale" })
                    : t("admin.pos.currentCart", { defaultValue: "Current Cart" })}
                </Text>
                <Text style={styles.cartSummaryText}>{cartCount} {t("admin.pos.itemsInSale", { defaultValue: "items in this sale" })}</Text>
                {variant === "dine_in" ? (
                  <TouchableOpacity style={styles.cartTableChip} onPress={() => setShowTableModal(true)}>
                    <MaterialCommunityIcons name="table-furniture" size={14} color="#fb923c" />
                    <Text style={styles.cartTableChipText}>
                      {selectedTable
                        ? t("admin.posDineIn.tableSelected", {
                            defaultValue: "Table {{number}}",
                            number: selectedTable.tableNumber,
                          })
                        : t("admin.posDineIn.noTableYet", { defaultValue: "No table selected" })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity style={styles.branchMiniChip} onPress={() => {
                if (isOffline) {
                  setShowBranchOfflineDialog(true);
                  return;
                }
                setShowBranchSheet(true);
              }}>
                <MaterialCommunityIcons name="office-building" size={14} color="#fb923c" />
                <Text style={styles.branchMiniChipText}>{selectedBranch?.name || t("admin.pos.selectBranch", { defaultValue: "Select branch" })}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.cartList, styles.cartListContent]}>
              {cartItems.length === 0 ? <Text style={styles.emptyText}>{t("admin.pos.noItemsYet", { defaultValue: "No items yet." })}</Text> : null}
              {cartItems.map((item) => {
                const hasDiscount = item.itemDiscountType != null && (item.itemDiscountValue ?? 0) > 0;
                const hasSurcharge = (item.itemSurchargeAmount ?? 0) > 0;
                return (
                  <View key={item.id} style={styles.cartItemCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                        <Text style={styles.cartItemMeta}>{currencyFormatter(item.price, resolvedCurrency)}</Text>
                        {hasDiscount && (
                          <View style={styles.discountBadge}>
                            <Text style={styles.discountBadgeText}>
                              {item.itemDiscountType === "PERCENTAGE"
                                ? `-${item.itemDiscountValue}%`
                                : `-${currencyFormatter(item.itemDiscountValue ?? 0, resolvedCurrency)}`}
                              {item.itemDiscountScope === "PER_UNIT" ? ` ${t("admin.pos.perUnitShort", { defaultValue: "/u" })}` : ""}
                            </Text>
                          </View>
                        )}
                        {hasSurcharge && (
                          <View style={styles.surchargeBadge}>
                            <Text style={styles.surchargeBadgeText}>
                              +{currencyFormatter(item.itemSurchargeAmount ?? 0, resolvedCurrency)}
                              {item.itemSurchargeScope === "PER_UNIT" ? ` ${t("admin.pos.perUnitShort", { defaultValue: "/u" })}` : ""}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.cartEditButton, (hasDiscount || hasSurcharge) && styles.cartAdjustButtonActive]}
                      onPress={() => setAdjustmentSheetItem(item)}
                    >
                      <MaterialCommunityIcons
                        name="tag-outline"
                        size={18}
                        color={hasDiscount || hasSurcharge ? "#ec4899" : "#6B7280"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cartEditButton}
                      onPress={() => {
                        if ((item as any).itemType === "VOUCHER") {
                          // Open voucher sale modal with current values pre-filled
                          if (isOffline) {
                            setShowOfflineVoucherDialog(true);
                            return;
                          }
                          setVoucherSaleType((item as any).vatRate > 0 ? "SINGLE_PURPOSE" : "MULTI_PURPOSE");
                          setVoucherSaleCents(Math.round(item.price * 100));
                          setVoucherSaleAmount(item.price.toFixed(2));
                          setVoucherSaleVatRate((item as any).vatRate || 19);
                          setEditingVoucherItemId(item.id);
                          setShowSellVoucherModal(true);
                        } else if ((item as any).dealId) {
                          editDealCartItem(item.id);
                        } else {
                          editCartItem(item.id);
                        }
                      }}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={18} color="#fb923c" />
                    </TouchableOpacity>
                    {(item as any).itemType !== "VOUCHER" && (
                      <View style={styles.qtyControls}>
                        <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQuantity(item.id, -1)}>
                          <Text style={styles.qtyButtonText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyValue}>{item.quantity}</Text>
                        <TouchableOpacity style={styles.qtyButton} onPress={() => updateCartQuantity(item.id, 1)}>
                          <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.checkoutSummaryCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t("admin.pos.estimatedTotal", { defaultValue: "Estimated total" })}</Text>
                <Text style={styles.totalValue}>{currencyFormatter(subtotal, resolvedCurrency)}</Text>
              </View>

              <View style={styles.actionRow}>
                {cartItems.length > 0 ? (
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => setShowEmptyCartConfirm(true)}
                  >
                    <Text style={styles.secondaryActionText}>{t("admin.pos.emptyCart", { defaultValue: "Empty Cart" })}</Text>
                  </TouchableOpacity>
                ) : null}
                {variant === "counter" && cartItems.length > 0 ? (
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => { setNewTabName(""); setNewTabSavesCart(true); setShowNewTabModal(true); }}
                  >
                    <Text style={styles.secondaryActionText}>{t("admin.pos.openTab", { defaultValue: "Open Tab" })}</Text>
                  </TouchableOpacity>
                ) : null}
                {variant === "dine_in" ? (
                  <TouchableOpacity style={styles.secondaryAction} onPress={saveCurrentDraft}>
                    <Text style={styles.secondaryActionText}>
                      {t("admin.posDineIn.saveTicket", { defaultValue: "Save Ticket" })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {variant === "dine_in" ? (
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={goToTableSettlement}
                    disabled={!selectedTableId}
                  >
                    <Text style={styles.secondaryActionText}>
                      {t("admin.posDineIn.settleTable", { defaultValue: "Settle Table" })}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.primaryAction}
                  onPress={openTicketModal}
                  disabled={submitting || cartItems.length === 0 || (variant === "dine_in" && !selectedTableId)}
                >
                  <Text style={styles.primaryActionText}>{t("admin.pos.openTicketDetails", { defaultValue: "Open Ticket Details" })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      <Modal visible={showEmptyCartConfirm} transparent animationType="fade" onRequestClose={() => setShowEmptyCartConfirm(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowEmptyCartConfirm(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("admin.pos.emptyCartTitle", { defaultValue: "Empty Cart" })}</Text>
            <Text style={styles.ticketModalSubtitle}>{t("admin.pos.emptyCartConfirm", { defaultValue: "Are you sure you want to remove all items from the cart?" })}</Text>
            <View style={[styles.actionRow, { marginTop: 8 }]}>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowEmptyCartConfirm(false)}>
                <Text style={styles.secondaryActionText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: "#ef4444" }]}
                onPress={() => { clearCurrentCart(); setShowEmptyCartConfirm(false); }}
              >
                <Text style={styles.primaryActionText}>{t("admin.pos.emptyCart", { defaultValue: "Empty Cart" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={variant === "counter" && showCloseTabModal} transparent animationType="fade" onRequestClose={() => setShowCloseTabModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCloseTabModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>  
            <Text style={styles.modalTitle}>{t("admin.pos.closeTabTitle", { defaultValue: "Close Tab" })}</Text>
            <Text style={styles.ticketModalSubtitle}>
              {t("admin.pos.closeTabConfirm", { defaultValue: `Close tab "{{name}}"? Items will be discarded.`, name: tabToClose?.name ?? "" })}
            </Text>
            <View style={[styles.actionRow, { marginTop: 8 }]}>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowCloseTabModal(false)}>
                <Text style={styles.secondaryActionText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryAction, { backgroundColor: "#ef4444" }]}
                onPress={() => {
                  if (tabToClose) void deleteOpenTab(tabToClose.id);
                  setShowCloseTabModal(false);
                  setTabToClose(null);
                }}
              >
                <Text style={styles.primaryActionText}>{t("admin.pos.closeTab", { defaultValue: "Close Tab" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={variant === "counter" && showNewTabModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewTabModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowNewTabModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.ticketModalHeader}>
              <Text style={styles.modalTitle}>{t("admin.pos.newTabTitle", { defaultValue: "New Open Tab" })}</Text>
              <TouchableOpacity onPress={() => setShowNewTabModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.ticketModalSubtitle}>
              {t("admin.pos.newTabSubtitle", { defaultValue: "Enter a name for this tab (e.g. customer name or table label)." })}
            </Text>
            <TextInput
              style={[styles.discountInput, { marginTop: 12 }]}
              placeholder={t("admin.pos.newTabPlaceholder", { defaultValue: "e.g. John, Table 5..." })}
              placeholderTextColor="#9CA3AF"
              value={newTabName}
              onChangeText={setNewTabName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                void createOpenTab(newTabName, newTabSavesCart);
                setShowNewTabModal(false);
              }}
            />
            <View style={[styles.actionRow, { marginTop: 12 }]}>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => setShowNewTabModal(false)}>
                <Text style={styles.secondaryActionText}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={() => {
                  void createOpenTab(newTabName, newTabSavesCart);
                  setShowNewTabModal(false);
                }}
              >
                <Text style={styles.primaryActionText}>{t("admin.pos.openTab", { defaultValue: "Open Tab" })}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={variant === "dine_in" && showDraftsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDraftsModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDraftsModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("admin.pos.openTickets", { defaultValue: "Open Tickets" })}</Text>
            <ScrollView>
              {drafts.length === 0 ? <Text style={styles.emptyText}>{t("admin.pos.noSavedTickets", { defaultValue: "No saved tickets." })}</Text> : null}
              {drafts.map((draft) => (
                <View key={draft.id} style={styles.modalRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => loadDraft(draft)}>
                    <Text style={styles.modalRowTitle}>{draft.tableNumber ? `${t("admin.pos.table", { defaultValue: "Table" })} ${draft.tableNumber}` : t("admin.pos.savedTicket", { defaultValue: "Saved ticket" })}</Text>
                    <Text style={styles.modalRowMeta}>{new Date(draft.createdAt).toLocaleString()}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void deleteDraft(draft.id)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showBranchSheet} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setShowBranchSheet(false)}>
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowBranchSheet(false)}>
          <Pressable style={[styles.bottomSheetContent, { paddingBottom: Math.max(12, insets.bottom + 12) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{t("admin.pos.selectBranch", { defaultValue: "Select branch" })}</Text>
              <TouchableOpacity onPress={() => setShowBranchSheet(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {branches.map((branch) => (
                <TouchableOpacity
                  key={branch.id}
                  style={[styles.bottomSheetOption, selectedBranchId === branch.id && styles.bottomSheetOptionActive]}
                  onPress={() => handleBranchChange(branch.id, branch.name || null)}
                >
                  <Text style={[styles.bottomSheetOptionText, selectedBranchId === branch.id && styles.bottomSheetOptionTextActive]}>
                    {branch.name || branch.code || branch.id}
                  </Text>
                  {selectedBranchId === branch.id ? <MaterialCommunityIcons name="check-circle" size={18} color="#fb923c" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* BRANCH OFFLINE DIALOG */}
      <Modal
        visible={showBranchOfflineDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchOfflineDialog(false)}
      >
        <Pressable
          style={styles.offlineDialogOverlay}
          onPress={() => setShowBranchOfflineDialog(false)}
        >
          <Pressable style={styles.offlineDialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.offlineDialogHandle} />
            <View style={styles.offlineDialogContent}>
              <MaterialCommunityIcons name="wifi-off" size={48} color="#ec4899" />
              <Text style={styles.offlineDialogTitle}>
                {t('admin.pos.branchSwitchOfflineTitle', { defaultValue: 'Branch Switch Not Available Offline' })}
              </Text>
              <Text style={styles.offlineDialogMessage}>
                {t('admin.pos.branchSwitchOfflineMessage', { defaultValue: 'Switching branches requires an internet connection. Please connect to the internet to change branches.' })}
              </Text>
              <TouchableOpacity
                style={styles.offlineDialogButton}
                onPress={() => setShowBranchOfflineDialog(false)}
              >
                <Text style={styles.offlineDialogButtonText}>
                  {t('common.ok', { defaultValue: 'OK' })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* OFFLINE VOUCHER DIALOG */}

      <Modal
        visible={variant === "dine_in" && showTableModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTableModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowTableModal(false)}>
          <Pressable style={[styles.modalCard, styles.floorPlanModalCard]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              {selectedZoneId ? (
                <TouchableOpacity onPress={() => setSelectedZoneId(null)} style={styles.modalBackButton}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.modalTitle}>
                {selectedZoneId ? t("admin.pos.selectTable", { defaultValue: "Select table" }) : t("admin.pos.selectZone", { defaultValue: "Select zone" })}
              </Text>
              {selectedZoneId && selectedTableId && (
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => {
                    setShowTableModal(false);
                    setSelectedZoneId(null);
                  }}
                >
                  <Text style={styles.doneButtonText}>{t("admin.pos.done", { defaultValue: "Done" })}</Text>
                </TouchableOpacity>
              )}
            </View>
            {!selectedZoneId ? (
              <ScrollView>
                {zones.length > 0 ? (
                  zones.map((zone) => (
                    <TouchableOpacity
                      key={zone.id}
                      style={styles.modalRow}
                      onPress={() => setSelectedZoneId(zone.id)}
                    >
                      <View>
                        <Text style={styles.modalRowTitle}>{zone.name}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#999" />
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.modalEmptyState}>
                    <Text style={styles.modalEmptyText}>{t("admin.pos.noZonesAvailable", { defaultValue: "No zones available" })}</Text>
                  </View>
                )}
              </ScrollView>
            ) : loadingFloorPlan ? (
              <View style={styles.modalEmptyState}>
                <ActivityIndicator size="large" color="#fb923c" />
                <Text style={styles.modalEmptyText}>{t("admin.pos.loadingFloorPlan", { defaultValue: "Loading floor plan..." })}</Text>
              </View>
            ) : zoneFloorPlan ? (
              <View style={styles.floorPlanContainer}>
                <FloorPlanViewer
                  canvasWidth={zoneFloorPlan.canvasWidth || 800}
                  canvasHeight={zoneFloorPlan.canvasHeight || 600}
                  tables={zoneFloorPlan.tables}
                  floorElements={zoneFloorPlan.floorElements || []}
                  selectedTableIds={selectedTableId ? [selectedTableId] : []}
                  availableTableIds={zoneFloorPlan.tables.filter(t => t.status === "AVAILABLE").map(t => t.id)}
                  onTableSelect={(tableId) => {
                    setSelectedTableId(tableId);
                  }}
                />
              </View>
            ) : (
              <View style={styles.modalEmptyState}>
                <Text style={styles.modalEmptyText}>{t("admin.pos.noFloorPlan", { defaultValue: "No floor plan available for this zone" })}</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showMealCustomizationModal} transparent animationType="fade" onRequestClose={closeMealCustomizationModal}>
        <View style={styles.mealCustomizationOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMealCustomizationModal} />
          <View style={[styles.modalCard, styles.mealCustomizationCard]}>
            <ScrollView
                style={styles.mealCustomizationScroll}
                contentContainerStyle={styles.mealCustomizationBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
              <View style={styles.ticketModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalEyebrow}>{t("admin.pos.mealBuilder", { defaultValue: "Meal Builder" })}</Text>
                  <Text style={styles.modalTitle}>{mealCustomization?.meal.name || t("admin.pos.customizeOrderItem", { defaultValue: "Customize Order Item" })}</Text>
                  <Text style={styles.ticketModalSubtitle}>{t("admin.pos.adjustQuantityHint", { defaultValue: "Adjust quantity, choose add-ons, and review the live total before adding." })}</Text>
                </View>
                <Pressable unstable_pressDelay={120} onPress={closeMealCustomizationModal}>
                  <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
                </Pressable>
              </View>

              <View style={styles.customizationSummaryCard}>
                <View>
                  <Text style={styles.totalLabel}>{t("admin.pos.currentTotal", { defaultValue: "Current total" })}</Text>
                  <Text style={styles.customizationTotalValue}>{currencyFormatter(mealCustomizationTotalPrice, resolvedCurrency)}</Text>
                </View>
                <View style={styles.qtyControls}>
                  <Pressable unstable_pressDelay={120} style={styles.qtyButton} onPress={() => updateCustomizationMealQuantity(-1)}>
                    <Text style={styles.qtyButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{Number(mealCustomization?.quantity || 1)}</Text>
                  <Pressable unstable_pressDelay={120} style={styles.qtyButton} onPress={() => updateCustomizationMealQuantity(1)}>
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>

              {!mealCustomizationAvailability.isAvailableNow ? (
                <View style={styles.fiskalyWarningCard}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#fca5a5" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fiskalyWarningText}>
                      {mealCustomizationNextAvailableText
                        ? `${t("admin.pos.mealNotAvailableNow", { defaultValue: "This meal is not available right now" })}. ${t("admin.pos.nextAvailable", { defaultValue: "Next available" })}: ${mealCustomizationNextAvailableText}.`
                        : t("admin.pos.mealNotAvailableNow", { defaultValue: "This meal is not available right now." })}
                    </Text>
                  </View>
                </View>
              ) : null}

              {mealCustomization && shouldShowMealSizeSection ? (
                <View style={styles.customizationSection}>
                  <Text style={styles.customizationSectionTitle}>{t("admin.pos.mealSize", { defaultValue: "Meal size" })}</Text>
                  <View style={styles.inlineFieldRow}>
                    {mealCustomization.meal.mealSizes.map((size) => {
                      const sizeIdentity = size.id || `${size.name || size.sizeType}-${size.sizeType}`;
                      const selectedIdentity =
                        mealCustomization.sizeName || mealCustomization.mealSizeType || "";
                      const isSelected = selectedIdentity === (mealCustomization.sizeName ? (size.name || "") : size.sizeType) ||
                        selectedIdentity === sizeIdentity;
                      const displayPrice = getEffectiveMealBasePrice(mealCustomization.meal) + Number(size.price || 0);
                      return (
                        <TouchableOpacity
                          key={size.id || `${mealCustomization.meal.id}-${size.name || size.sizeType}-${size.sizeType}`}
                          style={[styles.choiceButton, isSelected && styles.choiceButtonActive]}
                          onPress={() => updateCustomizationMealSize(size)}
                        >
                          <Text style={[styles.choiceButtonText, isSelected && styles.choiceButtonTextActive]}>
                            {size.name || size.sizeType}
                          </Text>
                          <Text style={[styles.choiceButtonMeta, isSelected && styles.choiceButtonMetaActive]}>
                            {currencyFormatter(displayPrice, resolvedCurrency)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {mealCustomization?.addOns?.length ? (
                <View style={styles.customizationSection}>
                  <Text style={styles.customizationSectionTitle}>{t("admin.pos.addOns", { defaultValue: "Add-ons" })}</Text>
                  {(mealCustomization.addOns || []).map((addon) => (
                    <View
                      key={addon.id}
                      style={[
                        styles.customizationRow,
                        Number(addon.quantity || 0) > 0 && styles.customizationRowActive,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customizationName}>{addon.name}</Text>
                        <Text style={styles.customizationMeta}>{currencyFormatter(Number(addon.price || 0), resolvedCurrency)}</Text>
                      </View>
                      {addon.type === "BOOLEAN" ? (
                        <Pressable
                          unstable_pressDelay={120}
                          style={styles.booleanAddonToggle}
                          onPress={() => toggleCustomizationBooleanAddOn(addon.id)}
                        >
                          <MaterialCommunityIcons
                            name={Number(addon.quantity || 0) > 0 ? "checkbox-marked" : "checkbox-blank-outline"}
                            size={24}
                            color={Number(addon.quantity || 0) > 0 ? "#fb923c" : "#9CA3AF"}
                          />
                        </Pressable>
                      ) : (
                        <View style={styles.qtyControls}>
                          <Pressable unstable_pressDelay={120} style={styles.qtyButton} onPress={() => updateCustomizationAddOnQuantity(addon.id, -1)}>
                            <Text style={styles.qtyButtonText}>-</Text>
                          </Pressable>
                          <Text style={styles.qtyValue}>{Number(addon.quantity || 0)}</Text>
                          <Pressable unstable_pressDelay={120} style={styles.qtyButton} onPress={() => updateCustomizationAddOnQuantity(addon.id, 1)}>
                            <Text style={styles.qtyButtonText}>+</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {mealCustomization?.optionalIngredients?.length ? (
                <View style={styles.customizationSection}>
                  <Text style={styles.customizationSectionTitle}>{t("admin.pos.optionalIngredients", { defaultValue: "Optional ingredients" })}</Text>
                  {(mealCustomization.optionalIngredients || []).map((ingredient) => (
                    <Pressable
                      key={ingredient.id}
                      unstable_pressDelay={120}
                      style={styles.optionalIngredientRow}
                      onPress={() => toggleCustomizationOptionalIngredient(ingredient.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customizationName}>{ingredient.name}</Text>
                        <Text style={styles.customizationMeta}>
                          {ingredient.isIncluded === false ? t("admin.pos.removedFromMeal", { defaultValue: "Removed from meal" }) : t("admin.pos.includedInMeal", { defaultValue: "Included in meal" })}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={ingredient.isIncluded === false ? "checkbox-blank-outline" : "checkbox-marked"}
                        size={22}
                        color={ingredient.isIncluded === false ? "#9CA3AF" : "#fb923c"}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.mealCustomizationFooter}>
              <TouchableOpacity
                style={[styles.primaryAction, { flex: 0 }, !mealCustomizationAvailability.isAvailableNow && styles.disabledAction]}
                onPress={applyMealCustomization}
                disabled={!mealCustomizationAvailability.isAvailableNow}
              >
                <Text style={styles.primaryActionText}>{mealCustomization?.cartItemId ? t("admin.pos.updateBasket", { defaultValue: "Update Basket" }) : t("admin.pos.addToBasket", { defaultValue: "Add to Basket" })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDealBuilderModal} transparent animationType="fade" onRequestClose={() => { setShowDealBuilderModal(false); setDealCustomization(null); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setShowDealBuilderModal(false); setDealCustomization(null); }}>
          <Pressable style={[styles.modalCard, styles.mealCustomizationCard]} onPress={() => {}}>
            <GestureHandlerScrollView
              style={styles.mealCustomizationScroll}
              contentContainerStyle={styles.mealCustomizationBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.ticketModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalEyebrow}>{t("admin.pos.dealBuilder", { defaultValue: "Deal Builder" })}</Text>
                  <Text style={styles.modalTitle}>{dealCustomization?.deal.name || t("admin.pos.deal", { defaultValue: "Deal" })}</Text>
                  <Text style={styles.ticketModalSubtitle}>{t("admin.pos.dealBuilderHint", { defaultValue: "Adjust quantity and review what's included before adding." })}</Text>
                </View>
                <Pressable unstable_pressDelay={120} onPress={() => { setShowDealBuilderModal(false); setDealCustomization(null); }}>
                  <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
                </Pressable>
              </View>

              <View style={styles.customizationSummaryCard}>
                <View>
                  <Text style={styles.totalLabel}>{t("admin.pos.currentTotal", { defaultValue: "Current total" })}</Text>
                  <Text style={styles.customizationTotalValue}>{currencyFormatter(dealBuilderTotalPrice, resolvedCurrency)}</Text>
                </View>
                <View style={styles.qtyControls}>
                  <Pressable unstable_pressDelay={120} style={styles.qtyButton} onPress={() => updateDealBuilderQuantity(-1)}>
                    <Text style={styles.qtyButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{dealCustomization?.quantity ?? 1}</Text>
                  <Pressable unstable_pressDelay={120} style={styles.qtyButton} onPress={() => updateDealBuilderQuantity(1)}>
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>

              {dealCustomization?.deal?.components?.length ? (
                <View style={styles.customizationSection}>
                  <Text style={styles.customizationSectionTitle}>{t("admin.pos.dealComponents", { defaultValue: "Included items" })}</Text>
                  {dealCustomization.deal.components.map((component, idx) => {
                    const compQty = Number(component.quantity ?? 1);
                    const compPrice = Number(component.price || 0) * (compQty > 0 ? compQty : 1);
                    return (
                      <View key={component.id || idx} style={styles.customizationRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.customizationName}>
                            {compQty > 1 ? `${compQty}× ` : ""}{component.name}
                          </Text>
                          <Text style={styles.customizationMeta}>{currencyFormatter(compPrice, resolvedCurrency)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <TouchableOpacity style={styles.primaryAction} onPress={applyDealCustomization}>
                <Text style={styles.primaryActionText}>
                  {dealCustomization?.cartItemId
                    ? t("admin.pos.updateBasket", { defaultValue: "Update Basket" })
                    : t("admin.pos.addToBasket", { defaultValue: "Add to Basket" })}
                </Text>
              </TouchableOpacity>
            </GestureHandlerScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showTicketModal} transparent animationType="fade" onRequestClose={closeTicketModal}>
        <View style={styles.ticketModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTicketModal} />
          <View style={[styles.modalCard, styles.ticketModalCard]}>
            <View style={styles.ticketModalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t("admin.pos.ticketDetails", { defaultValue: "Ticket details" })}</Text>
                <Text style={styles.ticketModalSubtitle}>{t("admin.pos.completeSaleInfo", { defaultValue: "Complete the sale information here before confirming checkout." })}</Text>
              </View>
              <TouchableOpacity onPress={closeTicketModal}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.ticketModalBody}>
              <View style={styles.inlineFieldRow}>
                <TouchableOpacity
                  style={[styles.choiceButton, paymentMethod === "CASH" && styles.choiceButtonActive]}
                  onPress={() => setPaymentMethod("CASH")}
                >
                  <Text style={[styles.choiceButtonText, paymentMethod === "CASH" && styles.choiceButtonTextActive]}>{t("admin.pos.cash", { defaultValue: "Cash" })}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.choiceButton, paymentMethod === "CARD" && styles.choiceButtonActive]}
                  onPress={() => setPaymentMethod("CARD")}
                >
                  <Text style={[styles.choiceButtonText, paymentMethod === "CARD" && styles.choiceButtonTextActive]}>{t("admin.pos.card", { defaultValue: "Card" })}</Text>
                </TouchableOpacity>
              </View>

              {/* Voucher Redemption Section */}
              {currentOrganization?.vouchersAllowed !== false && (
                <View style={{ marginVertical: 12 }}>
                  <Text style={{ color: "#6b7280", fontSize: 14, fontWeight: "600", marginBottom: 6 }}>{t("admin.pos.redeemVoucher", { defaultValue: "Redeem Voucher" })}</Text>
                  {appliedVoucher ? (
                    <View style={{ gap: 8 }}>
                      <View style={{ backgroundColor: "#f9fafb", borderColor: "#ec4899", borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#ec4899", fontWeight: "700", fontSize: 14 }}>{appliedVoucher.voucherCode}</Text>
                          <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                            {t("admin.pos.voucherValue", { defaultValue: "Value" })}: {currencyFormatter(dynamicVoucherDeduction, taxBreakdown.currency)} ({appliedVoucher.type === "SINGLE_PURPOSE" ? t("admin.pos.singlePurpose", { defaultValue: "Single-Purpose" }) : t("admin.pos.multiPurpose", { defaultValue: "Multi-Purpose" })})
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={{ padding: 6, backgroundColor: "#fdf2f8", borderRadius: 8 }}
                          onPress={() => setAppliedVoucher(null)}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#f43f5e" />
                        </TouchableOpacity>
                      </View>
                      {appliedVoucher.type === "SINGLE_PURPOSE" && appliedVoucher.vatRate !== undefined && appliedVoucher.vatRate !== null && (() => {
                        const lookupRate = Math.round(appliedVoucher.vatRate * 100) / 100;
                        const matchingTaxTotal = finalTaxGrossTotals[lookupRate] || 0;
                        if (matchingTaxTotal <= 0.01) {
                          return (
                            <View style={{ backgroundColor: "#fef2f2", borderColor: "#f43f5e", borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4 }}>
                              <Text style={{ color: "#f87171", fontSize: 12, fontWeight: "600" }}>
                                {t("admin.pos.voucherVatRateMismatch", {
                                  defaultValue: "This single-purpose voucher is for {{vatRate}}% VAT items, but there are no matching items in your cart.",
                                  vatRate: appliedVoucher.vatRate,
                                })}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  ) : (
                    !cartContainsVoucherItem && (
                      <View>
                        <TouchableOpacity
                          style={{ borderColor: "#ec4899", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, padding: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, opacity: isOffline ? 0.5 : 1 }}
                          onPress={() => !isOffline && setShowRedeemVoucherModal(true)}
                          disabled={isOffline}
                        >
                          <MaterialCommunityIcons name="ticket-percent-outline" size={18} color="#ec4899" />
                          <Text style={{ color: "#ec4899", fontWeight: "700" }}>{t("admin.pos.applyVoucher", { defaultValue: "Apply Voucher" })}</Text>
                        </TouchableOpacity>
                        {isOffline && (
                          <Text style={{ color: "#a1a1aa", fontSize: 11, marginTop: 4, textAlign: "center" }}>
                            {t("admin.pos.applyVoucherOfflineHint", { defaultValue: "Applying vouchers is not available in offline mode" })}
                          </Text>
                        )}
                      </View>
                    )
                  )}
                </View>
              )}

              {variant === "dine_in" ? (
                <TouchableOpacity style={styles.tableSelector} onPress={() => setShowTableModal(true)}>
                  <MaterialCommunityIcons name="table-furniture" size={18} color="#f97316" />
                  <Text style={styles.tableSelectorText}>
                    {selectedTable
                      ? t("admin.posDineIn.tableSelected", {
                          defaultValue: "Table {{number}}",
                          number: selectedTable.tableNumber,
                        })
                      : t("admin.posDineIn.selectTable", { defaultValue: "Select table" })}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.ticketFooterCard}>
                {(() => {
                  const totalItemDiscountCentsHeader = cartItems.reduce((sum, item) => {
                    const qty = item.quantity;
                    const baseGross = Math.round(item.price * qty * 100);
                    const discVal = item.itemDiscountValue ?? 0;
                    const discCents =
                      item.itemDiscountType === "PERCENTAGE"
                        ? Math.round(baseGross * (Math.min(discVal, 100) / 100))
                        : item.itemDiscountType === "FIXED"
                        ? item.itemDiscountScope === "PER_UNIT"
                          ? Math.round(discVal * qty * 100)
                          : Math.round(discVal * 100)
                        : 0;
                    return sum + discCents;
                  }, 0);
                  const totalItemSurchargeCentsHeader = cartItems.reduce((sum, item) => {
                    const qty = item.quantity;
                    const surchargeRaw = item.itemSurchargeAmount ?? 0;
                    const surchargeCents =
                      item.itemSurchargeScope === "PER_UNIT"
                        ? Math.round(surchargeRaw * qty * 100)
                        : Math.round(surchargeRaw * 100);
                    return sum + surchargeCents;
                  }, 0);
                  const hasItemAdjustments = totalItemDiscountCentsHeader > 0 || totalItemSurchargeCentsHeader > 0;
                  const preDiscountSubtotal = taxBreakdown.subtotal + totalItemDiscountCentsHeader / 100 - totalItemSurchargeCentsHeader / 100;
                  return (
                    <>
                      {hasItemAdjustments && (
                        <View style={styles.summaryRowCompact}>
                          <Text style={styles.summaryLabel}>{t("admin.pos.subtotalOriginal", { defaultValue: "Subtotal (original)" })}</Text>
                          <Text style={styles.summaryValue}>{currencyFormatter(preDiscountSubtotal, taxBreakdown.currency)}</Text>
                        </View>
                      )}
                      {totalItemDiscountCentsHeader > 0 && (
                        <View style={styles.summaryRowCompact}>
                          <Text style={[styles.summaryLabel, { color: "#22c55e" }]}>{t("admin.pos.itemDiscountsLabel", { defaultValue: "Item discounts" })}</Text>
                          <Text style={[styles.summaryValue, { color: "#22c55e" }]}>-{currencyFormatter(totalItemDiscountCentsHeader / 100, taxBreakdown.currency)}</Text>
                        </View>
                      )}
                      {totalItemSurchargeCentsHeader > 0 && (
                        <View style={styles.summaryRowCompact}>
                          <Text style={[styles.summaryLabel, { color: "#f59e0b" }]}>{t("admin.pos.itemSurchargesLabel", { defaultValue: "Item surcharges" })}</Text>
                          <Text style={[styles.summaryValue, { color: "#f59e0b" }]}>+{currencyFormatter(totalItemSurchargeCentsHeader / 100, taxBreakdown.currency)}</Text>
                        </View>
                      )}
                      <View style={styles.summaryRowCompact}>
                        <Text style={styles.summaryLabel}>{t("admin.pos.subtotal", { defaultValue: "Subtotal" })}</Text>
                        <Text style={styles.summaryValue}>{currencyFormatter(taxBreakdown.subtotal, taxBreakdown.currency)}</Text>
                      </View>
                    </>
                  );
                })()}
                {taxBreakdown.takeawayServiceFee > 0 ? (
                  <View style={styles.summaryRowCompact}>
                    <Text style={styles.summaryLabel}>{t("admin.pos.takeawayServiceFee", { defaultValue: "Takeaway service fee" })}</Text>
                    <Text style={styles.summaryValue}>{currencyFormatter(taxBreakdown.takeawayServiceFee, taxBreakdown.currency)}</Text>
                  </View>
                ) : null}
                {!taxBreakdown.taxInclusive ? (
                  <>
                    <View style={styles.summaryRowCompact}>
                      <Text style={styles.summaryLabel}>{t("admin.pos.itemTax", { defaultValue: "Item tax" })}</Text>
                      <Text style={styles.summaryValue}>{currencyFormatter(taxBreakdown.itemTaxAmount, taxBreakdown.currency)}</Text>
                    </View>
                    <View style={styles.summaryRowCompact}>
                      <Text style={styles.summaryLabel}>{t("admin.pos.addonTax", { defaultValue: "Add-on tax" })}</Text>
                      <Text style={styles.summaryValue}>{currencyFormatter(taxBreakdown.addonTaxAmount, taxBreakdown.currency)}</Text>
                    </View>
                    {taxBreakdown.takeawayServiceTaxAmount > 0 ? (
                      <View style={styles.summaryRowCompact}>
                        <Text style={styles.summaryLabel}>{t("admin.pos.serviceTax", { defaultValue: "Service tax" })}</Text>
                        <Text style={styles.summaryValue}>{currencyFormatter(taxBreakdown.takeawayServiceTaxAmount, taxBreakdown.currency)}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
                {posDeviceRequiredButMissing ? (
                  <View style={styles.fiskalyWarningCard}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#fca5a5" />
                    <Text style={styles.fiskalyWarningText}>
                      {t("admin.pos.fiskalyWarning", { defaultValue: "Fiskaly live mode is enabled. Select a provisioned POS device for this branch before confirming checkout." })}
                    </Text>
                  </View>
                ) : null}
                {discountAmount > 0 ? (
                  <View style={styles.summaryRowCompact}>
                    <Text style={[styles.summaryLabel, { color: "#22c55e" }]}>{t("admin.pos.discountAmountLabel", { defaultValue: "Discount" })}</Text>
                    <Text style={[styles.summaryValue, { color: "#22c55e" }]}>-{currencyFormatter(discountAmount, taxBreakdown.currency)}</Text>
                  </View>
                ) : null}
                {appliedVoucher ? (
                  <View style={styles.summaryRowCompact}>
                    <Text style={[styles.summaryLabel, { color: "#ec4899" }]}>{t("admin.pos.voucherDeduction", { defaultValue: "Voucher Deduction" })}</Text>
                    <Text style={[styles.summaryValue, { color: "#ec4899" }]}>-{currencyFormatter(dynamicVoucherDeduction, taxBreakdown.currency)}</Text>
                  </View>
                ) : null}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("admin.pos.total", { defaultValue: "Total" })}</Text>
                  <Text style={styles.totalValue}>{currencyFormatter(Math.max(taxBreakdown.total - discountAmount, 0), taxBreakdown.currency)}</Text>
                </View>
                {appliedVoucher ? (
                  <View style={[styles.totalRow, { borderTopWidth: 0, marginTop: 0, paddingTop: 4 }]}>
                    <Text style={[styles.totalLabel, { color: "#ec4899" }]}>{t("admin.pos.amountDue", { defaultValue: "Amount Due" })}</Text>
                    <Text style={[styles.totalValue, { color: "#ec4899" }]}>{currencyFormatter(Math.max(Math.max(taxBreakdown.total - discountAmount, 0) - dynamicVoucherDeduction, 0), taxBreakdown.currency)}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={[styles.primaryAction, posDeviceRequiredButMissing && styles.disabledAction]} onPress={handleCheckout} disabled={submitting || posDeviceRequiredButMissing}>
                  {submitting ? <ActivityIndicator color="#111827" /> : <Text style={styles.primaryActionText}>{t("admin.pos.confirmCheckout", { defaultValue: "Confirm Checkout" })}</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
        topOffset={insets.top + 12}
      />

      <ItemAdjustmentSheet
        visible={adjustmentSheetItem !== null}
        item={adjustmentSheetItem}
        currency={resolvedCurrency}
        onClose={() => setAdjustmentSheetItem(null)}
        onApply={(itemId, discount, surcharge) => {
          setCartItems((prev) =>
            prev.map((ci) =>
              ci.id === itemId
                ? {
                    ...ci,
                    itemDiscountType: discount.type,
                    itemDiscountValue: discount.value,
                    itemDiscountScope: discount.scope,
                    itemSurchargeAmount: surcharge.amount,
                    itemSurchargeScope: surcharge.scope,
                  }
                : ci
            )
          );
        }}
      />

      {/* MODAL 1: Sell Voucher ("Gutschein verkaufen") */}
      <Modal visible={showSellVoucherModal} transparent animationType="slide" onRequestClose={() => { setShowSellVoucherModal(false); setVoucherSaleCents(0); setVoucherSaleAmount(""); setEditingVoucherItemId(null); }}>
        <View style={styles.ticketModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowSellVoucherModal(false); setVoucherSaleCents(0); setVoucherSaleAmount(""); setEditingVoucherItemId(null); }} />
          <View style={[styles.modalCard, { maxHeight: "80%", width: 560 }]}>
            <View style={styles.ticketModalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t("admin.pos.sellVoucherTitle", { defaultValue: "Sell Voucher" })}</Text>
                <Text style={styles.ticketModalSubtitle}>{t("admin.pos.sellVoucherSubtitle", { defaultValue: "Specify the value and type of the voucher." })}</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowSellVoucherModal(false); setVoucherSaleCents(0); setVoucherSaleAmount(""); setEditingVoucherItemId(null); }}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {/* Type Selection */}
              <Text style={{ color: "#a1a1aa", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{t("admin.pos.voucherType", { defaultValue: "VOUCHER TYPE" })}</Text>
              <View style={[styles.inlineFieldRow, { marginBottom: 16 }]}>
                <TouchableOpacity
                  style={[styles.choiceButton, { flex: 1, height: 48, justifyContent: "center" }, voucherSaleType === "MULTI_PURPOSE" && styles.choiceButtonActive]}
                  onPress={() => setVoucherSaleType("MULTI_PURPOSE")}
                >
                  <Text style={[styles.choiceButtonText, { fontSize: 12 }, voucherSaleType === "MULTI_PURPOSE" && styles.choiceButtonTextActive]} numberOfLines={1}>{t("admin.pos.multiPurposeSale", { defaultValue: "Multi-Purpose (Tax at redemption)" })}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.choiceButton, { flex: 1, height: 48, justifyContent: "center", marginLeft: 8 }, voucherSaleType === "SINGLE_PURPOSE" && styles.choiceButtonActive]}
                  onPress={() => setVoucherSaleType("SINGLE_PURPOSE")}
                >
                  <Text style={[styles.choiceButtonText, { fontSize: 12 }, voucherSaleType === "SINGLE_PURPOSE" && styles.choiceButtonTextActive]} numberOfLines={1}>{t("admin.pos.singlePurposeSale", { defaultValue: "Single-Purpose (Tax immediate)" })}</Text>
                </TouchableOpacity>
              </View>

              {/* VAT Selection for Single-Purpose */}
              {voucherSaleType === "SINGLE_PURPOSE" && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: "#a1a1aa", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{t("admin.pos.vatRateLabel", { defaultValue: "TAX RATE (VAT)" })}</Text>
                  <View style={styles.inlineFieldRow}>
                    <TouchableOpacity
                      style={[styles.choiceButton, { flex: 1 }, voucherSaleVatRate === 19 && styles.choiceButtonActive]}
                      onPress={() => setVoucherSaleVatRate(19)}
                    >
                      <Text style={[styles.choiceButtonText, voucherSaleVatRate === 19 && styles.choiceButtonTextActive]}>19% MwSt.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choiceButton, { flex: 1, marginLeft: 8 }, voucherSaleVatRate === 7 && styles.choiceButtonActive]}
                      onPress={() => setVoucherSaleVatRate(7)}
                    >
                      <Text style={[styles.choiceButtonText, voucherSaleVatRate === 7 && styles.choiceButtonTextActive]}>7% MwSt.</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Value Input */}
              <Text style={{ color: "#a1a1aa", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{t("admin.pos.amountLabel", { defaultValue: "AMOUNT" })}</Text>
              <TextInput
                style={[styles.discountInput, { color: "#111827", fontSize: 24, textAlign: "center", height: 55, fontWeight: "700" }]}
                keyboardType="number-pad"
                value={voucherSaleAmount}
                placeholder="0.00"
                placeholderTextColor="#6b7280"
                selection={{ start: voucherSaleAmount.length, end: voucherSaleAmount.length }}
                onChangeText={(text) => {
                  // European POS cents-based style: digits enter as cents from right to left
                  if (text.length < voucherSaleAmount.length || text === "") {
                    const newCents = Math.floor(voucherSaleCents / 10);
                    setVoucherSaleCents(newCents);
                    setVoucherSaleAmount(newCents === 0 ? "" : (newCents / 100).toFixed(2));
                  } else {
                    const newChars = text.replace(/[^0-9]/g, "");
                    const oldChars = voucherSaleAmount.replace(/[^0-9]/g, "");
                    if (newChars.length > oldChars.length) {
                      const addedDigits = newChars.slice(oldChars.length);
                      let cents = voucherSaleCents;
                      for (const d of addedDigits) {
                        cents = cents * 10 + parseInt(d, 10);
                      }
                      setVoucherSaleCents(cents);
                      setVoucherSaleAmount(cents === 0 ? "" : (cents / 100).toFixed(2));
                    }
                  }
                }}
              />

              <TouchableOpacity
                style={[styles.primaryAction, { marginTop: 24 }]}
                onPress={() => {
                  const val = voucherSaleCents / 100;
                  if (!val || val <= 0) {
                    showToast(t("admin.pos.enterValidAmount", { defaultValue: "Please enter a valid amount." }), "error");
                    return;
                  }
                  const syntheticId = `VOUCHER_${voucherSaleType}_${Date.now()}`;
                  const newItem: PosCartItem = {
                    id: syntheticId,
                    mealId: syntheticId,
                    name: `${voucherSaleType === "SINGLE_PURPOSE" ? t("admin.pos.singlePurpose", { defaultValue: "Single-Purpose" }) : t("admin.pos.multiPurpose", { defaultValue: "Multi-Purpose" })} (€${val.toFixed(2)})`,
                    quantity: 1,
                    price: val,
                  };
                  (newItem as any).itemType = "VOUCHER";
                  (newItem as any).vatRate = voucherSaleType === "SINGLE_PURPOSE" ? voucherSaleVatRate : 0.0;

                  if (editingVoucherItemId) {
                    // Update existing voucher item
                    setCartItems((prev) =>
                      prev.map((item) =>
                        item.id === editingVoucherItemId ? { ...newItem, id: editingVoucherItemId, mealId: editingVoucherItemId } : item
                      )
                    );
                    showToast(t("admin.pos.voucherUpdated", { defaultValue: "Voucher successfully updated." }), "success");
                  } else {
                    // Add new voucher item
                    setCartItems((prev) => [...prev, newItem]);
                    setSearchTerm("");
                    showToast(t("admin.pos.voucherAddedToBasket", { defaultValue: "Voucher successfully added to basket." }), "success");
                  }
                  setShowSellVoucherModal(false);
                  setVoucherSaleCents(0);
                  setVoucherSaleAmount("");
                  setEditingVoucherItemId(null);
                }}
              >
                <Text style={styles.primaryActionText}>
                  {editingVoucherItemId ? t("admin.pos.updateBasket", { defaultValue: "Update" }) : t("admin.pos.addToBasket", { defaultValue: "Add to Basket" })}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Redeem Voucher ("Gutschein anwenden") */}
      <Modal visible={showRedeemVoucherModal} transparent animationType="slide" onRequestClose={() => { setShowRedeemVoucherModal(false); setValidatedVoucher(null); setVoucherRedeemCode(""); setVoucherError(""); }}>
        <View style={styles.ticketModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowRedeemVoucherModal(false); setValidatedVoucher(null); setVoucherRedeemCode(""); setVoucherError(""); }} />
          <View style={[styles.modalCard, { maxHeight: "80%", width: 440 }]}>
            <View style={styles.ticketModalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t("admin.pos.redeemVoucherTitle", { defaultValue: "Redeem Voucher" })}</Text>
                <Text style={styles.ticketModalSubtitle}>{t("admin.pos.redeemVoucherSubtitle", { defaultValue: "Scan or enter the voucher code." })}</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowRedeemVoucherModal(false); setValidatedVoucher(null); setVoucherRedeemCode(""); setVoucherError(""); }}>
                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {/* Manual Alphanumeric Entry */}
              <Text style={{ color: "#6b7280", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>{t("admin.pos.voucherCodeLabel", { defaultValue: "VOUCHER CODE" })}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                <TextInput
                  style={[styles.discountInput, { flex: 1, color: "#111827", textTransform: "uppercase", fontSize: 16, height: 48, fontWeight: "700" }]}
                  value={voucherRedeemCode}
                  onChangeText={(text) => {
                    setVoucherRedeemCode(text.toUpperCase());
                    setVoucherError("");
                  }}
                  placeholder="GUT-XXXX-XXXX-XXXX"
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  style={[styles.primaryAction, { width: 100, height: 48, justifyContent: "center" }]}
                  onPress={async () => {
                    if (!voucherRedeemCode.trim()) {
                      setVoucherError(t("admin.pos.voucherCodeRequired", { defaultValue: "Please enter a voucher code" }));
                      return;
                    }
                    try {
                      setSubmitting(true);
                      setVoucherError("");
                      const token = await getToken();
                      const vInfo = await voucherService.validateVoucher({
                        voucherCode: voucherRedeemCode.trim(),
                        branchId: selectedBranchId || undefined,
                      }, token || undefined);

                      const appCheck = checkSinglePurposeVoucherApplicability(vInfo);
                      if (!appCheck.valid) {
                        setVoucherError(appCheck.error || "");
                        setValidatedVoucher(null);
                        return;
                      }
                      
                      setValidatedVoucher(vInfo);
                    } catch (err: any) {
                      setVoucherError(err?.message || t("admin.pos.invalidVoucherCode", { defaultValue: "Invalid or expired voucher code" }));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#111827" />
                  ) : (
                    <Text style={styles.primaryActionText}>{t("admin.pos.verifyCode", { defaultValue: "Verify" })}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Error Message Display */}
              {voucherError ? (
                <Text style={{ color: "#ef4444", fontSize: 12, marginTop: -12, marginBottom: 16 }}>{voucherError}</Text>
              ) : null}

              {/* Camera Scanner Button */}
              <TouchableOpacity
                style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginBottom: 20 }}
                onPress={async () => {
                  try {
                    const status = await requestPermission();
                    if (status.granted) {
                      setShowCameraScanner(true);
                    } else {
                      Alert.alert(
                        t("admin.pos.cameraPermissionDenied", { defaultValue: "Camera Permission Denied" }),
                        t("admin.pos.cameraPermissionMsg", { defaultValue: "Please enable camera permissions in settings to scan QR codes. Would you like to use the simulation instead?" }),
                        [
                          { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
                          {
                            text: t("admin.pos.simulate", { defaultValue: "Simulate" }),
                            onPress: async () => {
                              const testCode = "GUT-TEST-VOUC-H123";
                              setVoucherRedeemCode(testCode);
                              setVoucherError("");
                              try {
                                setSubmitting(true);
                                const token = await getToken();
                                const mockVoucher = {
                                  voucherCode: testCode,
                                  voucherType: "MULTI_PURPOSE",
                                  currentAmount: 50.00,
                                  initialAmount: 50.00,
                                  vatRate: null,
                                  expiresAt: new Date(new Date().getFullYear() + 3, 11, 31).toISOString(),
                                  status: "ACTIVE",
                                };
                                setValidatedVoucher(mockVoucher);
                                showToast(t("admin.pos.scanSimulated", { defaultValue: "Voucher scan successfully simulated!" }), "success");
                              } catch (err) {
                                setVoucherError(t("admin.pos.voucherScanFailed", { defaultValue: "Scan validation failed" }));
                              } finally {
                                setSubmitting(false);
                              }
                            }
                          }
                        ]
                      );
                    }
                  } catch (err) {
                    console.warn("Camera permission request failed:", err);
                    Alert.alert(
                      t("admin.pos.simulateScanner", { defaultValue: "Simulate Scanner" }),
                      t("admin.pos.scannerSimulationMsg", { defaultValue: "Scanning a barcode/QR code is simulated on this device. Click 'Simulate' to apply a test code." }),
                      [
                        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
                        {
                          text: t("admin.pos.simulate", { defaultValue: "Simulate" }),
                          onPress: async () => {
                            const testCode = "GUT-TEST-VOUC-H123";
                            setVoucherRedeemCode(testCode);
                            setVoucherError("");
                            try {
                              setSubmitting(true);
                              const token = await getToken();
                              const mockVoucher = {
                                voucherCode: testCode,
                                voucherType: "MULTI_PURPOSE",
                                currentAmount: 50.00,
                                initialAmount: 50.00,
                                vatRate: null,
                                expiresAt: new Date(new Date().getFullYear() + 3, 11, 31).toISOString(),
                                status: "ACTIVE",
                              };
                              setValidatedVoucher(mockVoucher);
                              showToast(t("admin.pos.scanSimulated", { defaultValue: "Voucher scan successfully simulated!" }), "success");
                            } catch (err) {
                              setVoucherError(t("admin.pos.voucherScanFailed", { defaultValue: "Scan validation failed" }));
                            } finally {
                              setSubmitting(false);
                            }
                          }
                        }
                      ]
                    );
                  }
                }}
              >
                <MaterialCommunityIcons name="camera-outline" size={18} color="#6b7280" />
                <Text style={{ color: "#6b7280", fontWeight: "600" }}>{t("admin.pos.openCameraScanner", { defaultValue: "Open Camera Scanner" })}</Text>
              </TouchableOpacity>

              {/* Status Display of validated Voucher */}
              {validatedVoucher && (
                <View style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <Text style={{ color: "#111827", fontSize: 16, fontWeight: "700", marginBottom: 8 }}>{t("admin.pos.voucherDetails", { defaultValue: "Voucher Details" })}</Text>
                  
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: "#6b7280", fontSize: 13 }}>{t("admin.pos.balance", { defaultValue: "Balance:" })}</Text>
                    <Text style={{ color: "#ec4899", fontSize: 15, fontWeight: "700" }}>{currencyFormatter(Number(validatedVoucher.currentAmount), taxBreakdown.currency)}</Text>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: "#6b7280", fontSize: 13 }}>{t("admin.pos.voucherTypeLabel", { defaultValue: "Voucher Type:" })}</Text>
                    <Text style={{ color: "#111827", fontSize: 13, fontWeight: "600" }}>
                      {validatedVoucher.voucherType === "SINGLE_PURPOSE" ? t("admin.pos.singlePurpose", { defaultValue: "Single-Purpose" }) : t("admin.pos.multiPurpose", { defaultValue: "Multi-Purpose" })}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: "#6b7280", fontSize: 13 }}>{t("admin.pos.validUntil", { defaultValue: "Valid until:" })}</Text>
                    <Text style={{ color: "#111827", fontSize: 13 }}>{new Date(validatedVoucher.expiresAt).toLocaleDateString("de-DE")}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryAction, { marginTop: 16, backgroundColor: "#ec4899" }]}
                    onPress={() => {
                      const orderTotal = Math.max(taxBreakdown.total - discountAmount, 0);
                      let maxEligibleAmount = orderTotal;
                      
                      if (validatedVoucher.voucherType === "SINGLE_PURPOSE") {
                        const lookupRate = Math.round((validatedVoucher.vatRate || 0) * 100) / 100;
                        const matchingTaxTotal = finalTaxGrossTotals[lookupRate] || 0;
                        maxEligibleAmount = Math.min(orderTotal, matchingTaxTotal);
                      }
                      
                      const redeemAmount = Math.min(Number(validatedVoucher.currentAmount), maxEligibleAmount);
                      setAppliedVoucher({
                        voucherCode: validatedVoucher.voucherCode,
                        amount: redeemAmount,
                        type: validatedVoucher.voucherType,
                        voucherBalance: Number(validatedVoucher.currentAmount),
                        vatRate: validatedVoucher.vatRate,
                        remainingBalance: Math.max(0, Number(validatedVoucher.currentAmount) - redeemAmount),
                      });
                      setShowRedeemVoucherModal(false);
                      setValidatedVoucher(null);
                      setVoucherRedeemCode("");
                    }}
                  >
                    <Text style={[styles.primaryActionText, { color: "#fff" }]}>{t("admin.pos.applyVoucher", { defaultValue: "Apply Voucher" })}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* OFFLINE VOUCHER DIALOG */}
      <Modal
        visible={showOfflineVoucherDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOfflineVoucherDialog(false)}
      >
        <Pressable
          style={styles.offlineDialogOverlay}
          onPress={() => setShowOfflineVoucherDialog(false)}
        >
          <Pressable style={styles.offlineDialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.offlineDialogHandle} />
            <View style={styles.offlineDialogContent}>
              <MaterialCommunityIcons name="wifi-off" size={48} color="#ec4899" />
              <Text style={styles.offlineDialogTitle}>
                {t("admin.pos.voucherOfflineTitle", { defaultValue: "Voucher Not Available Offline" })}
              </Text>
              <Text style={styles.offlineDialogMessage}>
                {t("admin.pos.voucherOfflineMessage", { defaultValue: "Voucher sales and redemption require an internet connection. Please connect to the internet to use vouchers." })}
              </Text>
              <TouchableOpacity
                style={styles.offlineDialogButton}
                onPress={() => setShowOfflineVoucherDialog(false)}
              >
                <Text style={styles.offlineDialogButtonText}>
                  {t("common.ok", { defaultValue: "OK" })}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* CAMERA SCANNER MODAL */}
      <Modal
        visible={showCameraScanner}
        animationType="slide"
        onRequestClose={() => setShowCameraScanner(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={async ({ data }) => {
                if (data) {
                  setShowCameraScanner(false);
                  setVoucherRedeemCode(data);
                  setVoucherError("");
                  // Auto-validate code
                  try {
                    setSubmitting(true);
                    const token = await getToken();
                    const vInfo = await voucherService.validateVoucher({
                      voucherCode: data.trim(),
                      branchId: selectedBranchId || undefined,
                    }, token || undefined);

                    const appCheck = checkSinglePurposeVoucherApplicability(vInfo);
                    if (!appCheck.valid) {
                      setVoucherError(appCheck.error || "");
                      setValidatedVoucher(null);
                      showToast(appCheck.error || "", "error");
                      return;
                    }
                    
                    setValidatedVoucher(vInfo);
                    showToast(t("admin.pos.voucherScannedSuccess", { defaultValue: "Voucher scanned successfully!" }), "success");
                  } catch (err: any) {
                    setVoucherError(err?.message || t("admin.pos.invalidVoucherCode", { defaultValue: "Invalid or expired voucher code" }));
                  } finally {
                    setSubmitting(false);
                  }
                }
              }}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
              <Text style={{ color: "#111827", textAlign: "center", marginBottom: 20 }}>
                {t("admin.pos.cameraPermissionRequired", { defaultValue: "Camera permission is required to scan QR codes." })}
              </Text>
            </View>
          )}

          {/* Scanner Overlay UI */}
          <View style={StyleSheet.absoluteFillObject}>
            {/* Top mask */}
            <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />
            {/* Middle row */}
            <View style={{ flexDirection: "row", height: 280 }}>
              <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />
              {/* Scan window frame */}
              <View style={{ width: 280, borderWidth: 2, borderColor: "#ec4899", borderRadius: 16, backgroundColor: "transparent", overflow: "hidden" }}>
                {/* Horizontal scanner beam animation or simple line */}
                <View style={{ height: 2, backgroundColor: "#ec4899", width: "100%", position: "absolute", top: "50%" }} />
              </View>
              <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" }} />
            </View>
            {/* Bottom mask */}
            <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center" }}>
              <Text style={{ color: "#6b7280", fontSize: 16, fontWeight: "600", marginBottom: 30, textAlign: "center", paddingHorizontal: 20 }}>
                {t("admin.pos.alignQrCode", { defaultValue: "Align the Voucher QR code inside the box to scan" })}
              </Text>
              
              <TouchableOpacity
                style={{ backgroundColor: "#f9fafb", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: "#e5e7eb" }}
                onPress={() => setShowCameraScanner(false)}
              >
                <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: custom Gutschein-Beleg print modal */}
      <Modal visible={showReceiptPrintModal} transparent animationType="fade" onRequestClose={() => setShowReceiptPrintModal(false)}>
        <View style={styles.ticketModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowReceiptPrintModal(false)} />
          <View style={[styles.modalCard, { width: 380, backgroundColor: "#fff", padding: 24 }]}>
            {/* Real Receipt Thermal style layout */}
            <View style={{ alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827", textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                {selectedBranch?.name || currentOrganization?.name || "Bellami Store"}
              </Text>
              <Text style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>{t("admin.pos.voucherTaxReceipt", { defaultValue: "Tax Voucher Receipt" })}</Text>
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700" }}>{t("admin.pos.voucherType", { defaultValue: "VOUCHER TYPE" })}</Text>
              <Text style={{ fontSize: 14, color: "#111827", fontWeight: "700", marginTop: 2 }}>
                {lastCreatedVoucherType === "SINGLE_PURPOSE" ? t("admin.pos.singlePurposeUpper", { defaultValue: "SINGLE-PURPOSE VOUCHER" }) : t("admin.pos.multiPurposeUpper", { defaultValue: "MULTI-PURPOSE VOUCHER" })}
              </Text>
              <Text style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
                {lastCreatedVoucherType === "SINGLE_PURPOSE" ? t("admin.pos.taxImmediatelyCharged", { defaultValue: "Tax was immediately charged" }) : t("admin.pos.taxChargedAtRedemption", { defaultValue: "Tax charged upon redemption" })}
              </Text>
            </View>

            <View style={{ backgroundColor: "#f4f4f5", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700" }}>{t("admin.pos.voucherValueUpper", { defaultValue: "VOUCHER VALUE" })}</Text>
              <Text style={{ fontSize: 32, color: "#111827", fontWeight: "800", marginVertical: 4 }}>{currencyFormatter(lastCreatedVoucherAmount, taxBreakdown.currency)}</Text>
              
              <Text style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", fontWeight: "700", marginTop: 8 }}>{t("admin.pos.voucherCodeUpper", { defaultValue: "VOUCHER CODE" })}</Text>
              <Text style={{ fontSize: 16, color: "#ec4899", fontWeight: "800", letterSpacing: 0.5, marginTop: 2 }}>{lastCreatedVoucherCode}</Text>
            </View>

            <View style={{ borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 12, marginBottom: 16, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: "#71717a" }}>{t("admin.pos.validUntil", { defaultValue: "Valid until:" })}</Text>
              <Text style={{ fontSize: 12, color: "#111827", fontWeight: "600" }}>{lastCreatedVoucherExpires}</Text>
            </View>

            {/* Scannable QR-code block */}
            <View style={{ alignItems: "center", marginVertical: 16 }}>
              {lastCreatedVoucherCode ? (
                <QRCode
                  value={lastCreatedVoucherCode}
                  size={120}
                  backgroundColor="#fff"
                  color="#000"
                />
              ) : (
                <MaterialCommunityIcons name="barcode-scan" size={48} color="#374151" />
              )}
              <Text style={{ fontSize: 11, color: "#71717a", fontWeight: "700", marginTop: 10, letterSpacing: 1 }}>{lastCreatedVoucherCode}</Text>
            </View>

            <TouchableOpacity
              style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, alignItems: "center", justifyContent: "center", marginTop: 16 }}
              onPress={async () => {
                await triggerVoucherPrint(lastCreatedVoucherCode, lastCreatedVoucherAmount, lastCreatedVoucherType, lastCreatedVoucherExpires, undefined, lastCreatedVoucherVatRate);
                setShowReceiptPrintModal(false);
              }}
            >
              <Text style={{ color: "#111827", fontWeight: "700" }}>{t("admin.pos.printAndClose", { defaultValue: "Print & Close" })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  ghostButton: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  ghostButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
  exitPosButton: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  exitPosButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
  cartFab: {
    backgroundColor: "#fb923c",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  cartFabText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 13,
  },
  floatingCartButton: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#fb923c",
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingCartButtonText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 15,
  },
  pageSwitcher: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  pageSwitchButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  pageSwitchButtonActive: {
    backgroundColor: "#fb923c",
    borderColor: "#fb923c",
  },
  pageSwitchText: {
    color: "#374151",
    fontWeight: "700",
  },
  pageSwitchTextActive: {
    color: "#111827",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  catalogLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  catalogLoadingText: {
    marginTop: 12,
    color: "#f97316",
    fontSize: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#6b7280",
    marginTop: 4,
  },
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "700",
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  branchSelectButton: {
    minWidth: 240,
    maxWidth: 340,
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchSelectText: {
    flex: 1,
    color: "#111827",
    fontWeight: "700",
  },
  tableHeroColumn: {
    minWidth: 200,
    maxWidth: 300,
  },
  tableHeroButton: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tableHeroButtonText: {
    flex: 1,
    color: "#111827",
    fontWeight: "700",
  },
  cartTableChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cartTableChipText: {
    color: "#fb923c",
    fontWeight: "700",
    fontSize: 13,
  },
  modeSwitchRowCompact: {
    flexDirection: "row",
    gap: 8,
  },
  modePill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  modePillActive: {
    backgroundColor: "#fb923c",
    borderColor: "#fb923c",
  },
  modePillText: {
    color: "#374151",
    fontWeight: "700",
  },
  modePillTextActive: {
    color: "#111827",
  },
  sectionBlock: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  categoryCardRow: {
    gap: 12,
  },
  categoryShowAllCard: {
    width: 120,
    height: 140,
    borderRadius: 20,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  categoryShowAllCardActive: {
    backgroundColor: "#fb923c",
    borderColor: "#fb923c",
  },
  categoryShowAllText: {
    color: "#374151",
    fontWeight: "700",
  },
  categoryShowAllTextActive: {
    color: "#111827",
  },
  categoryVisualCard: {
    width: 180,
    height: 140,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  categoryVisualCardActive: {
    borderColor: "#fb923c",
    borderWidth: 2,
  },
  categoryVisualImage: {
    width: "100%",
    height: "100%",
  },
  categoryVisualOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  categoryVisualContent: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  categoryVisualTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  categoryVisualMeta: {
    color: "#e5e7eb",
    fontSize: 12,
  },
  searchInputContainer: {
    flex: 1,
    position: 'relative',
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 40,
    color: "#111827",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  clearButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  categoryList: {
    gap: 8,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
  },
  categoryChipActive: {
    backgroundColor: "#fb923c",
    borderColor: "#fb923c",
  },
  categoryChipText: {
    color: "#374151",
  },
  categoryChipTextActive: {
    color: "#111827",
  },
  mealsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  mealsCount: {
    color: "#6b7280",
    fontWeight: "600",
  },
  mealGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealCard: {
    width: "23%",
    minWidth: 140,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  mealCardUnavailable: {
    opacity: 0.72,
  },
  mealCardImage: {
    width: "100%",
    height: 100,
  },
  mealCardImagePlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mealCardImagePlaceholderText: {
    color: "#fb923c",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  mealCardImageUnavailable: {
    opacity: 0.55,
  },
  mealBasketBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 8,
    backgroundColor: "#fb923c",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  mealUnavailableBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(127, 29, 29, 0.92)",
    zIndex: 2,
  },
  mealUnavailableBadgeText: {
    color: "#fee2e2",
    fontWeight: "800",
    fontSize: 11,
  },
  mealBasketBadgeText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 12,
  },
  mealCardBody: {
    padding: 10,
    gap: 6,
    minHeight: 86,
    justifyContent: "space-between",
  },
  mealCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#fb923c",
    alignItems: "center",
    justifyContent: "center",
  },
  mealName: {
    color: "#111827",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    flex: 1,
    flexWrap: "wrap",
  },
  mealMeta: {
    color: "#6b7280",
    fontSize: 11,
  },
  mealPrice: {
    color: "#fb923c",
    fontWeight: "800",
  },
  mealCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: "auto",
  },
  mealCategoryChip: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
  },
  dealOfferBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    minWidth: undefined,
    width: "auto",
    height: undefined,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(139, 92, 246, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  dealOfferBadgeText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  cartPageCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cartPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cartSummaryText: {
    color: "#6b7280",
    marginTop: 4,
  },
  cartEditButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "#f9fafb",
  },
  branchMiniChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  branchMiniChipText: {
    color: "#111827",
    fontWeight: "700",
  },
  panelTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  inlineFieldRow: {
    flexDirection: "row",
    gap: 8,
  },
  choiceButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  choiceButtonActive: {
    backgroundColor: "#f97316",
    borderColor: "#f97316",
  },
  choiceButtonText: {
    color: "#374151",
    fontWeight: "700",
  },
  choiceButtonTextActive: {
    color: "#111827",
  },
  choiceButtonMeta: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  choiceButtonMetaActive: {
    color: "#7c2d12",
  },
  tableSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
  },
  tableSelectorText: {
    color: "#111827",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  cartList: {
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cartListContent: {
    padding: 12,
    gap: 10,
  },
  cartItemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cartItemName: {
    color: "#111827",
    fontWeight: "700",
  },
  cartItemMeta: {
    color: "#6b7280",
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
  },
  qtyValue: {
    color: "#111827",
    minWidth: 20,
    textAlign: "center",
    fontWeight: "700",
  },
  checkoutSummaryCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 18,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
  },
  totalLabel: {
    color: "#6b7280",
    fontWeight: "600",
  },
  totalValue: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 20,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  secondaryActionText: {
    color: "#111827",
    fontWeight: "700",
  },
  primaryAction: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#f97316",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#111827",
    fontWeight: "800",
  },
  label: {
    color: "#6b7280",
    fontWeight: "700",
  },
  emptyText: {
    color: "#6b7280",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "80%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  modalBackButton: {
    padding: 8,
    marginRight: 8,
  },
  doneButton: {
    backgroundColor: "#fb923c",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  doneButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 12,
  },
  modalRowTitle: {
    color: "#111827",
    fontWeight: "700",
  },
  modalRowMeta: {
    color: "#6b7280",
    marginTop: 2,
  },
  modalEmptyState: {
    paddingVertical: 24,
    alignItems: "center",
  },
  modalEmptyText: {
    color: "#6b7280",
    fontSize: 14,
  },
  floorPlanModalCard: {
    maxWidth: "98%",
    maxHeight: "98%",
    width: "98%",
    height: "98%",
    alignSelf: "center",
    padding: 8,
  },
  floorPlanContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "72%",
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  bottomSheetTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  bottomSheetBody: {
    paddingHorizontal: 12,
  },
  bottomSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionActive: {
    borderWidth: 1,
    borderColor: "#fb923c",
  },
  bottomSheetOptionText: {
    color: "#111827",
    fontWeight: "700",
  },
  bottomSheetOptionTextActive: {
    color: "#fb923c",
  },
  ticketModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  ticketModalCard: {
    width: "92%",
    maxWidth: 640,
    maxHeight: "88%",
    padding: 0,
    gap: 0,
    overflow: "hidden",
    flexDirection: "column",
  },
  mealCustomizationOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  mealCustomizationCard: {
    width: "92%",
    maxWidth: 860,
    height: "88%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 0,
    gap: 0,
    overflow: "hidden",
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  mealCustomizationScroll: {
    flex: 1,
  },
  mealCustomizationBody: {
    padding: 22,
    gap: 16,
    paddingBottom: 28,
  },
  mealCustomizationFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  modalEyebrow: {
    color: "#fb923c",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  ticketModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 16,
    paddingBottom: 8,
    gap: 12,
  },
  ticketModalSubtitle: {
    color: "#6b7280",
    marginTop: 4,
  },
  ticketModalBody: {
    gap: 12,
    padding: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  ticketFooterCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  customizationSummaryCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  customizationTotalValue: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  customizationSection: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  customizationSectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  customizationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  customizationRowActive: {
    backgroundColor: "rgba(251, 146, 60, 0.1)",
  },
  customizationName: {
    color: "#111827",
    fontWeight: "700",
  },
  customizationMeta: {
    color: "#6b7280",
    marginTop: 2,
  },
  booleanAddonToggle: {
    padding: 8,
  },
  optionalIngredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  summaryRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    color: "#6b7280",
  },
  summaryValue: {
    color: "#111827",
    fontWeight: "700",
  },
  taxInclusiveHint: {
    color: "#6b7280",
    fontSize: 12,
  },
  fiskalyWarningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(127, 29, 29, 0.35)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.4)",
    padding: 12,
  },
  fiskalyWarningText: {
    flex: 1,
    color: "#fecaca",
    fontSize: 12,
    lineHeight: 18,
  },
  disabledAction: {
    opacity: 0.5,
  },
  hiddenSection: {
    display: "none",
  },
  selectBranchPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    marginTop: 20,
  },
  selectBranchTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center",
  },
  selectBranchSubtitle: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    maxWidth: 400,
    paddingHorizontal: 20,
  },
  discountSection: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  discountSectionTitle: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 2,
  },
  discountInput: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  discountWarning: {
    color: "#f87171",
    fontSize: 12,
    marginTop: 2,
  },
  tabBarContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tabBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tabChipActive: {
    backgroundColor: "#fb923c",
    borderColor: "#fb923c",
  },
  tabChipLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: 120,
  },
  tabChipText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  tabChipTextActive: {
    color: "#111827",
  },
  tabChipBadge: {
    backgroundColor: "#e5e7eb",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabChipBadgeActive: {
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  tabChipBadgeText: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "700",
  },
  tabChipBadgeTextActive: {
    color: "#111827",
  },
  tabChipClose: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 2,
  },
  tabBarNewButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  discountBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  discountBadgeText: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "600",
  },
  surchargeBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  surchargeBadgeText: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "600",
  },
  cartAdjustButtonActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  // Offline voucher dialog styles
  offlineDialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  offlineDialogContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    width: "100%",
    maxWidth: 400,
  },
  offlineDialogHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  offlineDialogContent: {
    padding: 24,
    alignItems: "center",
    gap: 16,
  },
  offlineDialogTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  offlineDialogMessage: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  offlineDialogButton: {
    backgroundColor: "#ec4899",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    width: "100%",
  },
  offlineDialogButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  loadingMoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingMoreText: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "500",
  },
  loadMoreButton: {
    backgroundColor: "#fb923c",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 16,
    alignSelf: "center",
  },
  loadMoreButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
});
