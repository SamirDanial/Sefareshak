import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import Icon from "@mdi/react";
import { mdiContentSave, mdiRefresh } from "@mdi/js";

import { toast } from "@/components/Toast";
import ImageUpload from "@/components/ImageUpload";
import Switch from "@/components/Switch";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "@/lib/permissions";
import {
  heroSectionService,
  type HeroSection,
  type HeroSectionFormData,
} from "@/services/heroSectionService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const HeroSectionManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny, isSuperAdmin } = usePermissions();

  const [scope, setScope] = useState<"organization" | "global">("organization");

  const canManageHeroSection = canAny([
    { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.UPDATE },
    { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.MANAGE },
  ]);

  const [heroSection, setHeroSection] = useState<HeroSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<HeroSectionFormData>({
    badgeText: "",
    title: "",
    subtitle: "",
    backgroundImage: "",
    primaryButtonText: "",
    primaryButtonLink: "",
    secondaryButtonText: "",
    secondaryButtonLink: "",
    isActive: true,
  });

  const resetForm = () => {
    setHeroSection(null);
    setFormData({
      badgeText: "",
      title: "",
      subtitle: "",
      backgroundImage: "",
      primaryButtonText: "",
      primaryButtonLink: "",
      secondaryButtonText: "",
      secondaryButtonLink: "",
      isActive: true,
    });
  };

  // Fetch hero section
  const fetchHeroSection = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const heroSections = await heroSectionService.getAllHeroSections(
        token || undefined,
        scope
      );

      if (heroSections.length > 0) {
        // Get the active one or the most recent one
        const activeSection =
          heroSections.find((h) => h.isActive) || heroSections[0];
        setHeroSection(activeSection);
        setFormData({
          badgeText: activeSection.badgeText || "",
          title: activeSection.title || "",
          subtitle: activeSection.subtitle || "",
          backgroundImage: activeSection.backgroundImage || "",
          primaryButtonText: activeSection.primaryButtonText || "",
          primaryButtonLink: activeSection.primaryButtonLink || "",
          secondaryButtonText: activeSection.secondaryButtonText || "",
          secondaryButtonLink: activeSection.secondaryButtonLink || "",
          isActive: activeSection.isActive,
        });
      } else {
        resetForm();
      }
    } catch (error) {
      console.error("Error fetching hero section:", error);
      toast.error(
        (error as any)?.message || t("admin.heroSectionManagement.fetchError")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeroSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // React to organization switch changes (storage + custom event)
  useEffect(() => {
    const getSelectedOrganizationId = (): string => {
      try {
        const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
        return (raw || "").trim();
      } catch {
        return "";
      }
    };

    let currentOrgId = getSelectedOrganizationId();

    const applyOrgChange = (nextOrgId: string) => {
      const normalized = String(nextOrgId || "").trim();
      if (normalized === currentOrgId) return;
      currentOrgId = normalized;

      // When scope is global, organization changes should not affect displayed data.
      if (scope === "global") return;

      resetForm();
      fetchHeroSection();
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgChange(detail?.organizationId);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ORG_STORAGE_KEY) return;
      applyOrgChange(event.newValue || "");
    };

    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [scope]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManageHeroSection) {
      toast.error(t("common.accessDenied"));
      return;
    }

    if (!formData.title.trim()) {
      toast.error(t("admin.heroSectionManagement.titleRequiredError"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (heroSection) {
        // Update existing
        await heroSectionService.updateHeroSection(
          heroSection.id,
          formData,
          token || undefined,
          scope
        );
        toast.success(t("admin.heroSectionManagement.updateSuccess"));
      } else {
        // Create new
        const newHeroSection = await heroSectionService.createHeroSection(
          formData,
          token || undefined,
          scope
        );
        setHeroSection(newHeroSection);
        toast.success(t("admin.heroSectionManagement.createSuccess"));
      }

      await fetchHeroSection();
    } catch (error) {
      console.error("Error saving hero section:", error);
      toast.error(t("admin.heroSectionManagement.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExternalImage = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const getImageUrl = (image: string | null | undefined): string => {
    if (!image) return "";
    if (isExternalImage(image)) return image;
    
    // If it already starts with /uploads/images/, handle accordingly
    if (image.startsWith("/uploads/images/")) {
      const filename = image.replace("/uploads/images/", "");
      return `${API_BASE_URL}/uploads/images/${filename}`;
    } else {
      // Simple filename - append to base URL
      return `${API_BASE_URL}/uploads/images/${image}`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Icon path={mdiRefresh} size={1.33} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-pink-500">{t("admin.heroSectionManagement.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isSuperAdmin ? (
            <div className="flex items-center justify-end gap-2 mb-6">
              <Button
                type="button"
                variant="outline"
                className={
                  scope === "organization"
                    ? "bg-pink-500 text-white border-pink-500 hover:cursor-pointer"
                    : "text-pink-500 border-pink-500 hover:cursor-pointer"
                }
                onClick={() => setScope("organization")}
                disabled={loading || isSubmitting}
              >
                {t("admin.heroSection.scope.organization", { defaultValue: "Organization" })}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={
                  scope === "global"
                    ? "bg-pink-500 text-white border-pink-500 hover:cursor-pointer"
                    : "text-pink-500 border-pink-500 hover:cursor-pointer"
                }
                onClick={() => setScope("global")}
                disabled={loading || isSubmitting}
              >
                {t("admin.heroSection.scope.global", { defaultValue: "Application" })}
              </Button>
            </div>
          ) : null}

          <form
            onSubmit={canManageHeroSection ? handleSubmit : (e) => e.preventDefault()}
            className="space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="badgeText">{t("admin.heroSectionManagement.badgeText")}</Label>
              <Input
                id="badgeText"
                value={formData.badgeText || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, badgeText: e.target.value }))}
                placeholder={t("admin.heroSectionManagement.badgeTextPlaceholder")}
                disabled={!canManageHeroSection}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">
                {t("admin.heroSectionManagement.heroTitle")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t("admin.heroSectionManagement.heroTitlePlaceholder")}
                required
                disabled={!canManageHeroSection}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">{t("admin.heroSectionManagement.subtitle")}</Label>
              <textarea
                id="subtitle"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.subtitle || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, subtitle: e.target.value }))}
                placeholder={t("admin.heroSectionManagement.subtitlePlaceholder")}
                rows={3}
                disabled={!canManageHeroSection}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("admin.heroSectionManagement.backgroundImage")}</Label>
              <ImageUpload
                value={formData.backgroundImage || undefined}
                onChange={(value) => setFormData((prev) => ({ ...prev, backgroundImage: value }))}
                disabled={!canManageHeroSection}
                translationNamespace="admin.heroSectionManagement"
              />
              {formData.backgroundImage ? (
                <div className="mt-2">
                  <img
                    src={getImageUrl(formData.backgroundImage)}
                    alt="Hero background"
                    className="max-w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">{t("admin.heroSectionManagement.primaryButton")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryButtonText">{t("admin.heroSectionManagement.buttonText")}</Label>
                  <Input
                    id="primaryButtonText"
                    value={formData.primaryButtonText || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, primaryButtonText: e.target.value }))
                    }
                    placeholder={t("admin.heroSectionManagement.buttonTextPlaceholder")}
                    disabled={!canManageHeroSection}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryButtonLink">{t("admin.heroSectionManagement.buttonLink")}</Label>
                  <Input
                    id="primaryButtonLink"
                    value={formData.primaryButtonLink || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, primaryButtonLink: e.target.value }))
                    }
                    placeholder={t("admin.heroSectionManagement.buttonLinkPlaceholder")}
                    disabled={!canManageHeroSection}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">{t("admin.heroSectionManagement.secondaryButton")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="secondaryButtonText">{t("admin.heroSectionManagement.buttonText")}</Label>
                  <Input
                    id="secondaryButtonText"
                    value={formData.secondaryButtonText || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, secondaryButtonText: e.target.value }))
                    }
                    placeholder={t("admin.heroSectionManagement.secondaryButtonTextPlaceholder")}
                    disabled={!canManageHeroSection}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondaryButtonLink">{t("admin.heroSectionManagement.buttonLink")}</Label>
                  <Input
                    id="secondaryButtonLink"
                    value={formData.secondaryButtonLink || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, secondaryButtonLink: e.target.value }))
                    }
                    placeholder={t("admin.heroSectionManagement.buttonLinkPlaceholder")}
                    disabled={!canManageHeroSection}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">{t("admin.heroSectionManagement.activeStatus")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("admin.heroSectionManagement.activeStatusHint")}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive !== false}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
                disabled={!canManageHeroSection}
              />
            </div>

            {formData.backgroundImage ? (
              <div className="space-y-2 border-t pt-4">
                <Label>{t("admin.heroSectionManagement.preview")}</Label>
                <div
                  className="relative overflow-hidden rounded-2xl shadow-lg h-64"
                  style={{
                    backgroundImage: `url('${getImageUrl(formData.backgroundImage)}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
                  <div className="relative p-5 sm:p-6 h-full flex flex-col justify-end">
                    <div className="max-w-xs">
                      {formData.badgeText ? (
                        <div className="inline-flex items-center rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur mb-3">
                          {formData.badgeText}
                        </div>
                      ) : null}
                      {formData.title ? (
                        <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                          {formData.title}
                        </h1>
                      ) : null}
                      {formData.subtitle ? (
                        <p className="mt-2 text-sm text-white/90">{formData.subtitle}</p>
                      ) : null}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {formData.primaryButtonText ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400"
                        >
                          {formData.primaryButtonText}
                        </Button>
                      ) : null}
                      {formData.secondaryButtonText ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-rose-300/70 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                        >
                          {formData.secondaryButtonText}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="submit"
                disabled={isSubmitting || !canManageHeroSection}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                    {t("admin.heroSectionManagement.saving")}
                  </>
                ) : (
                  <>
                    <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                    {t("admin.heroSectionManagement.saveHeroSection")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default HeroSectionManagement;

