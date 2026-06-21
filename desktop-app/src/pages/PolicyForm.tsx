import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import ApiService from "../services/apiService";
import { toast } from "../components/Toast";
import Select from "../components/Select";
import Switch from "../components/Switch";

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

const PolicyForm: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const policyId = searchParams.get("id");
  const isEditing = !!policyId;
  const { getToken } = useAuth();
  const apiService = ApiService.getInstance();

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
    if (isEditing && policyId) {
      fetchPolicy();
    }
  }, [isEditing, policyId]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const response = await apiService.get(
        `/api/terms-and-policies/${policyId}`,
        token
      );

      if (response.success && response.data) {
        const policy = response.data;
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
    } catch (e: any) {
      console.error("Error fetching policy:", e);
      toast.error(t("admin.termsAndPolicies.form.loadError"));
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
        ? `/api/terms-and-policies/${policyId}`
        : `/api/terms-and-policies`;

      const response = isEditing
        ? await apiService.put(url, formData, token)
        : await apiService.post(url, formData, token);

      if (response.success) {
        toast.success(
          isEditing ? t("admin.termsAndPolicies.form.updateSuccess") : t("admin.termsAndPolicies.form.createSuccess")
        );
        navigate("/admin/terms-and-policies");
      } else {
        toast.error(response.error || t("admin.termsAndPolicies.form.saveError"));
      }
    } catch (e: any) {
      console.error("Error saving policy:", e);
      toast.error(e.message || t("admin.termsAndPolicies.form.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <RefreshCw
            style={{
              height: "32px",
              width: "32px",
              color: "#ec4899",
              animation: "spin 1s linear infinite",
            }}
          />
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
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <button
              onClick={() => navigate("/admin/terms-and-policies")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#6b7280",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                marginBottom: "12px",
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
              <ArrowLeft style={{ height: "16px", width: "16px" }} />
              {t("admin.termsAndPolicies.form.back")}
            </button>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "600",
                color: "#ec4899",
                margin: 0,
                marginBottom: "8px",
              }}
            >
              {isEditing ? t("admin.termsAndPolicies.form.editTitle") : t("admin.termsAndPolicies.form.createTitle")}
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
              {isEditing
                ? t("admin.termsAndPolicies.form.editDescription")
                : t("admin.termsAndPolicies.form.createDescription")}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
              marginBottom: "24px",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                margin: "0 0 24px 0",
              }}
            >
              {t("admin.termsAndPolicies.form.policyDetails")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label
                    htmlFor="type"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.termsAndPolicies.form.policyType")}
                  </label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, type: value as PolicyType })
                    }
                  >
                    <Select.Trigger id="type">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
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
                    htmlFor="language"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.termsAndPolicies.form.language")}
                  </label>
                  <Select
                    value={formData.language}
                    onValueChange={(value) =>
                      setFormData({ ...formData, language: value })
                    }
                  >
                    <Select.Trigger id="language">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {LANGUAGES.map((lang) => (
                        <Select.Item key={lang.code} value={lang.code}>
                          {lang.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="title"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.termsAndPolicies.form.title")} <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: "#ffffff",
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label
                    htmlFor="version"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.termsAndPolicies.form.version")} <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    id="version"
                    type="text"
                    value={formData.version}
                    onChange={(e) =>
                      setFormData({ ...formData, version: e.target.value })
                    }
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      outline: "none",
                      backgroundColor: "#ffffff",
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
                    htmlFor="effectiveDate"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px",
                    }}
                  >
                    {t("admin.termsAndPolicies.form.effectiveDate")} <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    id="effectiveDate"
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) =>
                      setFormData({ ...formData, effectiveDate: e.target.value })
                    }
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "14px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      outline: "none",
                      backgroundColor: "#ffffff",
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

              <div>
                <label
                  htmlFor="content"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {t("admin.termsAndPolicies.form.content")} <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  rows={15}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: "#ffffff",
                    color: "#111827",
                    fontFamily: "monospace",
                    resize: "vertical",
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
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isActive: checked })
                    }
                  />
                  <label
                    htmlFor="isActive"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      cursor: "pointer",
                    }}
                  >
                    {t("admin.termsAndPolicies.form.active")}
                  </label>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Switch
                    id="isRequired"
                    checked={formData.isRequired}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isRequired: checked })
                    }
                  />
                  <label
                    htmlFor="isRequired"
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      cursor: "pointer",
                    }}
                  >
                    {t("admin.termsAndPolicies.form.required")}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              type="button"
              onClick={() => navigate("/admin/terms-and-policies")}
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
              {t("admin.termsAndPolicies.form.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                color: "#ffffff",
                backgroundColor: isSubmitting ? "#d1d5db" : "#ec4899",
                border: "none",
                borderRadius: "8px",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw
                    style={{
                      height: "16px",
                      width: "16px",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  {t("admin.termsAndPolicies.form.saving")}
                </>
              ) : (
                <>
                  <Save style={{ height: "16px", width: "16px" }} />
                  {isEditing ? t("admin.termsAndPolicies.form.updatePolicy") : t("admin.termsAndPolicies.form.createPolicy")}
                </>
              )}
            </button>
          </div>
        </form>
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

export default PolicyForm;

