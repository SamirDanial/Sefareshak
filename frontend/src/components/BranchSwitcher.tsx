import { useEffect, useState, useRef } from "react";
import { useBranch } from "@/contexts/BranchContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiStore, mdiLoading, mdiLock, mdiAlert } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getOptimizedImageUrl } from "@/utils/imageUtils";
import { getLocalizedName } from "@/utils/localization";
import { ServingHoursService } from "@/services/servingHoursService";
import { calculateDistance } from "@/utils/distanceCalculator";
import branchClickService from "@/services/branchClickService";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const GPS_BRANCH_ATTEMPT_KEY = "bellami:gpsBranchAttempted";

type BranchSwitcherVariant = "dropdown" | "carousel";

export function BranchSwitcher({
  variant = "dropdown",
  showCarouselHeader = true,
}: {
  variant?: BranchSwitcherVariant;
  showCarouselHeader?: boolean;
}) {
  const { branch, visibleBranches, loadingBranches, setBranch, clearReservationLock, customerServiceType, customerLocation } = useBranch();
  const { settings } = useSettings();
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const mainBranchId = settings?.mainBranchId;
  const [isModifying, setIsModifying] = useState(false);
  const [, setPreOrderLockedBranchId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollLeftRef = useRef<number>(0);
  const [carouselHasOverflow, setCarouselHasOverflow] = useState(false);
  const [carouselThumbWidthPct, setCarouselThumbWidthPct] = useState(0);
  const [carouselThumbLeftPct, setCarouselThumbLeftPct] = useState(0);

  const [branchOpenMap, setBranchOpenMap] = useState<Record<string, boolean>>({});

  const branchesForSelection = visibleBranches;

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const update = () => {
      const hasOverflow = el.scrollWidth > el.clientWidth + 1;
      setCarouselHasOverflow(hasOverflow);

      if (!hasOverflow) {
        setCarouselThumbWidthPct(0);
        setCarouselThumbLeftPct(0);
        return;
      }

      const widthRatio = el.clientWidth / el.scrollWidth;
      const widthPct = Math.max(10, Math.min(100, widthRatio * 100));
      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const progress = maxScrollLeft > 0 ? el.scrollLeft / maxScrollLeft : 0;
      const leftPct = progress * (100 - widthPct);

      setCarouselThumbWidthPct(widthPct);
      setCarouselThumbLeftPct(leftPct);
    };

    update();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    }

    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, [branchesForSelection.length]);

  const orderedBranchesForSelection = (() => {
    if (!branch?.id) return branchesForSelection;
    const idx = branchesForSelection.findIndex((b) => b.id === branch.id);
    if (idx <= 0) return branchesForSelection;
    const list = [...branchesForSelection];
    const [selected] = list.splice(idx, 1);
    list.unshift(selected);
    return list;
  })();

  useEffect(() => {
    let cancelled = false;
    const list = branchesForSelection;

    const load = async () => {
      try {
        const pairs = await Promise.all(
          list.map(async (b) => {
            try {
              const r = await ServingHoursService.getServingHours(b.id);
              const isOpen = Boolean((r as any)?.data?.currentStatus?.isOpen);
              return [b.id, isOpen] as const;
            } catch {
              return [b.id, true] as const;
            }
          })
        );

        if (cancelled) return;
        const next: Record<string, boolean> = {};
        for (const [id, isOpen] of pairs) {
          next[id] = isOpen;
        }
        setBranchOpenMap(next);
      } catch {
        // ignore
      }
    };

    if (list.length > 0) {
      load();
    }
    return () => {
      cancelled = true;
    };
  }, [branchesForSelection]);

  const currentBranchIsInList = branch?.id
    ? branchesForSelection.some((b) => b.id === branch.id)
    : false;

  const setFallbackBranch = (source: "AUTO_DEFAULT" | "AUTO_NEAREST") => {
    if (branchesForSelection.length === 0) return;

    const mainBranch =
      mainBranchId && branchesForSelection.some((b) => b.id === mainBranchId)
        ? branchesForSelection.find((b) => b.id === mainBranchId) || null
        : null;

    const chosen =
      mainBranch ||
      branchesForSelection[Math.floor(Math.random() * branchesForSelection.length)];
    if (!chosen) return;

    setBranch(
      {
        id: chosen.id,
        name: chosen.name || null,
        distanceKm: null,
      },
      source
    );
  };
  
  // Check if we're in modification mode or pre-order lock
  useEffect(() => {
    const checkBranchLock = () => {
      const modifyingReservationId = sessionStorage.getItem("modifyingReservationId");
      const modifyingBranchId = sessionStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderId = sessionStorage.getItem("modifyingOrderId");
      const modifyingOrderBranchId = sessionStorage.getItem("modifyingOrderBranchId");
      const preOrderBranchLock = sessionStorage.getItem("preOrderBranchLock");
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      
      // Check if locked for any reason (modification mode or pre-order lock)
      const isLocked = !!(
        modifyingReservationId ||
        modifyingBranchId ||
        modifyingOrderId ||
        modifyingOrderBranchId ||
        preOrderBranchLock
      );
      
      // If preOrderBranchLock exists but no pending reservation, clear the lock
      if (preOrderBranchLock && !pendingReservation) {
        sessionStorage.removeItem("preOrderBranchLock");
        setIsModifying(
          !!(
            modifyingReservationId ||
            modifyingBranchId ||
            modifyingOrderId ||
            modifyingOrderBranchId
          )
        );
        setPreOrderLockedBranchId(null);
        return;
      }
      
      setIsModifying(isLocked);
      setPreOrderLockedBranchId(preOrderBranchLock || null);
    };
    
    checkBranchLock();
    // Listen for storage changes (when modification mode or pre-order lock is entered/exited)
    window.addEventListener("storage", checkBranchLock);
    // Also check periodically in case of same-tab changes
    const interval = setInterval(checkBranchLock, 500);
    
    return () => {
      window.removeEventListener("storage", checkBranchLock);
      clearInterval(interval);
    };
  }, []);
  
  // Separate main branch from other branches and sort other branches alphabetically,
  // but always keep the currently selected branch as the first item.
  const selectedBranch = branch?.id ? orderedBranchesForSelection.find((b) => b.id === branch.id) : null;
  const isBranchUrgentlyClosed = selectedBranch?.isUrgentlyClosed === true;

  const distanceKmOf = (b: any): number | null => {
    if (!customerLocation) return null;
    const userLat = Number(customerLocation.latitude);
    const userLon = Number(customerLocation.longitude);
    const lat = Number(b?.latitude);
    const lon = Number(b?.longitude);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return calculateDistance(userLat, userLon, lat, lon);
  };

  const otherBranches = (() => {
    const remaining = orderedBranchesForSelection.filter((b) => b.id !== selectedBranch?.id);

    // When user has a location, sort by nearest first.
    if (customerLocation) {
      return [...remaining].sort((a, b) => {
        const da = distanceKmOf(a);
        const db = distanceKmOf(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }

    // Fallback: preserve the old behavior when no location is set
    // (main branch first, then alphabetical).
    const mainBranch = mainBranchId ? remaining.find((b) => b.id === mainBranchId) : null;
    const others = remaining
      .filter((b) => b.id !== mainBranchId)
      .sort((a, b) => {
        const nameA = (a.name || `Branch ${a.id.slice(0, 8)}`).toLowerCase();
        const nameB = (b.name || `Branch ${b.id.slice(0, 8)}`).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    return [...(mainBranch ? [mainBranch] : []), ...others];
  })();

  // Ensure a branch is ALWAYS selected (when branches exist):
  // 1) Try GPS-nearest branch (prompts user)
  // 2) If rejected/unavailable, fall back to main branch
  // 3) If main branch unavailable/inactive, fall back to any active branch
  useEffect(() => {
    if (loadingBranches) {
      return;
    }

    if (branchesForSelection.length === 0) return;
    if (isModifying) return;

    const needsSelection = !branch || (branch?.id && !currentBranchIsInList);
    if (!needsSelection) return;

    const alreadyAttemptedGps = sessionStorage.getItem(GPS_BRANCH_ATTEMPT_KEY) === "1";
    if (alreadyAttemptedGps) {
      setFallbackBranch("AUTO_DEFAULT");
      return;
    }

    sessionStorage.setItem(GPS_BRANCH_ATTEMPT_KEY, "1");

    if (!navigator.geolocation) {
      setFallbackBranch("AUTO_DEFAULT");
      return;
    }

    const toRad = (v: number) => (v * Math.PI) / 180;
    const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;

        const withCoords = branchesForSelection.filter(
          (b) => typeof b.latitude === "number" && typeof b.longitude === "number"
        );

        if (withCoords.length === 0) {
          setFallbackBranch("AUTO_DEFAULT");
          return;
        }

        let nearest = withCoords[0];
        let nearestDist = distanceKm(userLat, userLon, nearest.latitude as number, nearest.longitude as number);
        for (const b of withCoords.slice(1)) {
          const d = distanceKm(userLat, userLon, b.latitude as number, b.longitude as number);
          if (d < nearestDist) {
            nearest = b;
            nearestDist = d;
          }
        }

        setBranch(
          {
            id: nearest.id,
            name: nearest.name || null,
            distanceKm: nearestDist,
          },
          "AUTO_NEAREST"
        );
      },
      () => {
        setFallbackBranch("AUTO_DEFAULT");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [branch, branchesForSelection, currentBranchIsInList, isModifying, loadingBranches, mainBranchId, setBranch]);

  const handleBranchChange = (branchId: string) => {
    // Capture current scroll position before branch change
    if (carouselRef.current) {
      scrollLeftRef.current = carouselRef.current.scrollLeft;
    }
    
    // Prevent branch changes when in modification mode or pre-order lock
    if (isModifying) {
      return;
    }
    
    const selectedBranch = branchesForSelection.find((b) => b.id === branchId);
    if (selectedBranch) {
      // Only record click if selecting a different branch
      if (branch?.id !== branchId) {
        // Record branch click (non-blocking)
        branchClickService.recordBranchClick(branchId, userId).catch(() => {
          // Silently ignore errors - click tracking shouldn't block user experience
        });
      }
      
      setBranch({
        id: selectedBranch.id,
        name: selectedBranch.name || null,
        distanceKm: null,
      }, "MANUAL");
    }
  };

  const handleCancelPreOrderLock = () => {
    clearReservationLock();
    setShowCancelConfirm(false);
    setPreOrderLockedBranchId(null);
  };

  // Restore carousel scroll position after branch change re-render
  useEffect(() => {
    const restore = () => {
      if (carouselRef.current && scrollLeftRef.current > 0) {
        // Disable scroll-snap temporarily, restore scroll, then re-enable
        const container = carouselRef.current;
        const innerFlex = container.firstElementChild as HTMLElement | null;
        
        // Disable snap
        if (innerFlex) {
          innerFlex.style.scrollSnapType = 'none';
        }
        
        // Restore scroll position
        container.scrollLeft = scrollLeftRef.current;
        
        // Re-enable snap after scroll settles
        setTimeout(() => {
          if (innerFlex) {
            innerFlex.style.scrollSnapType = '';
          }
        }, 100);
      }
    };
    
    // Try immediately and after a short delay
    restore();
    const timers = [50, 100, 200].map(delay => setTimeout(restore, delay));
    
    return () => timers.forEach(clearTimeout);
  }, [branch?.id]);

  if (loadingBranches) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#262626] border border-[#404040]">
        <Icon path={mdiLoading} size={0.67} className="animate-spin text-pink-500" />
        <span className="text-sm text-gray-400">Loading branches...</span>
      </div>
    );
  }

  if (branchesForSelection.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Icon path={mdiStore} size={0.67} className="text-pink-500" />
        <Select value="" onValueChange={() => {}} disabled>
          <SelectTrigger
            className={cn(
              "w-full md:w-[200px] bg-[#262626] border-[#404040] text-gray-400 opacity-60 cursor-not-allowed"
            )}
          >
            <SelectValue placeholder="No branches available" className="flex-1" />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  const placeholderImageFor = (name: string | null | undefined) => {
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
    return placeholderImageFor((b as any)?.name);
  };

  if (variant === "carousel") {
    const serviceTypeLabel =
      customerServiceType === "MEAT_SHOP"
        ? t("home.serviceTypes.meatShop", { defaultValue: "Meat Shop" })
        : customerServiceType === "BAKERY"
          ? t("home.serviceTypes.bakery", { defaultValue: "Bakery" })
          : customerServiceType === "FOOD_TRUCK"
            ? t("home.serviceTypes.foodTruck", { defaultValue: "Food Truck" })
            : t("home.serviceTypes.restaurant", { defaultValue: "Restaurant" });

    return (
      <div className="w-full" data-branch-switcher>
        {showCarouselHeader ? (
          <div className="flex items-center gap-2 mb-2">
            <Icon path={mdiStore} size={0.67} className="text-pink-500" />
            <div className="text-sm font-semibold text-white">
              {t("home.chooseBranchWithServiceType", {
                defaultValue: "Choose a {{serviceType}} branch",
                serviceType: serviceTypeLabel,
              })}
            </div>
            {isModifying && <Icon path={mdiLock} size={0.6} className="text-yellow-500" />}
          </div>
        ) : null}

        <div className="w-full">
          <div
            ref={carouselRef}
            className={cn(
              "overflow-x-auto",
              "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
              "-mx-1 px-1",
              isModifying && "opacity-70"
            )}
            onScroll={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              scrollLeftRef.current = el.scrollLeft;

              if (el.scrollWidth > el.clientWidth + 1) {
                const widthRatio = el.clientWidth / el.scrollWidth;
                const widthPct = Math.max(10, Math.min(100, widthRatio * 100));
                const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
                const progress = maxScrollLeft > 0 ? el.scrollLeft / maxScrollLeft : 0;
                const leftPct = progress * (100 - widthPct);
                setCarouselThumbWidthPct(widthPct);
                setCarouselThumbLeftPct(leftPct);
              }
            }}
          >
          <div
            className={cn(
              "flex gap-3 pb-2",
              "select-none"
            )}
            style={{ minWidth: "max-content" }}
          >
            {[...(selectedBranch ? [selectedBranch] : []), ...otherBranches].map((b) => {
            const isSelected = branch?.id === b.id;
            const isMain = mainBranchId === b.id;
            const isOpen = branchOpenMap[b.id] !== false;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleBranchChange(b.id)}
                disabled={isModifying}
                className={cn(
                  "flex flex-col snap-start shrink-0 w-[165px] sm:w-[185px] md:w-[200px] lg:w-[215px] rounded-2xl border text-left transition overflow-hidden",
                  "bg-[#262626] border-[#404040] hover:border-white/20 hover:bg-[#2d2d2d]",
                  isSelected && "border-white/20 bg-[#2d2d2d] shadow-lg shadow-black/30 -translate-y-px",
                  isModifying && "opacity-60 cursor-not-allowed"
                )}
              >
                <div className="relative w-full h-[110px]">
                  <img
                    src={branchImageUrl(b)}
                    alt={b.name || "Branch"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      try {
                        (e.currentTarget as any).src = placeholderImageFor(b.name);
                      } catch {
                        // ignore
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {isMain ? (
                    <div className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full bg-pink-500/20 text-pink-200 border border-pink-500/20">
                      {t("home.mainBranch", { defaultValue: "Main" })}
                    </div>
                  ) : null}

                  {!isOpen ? (
                    <div className="absolute bottom-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full bg-red-500/20 text-red-200 border border-red-500/20">
                      {t("home.servingHours.closed", { defaultValue: "Closed" })}
                    </div>
                  ) : null}

                  {isSelected ? (
                    <div className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-1 rounded-full bg-green-500/20 text-green-200 border border-green-500/20">
                      {t("home.selected", { defaultValue: "Selected" })}
                    </div>
                  ) : null}
                </div>

                <div className="p-3">
                  <div className="text-white font-semibold leading-tight truncate">
                    {getLocalizedName(b.name, (b as any).nameFa, i18n.language) || `Branch ${b.id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {[b.city, b.state, b.country].filter(Boolean).join(", ") ||
                      t("home.branchCardHint", { defaultValue: "Tap to select this branch" })}
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </div>

        {isBranchUrgentlyClosed && selectedBranch?.urgentCloseMessage && (
          <div className="flex items-start gap-2 px-3 py-2 mt-4 rounded-md bg-red-500/10 border border-red-500/20">
            <Icon path={mdiAlert} size={0.67} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-red-200">
                {t("branchSwitcher.urgentlyClosed", { defaultValue: "Branch Temporarily Closed" })}
              </div>
              <div className="text-xs text-red-300/80 mt-1">
                {selectedBranch.urgentCloseMessage}
              </div>
            </div>
          </div>
        )}

          {carouselHasOverflow ? (
            <div className="mt-2">
              <div className="relative h-[4px] rounded-full bg-white/10 overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 bg-pink-500/70 rounded-full"
                  style={{ width: `${carouselThumbWidthPct}%`, left: `${carouselThumbLeftPct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon path={mdiStore} size={0.67} className="text-pink-500" />
          <Select
            value={currentBranchIsInList ? branch?.id || "" : ""}
            onValueChange={handleBranchChange}
            disabled={isModifying}
            open={isModifying ? false : selectOpen}
            onOpenChange={(open) => {
              if (isModifying) {
                setSelectOpen(false);
                return;
              }
              setSelectOpen(open);
            }}
          >
            <SelectTrigger
              className={cn(
                "w-full md:w-[200px] bg-[#262626] border-[#404040] text-white hover:bg-[#2d2d2d] focus:ring-pink-500",
                !branch && "text-gray-400",
                isModifying && "opacity-60 cursor-not-allowed"
              )}
              onClick={(e) => {
                if (isModifying) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectOpen(false);
                }
              }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <SelectValue placeholder="Select a branch" className="flex-1" />
                {isModifying && (
                  <Icon path={mdiLock} size={0.5} className="text-yellow-500 shrink-0 ml-1" />
                )}
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#262626] border-[#404040]">
              {selectedBranch && (
                <SelectItem
                  key={selectedBranch.id}
                  value={selectedBranch.id}
                  className="bg-green-500/10 border-l-2 border-green-500 text-white hover:bg-green-500/20 focus:bg-green-500/20 focus:text-white font-semibold"
                >
                  {getLocalizedName(selectedBranch.name, (selectedBranch as any).nameFa, i18n.language) || `Branch ${selectedBranch.id.slice(0, 8)}`}
                </SelectItem>
              )}
              {selectedBranch && otherBranches.length > 0 && (
                <div className="h-px bg-[#404040] my-1" />
              )}
              {otherBranches.map((b) => (
                <SelectItem
                  key={b.id}
                  value={b.id}
                  className="text-white hover:bg-[#2d2d2d] focus:bg-[#2d2d2d] focus:text-white"
                >
                  {getLocalizedName(b.name, (b as any).nameFa, i18n.language) || `Branch ${b.id.slice(0, 8)}`}
                </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {isBranchUrgentlyClosed && selectedBranch?.urgentCloseMessage && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
          <Icon path={mdiAlert} size={0.67} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-red-200">
              {t("branchSwitcher.urgentlyClosed", { defaultValue: "Branch Temporarily Closed" })}
            </div>
            <div className="text-xs text-red-300/80 mt-1">
              {selectedBranch.urgentCloseMessage}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="bg-[#262626] border-[#404040] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              {t("reservations.booking.cancelReservationTitle") || "Cancel reservation?"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {t("reservations.booking.cancelReservationHint") || "This will exit reservation mode and unlock branch selection."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              onClick={() => setShowCancelConfirm(false)}
              variant="outline"
              className="border-[#404040] text-gray-300 hover:bg-[#2d2d2d]"
            >
              {t("common.keep") || "Keep"}
            </Button>
            <Button
              onClick={handleCancelPreOrderLock}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
            >
              {t("reservations.booking.cancelReservation") || "Cancel reservation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

