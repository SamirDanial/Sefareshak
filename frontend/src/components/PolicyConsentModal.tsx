import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiCheckCircle, mdiLoading } from "@mdi/js";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? "" : "http://localhost:3001");

interface Policy {
  id: string;
  type: string;
  title: string;
  content: string;
  version: string;
  effectiveDate: string;
  isRequired: boolean;
}

interface PolicyConsentModalProps {
  visible: boolean;
  onComplete: () => void;
  onReject?: () => void;
  language?: string;
}

// Policy type labels will be fetched from translations

export function PolicyConsentModal({
  visible,
  onComplete,
  onReject,
  language = "en",
}: PolicyConsentModalProps) {
  const { getToken } = useAuth();
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [consenting, setConsenting] = useState(false);
  const [consentedPolicies, setConsentedPolicies] = useState<Set<string>>(
    new Set()
  );
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    if (visible) {
      fetchRequiredPolicies();
    }
  }, [visible, language]);

  const fetchRequiredPolicies = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        onComplete();
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/terms-and-policies/active/all?language=${language}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch policies");
      }

      const data = await response.json();
      if (data.success) {
        const requiredPolicies = (data.data || []).filter(
          (p: any) => p.isRequired === true
        );
        setPolicies(requiredPolicies);
        if (requiredPolicies.length === 0) {
          onComplete();
        }
      } else {
        console.error("❌ [PolicyConsentModal] Failed to fetch policies:", data);
      }
    } catch (error) {
      console.error("Error fetching required policies:", error);
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const handleConsent = async (policyId: string) => {
    try {
      setConsenting(true);
      const token = await getToken();
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/api/user/terms-and-policies/consent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ policyId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to record consent");
      }

      setConsentedPolicies((prev) => new Set([...prev, policyId]));
    } catch (error) {
      console.error("Error recording consent:", error);
    } finally {
      setConsenting(false);
    }
  };

  const handleContinue = async () => {
    const allConsented = policies.every((policy) =>
      consentedPolicies.has(policy.id)
    );

    if (allConsented) {
      onComplete();
    } else {
      try {
        setConsenting(true);
        const token = await getToken();
        if (!token) return;

        const unconsentedPolicies = policies.filter(
          (policy) => !consentedPolicies.has(policy.id)
        );

        for (const policy of unconsentedPolicies) {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/user/terms-and-policies/consent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ policyId: policy.id }),
              }
            );

            if (response.ok) {
              await response.json();
              setConsentedPolicies((prev) => new Set([...prev, policy.id]));
            } else {
              const errorData = await response.json().catch(() => ({}));
              console.error(
                `❌ [PolicyConsentModal] Failed to accept policy ${policy.id}:`,
                response.status,
                errorData
              );
            }
          } catch (error) {
            console.error(
              `❌ [PolicyConsentModal] Error accepting policy ${policy.id}:`,
              error
            );
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        onComplete();
      } catch (error) {
        console.error("Error accepting all policies:", error);
      } finally {
        setConsenting(false);
      }
    }
  };

  const canContinue = policies.length > 0;

  if (!visible) return null;

  return (
    <>
      <Dialog open={visible} onOpenChange={() => {}}>
        <DialogContent className="max-w-3xl max-h-[95vh] flex flex-col bg-card text-foreground border-border" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader className="pb-4 border-b border-border">
            <DialogTitle className="text-2xl font-bold text-foreground">
              {t("admin.termsAndPolicies.consentModal.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("admin.termsAndPolicies.consentModal.description")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Icon path={mdiLoading} size={1.33} className="animate-spin text-pink-500 mb-4" />
              <p className="text-muted-foreground">
                {t("admin.termsAndPolicies.consentModal.loadingPolicies")}
              </p>
            </div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <p className="text-muted-foreground mb-6">
                {t("admin.termsAndPolicies.consentModal.noRequiredPolicies")}
              </p>
              <Button onClick={onComplete} className="bg-pink-500 hover:bg-pink-600 text-white">
                {t("admin.termsAndPolicies.consentModal.continue")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto pr-4 max-h-[500px]">
                <div className="space-y-4">
                  {policies.map((policy) => {
                    const hasConsented = consentedPolicies.has(policy.id);
                    return (
                      <div
                        key={policy.id}
                        className="border rounded-lg p-4 bg-card border-border"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-2 text-foreground">
                              {policy.title}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="default" className="bg-pink-500 text-white">
                                {t(`admin.termsAndPolicies.policyTypeLabels.${policy.type}`, policy.type)}
                              </Badge>
                              <Badge variant="outline" className="border-border text-foreground">
                                {t("admin.termsAndPolicies.consentModal.version")} {policy.version}
                              </Badge>
                            </div>
                          </div>
                          {hasConsented && (
                            <Icon path={mdiCheckCircle} size={1} className="text-green-500 flex-shrink-0 ml-2" />
                          )}
                        </div>

                        <div className="mb-4 min-h-[40px]">
                          <p className="text-sm text-foreground line-clamp-3">
                            {policy.content || t("admin.termsAndPolicies.consentModal.noContentAvailable")}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => setViewingPolicy(policy)}
                            className="text-pink-500 hover:text-pink-600 p-0 h-auto"
                          >
                            {t("admin.termsAndPolicies.consentModal.viewFullPolicy")}
                          </Button>
                          {!hasConsented && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => handleConsent(policy.id)}
                              disabled={consenting}
                              className="text-pink-500 hover:text-pink-600 p-0 h-auto"
                            >
                              {consenting ? (
                                <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                              ) : (
                                t("admin.termsAndPolicies.consentModal.accept")
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                {onReject && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onReject();
                    }}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    {t("admin.termsAndPolicies.consentModal.rejectAndLogout")}
                  </Button>
                )}
                <Button
                  onClick={handleContinue}
                  disabled={!canContinue || consenting}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {consenting ? (
                    <span className="flex items-center gap-2">
                      <Icon path={mdiLoading} size={0.67} className="animate-spin" />
                      {t("admin.termsAndPolicies.consentModal.accepting")}
                    </span>
                  ) : (
                    t("admin.termsAndPolicies.consentModal.acceptAllAndContinue")
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Policy Viewer Dialog */}
      {viewingPolicy && (
        <Dialog open={!!viewingPolicy} onOpenChange={() => setViewingPolicy(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-card text-foreground border-border">
            <DialogHeader className="pb-4 border-b border-border">
              <DialogTitle className="text-2xl font-bold text-foreground">
                {viewingPolicy.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex items-center gap-3 pb-4 border-b border-border flex-wrap">
              <Badge variant="default" className="bg-pink-500 text-white">
                {t(`admin.termsAndPolicies.policyTypeLabels.${viewingPolicy.type}`, viewingPolicy.type)}
              </Badge>
              <Badge variant="outline" className="border-border text-foreground">
                {t("admin.termsAndPolicies.consentModal.version")} {viewingPolicy.version}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t("admin.termsAndPolicies.consentModal.effective")}: {new Date(viewingPolicy.effectiveDate).toLocaleDateString()}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto pr-4">
              <div className="prose prose-invert max-w-none py-4">
                <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                  {viewingPolicy.content}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <Button
                onClick={() => setViewingPolicy(null)}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {t("admin.termsAndPolicies.consentModal.close")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

