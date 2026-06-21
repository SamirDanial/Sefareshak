import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import Icon from "@mdi/react";
import { mdiCalendar, mdiClock, mdiChevronDown, mdiChevronUp, mdiMapMarker, mdiStore, mdiHeart, mdiHeartOutline } from "@mdi/js";
import { Categories } from "@/components/home/Categories";
import { DealCategories } from "@/components/home/DealCategories";
import { Featured } from "@/components/home/Featured";
import { FreeVersionBranchInfo } from "@/components/FreeVersionBranchInfo";
import { useTranslation } from "react-i18next";
import branchService from "@/services/branchService";
import { toast } from "sonner";
import React, { useEffect, useRef, useState } from "react";
import {
  HeroSkeleton,
  CategoriesSkeleton,
  FeaturedSkeleton,
} from "@/components/ui/skeleton";
import { useCategories, useDealCategories, useMeals } from "@/hooks/useApi";
import { useBranch } from "@/contexts/BranchContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { heroSectionService } from "@/services/heroSectionService";
import type { HeroSection } from "@/services/heroSectionService";
import { ServingHoursService, type DeliveryHours, type ServingHoursStatus } from "@/services/servingHoursService";
import { reservationService, type ReservationSettings } from "@/services/reservationService";
import { Card, CardContent } from "@/components/ui/card";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { calculateDistance } from "@/utils/distanceCalculator";
import branchClickService from "@/services/branchClickService";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import AppStatusNotice from "@/components/AppStatusNotice";
import type { AppStatus } from "@/services/settingsService";
import { getEffectiveTimezone, getMealAvailabilityNow } from "@/utils/mealAvailability";
import { formatInTimeZone } from "date-fns-tz";

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId, getToken, isSignedIn } = useAuth();
  const { settings } = useSettings();

  const [heroSection, setHeroSection] = useState<HeroSection | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  const [servingHours, setServingHours] = useState<DeliveryHours | null>(null);
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [showFullWeek, setShowFullWeek] = useState(false);
  const [servingHoursLoading, setServingHoursLoading] = useState(true);
  const [reservationSettings, setReservationSettings] = useState<ReservationSettings | null>(null);
  const [reservationSettingsLoading, setReservationSettingsLoading] = useState(true);
  const [showReservationWeek, setShowReservationWeek] = useState(false);
  const {
    branch,
    branches,
    customerServiceType,
    customerServiceMode,
    customerLocation,
    customerOrganizationSlug,
    loadingBranches,
    visibleBranches,
    setBranch,
  } = useBranch();

  const [likedBranchIds, setLikedBranchIds] = useState<string[]>([]);
  const [isLikingInFlight, setIsLikingInFlight] = useState(false);

  const fetchLikedBranches = async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await branchService.getLikedBranches(token);
      if (res && res.success && Array.isArray(res.data)) {
        setLikedBranchIds(res.data.map((b: any) => b.id));
      }
    } catch (err) {
      console.error("Error fetching liked branches:", err);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchLikedBranches();
    } else {
      setLikedBranchIds([]);
    }
  }, [isSignedIn]);

  const isCurrentBranchLiked = React.useMemo(() => {
    return branch?.id ? likedBranchIds.includes(branch.id) : false;
  }, [branch?.id, likedBranchIds]);

  const handleToggleLike = async () => {
    if (!isSignedIn) {
      toast.error(t("home.like.loginRequiredMsg", { defaultValue: "Please sign in to favorite this branch!" }));
      navigate("/profile");
      return;
    }
    if (!branch?.id || isLikingInFlight) return;

    try {
      setIsLikingInFlight(true);
      const token = await getToken();
      if (!token) return;

      if (isCurrentBranchLiked) {
        await branchService.unlikeBranch(branch.id, token);
        setLikedBranchIds((prev) => prev.filter((id) => id !== branch.id));
        toast.success(t("home.like.unliked", { defaultValue: "Removed from favorites" }));
      } else {
        await branchService.likeBranch(branch.id, token);
        setLikedBranchIds((prev) => [...prev, branch.id]);
        toast.success(t("home.like.liked", { defaultValue: "Added to favorites" }));
      }
    } catch (err) {
      console.error("Error toggling like branch:", err);
      toast.error(t("home.like.error", { defaultValue: "Failed to update favorites" }));
    } finally {
      setIsLikingInFlight(false);
    }
  };

  const isOrgScoped = Boolean(customerOrganizationSlug);

  const selectedBranchFull = branch?.id ? branches.find((b) => b.id === branch.id) : null;
  const effectiveTimezone = React.useMemo(() => {
    return getEffectiveTimezone({
      branchTimezone: (selectedBranchFull as any)?.timezone ?? null,
      settingsTimezone: (settings as any)?.timezone ?? null,
    });
  }, [selectedBranchFull, settings]);

  const organizationAppStatus = String(
    (selectedBranchFull as any)?.organization?.settings?.appStatus || "LIVE"
  ).toUpperCase() as AppStatus;
  const isOrganizationUnavailable = Boolean(branch?.id) && organizationAppStatus !== "LIVE";
  const appStatus = (settings?.appStatus || "LIVE") as AppStatus;
  const isAppUnavailable = isOrganizationUnavailable || appStatus !== "LIVE";

  useEffect(() => {
    if (isOrgScoped) return;
    if (loadingBranches) return;
    if (branch?.id) return;

    const first = visibleBranches?.[0];
    if (first?.id) {
      setBranch({ id: first.id, name: (first as any)?.name ?? null, distanceKm: null }, "AUTO_DEFAULT");
    }
  }, [branch?.id, isOrgScoped, loadingBranches, setBranch, visibleBranches]);

  const normalizeServiceType = (raw: any) => {
    if (!raw) return null;
    const val = String(raw).trim().toUpperCase();
    if (val === "RESTAURANT") return "RESTAURANT" as const;
    if (val === "MEAT_SHOP" || val === "MEATSHOP" || val === "MEAT SHOP" || val === "MEAT-SHOP") {
      return "MEAT_SHOP" as const;
    }
    if (val === "BAKERY") return "BAKERY" as const;
    if (val === "FOOD_TRUCK" || val === "FOODTRUCK" || val === "FOOD TRUCK" || val === "FOOD-TRUCK") {
      return "FOOD_TRUCK" as const;
    }
    return null;
  };

  const effectiveServiceTypeOf = (b: any) => {
    const direct = normalizeServiceType(b?.serviceType);
    if (direct) return direct;
    const fromOrg = normalizeServiceType(b?.organization?.settings?.serviceType);
    return fromOrg || ("RESTAURANT" as const);
  };

  const serviceTypeLabelOf = (serviceType: any) => {
    if (serviceType === "MEAT_SHOP") return t("home.serviceTypes.meatShop", { defaultValue: "Meat Shop" });
    if (serviceType === "BAKERY") return t("home.serviceTypes.bakery", { defaultValue: "Bakery" });
    if (serviceType === "FOOD_TRUCK") return t("home.serviceTypes.foodTruck", { defaultValue: "Food Truck" });
    return t("home.serviceTypes.restaurant", { defaultValue: "Restaurant" });
  };

  const parseCoordinate = (coord: any): number | null => {
    if (coord === undefined || coord === null) return null;
    if (typeof coord === "number") return coord;
    if (typeof coord === "string") {
      const parsed = parseFloat(coord);
      return isNaN(parsed) ? null : parsed;
    }
    const parsed = parseFloat(String(coord));
    return isNaN(parsed) ? null : parsed;
  };

  const parsePositiveNumber = (val: any): number | null => {
    if (val === undefined || val === null) return null;
    const parsed = typeof val === "number" ? val : parseFloat(String(val));
    if (isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const resolveDeliveryEnabled = (b: any): boolean => {
    const branchVal = b?.deliveryEnabled;
    if (branchVal !== null && branchVal !== undefined) return Boolean(branchVal);
    const orgVal = b?.organization?.settings?.deliveryEnabled;
    if (orgVal !== null && orgVal !== undefined) return Boolean(orgVal);
    return true;
  };

  const resolvePickupEnabled = (b: any): boolean => {
    const branchVal = b?.pickupEnabled;
    if (branchVal !== null && branchVal !== undefined) return Boolean(branchVal);
    return true;
  };

  const canDeliverToLocation = (b: any): boolean => {
    if (!customerLocation) return false;
    if (!resolveDeliveryEnabled(b)) return false;

    const branchLat = parseCoordinate(b?.latitude);
    const branchLon = parseCoordinate(b?.longitude);

    const radiusKm =
      parsePositiveNumber(b?.deliveryRadius) ??
      parsePositiveNumber(b?.organization?.settings?.deliveryRadius) ??
      parsePositiveNumber(b?.initialDeliveryRange) ??
      parsePositiveNumber(b?.organization?.settings?.initialDeliveryRange);

    if (branchLat === null || branchLon === null) return false;
    if (radiusKm === null) return false;

    const dKm = calculateDistance(
      customerLocation.latitude,
      customerLocation.longitude,
      branchLat,
      branchLon
    );
    return dKm <= radiusKm;
  };

  const PICKUP_MAX_DISTANCE_KM = 50;

  const distanceKmOf = (b: any): number | null => {
    if (!customerLocation) return null;
    const branchLat = parseCoordinate(b?.latitude);
    const branchLon = parseCoordinate(b?.longitude);
    if (branchLat === null || branchLon === null) return null;
    return calculateDistance(customerLocation.latitude, customerLocation.longitude, branchLat, branchLon);
  };

  const [orgSelectedServiceType, setOrgSelectedServiceType] = useState<string | null>(null);

  const serviceTypeLabel =
    customerServiceType === "MEAT_SHOP"
      ? t("home.serviceTypes.meatShop", { defaultValue: "Meat Shop" })
      : customerServiceType === "BAKERY"
        ? t("home.serviceTypes.bakery", { defaultValue: "Bakery" })
        : customerServiceType === "FOOD_TRUCK"
          ? t("home.serviceTypes.foodTruck", { defaultValue: "Food Truck" })
          : t("home.serviceTypes.restaurant", { defaultValue: "Restaurant" });
  const {
    categories: allCategories,
    loading: categoriesLoading,
    error: categoriesError,
  } = useCategories(true, branch?.id); // Only fetch featured categories for home page, filtered by branch

  const {
    categories: allDealCategories,
    loading: dealCategoriesLoading,
    error: dealCategoriesError,
  } = useDealCategories(true, branch?.id);
  const { meals: allMeals, loading: mealsLoading } = useMeals({
    branchId: branch?.id,
  });

  const restoreDataRef = useRef<{
    y: number;
    x: Record<string, number>;
    anchorHref?: string;
    anchorViewportTop?: number;
    anchorId?: string;
    clickPageY?: number;
    clickClientY?: number;
  } | null>(null);
  const restoreAttemptRef = useRef(0);
  const restoreTimerRef = useRef<number | null>(null);
  const isRestoringRef = useRef(false);
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false);

  const escapeAttrValue = (value: string) => {
    const esc = (globalThis as any)?.CSS?.escape;
    if (typeof esc === "function") return esc(value);
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  };

  useEffect(() => {
    if (!isOrgScoped && (!customerServiceType || !customerLocation)) {
      navigate("/scope", { replace: true });
    }
  }, [customerLocation, customerServiceType, isOrgScoped, navigate]);

  const noBranchesForScope = !isOrgScoped && !loadingBranches && visibleBranches.length === 0;
  const noBranchesServiceLabel = customerServiceType
    ? serviceTypeLabelOf(String(customerServiceType).toUpperCase())
    : t("home.serviceTypes.restaurant", { defaultValue: "Restaurant" });
  const noBranchesModeLabel =
    customerServiceMode === "PICKUP"
      ? t("home.scope.modes.pickup", { defaultValue: "Pickup" })
      : customerServiceMode === "RESERVATION"
        ? t("home.scope.modes.reservation", { defaultValue: "Reservation" })
        : t("home.scope.modes.delivery", { defaultValue: "Delivery" });

  useEffect(() => {
    const storageKey = "bellami:homeScroll";
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const ts = typeof parsed?.ts === "number" ? parsed.ts : null;
      const savedPath = typeof parsed?.path === "string" ? parsed.path : null;
      const y = typeof parsed?.y === "number" ? parsed.y : 0;
      const x = parsed?.x && typeof parsed.x === "object" ? (parsed.x as Record<string, number>) : {};
      const anchorHref = typeof parsed?.anchorHref === "string" ? parsed.anchorHref : undefined;
      const anchorViewportTop =
        typeof parsed?.anchorViewportTop === "number" ? parsed.anchorViewportTop : undefined;
      const anchorId = typeof parsed?.anchorId === "string" ? parsed.anchorId : undefined;
      const clickPageY = typeof parsed?.clickPageY === "number" ? parsed.clickPageY : undefined;
      const clickClientY = typeof parsed?.clickClientY === "number" ? parsed.clickClientY : undefined;

      const isFresh = ts !== null ? Date.now() - ts < 2 * 60 * 1000 : false;
      const isHomePath = savedPath ? savedPath === window.location.pathname : true;
      if (!isFresh || !isHomePath) return;

      if (y > 0 || Object.keys(x).length > 0 || anchorHref || anchorId || typeof clickPageY === "number") {
        // Important: mark restoring immediately so StrictMode cleanup doesn't overwrite
        // the stored value with a clamped/initial scroll position before restore runs.
        isRestoringRef.current = true;
        restoreDataRef.current = {
          y,
          x,
          anchorHref,
          anchorViewportTop,
          anchorId,
          clickPageY,
          clickClientY,
        };
        restoreAttemptRef.current = 0;
        setShouldRestoreScroll(true);
      }
    } catch (e) {
    }
  }, []);

  useEffect(() => {
    const storageKey = "bellami:homeScroll";

    const writePayload = (payload: {
      y: number;
      x: Record<string, number>;
      path: string;
      anchorHref?: string;
      anchorViewportTop?: number;
      anchorId?: string;
      clickPageY?: number;
      clickClientY?: number;
    }) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...payload, ts: Date.now() }));
      } catch {
        // ignore
      }
    };

    const saveAll = () => {
      if (isRestoringRef.current) return;
      const x: Record<string, number> = {};
      document.querySelectorAll<HTMLElement>("[data-home-scroll]").forEach((el) => {
        const key = el.getAttribute("data-home-scroll");
        if (key) x[key] = el.scrollLeft;
      });
      // Anchor data: try to capture the clicked Link (<a>) so we can restore by element
      // instead of raw scrollY, which can shift when async content changes height.
      let anchorHref: string | undefined;
      let anchorViewportTop: number | undefined;
      try {
        const active = document.activeElement as HTMLElement | null;
        const anchor = active?.closest?.("a[href]") as HTMLAnchorElement | null;
        const href = anchor?.getAttribute("href") || "";
        if (href) {
          anchorHref = href;
          anchorViewportTop = anchor?.getBoundingClientRect().top;
        }
      } catch {
        // ignore
      }

      writePayload({ y: window.scrollY, x, path: window.location.pathname, anchorHref, anchorViewportTop });
    };

    const onAnyClickCapture = (e: MouseEvent) => {
      if (isRestoringRef.current) return;
      try {
        const target = e.target as HTMLElement | null;
        
        // Ignore clicks inside branch switcher to prevent scroll jump on branch selection
        if (target?.closest?.("[data-branch-switcher]")) {
          return;
        }
        
        const anchorEl = target?.closest?.("[data-home-anchor]") as HTMLElement | null;
        const anchorId = anchorEl?.getAttribute?.("data-home-anchor") || undefined;
        const anchorViewportTop = anchorEl ? anchorEl.getBoundingClientRect().top : undefined;

        const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
        const href = anchor?.getAttribute("href") || "";
        const x: Record<string, number> = {};
        document.querySelectorAll<HTMLElement>("[data-home-scroll]").forEach((el) => {
          const key = el.getAttribute("data-home-scroll");
          if (key) x[key] = el.scrollLeft;
        });

        const anchorHref = href || undefined;
        const clickPageY = typeof e.pageY === "number" ? e.pageY : undefined;
        const clickClientY = typeof e.clientY === "number" ? e.clientY : undefined;

        writePayload({
          y: window.scrollY,
          x,
          path: window.location.pathname,
          anchorHref,
          anchorViewportTop,
          anchorId,
          clickPageY,
          clickClientY,
        });
      } catch {
        saveAll();
      }
    };

    document.addEventListener("click", onAnyClickCapture, true);

    return () => {
      document.removeEventListener("click", onAnyClickCapture, true);
    };
  }, []);

  useEffect(() => {
    if (!shouldRestoreScroll) return;

    const restoreData = restoreDataRef.current;
    if (!restoreData) return;

    isRestoringRef.current = true;

    const start = Date.now();
    const maxMs = 8000;

    const cancelRestore = () => {
      setShouldRestoreScroll(false);
      restoreDataRef.current = null;
      restoreAttemptRef.current = 0;
      isRestoringRef.current = false;
      if (restoreTimerRef.current) {
        window.clearInterval(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onUserIntent, { capture: true } as any);
      window.removeEventListener("touchmove", onUserIntent, { capture: true } as any);
      window.removeEventListener("keydown", onUserIntent, { capture: true } as any);
    };

    const onUserIntent = () => {
      if (!isRestoringRef.current) return;
      cancelRestore();
    };

    const apply = () => {
      const { y, x, anchorHref, anchorViewportTop, anchorId, clickPageY, clickClientY } = restoreData;

      document.querySelectorAll<HTMLElement>("[data-home-scroll]").forEach((el) => {
        const key = el.getAttribute("data-home-scroll");
        if (!key) return;
        const left = x[key];
        if (typeof left === "number") {
          el.scrollLeft = left;
        }
      });

      // Prefer anchor-based restore if we have it; fallback to raw y.
      let targetY = y;
      let anchorFound = false;

      // 1) Most reliable: restore by stable element id.
      if (anchorId && typeof anchorViewportTop === "number") {
        const selector = `[data-home-anchor="${escapeAttrValue(anchorId)}"]`;
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          anchorFound = true;
          const pageTop = el.getBoundingClientRect().top + window.scrollY;
          targetY = pageTop - anchorViewportTop;
        }
      } else if (anchorHref && typeof anchorViewportTop === "number") {
        // 2) Next best: restore by link href (if stable)
        const selector = `a[href="${escapeAttrValue(anchorHref)}"]`;
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          anchorFound = true;
          const pageTop = el.getBoundingClientRect().top + window.scrollY;
          targetY = pageTop - anchorViewportTop;
        }
      } else if (typeof clickPageY === "number" && typeof clickClientY === "number") {
        // 3) Last resort: restore by click coordinates.
        targetY = clickPageY - clickClientY;
      }

      window.scrollTo(0, targetY);

      const currentY = window.scrollY;
      let closeEnough = Math.abs(currentY - targetY) <= 4;

      // If we have anchorId but element wasn't found yet, DON'T declare closeEnough - keep retrying
      if (anchorId && typeof anchorViewportTop === "number") {
        if (!anchorFound) {
          // Element not in DOM yet, keep retrying
          closeEnough = false;
        } else {
          // Element found, check if it's at correct viewport position
          const selector = `[data-home-anchor="${escapeAttrValue(anchorId)}"]`;
          const el = document.querySelector(selector) as HTMLElement | null;
          if (el) {
            const top = el.getBoundingClientRect().top;
            closeEnough = closeEnough && Math.abs(top - anchorViewportTop) <= 6;
          }
        }
      } else if (anchorHref && typeof anchorViewportTop === "number" && !(typeof clickPageY === "number")) {
        if (!anchorFound) {
          closeEnough = false;
        } else {
          const selector = `a[href="${escapeAttrValue(anchorHref)}"]`;
          const el = document.querySelector(selector) as HTMLElement | null;
          if (el) {
            const top = el.getBoundingClientRect().top;
            closeEnough = closeEnough && Math.abs(top - anchorViewportTop) <= 6;
          }
        }
      }
      const elapsed = Date.now() - start;


      if (closeEnough || elapsed >= maxMs) {
        setShouldRestoreScroll(false);
        restoreDataRef.current = null;
        restoreAttemptRef.current = 0;
        isRestoringRef.current = false;
        if (restoreTimerRef.current) {
          window.clearInterval(restoreTimerRef.current);
          restoreTimerRef.current = null;
        }
        window.removeEventListener("resize", onResize);
        return;
      }
    };

    const onResize = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(apply);
      });
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onUserIntent, { capture: true, passive: true });
    window.addEventListener("touchmove", onUserIntent, { capture: true, passive: true });
    window.addEventListener("keydown", onUserIntent, { capture: true });

    // Keep retrying while the page grows (images/async sections)
    restoreTimerRef.current = window.setInterval(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(apply);
      });
    }, 200);

    requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onUserIntent, { capture: true } as any);
      window.removeEventListener("touchmove", onUserIntent, { capture: true } as any);
      window.removeEventListener("keydown", onUserIntent, { capture: true } as any);
      isRestoringRef.current = false;
      if (restoreTimerRef.current) {
        window.clearInterval(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
    };
  }, [
    shouldRestoreScroll,
    categoriesLoading,
    mealsLoading,
    heroLoading,
    servingHoursLoading,
    reservationSettingsLoading,
  ]);

  // Filter categories based on selected branch
  // Note: Deal categories are already excluded by the backend API
  const categories = React.useMemo(() => {
    if (!branch?.id) return allCategories;
    return allCategories.filter((category) => {
      const excludedBranches = (category as any).excludedBranches || [];
      return !excludedBranches.includes(branch.id);
    });
  }, [allCategories, branch?.id]);

  // Filter meals based on selected branch
  // Exclude meal if:
  // 1. Branch is in meal.excludedBranches, OR
  // 2. Branch is in meal.category.excludedBranches
  const meals = React.useMemo(() => {
    if (!branch?.id) return allMeals;
    return allMeals.filter((meal) => {
      // Check if meal is excluded
      const mealExcludedBranches = (meal as any).excludedBranches || [];
      if (mealExcludedBranches.includes(branch.id)) {
        return false;
      }
      // Check if category is excluded (if category is excluded, all meals in it are excluded)
      const categoryExcludedBranches = (meal.category as any)?.excludedBranches || [];
      if (categoryExcludedBranches.includes(branch.id)) {
        return false;
      }
      return true;
    });
  }, [allMeals, branch?.id]);

  // Fetch hero section
  useEffect(() => {
    const fetchHeroSection = async () => {
      try {
        setHeroLoading(true);
        const selectedBranch = branch?.id
          ? branches.find((b) => b.id === branch.id)
          : null;
        const organizationId = selectedBranch?.organizationId ?? selectedBranch?.organization?.id ?? null;

        let orgHero: HeroSection | null = null;
        if (organizationId) {
          try {
            orgHero = await heroSectionService.getActiveHeroSection(organizationId);
          } catch {
            orgHero = null;
          }
        }

        if (orgHero) {
          setHeroSection(orgHero);
          return;
        }

        let appHero: HeroSection | null = null;
        try {
          appHero = await heroSectionService.getActiveHeroSection(null);
        } catch {
          appHero = null;
        }
        setHeroSection(appHero);
      } catch (error) {
        console.error("Error fetching hero section:", error);
        // If hero section fetch fails, use fallback (existing translations)
        setHeroSection(null);
      } finally {
        setHeroLoading(false);
      }
    };

    fetchHeroSection();
  }, [branch?.id, branches]);


  // Fetch serving hours from selected branch
  useEffect(() => {
    const fetchServingHours = async () => {
      try {
        setServingHoursLoading(true);
        const response = await ServingHoursService.getServingHours(branch?.id);
        setServingHours(response.data.hours);
        setServingHoursStatus(response.data.currentStatus);
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      } finally {
        setServingHoursLoading(false);
      }
    };

    fetchServingHours();
  }, [branch?.id]);

  // Fetch reservation settings from selected branch (or global if no branch selected)
  useEffect(() => {
    const fetchReservationSettings = async () => {
      try {
        setReservationSettingsLoading(true);
        // Pass branchId to get branch-specific settings (merged with global)
        const settings = await reservationService.getSettings(undefined, branch?.id);
        if (settings && (settings as any).isEnabled === true) {
          setReservationSettings(settings);
        } else {
          setReservationSettings(null);
        }
      } catch (error) {
        console.error("Error fetching reservation settings:", error);
        setReservationSettings(null);
      } finally {
        setReservationSettingsLoading(false);
      }
    };

    fetchReservationSettings();
  }, [branch?.id]);

  const formatTimeEu = (time: string | undefined): string => {
    if (!time) return "";
    const trimmed = time.trim();
    const m12 = trimmed.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i);
    if (m12) {
      const rawH = Number(m12[1]);
      const rawM = Number(m12[2] ?? "0");
      const period = m12[3].toUpperCase();
      if (Number.isFinite(rawH) && Number.isFinite(rawM)) {
        let h = rawH % 12;
        if (period === "PM") h += 12;
        return `${h.toString().padStart(2, "0")}:${rawM.toString().padStart(2, "0")}`;
      }
      return trimmed;
    }

    const m24 = trimmed.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (m24) {
      const h = Number(m24[1]);
      const m = Number(m24[2]);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      }
    }

    return trimmed;
  };

  const renderServingHours = (dayHours: { isOff: boolean; open?: string; close?: string; periods?: Array<{ open: string; close: string }> }): React.ReactNode => {
    if (dayHours.isOff) {
      return <span className="text-inherit">{t("home.servingHours.closed")}</span>;
    }
    
    // Use periods if available - render vertically
    if (dayHours.periods && Array.isArray(dayHours.periods) && dayHours.periods.length > 0) {
      return (
        <div className="flex flex-col gap-1.5">
          {dayHours.periods.map((p, index) => (
            <span key={index} className="block text-inherit leading-tight">
              {formatTimeEu(p.open)} - {formatTimeEu(p.close)}
            </span>
          ))}
        </div>
      );
    }
    
    // Fallback to single open/close
    if (!dayHours.open || !dayHours.close) {
      return <span className="text-inherit">{t("home.servingHours.open24h")}</span>;
    }
    return <span className="text-inherit">{formatTimeEu(dayHours.open)} - {formatTimeEu(dayHours.close)}</span>;
  };

  const getZonedDayIndex0 = (tz: string): number => {
    // ISO: 1..7 (Mon..Sun)
    const iso = Number(formatInTimeZone(new Date(), tz, "i"));
    // Convert to JS: 0..6 (Sun..Sat)
    return iso === 7 ? 0 : iso;
  };

  const getDayName = (dayIndex: number): keyof DeliveryHours => {
    const days: (keyof DeliveryHours)[] = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[dayIndex];
  };

  const getTodayHours = () => {
    if (!servingHours) return null;
    const dayIndex = getZonedDayIndex0(effectiveTimezone);
    const dayName = getDayName(dayIndex);
    return servingHours[dayName];
  };

  const getServingHoursMessage = (status: ServingHoursStatus): string => {
    if (status.isOff) {
      if (status.nextOpenDay && status.nextOpenTimeString) {
        return t("home.servingHours.closedTodayNextDay", {
          day: status.nextOpenDay,
          time: status.nextOpenTimeString,
        });
      }
      return t("home.servingHours.closedToday");
    }

    if (status.hoursUntilOpen !== undefined && status.minutesUntilOpen !== undefined) {
      const parts: string[] = [];
      
      if (status.hoursUntilOpen > 0) {
        const hourText = status.hoursUntilOpen === 1 
          ? t("home.servingHours.hour", { count: 1 })
          : t("home.servingHours.hours", { count: status.hoursUntilOpen });
        parts.push(`${status.hoursUntilOpen} ${hourText}`);
      }
      
      if (status.minutesUntilOpen > 0) {
        const minuteText = status.minutesUntilOpen === 1
          ? t("home.servingHours.minute", { count: 1 })
          : t("home.servingHours.minutes", { count: status.minutesUntilOpen });
        parts.push(`${status.minutesUntilOpen} ${minuteText}`);
      }

      let message = t("home.servingHours.currentlyClosed");
      if (parts.length > 0) {
        message += " " + t("home.servingHours.willOpenIn", {
          time: parts.join(" " + t("home.servingHours.and") + " "),
        });
      } else if (status.minutesUntilOpen === 0) {
        message += " " + t("home.servingHours.willOpenSoon");
      }

      if (status.nextOpenTimeString) {
        message += " " + t("home.servingHours.orderWillBeServed", {
          time: status.nextOpenTimeString,
        });
      }

      return message;
    }

    return status.message || t("home.servingHours.closed");
  };

  // Transform meals for featured section (only featured meals)
  const FALLBACK_IMG = "https://placehold.co/800x800?text=Food";

  const featured = meals
    .filter((meal) => meal.isFeatured)
    .sort((a, b) => {
      const orderA =
        typeof a.featuredOrder === "number" && a.featuredOrder > 0
          ? a.featuredOrder
          : Number.MAX_SAFE_INTEGER;
      const orderB =
        typeof b.featuredOrder === "number" && b.featuredOrder > 0
          ? b.featuredOrder
          : Number.MAX_SAFE_INTEGER;
      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    })
    .map((meal) => {
      const availability = getMealAvailabilityNow({
        meal,
        branchId: branch?.id,
        tz: effectiveTimezone,
      });

      return {
        id: meal.id,
        name: meal.name,
        price: meal.effectiveBasePrice ?? parseFloat(meal.basePrice),
        compareAt: (meal.effectiveBasePrice ?? parseFloat(meal.basePrice)) * 1.2, // 20% markup for comparison
        img: meal.image
          ? isExternalImage(meal.image)
            ? meal.image
            : getOptimizedImageUrl(meal.image)
          : FALLBACK_IMG,
        isAvailableNow: availability.isAvailableNow,
      };
    });
  // Helper function to get image URL
  function getHeroImageUrl(image: string | null | undefined): string {
    if (!image) {
      // Fallback to default image if no hero section image
      return "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIws61_264w_QkhPKA3zfYWvd5iI7pEdLnLw&s";
    }
    if (image.startsWith("http://") || image.startsWith("https://")) {
      return image;
    }
    return getOptimizedImageUrl(image);
  }

  const placeholderImageForBranch = (name: string | null | undefined) => {
    const label = (name || "Branch").trim() || "Branch";
    const letter = label[0]?.toUpperCase() || "B";
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ec4899"/>
      <stop offset="50%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" rx="36" fill="url(#g)"/>
  <circle cx="660" cy="110" r="120" fill="rgba(255,255,255,0.12)"/>
  <circle cx="150" cy="340" r="160" fill="rgba(0,0,0,0.14)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto" font-size="170" font-weight="800" fill="rgba(255,255,255,0.92)">${letter}</text>
</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const branchImageUrl = (b: any): string => {
    const raw = (b as any)?.branchImage;
    if (typeof raw === "string" && raw.trim()) {
      return getOptimizedImageUrl(raw.trim(), "medium");
    }
    return placeholderImageForBranch((b as any)?.name);
  };

  const orgServiceTypes = React.useMemo(() => {
    if (!isOrgScoped) return [] as string[];
    const set = new Set<string>();
    for (const b of branches || []) {
      const st = effectiveServiceTypeOf(b as any);
      if (st) set.add(st);
    }
    return Array.from(set);
  }, [branches, isOrgScoped]);

  const showServiceTypeFilters = isOrgScoped && orgServiceTypes.length > 1;

  const orgBranches = React.useMemo(() => {
    if (!isOrgScoped) return [] as any[];

    const enriched = (branches || []).map((b) => {
      const dKm = distanceKmOf(b);
      return {
        branch: b,
        serviceType: effectiveServiceTypeOf(b),
        distanceKm: dKm,
        deliveryEnabled: resolveDeliveryEnabled(b),
        pickupEnabled: resolvePickupEnabled(b),
        canDeliverHere: customerLocation ? canDeliverToLocation(b) : false,
      };
    });

    const filtered = enriched.filter((x) => {
      // In org directory mode, include branches that are usable for the customer:
      // - Deliverable to the current location, OR
      // - Pickup enabled and within a reasonable drive distance.
      // This prevents hiding pickup-only branches just because delivery isn't available.
      if (customerLocation) {
        const dOkForPickup =
          typeof x.distanceKm === "number" && !isNaN(x.distanceKm)
            ? x.distanceKm <= PICKUP_MAX_DISTANCE_KM
            : false;
        const usable = x.canDeliverHere || (x.pickupEnabled && dOkForPickup);
        if (!usable) return false;
      }

      if (showServiceTypeFilters && orgSelectedServiceType && x.serviceType !== orgSelectedServiceType) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) {
        return String(a.branch?.name || "").localeCompare(String(b.branch?.name || ""));
      }
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return filtered;
  }, [branches, canDeliverToLocation, customerLocation, isOrgScoped, orgSelectedServiceType, showServiceTypeFilters]);

  return (
    <section className="space-y-6">
      {/* Hero / Promo */}
      {heroLoading ? (
        <HeroSkeleton />
      ) : (
        <div
          className="relative overflow-hidden rounded-2xl shadow-lg"
          style={{
            backgroundImage: heroSection?.backgroundImage
              ? `url('${getHeroImageUrl(heroSection.backgroundImage)}')`
              : `url('${getHeroImageUrl(null)}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
          <div className="relative p-5 sm:p-6">
            {branch?.id && (
              <button
                type="button"
                onClick={handleToggleLike}
                disabled={isLikingInFlight}
                className="absolute top-5 right-5 p-2 rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 hover:scale-105 active:scale-95 transition-all z-10 border border-white/10"
              >
                <Icon
                  path={isCurrentBranchLiked ? mdiHeart : mdiHeartOutline}
                  size={0.9}
                  className={isCurrentBranchLiked ? "text-rose-500 fill-rose-500" : "text-white"}
                />
              </button>
            )}
            <div className="max-w-xs">
              {(heroSection?.badgeText || !heroSection) && (
                <div className="inline-flex items-center rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur">
                  {heroSection?.badgeText || t("home.hero.badge")}
                </div>
              )}
              <h1 className="mt-3 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                {heroSection?.title || t("home.hero.title")}
              </h1>
              {(heroSection?.subtitle || !heroSection) && (
                <p className="mt-2 text-sm text-white/90">
                  {heroSection?.subtitle || t("home.hero.subtitle")}
                </p>
              )}
            </div>
            {noBranchesForScope ? null : (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex gap-2 flex-wrap">
                  {(heroSection?.primaryButtonText || !heroSection) && (
                    <Link to="/menu">
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 focus-visible:ring-2 focus-visible:ring-rose-400"
                        disabled={isAppUnavailable}
                      >
                        {heroSection?.primaryButtonText || t("home.hero.orderNow")}
                      </Button>
                    </Link>
                  )}
                  {(heroSection?.secondaryButtonText || !heroSection) && (
                    isAppUnavailable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        className="border-rose-300/70 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        {heroSection?.secondaryButtonText || t("home.hero.viewMenu")}
                      </Button>
                    ) : (
                      <Link to="/menu">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300/70 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          {heroSection?.secondaryButtonText || t("home.hero.viewMenu")}
                        </Button>
                      </Link>
                    )
                  )}
                </div>

                {customerServiceMode === "RESERVATION" && !isAppUnavailable ? (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-300/70 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-rose-400"
                      onClick={() => navigate("/reservations/book")}
                    >
                      <Icon path={mdiCalendar} size={0.5} className="mr-1" />
                      {t("home.hero.bookReservation", { defaultValue: "Book Reservation" })}
                    </Button>
                  </div>
                ) : null}

              </div>
            )}
          </div>
        </div>
      )}

      {/* Testing Mode Warning Banner */}
      <Card className="bg-amber-500/10 border-amber-500/30 border-2">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="text-amber-500 text-xl">⚠️</div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-200 mb-1">
                {t("home.testingMode.title", { defaultValue: "Testing Mode Active" })}
              </h3>
              <p className="text-sm text-amber-100/80 leading-relaxed">
                {t("home.testingMode.message", {
                  defaultValue: "Please note: Despite payments being processed through real Stripe, this platform is currently in testing mode. Orders placed during this period will not be considered or fulfilled. We kindly ask you to refrain from placing test orders."
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {noBranchesForScope ? (
        <Card className="bg-[#171717] border-[#262626]">
          <CardContent className="p-5">
            <div className="flex flex-col gap-2">
              <div className="text-white text-lg font-semibold">
                {t("home.noBranchesForScope.title", { defaultValue: "No branches available" })}
              </div>
              <div className="text-sm text-gray-400">
                {t("home.noBranchesForScope.subtitle", {
                  defaultValue:
                    "We couldn't find any branches that match your current scope ({{service}} • {{mode}}). Try changing your service, order method, or location.",
                  service: noBranchesServiceLabel,
                  mode: noBranchesModeLabel,
                })}
              </div>

              <div className="mt-2">
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto py-3 rounded-xl border-emerald-400/50 bg-emerald-500/10 text-emerald-200 shadow-sm hover:bg-emerald-500/15 hover:border-emerald-300/70 focus-visible:ring-2 focus-visible:ring-emerald-300"
                  onClick={() => navigate("/scope")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon path={mdiMapMarker} size={0.75} className="text-emerald-300" />
                    <div className="font-semibold leading-tight">
                      {t("home.changeServiceOrAddress", { defaultValue: "Change service / address" })}
                    </div>
                  </div>
                  <div className="shrink-0 text-emerald-300 font-semibold">Edit</div>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {noBranchesForScope ? null : (
        <>
      {/* Organization Branch Directory */}
      {isOrgScoped ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                {t("home.organizationBranches", { defaultValue: "Branches" })}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {customerLocation
                  ? t("home.sortedByNearest", { defaultValue: "Sorted by nearest" })
                  : t("home.enableLocationToSort", { defaultValue: "Set your location to sort by nearest" })}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-xl"
              onClick={() => navigate("/scope")}
            >
              {t("home.setLocation", { defaultValue: "Set location" })}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {showServiceTypeFilters ? (
              <>
                <Button
                  size="sm"
                  variant={orgSelectedServiceType === null ? "default" : "outline"}
                  className="rounded-full h-8 px-3"
                  onClick={() => setOrgSelectedServiceType(null)}
                >
                  {t("home.filters.all", { defaultValue: "All" })}
                </Button>
                {orgServiceTypes.map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={orgSelectedServiceType === st ? "default" : "outline"}
                    className="rounded-full h-8 px-3"
                    onClick={() => setOrgSelectedServiceType(st)}
                  >
                    {serviceTypeLabelOf(st)}
                  </Button>
                ))}
              </>
            ) : null}

            {orgSelectedServiceType !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 px-3 text-gray-300"
                onClick={() => {
                  setOrgSelectedServiceType(null);
                }}
              >
                {t("home.filters.clear", { defaultValue: "Clear" })}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {orgBranches.length === 0 ? (
              <div className="text-sm text-gray-400">
                {t("home.noBranches", { defaultValue: "No branches found." })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {orgBranches.map((x) => {
                  const b: any = x.branch;
                  const isSelected = branch?.id && b?.id === branch.id;
                  const distanceText =
                    typeof x.distanceKm === "number" && !isNaN(x.distanceKm)
                      ? `${x.distanceKm.toFixed(x.distanceKm < 10 ? 1 : 0)} km`
                      : null;

                  return (
                    <button
                      key={b?.id}
                      type="button"
                      className={`w-full rounded-2xl border text-left transition overflow-hidden ${
                        isSelected
                          ? "border-pink-500/70 ring-1 ring-pink-500/30 bg-[#171717]"
                          : "bg-[#171717] border-[#2a2a2a] hover:bg-[#1f1f1f]"
                      }`}
                      onClick={() => {
                        if (!b?.id) return;
                        
                        // Only record click if selecting a different branch
                        if (branch?.id !== b.id) {
                          // Record branch click (non-blocking)
                          branchClickService.recordBranchClick(b.id, userId).catch(() => {
                            // Silently ignore errors - click tracking shouldn't block user experience
                          });
                        }
                        
                        setBranch({ id: b.id, name: b.name || null, distanceKm: x.distanceKm ?? null }, "MANUAL");
                      }}
                    >
                      <div className="relative w-full h-[110px]">
                        <img
                          src={branchImageUrl(b)}
                          alt={b?.name || "Branch"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            try {
                              (e.currentTarget as any).src = placeholderImageForBranch(b?.name);
                            } catch {
                              // ignore
                            }
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                        {distanceText ? (
                          <div className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-1 rounded-full bg-white/10 text-white border border-white/10">
                            {distanceText}
                          </div>
                        ) : null}
                      </div>

                      <div className="p-3">
                        <div className="text-white font-semibold leading-tight truncate">
                          {b?.name || t("home.branch", { defaultValue: "Branch" })}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {[b?.city, b?.state, b?.country].filter(Boolean).join(", ") || serviceTypeLabelOf(x.serviceType)}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {x.deliveryEnabled ? (
                            <div className="rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-300">
                              {t("home.filters.delivery", { defaultValue: "Delivery" })}
                            </div>
                          ) : null}
                          {x.pickupEnabled ? (
                            <div className="rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-300">
                              {t("home.filters.pickup", { defaultValue: "Pickup" })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Branch Switcher and Find Branch */}
      {isOrgScoped ? null : (
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full justify-between h-auto py-3 rounded-xl border-emerald-400/50 bg-emerald-500/10 text-emerald-200 shadow-sm hover:bg-emerald-500/15 hover:border-emerald-300/70 focus-visible:ring-2 focus-visible:ring-emerald-300"
            onClick={() => navigate("/scope")}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 mt-0.5">
                <Icon path={mdiMapMarker} size={0.75} className="text-emerald-300" />
              </div>
              <div className="min-w-0 text-left">
                <div className="font-semibold leading-tight">
                  {t("home.changeServiceOrAddress", { defaultValue: "Change service / address" })}
                </div>
                <div className="text-xs text-emerald-100/80 truncate">
                  {[
                    customerServiceType ? String(customerServiceType).replace(/_/g, " ") : null,
                    customerLocation?.label ||
                      (customerLocation
                        ? `${customerLocation.latitude.toFixed(3)}, ${customerLocation.longitude.toFixed(3)}`
                        : null),
                  ]
                    .filter(Boolean)
                    .join(" • ") ||
                    t("home.scopeHint", { defaultValue: "Set your service and delivery location" })}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-emerald-300 font-semibold">Edit</div>
          </Button>

          <div className="flex items-center gap-2">
            <Icon path={mdiStore} size={0.67} className="text-pink-500" />
            <div className="text-sm font-semibold text-white">
              {t("home.chooseBranchWithServiceType", {
                defaultValue: "Choose a {{serviceType}} branch",
                serviceType: serviceTypeLabel,
              })}
            </div>
          </div>

          <div className="w-full">
            <BranchSwitcher variant="carousel" showCarouselHeader={false} />
          </div>
        </div>
      )}

      {/* Serving Hours Section */}
      {!isAppUnavailable && !servingHoursLoading && servingHours && servingHoursStatus && !(() => {
        const fullBranch = branches.find(b => b.id === branch?.id);
        return fullBranch?.organization?.freeVersion;
      })() && (
        <Card className="bg-[#171717] border-[#262626]">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon path={mdiClock} size={0.83} className="text-pink-500" />
                  <h3 className="font-semibold text-lg text-white">
                    {t("home.servingHours.title")}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullWeek(!showFullWeek)}
                  className="text-pink-500 hover:text-pink-400 hover:bg-transparent"
                >
                  {showFullWeek ? (
                    <>
                      <Icon path={mdiChevronUp} size={0.67} className="mr-1" />
                      {t("home.servingHours.hideWeek")}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiChevronDown} size={0.67} className="mr-1" />
                      {t("home.servingHours.showWeek")}
                    </>
                  )}
                </Button>
              </div>

              {/* Today's Hours */}
              {getTodayHours() && (
                (() => {
                  const isOpen = Boolean(servingHoursStatus?.isOpen);
                  return (
                    <div className={`flex items-center justify-between p-3 rounded-lg ${isOpen ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-400 mb-1">
                      {t("home.servingHours.today")}
                    </p>
                    <div className={`text-lg font-bold ${isOpen ? "text-green-500" : "text-red-500"}`}>
                      {renderServingHours(getTodayHours()!)}
                    </div>
                    {!isOpen && (
                      <p className="text-xs text-gray-400 mt-1">
                        {getServingHoursMessage(servingHoursStatus)}
                      </p>
                    )}
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${isOpen ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                    {isOpen ? t("home.servingHours.open") : t("home.servingHours.closed")}
                  </div>
                    </div>
                  );
                })()
              )}

              {/* Full Week Hours */}
              {showFullWeek && (
                <div className="space-y-2 mt-3">
                  {[
                    { key: "monday", label: t("home.servingHours.monday") },
                    { key: "tuesday", label: t("home.servingHours.tuesday") },
                    { key: "wednesday", label: t("home.servingHours.wednesday") },
                    { key: "thursday", label: t("home.servingHours.thursday") },
                    { key: "friday", label: t("home.servingHours.friday") },
                    { key: "saturday", label: t("home.servingHours.saturday") },
                    { key: "sunday", label: t("home.servingHours.sunday") },
                  ].map((day) => {
                    const dayHours = servingHours[day.key as keyof DeliveryHours];
                    const isToday = getDayName(getZonedDayIndex0(effectiveTimezone)) === day.key;
                    return (
                      <div
                        key={day.key}
                        className={`flex items-start justify-between p-2 rounded-md min-h-[44px] ${isToday ? "bg-pink-500/10" : ""}`}
                      >
                        <span className={`font-medium flex-1 mr-3 ${isToday ? "text-pink-500 font-semibold" : "text-gray-300"}`}>
                          {day.label}
                        </span>
                        <div className={`text-sm text-right flex-1 max-w-[60%] ${isToday ? "text-pink-500 font-semibold" : "text-gray-400"}`}>
                          {renderServingHours(dayHours)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reservation Hours Section */}
      {!isAppUnavailable && !reservationSettingsLoading && reservationSettings && reservationSettings.isEnabled && !(() => {
        const fullBranch = branches.find(b => b.id === branch?.id);
        return fullBranch?.organization?.freeVersion;
      })() && (
        <Card className="bg-[#171717] border-[#262626]">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon path={mdiCalendar} size={0.83} className="text-pink-500" />
                  <h3 className="font-semibold text-lg text-white">
                    {t("home.reservationHours.title") || "Reservation Hours"}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReservationWeek(!showReservationWeek)}
                  className="text-pink-500 hover:text-pink-400 hover:bg-transparent"
                >
                  {showReservationWeek ? (
                    <>
                      <Icon path={mdiChevronUp} size={0.67} className="mr-1" />
                      {t("home.reservationHours.hideWeek") || "Hide Week"}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiChevronDown} size={0.67} className="mr-1" />
                      {t("home.reservationHours.showWeek") || "Show Week"}
                    </>
                  )}
                </Button>
              </div>

              {/* Today's Reservation Hours */}
              {(() => {
                const dayIndex = getZonedDayIndex0(effectiveTimezone);
                const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                const dayName = dayNames[dayIndex];
                const openKey = `${dayName}Open` as keyof ReservationSettings;
                const closeKey = `${dayName}Close` as keyof ReservationSettings;
                const openTime = reservationSettings[openKey] as string | undefined;
                const closeTime = reservationSettings[closeKey] as string | undefined;
                // Empty string "" means explicitly cleared (no hours), null/undefined means inherit (but should have value from merge)
                const isOff = !openTime || !closeTime || openTime === "" || closeTime === "";
                
                const formatReservationTime = (time: string | undefined): string => formatTimeEu(time);

                // Check if currently open
                const isCurrentlyOpen = (): boolean => {
                  if (isOff || !openTime || !closeTime) return false;
                  const currentHours = Number(formatInTimeZone(new Date(), effectiveTimezone, "H"));
                  const currentMinutes = Number(formatInTimeZone(new Date(), effectiveTimezone, "m"));
                  const currentTimeMinutes = currentHours * 60 + currentMinutes;
                  const [openHours, openMins] = openTime.split(":").map(Number);
                  const [closeHours, closeMins] = closeTime.split(":").map(Number);
                  const openTimeMinutes = openHours * 60 + openMins;
                  const closeTimeMinutes = closeHours * 60 + closeMins;
                  if (closeTimeMinutes < openTimeMinutes) {
                    return currentTimeMinutes >= openTimeMinutes || currentTimeMinutes <= closeTimeMinutes;
                  }
                  return currentTimeMinutes >= openTimeMinutes && currentTimeMinutes <= closeTimeMinutes;
                };

                const isOpen = isCurrentlyOpen();
                const hoursDisplay = isOff 
                  ? (t("home.reservationHours.closed") || "Closed")
                  : `${formatReservationTime(openTime)} - ${formatReservationTime(closeTime)}`;

                return (
                  <div className={`flex items-center justify-between p-3 rounded-lg ${isOpen ? "bg-green-500/10" : "bg-red-500/10"}`}>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-400 mb-1">
                        {t("home.reservationHours.today") || "Today"}
                      </p>
                      <div className={`text-lg font-bold ${isOpen ? "text-green-500" : "text-red-500"}`}>
                        {hoursDisplay}
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${isOpen ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                      {isOpen ? (t("home.reservationHours.open") || "Open") : (t("home.reservationHours.closed") || "Closed")}
                    </div>
                  </div>
                );
              })()}

              {/* Full Week Reservation Hours */}
              {showReservationWeek && (
                <div className="space-y-2 mt-3">
                  {[
                    { key: "monday", label: t("home.reservationHours.monday") || "Monday" },
                    { key: "tuesday", label: t("home.reservationHours.tuesday") || "Tuesday" },
                    { key: "wednesday", label: t("home.reservationHours.wednesday") || "Wednesday" },
                    { key: "thursday", label: t("home.reservationHours.thursday") || "Thursday" },
                    { key: "friday", label: t("home.reservationHours.friday") || "Friday" },
                    { key: "saturday", label: t("home.reservationHours.saturday") || "Saturday" },
                    { key: "sunday", label: t("home.reservationHours.sunday") || "Sunday" },
                  ].map((day) => {
                    const openKey = `${day.key}Open` as keyof ReservationSettings;
                    const closeKey = `${day.key}Close` as keyof ReservationSettings;
                    const openTime = reservationSettings[openKey] as string | undefined;
                    const closeTime = reservationSettings[closeKey] as string | undefined;
                    // Empty string "" means explicitly cleared (no hours), null/undefined means inherit (but should have value from merge)
                    const isOff = !openTime || !closeTime || openTime === "" || closeTime === "";
                    
                    const formatReservationTime = (time: string | undefined): string => formatTimeEu(time);

                    const hoursDisplay = isOff 
                      ? (t("home.reservationHours.closed") || "Closed")
                      : `${formatReservationTime(openTime)} - ${formatReservationTime(closeTime)}`;

                    const dayIndex = getZonedDayIndex0(effectiveTimezone);
                    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                    const isToday = dayNames[dayIndex] === day.key;

                    return (
                      <div
                        key={day.key}
                        className={`flex items-start justify-between p-2 rounded-md min-h-[44px] ${isToday ? "bg-pink-500/10" : ""}`}
                      >
                        <span className={`font-medium flex-1 mr-3 ${isToday ? "text-pink-500 font-semibold" : "text-gray-300"}`}>
                          {day.label}
                        </span>
                        <div className={`text-sm text-right flex-1 max-w-[60%] ${isToday ? "text-pink-500 font-semibold" : "text-gray-400"}`}>
                          {hoursDisplay}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Free Version Branch Info or Regular Content */}
      {isOrgScoped && !branch?.id ? null : (
        (() => {
          const fullBranch = branches.find(b => b.id === branch?.id);
          const isFreeVersion = fullBranch?.organization?.freeVersion;
          
          if (isAppUnavailable) {
            return <AppStatusNotice status={appStatus} />;
          }

          return isFreeVersion ? (
            <FreeVersionBranchInfo branch={fullBranch} />
          ) : (
            <>
              {/* Categories Section */}
              {categoriesLoading ? (
                <CategoriesSkeleton />
              ) : categoriesError ? (
                <div className="text-center py-8">
                  <p className="text-red-500">
                    Failed to load categories: {categoriesError}
                  </p>
                </div>
              ) : categories.length === 0 ? null : (
                <Categories
                  items={categories}
                  getPath={(c) => `/category/${encodeURIComponent(c.id)}`}
                />
              )}

              {/* Deal Categories Section */}
              {dealCategoriesLoading ? (
                <CategoriesSkeleton />
              ) : dealCategoriesError ? (
                <div className="text-center py-8">
                  <p className="text-red-500">
                    Failed to load deal categories: {dealCategoriesError}
                  </p>
                </div>
              ) : allDealCategories.length === 0 ? null : (
                <DealCategories items={allDealCategories} />
              )}

              {/* Featured Section */}
              {mealsLoading ? (
                <FeaturedSkeleton />
              ) : featured.length === 0 ? null : (
                <Featured items={featured} />
              )}
            </>
          );
        })()
      )}
        </>
      )}
    </section>
  );
}
