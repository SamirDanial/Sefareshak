import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Filter,
  Edit,
  Trash2,
  X,
  RefreshCw,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import PageHeader from "../components/PageHeader";
import ApiService from "../services/apiService";
import { toast } from "../components/Toast";
import Select from "../components/Select";

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

const getPolicyTypes = (t: (key: string) => string): { value: PolicyType; label: string }[] => [
  { value: "TERMS_OF_SERVICE", label: t("admin.termsAndPolicies.policyTypes.termsOfService") },
  { value: "PRIVACY_POLICY", label: t("admin.termsAndPolicies.policyTypes.privacyPolicy") },
  { value: "COOKIE_POLICY", label: t("admin.termsAndPolicies.policyTypes.cookiePolicy") },
  { value: "REFUND_POLICY", label: t("admin.termsAndPolicies.policyTypes.refundPolicy") },
  { value: "DELIVERY_POLICY", label: t("admin.termsAndPolicies.policyTypes.deliveryPolicy") },
  { value: "DATA_PROTECTION_POLICY", label: t("admin.termsAndPolicies.policyTypes.dataProtectionPolicy") },
  { value: "USER_AGREEMENT", label: t("admin.termsAndPolicies.policyTypes.userAgreement") },
  { value: "OTHER", label: t("admin.termsAndPolicies.policyTypes.other") },
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

const TermsAndPolicies: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const apiService = ApiService.getInstance();
  const [policies, setPolicies] = useState<TermsAndPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<PolicyType | "">("");
  const [filterLanguage, setFilterLanguage] = useState<string>("");
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    policy: TermsAndPolicy | null;
    show: boolean;
  }>({ policy: null, show: false });

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

      const url = `/api/terms-and-policies${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const response = await apiService.get(url, token);

      if (response.success && response.data) {
        setPolicies(response.data);
      }
    } catch (e: any) {
      console.error("Error fetching policies:", e);
      toast.error(t("admin.termsAndPolicies.loadError"));
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

  const handleDeleteClick = (policy: TermsAndPolicy) => {
    setDeleteConfirm({ policy, show: true });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.policy) return;

    try {
      const token = await getToken();
      if (!token) return;

      await apiService.delete(
        `/api/terms-and-policies/${deleteConfirm.policy!.id}`,
        token
      );

      toast.success(t("admin.termsAndPolicies.deleteSuccess"));
      setDeleteConfirm({ policy: null, show: false });
      fetchPolicies();
    } catch (e: any) {
      console.error("Error deleting policy:", e);
      toast.error(e.message || t("admin.termsAndPolicies.deleteError"));
    }
  };

  const getPolicyTypeLabel = (type: PolicyType) => {
    const policyTypes = getPolicyTypes(t);
    return policyTypes.find((pt) => pt.value === type)?.label || type;
  };

  const getLanguageName = (code: string) => {
    return LANGUAGES.find((l) => l.code === code)?.name || code.toUpperCase();
  };

  return (
    <div style={{ padding: "24px", backgroundColor: "#f9fafb", minHeight: "100vh" }}>
      <PageHeader
        title={t("admin.termsAndPolicies.title")}
        description={t("admin.termsAndPolicies.description")}
        actions={
          <>
            <button
              onClick={() => setShowFilterDialog(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#ec4899",
                backgroundColor: "#ffffff",
                border: "1px solid #fce7f3",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              <Filter style={{ height: "18px", width: "18px" }} />
              {t("admin.termsAndPolicies.filter")}
            </button>

            <button
              onClick={handleCreateNew}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                border: "none",
                borderRadius: "8px",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#db2777";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ec4899";
              }}
            >
              <Plus style={{ height: "18px", width: "18px" }} />
              {t("admin.termsAndPolicies.newPolicy")}
            </button>
          </>
        }
      />

      {/* Active Filters */}
      {(filterType || filterLanguage) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          {filterType && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                fontSize: "14px",
                backgroundColor: "#f3f4f6",
                borderRadius: "6px",
                color: "#111827",
              }}
            >
              <span>{t("admin.termsAndPolicies.activeFilters.type")}: {getPolicyTypeLabel(filterType as PolicyType)}</span>
              <button
                onClick={() => setFilterType("")}
                style={{
                  padding: 0,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  color: "#6b7280",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#111827";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#6b7280";
                }}
              >
                <X style={{ height: "14px", width: "14px" }} />
              </button>
            </div>
          )}
          {filterLanguage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                fontSize: "14px",
                backgroundColor: "#f3f4f6",
                borderRadius: "6px",
                color: "#111827",
              }}
            >
              <span>{t("admin.termsAndPolicies.activeFilters.language")}: {getLanguageName(filterLanguage)}</span>
              <button
                onClick={() => setFilterLanguage("")}
                style={{
                  padding: 0,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  color: "#6b7280",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#111827";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#6b7280";
                }}
              >
                <X style={{ height: "14px", width: "14px" }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
          }}
        >
          <RefreshCw
            style={{
              height: "32px",
              width: "32px",
              color: "#ec4899",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      ) : policies.length === 0 ? (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "48px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <FileText
            style={{ height: "48px", width: "48px", color: "#9ca3af", marginBottom: "16px" }}
          />
          <p style={{ fontSize: "16px", color: "#6b7280", margin: "0 0 16px 0" }}>
            {t("admin.termsAndPolicies.noPoliciesFound")}
          </p>
          <button
            onClick={handleCreateNew}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: "500",
              color: "#ffffff",
              backgroundColor: "#ec4899",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#db2777";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#ec4899";
            }}
          >
            {t("admin.termsAndPolicies.createFirstPolicy")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {policies.map((policy) => (
            <div
              key={policy.id}
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
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: "600",
                      color: "#111827",
                      margin: "0 0 12px 0",
                    }}
                  >
                    {policy.title}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        backgroundColor: "#ec4899",
                        color: "#ffffff",
                        borderRadius: "6px",
                      }}
                    >
                      {getPolicyTypeLabel(policy.type)}
                    </span>
                    <span
                      style={{
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        backgroundColor: "#f3f4f6",
                        color: "#111827",
                        borderRadius: "6px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      {getLanguageName(policy.language)}
                    </span>
                    <span
                      style={{
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        backgroundColor: "#f3f4f6",
                        color: "#111827",
                        borderRadius: "6px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      v{policy.version}
                    </span>
                    {policy.isActive && (
                      <span
                        style={{
                          padding: "4px 12px",
                          fontSize: "12px",
                          fontWeight: "500",
                          backgroundColor: "#16a34a",
                          color: "#ffffff",
                          borderRadius: "6px",
                        }}
                      >
                        {t("admin.termsAndPolicies.status.active")}
                      </span>
                    )}
                    {policy.isRequired && (
                      <span
                        style={{
                          padding: "4px 12px",
                          fontSize: "12px",
                          fontWeight: "500",
                          backgroundColor: "#ea580c",
                          color: "#ffffff",
                          borderRadius: "6px",
                        }}
                      >
                        {t("admin.termsAndPolicies.status.required")}
                      </span>
                    )}
                    {policy._count && (
                      <span
                        style={{
                          padding: "4px 12px",
                          fontSize: "12px",
                          fontWeight: "500",
                          backgroundColor: "#f3f4f6",
                          color: "#111827",
                          borderRadius: "6px",
                          border: "1px solid #e5e7eb",
                        }}
                        title={t("admin.termsAndPolicies.status.consentTooltip", { count: policy._count.userConsents })}
                      >
                        {policy._count.userConsents}{" "}
                        {policy._count.userConsents === 1 ? t("admin.termsAndPolicies.status.consent") : t("admin.termsAndPolicies.status.consents")}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleEdit(policy)}
                    style={{
                      padding: "8px",
                      border: "none",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      color: "#6b7280",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                      e.currentTarget.style.color = "#111827";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "#6b7280";
                    }}
                  >
                    <Edit style={{ height: "16px", width: "16px" }} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(policy)}
                    style={{
                      padding: "8px",
                      border: "none",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      color: "#dc2626",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#fef2f2";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Trash2 style={{ height: "16px", width: "16px" }} />
                  </button>
                </div>
              </div>
              <p
                style={{
                  fontSize: "14px",
                  color: "#111827",
                  margin: "0 0 12px 0",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {policy.content}
              </p>
              <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
                {t("admin.termsAndPolicies.labels.effective")}: {new Date(policy.effectiveDate).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Dialog */}
      {showFilterDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowFilterDialog(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "24px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#ec4899",
                  margin: 0,
                }}
              >
                {t("admin.termsAndPolicies.filterDialog.title")}
              </h3>
              <button
                onClick={() => setShowFilterDialog(false)}
                style={{
                  padding: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "#6b7280",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#111827";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#6b7280";
                }}
              >
                <X style={{ height: "20px", width: "20px" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.termsAndPolicies.filterDialog.policyType")}
                </label>
                <Select
                  value={filterType || "all"}
                  onValueChange={(value) =>
                    setFilterType(value === "all" ? "" : (value as PolicyType))
                  }
                >
                  <Select.Trigger>
                    <Select.Value placeholder={t("admin.termsAndPolicies.filterDialog.allTypes")} />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="all">{t("admin.termsAndPolicies.filterDialog.allTypes")}</Select.Item>
                    {getPolicyTypes(t).map((type) => (
                      <Select.Item key={type.value} value={type.value}>
                        {type.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.termsAndPolicies.filterDialog.language")}
                </label>
                <Select
                  value={filterLanguage || "all"}
                  onValueChange={(value) =>
                    setFilterLanguage(value === "all" ? "" : value)
                  }
                >
                  <Select.Trigger>
                    <Select.Value placeholder={t("admin.termsAndPolicies.filterDialog.allLanguages")} />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="all">{t("admin.termsAndPolicies.filterDialog.allLanguages")}</Select.Item>
                    {LANGUAGES.map((lang) => (
                      <Select.Item key={lang.code} value={lang.code}>
                        {lang.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
                <button
                  onClick={() => {
                    setFilterType("");
                    setFilterLanguage("");
                  }}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#6b7280",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f9fafb";
                    e.currentTarget.style.borderColor = "#d1d5db";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ffffff";
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                >
                  {t("admin.termsAndPolicies.filterDialog.clear")}
                </button>
                <button
                  onClick={() => setShowFilterDialog(false)}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#ffffff",
                    backgroundColor: "#ec4899",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#db2777";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ec4899";
                  }}
                >
                  {t("admin.termsAndPolicies.filterDialog.apply")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm.show && deleteConfirm.policy && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setDeleteConfirm({ policy: null, show: false })}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <AlertCircle style={{ height: "24px", width: "24px", color: "#dc2626" }} />
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#111827",
                  margin: 0,
                }}
              >
                {t("admin.termsAndPolicies.deleteDialog.title")}
              </h3>
            </div>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 24px 0" }}>
              {t("admin.termsAndPolicies.deleteDialog.message", { 
                title: deleteConfirm.policy.title, 
                version: deleteConfirm.policy.version 
              })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                onClick={() => setDeleteConfirm({ policy: null, show: false })}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#6b7280",
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                {t("admin.termsAndPolicies.deleteDialog.cancel")}
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#ffffff",
                  backgroundColor: "#dc2626",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#b91c1c";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#dc2626";
                }}
              >
                {t("admin.termsAndPolicies.deleteDialog.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TermsAndPolicies;

