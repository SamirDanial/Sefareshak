import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Save,
  RotateCcw,
  Building2,
  DollarSign,
  ShoppingCart,
  Truck,
  CreditCard,
  Globe,
  Navigation,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { SettingsService, type Settings } from "../services/settingsService";
import PageHeader from "../components/PageHeader";
import { toast } from "../components/Toast";
import googlePlacesService, { type AddressComponents } from "../services/googlePlacesService";
import NumberInput from "../components/NumberInput";
import Switch from "../components/Switch";
import Select from "../components/Select";

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const canUpdateSettings = canAny([
    { resource: RESOURCES.SETTINGS, action: ACTIONS.UPDATE },
    { resource: RESOURCES.SETTINGS, action: ACTIONS.MANAGE },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Settings>>({});
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
  const [reverseGeocoding, setReverseGeocoding] = useState(false);

  useEffect(() => {
    loadSettings();
    googlePlacesService.loadScript(() => {
      setGoogleLoaded(true);
    });
  }, []);

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

  const loadSettings = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await SettingsService.getSettings(token || undefined);
      if (response.success) {
        setFormData(response.data);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error(t("admin.settings.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = await getToken();
      const response = await SettingsService.updateSettings(
        formData,
        token || undefined
      );
      if (response.success) {
        toast.success(t("admin.settings.saveSuccess"));
        setFormData(response.data);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(t("admin.settings.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const token = await getToken();
      const response = await SettingsService.resetSettings(token || undefined);
      if (response.success) {
        toast.success(t("admin.settings.resetSuccess"));
        setFormData(response.data);
      }
    } catch (error) {
      console.error("Error resetting settings:", error);
      toast.error(t("admin.settings.resetError"));
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = useCallback((field: keyof Settings, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
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

  const getCurrentLocation = useCallback(() => {
    setGettingLocation(true);
    googlePlacesService.getCurrentLocation(
      (components) => {
        setGettingLocation(false);
        handleAddressChange(components);
        toast.success(t("admin.settings.locationSuccess"));
      },
      (error) => {
        console.error("Location error callback:", error);
        setGettingLocation(false);
        toast.error(error || t("admin.settings.locationError"));
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
          (loading) => {
            setCityLoading(loading);
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

  // Reverse geocode when latitude and longitude are manually entered
  useEffect(() => {
    const lat = formData.latitude;
    const lng = formData.longitude;

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

      if (
        !isNaN(latNum) &&
        !isNaN(lngNum) &&
        latNum >= -90 &&
        latNum <= 90 &&
        lngNum >= -180 &&
        lngNum <= 180
      ) {
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
        }, 1000);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [googleLoaded, formData.latitude, formData.longitude, handleAddressChange]);

  if (loading) {
    return (
      <div style={{ padding: "24px", backgroundColor: "#f9fafb", minHeight: "100vh" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <RefreshCw
              style={{
                height: "48px",
                width: "48px",
                color: "#ec4899",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: "0 0 8px",
              }}
            >
              {t("admin.settings.loadingTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
              {t("admin.settings.loadingDescription")}
            </p>
          </div>
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", backgroundColor: "#f9fafb", minHeight: "100vh" }}>
      <PageHeader
        title={t("admin.settings.title")}
        description={t("admin.settings.description")}
        actions={
          <>
            <button
              onClick={handleReset}
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#6b7280",
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ffffff";
              }}
            >
              <RotateCcw style={{ height: "18px", width: "18px" }} />
              {t("common.reset")}
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !canUpdateSettings}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#ffffff",
                backgroundColor: "#ec4899",
                border: "none",
                borderRadius: "8px",
                cursor: saving || !canUpdateSettings ? "not-allowed" : "pointer",
                opacity: saving || !canUpdateSettings ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!saving && canUpdateSettings) e.currentTarget.style.backgroundColor = "#db2777";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ec4899";
              }}
            >
              {saving ? (
                <RefreshCw style={{ height: "18px", width: "18px", animation: "spin 1s linear infinite" }} />
              ) : (
                <Save style={{ height: "18px", width: "18px" }} />
              )}
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </>
        }
      />

      {/* Settings Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Business Information */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <Building2 style={{ height: "20px", width: "20px", color: "#ec4899" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.settings.businessInformation.title")}
            </h3>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 20px" }}>
            {t("admin.settings.businessInformation.description")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Basic Business Info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label
                  htmlFor="businessName"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.businessInformation.businessName")}
                </label>
                <input
                  id="businessName"
                  type="text"
                  value={formData.businessName || ""}
                  onChange={(e) => handleInputChange("businessName", e.target.value)}
                  placeholder={t("admin.settings.businessInformation.businessNamePlaceholder")}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: saving ? "#f9fafb" : "#ffffff",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="businessEmail"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.businessInformation.businessEmail")}
                </label>
                <input
                  id="businessEmail"
                  type="email"
                  value={formData.businessEmail || ""}
                  onChange={(e) => handleInputChange("businessEmail", e.target.value)}
                  placeholder={t("admin.settings.businessInformation.businessEmailPlaceholder")}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: saving ? "#f9fafb" : "#ffffff",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="businessPhone"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.businessInformation.businessPhone")}
                </label>
                <input
                  id="businessPhone"
                  type="text"
                  value={formData.businessPhone || ""}
                  onChange={(e) => handleInputChange("businessPhone", e.target.value)}
                  placeholder={t("admin.settings.businessInformation.businessPhonePlaceholder")}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: saving ? "#f9fafb" : "#ffffff",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="businessLogo"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.businessInformation.businessLogoUrl")}
                </label>
                <input
                  id="businessLogo"
                  type="text"
                  value={formData.businessLogo || ""}
                  onChange={(e) => handleInputChange("businessLogo", e.target.value)}
                  placeholder={t("admin.settings.businessInformation.businessLogoUrlPlaceholder")}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: saving ? "#f9fafb" : "#ffffff",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#ec4899";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Separator */}
            <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "8px 0" }} />

            {/* Address Information */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontSize: "16px", fontWeight: "600", color: "#111827", display: "block", marginBottom: "4px" }}>
                    {t("admin.settings.businessInformation.addressInformation")}
                  </label>
                  <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                    {t("admin.settings.businessInformation.addressDescription")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  disabled={gettingLocation || !googleLoaded || saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#6b7280",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    cursor: (gettingLocation || !googleLoaded || saving) ? "not-allowed" : "pointer",
                    opacity: (gettingLocation || !googleLoaded || saving) ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!gettingLocation && googleLoaded && !saving) {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!gettingLocation && googleLoaded && !saving) {
                      e.currentTarget.style.backgroundColor = "#ffffff";
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }
                  }}
                >
                  {gettingLocation ? (
                    <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Navigation style={{ height: "16px", width: "16px" }} />
                  )}
                  {gettingLocation ? t("admin.settings.businessInformation.gettingLocation") : t("admin.settings.businessInformation.useGps")}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Country */}
                <div>
                  <label
                    htmlFor="country"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.settings.businessInformation.country")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="country"
                      type="text"
                      value={formData.country || ""}
                      onChange={(e) => handleCountryInputChange(e.target.value)}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#ec4899";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                        if (formData.country && formData.country.length >= 2) {
                          setShowCountrySuggestions(true);
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                        setTimeout(() => {
                          setShowCountrySuggestions(false);
                        }, 200);
                      }}
                      placeholder={t("admin.settings.businessInformation.countryPlaceholder")}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        paddingRight: countryLoading ? "36px" : "12px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        outline: "none",
                        backgroundColor: saving ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                    />
                    {countryLoading && (
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                        <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite", color: "#6b7280" }} />
                      </div>
                    )}
                    {showCountrySuggestions && countrySuggestions.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 50,
                          width: "100%",
                          marginTop: "4px",
                          backgroundColor: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          maxHeight: "240px",
                          overflow: "auto",
                        }}
                      >
                        {countrySuggestions.map((country, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleCountrySelect(country)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              fontSize: "14px",
                              color: "#111827",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            {country}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* State */}
                {countryHasStates && (
                  <div>
                    <label
                      htmlFor="state"
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#111827",
                        marginBottom: "8px",
                      }}
                    >
                      {t("admin.settings.businessInformation.stateProvince")}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="state"
                        type="text"
                        value={formData.state || ""}
                        onChange={(e) => handleStateInputChange(e.target.value)}
                        onFocus={(e) => {
                          if (formData.country && !saving) {
                            e.currentTarget.style.borderColor = "#ec4899";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                          }
                          if (formData.state && formData.state.length >= 1) {
                            setShowStateSuggestions(true);
                          }
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "#e5e7eb";
                          e.currentTarget.style.boxShadow = "none";
                          setTimeout(() => {
                            setShowStateSuggestions(false);
                          }, 200);
                        }}
                        placeholder={t("admin.settings.businessInformation.stateProvincePlaceholder")}
                        disabled={!formData.country || saving}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          paddingRight: stateLoading ? "36px" : "12px",
                          fontSize: "14px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          outline: "none",
                          backgroundColor: (!formData.country || saving) ? "#f9fafb" : "#ffffff",
                          color: "#111827",
                        }}
                      />
                      {stateLoading && (
                        <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                          <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite", color: "#6b7280" }} />
                        </div>
                      )}
                      {showStateSuggestions && stateSuggestions.length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            zIndex: 50,
                            width: "100%",
                            marginTop: "4px",
                            backgroundColor: "#ffffff",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                            maxHeight: "240px",
                            overflow: "auto",
                          }}
                        >
                          {stateSuggestions.map((state, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleStateSelect(state)}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "10px 12px",
                                fontSize: "14px",
                                color: "#111827",
                                backgroundColor: "transparent",
                                border: "none",
                                cursor: "pointer",
                                outline: "none",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              {state}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* City */}
                <div>
                  <label
                    htmlFor="city"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.settings.businessInformation.city")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="city"
                      type="text"
                      value={formData.city || ""}
                      onChange={(e) => handleCityInputChange(e.target.value)}
                      onFocus={(e) => {
                        if (formData.country && !saving) {
                          e.currentTarget.style.borderColor = "#ec4899";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                        }
                        if (formData.city && formData.city.length >= 1) {
                          setShowCitySuggestions(true);
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                        setTimeout(() => {
                          setShowCitySuggestions(false);
                        }, 200);
                      }}
                      placeholder={t("admin.settings.businessInformation.cityPlaceholder")}
                      disabled={!formData.country || saving}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        paddingRight: cityLoading ? "36px" : "12px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        outline: "none",
                        backgroundColor: (!formData.country || saving) ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                    />
                    {cityLoading && (
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                        <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite", color: "#6b7280" }} />
                      </div>
                    )}
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 50,
                          width: "100%",
                          marginTop: "4px",
                          backgroundColor: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          maxHeight: "240px",
                          overflow: "auto",
                        }}
                      >
                        {citySuggestions.map((city, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleCitySelect(city)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              fontSize: "14px",
                              color: "#111827",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Address Line One */}
                <div>
                  <label
                    htmlFor="addressLineOne"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.settings.businessInformation.addressLineOne")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="addressLineOne"
                      type="text"
                      value={formData.addressLineOne || ""}
                      onChange={(e) => handleAddressInputChange(e.target.value)}
                      onFocus={(e) => {
                        if (formData.city && formData.country && !saving) {
                          e.currentTarget.style.borderColor = "#ec4899";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                        }
                        if (formData.addressLineOne && formData.addressLineOne.length >= 1) {
                          setShowAddressSuggestions(true);
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                        setTimeout(() => {
                          setShowAddressSuggestions(false);
                        }, 200);
                      }}
                      placeholder={t("admin.settings.businessInformation.addressLineOnePlaceholder")}
                      disabled={!formData.city || !formData.country || saving}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        paddingRight: addressLoading ? "36px" : "12px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        outline: "none",
                        backgroundColor: (!formData.city || !formData.country || saving) ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                    />
                    {addressLoading && (
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                        <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite", color: "#6b7280" }} />
                      </div>
                    )}
                    {showAddressSuggestions && addressSuggestions.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 50,
                          width: "100%",
                          marginTop: "4px",
                          backgroundColor: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          maxHeight: "240px",
                          overflow: "auto",
                        }}
                      >
                        {addressSuggestions.map((address, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleAddressSelect(address)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              fontSize: "14px",
                              color: "#111827",
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            {address}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Latitude and Longitude */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
                <div>
                  <label
                    htmlFor="latitude"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.settings.businessInformation.latitude")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude || ""}
                      onChange={(e) => handleInputChange("latitude", e.target.value)}
                      placeholder={t("admin.settings.businessInformation.latitudePlaceholder")}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        paddingRight: reverseGeocoding ? "36px" : "12px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        outline: "none",
                        backgroundColor: saving ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#ec4899";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    {reverseGeocoding && (
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                        <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite", color: "#6b7280" }} />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="longitude"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.settings.businessInformation.longitude")}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="longitude"
                      type="number"
                      step="any"
                      value={formData.longitude || ""}
                      onChange={(e) => handleInputChange("longitude", e.target.value)}
                      placeholder={t("admin.settings.businessInformation.longitudePlaceholder")}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        paddingRight: reverseGeocoding ? "36px" : "12px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        outline: "none",
                        backgroundColor: saving ? "#f9fafb" : "#ffffff",
                        color: "#111827",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#ec4899";
                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    {reverseGeocoding && (
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                        <RefreshCw style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite", color: "#6b7280" }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Address (Read-only) */}
              <div style={{ marginTop: "16px" }}>
                <label
                  htmlFor="businessAddress"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.businessInformation.fullAddress")}
                </label>
                <textarea
                  id="businessAddress"
                  value={formData.businessAddress || ""}
                  readOnly
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: "#f9fafb",
                    color: "#6b7280",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Settings */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <DollarSign style={{ height: "20px", width: "20px", color: "#ec4899" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.settings.financialSettings.title")}
            </h3>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 20px" }}>
            {t("admin.settings.financialSettings.description")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label
                  htmlFor="taxPercentage"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.financialSettings.taxPercentage")}
                </label>
                <NumberInput
                  id="taxPercentage"
                  value={formData.taxPercentage || 0}
                  onChange={(value) => handleInputChange("taxPercentage", value)}
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t("admin.settings.financialSettings.taxPercentagePlaceholder")}
                  disabled={saving}
                />
              </div>
              <div>
                <label
                  htmlFor="deliveryTaxPercentage"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.financialSettings.deliveryTaxPercentage")}
                </label>
                <NumberInput
                  id="deliveryTaxPercentage"
                  value={formData.deliveryTaxPercentage || 0}
                  onChange={(value) => handleInputChange("deliveryTaxPercentage", value)}
                  allowDecimals={true}
                  min={0}
                  max={100}
                  placeholder={t("admin.settings.financialSettings.deliveryTaxPercentagePlaceholder")}
                  disabled={saving}
                />
              </div>
              <div>
                <label
                  htmlFor="deliveryFee"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.financialSettings.deliveryFee")}
                </label>
                <NumberInput
                  id="deliveryFee"
                  value={formData.deliveryFee || 0}
                  onChange={(value) => handleInputChange("deliveryFee", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.financialSettings.deliveryFeePlaceholder")}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Tax Inclusive Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Switch
                id="taxInclusive"
                checked={formData.taxInclusive || false}
                onCheckedChange={(checked) => handleInputChange("taxInclusive", checked)}
                disabled={saving}
              />
              <label
                htmlFor="taxInclusive"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
                onClick={() => !saving && handleInputChange("taxInclusive", !formData.taxInclusive)}
              >
                {t("admin.settings.financialSettings.taxInclusive")}
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label
                  htmlFor="minimumOrderAmount"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.financialSettings.minimumOrderAmount")}
                </label>
                <NumberInput
                  id="minimumOrderAmount"
                  value={formData.minimumOrderAmount || 0}
                  onChange={(value) => handleInputChange("minimumOrderAmount", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder={t("admin.settings.financialSettings.minimumOrderAmountPlaceholder")}
                  disabled={!formData.enableMinimumOrder || saving}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                  <Switch
                    id="enableMinimumOrder"
                    checked={formData.enableMinimumOrder || false}
                    onCheckedChange={(checked) => handleInputChange("enableMinimumOrder", checked)}
                    disabled={saving}
                  />
                  <label
                    htmlFor="enableMinimumOrder"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                    onClick={() => !saving && handleInputChange("enableMinimumOrder", !formData.enableMinimumOrder)}
                  >
                    {t("admin.settings.financialSettings.enableMinimumOrder")}
                  </label>
                </div>
              </div>
              <div>
                <label
                  htmlFor="currency"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.settings.financialSettings.currency")}
                </label>
                <Select
                  value={formData.currency || "USD"}
                  onValueChange={(value) => handleInputChange("currency", value)}
                  placeholder={t("admin.settings.financialSettings.selectCurrency")}
                  disabled={saving}
                >
                  <Select.Trigger id="currency">
                    <Select.Value placeholder={t("admin.settings.financialSettings.selectCurrency")} />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="USD">{t("admin.settings.financialSettings.currencies.usd")}</Select.Item>
                    <Select.Item value="EUR">{t("admin.settings.financialSettings.currencies.eur")}</Select.Item>
                    <Select.Item value="GBP">{t("admin.settings.financialSettings.currencies.gbp")}</Select.Item>
                    <Select.Item value="INR">{t("admin.settings.financialSettings.currencies.inr")}</Select.Item>
                    <Select.Item value="AED">{t("admin.settings.financialSettings.currencies.aed")}</Select.Item>
                  </Select.Content>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Order Settings */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <ShoppingCart style={{ height: "20px", width: "20px", color: "#ec4899" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.settings.orderSettings.title")}
            </h3>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 20px" }}>
            {t("admin.settings.orderSettings.description")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "20px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="orderPreparationTime"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                  }}
                >
                  {t("admin.settings.orderSettings.orderPreparationTime")}
                </label>
                <NumberInput
                  id="orderPreparationTime"
                  value={formData.orderPreparationTime || 30}
                  onChange={(value) => handleInputChange("orderPreparationTime", value)}
                  allowDecimals={false}
                  min={1}
                  placeholder="30"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="maxOrderQuantity"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                  }}
                >
                  {t("admin.settings.orderSettings.maxOrderQuantity")}
                </label>
                <NumberInput
                  id="maxOrderQuantity"
                  value={formData.maxOrderQuantity || 10}
                  onChange={(value) => handleInputChange("maxOrderQuantity", value)}
                  allowDecimals={false}
                  min={1}
                  placeholder="10"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="preOrderAdvanceTime"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                  }}
                >
                  {t("admin.settings.orderSettings.preOrderAdvanceTime")}
                </label>
                <NumberInput
                  id="preOrderAdvanceTime"
                  value={formData.preOrderAdvanceTime || 60}
                  onChange={(value) => handleInputChange("preOrderAdvanceTime", value)}
                  allowDecimals={false}
                  min={1}
                  placeholder="60"
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <Switch
                id="allowPreOrders"
                checked={formData.allowPreOrders || false}
                onCheckedChange={(checked: boolean) =>
                  handleInputChange("allowPreOrders", checked)
                }
              />
              <label
                htmlFor="allowPreOrders"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                {t("admin.settings.orderSettings.allowPreOrders")}
              </label>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ flex: 1, paddingRight: "16px" }}>
                <label
                  htmlFor="allowExcludeOptionalIngredients"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  {t("admin.settings.orderSettings.allowExcludeOptionalIngredients")}
                </label>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    margin: 0,
                  }}
                >
                  {t("admin.settings.orderSettings.allowExcludeOptionalIngredientsDescription")}
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
          </div>
        </div>

        {/* Delivery Settings */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <Truck style={{ height: "20px", width: "20px", color: "#ec4899" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.settings.deliverySettings.title")}
            </h3>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 20px" }}>
            {t("admin.settings.deliverySettings.description")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "20px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="deliveryRadius"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                  }}
                >
                  {t("admin.settings.deliverySettings.deliveryRadius")}
                </label>
                <NumberInput
                  id="deliveryRadius"
                  value={formData.deliveryRadius || 5}
                  onChange={(value) => handleInputChange("deliveryRadius", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder="5"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="deliveryRatePerKilometer"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                  }}
                >
                  {t("admin.settings.deliverySettings.deliveryRatePerKilometer")}
                </label>
                <NumberInput
                  id="deliveryRatePerKilometer"
                  value={formData.deliveryRatePerKilometer || 0}
                  onChange={(value) => handleInputChange("deliveryRatePerKilometer", value)}
                  allowDecimals={true}
                  min={0}
                  placeholder="0"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Switch
                    id="useDynamicDeliveryFee"
                    checked={formData.useDynamicDeliveryFee || false}
                    onCheckedChange={(checked: boolean) => {
                      handleInputChange("useDynamicDeliveryFee", checked);
                      if (checked) {
                        handleInputChange("useTieredDeliveryFee", false);
                      }
                    }}
                  />
                  <label
                    htmlFor="useDynamicDeliveryFee"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      cursor: "pointer",
                    }}
                  >
                    {t("admin.settings.deliverySettings.useDynamicDeliveryFee")}
                  </label>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    margin: 0,
                    paddingLeft: "40px",
                  }}
                >
                  {t("admin.settings.deliverySettings.useDynamicDeliveryFeeDescription")}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Switch
                    id="useTieredDeliveryFee"
                    checked={formData.useTieredDeliveryFee || false}
                    onCheckedChange={(checked: boolean) => {
                      handleInputChange("useTieredDeliveryFee", checked);
                      if (checked) {
                        handleInputChange("useDynamicDeliveryFee", false);
                      }
                    }}
                  />
                  <label
                    htmlFor="useTieredDeliveryFee"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      cursor: "pointer",
                    }}
                  >
                    {t("admin.settings.deliverySettings.useTieredDeliveryFee")}
                  </label>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    margin: 0,
                    paddingLeft: "40px",
                  }}
                >
                  {t("admin.settings.deliverySettings.useTieredDeliveryFeeDescription")}
                </p>
              </div>
            </div>

            {/* Tiered Delivery Configuration */}
            {(formData.useTieredDeliveryFee || false) && (
              <div
                style={{
                  paddingLeft: "24px",
                  borderLeft: "2px solid #fce7f3",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "20px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label
                      htmlFor="initialDeliveryRange"
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#111827",
                      }}
                    >
                      {t("admin.settings.deliverySettings.initialDeliveryRange")}
                    </label>
                    <NumberInput
                      id="initialDeliveryRange"
                      value={formData.initialDeliveryRange || 3}
                      onChange={(value) => handleInputChange("initialDeliveryRange", value)}
                      allowDecimals={true}
                      min={0}
                      placeholder="3"
                    />
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        margin: 0,
                      }}
                    >
                      {t("admin.settings.deliverySettings.initialDeliveryRangeDescription")}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label
                      htmlFor="initialDeliveryPrice"
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#111827",
                      }}
                    >
                      {t("admin.settings.deliverySettings.initialDeliveryPrice")}
                    </label>
                    <NumberInput
                      id="initialDeliveryPrice"
                      value={formData.initialDeliveryPrice || 2.0}
                      onChange={(value) => handleInputChange("initialDeliveryPrice", value)}
                      allowDecimals={true}
                      min={0}
                      placeholder="2.0"
                    />
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        margin: 0,
                      }}
                    >
                      {t("admin.settings.deliverySettings.initialDeliveryPriceDescription")}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "20px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label
                      htmlFor="extendedDeliveryThreshold"
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#111827",
                      }}
                    >
                      {t("admin.settings.deliverySettings.extendedDeliveryThreshold")}{" "}
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>({t("admin.settings.deliverySettings.extendedDeliveryThresholdOptional")})</span>
                    </label>
                    <NumberInput
                      id="extendedDeliveryThreshold"
                      value={formData.extendedDeliveryThreshold ?? 0}
                      onChange={(value) =>
                        handleInputChange(
                          "extendedDeliveryThreshold",
                          value > 0 ? value : null
                        )
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder="0"
                    />
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        margin: 0,
                      }}
                    >
                      {t("admin.settings.deliverySettings.extendedDeliveryThresholdDescription")}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label
                      htmlFor="extendedDeliveryRate"
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#111827",
                      }}
                    >
                      {t("admin.settings.deliverySettings.extendedDeliveryRate")}{" "}
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>({t("admin.settings.deliverySettings.extendedDeliveryRateOptional")})</span>
                    </label>
                    <NumberInput
                      id="extendedDeliveryRate"
                      value={formData.extendedDeliveryRate ?? 0}
                      onChange={(value) =>
                        handleInputChange("extendedDeliveryRate", value > 0 ? value : null)
                      }
                      allowDecimals={true}
                      min={0}
                      placeholder="0"
                    />
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        margin: 0,
                      }}
                    >
                      {t("admin.settings.deliverySettings.extendedDeliveryRateDescription")}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    backgroundColor: "#eff6ff",
                    padding: "12px",
                    borderRadius: "6px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#1e40af",
                      margin: 0,
                    }}
                  >
                    {t("admin.settings.deliverySettings.tieredDeliveryHowItWorks")}
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="deliveryTimeEstimate"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.settings.deliverySettings.deliveryTimeEstimate")}
              </label>
              <NumberInput
                id="deliveryTimeEstimate"
                value={formData.deliveryTimeEstimate || 45}
                onChange={(value) => handleInputChange("deliveryTimeEstimate", value)}
                allowDecimals={false}
                min={1}
                placeholder="45"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="freeDeliveryThreshold"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.settings.deliverySettings.freeDeliveryThreshold")}
              </label>
              <NumberInput
                id="freeDeliveryThreshold"
                value={formData.freeDeliveryThreshold || 50}
                onChange={(value) => handleInputChange("freeDeliveryThreshold", value)}
                allowDecimals={true}
                min={0}
                placeholder="50"
                disabled={!formData.enableFreeDelivery}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                <Switch
                  id="enableFreeDelivery"
                  checked={formData.enableFreeDelivery || false}
                  onCheckedChange={(checked: boolean) =>
                    handleInputChange("enableFreeDelivery", checked)
                  }
                />
                <label
                  htmlFor="enableFreeDelivery"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    cursor: "pointer",
                  }}
                >
                  {t("admin.settings.deliverySettings.enableFreeDelivery")}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Settings */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <CreditCard style={{ height: "20px", width: "20px", color: "#ec4899" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.settings.paymentSettings.title")}
            </h3>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 20px" }}>
            {t("admin.settings.paymentSettings.description")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Switch
                id="acceptCash"
                checked={formData.acceptCash || false}
                onCheckedChange={(checked: boolean) => handleInputChange("acceptCash", checked)}
              />
              <label
                htmlFor="acceptCash"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                {t("admin.settings.paymentSettings.acceptCash")}
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Switch
                id="acceptCard"
                checked={formData.acceptCard || false}
                onCheckedChange={(checked: boolean) => handleInputChange("acceptCard", checked)}
              />
              <label
                htmlFor="acceptCard"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                {t("admin.settings.paymentSettings.acceptCard")}
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Switch
                id="acceptOnlinePayment"
                checked={formData.acceptOnlinePayment || false}
                onCheckedChange={(checked: boolean) =>
                  handleInputChange("acceptOnlinePayment", checked)
                }
              />
              <label
                htmlFor="acceptOnlinePayment"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                {t("admin.settings.paymentSettings.acceptOnlinePayment")}
              </label>
            </div>
          </div>
        </div>

        {/* Social Media & Contact */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <Globe style={{ height: "20px", width: "20px", color: "#ec4899" }} />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: 0,
              }}
            >
              {t("admin.settings.socialMediaContact.title")}
            </h3>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 20px" }}>
            {t("admin.settings.socialMediaContact.description")}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="facebookUrl"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.settings.socialMediaContact.facebookUrl")}
              </label>
              <input
                id="facebookUrl"
                type="url"
                value={formData.facebookUrl || ""}
                onChange={(e) => handleInputChange("facebookUrl", e.target.value)}
                placeholder={t("admin.settings.socialMediaContact.facebookUrlPlaceholder")}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: saving ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="instagramUrl"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.settings.socialMediaContact.instagramUrl")}
              </label>
              <input
                id="instagramUrl"
                type="url"
                value={formData.instagramUrl || ""}
                onChange={(e) => handleInputChange("instagramUrl", e.target.value)}
                placeholder={t("admin.settings.socialMediaContact.instagramUrlPlaceholder")}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: saving ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="twitterUrl"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.settings.socialMediaContact.twitterUrl")}
              </label>
              <input
                id="twitterUrl"
                type="url"
                value={formData.twitterUrl || ""}
                onChange={(e) => handleInputChange("twitterUrl", e.target.value)}
                placeholder={t("admin.settings.socialMediaContact.twitterUrlPlaceholder")}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: saving ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label
                htmlFor="websiteUrl"
                style={{
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                }}
              >
                {t("admin.settings.socialMediaContact.websiteUrl")}
              </label>
              <input
                id="websiteUrl"
                type="url"
                value={formData.websiteUrl || ""}
                onChange={(e) => handleInputChange("websiteUrl", e.target.value)}
                placeholder={t("admin.settings.socialMediaContact.websiteUrlPlaceholder")}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: saving ? "#f9fafb" : "#ffffff",
                  color: "#111827",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#ec4899";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236, 72, 153, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Settings;

