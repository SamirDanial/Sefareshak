import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import {
  mdiCart,
  mdiContentSave,
  mdiCreditCard,
  mdiCurrencyUsd,
  mdiClock,
  mdiDelete,
  mdiMagnify,
  mdiNavigation,
  mdiOfficeBuilding,
  mdiPlus,
  mdiRefresh,
  mdiRestart,
  mdiShieldAlert,
  mdiStore,
  mdiTruck,
  mdiWeb,
} from "@mdi/js";

import QRCode from "qrcode";

import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import branchService, { type Branch } from "@/services/branchService";
import googlePlacesService, { type AddressComponents } from "@/services/googlePlacesService";

import PageHeader from "@/components/PageHeader";
import { toast } from "@/components/Toast";
import Switch from "@/components/Switch";
import ImageUpload from "@/components/ImageUpload";
import NumberInput from "@/components/NumberInput";

import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormData = Record<string, any>;

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

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

const APP_STATUS_ORDER = ["LIVE", "COMING_SOON", "MAINTENANCE", "OUT_OF_SERVICE"] as const;

const SettingsModern: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin, isOrgAdmin, rbacUser } = usePermissions();

  const [loading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgSettingsLoading, setOrgSettingsLoading] = useState(false);
  const timeOptions = useMemo(() => buildTimeOptions(15), []);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const [formData, setFormData] = useState<FormData>({});

  const [organizationMeta, setOrganizationMeta] = useState<{
    id: string;
    name: string;
    slug: string;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [countryLoading, setCountryLoading] = useState(false);
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [countryHasStates, setCountryHasStates] = useState(true);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [showStateSuggestions, setShowStateSuggestions] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [reverseGeocoding] = useState(false);

  const isDirtyRef = useRef(false);
  const prevLoadedOrgIdRef = useRef<string>("");

  const orgAdminOrganizationId = useMemo(() => {
    const id = (rbacUser as any)?.organizationId as string | null | undefined;
    return id && String(id).trim().length > 0 ? String(id) : "";
  }, [rbacUser]);

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem(ORG_STORAGE_KEY);
      return stored ? stored : "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    googlePlacesService.loadScript(() => {
      setGoogleLoaded(true);
    });
  }, []);

  useEffect(() => {
    const loadBranches = async () => {
      const token = (await getToken()) || undefined;
      if (!token) return;

      setBranchesLoading(true);
      try {
        const data = await branchService.getBranches(token);
        const allBranches = Array.isArray(data) ? data : [];
        const scopedBranches = selectedOrganizationId
          ? allBranches.filter((b) => String(b?.organizationId || "") === selectedOrganizationId)
          : allBranches;
        setBranches(scopedBranches);
      } catch {
        setBranches([]);
      } finally {
        setBranchesLoading(false);
      }
    };

    void loadBranches();
  }, [getToken, selectedOrganizationId]);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (isOrgAdmin && orgAdminOrganizationId) {
      setSelectedOrganizationId(orgAdminOrganizationId);
    }
  }, [isOrgAdmin, isSuperAdmin, orgAdminOrganizationId]);

  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const stored = window.localStorage.getItem(ORG_STORAGE_KEY) || "";
        if (stored && stored !== selectedOrganizationId) {
          setSelectedOrganizationId(stored);
        }
      } catch {
        // ignore
      }
    };

    const syncFromOrgChangedEvent = (event: Event) => {
      try {
        const nextId = String((event as CustomEvent)?.detail?.organizationId || "").trim();
        if (nextId && nextId !== selectedOrganizationId) {
          setSelectedOrganizationId(nextId);
          return;
        }
      } catch {
        // ignore
      }
      syncFromStorage();
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);
    window.addEventListener(ORG_CHANGED_EVENT, syncFromOrgChangedEvent as EventListener);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
      window.removeEventListener(ORG_CHANGED_EVENT, syncFromOrgChangedEvent as EventListener);
    };
  }, [selectedOrganizationId]);

  useEffect(() => {
    try {
      if (!selectedOrganizationId) return;
      window.localStorage.setItem(ORG_STORAGE_KEY, selectedOrganizationId);
    } catch {
      // ignore
    }
  }, [selectedOrganizationId]);

  const handleInputChange = useCallback((field: string, value: any) => {
    isDirtyRef.current = true;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const updatePeriodTime = useCallback((dayKey: string, periodIndex: number, type: "open" | "close", time: string) => {
    const periodsKey = `${dayKey}Periods`;
    setFormData((prev) => {
      const currentPeriods = (prev as any)[periodsKey] as Array<{ open: string; close: string }> | undefined;
      const periods = currentPeriods && Array.isArray(currentPeriods) && currentPeriods.length > 0
        ? currentPeriods
        : [{ open: "", close: "" }];
      
      const newPeriods = [...periods];
      while (newPeriods.length <= periodIndex) {
        newPeriods.push({ open: "9:00 AM", close: "10:00 PM" });
      }
      newPeriods[periodIndex] = {
        ...newPeriods[periodIndex],
        [type]: time,
      };
      
      isDirtyRef.current = true;
      return {
        ...prev,
        [periodsKey]: newPeriods,
      };
    });
  }, []);

  const addPeriod = useCallback((dayKey: string) => {
    const periodsKey = `${dayKey}Periods`;
    setFormData((prev) => {
      const currentPeriods = (prev as any)[periodsKey] as Array<{ open: string; close: string }> | undefined;
      const periods = currentPeriods && Array.isArray(currentPeriods) && currentPeriods.length > 0
        ? currentPeriods
        : [{ open: "", close: "" }];
      
      const newPeriods = [...periods, { open: "9:00 AM", close: "10:00 PM" }];
      
      isDirtyRef.current = true;
      return {
        ...prev,
        [periodsKey]: newPeriods,
      };
    });
  }, []);

  const removePeriod = useCallback((dayKey: string, periodIndex: number) => {
    const periodsKey = `${dayKey}Periods`;
    setFormData((prev) => {
      const currentPeriods = (prev as any)[periodsKey] as Array<{ open: string; close: string }> | undefined;
      const periods = currentPeriods && Array.isArray(currentPeriods) && currentPeriods.length > 0
        ? currentPeriods
        : [{ open: "", close: "" }];
      
      let newPeriods: Array<{ open: string; close: string }>;
      if (periods.length <= 1) {
        newPeriods = [{ open: "", close: "" }];
      } else {
        newPeriods = periods.filter((_, index) => index !== periodIndex);
      }
      
      isDirtyRef.current = true;
      return {
        ...prev,
        [periodsKey]: newPeriods,
      };
    });
  }, []);

  const handleAddressChange = useCallback(
    (components: AddressComponents) => {
      handleInputChange("country", components.country);
      handleInputChange("state", components.state);
      handleInputChange("city", components.city);
      handleInputChange("addressLineOne", components.addressLineOne);
      handleInputChange("latitude", components.latitude);
      handleInputChange("longitude", components.longitude);
      handleInputChange("businessAddress", components.formattedAddress);

      if (googleLoaded && components.country) {
        googlePlacesService.checkCountryHasStates(components.country, (hasStates) => {
          setCountryHasStates(hasStates);
        });
      }
    },
    [googleLoaded, handleInputChange]
  );

  const loadOrganizationSettings = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!selectedOrganizationId) return;

      const force = Boolean(opts?.force);
      const orgChanged = prevLoadedOrgIdRef.current !== selectedOrganizationId;
      if (orgChanged) {
        prevLoadedOrgIdRef.current = selectedOrganizationId;
        isDirtyRef.current = false;
      }

      const token = (await getToken()) || undefined;
      if (!token) return;

      setOrgSettingsLoading(true);
      try {
        const settings = await branchService.getOrganizationSettings(selectedOrganizationId, token);
        const data = (settings || {}) as any;

        if (isDirtyRef.current && !force && !orgChanged) {
          return;
        }

        setFormData({
          ...data,
          serviceType: data.serviceType ?? "RESTAURANT",
          acceptPayPal: data.acceptPayPal ?? false,
          acceptCash: data.acceptCash ?? true,
          acceptCard: data.acceptCard ?? true,
          acceptOnlinePayment: data.acceptOnlinePayment ?? false,
          pickupAcceptCash: data.pickupAcceptCash ?? true,
          pickupAcceptCard: data.pickupAcceptCard ?? true,
          pickupAcceptOnlinePayment: data.pickupAcceptOnlinePayment ?? false,
          pickupAcceptPayPal: data.pickupAcceptPayPal ?? false,
          pickupEnabled: data.pickupEnabled ?? true,
          deliveryEnabled: data.deliveryEnabled ?? true,
          orderPreparationTime: data.orderPreparationTime ?? 30,
          maxOrderQuantity: data.maxOrderQuantity ?? 10,
          allowExcludeOptionalIngredients: data.allowExcludeOptionalIngredients ?? true,
          orderMergeTimeframeMinutes: data.orderMergeTimeframeMinutes ?? 0,
          futureOrdersEnabled: data.futureOrdersEnabled ?? false,
          enableFuturePickupOrders: data.enableFuturePickupOrders ?? false,
          enableFutureDeliveryOrders: data.enableFutureDeliveryOrders ?? false,
          futurePickupOrderDays: data.futurePickupOrderDays ?? 0,
          futureDeliveryOrderDays: data.futureDeliveryOrderDays ?? 0,
          allowScheduledOrderMerge: data.allowScheduledOrderMerge ?? false,
          scheduledOrderMergeCutoffHours: data.scheduledOrderMergeCutoffHours ?? 2,
          scheduledOrderTimeSlotInterval: data.scheduledOrderTimeSlotInterval ?? 30,
          scheduledOrderMaxOrdersPerSlot: data.scheduledOrderMaxOrdersPerSlot ?? null,
          scheduledOrderAllowCancellation: data.scheduledOrderAllowCancellation ?? false,
          scheduledOrderCancellationWindowHours: data.scheduledOrderCancellationWindowHours ?? 0,
          scheduledOrderFullRefundHoursBefore: data.scheduledOrderFullRefundHoursBefore ?? 24,
          scheduledOrderPartialRefundHoursBefore: data.scheduledOrderPartialRefundHoursBefore ?? 12,
          scheduledOrderNoRefundHoursBefore: data.scheduledOrderNoRefundHoursBefore ?? 2,
          scheduledOrderPartialRefundPercentage: data.scheduledOrderPartialRefundPercentage ?? 50,
          scheduledOrderReducedRefundPercentage: data.scheduledOrderReducedRefundPercentage ?? 25,
          scheduledOrderAllowModification: data.scheduledOrderAllowModification ?? false,
          scheduledOrderModificationWindowHours: data.scheduledOrderModificationWindowHours ?? 0,
          scheduledOrderAllowShallowModification: data.scheduledOrderAllowShallowModification ?? false,
          scheduledOrderAutoConfirm: data.scheduledOrderAutoConfirm ?? true,
          scheduledOrderMinimumAmount: data.scheduledOrderMinimumAmount ?? 0,

          deliveryRadius: data.deliveryRadius ?? 5,
          deliveryRatePerKilometer: data.deliveryRatePerKilometer ?? 0,
          useDynamicDeliveryFee: data.useDynamicDeliveryFee ?? false,
          useTieredDeliveryFee: data.useTieredDeliveryFee ?? false,
          deliveryFee: data.deliveryFee ?? 0,
          initialDeliveryRange: data.initialDeliveryRange ?? 3,
          initialDeliveryPrice: data.initialDeliveryPrice ?? 2.0,
          extendedDeliveryThreshold: data.extendedDeliveryThreshold ?? null,
          extendedDeliveryRate: data.extendedDeliveryRate ?? null,
          deliveryTimeEstimate: data.deliveryTimeEstimate ?? 45,
          freeDeliveryThreshold: data.freeDeliveryThreshold ?? 50,
          enableFreeDelivery: data.enableFreeDelivery ?? false,
        });
      } catch (e: any) {
        toast.error(e?.message || t("admin.settings.loadError", { defaultValue: "Failed to load settings" }));
      } finally {
        setOrgSettingsLoading(false);
      }
    },
    [getToken, selectedOrganizationId, t]
  );

  useEffect(() => {
    // Always reload when selected organization changes.
    // This is required because the organization switcher in AdminLayout dispatches
    // a custom event and updates localStorage in the same tab (no `storage` event).
    // We also force reload on org changes to avoid "dirty" guard blocking updates.
    void loadOrganizationSettings({ force: true });
  }, [loadOrganizationSettings]);

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
        const slug = String(org?.slug || "").trim();
        if (!slug) {
          setOrganizationMeta(null);
          return;
        }
        setOrganizationMeta({ id: org.id, name: org.name, slug });
      } catch {
        setOrganizationMeta(null);
      }
    };

    void loadOrgMeta();
  }, [getToken, selectedOrganizationId]);

  const orgQrUrl = useMemo(() => {
    if (!organizationMeta?.slug) return "";
    try {
      const origin = window.location.origin;
      return `${origin}/?org=${encodeURIComponent(organizationMeta.slug)}`;
    } catch {
      return `/?org=${encodeURIComponent(organizationMeta.slug)}`;
    }
  }, [organizationMeta?.slug]);

  useEffect(() => {
    const buildQr = async () => {
      try {
        if (!orgQrUrl) {
          setQrDataUrl("");
          return;
        }
        const dataUrl = await QRCode.toDataURL(orgQrUrl, {
          width: 800,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(dataUrl);
      } catch {
        setQrDataUrl("");
      }
    };
    void buildQr();
  }, [orgQrUrl]);

  const handleCopyQrLink = useCallback(async () => {
    try {
      if (!orgQrUrl) return;
      await navigator.clipboard.writeText(orgQrUrl);
      toast.success(t("admin.settings.qrCode.linkCopied", { defaultValue: "Link copied" }));
    } catch {
      toast.error(t("admin.settings.qrCode.copyFailed", { defaultValue: "Failed to copy link" }));
    }
  }, [orgQrUrl, t]);

  const handleDownloadQr = useCallback(() => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qr-${organizationMeta?.slug || "org"}.png`;
    link.click();
  }, [qrDataUrl, organizationMeta?.slug]);

  const handlePrintQrPoster = useCallback(() => {
    try {
      if (!qrDataUrl || !orgQrUrl) return;

      const escapeHtml = (v: any) =>
        String(v ?? "")
          .split("&").join("&amp;")
          .split("<").join("&lt;")
          .split(">").join("&gt;")
          .split('"').join("&quot;")
          .split("'").join("&#039;");

      const titleRaw = (formData.businessName || organizationMeta?.name || "Organization").toString();
      const title = escapeHtml(titleRaw);
      const logoSrc = escapeHtml(formData.businessLogo || "");

      const posterSubtitle = escapeHtml(
        t("admin.settings.qrCode.posterSubtitle", {
          defaultValue: "Scan to order online",
        })
      );
      const posterHint = escapeHtml(
        t("admin.settings.qrCode.posterHint", {
          defaultValue: "Open your camera and scan this QR code to view the menu and choose a branch.",
        })
      );

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4; margin: 18mm; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111827; }
      .wrap { display: flex; flex-direction: column; gap: 18px; align-items: center; }
      .header { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
      .logo { width: 72px; height: 72px; border-radius: 16px; object-fit: cover; }
      .title { font-size: 28px; font-weight: 800; margin: 0; }
      .subtitle { font-size: 16px; margin: 0; color: #374151; }
      .qr { width: 320px; height: 320px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 18px; padding: 12px; }
      .hint { font-size: 14px; color: #374151; text-align: center; max-width: 520px; }
      .link { font-size: 12px; color: #6b7280; word-break: break-all; text-align: center; max-width: 520px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Logo" />` : ""}
        <h1 class="title">${title}</h1>
        <p class="subtitle">${posterSubtitle}</p>
      </div>
      <img class="qr" src="${qrDataUrl}" alt="QR" />
      <div class="hint">${posterHint}</div>
      <div class="link">${escapeHtml(orgQrUrl)}</div>
    </div>
    <script>
      try { document.title = ""; } catch (e) {}
    </script>
  </body>
</html>`;

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.setAttribute("aria-hidden", "true");

      const cleanup = () => {
        try {
          iframe.onload = null;
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch {
          // ignore
        }
      };

      iframe.onload = () => {
        try {
          const doc = iframe.contentWindow?.document;
          if (!doc) {
            cleanup();
            return;
          }
          doc.open();
          doc.write(html);
          doc.close();

          setTimeout(() => {
            try {
              iframe.contentWindow?.print();
            } catch {
              // ignore
            }
            setTimeout(cleanup, 500);
          }, 200);
        } catch {
          cleanup();
        }
      };

      document.body.appendChild(iframe);
    } catch (e) {
      console.error("Print error:", e);
    }
  }, [qrDataUrl, orgQrUrl, formData.businessName, formData.businessLogo, organizationMeta?.name, t]);

  const getCurrentLocation = useCallback(() => {
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

  const handleCountryInputChange = useCallback(
    (value: string) => {
      handleInputChange("country", value);

      if (value.length >= 2 && googleLoaded) {
        setShowCountrySuggestions(true);
        googlePlacesService.searchCountries(
          value,
          (countries) => {
            setCountrySuggestions(countries);
            const trimmedValue = value.trim();
            const exactMatch = countries.find((c) => c.toLowerCase() === trimmedValue.toLowerCase());
            if (exactMatch && googleLoaded) {
              googlePlacesService.checkCountryHasStates(exactMatch, (hasStates) => {
                setCountryHasStates(hasStates);
              });
            }
          },
          (loadingNext) => {
            setCountryLoading(loadingNext);
          }
        );
      } else {
        setCountrySuggestions([]);
        setShowCountrySuggestions(false);
        setCountryLoading(false);
      }
    },
    [googleLoaded, handleInputChange]
  );

  const handleCountrySelect = useCallback(
    (country: string) => {
      handleInputChange("country", country);
      handleInputChange("state", "");
      setCountrySuggestions([]);
      setShowCountrySuggestions(false);
      setCountryLoading(false);
      setStateSuggestions([]);
      setShowStateSuggestions(false);

      if (googleLoaded && country) {
        googlePlacesService.checkCountryHasStates(country, (hasStates) => {
          setCountryHasStates(hasStates);
        });
      } else {
        setCountryHasStates(true);
      }
    },
    [googleLoaded, handleInputChange]
  );

  const handleStateInputChange = useCallback(
    (value: string) => {
      handleInputChange("state", value);

      if (value.length >= 1 && googleLoaded && formData.country && countryHasStates) {
        setShowStateSuggestions(true);
        googlePlacesService.searchStates(
          value,
          formData.country,
          (states) => {
            setStateSuggestions(states);
          },
          (loadingNext) => {
            setStateLoading(loadingNext);
          }
        );
      } else {
        setStateSuggestions([]);
        setShowStateSuggestions(false);
        setStateLoading(false);
      }
    },
    [googleLoaded, formData.country, countryHasStates, handleInputChange]
  );

  const handleStateSelect = useCallback(
    (state: string) => {
      handleInputChange("state", state);
      handleInputChange("city", "");
      setStateSuggestions([]);
      setShowStateSuggestions(false);
      setStateLoading(false);
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    },
    [handleInputChange]
  );

  const handleCityInputChange = useCallback(
    (value: string) => {
      handleInputChange("city", value);

      if (value.length >= 1 && googleLoaded && formData.country) {
        setShowCitySuggestions(true);
        googlePlacesService.searchCities(
          value,
          formData.country,
          (cities) => {
            setCitySuggestions(cities);
          },
          formData.state || undefined,
          (loadingNext) => {
            setCityLoading(loadingNext);
          }
        );
      } else {
        setCitySuggestions([]);
        setShowCitySuggestions(false);
        setCityLoading(false);
      }
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    },
    [googleLoaded, formData.country, formData.state, handleInputChange]
  );

  const handleCitySelect = useCallback(
    (city: string) => {
      handleInputChange("city", city);
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      setCityLoading(false);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    },
    [handleInputChange]
  );

  const handleAddressInputChange = useCallback(
    (value: string) => {
      handleInputChange("addressLineOne", value);

      if (value.length >= 1 && googleLoaded && formData.country && formData.city) {
        setShowAddressSuggestions(true);
        googlePlacesService.searchAddresses(
          value,
          formData.country,
          formData.city,
          formData.state || undefined,
          (addresses) => {
            setAddressSuggestions(addresses);
          },
          (loadingNext) => {
            setAddressLoading(loadingNext);
          }
        );
      } else {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
        setAddressLoading(false);
      }
    },
    [googleLoaded, formData.country, formData.city, formData.state, handleInputChange]
  );

  const handleAddressSelect = useCallback(
    (address: string) => {
      handleInputChange("addressLineOne", address);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setAddressLoading(false);
    },
    [handleInputChange]
  );

  const handleSave = useCallback(async () => {
    if (!selectedOrganizationId) {
      toast.error(t("admin.organizations.select", { defaultValue: "Select organization" }));
      return;
    }

    const token = (await getToken()) || undefined;
    if (!token) return;

    setSaving(true);
    try {
      const payload: any = { ...formData };
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.organizationId;
      delete payload.organization;

      const saved = await branchService.upsertOrganizationSettings(selectedOrganizationId, payload, token);
      isDirtyRef.current = false;
      setFormData((prev) => ({
        ...prev,
        ...(saved as any),
      }));
      toast.success(t("admin.settings.saveSuccess"));
    } catch (e: any) {
      toast.error(e?.message || t("admin.settings.saveError"));
    } finally {
      setSaving(false);
    }
  }, [formData, getToken, selectedOrganizationId, t]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      isDirtyRef.current = false;
      await loadOrganizationSettings({ force: true });
      toast.success(t("admin.settings.resetSuccess"));
    } catch {
      toast.error(t("admin.settings.resetError"));
    } finally {
      setSaving(false);
    }
  }, [loadOrganizationSettings, t]);

  const accessDenied = !isSuperAdmin && !isOrgAdmin;
  const isBusy = loading || saving || orgSettingsLoading || branchesLoading;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold text-pink-500">{t("admin.settings.title")}</h2>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">{t("admin.settings.loading")}</span>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.settings.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("admin.settings.loadingDescription")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return <div className="text-sm text-muted-foreground">{t("common.accessDenied")}</div>;
  }

  return (
    <div className="p-6 space-y-6 overflow-x-hidden">
      <PageHeader
        title={t("admin.settings.title")}
        description={t("admin.settings.description")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isBusy || !selectedOrganizationId}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon path={mdiRestart} size={0.67} className="mr-2" />
              {t("admin.settings.resetToDefaults")}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isBusy || !selectedOrganizationId}
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {saving ? (
                <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
              ) : (
                <Icon path={mdiContentSave} size={0.67} className="mr-2" />
              )}
              {t("admin.settings.saveChanges")}
            </Button>
          </>
        }
      />

      <div className="grid gap-6">
        <CollapsibleCard
          icon={<Icon path={mdiStore} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.businessInformation.title")}
          description={t("admin.settings.businessInformation.description")}
          defaultOpen
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">{t("admin.settings.businessInformation.businessName")}</Label>
                <Input
                  id="businessName"
                  value={formData.businessName || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleInputChange("businessName", e.target.value)
                  }
                  placeholder={t("admin.settings.businessInformation.businessNamePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceType">{t("admin.serviceType.label", { defaultValue: "Service type" })}</Label>
                <Select
                  value={String(formData.serviceType || "RESTAURANT")}
                  onValueChange={(value: string) => handleInputChange("serviceType", value)}
                  disabled={isBusy}
                >
                  <SelectTrigger id="serviceType" className="w-full bg-transparent">
                    <SelectValue
                      placeholder={t("admin.serviceType.restaurant", { defaultValue: "Restaurant" })}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="RESTAURANT">
                      {t("admin.serviceType.restaurant", { defaultValue: "Restaurant" })}
                    </SelectItem>
                    <SelectItem value="MEAT_SHOP">
                      {t("admin.serviceType.meatShop", { defaultValue: "Meat shop" })}
                    </SelectItem>
                    <SelectItem value="BAKERY">
                      {t("admin.serviceType.bakery", { defaultValue: "Bakery" })}
                    </SelectItem>
                    <SelectItem value="FOOD_TRUCK">
                      {t("admin.serviceType.foodTruck", { defaultValue: "Food truck" })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessEmail">{t("admin.settings.businessInformation.businessEmail")}</Label>
                <Input
                  id="businessEmail"
                  value={formData.businessEmail || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleInputChange("businessEmail", e.target.value)
                  }
                  placeholder={t("admin.settings.businessInformation.businessEmailPlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessPhone">{t("admin.settings.businessInformation.businessPhone")}</Label>
                <Input
                  id="businessPhone"
                  value={formData.businessPhone || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleInputChange("businessPhone", e.target.value)
                  }
                  placeholder={t("admin.settings.businessInformation.businessPhonePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>
                  {t("admin.settings.businessInformation.businessLogo", { defaultValue: "Business logo" })}
                </Label>
                <div className="text-xs text-muted-foreground mb-2">
                  {t("admin.settings.businessInformation.businessLogoHint", { defaultValue: "Upload your business logo or provide a URL. Recommended size: 512x512px." })}
                </div>
                <ImageUpload
                  value={formData.businessLogo || ""}
                  onChange={(v) => handleInputChange("businessLogo", v)}
                  disabled={isBusy}
                  translationNamespace="admin.settings"
                />
              </div>
            </div>

            <div className="h-px bg-border" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold">
                  {t("admin.settings.businessInformation.addressInformation")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("admin.settings.businessInformation.addressInformationDescription", {
                    defaultValue: "Set your address and coordinates.",
                  })}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={getCurrentLocation}
                disabled={gettingLocation || !googleLoaded || isBusy}
                className="gap-2 bg-transparent"
              >
                {gettingLocation ? (
                  <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
                ) : (
                  <Icon path={mdiNavigation} size={0.67} />
                )}
                {gettingLocation
                  ? t("admin.settings.businessInformation.gettingLocation")
                  : t("admin.settings.businessInformation.useGPS")}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">{t("admin.settings.businessInformation.country")}</Label>
                <div className="relative">
                  <Input
                    id="country"
                    value={formData.country || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleCountryInputChange(e.target.value)
                    }
                    onFocus={() => {
                      if (formData.country && String(formData.country).length >= 2) setShowCountrySuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowCountrySuggestions(false), 200);
                    }}
                    placeholder={t("admin.settings.businessInformation.countryPlaceholder")}
                    className="pr-8"
                    disabled={isBusy}
                  />
                  {countryLoading ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                  {showCountrySuggestions && countrySuggestions.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {countrySuggestions.map((country, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleCountrySelect(country)}
                          className="w-full text-left px-4 py-2 hover:bg-muted text-sm first:rounded-t-lg last:rounded-b-lg"
                        >
                          {country}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {countryHasStates ? (
                <div className="space-y-2">
                  <Label htmlFor="state">{t("admin.settings.businessInformation.stateProvince")}</Label>
                  <div className="relative">
                    <Input
                      id="state"
                      value={formData.state || ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleStateInputChange(e.target.value)
                      }
                      onFocus={() => {
                        if (formData.state && String(formData.state).length >= 1) setShowStateSuggestions(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowStateSuggestions(false), 200);
                      }}
                      placeholder={t("admin.settings.businessInformation.stateProvincePlaceholder")}
                      className="pr-8"
                      disabled={isBusy || !formData.country}
                    />
                    {stateLoading ? (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                      </div>
                    ) : null}
                    {showStateSuggestions && stateSuggestions.length > 0 ? (
                      <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                        {stateSuggestions.map((state, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleStateSelect(state)}
                            className="w-full text-left px-4 py-2 hover:bg-muted text-sm first:rounded-t-lg last:rounded-b-lg"
                          >
                            {state}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="city">{t("admin.settings.businessInformation.city")}</Label>
                <div className="relative">
                  <Input
                    id="city"
                    value={formData.city || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleCityInputChange(e.target.value)
                    }
                    onFocus={() => {
                      if (formData.city && String(formData.city).length >= 1) setShowCitySuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowCitySuggestions(false), 200);
                    }}
                    placeholder={t("admin.settings.businessInformation.cityPlaceholder")}
                    className="pr-8"
                    disabled={isBusy || !formData.country}
                  />
                  {cityLoading ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                  {showCitySuggestions && citySuggestions.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {citySuggestions.map((city, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleCitySelect(city)}
                          className="w-full text-left px-4 py-2 hover:bg-muted text-sm first:rounded-t-lg last:rounded-b-lg"
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="addressLineOne">{t("admin.settings.businessInformation.addressLineOne")}</Label>
                <div className="relative">
                  <Input
                    id="addressLineOne"
                    value={formData.addressLineOne || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleAddressInputChange(e.target.value)
                    }
                    onFocus={() => {
                      if (formData.addressLineOne && String(formData.addressLineOne).length >= 1)
                        setShowAddressSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowAddressSuggestions(false), 200);
                    }}
                    placeholder={t("admin.settings.businessInformation.addressLineOnePlaceholder")}
                    className="pr-8"
                    disabled={isBusy || !formData.city || !formData.country}
                  />
                  {addressLoading ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                  {showAddressSuggestions && addressSuggestions.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {addressSuggestions.map((address, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleAddressSelect(address)}
                          className="w-full text-left px-4 py-2 hover:bg-muted text-sm first:rounded-t-lg last:rounded-b-lg"
                        >
                          {address}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="latitude">{t("admin.settings.businessInformation.latitude")}</Label>
                <div className="relative">
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    value={formData.latitude || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleInputChange("latitude", e.target.value)
                    }
                    placeholder={t("admin.settings.businessInformation.latitudePlaceholder")}
                    className="pr-8"
                    disabled={isBusy}
                  />
                  {reverseGeocoding ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="longitude">{t("admin.settings.businessInformation.longitude")}</Label>
                <div className="relative">
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    value={formData.longitude || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleInputChange("longitude", e.target.value)
                    }
                    placeholder={t("admin.settings.businessInformation.longitudePlaceholder")}
                    className="pr-8"
                    disabled={isBusy}
                  />
                  {reverseGeocoding ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon path={mdiRefresh} size={0.67} className="animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="businessAddress">{t("admin.settings.businessInformation.fullAddress")}</Label>
                <Textarea
                  id="businessAddress"
                  value={formData.businessAddress || ""}
                  readOnly
                  rows={2}
                  placeholder={t("admin.settings.businessInformation.fullAddressPlaceholder")}
                  disabled={isBusy}
                  className="bg-muted"
                />
              </div>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiMagnify} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.seo.title", { defaultValue: "SEO Customization" })}
          description={t("admin.settings.seo.description", {
            defaultValue: "Customize how your organization appears in search results and link previews.",
          })}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seoTitle">{t("admin.settings.seo.seoTitle", { defaultValue: "SEO Title" })}</Label>
              <div className="text-xs text-muted-foreground">
                {t("admin.settings.seo.seoTitleHint", {
                  defaultValue:
                    "Shown in the browser tab and often used as the headline in Google and link previews.",
                })}
              </div>
              <Input
                id="seoTitle"
                value={formData.seoTitle ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange("seoTitle", e.target.value)
                }
                placeholder={t("admin.settings.seo.seoTitlePlaceholder", { defaultValue: "e.g. Downtown Branch - Order Online" })}
                disabled={isBusy}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seoDescription">{t("admin.settings.seo.seoDescription", { defaultValue: "SEO Description" })}</Label>
              <div className="text-xs text-muted-foreground">
                {t("admin.settings.seo.seoDescriptionHint", {
                  defaultValue:
                    "Short summary used for search results and link previews (aim for 1–2 sentences).",
                })}
              </div>
              <Textarea
                id="seoDescription"
                value={formData.seoDescription ?? ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleInputChange("seoDescription", e.target.value)
                }
                placeholder={t("admin.settings.seo.seoDescriptionPlaceholder", {
                  defaultValue: "Describe your restaurant for search and link previews",
                })}
                rows={3}
                className="bg-transparent"
                disabled={isBusy}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("admin.settings.seo.ogImage", { defaultValue: "Share Image (OG)" })}</Label>
              <div className="text-xs text-muted-foreground">
                {t("admin.settings.seo.ogImageHint", {
                  defaultValue:
                    "Image used when your link is shared (WhatsApp, Facebook, etc.). Recommended: 1200×630.",
                })}
              </div>
              <ImageUpload
                value={formData.seoOgImage || ""}
                onChange={(v) => handleInputChange("seoOgImage", v)}
                disabled={isBusy}
                translationNamespace="admin.settings"
              />
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiWeb} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.qrCode.title", { defaultValue: "Organization QR Code" })}
          description={t("admin.settings.qrCode.description", {
            defaultValue:
              "Generate a QR code link customers can scan to open your branded ordering experience.",
          })}
        >
          <div className="space-y-4">
            {!organizationMeta?.slug ? (
              <div className="text-sm text-muted-foreground">
                {t("admin.settings.qrCode.missingSlug", {
                  defaultValue: "Organization slug is required to generate QR code.",
                })}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t("admin.settings.qrCode.link", { defaultValue: "Link" })}</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input value={orgQrUrl} readOnly className="bg-muted" />
                    <Button type="button" variant="outline" onClick={handleCopyQrLink}>
                      {t("common.copy", { defaultValue: "Copy" })}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Organization QR"
                      className="h-64 w-64 rounded-xl border bg-white p-3"
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {t("admin.settings.qrCode.generating", { defaultValue: "Generating QR code..." })}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button type="button" onClick={handlePrintQrPoster} disabled={!qrDataUrl}>
                      {t("admin.settings.qrCode.print", { defaultValue: "Print poster" })}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleDownloadQr} disabled={!qrDataUrl}>
                      {t("admin.settings.qrCode.download", { defaultValue: "Download PNG" })}
                    </Button>
                  </div>

                  <div className="text-xs text-muted-foreground text-center max-w-xl">
                    {t("admin.settings.qrCode.note", { defaultValue: "Tip: print on A4 and place near the entrance or tables." })}
                  </div>
                </div>
              </>
            )}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiCurrencyUsd} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.financialSettings.title")}
          description={t("admin.settings.financialSettings.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxPercentage">{t("admin.settings.financialSettings.taxPercentage")}</Label>
                <NumberInput
                  id="taxPercentage"
                  value={Number(formData.taxPercentage ?? 0)}
                  onChange={(value) => handleInputChange("taxPercentage", value)}
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t("admin.settings.financialSettings.taxPercentagePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceTaxPercentage">{t("admin.settings.financialSettings.serviceTaxPercentage")}</Label>
                <NumberInput
                  id="serviceTaxPercentage"
                  value={Number(formData.serviceTaxPercentage ?? 0)}
                  onChange={(value) => handleInputChange("serviceTaxPercentage", value)}
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t("admin.settings.financialSettings.serviceTaxPercentagePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryTaxPercentage">{t("admin.settings.financialSettings.deliveryTaxPercentage")}</Label>
                <NumberInput
                  id="deliveryTaxPercentage"
                  value={Number(formData.deliveryTaxPercentage ?? 0)}
                  onChange={(value) => handleInputChange("deliveryTaxPercentage", value)}
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t("admin.settings.financialSettings.deliveryTaxPercentagePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryFee">{t("admin.settings.financialSettings.deliveryFee")}</Label>
                <NumberInput
                  id="deliveryFee"
                  value={Number(formData.deliveryFee ?? 0)}
                  onChange={(value) => handleInputChange("deliveryFee", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.financialSettings.deliveryFeePlaceholder")}
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="taxInclusive"
                checked={Boolean(formData.taxInclusive)}
                onCheckedChange={(checked: boolean) => handleInputChange("taxInclusive", checked)}
                disabled={isBusy}
              />
              <Label htmlFor="taxInclusive">{t("admin.settings.financialSettings.taxInclusive")}</Label>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">{t("admin.settings.financialSettings.asapMinimumOrderTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("admin.settings.financialSettings.asapMinimumOrderDescription")}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minimumOrderAmount">{t("admin.settings.financialSettings.minimumOrderAmount")}</Label>
                <NumberInput
                  id="minimumOrderAmount"
                  value={Number(formData.minimumOrderAmount ?? 0)}
                  onChange={(value) => handleInputChange("minimumOrderAmount", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.financialSettings.minimumOrderAmountPlaceholder")}
                  disabled={saving}
                />
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableMinimumOrder"
                    checked={Boolean(formData.enableMinimumOrder)}
                    onCheckedChange={(checked: boolean) => handleInputChange("enableMinimumOrder", checked)}
                    disabled={isBusy}
                  />
                  <Label htmlFor="enableMinimumOrder">{t("admin.settings.financialSettings.enableMinimumOrder")}</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">{t("admin.settings.financialSettings.currency")}</Label>
                <Select
                  value={String(formData.currency || "USD")}
                  onValueChange={(value: string) => handleInputChange("currency", value)}
                  disabled={isBusy}
                >
                  <SelectTrigger id="currency" className="w-full bg-transparent">
                    <SelectValue placeholder={t("admin.settings.financialSettings.selectCurrency")} />
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

        <CollapsibleCard
          icon={<Icon path={mdiCart} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.orderSettings.title")}
          description={t("admin.settings.orderSettings.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5 flex-1 pr-4">
                  <Label htmlFor="pickupEnabled" className="text-sm font-medium">
                    {t("admin.settings.orderSettings.pickupEnabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.settings.orderSettings.pickupEnabledDescription")}
                  </p>
                </div>
                <Switch
                  id="pickupEnabled"
                  checked={(formData as any).pickupEnabled !== false}
                  onCheckedChange={(checked: boolean) => handleInputChange("pickupEnabled", checked)}
                  disabled={isBusy}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5 flex-1 pr-4">
                  <Label htmlFor="deliveryEnabled" className="text-sm font-medium">
                    {t("admin.settings.orderSettings.deliveryEnabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.settings.orderSettings.deliveryEnabledDescription")}
                  </p>
                </div>
                <Switch
                  id="deliveryEnabled"
                  checked={(formData as any).deliveryEnabled !== false}
                  onCheckedChange={(checked: boolean) => handleInputChange("deliveryEnabled", checked)}
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderPreparationTime">{t("admin.settings.orderSettings.orderPreparationTime")}</Label>
                <NumberInput
                  id="orderPreparationTime"
                  value={Number((formData as any).orderPreparationTime ?? 30)}
                  onChange={(value) => handleInputChange("orderPreparationTime", value)}
                  allowDecimals={false}
                  min={1}
                  placeholder={t("admin.settings.orderSettings.orderPreparationTimePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxOrderQuantity">{t("admin.settings.orderSettings.maxOrderQuantity")}</Label>
                <NumberInput
                  id="maxOrderQuantity"
                  value={Number((formData as any).maxOrderQuantity ?? 10)}
                  onChange={(value) => handleInputChange("maxOrderQuantity", value)}
                  allowDecimals={false}
                  min={1}
                  placeholder={t("admin.settings.orderSettings.maxOrderQuantityPlaceholder")}
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5 flex-1 pr-4">
                <Label htmlFor="allowExcludeOptionalIngredients" className="text-sm font-medium">
                  {t("admin.settings.orderSettings.allowExcludeOptionalIngredients")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("admin.settings.orderSettings.allowExcludeOptionalIngredientsDescription")}
                </p>
              </div>
              <Switch
                id="allowExcludeOptionalIngredients"
                checked={(formData as any).allowExcludeOptionalIngredients !== false}
                onCheckedChange={(checked: boolean) => handleInputChange("allowExcludeOptionalIngredients", checked)}
                disabled={isBusy}
              />
            </div>

            <div className="h-px bg-border my-2" />

            <div className="space-y-2">
              <Label htmlFor="orderMergeTimeframeMinutes">{t("admin.settings.orderSettings.orderMergeTimeframe")}</Label>
              <NumberInput
                id="orderMergeTimeframeMinutes"
                value={Number((formData as any).orderMergeTimeframeMinutes ?? 0)}
                onChange={(value) => handleInputChange("orderMergeTimeframeMinutes", value)}
                allowDecimals={false}
                min={0}
                max={120}
                placeholder="10"
                disabled={isBusy}
              />
              <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.orderMergeTimeframeDescription")}</p>
            </div>

            <div className="h-px bg-border my-2" />

            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">{t("admin.settings.orderSettings.futureOrders.title")}</Label>
                <p className="text-sm text-muted-foreground">{t("admin.settings.orderSettings.futureOrders.description")}</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5 flex-1 pr-4">
                  <Label htmlFor="futureOrdersEnabled" className="text-sm font-medium">
                    {t("admin.settings.orderSettings.futureOrders.enabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.futureOrders.enabledDescription")}</p>
                </div>
                <Switch
                  id="futureOrdersEnabled"
                  checked={Boolean((formData as any).futureOrdersEnabled)}
                  onCheckedChange={(checked: boolean) => handleInputChange("futureOrdersEnabled", checked)}
                  disabled={isBusy}
                />
              </div>

              {(formData as any).futureOrdersEnabled ? (
                <>
                  <div className="rounded-lg border border-border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enableFuturePickupOrders" className="text-sm font-medium">
                          {t("admin.settings.orderSettings.futureOrders.enablePickup")}
                        </Label>
                        <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.futureOrders.enablePickupDescription")}</p>
                      </div>
                      <Switch
                        id="enableFuturePickupOrders"
                        checked={Boolean((formData as any).enableFuturePickupOrders)}
                        onCheckedChange={(checked: boolean) => handleInputChange("enableFuturePickupOrders", checked)}
                        disabled={isBusy}
                      />
                    </div>

                    {(formData as any).enableFuturePickupOrders ? (
                      <div className="space-y-2">
                        <Label htmlFor="futurePickupOrderDays">{t("admin.settings.orderSettings.futureOrders.maxDaysPickup")}</Label>
                        <NumberInput
                          id="futurePickupOrderDays"
                          value={Number((formData as any).futurePickupOrderDays ?? 0)}
                          onChange={(value) => handleInputChange("futurePickupOrderDays", value)}
                          allowDecimals={false}
                          min={0}
                          max={365}
                          placeholder="7"
                          disabled={isBusy}
                        />
                        <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.futureOrders.maxDaysDescription")}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enableFutureDeliveryOrders" className="text-sm font-medium">
                          {t("admin.settings.orderSettings.futureOrders.enableDelivery")}
                        </Label>
                        <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.futureOrders.enableDeliveryDescription")}</p>
                      </div>
                      <Switch
                        id="enableFutureDeliveryOrders"
                        checked={Boolean((formData as any).enableFutureDeliveryOrders)}
                        onCheckedChange={(checked: boolean) => handleInputChange("enableFutureDeliveryOrders", checked)}
                        disabled={isBusy}
                      />
                    </div>

                    {(formData as any).enableFutureDeliveryOrders ? (
                      <div className="space-y-2">
                        <Label htmlFor="futureDeliveryOrderDays">{t("admin.settings.orderSettings.futureOrders.maxDaysDelivery")}</Label>
                        <NumberInput
                          id="futureDeliveryOrderDays"
                          value={Number((formData as any).futureDeliveryOrderDays ?? 0)}
                          onChange={(value) => handleInputChange("futureDeliveryOrderDays", value)}
                          allowDecimals={false}
                          min={0}
                          max={365}
                          placeholder="3"
                          disabled={isBusy}
                        />
                        <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.futureOrders.maxDaysDescription")}</p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="h-px bg-border my-2" />

            {(formData as any).futureOrdersEnabled ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">{t("admin.settings.orderSettings.scheduledOrderMerge.title")}</Label>
                  <p className="text-sm text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderMerge.description")}</p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="allowScheduledOrderMerge" className="text-sm font-medium">
                        {t("admin.settings.orderSettings.scheduledOrderMerge.enable")}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderMerge.enableDescription")}</p>
                    </div>
                    <Switch
                      id="allowScheduledOrderMerge"
                      checked={Boolean((formData as any).allowScheduledOrderMerge)}
                      onCheckedChange={(checked: boolean) => handleInputChange("allowScheduledOrderMerge", checked)}
                      disabled={isBusy}
                    />
                  </div>

                  {(formData as any).allowScheduledOrderMerge ? (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderMergeCutoffHours">{t("admin.settings.orderSettings.scheduledOrderMerge.cutoffHours")}</Label>
                      <NumberInput
                        id="scheduledOrderMergeCutoffHours"
                        value={Number((formData as any).scheduledOrderMergeCutoffHours ?? 2)}
                        onChange={(value) => handleInputChange("scheduledOrderMergeCutoffHours", value)}
                        allowDecimals={false}
                        min={1}
                        max={48}
                        placeholder="2"
                        disabled={isBusy}
                      />
                      <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderMerge.cutoffHoursDescription")}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(formData as any).futureOrdersEnabled ? <div className="h-px bg-border my-2" /> : null}

            {(formData as any).futureOrdersEnabled ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">{t("admin.settings.orderSettings.scheduledOrderManagement.title")}</Label>
                  <p className="text-sm text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderManagement.description")}</p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduledOrderAllowCancellation" className="text-sm font-medium">
                        {t("admin.settings.orderSettings.scheduledOrderManagement.cancellation.enable")}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderManagement.cancellation.enableDescription")}</p>
                    </div>
                    <Switch
                      id="scheduledOrderAllowCancellation"
                      checked={Boolean((formData as any).scheduledOrderAllowCancellation)}
                      onCheckedChange={(checked: boolean) => handleInputChange("scheduledOrderAllowCancellation", checked)}
                      disabled={isBusy}
                    />
                  </div>

                  {(formData as any).scheduledOrderAllowCancellation ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="scheduledOrderCancellationWindowHours">{t("admin.settings.orderSettings.scheduledOrderManagement.cancellation.windowHours")}</Label>
                        <NumberInput
                          id="scheduledOrderCancellationWindowHours"
                          value={Number((formData as any).scheduledOrderCancellationWindowHours ?? 0)}
                          onChange={(value) => handleInputChange("scheduledOrderCancellationWindowHours", value)}
                          allowDecimals={false}
                          min={0}
                          max={168}
                          placeholder="0"
                          disabled={isBusy}
                        />
                      </div>

                      <div className="h-px bg-border my-2" />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderFullRefundHoursBefore">{t("admin.settings.orderSettings.scheduledOrderManagement.refund.fullHoursBefore")}</Label>
                          <NumberInput
                            id="scheduledOrderFullRefundHoursBefore"
                            value={Number((formData as any).scheduledOrderFullRefundHoursBefore ?? 24)}
                            onChange={(value) => handleInputChange("scheduledOrderFullRefundHoursBefore", value)}
                            allowDecimals={false}
                            min={0}
                            max={720}
                            placeholder="24"
                            disabled={isBusy}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderPartialRefundHoursBefore">{t("admin.settings.orderSettings.scheduledOrderManagement.refund.partialHoursBefore")}</Label>
                          <NumberInput
                            id="scheduledOrderPartialRefundHoursBefore"
                            value={Number((formData as any).scheduledOrderPartialRefundHoursBefore ?? 12)}
                            onChange={(value) => handleInputChange("scheduledOrderPartialRefundHoursBefore", value)}
                            allowDecimals={false}
                            min={0}
                            max={720}
                            placeholder="12"
                            disabled={isBusy}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderNoRefundHoursBefore">{t("admin.settings.orderSettings.scheduledOrderManagement.refund.noRefundHoursBefore")}</Label>
                          <NumberInput
                            id="scheduledOrderNoRefundHoursBefore"
                            value={Number((formData as any).scheduledOrderNoRefundHoursBefore ?? 2)}
                            onChange={(value) => handleInputChange("scheduledOrderNoRefundHoursBefore", value)}
                            allowDecimals={false}
                            min={0}
                            max={720}
                            placeholder="2"
                            disabled={isBusy}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderPartialRefundPercentage">{t("admin.settings.orderSettings.scheduledOrderManagement.refund.partialPercentage")}</Label>
                          <NumberInput
                            id="scheduledOrderPartialRefundPercentage"
                            value={Number((formData as any).scheduledOrderPartialRefundPercentage ?? 50)}
                            onChange={(value) => handleInputChange("scheduledOrderPartialRefundPercentage", value)}
                            allowDecimals={false}
                            min={0}
                            max={100}
                            placeholder="50"
                            disabled={isBusy}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="scheduledOrderReducedRefundPercentage">{t("admin.settings.orderSettings.scheduledOrderManagement.refund.reducedPercentage")}</Label>
                          <NumberInput
                            id="scheduledOrderReducedRefundPercentage"
                            value={Number((formData as any).scheduledOrderReducedRefundPercentage ?? 25)}
                            onChange={(value) => handleInputChange("scheduledOrderReducedRefundPercentage", value)}
                            allowDecimals={false}
                            min={0}
                            max={100}
                            placeholder="25"
                            disabled={isBusy}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduledOrderAutoConfirm" className="text-sm font-medium">
                        {t("admin.settings.orderSettings.scheduledOrderManagement.autoConfirm.label")}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderManagement.autoConfirm.description")}</p>
                    </div>
                    <Switch
                      id="scheduledOrderAutoConfirm"
                      checked={(formData as any).scheduledOrderAutoConfirm ?? true}
                      onCheckedChange={(checked: boolean) => handleInputChange("scheduledOrderAutoConfirm", checked)}
                      disabled={isBusy}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduledOrderMinimumAmount" className="text-sm font-medium">
                      {t("admin.settings.orderSettings.scheduledOrderManagement.minimumAmount.label")}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderManagement.minimumAmount.description")}</p>
                    <Input
                      id="scheduledOrderMinimumAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={(formData as any).scheduledOrderMinimumAmount ?? 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleInputChange("scheduledOrderMinimumAmount", parseFloat(e.target.value) || 0)
                      }
                      className="max-w-xs"
                      disabled={isBusy}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduledOrderAllowModification" className="text-sm font-medium">
                        {t("admin.settings.orderSettings.scheduledOrderManagement.modification.enable")}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderManagement.modification.enableDescription")}</p>
                    </div>
                    <Switch
                      id="scheduledOrderAllowModification"
                      checked={Boolean((formData as any).scheduledOrderAllowModification)}
                      onCheckedChange={(checked: boolean) => handleInputChange("scheduledOrderAllowModification", checked)}
                      disabled={isBusy}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="scheduledOrderAllowShallowModification" className="text-sm font-medium">
                        {t("admin.settings.orderSettings.scheduledOrderManagement.modification.shallowEnable")}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderManagement.modification.shallowEnableDescription")}</p>
                    </div>
                    <Switch
                      id="scheduledOrderAllowShallowModification"
                      checked={Boolean((formData as any).scheduledOrderAllowShallowModification)}
                      onCheckedChange={(checked: boolean) => handleInputChange("scheduledOrderAllowShallowModification", checked)}
                      disabled={isBusy}
                    />
                  </div>

                  {(formData as any).scheduledOrderAllowModification ? (
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderModificationWindowHours">{t("admin.settings.orderSettings.scheduledOrderManagement.modification.windowHours")}</Label>
                      <NumberInput
                        id="scheduledOrderModificationWindowHours"
                        value={Number((formData as any).scheduledOrderModificationWindowHours ?? 0)}
                        onChange={(value) => handleInputChange("scheduledOrderModificationWindowHours", value)}
                        allowDecimals={false}
                        min={0}
                        max={168}
                        placeholder="0"
                        disabled={isBusy}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border p-4 space-y-2">
                  <Label htmlFor="scheduledOrderTimeSlotInterval" className="text-sm font-medium">
                    {t("admin.settings.orderSettings.scheduledOrderTimeSlotInterval.label")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderTimeSlotInterval.description")}</p>
                  <NumberInput
                    id="scheduledOrderTimeSlotInterval"
                    value={Number((formData as any).scheduledOrderTimeSlotInterval ?? 30)}
                    onChange={(value) => handleInputChange("scheduledOrderTimeSlotInterval", value)}
                    allowDecimals={false}
                    min={5}
                    max={240}
                    placeholder="30"
                    disabled={isBusy}
                  />
                </div>

                <div className="rounded-lg border border-border p-4 space-y-2">
                  <Label htmlFor="scheduledOrderMaxOrdersPerSlot" className="text-sm font-medium">
                    {t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.label")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.description")}</p>
                  <Input
                    id="scheduledOrderMaxOrdersPerSlot"
                    type="number"
                    min="1"
                    value={(formData as any).scheduledOrderMaxOrdersPerSlot ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        handleInputChange("scheduledOrderMaxOrdersPerSlot", null);
                        return;
                      }
                      const parsed = parseInt(raw, 10);
                      handleInputChange("scheduledOrderMaxOrdersPerSlot", Number.isFinite(parsed) ? parsed : null);
                    }}
                    placeholder={t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.placeholder")}
                    disabled={isBusy}
                    className="max-w-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiTruck} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.deliverySettings.title")}
          description={t("admin.settings.deliverySettings.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryRadius">{t("admin.settings.deliverySettings.deliveryRadius")}</Label>
                <NumberInput
                  id="deliveryRadius"
                  value={Number((formData as any).deliveryRadius ?? 5)}
                  onChange={(value) => handleInputChange("deliveryRadius", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.deliverySettings.deliveryRadiusPlaceholder")}
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryRatePerKilometer">{t("admin.settings.deliverySettings.deliveryRatePerKilometer")}</Label>
                <NumberInput
                  id="deliveryRatePerKilometer"
                  value={Number((formData as any).deliveryRatePerKilometer ?? 0)}
                  onChange={(value) => handleInputChange("deliveryRatePerKilometer", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.deliverySettings.deliveryRatePerKilometerPlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useDynamicDeliveryFee"
                    checked={Boolean((formData as any).useDynamicDeliveryFee)}
                    onCheckedChange={(checked: boolean) => {
                      handleInputChange("useDynamicDeliveryFee", checked);
                      if (checked) {
                        handleInputChange("useTieredDeliveryFee", false);
                      }
                    }}
                    disabled={isBusy}
                  />
                  <Label htmlFor="useDynamicDeliveryFee">{t("admin.settings.deliverySettings.useDynamicDeliveryFee")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.useDynamicDeliveryFeeDescription")}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useTieredDeliveryFee"
                    checked={Boolean((formData as any).useTieredDeliveryFee)}
                    onCheckedChange={(checked: boolean) => {
                      handleInputChange("useTieredDeliveryFee", checked);
                      if (checked) {
                        handleInputChange("useDynamicDeliveryFee", false);
                      }
                    }}
                    disabled={isBusy}
                  />
                  <Label htmlFor="useTieredDeliveryFee">{t("admin.settings.deliverySettings.useTieredDeliveryFee")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.useTieredDeliveryFeeDescription")}</p>
              </div>

              {!(Boolean((formData as any).useDynamicDeliveryFee) || Boolean((formData as any).useTieredDeliveryFee)) ? (
                <div className="space-y-2">
                  <Label htmlFor="deliveryFee">{t("admin.settings.deliverySettings.fixedDeliveryFee")}</Label>
                  <NumberInput
                    id="deliveryFee"
                    value={Number((formData as any).deliveryFee ?? 0)}
                    onChange={(value) => handleInputChange("deliveryFee", value)}
                    allowDecimals={true}
                    min={0}
                    placeholder={t("admin.settings.deliverySettings.fixedDeliveryFeePlaceholder")}
                    disabled={isBusy}
                  />
                </div>
              ) : null}
            </div>

            {Boolean((formData as any).useTieredDeliveryFee) ? (
              <div className="space-y-4 pl-6 border-l-2 border-pink-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initialDeliveryRange">{t("admin.settings.deliverySettings.initialDeliveryRange")}</Label>
                    <NumberInput
                      id="initialDeliveryRange"
                      value={Number((formData as any).initialDeliveryRange ?? 3)}
                      onChange={(value) => handleInputChange("initialDeliveryRange", value)}
                      allowDecimals={true}
                      min={0}
                      placeholder={t("admin.settings.deliverySettings.initialDeliveryRangePlaceholder")}
                      disabled={isBusy}
                    />
                    <p className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.initialDeliveryRangeDescription")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="initialDeliveryPrice">{t("admin.settings.deliverySettings.initialDeliveryPrice")}</Label>
                    <NumberInput
                      id="initialDeliveryPrice"
                      value={Number((formData as any).initialDeliveryPrice ?? 2.0)}
                      onChange={(value) => handleInputChange("initialDeliveryPrice", value)}
                      allowDecimals={true}
                      min={0}
                      placeholder={t("admin.settings.deliverySettings.initialDeliveryPricePlaceholder")}
                      disabled={isBusy}
                    />
                    <p className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.initialDeliveryPriceDescription")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="extendedDeliveryThreshold">
                      {t("admin.settings.deliverySettings.extendedDeliveryThreshold")} {" "}
                      <span className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.extendedThresholdOptional")}</span>
                    </Label>
                    <NumberInput
                      id="extendedDeliveryThreshold"
                      value={Number((formData as any).extendedDeliveryThreshold ?? 0)}
                      onChange={(value) =>
                        handleInputChange(
                          "extendedDeliveryThreshold",
                          value !== undefined && value > 0 ? value : null
                        )
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder={t("admin.settings.deliverySettings.extendedDeliveryThresholdPlaceholder")}
                      disabled={isBusy}
                    />
                    <p className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.extendedDeliveryThresholdDescription")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="extendedDeliveryRate">
                      {t("admin.settings.deliverySettings.extendedDeliveryRate")} {" "}
                      <span className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.extendedThresholdOptional")}</span>
                    </Label>
                    <NumberInput
                      id="extendedDeliveryRate"
                      value={Number((formData as any).extendedDeliveryRate ?? 0)}
                      onChange={(value) =>
                        handleInputChange(
                          "extendedDeliveryRate",
                          value !== undefined && value > 0 ? value : null
                        )
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder={t("admin.settings.deliverySettings.extendedDeliveryRatePlaceholder")}
                      disabled={isBusy}
                    />
                    <p className="text-xs text-muted-foreground">{t("admin.settings.deliverySettings.extendedDeliveryRateDescription")}</p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>{t("admin.settings.deliverySettings.howItWorks")}</strong>{" "}
                    {t("admin.settings.deliverySettings.howItWorksDescription")}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryTimeEstimate">{t("admin.settings.deliverySettings.deliveryTimeEstimate")}</Label>
                <NumberInput
                  id="deliveryTimeEstimate"
                  value={Number((formData as any).deliveryTimeEstimate ?? 45)}
                  onChange={(value) => handleInputChange("deliveryTimeEstimate", value)}
                  allowDecimals={false}
                  min={1}
                  placeholder={t("admin.settings.deliverySettings.deliveryTimeEstimatePlaceholder")}
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="freeDeliveryThreshold">{t("admin.settings.deliverySettings.freeDeliveryThreshold")}</Label>
                <NumberInput
                  id="freeDeliveryThreshold"
                  value={Number((formData as any).freeDeliveryThreshold ?? 50)}
                  onChange={(value) => handleInputChange("freeDeliveryThreshold", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.deliverySettings.freeDeliveryThresholdPlaceholder")}
                  disabled={isBusy || !Boolean((formData as any).enableFreeDelivery)}
                />
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableFreeDelivery"
                    checked={Boolean((formData as any).enableFreeDelivery)}
                    onCheckedChange={(checked: boolean) => handleInputChange("enableFreeDelivery", checked)}
                    disabled={isBusy}
                  />
                  <Label htmlFor="enableFreeDelivery">{t("admin.settings.deliverySettings.enableFreeDelivery")}</Label>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiClock} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.servingHours.title")}
          description={t("admin.settings.servingHours.description")}
        >
          <div className="space-y-4">
            <div className="flex items-center space-x-2 p-4 bg-pink-50 dark:bg-pink-950/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <Switch
                id="allowOrdersOutsideHours"
                checked={Boolean(formData.allowOrdersOutsideHours)}
                onCheckedChange={(checked: boolean) => handleInputChange("allowOrdersOutsideHours", checked)}
                disabled={isBusy}
              />
              <div className="flex-1">
                <Label htmlFor="allowOrdersOutsideHours" className="text-base font-semibold cursor-pointer">
                  {t("admin.settings.servingHours.allowOrdersOutsideHours")}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("admin.settings.servingHours.allowOrdersOutsideHoursDescription")}
                </p>
              </div>
            </div>

            {([
              { key: "monday", label: t("admin.settings.servingHours.monday") },
              { key: "tuesday", label: t("admin.settings.servingHours.tuesday") },
              { key: "wednesday", label: t("admin.settings.servingHours.wednesday") },
              { key: "thursday", label: t("admin.settings.servingHours.thursday") },
              { key: "friday", label: t("admin.settings.servingHours.friday") },
              { key: "saturday", label: t("admin.settings.servingHours.saturday") },
              { key: "sunday", label: t("admin.settings.servingHours.sunday") },
            ] as const).map((day) => {
              const isOff = Boolean((formData as any)[`${day.key}IsOff`]);
              const periodsKey = `${day.key}Periods`;
              const openKey = `${day.key}Open`;
              const closeKey = `${day.key}Close`;

              const getDayPeriods = (): Array<{ open: string; close: string }> => {
                const periods = (formData as any)[periodsKey] as Array<{ open: string; close: string }> | undefined;
                if (periods && Array.isArray(periods) && periods.length > 0) {
                  return periods;
                }
                const open = (formData as any)[openKey] as string | undefined;
                const close = (formData as any)[closeKey] as string | undefined;
                if (open && close) {
                  return [{ open, close }];
                }
                return [{ open: "", close: "" }];
              };

              const periods = getDayPeriods();

              return (
                <div key={day.key} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">{day.label}</Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${day.key}IsOff`}
                        checked={isOff}
                        onCheckedChange={(checked: boolean) =>
                          handleInputChange(`${day.key}IsOff`, checked)
                        }
                        disabled={isBusy}
                      />
                      <Label htmlFor={`${day.key}IsOff`} className="text-sm">
                        {t("admin.settings.servingHours.closed")}
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
                                {t("admin.settings.servingHours.period")} {periodIndex + 1}
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removePeriod(day.key, periodIndex)}
                                className="text-destructive hover:text-destructive p-2"
                                disabled={isBusy}
                              >
                                <Icon path={mdiDelete} size={0.67} />
                              </Button>
                            </div>
                          )}
                          <div className="flex flex-row gap-4 items-end">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor={`${day.key}Period${periodIndex}Open`}>
                                {t("admin.settings.servingHours.openTime")}
                              </Label>
                              <Select
                                value={period.open || ""}
                                onValueChange={(v) => updatePeriodTime(day.key, periodIndex, "open", v)}
                                disabled={isBusy}
                              >
                                <SelectTrigger className="bg-transparent text-foreground border-border">
                                  <SelectValue placeholder={t("admin.settings.servingHours.openTime")} />
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
                                {t("admin.settings.servingHours.closeTime")}
                              </Label>
                              <Select
                                value={period.close || ""}
                                onValueChange={(v) => updatePeriodTime(day.key, periodIndex, "close", v)}
                                disabled={isBusy}
                              >
                                <SelectTrigger className="bg-transparent text-foreground border-border">
                                  <SelectValue placeholder={t("admin.settings.servingHours.closeTime")} />
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
                        onClick={() => addPeriod(day.key)}
                        className="w-full border-pink-500 text-pink-500 hover:bg-pink-50"
                        disabled={isBusy}
                      >
                        <Icon path={mdiPlus} size={0.67} className="mr-2" />
                        {t("admin.settings.servingHours.addPeriod")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.deliveryPaymentSettings.title", { defaultValue: "Delivery Payment Settings" })}
          description={t("admin.settings.deliveryPaymentSettings.description", { defaultValue: "Configure payment methods available for delivery orders" })}
        >
          <div className="space-y-4">
            {([
              { key: "acceptCash", label: t("admin.settings.payments.acceptCash", { defaultValue: "Accept cash" }) },
              { key: "acceptCard", label: t("admin.settings.payments.acceptCard", { defaultValue: "Accept card" }) },
              { key: "acceptOnlinePayment", label: t("admin.settings.payments.acceptOnlinePayment", { defaultValue: "Accept online payment" }) },
              { key: "acceptPayPal", label: t("admin.settings.payments.acceptPayPal", { defaultValue: "Accept PayPal" }) },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{item.label}</div>
                <Switch
                  checked={Boolean((formData as any)[item.key])}
                  onCheckedChange={(v) => handleInputChange(item.key, Boolean(v))}
                  disabled={isBusy}
                />
              </div>
            ))}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.paymentSettings.pickupPaymentSettings.title", { defaultValue: "Pickup Payment Settings" })}
          description={t("admin.settings.paymentSettings.pickupPaymentSettings.description", { defaultValue: "Configure payment methods available for pickup orders" })}
        >
          <div className="space-y-4">
            {([
              { key: "pickupAcceptCash", label: t("admin.settings.paymentSettings.pickupPaymentSettings.acceptCash", { defaultValue: "Accept cash" }) },
              { key: "pickupAcceptCard", label: t("admin.settings.paymentSettings.pickupPaymentSettings.acceptCard", { defaultValue: "Accept card" }) },
              { key: "pickupAcceptOnlinePayment", label: t("admin.settings.paymentSettings.pickupPaymentSettings.acceptOnlinePayment", { defaultValue: "Accept online payment" }) },
              { key: "pickupAcceptPayPal", label: t("admin.settings.paymentSettings.pickupPaymentSettings.acceptPayPal", { defaultValue: "Accept PayPal" }) },
            ] as const).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{item.label}</div>
                <Switch
                  checked={Boolean((formData as any)[item.key])}
                  onCheckedChange={(v) => handleInputChange(item.key, Boolean(v))}
                  disabled={isBusy}
                />
              </div>
            ))}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiWeb} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.socialMediaContact.title")}
          description={t("admin.settings.socialMediaContact.description")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="facebookUrl">{t("admin.settings.socialMediaContact.facebookUrl")}</Label>
              <Input
                id="facebookUrl"
                value={formData.facebookUrl || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange("facebookUrl", e.target.value)
                }
                placeholder={t("admin.settings.socialMediaContact.facebookUrlPlaceholder")}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagramUrl">{t("admin.settings.socialMediaContact.instagramUrl")}</Label>
              <Input
                id="instagramUrl"
                value={formData.instagramUrl || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange("instagramUrl", e.target.value)
                }
                placeholder={t("admin.settings.socialMediaContact.instagramUrlPlaceholder")}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitterUrl">{t("admin.settings.socialMediaContact.twitterUrl")}</Label>
              <Input
                id="twitterUrl"
                value={formData.twitterUrl || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange("twitterUrl", e.target.value)
                }
                placeholder={t("admin.settings.socialMediaContact.twitterUrlPlaceholder")}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">{t("admin.settings.socialMediaContact.websiteUrl")}</Label>
              <Input
                id="websiteUrl"
                value={formData.websiteUrl || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleInputChange("websiteUrl", e.target.value)
                }
                placeholder={t("admin.settings.socialMediaContact.websiteUrlPlaceholder")}
                disabled={isBusy}
              />
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiShieldAlert} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.appStatus.title", { defaultValue: "Application Status" })}
          description={t("admin.settings.appStatus.description", { defaultValue: "Control the customer-facing app status." })}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appStatus">{t("admin.settings.appStatus.label", { defaultValue: "Status" })}</Label>
              <Select
                value={String(formData.appStatus || "LIVE")}
                onValueChange={(v: string) => handleInputChange("appStatus", v)}
                disabled={isBusy}
              >
                <SelectTrigger id="appStatus" className="w-full bg-transparent">
                  <SelectValue placeholder="LIVE" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {APP_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiOfficeBuilding} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.mainBranch.title", { defaultValue: "Main Branch" })}
          description={t("admin.settings.mainBranch.description", {
            defaultValue:
              "Select the main branch to display as the default option in the branch switcher",
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="mainBranchId">{t("admin.settings.mainBranch.label", { defaultValue: "Main branch" })}</Label>
            <Select
              value={formData.mainBranchId ? String(formData.mainBranchId) : "__none__"}
              onValueChange={(v: string) => handleInputChange("mainBranchId", v === "__none__" ? undefined : v)}
              disabled={isBusy}
            >
              <SelectTrigger id="mainBranchId" className="w-full bg-transparent">
                <SelectValue
                  placeholder={branchesLoading ? t("common.loading") : t("common.select")}
                />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="__none__">{t("admin.settings.mainBranch.none", { defaultValue: "None" })}</SelectItem>
                {(branches || []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleCard>

        {orgSettingsLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : null}
      </div>
    </div>
  );
};

export default SettingsModern;
