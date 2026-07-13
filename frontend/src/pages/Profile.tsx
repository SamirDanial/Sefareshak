import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import ApiService from "@/services/apiService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiArrowRight, mdiContentSave, mdiAccount, mdiAlertCircle, mdiFileDocument, mdiChevronRight, mdiCalendar, mdiHeart, mdiStore } from "@mdi/js";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { profileSchema } from "@/validation/profileSchema";
import type { ProfileFormData } from "@/validation/profileSchema";
import { ZodError } from "zod";
import { ProfileSkeleton } from "@/components/ui/skeleton";
import { reservationService } from "@/services/reservationService";
import { useBranch } from "@/contexts/BranchContext";
import { useSettings } from "@/contexts/SettingsContext";
import type { AppStatus } from "@/services/settingsService";
import branchService, { type Branch } from "@/services/branchService";

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}

// Use Zod schema type for profile data
type ProfileData = ProfileFormData & { addresses: Address[] };

export default function Profile() {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const apiService = ApiService.getInstance();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { branch } = useBranch();
  const { settings } = useSettings();
  const appStatus = (settings?.appStatus || "LIVE") as AppStatus;
  const isAppUnavailable = appStatus !== "LIVE";
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    phone: "",
    description: "",
    addresses: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reservationsEnabled, setReservationsEnabled] = useState(true);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string;
  }>({});
  const [errorDialog, setErrorDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
  });

  const { setBranch } = useBranch();
  const [likedBranches, setLikedBranches] = useState<Branch[]>([]);

  const loadLikedBranches = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await branchService.getLikedBranches(token);
      if (res && res.success && Array.isArray(res.data)) {
        setLikedBranches(res.data);
      }
    } catch (err) {
      console.error("Error loading liked branches:", err);
    }
  };

  // Load user data
  useEffect(() => {
    const loadUserProfile = async () => {
      if (user) {
        setIsLoading(true);
        try {
          const token = await getToken();

          if (!token) {
            throw new Error("No authentication token available");
          }

          const result = await apiService.getUserProfile(token);

          if (result.success && result.data) {
            // Prioritize database data, only fall back to Clerk data if database fields are empty
            setProfileData({
              firstName: result.data.firstName || user.firstName || "",
              lastName: result.data.lastName || user.lastName || "",
              phone:
                result.data.phone || user.phoneNumbers?.[0]?.phoneNumber || "",
              description: result.data.description || "",
              addresses: result.data.addresses || [],
            });
          } else {
            // Only fall back to Clerk data if API call failed
            throw new Error("Failed to load profile from database");
          }
        } catch (error) {
          console.error("Error loading profile:", error);
          // Fallback to Clerk user data only when API fails
          setProfileData({
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            phone: user.phoneNumbers?.[0]?.phoneNumber || "",
            description: "",
            addresses: [],
          });
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadUserProfile();
    loadLikedBranches();
  }, [user, getToken, apiService]);

  // Load reservation settings
  useEffect(() => {
    const loadReservationSettings = async () => {
      try {
        const token = await getToken();
        if (token) {
          const settings = await reservationService.getSettings(token, branch?.id);
          setReservationsEnabled(settings.isEnabled === true);
        }
      } catch (error) {
        console.error("Error loading reservation settings:", error);
        // Default to enabled if there's an error
        setReservationsEnabled(true);
      }
    };

    if (user) {
      loadReservationSettings();
    }
  }, [user, getToken, branch?.id]);

  const handleInputChange = (field: keyof ProfileData, value: string) => {
    setProfileData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const validateForm = (): boolean => {
    try {
      profileSchema.parse({
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phone: profileData.phone,
        description: profileData.description,
        addresses: profileData.addresses,
      });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof ZodError) {
        const newErrors: typeof errors = {};
        error.issues.forEach((err) => {
          const field = err.path[0] as keyof typeof errors;
          if (field && field in errors) {
            newErrors[field] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSave = async () => {
    // Validate form before saving
    if (!validateForm()) {
      toast.error(t("profile.validationErrorsBeforeSaving"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return;
    }

    setIsSaving(true);
    try {
      // Get the auth token from Clerk
      const token = await getToken();

      const requestData = {
        firstName: profileData.firstName ?? "",
        lastName: profileData.lastName ?? "",
        phone: profileData.phone ?? "",
        description: profileData.description ?? "",
      };

      const result = await apiService.updateUserProfile(
        token ?? "",
        requestData
      );

      if (result.success) {
        toast.success(t("profile.profileUpdated"), {
          duration: 4000,
          style: {
            background: "rgba(236, 72, 153, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(236, 72, 153, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(236, 72, 153, 0.3)",
          },
        });
      } else {
        // Handle backend validation errors
        if (result.details && Array.isArray(result.details)) {
          const backendErrors: typeof errors = {};
          result.details.forEach((error: string) => {
            if (error.includes("First name")) {
              backendErrors.firstName = error;
            } else if (error.includes("Last name")) {
              backendErrors.lastName = error;
            } else if (error.includes("Phone number")) {
              backendErrors.phone = error;
            }
          });
          setErrors(backendErrors);

          toast.error(t("profile.fixValidationErrors"), {
            duration: 4000,
            style: {
              background: "rgba(239, 68, 68, 0.9)",
              color: "#ffffff",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
            },
          });
          return;
        }

        throw new Error(result.error || "Failed to save profile");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      setErrorDialog({
        isOpen: true,
        title: t("profile.failedToSaveProfile"),
        message:
          error instanceof Error
            ? error.message
            : t("profile.unexpectedError"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Show skeleton loader while loading
  if (isLoading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="space-y-6 loading-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-pink-500 hover:text-pink-400 transition-colors"
        >
          <Icon path={i18n.language === "da" ? mdiArrowRight : mdiArrowLeft} size={0.83} className="text-pink-500" />
          <span className="text-sm font-medium">{t("common.back")}</span>
        </Link>
        <h1 className="text-lg font-semibold text-white">{t("profile.title")}</h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Personal Information */}
        <Card className="bg-neutral-900 border-neutral-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Icon path={mdiAccount} size={0.83} className="text-pink-500" />
              {t("profile.personalInformation")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-neutral-300 mb-2 block">
                  {t("profile.firstName")} <span className="text-red-400">*</span>
                </label>
                <Input
                  value={profileData.firstName}
                  onChange={(e) =>
                    handleInputChange("firstName", e.target.value)
                  }
                  className={`bg-neutral-800 text-white ${
                    errors.firstName
                      ? "border-red-500 focus:border-red-500"
                      : "border-neutral-600 focus:border-pink-500"
                  }`}
                  placeholder={t("profile.firstNamePlaceholder")}
                />
                {errors.firstName && (
                  <p className="text-red-400 text-xs mt-1">
                    {errors.firstName}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-neutral-300 mb-2 block">
                  {t("profile.lastName")} <span className="text-red-400">*</span>
                </label>
                <Input
                  value={profileData.lastName}
                  onChange={(e) =>
                    handleInputChange("lastName", e.target.value)
                  }
                  className={`bg-neutral-800 text-white ${
                    errors.lastName
                      ? "border-red-500 focus:border-red-500"
                      : "border-neutral-600 focus:border-pink-500"
                  }`}
                  placeholder={t("profile.lastNamePlaceholder")}
                />
                {errors.lastName && (
                  <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-neutral-300 mb-2 block">
                {t("profile.phoneNumber")} <span className="text-red-400">*</span>
              </label>
              <Input
                value={profileData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                className={`bg-neutral-800 text-white ${
                  errors.phone
                    ? "border-red-500 focus:border-red-500"
                    : "border-neutral-600 focus:border-pink-500"
                }`}
                placeholder={t("profile.phonePlaceholder")}
                type="tel"
              />
              {errors.phone && (
                <p className="text-red-400 text-xs mt-1">{errors.phone}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-neutral-300 mb-2 block">
                {t("profile.description")} ({t("profile.optional")})
              </label>
              <textarea
                value={profileData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                className="w-full h-24 px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-md text-white placeholder-neutral-400 resize-none"
                placeholder={t("profile.descriptionPlaceholder")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 hover:shadow-rose-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon path={mdiContentSave} size={0.67} className="mr-2" />
          {isSaving ? t("profile.saving") : t("profile.saveProfile")}
        </Button>

        {/* Liked Branches Card */}
        {likedBranches.length > 0 && (
          <Card className="bg-neutral-900 border-neutral-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Icon path={mdiHeart} size={0.83} className="text-pink-500 fill-pink-500" />
                {t("profile.favoritedBranches", { defaultValue: "Favorisierte Filialen" })}
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-neutral-800 space-y-0 p-0">
              {likedBranches.map((br) => (
                <button
                  key={br.id}
                  onClick={() => {
                    setBranch({ id: br.id, name: br.name ?? null, distanceKm: null });
                    toast.success(t("profile.branchSwitched", { defaultValue: "Switched branch to {{name}}", name: br.name }));
                    setTimeout(() => navigate("/"), 500);
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-neutral-800 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <Icon path={mdiStore} size={0.83} className="text-pink-500" />
                    <div>
                      <h3 className="text-sm font-semibold text-white group-hover:text-pink-400 transition-colors">
                        {br.name}
                      </h3>
                      {br.address && (
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {br.address}, {br.city}
                        </p>
                      )}
                    </div>
                  </div>
                  <Icon path={mdiChevronRight} size={0.83} className="text-neutral-500 group-hover:text-pink-500" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Reservations */}
        <Card className="bg-neutral-900 border-neutral-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Icon path={mdiCalendar} size={0.83} className="text-pink-500" />
              Reservations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {reservationsEnabled ? (
              <Link
                to="/reservations/book"
                onClick={(e) => {
                  if (isAppUnavailable) e.preventDefault();
                }}
                className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors group ${
                  isAppUnavailable
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-neutral-800"
                }`}
              >
                <span className="text-neutral-300 group-hover:text-white">
                  Book a Table
                </span>
                <Icon path={mdiChevronRight} size={0.83} className="text-neutral-500 group-hover:text-pink-500" />
              </Link>
            ) : null}
            <Link
              to="/reservations/my-reservations"
              className="w-full flex items-center justify-between p-4 rounded-lg transition-colors group hover:bg-neutral-800"
            >
              <span className="text-neutral-300 group-hover:text-white">
                {t("common.myReservations")}
              </span>
              <Icon path={mdiChevronRight} size={0.83} className="text-neutral-500 group-hover:text-pink-500" />
            </Link>
          </CardContent>
        </Card>

        {/* Legal Section */}
        <Card className="bg-neutral-900 border-neutral-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Icon path={mdiFileDocument} size={0.83} className="text-pink-500" />
              {t("profile.legal")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <button
              onClick={() => navigate("/terms-and-policies?type=TERMS_OF_SERVICE")}
              className="w-full flex items-center justify-between p-4 hover:bg-neutral-800 rounded-lg transition-colors group"
            >
              <span className="text-neutral-300 group-hover:text-white">
                {t("admin.termsAndPolicies.policyTypeLabels.TERMS_OF_SERVICE")}
              </span>
              <Icon path={mdiChevronRight} size={0.83} className="text-neutral-500 group-hover:text-pink-500" />
            </button>
            <button
              onClick={() => navigate("/terms-and-policies?type=PRIVACY_POLICY")}
              className="w-full flex items-center justify-between p-4 hover:bg-neutral-800 rounded-lg transition-colors group"
            >
              <span className="text-neutral-300 group-hover:text-white">
                {t("admin.termsAndPolicies.policyTypeLabels.PRIVACY_POLICY")}
              </span>
              <Icon path={mdiChevronRight} size={0.83} className="text-neutral-500 group-hover:text-pink-500" />
            </button>
            <button
              onClick={() => navigate("/terms-and-policies?type=COOKIE_POLICY")}
              className="w-full flex items-center justify-between p-4 hover:bg-neutral-800 rounded-lg transition-colors group"
            >
              <span className="text-neutral-300 group-hover:text-white">
                {t("admin.termsAndPolicies.policyTypeLabels.COOKIE_POLICY")}
              </span>
              <Icon path={mdiChevronRight} size={0.83} className="text-neutral-500 group-hover:text-pink-500" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Error Dialog */}
      <Dialog
        open={errorDialog.isOpen}
        onOpenChange={(open: boolean) =>
          setErrorDialog((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogContent className="bg-neutral-900 border-neutral-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Icon path={mdiAlertCircle} size={0.83} />
              {errorDialog.title}
            </DialogTitle>
            <DialogDescription className="text-neutral-300">
              {errorDialog.message}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                setErrorDialog((prev) => ({ ...prev, isOpen: false }))
              }
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
