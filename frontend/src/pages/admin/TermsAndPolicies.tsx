import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Icon from "@mdi/react";
import { mdiPlus, mdiFilter, mdiPencil, mdiDelete, mdiClose, mdiLoading, mdiFileDocument } from "@mdi/js";
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

interface TermsAndPolicy {
  id: string;
  type: PolicyType;
  title: string;
  content: string;
  language: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  isRequired: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    userConsents: number;
  };
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

export default function TermsAndPolicies() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [policies, setPolicies] = useState<TermsAndPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<PolicyType | "">("");
  const [filterLanguage, setFilterLanguage] = useState<string>("");
  const [showFilterDialog, setShowFilterDialog] = useState(false);

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="text-sm text-muted-foreground">Access denied</div>
      </div>
    );
  }

  useEffect(() => {
    fetchPolicies();
  }, [filterType, filterLanguage]);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const params = new URLSearchParams();
      if (filterType) params.append("type", filterType);
      if (filterLanguage) params.append("language", filterLanguage);

      const url = `${API_BASE_URL}/api/terms-and-policies${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setPolicies(json.data);
      }
    } catch (e) {
      console.error("Error fetching policies:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    navigate("/admin/terms-and-policies/form");
  };

  const handleEdit = (policy: TermsAndPolicy) => {
    navigate(`/admin/terms-and-policies/form?id=${policy.id}`);
  };

  const handleDelete = async (policy: TermsAndPolicy) => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/${policy.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete");
      }
      fetchPolicies();
    } catch (e: any) {
      console.error("Error deleting policy:", e);
      alert(e.message || "Failed to delete policy");
    }
  };

  const getPolicyTypeLabel = (type: PolicyType) => {
    const translationKey = `admin.termsAndPolicies.policyTypeLabels.${type}`;
    const translated = t(translationKey);
    // If translation exists and is different from the key, use it
    return translated !== translationKey ? translated : (POLICY_TYPES.find((t) => t.value === type)?.label || type);
  };

  const getLanguageName = (code: string) => {
    return LANGUAGES.find((l) => l.code === code)?.name || code.toUpperCase();
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.termsAndPolicies.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.termsAndPolicies.description")}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => setShowFilterDialog(true)}
          className="flex items-center gap-2 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
        >
          <Icon path={mdiFilter} size={0.67} />
          {t("admin.termsAndPolicies.filter")}
        </Button>
        <Button
          onClick={handleCreateNew}
          className="flex items-center gap-2 bg-pink-500 hover:bg-pink-600 text-white"
        >
          <Icon path={mdiPlus} size={0.67} />
          {t("admin.termsAndPolicies.newPolicy")}
        </Button>
      </div>

      {(filterType || filterLanguage) && (
        <div className="flex items-center gap-2 flex-wrap">
          {filterType && (
            <Badge variant="secondary" className="flex items-center gap-2">
              {t("admin.termsAndPolicies.type")}: {getPolicyTypeLabel(filterType as PolicyType)}
              <button
                onClick={() => setFilterType("")}
                className="ml-1 hover:bg-secondary/80 rounded-full p-0.5"
              >
                <Icon path={mdiClose} size={0.50} />
              </button>
            </Badge>
          )}
          {filterLanguage && (
            <Badge variant="secondary" className="flex items-center gap-2">
              {t("admin.termsAndPolicies.language")}: {getLanguageName(filterLanguage)}
              <button
                onClick={() => setFilterLanguage("")}
                className="ml-1 hover:bg-secondary/80 rounded-full p-0.5"
              >
                <Icon path={mdiClose} size={0.50} />
              </button>
            </Badge>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Icon path={mdiLoading} size={1.33} className="animate-spin text-pink-500" />
        </div>
      ) : policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon path={mdiFileDocument} size={2.00} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              {t("admin.termsAndPolicies.noPoliciesFound")}
            </p>
            <Button onClick={handleCreateNew}>
              {t("admin.termsAndPolicies.createFirstPolicy")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <Card key={policy.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="mb-2">{policy.title}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="bg-pink-500">
                        {getPolicyTypeLabel(policy.type)}
                      </Badge>
                      <Badge variant="outline">
                        {getLanguageName(policy.language)}
                      </Badge>
                      <Badge variant="outline">v{policy.version}</Badge>
                      {policy.isActive && (
                        <Badge variant="default" className="bg-green-500">
                          {t("admin.termsAndPolicies.active")}
                        </Badge>
                      )}
                      {policy.isRequired && (
                        <Badge variant="default" className="bg-orange-500">
                          {t("admin.termsAndPolicies.required")}
                        </Badge>
                      )}
                      {policy._count && (
                        <Badge variant="outline" className="border-border text-foreground" title={`${policy._count.userConsents} user(s) have accepted this policy version`}>
                          {policy._count.userConsents} {policy._count.userConsents === 1 ? t("admin.termsAndPolicies.consent") : t("admin.termsAndPolicies.consents")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(policy)}
                    >
                      <Icon path={mdiPencil} size={0.67} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Icon path={mdiDelete} size={0.67} className="text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("admin.termsAndPolicies.deletePolicy")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("admin.termsAndPolicies.deletePolicyDescription", {
                              title: policy.title,
                              version: policy.version,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("common.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(policy)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            {t("admin.termsAndPolicies.delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground line-clamp-2 mb-2">
                  {policy.content}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.termsAndPolicies.effective")}: {new Date(policy.effectiveDate).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
        <DialogContent className="bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-pink-500">
              {t("admin.termsAndPolicies.filterPolicies")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block text-foreground">
                {t("admin.termsAndPolicies.policyType")}
              </label>
              <Select
                value={filterType || "all"}
                onValueChange={(value) =>
                  setFilterType(value === "all" ? "" : (value as PolicyType))
                }
              >
                <SelectTrigger className="bg-card border-border text-foreground">
                  <SelectValue placeholder={t("admin.termsAndPolicies.allTypes")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">{t("admin.termsAndPolicies.allTypes")}</SelectItem>
                  {POLICY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {getPolicyTypeLabel(type.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-foreground">
                {t("admin.termsAndPolicies.language")}
              </label>
              <Select
                value={filterLanguage || "all"}
                onValueChange={(value) =>
                  setFilterLanguage(value === "all" ? "" : value)
                }
              >
                <SelectTrigger className="bg-card border-border text-foreground">
                  <SelectValue placeholder={t("admin.termsAndPolicies.allLanguages")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">{t("admin.termsAndPolicies.allLanguages")}</SelectItem>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setFilterType("");
                  setFilterLanguage("");
                }}
                className="border-border text-foreground hover:bg-accent"
              >
                {t("admin.termsAndPolicies.clear")}
              </Button>
              <Button
                onClick={() => setShowFilterDialog(false)}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {t("admin.termsAndPolicies.apply")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

