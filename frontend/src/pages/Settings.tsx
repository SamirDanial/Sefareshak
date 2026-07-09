import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import {
  mdiRefresh,
  mdiContentSave,
  mdiRestart,
  mdiOfficeBuilding,
  mdiStore,
  mdiCurrencyUsd,
  mdiCart,
  mdiTruck,
  mdiCreditCard,
  mdiWeb,
  mdiMagnify,
  mdiNavigation,
  mdiClock,
  mdiShieldAlert,
  mdiDelete,
  mdiPlus,
} from "@mdi/js";
import { TimePicker12Hour } from "@/components/ui/time-picker-12hour";
import {
  type Settings,
  type AppStatus,
} from "@/services/settingsService";
import AppStatusNotice from "@/components/AppStatusNotice";
import googlePlacesService, {
  type AddressComponents,
} from "@/services/googlePlacesService";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import branchService, {
  type Branch,
} from "@/services/branchService";
import { usePermissions } from "@/contexts/PermissionContext";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import QRCode from "qrcode";

const APP_STATUS_ORDER: AppStatus[] = [
  "LIVE",
  "COMING_SOON",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
];

const APP_STATUS_KEY_MAP: Record<
  AppStatus,
  "live" | "comingSoon" | "maintenance" | "outOfService"
> = {
  LIVE: "live",
  COMING_SOON: "comingSoon",
  MAINTENANCE: "maintenance",
  OUT_OF_SERVICE: "outOfService",
};

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin, isOrgAdmin, rbacUser } = usePermissions();
  const { refreshSettings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [countryLoading, setCountryLoading] = useState(false);
  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [countryHasStates, setCountryHasStates] = useState(true); // Default to showing state field
  const [stateLoading, setStateLoading] = useState(false);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [showStateSuggestions, setShowStateSuggestions] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(() => {
    try {
      const stored = window.localStorage.getItem("bellami:selectedOrganizationId");
      return stored ? stored : "";
    } catch {
      return "";
    }
  });
  const [orgSettingsLoading, setOrgSettingsLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>("");
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const [seoImageFile, setSeoImageFile] = useState<File | null>(null);
  const [uploadingSeoImage, setUploadingSeoImage] = useState(false);
  const seoImageInputRef = React.useRef<HTMLInputElement>(null);
  const [seoImagePreviewUrl, setSeoImagePreviewUrl] = useState<string>("");

  const isDirtyRef = React.useRef(false);
  const prevLoadedOrgIdRef = React.useRef<string>("");

  const [organizationMeta, setOrganizationMeta] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const MAX_LOGO_BYTES = 1024 * 1024; // 1MB

  const orgAdminOrganizationId = useMemo(() => {
    const id = (rbacUser as any)?.organizationId as string | null | undefined;
    return id && String(id).trim().length > 0 ? String(id) : "";
  }, [rbacUser]);

  useEffect(() => {
    try {
      if (!selectedOrganizationId) return;
      window.localStorage.setItem("bellami:selectedOrganizationId", selectedOrganizationId);
    } catch {
      // ignore
    }
  }, [selectedOrganizationId]);

  const currentAppStatus = (formData.appStatus as AppStatus) || "LIVE";

  const handleInputChange = useCallback((field: keyof Settings, value: any) => {
    isDirtyRef.current = true;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const getBusinessLogoSrc = useCallback((val?: string | null) => {
    if (!val) return "";
    const trimmed = String(val).trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("blob:") || isExternalImage(trimmed)) return trimmed;
    if (trimmed.startsWith("/api/upload/images/")) return trimmed;
    if (trimmed.startsWith("/uploads/images/")) return trimmed;
    return getOptimizedImageUrl(trimmed);
  }, []);

  const getSeoImageSrc = useCallback(
    (val?: string | null) => {
      return getBusinessLogoSrc(val);
    },
    [getBusinessLogoSrc]
  );

  const handleUploadLogo = useCallback(async (): Promise<boolean> => {
    if (!logoFile) return false;

    try {
      const token = (await getToken()) || undefined;
      if (!token) return false;

      setUploadingLogo(true);
      const { filename } = await branchService.uploadImage(logoFile, token);
      handleInputChange("businessLogo", filename);

      if (selectedOrganizationId) {
        try {
          const saved = await branchService.upsertOrganizationSettings(
            selectedOrganizationId,
            { businessLogo: filename },
            token
          );

          if (saved) {
            setFormData((prev) => ({
              ...prev,
              ...(saved as any),
            }));
          }

          await refreshSettings();
        } catch (e: any) {
          console.error("Error saving business logo:", e);
          toast.error(e?.message || "Failed to save logo");
          return false;
        }
      }

      setLogoFile(null);
      toast.success("Logo uploaded");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload logo");
      return false;
    } finally {
      setUploadingLogo(false);
    }
  }, [getToken, handleInputChange, logoFile, refreshSettings, selectedOrganizationId]);

  const handleRemoveLogo = useCallback(async (): Promise<boolean> => {
    try {
      const token = (await getToken()) || undefined;
      if (!token) return false;

      setUploadingLogo(true);
      handleInputChange("businessLogo", "");
      setLogoFile(null);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }

      if (selectedOrganizationId) {
        await branchService.upsertOrganizationSettings(
          selectedOrganizationId,
          { businessLogo: null } as any,
          token
        );
        await refreshSettings();
      }

      return true;
    } catch (e: any) {
      console.error("Error removing business logo:", e);
      toast.error(e?.message || "Failed to remove logo");
      return false;
    } finally {
      setUploadingLogo(false);
    }
  }, [getToken, handleInputChange, refreshSettings, selectedOrganizationId]);

  const handleUploadSeoImage = useCallback(async (): Promise<boolean> => {
    if (!seoImageFile) return false;

    try {
      const token = (await getToken()) || undefined;
      if (!token) return false;

      setUploadingSeoImage(true);
      const { filename } = await branchService.uploadImage(seoImageFile, token);
      handleInputChange("seoOgImage" as any, filename);

      if (selectedOrganizationId) {
        const saved = await branchService.upsertOrganizationSettings(
          selectedOrganizationId,
          { seoOgImage: filename } as any,
          token
        );
        if (saved) {
          setFormData((prev) => ({
            ...prev,
            ...(saved as any),
          }));
        }
        await refreshSettings();
      }

      setSeoImageFile(null);
      if (seoImageInputRef.current) {
        seoImageInputRef.current.value = "";
      }
      toast.success("SEO image uploaded");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload SEO image");
      return false;
    } finally {
      setUploadingSeoImage(false);
    }
  }, [getToken, handleInputChange, refreshSettings, selectedOrganizationId, seoImageFile]);

  const handleRemoveSeoImage = useCallback(async (): Promise<boolean> => {
    try {
      const token = (await getToken()) || undefined;
      if (!token) return false;

      setUploadingSeoImage(true);
      handleInputChange("seoOgImage" as any, "");
      setSeoImageFile(null);
      setSeoImagePreviewUrl("");
      if (seoImageInputRef.current) {
        seoImageInputRef.current.value = "";
      }

      if (selectedOrganizationId) {
        await branchService.upsertOrganizationSettings(
          selectedOrganizationId,
          { seoOgImage: null } as any,
          token
        );
        await refreshSettings();
      }

      return true;
    } catch (e: any) {
      console.error("Error removing SEO image:", e);
      toast.error(e?.message || "Failed to remove SEO image");
      return false;
    } finally {
      setUploadingSeoImage(false);
    }
  }, [getToken, handleInputChange, refreshSettings, selectedOrganizationId]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return;
    }

    const next = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [logoFile]);

  useEffect(() => {
    if (!seoImageFile) {
      setSeoImagePreviewUrl("");
      return;
    }

    const next = URL.createObjectURL(seoImageFile);
    setSeoImagePreviewUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [seoImageFile]);

  const handleAddressChange = useCallback(
    (components: AddressComponents) => {
      handleInputChange("country", components.country);
      handleInputChange("state", components.state);
      handleInputChange("city", components.city);
      handleInputChange("addressLineOne", components.addressLineOne);
      handleInputChange("latitude", components.latitude);
      handleInputChange("longitude", components.longitude);
      handleInputChange("businessAddress", components.formattedAddress);

      // Check if the country has states when address is set via GPS
      if (googleLoaded && components.country) {
        googlePlacesService.checkCountryHasStates(
          components.country,
          (hasStates) => {
            setCountryHasStates(hasStates);
          }
        );
      }
    },
    [googleLoaded, handleInputChange]
  );

  useEffect(() => {
    loadSettings();
    googlePlacesService.loadScript(() => {
      setGoogleLoaded(true);
    });
  }, []);

  useEffect(() => {
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
    window.addEventListener("focus", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
    };
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (isSuperAdmin) {
      return;
    }

    if (isOrgAdmin && orgAdminOrganizationId) {
      setSelectedOrganizationId(orgAdminOrganizationId);
    }
  }, [isSuperAdmin, isOrgAdmin, orgAdminOrganizationId]);

  const loadOrganizationSettings = useCallback(async (opts?: { force?: boolean }) => {
    if (!selectedOrganizationId) {
      return;
    }

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
      const settings = await branchService.getOrganizationSettings(
        selectedOrganizationId,
        token
      );

      const data = (settings || {}) as any;

      if (isDirtyRef.current && !force && !orgChanged) {
        return;
      }

      setFormData({
        ...data,
        serviceType: data.serviceType ?? "RESTAURANT",
        acceptPayPal: data.acceptPayPal ?? false,
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
        scheduledOrderTimeSlotInterval: data.scheduledOrderTimeSlotInterval ?? 30,
        scheduledOrderMaxOrdersPerSlot: data.scheduledOrderMaxOrdersPerSlot ?? null,
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organization settings");
    } finally {
      setOrgSettingsLoading(false);
    }
  }, [getToken, selectedOrganizationId]);

  useEffect(() => {
    loadOrganizationSettings();
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
        const slug = (org?.slug || "").trim();
        if (!slug) {
          setOrganizationMeta(null);
          return;
        }

        setOrganizationMeta({ id: org.id, name: org.name, slug });
      } catch {
        setOrganizationMeta(null);
      }
    };

    loadOrgMeta();
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

    buildQr();
  }, [orgQrUrl]);

  const handleCopyQrLink = useCallback(async () => {
    try {
      if (!orgQrUrl) return;
      await navigator.clipboard.writeText(orgQrUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }, [orgQrUrl]);

  const handleDownloadQr = useCallback(() => {
    try {
      if (!qrDataUrl) return;
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `${organizationMeta?.slug || "organization"}-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // ignore
    }
  }, [organizationMeta?.slug, qrDataUrl]);

  const handlePrintQrPoster = useCallback(() => {
    try {
      if (!qrDataUrl || !orgQrUrl) return;

      const escapeHtml = (v: any) =>
        String(v ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");

      const titleRaw = (formData.businessName || organizationMeta?.name || "Organization").toString();
      const title = escapeHtml(titleRaw);
      const logoSrc = escapeHtml(getBusinessLogoSrc(formData.businessLogo as any) || "");

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
          const win = iframe.contentWindow;
          if (!win) return;

          const prevTitle = document.title;
          try {
            document.title = "";
          } catch {
            // ignore
          }

          win.focus();
          win.print();
          // Give the print dialog a moment to open before removing the iframe.
          setTimeout(() => {
            cleanup();
            try {
              document.title = prevTitle;
            } catch {
              // ignore
            }
          }, 1000);
        } catch {
          cleanup();
        }
      };

      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    } catch {
      // ignore
    }
  }, [formData.businessLogo, formData.businessName, getBusinessLogoSrc, orgQrUrl, organizationMeta?.name, qrDataUrl, t]);
  // Check country states after both Google and settings are loaded
  useEffect(() => {
    if (googleLoaded && formData.country) {
      googlePlacesService.checkCountryHasStates(
        formData.country,
        (hasStates) => {
          setCountryHasStates(hasStates);
        }
      );
    }
  }, [googleLoaded, formData.country]);

  // Reverse geocode when latitude and longitude are manually entered
  useEffect(() => {
    const lat = formData.latitude;
    const lng = formData.longitude;

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
              handleAddressChange(components);
            },
            () => {
              setReverseGeocoding(false);
            }
          );
        }, 1000); // Wait 1 second after user stops typing

        return () => clearTimeout(timeoutId);
      }
    }
  }, [
    googleLoaded,
    formData.latitude,
    formData.longitude,
    handleAddressChange,
  ]);

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
          (loading) => {
            setCountryLoading(loading);
          }
        );
      } else {
        setCountrySuggestions([]);
        setShowCountrySuggestions(false);
        setCountryLoading(false);
      }
    },
    [googleLoaded, handleInputChange, showCountrySuggestions]
  );

  const handleCountrySelect = useCallback(
    (country: string) => {
      handleInputChange("country", country);
      // Clear state when country changes
      handleInputChange("state", "");
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
    },
    [googleLoaded, handleInputChange]
  );

  const handleStateInputChange = useCallback(
    (value: string) => {
      handleInputChange("state", value);

      // Only search if country is selected and country has states
      if (
        value.length >= 1 &&
        googleLoaded &&
        formData.country &&
        countryHasStates
      ) {
        setShowStateSuggestions(true);
        googlePlacesService.searchStates(
          value,
          formData.country,
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
    },
    [googleLoaded, formData.country, countryHasStates, handleInputChange]
  );

  const handleStateSelect = useCallback(
    (state: string) => {
      handleInputChange("state", state);
      // Clear city when state changes
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

      // Search cities if country is selected
      if (value.length >= 1 && googleLoaded && formData.country) {
        setShowCitySuggestions(true);
        googlePlacesService.searchCities(
          value,
          formData.country,
          (cities) => {
            setCitySuggestions(cities);
          },
          formData.state || undefined, // Use state if available
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
    },
    [googleLoaded, formData.country, formData.state, handleInputChange]
  );

  const handleCitySelect = useCallback(
    (city: string) => {
      handleInputChange("city", city);
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      setCityLoading(false);
      // Clear address suggestions when city changes
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
    },
    [handleInputChange]
  );

  const handleAddressInputChange = useCallback(
    (value: string) => {
      handleInputChange("addressLineOne", value);

      // Search addresses if city is selected
      if (
        value.length >= 1 &&
        googleLoaded &&
        formData.country &&
        formData.city
      ) {
        setShowAddressSuggestions(true);
        googlePlacesService.searchAddresses(
          value,
          formData.country,
          formData.city,
          formData.state || undefined,
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
    },
    [
      googleLoaded,
      formData.country,
      formData.city,
      formData.state,
      handleInputChange,
    ]
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

  const loadSettings = async () => {
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;

      // Load branches for main branch selector
      try {
        setLoadingBranches(true);
        const branchesData = await branchService.getBranches(token);
        setBranches(branchesData || []);
      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error(t("admin.settings.loadError"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
          fontSize: "16px",
          fontWeight: "500",
          padding: "16px 24px",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = (await getToken()) || undefined;

      if (!selectedOrganizationId) {
        toast.error(
          t("admin.organizations.select", {
            defaultValue: "Select organization",
          })
        );
        return;
      }
      
      // Normalize mainBranchId: convert "none" to null
      // Ensure acceptPayPal is explicitly included (defaults to false if not set)
      const normalizedFormData: Partial<Settings> = {
        ...formData,
        mainBranchId: formData.mainBranchId === "none" || formData.mainBranchId === "" ? null : formData.mainBranchId,
        acceptPayPal: formData.acceptPayPal ?? false,
      };

      const payload: any = { ...normalizedFormData };
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.organizationId;
      delete payload.organization;

      const saved = await branchService.upsertOrganizationSettings(
        selectedOrganizationId,
        payload,
        token || ""
      );

      // Show success toast - if we get here without error, the save was successful
      toast.success(t("admin.settings.saveSuccess"), {
        duration: 3000,
        style: {
          background: "rgba(34, 197, 94, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          fontSize: "16px",
          fontWeight: "500",
          padding: "16px 24px",
        },
      });

      if (saved) {
        isDirtyRef.current = false;
        setFormData((prev) => ({
          ...prev,
          ...(saved as any),
        }));
      }

      // Refresh settings in context so all components get updated values
      await refreshSettings();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(t("admin.settings.saveError"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
          fontSize: "16px",
          fontWeight: "500",
          padding: "16px 24px",
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      isDirtyRef.current = false;
      await loadOrganizationSettings({ force: true });
      toast.success(t("admin.settings.resetSuccess"), {
        duration: 3000,
        style: {
          background: "rgba(34, 197, 94, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
          fontSize: "16px",
          fontWeight: "500",
          padding: "16px 24px",
        },
      });
    } catch (error) {
      console.error("Error resetting settings:", error);
      toast.error(t("admin.settings.resetError"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
          fontSize: "16px",
          fontWeight: "500",
          padding: "16px 24px",
        },
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.settings.title")}
          </h2>
          <div className="flex items-center gap-2">
            <Icon path={mdiRefresh} size={0.67} className="animate-spin text-pink-500" />
            <span className="text-sm text-muted-foreground">
              {t("admin.settings.loading")}
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.settings.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.settings.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  };

  if (!isSuperAdmin && !isOrgAdmin) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="text-sm text-muted-foreground">Access denied</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.settings.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.settings.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving || orgSettingsLoading || !selectedOrganizationId}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon path={mdiRestart} size={0.67} className="mr-2" />
            {t("admin.settings.resetToDefaults")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || orgSettingsLoading || !selectedOrganizationId}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {saving ? (
              <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
            ) : (
              <Icon path={mdiContentSave} size={0.67} className="mr-2" />
            )}
            {t("admin.settings.saveChanges")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Business Information */}
        <CollapsibleCard
          icon={<Icon path={mdiStore} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.businessInformation.title")}
          description={t("admin.settings.businessInformation.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">
                  {t("admin.settings.businessInformation.businessName")}
                </Label>
                <Input
                  id="businessName"
                  value={formData.businessName || ""}
                  onChange={(e) =>
                    handleInputChange("businessName", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.businessInformation.businessNamePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceType">{t("admin.serviceType.label")}</Label>
                <Select
                  value={(formData as any).serviceType || "RESTAURANT"}
                  onValueChange={(value) => handleInputChange("serviceType" as any, value)}
                >
                  <SelectTrigger id="serviceType" className="w-full bg-transparent">
                    <SelectValue placeholder={t("admin.serviceType.restaurant")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="RESTAURANT">{t("admin.serviceType.restaurant")}</SelectItem>
                    <SelectItem value="MEAT_SHOP">{t("admin.serviceType.meatShop")}</SelectItem>
                    <SelectItem value="BAKERY">{t("admin.serviceType.bakery")}</SelectItem>
                    <SelectItem value="FOOD_TRUCK">{t("admin.serviceType.foodTruck")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessEmail">
                  {t("admin.settings.businessInformation.businessEmail")}
                </Label>
                <Input
                  id="businessEmail"
                  value={formData.businessEmail || ""}
                  onChange={(e) =>
                    handleInputChange("businessEmail", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.businessInformation.businessEmailPlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessPhone">
                  {t("admin.settings.businessInformation.businessPhone")}
                </Label>
                <Input
                  id="businessPhone"
                  value={formData.businessPhone || ""}
                  onChange={(e) =>
                    handleInputChange("businessPhone", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.businessInformation.businessPhonePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">
                  {t("admin.settings.businessInformation.timezone")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="timezone"
                    value={(formData as any).timezone || ""}
                    onChange={(e) => handleInputChange("timezone" as any, e.target.value)}
                    placeholder={t("admin.settings.businessInformation.timezonePlaceholder")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border border-border text-foreground hover:bg-muted/60"
                    onClick={() => {
                      try {
                        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        if (tz) {
                          handleInputChange("timezone" as any, tz);
                        }
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    {t("admin.settings.businessInformation.useBrowserTimezone")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.settings.businessInformation.timezoneHelper")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessLogo">
                  {t("admin.settings.businessInformation.businessLogo")}
                </Label>
                <div className="space-y-3">
                  {logoPreviewUrl || getBusinessLogoSrc(formData.businessLogo as any) ? (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-700 bg-neutral-900/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-16 w-16 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 shrink-0">
                          <img
                            src={logoPreviewUrl || getBusinessLogoSrc(formData.businessLogo as any)}
                            alt="Business logo"
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white">
                            {logoFile?.name || t("admin.settings.businessInformation.businessLogo")}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            void handleRemoveLogo();
                          }}
                          disabled={uploadingLogo}
                          className="gap-2"
                        >
                          <Icon path={mdiDelete} size={0.67} />
                          {t("admin.settings.businessInformation.businessLogoRemove")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    null
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {logoFile ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const ok = await handleUploadLogo();
                              if (ok) {
                                if (logoInputRef.current) {
                                  logoInputRef.current.value = "";
                                }
                              }
                            }}
                            disabled={uploadingLogo}
                            className="gap-2 bg-transparent"
                          >
                            {uploadingLogo ? (
                              <Icon
                                path={mdiRefresh}
                                size={0.67}
                                className="animate-spin"
                              />
                            ) : null}
                            {t("admin.settings.businessInformation.businessLogoUpload")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setLogoFile(null);
                              if (logoInputRef.current) {
                                logoInputRef.current.value = "";
                              }
                            }}
                            disabled={uploadingLogo}
                            className="bg-transparent"
                          >
                            {t("admin.settings.businessInformation.businessLogoCancel")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            logoInputRef.current?.click();
                          }}
                          disabled={uploadingLogo}
                          className="flex-1 border-border bg-card hover:bg-muted"
                        >
                          {t("admin.settings.businessInformation.businessLogoSelect")}
                        </Button>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground w-[220px] h-[60px]">
                      Height: 40-80px & Width: 180-250px
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (!file) return;

                        if (!file.type.startsWith("image/")) {
                          toast.error("Please select an image file");
                          return;
                        }

                        if (file.size > MAX_LOGO_BYTES) {
                          toast.error(
                            "Logo image is too large. Please upload a file under 1MB."
                          );
                          return;
                        }

                        setLogoFile(file);
                      }}
                      disabled={uploadingLogo}
                    />
                  </div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">
                    {t("admin.settings.businessInformation.addressInformation")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "admin.settings.businessInformation.addressInformationDescription"
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={getCurrentLocation}
                  disabled={gettingLocation || !googleLoaded}
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
                  <Label htmlFor="country">
                    {t("admin.settings.businessInformation.country")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="country"
                      value={formData.country || ""}
                      onChange={(e) => handleCountryInputChange(e.target.value)}
                      onFocus={() => {
                        if (formData.country && formData.country.length >= 2) {
                          setShowCountrySuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => {
                          setShowCountrySuggestions(false);
                        }, 200);
                      }}
                      placeholder={t(
                        "admin.settings.businessInformation.countryPlaceholder"
                      )}
                      className="pr-8"
                    />
                    {countryLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon path={mdiRefresh} size={0.67} className="animate-spin text-white" />
                      </div>
                    )}
                    {showCountrySuggestions &&
                      countrySuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {countrySuggestions.map((country, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleCountrySelect(country)}
                              className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white text-sm first:rounded-t-lg last:rounded-b-lg"
                            >
                              {country}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
                {countryHasStates && (
                  <div className="space-y-2">
                    <Label htmlFor="state">
                      {t("admin.settings.businessInformation.stateProvince")}
                    </Label>
                    <div className="relative">
                      <Input
                        id="state"
                        value={formData.state || ""}
                        onChange={(e) => handleStateInputChange(e.target.value)}
                        onFocus={() => {
                          if (formData.state && formData.state.length >= 1) {
                            setShowStateSuggestions(true);
                          }
                        }}
                        onBlur={() => {
                          // Delay to allow click on suggestion
                          setTimeout(() => {
                            setShowStateSuggestions(false);
                          }, 200);
                        }}
                        placeholder={t(
                          "admin.settings.businessInformation.stateProvincePlaceholder"
                        )}
                        className="pr-8"
                        disabled={!formData.country}
                      />
                      {stateLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Icon path={mdiRefresh} size={0.67} className="animate-spin text-white" />
                        </div>
                      )}
                      {showStateSuggestions && stateSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {stateSuggestions.map((state, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleStateSelect(state)}
                              className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white text-sm first:rounded-t-lg last:rounded-b-lg"
                            >
                              {state}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="city">
                    {t("admin.settings.businessInformation.city")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="city"
                      value={formData.city || ""}
                      onChange={(e) => handleCityInputChange(e.target.value)}
                      onFocus={() => {
                        if (formData.city && formData.city.length >= 1) {
                          setShowCitySuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => {
                          setShowCitySuggestions(false);
                        }, 200);
                      }}
                      placeholder={t(
                        "admin.settings.businessInformation.cityPlaceholder"
                      )}
                      className="pr-8"
                      disabled={!formData.country}
                    />
                    {cityLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon path={mdiRefresh} size={0.67} className="animate-spin text-white" />
                      </div>
                    )}
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                        {citySuggestions.map((city, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleCitySelect(city)}
                            className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white text-sm first:rounded-t-lg last:rounded-b-lg"
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addressLineOne">
                    {t("admin.settings.businessInformation.addressLineOne")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="addressLineOne"
                      value={formData.addressLineOne || ""}
                      onChange={(e) => handleAddressInputChange(e.target.value)}
                      onFocus={() => {
                        if (
                          formData.addressLineOne &&
                          formData.addressLineOne.length >= 1
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
                      placeholder={t(
                        "admin.settings.businessInformation.addressLineOnePlaceholder"
                      )}
                      className="pr-8"
                      disabled={!formData.city || !formData.country}
                    />
                    {addressLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon path={mdiRefresh} size={0.67} className="animate-spin text-white" />
                      </div>
                    )}
                    {showAddressSuggestions &&
                      addressSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {addressSuggestions.map((address, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleAddressSelect(address)}
                              className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white text-sm first:rounded-t-lg last:rounded-b-lg"
                            >
                              {address}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">
                    {t("admin.settings.businessInformation.latitude")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude || ""}
                      onChange={(e) =>
                        handleInputChange("latitude", e.target.value)
                      }
                      placeholder={t(
                        "admin.settings.businessInformation.latitudePlaceholder"
                      )}
                      className="pr-8"
                    />
                    {reverseGeocoding && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon path={mdiRefresh} size={0.67} className="animate-spin text-white" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">
                    {t("admin.settings.businessInformation.longitude")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={formData.longitude || ""}
                      onChange={(e) =>
                        handleInputChange("longitude", e.target.value)
                      }
                      placeholder={t(
                        "admin.settings.businessInformation.longitudePlaceholder"
                      )}
                      className="pr-8"
                    />
                    {reverseGeocoding && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Icon path={mdiRefresh} size={0.67} className="animate-spin text-white" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessAddress">
                  {t("admin.settings.businessInformation.fullAddress")}
                </Label>
                <Textarea
                  id="businessAddress"
                  value={formData.businessAddress || ""}
                  onChange={(e) =>
                    handleInputChange("businessAddress", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.businessInformation.fullAddressPlaceholder"
                  )}
                  rows={2}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiMagnify} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.seo.title", { defaultValue: "SEO Customization" })}
          description={t("admin.settings.seo.description", { defaultValue: "Customize how your organization appears in search results and link previews." })}
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
                value={(formData as any)?.seoTitle ?? ""}
                onChange={(e) => handleInputChange("seoTitle" as any, e.target.value)}
                placeholder={t("admin.settings.seo.seoTitlePlaceholder", { defaultValue: "e.g. Downtown Branch - Order Online" })}
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
                value={(formData as any)?.seoDescription ?? ""}
                onChange={(e) => handleInputChange("seoDescription" as any, e.target.value)}
                placeholder={t("admin.settings.seo.seoDescriptionPlaceholder", { defaultValue: "Describe your restaurant for search and link previews" })}
                rows={3}
                className="bg-transparent"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seoOgImage">{t("admin.settings.seo.ogImage", { defaultValue: "Share Image (OG)" })}</Label>
              <div className="text-xs text-muted-foreground">
                {t("admin.settings.seo.ogImageHint", {
                  defaultValue:
                    "Image used when your link is shared (WhatsApp, Facebook, etc.). Recommended: 1200×630.",
                })}
              </div>

              <div className="space-y-3">
                {seoImagePreviewUrl || getSeoImageSrc((formData as any)?.seoOgImage) ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-700 bg-neutral-900/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-16 w-16 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 shrink-0">
                        <img
                          src={seoImagePreviewUrl || getSeoImageSrc((formData as any)?.seoOgImage)}
                          alt="Share image"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">
                          {seoImageFile?.name || t("admin.settings.seo.ogImage", { defaultValue: "Share Image (OG)" })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void handleRemoveSeoImage();
                        }}
                        disabled={uploadingSeoImage}
                        className="gap-2"
                      >
                        <Icon path={mdiDelete} size={0.67} />
                        {t("admin.settings.seo.ogImageRemove", { defaultValue: "Remove" })}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {seoImageFile ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await handleUploadSeoImage();
                          }}
                          disabled={uploadingSeoImage}
                          className="gap-2 bg-transparent"
                        >
                          {uploadingSeoImage ? (
                            <Icon
                              path={mdiRefresh}
                              size={0.67}
                              className="animate-spin"
                            />
                          ) : null}
                          {t("admin.settings.seo.uploadImage", { defaultValue: "Upload" })}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSeoImageFile(null);
                            setSeoImagePreviewUrl("");
                            if (seoImageInputRef.current) {
                              seoImageInputRef.current.value = "";
                            }
                          }}
                          disabled={uploadingSeoImage}
                          className="bg-transparent"
                        >
                          {t("admin.settings.seo.cancel", { defaultValue: "Cancel" })}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          seoImageInputRef.current?.click();
                        }}
                        disabled={uploadingSeoImage}
                        className="flex-1 border-border bg-card hover:bg-muted"
                      >
                        {t("admin.settings.seo.chooseImage", { defaultValue: "Choose image" })}
                      </Button>
                    )}
                  </div>

                  <input
                    ref={seoImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;

                      if (!file.type.startsWith("image/")) {
                        toast.error("Please select an image file");
                        return;
                      }

                      if (file.size > MAX_LOGO_BYTES) {
                        toast.error(
                          "Image is too large. Please upload a file under 1MB."
                        );
                        return;
                      }

                      setSeoImageFile(file);
                    }}
                    disabled={uploadingSeoImage}
                  />
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Icon path={mdiWeb} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.qrCode.title", { defaultValue: "Organization QR Code" })}
          description={t("admin.settings.qrCode.description", { defaultValue: "Generate a QR code link customers can scan to open your branded ordering experience." })}
        >
          <div className="space-y-4">
            {!organizationMeta?.slug ? (
              <div className="text-sm text-muted-foreground">
                {t("admin.settings.qrCode.selectOrganizationHint", { defaultValue: "Select an organization to generate its QR code." })}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t("admin.settings.qrCode.link", { defaultValue: "Link" })}</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input value={orgQrUrl} readOnly />
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

        {/* Financial Settings */}
        <CollapsibleCard
          icon={<Icon path={mdiCurrencyUsd} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.financialSettings.title")}
          description={t("admin.settings.financialSettings.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxPercentage">
                  {t("admin.settings.financialSettings.taxPercentage")}
                </Label>
                <NumberInput
                  id="taxPercentage"
                  value={formData.taxPercentage || 0}
                  onChange={(value) =>
                    handleInputChange("taxPercentage", value)
                  }
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t(
                    "admin.settings.financialSettings.taxPercentagePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceTaxPercentage">
                  {t("admin.settings.financialSettings.serviceTaxPercentage")}
                </Label>
                <NumberInput
                  id="serviceTaxPercentage"
                  value={formData.serviceTaxPercentage || 0}
                  onChange={(value) =>
                    handleInputChange("serviceTaxPercentage", value)
                  }
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t(
                    "admin.settings.financialSettings.serviceTaxPercentagePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryTaxPercentage">
                  {t("admin.settings.financialSettings.deliveryTaxPercentage")}
                </Label>
                <NumberInput
                  id="deliveryTaxPercentage"
                  value={formData.deliveryTaxPercentage || 0}
                  onChange={(value) =>
                    handleInputChange("deliveryTaxPercentage", value)
                  }
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t(
                    "admin.settings.financialSettings.deliveryTaxPercentagePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryFee">
                  {t("admin.settings.financialSettings.deliveryFee")}
                </Label>
                <NumberInput
                  id="deliveryFee"
                  value={formData.deliveryFee || 0}
                  onChange={(value) => handleInputChange("deliveryFee", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t(
                    "admin.settings.financialSettings.deliveryFeePlaceholder"
                  )}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="taxInclusive"
                checked={formData.taxInclusive || false}
                onCheckedChange={(checked: boolean) =>
                  handleInputChange("taxInclusive", checked)
                }
              />
              <Label htmlFor="taxInclusive">
                {t("admin.settings.financialSettings.taxInclusive")}
              </Label>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">
                {t("admin.settings.financialSettings.asapMinimumOrderTitle")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("admin.settings.financialSettings.asapMinimumOrderDescription")}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minimumOrderAmount">
                  {t("admin.settings.financialSettings.minimumOrderAmount")}
                </Label>
                <NumberInput
                  id="minimumOrderAmount"
                  value={formData.minimumOrderAmount ?? 0}
                  onChange={(value) =>
                    handleInputChange("minimumOrderAmount", value)
                  }
                  allowDecimals={true}
                  min={0}
                  placeholder={t(
                    "admin.settings.financialSettings.minimumOrderAmountPlaceholder"
                  )}
                  disabled={saving}
                />
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableMinimumOrder"
                    checked={formData.enableMinimumOrder || false}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange("enableMinimumOrder", checked)
                    }
                  />
                  <Label htmlFor="enableMinimumOrder">
                    {t("admin.settings.financialSettings.enableMinimumOrder")}
                  </Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">
                  {t("admin.settings.financialSettings.currency")}
                </Label>
                <Select
                  value={formData.currency || "USD"}
                  onValueChange={(value: string) =>
                    handleInputChange("currency", value)
                  }
                >
                  <SelectTrigger id="currency" className="w-full bg-transparent">
                    <SelectValue
                      placeholder={t(
                        "admin.settings.financialSettings.selectCurrency"
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">Euro</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="AFN">AFN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Order Settings */}
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
                  checked={formData.pickupEnabled !== false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("pickupEnabled", checked)
                  }
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
                  checked={formData.deliveryEnabled !== false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("deliveryEnabled", checked)
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderPreparationTime">
                  {t("admin.settings.orderSettings.orderPreparationTime")}
                </Label>
                <NumberInput
                  id="orderPreparationTime"
                  value={formData.orderPreparationTime || 30}
                  onChange={(value) =>
                    handleInputChange("orderPreparationTime", value)
                  }
                  allowDecimals={false}
                  min={1}
                  placeholder={t(
                    "admin.settings.orderSettings.orderPreparationTimePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxOrderQuantity">
                  {t("admin.settings.orderSettings.maxOrderQuantity")}
                </Label>
                <NumberInput
                  id="maxOrderQuantity"
                  value={formData.maxOrderQuantity || 10}
                  onChange={(value) =>
                    handleInputChange("maxOrderQuantity", value)
                  }
                  allowDecimals={false}
                  min={1}
                  placeholder={t(
                    "admin.settings.orderSettings.maxOrderQuantityPlaceholder"
                  )}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5 flex-1 pr-4">
                <Label htmlFor="allowExcludeOptionalIngredients" className="text-sm font-medium">
                  {t("admin.settings.orderSettings.allowExcludeOptionalIngredients")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.settings.orderSettings.allowExcludeOptionalIngredientsDescription"
                  )}
                </p>
              </div>
              <Switch
                id="allowExcludeOptionalIngredients"
                checked={formData.allowExcludeOptionalIngredients !== false}
                onCheckedChange={(checked: boolean) =>
                  handleInputChange("allowExcludeOptionalIngredients", checked)
                }
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="orderMergeTimeframeMinutes">
                {t("admin.settings.orderSettings.orderMergeTimeframe")}
              </Label>
              <NumberInput
                id="orderMergeTimeframeMinutes"
                value={formData.orderMergeTimeframeMinutes}
                onChange={(value) =>
                  handleInputChange("orderMergeTimeframeMinutes", value)
                }
                allowDecimals={false}
                min={0}
                max={120}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.settings.orderSettings.orderMergeTimeframeDescription")}
              </p>
            </div>
            <Separator />
            {/* Future Order Settings */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  {t("admin.settings.orderSettings.futureOrders.title")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("admin.settings.orderSettings.futureOrders.description")}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5 flex-1 pr-4">
                  <Label htmlFor="futureOrdersEnabled" className="text-sm font-medium">
                    {t("admin.settings.orderSettings.futureOrders.enabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.settings.orderSettings.futureOrders.enabledDescription")}
                  </p>
                </div>
                <Switch
                  id="futureOrdersEnabled"
                  checked={formData.futureOrdersEnabled || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("futureOrdersEnabled", checked)
                  }
                />
              </div>

              {formData.futureOrdersEnabled && (
                <>
                  {/* Pickup Future Orders */}
                  <div className="rounded-lg border border-border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enableFuturePickupOrders" className="text-sm font-medium">
                          {t("admin.settings.orderSettings.futureOrders.enablePickup")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("admin.settings.orderSettings.futureOrders.enablePickupDescription")}
                        </p>
                      </div>
                      <Switch
                        id="enableFuturePickupOrders"
                        checked={formData.enableFuturePickupOrders || false}
                        onCheckedChange={(checked: boolean) =>
                          handleInputChange("enableFuturePickupOrders", checked)
                        }
                      />
                    </div>
                    {formData.enableFuturePickupOrders && (
                      <div className="space-y-2">
                        <Label htmlFor="futurePickupOrderDays">
                          {t("admin.settings.orderSettings.futureOrders.maxDaysPickup")}
                        </Label>
                        <NumberInput
                          id="futurePickupOrderDays"
                          value={formData.futurePickupOrderDays || 0}
                          onChange={(value) =>
                            handleInputChange("futurePickupOrderDays", value)
                          }
                          allowDecimals={false}
                          min={0}
                          max={365}
                          placeholder="7"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("admin.settings.orderSettings.futureOrders.maxDaysDescription")}
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Delivery Future Orders */}
                  <div className="rounded-lg border border-border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enableFutureDeliveryOrders" className="text-sm font-medium">
                          {t("admin.settings.orderSettings.futureOrders.enableDelivery")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t("admin.settings.orderSettings.futureOrders.enableDeliveryDescription")}
                        </p>
                      </div>
                      <Switch
                        id="enableFutureDeliveryOrders"
                        checked={formData.enableFutureDeliveryOrders || false}
                        onCheckedChange={(checked: boolean) =>
                          handleInputChange("enableFutureDeliveryOrders", checked)
                        }
                      />
                    </div>
                    {formData.enableFutureDeliveryOrders && (
                      <div className="space-y-2">
                        <Label htmlFor="futureDeliveryOrderDays">
                          {t("admin.settings.orderSettings.futureOrders.maxDaysDelivery")}
                        </Label>
                        <NumberInput
                          id="futureDeliveryOrderDays"
                          value={formData.futureDeliveryOrderDays || 0}
                          onChange={(value) =>
                            handleInputChange("futureDeliveryOrderDays", value)
                          }
                          allowDecimals={false}
                          min={0}
                          max={365}
                          placeholder="3"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("admin.settings.orderSettings.futureOrders.maxDaysDescription")}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <Separator />
            {/* Scheduled Order Merge Settings */}
            {formData.futureOrdersEnabled && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  {t("admin.settings.orderSettings.scheduledOrderMerge.title")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("admin.settings.orderSettings.scheduledOrderMerge.description")}
                </p>
              </div>
              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allowScheduledOrderMerge" className="text-sm font-medium">
                      {t("admin.settings.orderSettings.scheduledOrderMerge.enable")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.settings.orderSettings.scheduledOrderMerge.enableDescription")}
                    </p>
                  </div>
                  <Switch
                    id="allowScheduledOrderMerge"
                    checked={formData.allowScheduledOrderMerge || false}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange("allowScheduledOrderMerge", checked)
                    }
                  />
                </div>
                {formData.allowScheduledOrderMerge && (
                  <div className="space-y-2">
                    <Label htmlFor="scheduledOrderMergeCutoffHours">
                      {t("admin.settings.orderSettings.scheduledOrderMerge.cutoffHours")}
                    </Label>
                    <NumberInput
                      id="scheduledOrderMergeCutoffHours"
                      value={formData.scheduledOrderMergeCutoffHours}
                      onChange={(value) =>
                        handleInputChange("scheduledOrderMergeCutoffHours", value)
                      }
                      allowDecimals={false}
                      min={1}
                      max={48}
                      placeholder="2"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("admin.settings.orderSettings.scheduledOrderMerge.cutoffHoursDescription")}
                    </p>
                  </div>
                )}
              </div>
            </div>
            )}

            <Separator />

            {formData.futureOrdersEnabled && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  {t("admin.settings.orderSettings.scheduledOrderManagement.title")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "admin.settings.orderSettings.scheduledOrderManagement.description"
                  )}
                </p>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="scheduledOrderAllowCancellation"
                      className="text-sm font-medium"
                    >
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.cancellation.enable"
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.cancellation.enableDescription"
                      )}
                    </p>
                  </div>
                  <Switch
                    id="scheduledOrderAllowCancellation"
                    checked={formData.scheduledOrderAllowCancellation || false}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange("scheduledOrderAllowCancellation", checked)
                    }
                  />
                </div>

                {formData.scheduledOrderAllowCancellation && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderCancellationWindowHours">
                        {t(
                          "admin.settings.orderSettings.scheduledOrderManagement.cancellation.windowHours"
                        )}
                      </Label>
                      <NumberInput
                        id="scheduledOrderCancellationWindowHours"
                        value={formData.scheduledOrderCancellationWindowHours}
                        onChange={(value) =>
                          handleInputChange(
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
                            "admin.settings.orderSettings.scheduledOrderManagement.refund.fullHoursBefore"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderFullRefundHoursBefore"
                          value={formData.scheduledOrderFullRefundHoursBefore}
                          onChange={(value) =>
                            handleInputChange(
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
                            "admin.settings.orderSettings.scheduledOrderManagement.refund.partialHoursBefore"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderPartialRefundHoursBefore"
                          value={formData.scheduledOrderPartialRefundHoursBefore}
                          onChange={(value) =>
                            handleInputChange(
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
                            "admin.settings.orderSettings.scheduledOrderManagement.refund.noRefundHoursBefore"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderNoRefundHoursBefore"
                          value={formData.scheduledOrderNoRefundHoursBefore}
                          onChange={(value) =>
                            handleInputChange(
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
                            "admin.settings.orderSettings.scheduledOrderManagement.refund.partialPercentage"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderPartialRefundPercentage"
                          value={formData.scheduledOrderPartialRefundPercentage}
                          onChange={(value) =>
                            handleInputChange(
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
                            "admin.settings.orderSettings.scheduledOrderManagement.refund.reducedPercentage"
                          )}
                        </Label>
                        <NumberInput
                          id="scheduledOrderReducedRefundPercentage"
                          value={formData.scheduledOrderReducedRefundPercentage}
                          onChange={(value) =>
                            handleInputChange(
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
              </div>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="scheduledOrderAutoConfirm"
                      className="text-sm font-medium"
                    >
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.autoConfirm.label"
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.autoConfirm.description"
                      )}
                    </p>
                  </div>
                  <Switch
                    id="scheduledOrderAutoConfirm"
                    checked={(formData as any).scheduledOrderAutoConfirm ?? true}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange("scheduledOrderAutoConfirm" as any, checked)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="scheduledOrderMinimumAmount"
                    className="text-sm font-medium"
                  >
                    {t(
                      "admin.settings.orderSettings.scheduledOrderManagement.minimumAmount.label"
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "admin.settings.orderSettings.scheduledOrderManagement.minimumAmount.description"
                    )}
                  </p>
                  <Input
                    id="scheduledOrderMinimumAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={(formData as any).scheduledOrderMinimumAmount ?? 0}
                    onChange={(e) =>
                      handleInputChange(
                        "scheduledOrderMinimumAmount" as any,
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="max-w-xs"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="scheduledOrderAllowModification"
                      className="text-sm font-medium"
                    >
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.modification.enable"
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.modification.enableDescription"
                      )}
                    </p>
                  </div>
                  <Switch
                    id="scheduledOrderAllowModification"
                    checked={formData.scheduledOrderAllowModification || false}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange("scheduledOrderAllowModification", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="scheduledOrderAllowShallowModification"
                      className="text-sm font-medium"
                    >
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.modification.shallowEnable"
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "admin.settings.orderSettings.scheduledOrderManagement.modification.shallowEnableDescription"
                      )}
                    </p>
                  </div>
                  <Switch
                    id="scheduledOrderAllowShallowModification"
                    checked={(formData as any).scheduledOrderAllowShallowModification || false}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange(
                        "scheduledOrderAllowShallowModification" as any,
                        checked
                      )
                    }
                  />
                </div>

                {formData.scheduledOrderAllowModification && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="scheduledOrderModificationWindowHours">
                        {t(
                          "admin.settings.orderSettings.scheduledOrderManagement.modification.windowHours"
                        )}
                      </Label>
                      <NumberInput
                        id="scheduledOrderModificationWindowHours"
                        value={formData.scheduledOrderModificationWindowHours}
                        onChange={(value) =>
                          handleInputChange(
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
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <Label htmlFor="scheduledOrderTimeSlotInterval" className="text-sm font-medium">
                  {t("admin.settings.orderSettings.scheduledOrderTimeSlotInterval.label")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("admin.settings.orderSettings.scheduledOrderTimeSlotInterval.description")}
                </p>
                <NumberInput
                  id="scheduledOrderTimeSlotInterval"
                  value={formData.scheduledOrderTimeSlotInterval ?? 30}
                  onChange={(value) =>
                    handleInputChange("scheduledOrderTimeSlotInterval", value)
                  }
                  allowDecimals={false}
                  min={5}
                  max={240}
                  placeholder="30"
                />
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <Label htmlFor="scheduledOrderMaxOrdersPerSlot" className="text-sm font-medium">
                  {t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.label")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.description")}
                </p>
                <NumberInput
                  id="scheduledOrderMaxOrdersPerSlot"
                  value={formData.scheduledOrderMaxOrdersPerSlot ?? undefined}
                  onChange={(value) =>
                    handleInputChange(
                      "scheduledOrderMaxOrdersPerSlot",
                      value === undefined ? null : value
                    )
                  }
                  allowDecimals={false}
                  min={1}
                  placeholder={t(
                    "admin.settings.orderSettings.scheduledOrderMaxOrdersPerSlot.placeholder"
                  )}
                />
              </div>
            </div>
            )}
          </div>
        </CollapsibleCard>

        {/* Delivery Settings */}
        <CollapsibleCard
          icon={<Icon path={mdiTruck} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.deliverySettings.title")}
          description={t("admin.settings.deliverySettings.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryRadius">
                  {t("admin.settings.deliverySettings.deliveryRadius")}
                </Label>
                <NumberInput
                  id="deliveryRadius"
                  value={formData.deliveryRadius || 5}
                  onChange={(value) =>
                    handleInputChange("deliveryRadius", value)
                  }
                  allowDecimals={true}
                  min={0}
                  placeholder={t(
                    "admin.settings.deliverySettings.deliveryRadiusPlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryRatePerKilometer">
                  {t(
                    "admin.settings.deliverySettings.deliveryRatePerKilometer"
                  )}
                </Label>
                <NumberInput
                  id="deliveryRatePerKilometer"
                  value={formData.deliveryRatePerKilometer || 0}
                  onChange={(value) =>
                    handleInputChange("deliveryRatePerKilometer", value)
                  }
                  allowDecimals={true}
                  min={0}
                  placeholder={t(
                    "admin.settings.deliverySettings.deliveryRatePerKilometerPlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useDynamicDeliveryFee"
                    checked={formData.useDynamicDeliveryFee || false}
                    onCheckedChange={(checked: boolean) => {
                      handleInputChange("useDynamicDeliveryFee", checked);
                      // Disable tiered if enabling dynamic
                      if (checked) {
                        handleInputChange("useTieredDeliveryFee", false);
                      }
                    }}
                  />
                  <Label htmlFor="useDynamicDeliveryFee">
                    {t("admin.settings.deliverySettings.useDynamicDeliveryFee")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.settings.deliverySettings.useDynamicDeliveryFeeDescription"
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useTieredDeliveryFee"
                    checked={formData.useTieredDeliveryFee || false}
                    onCheckedChange={(checked: boolean) => {
                      handleInputChange("useTieredDeliveryFee", checked);
                      // Disable dynamic if enabling tiered
                      if (checked) {
                        handleInputChange("useDynamicDeliveryFee", false);
                      }
                    }}
                  />
                  <Label htmlFor="useTieredDeliveryFee">
                    {t("admin.settings.deliverySettings.useTieredDeliveryFee")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.settings.deliverySettings.useTieredDeliveryFeeDescription"
                  )}
                </p>
              </div>

              {!(formData.useDynamicDeliveryFee || formData.useTieredDeliveryFee) && (
                <div className="space-y-2">
                  <Label htmlFor="deliveryFee">
                    {t("admin.settings.deliverySettings.fixedDeliveryFee")}
                  </Label>
                  <NumberInput
                    id="deliveryFee"
                    value={formData.deliveryFee || 0}
                    onChange={(value) => handleInputChange("deliveryFee", value)}
                    allowDecimals={true}
                    min={0}
                    placeholder={t(
                      "admin.settings.deliverySettings.fixedDeliveryFeePlaceholder"
                    )}
                  />
                </div>
              )}

              {/* Tiered Delivery Configuration */}
              {(formData.useTieredDeliveryFee || false) && (
                <div className="space-y-4 pl-6 border-l-2 border-pink-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="initialDeliveryRange">
                        {t(
                          "admin.settings.deliverySettings.initialDeliveryRange"
                        )}
                      </Label>
                      <NumberInput
                        id="initialDeliveryRange"
                        value={formData.initialDeliveryRange || 3}
                        onChange={(value) =>
                          handleInputChange("initialDeliveryRange", value)
                        }
                        allowDecimals={true}
                        min={0}
                        placeholder={t(
                          "admin.settings.deliverySettings.initialDeliveryRangePlaceholder"
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "admin.settings.deliverySettings.initialDeliveryRangeDescription"
                        )}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="initialDeliveryPrice">
                        {t(
                          "admin.settings.deliverySettings.initialDeliveryPrice"
                        )}
                      </Label>
                      <NumberInput
                        id="initialDeliveryPrice"
                        value={formData.initialDeliveryPrice || 2.0}
                        onChange={(value) =>
                          handleInputChange("initialDeliveryPrice", value)
                        }
                        allowDecimals={true}
                        min={0}
                        placeholder={t(
                          "admin.settings.deliverySettings.initialDeliveryPricePlaceholder"
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "admin.settings.deliverySettings.initialDeliveryPriceDescription"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="extendedDeliveryThreshold">
                        {t(
                          "admin.settings.deliverySettings.extendedDeliveryThreshold"
                        )}{" "}
                        <span className="text-xs text-muted-foreground">
                          {t(
                            "admin.settings.deliverySettings.extendedThresholdOptional"
                          )}
                        </span>
                      </Label>
                      <NumberInput
                        id="extendedDeliveryThreshold"
                        value={formData.extendedDeliveryThreshold ?? 0}
                        onChange={(value) =>
                          handleInputChange(
                            "extendedDeliveryThreshold",
                            value !== undefined && value > 0 ? value : null
                          )
                        }
                        allowDecimals={true}
                        min={0}
                        placeholder={t(
                          "admin.settings.deliverySettings.extendedDeliveryThresholdPlaceholder"
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "admin.settings.deliverySettings.extendedDeliveryThresholdDescription"
                        )}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extendedDeliveryRate">
                        {t(
                          "admin.settings.deliverySettings.extendedDeliveryRate"
                        )}{" "}
                        <span className="text-xs text-muted-foreground">
                          {t(
                            "admin.settings.deliverySettings.extendedThresholdOptional"
                          )}
                        </span>
                      </Label>
                      <NumberInput
                        id="extendedDeliveryRate"
                        value={formData.extendedDeliveryRate ?? 0}
                        onChange={(value) =>
                          handleInputChange(
                            "extendedDeliveryRate",
                            value !== undefined && value > 0 ? value : null
                          )
                        }
                        allowDecimals={true}
                        min={0}
                        placeholder={t(
                          "admin.settings.deliverySettings.extendedDeliveryRatePlaceholder"
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "admin.settings.deliverySettings.extendedDeliveryRateDescription"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      <strong>
                        {t("admin.settings.deliverySettings.howItWorks")}
                      </strong>{" "}
                      {t(
                        "admin.settings.deliverySettings.howItWorksDescription"
                      )}
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="deliveryTimeEstimate">
                  {t("admin.settings.deliverySettings.deliveryTimeEstimate")}
                </Label>
                <NumberInput
                  id="deliveryTimeEstimate"
                  value={formData.deliveryTimeEstimate || 45}
                  onChange={(value) =>
                    handleInputChange("deliveryTimeEstimate", value)
                  }
                  allowDecimals={false}
                  min={1}
                  placeholder={t(
                    "admin.settings.deliverySettings.deliveryTimeEstimatePlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freeDeliveryThreshold">
                  {t("admin.settings.deliverySettings.freeDeliveryThreshold")}
                </Label>
                <NumberInput
                  id="freeDeliveryThreshold"
                  value={formData.freeDeliveryThreshold || 50}
                  onChange={(value) =>
                    handleInputChange("freeDeliveryThreshold", value)
                  }
                  allowDecimals={true}
                  min={0}
                  placeholder={t(
                    "admin.settings.deliverySettings.freeDeliveryThresholdPlaceholder"
                  )}
                  disabled={!formData.enableFreeDelivery}
                />
                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableFreeDelivery"
                    checked={formData.enableFreeDelivery || false}
                    onCheckedChange={(checked: boolean) =>
                      handleInputChange("enableFreeDelivery", checked)
                    }
                  />
                  <Label htmlFor="enableFreeDelivery">
                    {t("admin.settings.deliverySettings.enableFreeDelivery")}
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Delivery Serving Hours */}
        <CollapsibleCard
          icon={<Icon path={mdiClock} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.servingHours.title")}
          description={t("admin.settings.servingHours.description")}
        >
          <div className="space-y-4">
            {/* Allow Orders Outside Hours Toggle */}
            <div className="flex items-center space-x-2 p-4 bg-pink-50 dark:bg-pink-950/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <Switch
                id="allowOrdersOutsideHours"
                checked={formData.allowOrdersOutsideHours || false}
                onCheckedChange={(checked: boolean) =>
                  handleInputChange("allowOrdersOutsideHours", checked)
                }
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
            {[
              { key: "monday", label: t("admin.settings.servingHours.monday") },
              { key: "tuesday", label: t("admin.settings.servingHours.tuesday") },
              { key: "wednesday", label: t("admin.settings.servingHours.wednesday") },
              { key: "thursday", label: t("admin.settings.servingHours.thursday") },
              { key: "friday", label: t("admin.settings.servingHours.friday") },
              { key: "saturday", label: t("admin.settings.servingHours.saturday") },
              { key: "sunday", label: t("admin.settings.servingHours.sunday") },
            ].map((day) => {
              const isOff = (formData[`${day.key}IsOff` as keyof Settings] as boolean) || false;
              const periodsKey = `${day.key}Periods` as keyof Settings;
              const openKey = `${day.key}Open` as keyof Settings;
              const closeKey = `${day.key}Close` as keyof Settings;
              
              // Get periods with backward compatibility
              const getDayPeriods = (): Array<{ open: string; close: string }> => {
                const periods = formData[periodsKey] as Array<{ open: string; close: string }> | undefined;
                if (periods && Array.isArray(periods) && periods.length > 0) {
                  return periods;
                }
                // Fallback to single open/close
                const open = formData[openKey] as string | undefined;
                const close = formData[closeKey] as string | undefined;
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
                    open: t("admin.settings.servingHours.defaultOpenTime"), 
                    close: t("admin.settings.servingHours.defaultCloseTime") 
                  });
                }
                newPeriods[periodIndex] = {
                  ...newPeriods[periodIndex],
                  [type]: time,
                };
                handleInputChange(periodsKey, newPeriods);
              };

              const addPeriod = () => {
                const newPeriods = [...periods, { 
                  open: t("admin.settings.servingHours.defaultOpenTime"), 
                  close: t("admin.settings.servingHours.defaultCloseTime") 
                }];
                handleInputChange(periodsKey, newPeriods);
              };

              const removePeriod = (periodIndex: number) => {
                if (periods.length <= 1) {
                  handleInputChange(periodsKey, [{ open: "", close: "" }]);
                  return;
                }
                const newPeriods = periods.filter((_, index) => index !== periodIndex);
                handleInputChange(periodsKey, newPeriods);
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
                        handleInputChange(`${day.key}IsOff` as keyof Settings, checked)
                      }
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
                        {t("admin.settings.servingHours.openTime")}
                      </Label>
                      <TimePicker12Hour
                                time={period.open || undefined}
                        onTimeChange={(time) =>
                                  updatePeriodTime(periodIndex, "open", time || "")
                        }
                        placeholder={t("admin.settings.servingHours.openTime")}
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                              <Label htmlFor={`${day.key}Period${periodIndex}Close`}>
                        {t("admin.settings.servingHours.closeTime")}
                      </Label>
                      <TimePicker12Hour
                                time={period.close || undefined}
                        onTimeChange={(time) =>
                                  updatePeriodTime(periodIndex, "close", time || "")
                        }
                        placeholder={t("admin.settings.servingHours.closeTime")}
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
                        {t("admin.settings.servingHours.addPeriod")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleCard>

        {/* Delivery Payment Settings */}
        <CollapsibleCard
          icon={<Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.deliveryPaymentSettings.title", { defaultValue: "Delivery Payment Settings" })}
          description={t("admin.settings.deliveryPaymentSettings.description", { defaultValue: "Configure payment methods available for delivery orders" })}
        >
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="acceptCash"
                  checked={formData.acceptCash || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("acceptCash", checked)
                  }
                />
                <Label htmlFor="acceptCash">
                  {t("admin.settings.paymentSettings.acceptCash")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="acceptCard"
                  checked={formData.acceptCard || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("acceptCard", checked)
                  }
                />
                <Label htmlFor="acceptCard">
                  {t("admin.settings.paymentSettings.acceptCard")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="acceptOnlinePayment"
                  checked={formData.acceptOnlinePayment || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("acceptOnlinePayment", checked)
                  }
                />
                <Label htmlFor="acceptOnlinePayment">
                  {t("admin.settings.paymentSettings.acceptOnlinePayment")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="acceptPayPal"
                  checked={formData.acceptPayPal || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("acceptPayPal", checked)
                  }
                />
                <Label htmlFor="acceptPayPal">
                  {t("admin.settings.paymentSettings.acceptPayPal")}
                </Label>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Pickup Payment Settings */}
        <CollapsibleCard
          icon={<Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.paymentSettings.pickupPaymentSettings.title")}
          description={t("admin.settings.paymentSettings.pickupPaymentSettings.description")}
        >
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="pickupAcceptCash"
                  checked={formData.pickupAcceptCash || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("pickupAcceptCash", checked)
                  }
                />
                <Label htmlFor="pickupAcceptCash">
                  {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptCash")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="pickupAcceptCard"
                  checked={formData.pickupAcceptCard || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("pickupAcceptCard", checked)
                  }
                />
                <Label htmlFor="pickupAcceptCard">
                  {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptCard")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="pickupAcceptOnlinePayment"
                  checked={formData.pickupAcceptOnlinePayment || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("pickupAcceptOnlinePayment", checked)
                  }
                />
                <Label htmlFor="pickupAcceptOnlinePayment">
                  {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptOnlinePayment")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="pickupAcceptPayPal"
                  checked={formData.pickupAcceptPayPal || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("pickupAcceptPayPal", checked)
                  }
                />
                <Label htmlFor="pickupAcceptPayPal">
                  {t("admin.settings.paymentSettings.pickupPaymentSettings.acceptPayPal")}
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickupTakeawayServiceFee">
                  {t("admin.settings.paymentSettings.pickupPaymentSettings.takeawayServiceFee", { defaultValue: "Takeaway service fee" })}
                </Label>
                <NumberInput
                  id="pickupTakeawayServiceFee"
                  value={(formData as any).pickupTakeawayServiceFee ?? 0}
                  onChange={(value) =>
                    handleInputChange("pickupTakeawayServiceFee" as any, value)
                  }
                  allowDecimals={true}
                  min={0}
                />
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Social Media & Contact */}
        <CollapsibleCard
          icon={<Icon path={mdiWeb} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.socialMedia.title")}
          description={t("admin.settings.socialMedia.description")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="facebookUrl">
                  {t("admin.settings.socialMedia.facebookUrl")}
                </Label>
                <Input
                  id="facebookUrl"
                  value={formData.facebookUrl || ""}
                  onChange={(e) =>
                    handleInputChange("facebookUrl", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.socialMedia.facebookUrlPlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagramUrl">
                  {t("admin.settings.socialMedia.instagramUrl")}
                </Label>
                <Input
                  id="instagramUrl"
                  value={formData.instagramUrl || ""}
                  onChange={(e) =>
                    handleInputChange("instagramUrl", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.socialMedia.instagramUrlPlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twitterUrl">
                  {t("admin.settings.socialMedia.twitterUrl")}
                </Label>
                <Input
                  id="twitterUrl"
                  value={formData.twitterUrl || ""}
                  onChange={(e) =>
                    handleInputChange("twitterUrl", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.socialMedia.twitterUrlPlaceholder"
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">
                  {t("admin.settings.socialMedia.websiteUrl")}
                </Label>
                <Input
                  id="websiteUrl"
                  value={formData.websiteUrl || ""}
                  onChange={(e) =>
                    handleInputChange("websiteUrl", e.target.value)
                  }
                  placeholder={t(
                    "admin.settings.socialMedia.websiteUrlPlaceholder"
                  )}
                />
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Application Status */}
        <CollapsibleCard
          icon={<Icon path={mdiShieldAlert} size={0.83} className="text-pink-500" />}
          title={t("admin.settings.appStatus.title")}
          description={t("admin.settings.appStatus.description")}
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="appStatus">
                {t("admin.settings.appStatus.label")}
              </Label>
              <Select
                value={currentAppStatus}
                onValueChange={(value) =>
                  handleInputChange("appStatus", value as AppStatus)
                }
              >
                <SelectTrigger id="appStatus" className="w-full bg-transparent">
                  <SelectValue
                    placeholder={t("admin.settings.appStatus.label")}
                  />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {APP_STATUS_ORDER.map((status) => {
                    const translationKey = APP_STATUS_KEY_MAP[status];
                    return (
                      <SelectItem
                        key={status}
                        value={status}
                        textValue={t(`appStatus.states.${translationKey}.label`)}
                      >
                        <div className="flex flex-col gap-0.5 py-1">
                          <span className="font-medium">
                            {t(`appStatus.states.${translationKey}.label`)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t(
                              `appStatus.states.${translationKey}.adminDescription`
                            )}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                {t("admin.settings.appStatus.previewLabel")}
              </Label>
              <AppStatusNotice status={currentAppStatus} />
            </div>
          </div>
        </CollapsibleCard>

        {/* Main Branch Configuration */}
        <CollapsibleCard
          icon={<Icon path={mdiOfficeBuilding} size={0.83} className="text-pink-500" />}
          title="Main Branch"
          description="Select the main branch to display as the default option in the branch switcher"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="mainBranchId">
                Main Branch
              </Label>
              {loadingBranches ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
                  Loading branches...
                </div>
              ) : (
                <Select
                  value={formData.mainBranchId || "none"}
                  onValueChange={(value) =>
                    handleInputChange("mainBranchId", value === "none" ? null : value)
                  }
                >
                  <SelectTrigger id="mainBranchId" className="w-full bg-transparent">
                    <SelectValue placeholder="Select a main branch (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="none">
                      <span className="text-muted-foreground">None (no default branch)</span>
                    </SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name || `Branch ${b.id.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                The main branch will appear as the first option in the branch switcher on the home page
              </p>
            </div>
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
};

export default SettingsPage;
