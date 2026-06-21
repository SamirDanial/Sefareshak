import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { heroSectionService } from "@/services/heroSectionService";
import type {
  HeroSection,
  HeroSectionFormData,
} from "@/services/heroSectionService";
import ImageUpload from "@/components/ui/image-upload";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import { mdiRefresh, mdiContentSave } from "@mdi/js";
import { ACTIONS, RESOURCES } from "@/lib/permissions";

const HeroSectionManagement: React.FC = () => {
  const { getToken } = useAuth();
  const { canAny, isSuperAdmin } = usePermissions();
  const { t } = useTranslation();
  const [heroSection, setHeroSection] = useState<HeroSection | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [scope, setScope] = useState<"organization" | "global">("organization");

  const canManageHeroSection = canAny([
    { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.UPDATE },
    { resource: RESOURCES.HERO_SECTIONS, action: ACTIONS.MANAGE },
  ]);

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
    } catch (error: any) {
      console.error("Error fetching hero section:", error);
      toast.error(error?.message || t("admin.heroSection.error.fetching"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeroSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManageHeroSection) {
      toast.error("Access denied");
      return;
    }

    if (!formData.title.trim()) {
      toast.error(t("admin.heroSection.error.titleRequired"));
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
        toast.success(t("admin.heroSection.success.updated"));
      } else {
        // Create new
        const newHeroSection = await heroSectionService.createHeroSection(
          formData,
          token || undefined,
          scope
        );
        setHeroSection(newHeroSection);
        toast.success(t("admin.heroSection.success.created"));
      }

      await fetchHeroSection();
    } catch (error: any) {
      console.error("Error saving hero section:", error);
      toast.error(error?.message || t("admin.heroSection.error.saving"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = (imageUrl: string) => {
    setFormData((prev) => ({ ...prev, backgroundImage: imageUrl }));
  };

  const getImageUrl = (image: string | null | undefined): string => {
    if (!image) return "";
    if (isExternalImage(image)) return image;
    return getOptimizedImageUrl(image);
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
          <CardTitle className="text-pink-500">
            {t("admin.heroSection.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSuperAdmin && (
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
                {t("admin.heroSection.scope.organization", {
                  defaultValue: "Organization",
                })}
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
                {t("admin.heroSection.scope.global", {
                  defaultValue: "Application",
                })}
              </Button>
            </div>
          )}
          <form onSubmit={canManageHeroSection ? handleSubmit : (e) => e.preventDefault()} className="space-y-6">
            {/* Badge Text */}
            <div className="space-y-2">
              <Label htmlFor="badgeText">
                {t("admin.heroSection.badgeText")}
              </Label>
              <Input
                id="badgeText"
                value={formData.badgeText}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    badgeText: e.target.value,
                  }))
                }
                placeholder={t("admin.heroSection.badgeTextPlaceholder")}
                disabled={!canManageHeroSection}
              />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                {t("admin.heroSection.titleLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder={t("admin.heroSection.titlePlaceholder")}
                required
                disabled={!canManageHeroSection}
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-2">
              <Label htmlFor="subtitle">
                {t("admin.heroSection.subtitle")}
              </Label>
              <Textarea
                id="subtitle"
                className="bg-transparent"
                value={formData.subtitle}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, subtitle: e.target.value }))
                }
                placeholder={t("admin.heroSection.subtitlePlaceholder")}
                rows={3}
                disabled={!canManageHeroSection}
              />
            </div>

            {/* Background Image */}
            <div className="space-y-2">
              <Label>{t("admin.heroSection.backgroundImage")}</Label>
              <ImageUpload
                value={formData.backgroundImage || undefined}
                onChange={handleImageUpload}
                disabled={!canManageHeroSection}
              />
              {formData.backgroundImage && (
                <div className="mt-2">
                  <img
                    src={getImageUrl(formData.backgroundImage)}
                    alt="Hero background"
                    className="max-w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              )}
            </div>

            {/* Primary Button */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">
                {t("admin.heroSection.primaryButton")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryButtonText">
                    {t("admin.heroSection.buttonText")}
                  </Label>
                  <Input
                    id="primaryButtonText"
                    value={formData.primaryButtonText}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        primaryButtonText: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "admin.heroSection.primaryButtonTextPlaceholder"
                    )}
                    disabled={!canManageHeroSection}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryButtonLink">
                    {t("admin.heroSection.buttonLink")}
                  </Label>
                  <Input
                    id="primaryButtonLink"
                    value={formData.primaryButtonLink}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        primaryButtonLink: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "admin.heroSection.primaryButtonLinkPlaceholder"
                    )}
                    disabled={!canManageHeroSection}
                  />
                </div>
              </div>
            </div>

            {/* Secondary Button */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">
                {t("admin.heroSection.secondaryButton")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="secondaryButtonText">
                    {t("admin.heroSection.buttonText")}
                  </Label>
                  <Input
                    id="secondaryButtonText"
                    value={formData.secondaryButtonText}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        secondaryButtonText: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "admin.heroSection.secondaryButtonTextPlaceholder"
                    )}
                    disabled={!canManageHeroSection}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondaryButtonLink">
                    {t("admin.heroSection.buttonLink")}
                  </Label>
                  <Input
                    id="secondaryButtonLink"
                    value={formData.secondaryButtonLink}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        secondaryButtonLink: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "admin.heroSection.secondaryButtonLinkPlaceholder"
                    )}
                    disabled={!canManageHeroSection}
                  />
                </div>
              </div>
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">
                  {t("admin.heroSection.isActive")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("admin.heroSection.isActiveDescription")}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked: boolean) =>
                  setFormData((prev) => ({ ...prev, isActive: checked }))
                }
                disabled={!canManageHeroSection}
              />
            </div>

            {/* Preview */}
            {formData.backgroundImage && (
              <div className="space-y-2 border-t pt-4">
                <Label>{t("admin.heroSection.preview")}</Label>
                <div
                  className="relative overflow-hidden rounded-2xl shadow-lg h-64"
                  style={{
                    backgroundImage: `url('${getImageUrl(
                      formData.backgroundImage
                    )}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
                  <div className="relative p-5 sm:p-6 h-full flex flex-col justify-end">
                    <div className="max-w-xs">
                      {formData.badgeText && (
                        <div className="inline-flex items-center rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur mb-3">
                          {formData.badgeText}
                        </div>
                      )}
                      {formData.title && (
                        <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                          {formData.title}
                        </h1>
                      )}
                      {formData.subtitle && (
                        <p className="mt-2 text-sm text-white/90">
                          {formData.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {formData.primaryButtonText && (
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400"
                        >
                          {formData.primaryButtonText}
                        </Button>
                      )}
                      {formData.secondaryButtonText && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300/70 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                        >
                          {formData.secondaryButtonText}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="submit"
                disabled={isSubmitting || !canManageHeroSection}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                    {t("admin.heroSection.saving")}
                  </>
                ) : (
                  <>
                    <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                    {t("admin.heroSection.save")}
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
