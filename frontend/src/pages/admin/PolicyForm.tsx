import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@mdi/react";
import { mdiArrowLeft, mdiLoading, mdiContentSave } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/PermissionContext";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? "" : "http://localhost:3001");

type PolicyType =
  | "TERMS_OF_SERVICE"
  | "PRIVACY_POLICY"
  | "COOKIE_POLICY"
  | "REFUND_POLICY"
  | "DELIVERY_POLICY"
  | "DATA_PROTECTION_POLICY"
  | "USER_AGREEMENT"
  | "OTHER";

interface PolicyFormData {
  type: PolicyType;
  title: string;
  content: string;
  language: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  isRequired: boolean;
}

const POLICY_TYPES: { value: PolicyType; label: string }[] = [
  { value: "TERMS_OF_SERVICE", label: "Terms of Service" },
  { value: "PRIVACY_POLICY", label: "Privacy Policy" },
  { value: "COOKIE_POLICY", label: "Cookie Policy" },
  { value: "REFUND_POLICY", label: "Refund Policy" },
  { value: "DELIVERY_POLICY", label: "Delivery Policy" },
  { value: "DATA_PROTECTION_POLICY", label: "Data Protection Policy" },
  { value: "USER_AGREEMENT", label: "User Agreement" },
  { value: "OTHER", label: "Other" },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
];

export default function PolicyForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [searchParams] = useSearchParams();
  const policyId = searchParams.get("id");
  const isEditing = !!policyId;

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="text-sm text-muted-foreground">Access denied</div>
      </div>
    );
  }

  const [formData, setFormData] = useState<PolicyFormData>({
    type: "TERMS_OF_SERVICE",
    title: "",
    content: "",
    language: "en",
    version: "1.0",
    effectiveDate: new Date().toISOString().split("T")[0],
    isActive: false,
    isRequired: true,
  });

  const [loading, setLoading] = useState(!!policyId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (policyId) {
      fetchPolicy();
    }
  }, [policyId]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/${policyId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        const policy = json.data;
        setFormData({
          type: policy.type,
          title: policy.title,
          content: policy.content,
          language: policy.language,
          version: policy.version,
          effectiveDate: policy.effectiveDate.split("T")[0],
          isActive: policy.isActive,
          isRequired: policy.isRequired,
        });
      }
    } catch (e) {
      console.error("Error fetching policy:", e);
      alert("Failed to load policy");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const token = await getToken();
      if (!token) return;

      const url = isEditing
        ? `${API_BASE_URL}/api/terms-and-policies/${policyId}`
        : `${API_BASE_URL}/api/terms-and-policies`;

      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save policy");
      }

      navigate("/admin/terms-and-policies");
    } catch (e: any) {
      console.error("Error saving policy:", e);
      alert(e.message || "Failed to save policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-6">
        <div className="flex items-center justify-center py-12">
          <Icon path={mdiLoading} size={1.33} className="animate-spin text-pink-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => navigate("/admin/terms-and-policies")}
            className="mb-2 -ml-2"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="mr-2" />
            {t("common.back")}
          </Button>
          <h2 className="text-lg font-semibold text-pink-500">
            {isEditing
              ? t("admin.termsAndPolicies.editPolicy")
              : t("admin.termsAndPolicies.createNewPolicy")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? t("admin.termsAndPolicies.updatePolicyDescription")
              : t("admin.termsAndPolicies.createPolicyDescription")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.termsAndPolicies.policyDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">{t("admin.termsAndPolicies.policyType")}</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, type: value as PolicyType })
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_TYPES.map((type) => {
                      const translationKey = `admin.termsAndPolicies.policyTypeLabels.${type.value}`;
                      const translated = t(translationKey);
                      const label = translated !== translationKey ? translated : type.label;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">{t("admin.termsAndPolicies.language")}</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value) =>
                    setFormData({ ...formData, language: value })
                  }
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{t("admin.termsAndPolicies.titleLabel")}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">{t("admin.termsAndPolicies.versionLabel")}</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) =>
                  setFormData({ ...formData, version: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="effectiveDate">{t("admin.termsAndPolicies.effectiveDate")}</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={formData.effectiveDate}
                onChange={(e) =>
                  setFormData({ ...formData, effectiveDate: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">{t("admin.termsAndPolicies.contentLabel")}</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                rows={15}
                required
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label htmlFor="isActive">{t("admin.termsAndPolicies.activeLabel")}</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isRequired"
                  checked={formData.isRequired}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isRequired: checked })
                  }
                />
                <Label htmlFor="isRequired">{t("admin.termsAndPolicies.requiredLabel")}</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/terms-and-policies")}
            className="border-border hover:bg-muted text-foreground"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            {isSubmitting ? (
              <>
                <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                {t("admin.termsAndPolicies.saving")}
              </>
            ) : (
              <>
                <Icon path={mdiContentSave} size={0.67} className="mr-2" />
                {isEditing
                  ? t("admin.termsAndPolicies.updatePolicy")
                  : t("admin.termsAndPolicies.createPolicy")}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

