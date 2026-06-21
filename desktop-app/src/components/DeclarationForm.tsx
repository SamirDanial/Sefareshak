import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import {
  declarationService,
  type Declaration,
  type DeclarationFormData,
} from "../services/declarationService";
import branchService, { type Branch } from "../services/branchService";

interface DeclarationFormProps {
  isOpen: boolean;
  onClose: () => void;
  declaration?: Declaration | null;
  onSuccess: () => void;
}

const DeclarationForm: React.FC<DeclarationFormProps> = ({
  isOpen,
  onClose,
  declaration,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [formData, setFormData] = useState<DeclarationFormData>({
    name: "",
    type: null,
    description: "",
    icon: null,
    shownInFilter: true,
    excludedBranches: [],
  });

  const canCreateDeclaration = canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.CREATE }]);
  const canUpdateDeclaration = canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.UPDATE }]);
  const canSubmit = declaration ? canUpdateDeclaration : canCreateDeclaration;

  const loadBranches = async () => {
    try {
      setBranchesLoading(true);
      const token = await getToken();
      if (!token) {
        setBranches([]);
        return;
      }
      const data = await branchService.getAdminBranches(token);
      setBranches(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load branches:", error);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  // Reset form when dialog opens/closes or declaration changes
  useEffect(() => {
    if (isOpen) {
      loadBranches();
      if (declaration) {
        // Edit mode - populate form with declaration data
        setFormData({
          name: declaration.name,
          type: declaration.type || null,
          description: declaration.description || "",
          icon: declaration.icon || null,
          shownInFilter:
            declaration.shownInFilter !== undefined
              ? declaration.shownInFilter
              : true,
          excludedBranches: declaration.excludedBranches || [],
        });
      } else {
        // Create mode - reset to defaults
        setFormData({
          name: "",
          type: null,
          description: "",
          icon: null,
          shownInFilter: true,
          excludedBranches: [],
        });
      }
    }
  }, [isOpen, declaration]);

  const toggleExcludedBranch = (branchId: string) => {
    const current = formData.excludedBranches || [];
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    setFormData({ ...formData, excludedBranches: next });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      alert(t("admin.dashboard.noPermission"));
      return;
    }

    if (!formData.name.trim()) {
      alert(t("admin.declarationManagement.declarationForm.nameRequiredError"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (declaration) {
        // Update existing declaration
        await declarationService.updateDeclaration(
          declaration.id,
          formData,
          token || undefined
        );
      } else {
        // Create new declaration
        await declarationService.createDeclaration(formData, token || undefined);
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving declaration:", error);
      alert(error?.message || t("admin.declarationManagement.declarationForm.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "24px",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "24px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#ec4899",
                margin: 0,
                marginBottom: "4px",
              }}
            >
              {declaration ? t("admin.declarationManagement.declarationForm.editTitle") : t("admin.declarationManagement.declarationForm.createTitle")}
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#6b7280",
                margin: 0,
              }}
            >
              {declaration
                ? t("admin.declarationManagement.declarationForm.editDescription")
                : t("admin.declarationManagement.declarationForm.createDescription")}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            style={{
              padding: "8px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: "transparent",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isSubmitting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "#f3f4f6";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <X style={{ height: "20px", width: "20px", color: "#6b7280" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Declaration Name */}
            <div>
              <label
                htmlFor="name"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.declarationManagement.declarationForm.declarationNameRequired")}
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.declarationManagement.declarationForm.declarationNamePlaceholder")}
                required
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
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

            {/* Type */}
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
                {t("admin.declarationManagement.declarationForm.typeOptional")}
              </label>
              <input
                id="type"
                type="text"
                value={formData.type || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value || null,
                  })
                }
                placeholder={t("admin.declarationManagement.declarationForm.typePlaceholder")}
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
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

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.declarationManagement.declarationForm.descriptionOptional")}
              </label>
              <textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.declarationManagement.declarationForm.descriptionPlaceholder")}
                rows={3}
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
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

            {/* Icon */}
            <div>
              <label
                htmlFor="icon"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.declarationManagement.declarationForm.iconOptional")}
              </label>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <input
                  id="icon"
                  type="text"
                  value={formData.icon || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      icon: e.target.value || null,
                    })
                  }
                  placeholder={t("admin.declarationManagement.declarationForm.iconPlaceholder")}
                  maxLength={10}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    outline: "none",
                    backgroundColor: isSubmitting ? "#f9fafb" : "#ffffff",
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
                {formData.icon && (
                  <div
                    style={{
                      fontSize: "32px",
                      padding: "8px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      minWidth: "56px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {formData.icon}
                  </div>
                )}
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  margin: "6px 0 0 0",
                }}
              >
                {t("admin.declarationManagement.declarationForm.iconHint")}
              </p>
            </div>

            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827", marginBottom: "4px" }}>
                {t("admin.declarationManagement.excludedBranches")}
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "10px" }}>
                {t("admin.declarationManagement.excludedBranchesDescription")}
              </div>

              <div
                style={{
                  maxHeight: "180px",
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  padding: "10px",
                  backgroundColor: "#ffffff",
                  opacity: branchesLoading ? 0.6 : 1,
                }}
              >
                {branches.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#6b7280", textAlign: "center", padding: "10px" }}>
                    {t("admin.declarationManagement.noBranchesAvailable")}
                  </div>
                ) : (
                  branches.map((branch) => {
                    const checked = (formData.excludedBranches || []).includes(branch.id);
                    return (
                      <label
                        key={branch.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          padding: "8px 8px",
                          borderRadius: "8px",
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLLabelElement).style.backgroundColor = "#f9fafb";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLLabelElement).style.backgroundColor = "transparent";
                        }}
                      >
                        <span style={{ fontSize: "13px", color: "#111827" }}>{branch.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isSubmitting}
                          onChange={() => toggleExcludedBranch(branch.id)}
                          style={{ width: 16, height: 16, accentColor: "#ec4899" }}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Shown in Filter */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ flex: 1, paddingRight: "16px" }}>
                <label
                  htmlFor="shownInFilter"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    marginBottom: "4px",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {t("admin.declarationManagement.declarationForm.showInFilter")}
                </label>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    margin: 0,
                  }}
                >
                  {t("admin.declarationManagement.declarationForm.showInFilterHint")}
                </p>
              </div>
              <label
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: "44px",
                  height: "24px",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  id="shownInFilter"
                  checked={formData.shownInFilter !== false}
                  onChange={(e) =>
                    setFormData({ ...formData, shownInFilter: e.target.checked })
                  }
                  disabled={isSubmitting}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: formData.shownInFilter !== false ? "#ec4899" : "#d1d5db",
                    borderRadius: "24px",
                    transition: "background-color 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "2px",
                      left: formData.shownInFilter !== false ? "22px" : "2px",
                      width: "20px",
                      height: "20px",
                      backgroundColor: "#ffffff",
                      borderRadius: "50%",
                      transition: "left 0.2s",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                    }}
                  />
                </span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              padding: "20px 24px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                color: "#111827",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              {t("admin.declarationManagement.declarationForm.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                border: "none",
                borderRadius: "8px",
                backgroundColor: isSubmitting || !canSubmit ? "#d1d5db" : "#ec4899",
                color: "#ffffff",
                cursor: isSubmitting || !canSubmit ? "not-allowed" : "pointer",
                opacity: !canSubmit ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && canSubmit) {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting && canSubmit) {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }
              }}
            >
              {isSubmitting && (
                <Loader2
                  style={{
                    height: "16px",
                    width: "16px",
                    animation: "spin 1s linear infinite",
                  }}
                />
              )}
              {isSubmitting
                ? declaration
                  ? t("admin.declarationManagement.declarationForm.updating")
                  : t("admin.declarationManagement.declarationForm.creating")
                : declaration
                ? t("admin.declarationManagement.declarationForm.updateDeclaration")
                : t("admin.declarationManagement.declarationForm.createDeclaration")}
            </button>
          </div>
        </form>

        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </div>
  );
};

export default DeclarationForm;

