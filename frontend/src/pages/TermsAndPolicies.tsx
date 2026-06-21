import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiLoading, mdiFileDocument, mdiAlertCircle, mdiArrowLeft } from "@mdi/js";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? "" : "http://localhost:3001");

interface TermsAndPolicy {
  id: string;
  type: string;
  title: string;
  content: string;
  language: string;
  version: string;
  effectiveDate: string;
  isActive: boolean;
  isRequired: boolean;
}

export default function TermsAndPolicies() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<TermsAndPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicy();
  }, [searchParams]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      setError(null);

      const type = searchParams.get("type") || "TERMS_OF_SERVICE";
      const language = searchParams.get("language") || "en";

      const response = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/active?type=${type}&language=${language}`
      );

      if (!response.ok) {
        let errorMessage = "Failed to fetch policy";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.success && data.data) {
        setPolicy(data.data);
      } else {
        setError(data.error || "No active policy available");
      }
    } catch (e: any) {
      console.error("Error fetching policy:", e);
      setError(e.message || "Failed to load policy");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-background">
        <div className="container mx-auto p-6 max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Icon path={mdiLoading} size={1.33} className="animate-spin text-pink-500" />
            <span className="ml-3 text-muted-foreground">
              {t("admin.termsAndPolicies.consentModal.loadingPolicies")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!loading && !policy)) {
    const isNotFound =
      error?.includes("not found") ||
      error?.includes("404") ||
      error?.includes("Active policy not found");

    return (
      <div className="w-full min-h-screen bg-background">
        <div className="container mx-auto p-6 max-w-4xl">
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              {isNotFound ? (
                <Icon path={mdiFileDocument} size={2.00} className="text-muted-foreground mb-4" />
              ) : (
                <Icon path={mdiAlertCircle} size={2.00} className="text-destructive mb-4" />
              )}
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {isNotFound
                  ? t("admin.termsAndPolicies.viewer.policyNotAvailable")
                  : t("admin.termsAndPolicies.viewer.errorLoadingPolicy")}
              </h2>
              <p className="text-muted-foreground text-center mb-6">
                {isNotFound
                  ? t("admin.termsAndPolicies.viewer.policyNotAvailableDescription")
                  : error || t("admin.termsAndPolicies.viewer.errorLoadingPolicyDescription")}
              </p>
              <Button
                onClick={fetchPolicy}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {t("admin.termsAndPolicies.viewer.retry")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!policy) {
    return null;
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-pink-500 hover:text-pink-600 hover:bg-pink-500/10 mb-4"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="mr-2 text-pink-500" />
            {t("common.back")}
          </Button>
        </div>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-3xl mb-4 text-foreground">
              {policy.title}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" className="bg-pink-500 text-white">
                {t(`admin.termsAndPolicies.policyTypeLabels.${policy.type}`, policy.type)}
              </Badge>
              <Badge variant="outline" className="border-border text-foreground">
                {t("admin.termsAndPolicies.consentModal.version")} {policy.version}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t("admin.termsAndPolicies.consentModal.effective")}: {new Date(policy.effectiveDate).toLocaleDateString()}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                {policy.content}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

