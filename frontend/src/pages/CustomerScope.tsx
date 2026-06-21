import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Icon from "@mdi/react";
import {
  mdiMapMarker,
  mdiStore,
  mdiSilverwareForkKnife,
  mdiFoodCroissant,
  mdiFoodSteak,
  mdiTruck,
  mdiNavigation,
  mdiMagnify,
  mdiLoading,
} from "@mdi/js";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/contexts/BranchContext";
import googlePlacesService from "@/services/googlePlacesService";
import type { AddressComponents } from "@/services/googlePlacesService";
import type { ServiceType } from "@/services/branchService";
import { toast } from "sonner";

const STEP_STORAGE_KEY = "bellami:customerScopeStep";

export default function CustomerScope() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    customerServiceType,
    customerServiceMode,
    customerRadiusKm,
    customerLocation,
    setCustomerServiceType,
    setCustomerServiceMode,
    setCustomerRadiusKm,
    setCustomerLocation,
    customerBranchSearchQuery,
    setCustomerBranchSearchQuery,
    refreshBranches,
    visibleBranches,
    loadingBranches,
  } = useBranch();

  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [typedAddress, setTypedAddress] = useState("");
  const [typedBranchOrgQuery, setTypedBranchOrgQuery] = useState<string>(customerBranchSearchQuery || "");
  const [showBranchOrgSuggestions, setShowBranchOrgSuggestions] = useState(false);
  const [typedRadiusKm, setTypedRadiusKm] = useState<string>(String(customerRadiusKm ?? 20));
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(() => {
    try {
      const raw = sessionStorage.getItem(STEP_STORAGE_KEY);
      const n = Number(raw);
      if (n === 1 || n === 2 || n === 3) return n;
    } catch {}
    return 1;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_STORAGE_KEY, String(step));
    } catch {}
  }, [step]);

  const [biasCountryCode, setBiasCountryCode] = useState<string | null>(null);
  const [biasBounds, setBiasBounds] = useState<any | null>(null);

  const branchOrgInputRef = useRef<HTMLInputElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any | null>(null);

  const [branchOrgFocused, setBranchOrgFocused] = useState(false);

  useEffect(() => {
    if (!branchOrgFocused) return;
    const el = branchOrgInputRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    try {
      el.focus();
    } catch {}
  }, [branchOrgFocused, loadingBranches, typedBranchOrgQuery, visibleBranches.length]);

  const geocodeTypedAddress = useCallback(
    (address: string) => {
      return new Promise<boolean>((resolve) => {
        const trimmed = address.trim();
        if (!trimmed) {
          resolve(false);
          return;
        }
        if (!googleLoaded || !(window as any).google?.maps?.Geocoder) {
          resolve(false);
          return;
        }

        try {
          const geocoder = new (window as any).google.maps.Geocoder();
          const req: any = {
            address: trimmed,
            ...(biasBounds ? { bounds: biasBounds } : {}),
            ...(biasCountryCode
              ? { componentRestrictions: { country: biasCountryCode } }
              : {}),
            ...(biasCountryCode ? { region: biasCountryCode } : {}),
          };

          geocoder.geocode(req, (results: any[] | null, status: string) => {
            if (
              status === (window as any).google.maps.GeocoderStatus.OK &&
              results &&
              results.length > 0
            ) {
              const result = results[0];
              const lat = result.geometry.location.lat();
              const lon = result.geometry.location.lng();
              setCustomerLocation({ latitude: lat, longitude: lon, label: trimmed });
              resolve(true);
              return;
            }
            resolve(false);
          });
        } catch {
          resolve(false);
        }
      });
    },
    [biasBounds, biasCountryCode, googleLoaded, setCustomerLocation]
  );

  useEffect(() => {
    googlePlacesService
      .loadScript(() => {
        setGoogleLoaded(true);
      })
      .then((ok) => {
        if (ok) setGoogleLoaded(true);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  useEffect(() => {
    if (!googleLoaded) return;
    if (step !== 3) return;
    if (!addressInputRef.current) return;

    if (autocompleteRef.current) return;
    const onPlaceChanged = (components: AddressComponents) => {
      setTypedAddress(components.formattedAddress || "");
      setCustomerLocation({
        latitude: components.latitude,
        longitude: components.longitude,
        label: components.formattedAddress || null,
      });
    };

    autocompleteRef.current = googlePlacesService.initializeAutocomplete(
      addressInputRef.current,
      onPlaceChanged,
      { types: null }
    );

    if (autocompleteRef.current && (biasBounds || biasCountryCode)) {
      try {
        if (biasBounds) {
          autocompleteRef.current.setBounds(biasBounds);
        }
        autocompleteRef.current.setOptions({
          strictBounds: false,
          ...(biasCountryCode
            ? { componentRestrictions: { country: biasCountryCode } }
            : {}),
        });
      } catch {
        // ignore
      }
    }

    return () => {
      autocompleteRef.current = null;
    };
  }, [googleLoaded, setCustomerLocation, step]);

  useEffect(() => {
    if (!googleLoaded) return;
    if (!autocompleteRef.current) return;

    try {
      if (biasBounds) {
        autocompleteRef.current.setBounds(biasBounds);
      }
      autocompleteRef.current.setOptions({
        strictBounds: false,
        ...(biasCountryCode
          ? { componentRestrictions: { country: biasCountryCode } }
          : {}),
      });
    } catch {
      // ignore
    }
  }, [biasBounds, biasCountryCode, googleLoaded]);

  const serviceOptions = useMemo(
    () =>
      [
        {
          type: "RESTAURANT" as const,
          icon: mdiSilverwareForkKnife,
          title: t("home.scope.services.restaurant", { defaultValue: "Restaurant" }),
          hint: t("home.scope.services.restaurantHint", { defaultValue: "Meals and drinks" }),
          subText: t("home.scope.services.restaurantSubText", { defaultValue: "Delivery Service" }),
        },
        {
          type: "MEAT_SHOP" as const,
          icon: mdiFoodSteak,
          title: t("home.scope.services.meatShop", { defaultValue: "Meat Shop" }),
          hint: t("home.scope.services.meatShopHint", { defaultValue: "Fresh cuts and packages" }),
        },
        {
          type: "BAKERY" as const,
          icon: mdiFoodCroissant,
          title: t("home.scope.services.bakery", { defaultValue: "Bakery/Coffee" }),
          hint: t("home.scope.services.bakeryHint", { defaultValue: "Bread, pastries, desserts" }),
        },
        {
          type: "FOOD_TRUCK" as const,
          icon: mdiTruck,
          title: t("home.scope.services.foodTruck", { defaultValue: "Food Truck" }),
          hint: t("home.scope.services.foodTruckHint", { defaultValue: "Street food on the go" }),
        },
      ] satisfies Array<{ type: ServiceType; icon: string; title: string; hint: string; subText?: string }>,
    [t]
  );

  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error(
        t("findBranch.geolocationNotSupported", {
          defaultValue: "Geolocation is not supported by your browser",
        })
      );
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCustomerLocation({ latitude: lat, longitude: lon, label: null });

        try {
          if ((window as any).google?.maps?.Geocoder) {
            const geocoder = new (window as any).google.maps.Geocoder();
            geocoder.geocode(
              { location: { lat, lng: lon } },
              (results: any[] | null, status: string) => {
                if (
                  status === (window as any).google.maps.GeocoderStatus.OK &&
                  results &&
                  results.length > 0
                ) {
                  const first = results[0];
                  const viewport = first?.geometry?.viewport;
                  if (viewport) {
                    setBiasBounds(viewport);
                  } else {
                    const delta = 0.15; // ~15-20km depending on latitude
                    const bounds = new (window as any).google.maps.LatLngBounds(
                      { lat: lat - delta, lng: lon - delta },
                      { lat: lat + delta, lng: lon + delta }
                    );
                    setBiasBounds(bounds);
                  }

                  const comps = first.address_components || [];
                  const country = comps.find((c: any) => (c.types || []).includes("country"));
                  const cc = country?.short_name;
                  if (typeof cc === "string" && cc) {
                    setBiasCountryCode(cc.toLowerCase());
                  }

                }
              }
            );
          }
        } catch {
          // ignore
        }

        setIsGettingLocation(false);
      },
      () => {
        setIsGettingLocation(false);
        toast.error(
          t("findBranch.couldNotGetLocation", {
            defaultValue: "Could not get your location",
          })
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [setCustomerLocation, t]);

  useEffect(() => {
    // Default behavior: GPS on page load if location not set yet.
    if (!customerLocation) {
      handleGetCurrentLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!googleLoaded) return;
    if (!customerLocation) return;
    if (biasCountryCode) return;
    if (!(window as any).google?.maps?.Geocoder) return;

    try {
      const lat = customerLocation.latitude;
      const lon = customerLocation.longitude;
      const geocoder = new (window as any).google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat, lng: lon } },
        (results: any[] | null, status: string) => {
          if (
            status === (window as any).google.maps.GeocoderStatus.OK &&
            results &&
            results.length > 0
          ) {
            const first = results[0];
            const viewport = first?.geometry?.viewport;
            if (viewport) {
              setBiasBounds(viewport);
            } else {
              const delta = 0.15; // ~15-20km depending on latitude
              const bounds = new (window as any).google.maps.LatLngBounds(
                { lat: lat - delta, lng: lon - delta },
                { lat: lat + delta, lng: lon + delta }
              );
              setBiasBounds(bounds);
            }

            const comps = first.address_components || [];
            const country = comps.find((c: any) => (c.types || []).includes("country"));
            const cc = country?.short_name;
            if (typeof cc === "string" && cc) {
              setBiasCountryCode(cc.toLowerCase());
            }

          }
        }
      );
    } catch {
      // ignore
    }
  }, [biasCountryCode, customerLocation, googleLoaded]);

  const handleSearchAddress = useCallback(async () => {
    if (!typedAddress.trim()) {
      toast.error(t("findBranch.addressRequired", { defaultValue: "Please enter an address" }));
      return;
    }

    const isReady = googlePlacesService.isGoogleLoaded() && (window as any).google?.maps?.Geocoder;
    if (!isReady) {
      try {
        const ok = await googlePlacesService.loadScript(() => {
          setGoogleLoaded(true);
        });
        if (!ok) {
          toast.error(t("findBranch.mapNotReady", { defaultValue: "Map is not ready yet" }));
          return;
        }
      } catch {
        toast.error(t("findBranch.mapNotReady", { defaultValue: "Map is not ready yet" }));
        return;
      }
    }

    setIsSearchingAddress(true);
    geocodeTypedAddress(typedAddress)
      .then((ok) => {
        setIsSearchingAddress(false);
        if (ok) {
          toast.success(t("findBranch.addressFound", { defaultValue: "Address found" }));
          return;
        }
        toast.error(t("findBranch.addressNotFound", { defaultValue: "Could not find that address" }));
      })
      .catch(() => {
        setIsSearchingAddress(false);
        toast.error(t("findBranch.addressNotFound", { defaultValue: "Could not find that address" }));
      });
  }, [geocodeTypedAddress, googleLoaded, t, typedAddress]);

  const commitBranchOrgQuery = useCallback(() => {
    setCustomerBranchSearchQuery(typedBranchOrgQuery);
  }, [setCustomerBranchSearchQuery, typedBranchOrgQuery]);

  useEffect(() => {
    if (step !== 3) return;
    const next = typedBranchOrgQuery;
    const timer = window.setTimeout(() => {
      setCustomerBranchSearchQuery(next);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [setCustomerBranchSearchQuery, step, typedBranchOrgQuery]);

  const branchOrgSuggestions = useMemo(() => {
    const raw = typedBranchOrgQuery.trim().toLowerCase();
    if (!raw) return [] as Array<{ key: string; label: string; applyQuery: string }>;

    const list = (visibleBranches || []) as any[];

    const orgMap = new Map<string, { key: string; label: string; applyQuery: string }>();
    for (const b of list) {
      const orgName = String(b?.organization?.name || "").trim();
      if (!orgName) continue;
      const k = `org:${orgName.toLowerCase()}`;
      if (orgMap.has(k)) continue;
      orgMap.set(k, {
        key: k,
        label: orgName,
        applyQuery: orgName,
      });
    }

    const orgSuggestions = Array.from(orgMap.values()).filter((o) => o.label.toLowerCase().includes(raw));

    const branchSuggestions = list
      .filter((b) => {
        const branchName = String(b?.name || "").toLowerCase();
        const branchCode = String(b?.code || "").toLowerCase();
        const orgName = String(b?.organization?.name || "").toLowerCase();
        const businessName = String(b?.organization?.settings?.businessName || "").toLowerCase();
        const orgSlug = String(b?.organization?.slug || "").toLowerCase();
        const haystack = `${branchName} ${branchCode} ${orgName} ${businessName} ${orgSlug}`.trim();
        return haystack.includes(raw);
      })
      .map((b) => {
        const name = String(b?.name || "").trim();
        const code = String(b?.code || "").trim();
        const orgName = String(b?.organization?.name || "").trim();
        const label = `${name}${code ? ` (${code})` : ""}${orgName ? ` • ${orgName}` : ""}`;
        return {
          key: `branch:${String(b?.id || label)}`,
          label,
          applyQuery: name || code || label,
        };
      });

    return [...orgSuggestions, ...branchSuggestions].slice(0, 8);
  }, [typedBranchOrgQuery, visibleBranches]);

  const handleContinue = async () => {
    if (isContinuing) return;
    if (!customerServiceType) {
      toast.error(t("home.scope.pickService", { defaultValue: "Please choose a service" }));
      return;
    }

    if (!customerLocation) {
      if (typedAddress.trim()) {
        setIsSearchingAddress(true);
        const ok = await geocodeTypedAddress(typedAddress);
        setIsSearchingAddress(false);
        if (!ok) {
          toast.error(t("home.scope.pickLocation", { defaultValue: "Please set your delivery location" }));
          return;
        }
      } else {
        toast.error(t("home.scope.pickLocation", { defaultValue: "Please set your delivery location" }));
        return;
      }
    }

    // Flush query immediately so it can't be lost by subsequent scope persistence updates (e.g., location).
    // Also ensures Home loads with the intended branch/org filtering.
    setCustomerBranchSearchQuery(typedBranchOrgQuery);

    if (customerServiceMode !== "DELIVERY") {
      const n = Number(typedRadiusKm);
      const nextRadius = !isNaN(n) && n > 0 ? n : 20;
      setCustomerRadiusKm(nextRadius);
    }

    const noBranches = !loadingBranches && visibleBranches.length === 0;
    try {
      setIsContinuing(true);

      try {
        sessionStorage.removeItem(STEP_STORAGE_KEY);
      } catch {}

      // Ensure Home renders with up-to-date scope filtering. Without this, navigation can happen
      // while branches are still based on stale query/location state.
      // Pass current values directly to avoid race condition with React state updates.
      try {
        await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));
        await refreshBranches({
          query: typedBranchOrgQuery,
          serviceType: customerServiceType,
          serviceMode: customerServiceMode,
          location: customerLocation,
          radiusKm: customerServiceMode !== "DELIVERY" ? Number(typedRadiusKm) || 20 : null,
        });
      } catch {
        // ignore
      }

      try {
        if (noBranches) {
          sessionStorage.setItem("bellami:scopeNoBranches", "1");
        } else {
          sessionStorage.removeItem("bellami:scopeNoBranches");
        }
      } catch {
        // ignore
      }
      navigate("/home", { replace: true });
    } finally {
      setIsContinuing(false);
    }
  };

  const scopeModeLabel = useMemo(() => {
    if (customerServiceMode === "PICKUP") {
      return t("home.scope.modes.pickup", { defaultValue: "Pickup" });
    }
    if (customerServiceMode === "RESERVATION") {
      return t("home.scope.modes.reservation", { defaultValue: "Reservation" });
    }
    return t("home.scope.modes.delivery", { defaultValue: "Delivery" });
  }, [customerServiceMode, t]);

  const stepTitle = useMemo(() => {
    if (step === 1) {
      return t("home.scope.title", { defaultValue: "What service are you looking for?" });
    }
    if (step === 2) {
      return t("home.scope.modeTitle", { defaultValue: "How would you like to order?" });
    }
    return customerServiceMode === "DELIVERY"
      ? t("home.scope.pickLocation", { defaultValue: "Please set your delivery location" })
      : t("home.scope.pickLocationGeneric", { defaultValue: "Where are you?" });
  }, [customerServiceMode, step, t]);

  const stepDescription = useMemo(() => {
    if (step === 1) {
      return t("home.scope.step1Description", {
        defaultValue: "Choose what you want.",
      });
    }
    if (step === 2) {
      return t("home.scope.step2Description", {
        defaultValue: "Choose delivery, pickup, or reservation.",
      });
    }
    return t("home.scope.step3Description", {
      defaultValue: "Set your location so we can show the right branches.",
    });
  }, [step, t]);

  const handleNextFromStep2 = useCallback(() => {
    setStep(3);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div
        className="relative min-h-screen overflow-hidden"
        style={{
          backgroundImage: "url('/NextFoody.png')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <>
          <div className="absolute inset-0 bg-center bg-cover" />
          <div className="pointer-events-none absolute inset-0 bg-black/25" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/75 via-black/25 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        </>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
        <div className="mb-6">
          {step === 1 ? (
            <div className="inline-flex items-start gap-3 rounded-2xl bg-black/55 px-4 py-3 backdrop-blur-md border border-white/10 shadow-2xl">
              <div className="shrink-0 p-2 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 shadow-lg shadow-pink-500/30">
                <Icon path={mdiStore} size={0.83} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                  {t("home.scope.step1HeroTitle", {
                    defaultValue: "Which kind of service are you looking for?",
                  })}
                </h1>
                <p className="text-white/75 mt-1 text-sm sm:text-base italic">
                  {t("home.scope.step1HeroSubtitle", { defaultValue: "Choose what you want." })}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="shrink-0 p-3 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 shadow-lg shadow-pink-500/30">
                <Icon path={mdiStore} size={1.0} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  {stepTitle}
                </h1>
                <p className="text-gray-400 mt-1 text-sm sm:text-base">
                  {stepDescription}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 items-stretch">
          {step === 1 ? (
            <div className="min-h-[60vh] flex flex-col">
              <div className="flex-1" />
              <div className="grid grid-cols-1 gap-3">
                {serviceOptions.map((opt) => {
                  const selected = customerServiceType === opt.type;
                  const tileClass =
                    opt.type === "RESTAURANT"
                      ? "from-fuchsia-700 to-pink-600"
                      : opt.type === "BAKERY"
                        ? "from-amber-500 to-orange-600"
                        : opt.type === "MEAT_SHOP"
                          ? "from-rose-800 to-red-700"
                          : "from-slate-700 to-slate-600";

                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => {
                        setCustomerServiceType(opt.type);
                        // Set default to PICKUP for MEAT_SHOP, BAKERY, and FOOD_TRUCK
                        if (opt.type === "MEAT_SHOP" || opt.type === "BAKERY" || opt.type === "FOOD_TRUCK") {
                          setCustomerServiceMode("PICKUP");
                        }
                        setStep(2);
                      }}
                      className={
                        "relative w-full overflow-hidden rounded-2xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-pink-400/70 " +
                        (selected
                          ? "border-white/40 shadow-2xl"
                          : "border-black/30 shadow-xl hover:shadow-2xl")
                      }
                    >
                      <div className={"absolute inset-0 bg-gradient-to-r " + tileClass} />
                      <div className={selected ? "absolute inset-0 bg-white/10" : "absolute inset-0 bg-black/10"} />
                      <div className="relative p-4 sm:p-5">
                        <div className="flex items-center gap-3">
                          <div className={selected ? "rounded-xl bg-white/20 p-2" : "rounded-xl bg-black/20 p-2"}>
                            <Icon path={opt.icon} size={0.9} className="text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <div className="text-white font-extrabold leading-tight truncate">
                                {opt.title}
                              </div>
                              {opt.subText && (
                                <div className="text-white font-extrabold leading-tight whitespace-nowrap">
                                  / {opt.subText}
                                </div>
                              )}
                            </div>
                            <div className="text-white/85 text-xs sm:text-sm leading-snug line-clamp-2 mt-0.5">
                              {opt.hint}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <Card className="bg-[#171717] border-[#262626] shadow-xl">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Icon path={mdiTruck} size={0.9} className="text-pink-500" />
                  <h2 className="text-lg font-semibold text-white">
                    {t("home.scope.step2Title", { defaultValue: "Step 2: Choose order type" })}
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {["DELIVERY", "PICKUP", "RESERVATION"].map((mode) => {
                    const selected = customerServiceMode === mode;
                    const label =
                      mode === "PICKUP"
                        ? t("home.scope.modes.pickup", { defaultValue: "Pickup" })
                        : mode === "RESERVATION"
                          ? t("home.scope.modes.reservation", { defaultValue: "Reservation" })
                          : t("home.scope.modes.delivery", { defaultValue: "Delivery" });

                    return (
                      <Button
                        key={mode}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        className={selected
                          ? "h-12 w-full justify-center bg-pink-600 hover:bg-pink-700 border border-pink-500/40 text-white"
                          : "h-12 w-full justify-center bg-transparent border-[#404040] text-gray-200 hover:bg-white/5"}
                        onClick={() => {
                          setCustomerServiceMode(mode as any);
                        }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>

                {customerServiceMode !== "DELIVERY" ? (
                  <div className="mt-4">
                    <div className="text-sm text-gray-300 mb-2">
                      {t("home.scope.radiusLabel", { defaultValue: "Search radius (km)" })}
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={typedRadiusKm}
                      onChange={(e) => setTypedRadiusKm(e.target.value)}
                      onBlur={() => {
                        const n = Number(typedRadiusKm);
                        const nextRadius = !isNaN(n) && n > 0 ? n : 20;
                        setTypedRadiusKm(String(nextRadius));
                        setCustomerRadiusKm(nextRadius);
                      }}
                      className="bg-[#0f0f0f] text-white border-[#262626] h-12 text-base w-full"
                    />
                    <div className="text-xs text-gray-400 mt-2">
                      {t("home.scope.radiusHint", {
                        defaultValue: "We will show branches within this distance from your location.",
                      })}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card className="bg-[#171717] border-[#262626] shadow-xl lg:min-h-[360px]">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Icon path={mdiMapMarker} size={0.9} className="text-pink-500" />
                  <h2 className="text-lg font-semibold text-white">
                    {t("home.scope.step3Title", { defaultValue: "Step 3: Choose location" })}
                  </h2>
                </div>

                <div className="space-y-3">
                  <div className="w-full relative">
                    <Icon
                      path={mdiStore}
                      size={0.9}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <Input
                      ref={branchOrgInputRef}
                      type="text"
                      placeholder={t("findBranch.searchByBranchOrOrg", { defaultValue: "Search by branch or organization name..." })}
                      value={typedBranchOrgQuery}
                      onChange={(e) => {
                        setTypedBranchOrgQuery(e.target.value);
                        setShowBranchOrgSuggestions(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitBranchOrgQuery();
                          setShowBranchOrgSuggestions(false);
                        }
                      }}
                      onFocus={() => {
                        setBranchOrgFocused(true);
                        setShowBranchOrgSuggestions(true);
                      }}
                      onBlur={() => {
                        setBranchOrgFocused(false);
                        setTimeout(() => setShowBranchOrgSuggestions(false), 150);
                      }}
                      className="bg-[#0f0f0f] text-white border-[#262626] pl-10 h-12 text-base w-full"
                    />
                    {showBranchOrgSuggestions && branchOrgSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-[#404040] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {branchOrgSuggestions.map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#2a2a2a] transition-colors"
                            onClick={() => {
                              setTypedBranchOrgQuery(s.applyQuery);
                              setCustomerBranchSearchQuery(s.applyQuery);
                              setShowBranchOrgSuggestions(false);
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="w-full relative">
                    <Icon
                      path={mdiMapMarker}
                      size={0.9}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <Input
                      ref={addressInputRef}
                      type="text"
                      placeholder={t("findBranch.addressPlaceholder", { defaultValue: "Enter an address or location..." })}
                      value={typedAddress}
                      onChange={(e) => setTypedAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSearchAddress();
                        }
                      }}
                      className="bg-[#0f0f0f] text-white border-[#262626] pl-10 h-12 text-base w-full"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      onClick={handleSearchAddress}
                      disabled={isSearchingAddress || !typedAddress.trim()}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/30 h-12 px-4 sm:px-6"
                    >
                      {isSearchingAddress ? (
                        <>
                          <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                          <span className="hidden sm:inline">
                            {t("findBranch.searching", { defaultValue: "Searching..." })}
                          </span>
                          <span className="sm:hidden">{t("findBranch.searching", { defaultValue: "Searching..." })}</span>
                        </>
                      ) : (
                        <>
                          <Icon path={mdiMagnify} size={0.67} className="mr-2" />
                          <span className="hidden sm:inline whitespace-nowrap">
                            {t("findBranch.searchAddress", { defaultValue: "Search Address" })}
                          </span>
                          <span className="sm:hidden">{t("findBranch.searchAddress", { defaultValue: "Search" })}</span>
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleGetCurrentLocation}
                      disabled={isGettingLocation}
                      className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg shadow-pink-500/30 h-12 px-4 sm:px-6"
                    >
                      {isGettingLocation ? (
                        <>
                          <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                          <span className="hidden sm:inline">
                            {t("findBranch.gettingLocation", { defaultValue: "Getting Location..." })}
                          </span>
                          <span className="sm:hidden">{t("findBranch.gettingLocation", { defaultValue: "Getting..." })}</span>
                        </>
                      ) : (
                        <>
                          <Icon path={mdiNavigation} size={0.67} className="mr-2" />
                          <span className="hidden sm:inline whitespace-nowrap">
                            {t("findBranch.useMyLocation", { defaultValue: "Use My Location" })}
                          </span>
                          <span className="sm:hidden">{t("findBranch.useMyLocation", { defaultValue: "My Location" })}</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {customerLocation ? (
                    <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <Icon path={mdiMapMarker} size={0.83} className="text-green-500 shrink-0" />
                      <span className="text-sm text-green-400 font-medium">
                        {customerLocation.label ||
                          `${customerLocation.latitude.toFixed(4)}, ${customerLocation.longitude.toFixed(4)}`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">
                      {t("home.scope.noLocationYet", {
                        defaultValue: "We need your location to filter delivery branches.",
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-gray-400">
                      {loadingBranches
                        ? t("home.scope.loadingBranches", { defaultValue: "Loading branches..." })
                        : `${visibleBranches.length} ${t("home.scope.branchesAvailable", { defaultValue: "branches available" })}`}
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon path={mdiTruck} size={0.67} className="text-gray-400" />
                      <span className="text-xs text-gray-400">
                        {scopeModeLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step !== 1 ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-black/55 border-white/15 text-white hover:bg-black/70 backdrop-blur-md"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              >
                {t("common.back", { defaultValue: "Back" })}
              </Button>

              <Button
                variant="outline"
                className="w-full sm:w-auto bg-black/55 border-white/15 text-white hover:bg-black/70 backdrop-blur-md"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(STEP_STORAGE_KEY);
                  } catch {}
                  navigate("/home", { replace: true });
                }}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>

              {step === 2 ? (
                <Button
                  className="w-full sm:w-auto bg-pink-600 hover:bg-pink-700 text-white"
                  onClick={handleNextFromStep2}
                >
                  {t("common.next", { defaultValue: "Next" })}
                </Button>
              ) : (
                <Button
                  className="w-full sm:w-auto bg-pink-600 hover:bg-pink-700 text-white"
                  onClick={handleContinue}
                  disabled={loadingBranches || isSearchingAddress || isContinuing}
                >
                  {isContinuing ? (
                    <>
                      <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                      {t("common.continue", { defaultValue: "Continue" })}
                    </>
                  ) : (
                    t("common.continue", { defaultValue: "Continue" })
                  )}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </div>
  );
}
