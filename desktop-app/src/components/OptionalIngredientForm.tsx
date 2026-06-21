import React, { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import {
  optionalIngredientService,
  type OptionalIngredient,
  type OptionalIngredientFormData,
} from "../services/optionalIngredientService";

interface OptionalIngredientFormProps {
  isOpen: boolean;
  onClose: () => void;
  optionalIngredient?: OptionalIngredient | null;
  onSuccess: () => void;
}

const OptionalIngredientForm: React.FC<OptionalIngredientFormProps> = ({
  isOpen,
  onClose,
  optionalIngredient,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<OptionalIngredientFormData>({
    name: "",
    description: "",
  });

  const canCreateOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.CREATE },
  ]);
  const canUpdateOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.UPDATE },
  ]);
  const canSubmit = optionalIngredient ? canUpdateOptionalIngredient : canCreateOptionalIngredient;

  // Reset form when dialog opens/closes or optionalIngredient changes
  useEffect(() => {
    if (isOpen) {
      if (optionalIngredient) {
        // Edit mode - populate form with optionalIngredient data
        setFormData({
          name: optionalIngredient.name,
          description: optionalIngredient.description || "",
        });
      } else {
        // Create mode - reset to defaults
        setFormData({
          name: "",
          description: "",
        });
      }
    }
  }, [isOpen, optionalIngredient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      alert(t("admin.dashboard.noPermission"));
      return;
    }

    if (!formData.name.trim()) {
      alert(t("admin.optionalIngredientsManagement.optionalIngredientForm.nameRequiredError"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (optionalIngredient) {
        // Update existing optional ingredient
        await optionalIngredientService.updateOptionalIngredient(
          optionalIngredient.id,
          formData,
          token || undefined
        );
      } else {
        // Create new optional ingredient
        await optionalIngredientService.createOptionalIngredient(
          formData,
          token || undefined
        );
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving optional ingredient:", error);
      alert(error?.message || t("admin.optionalIngredientsManagement.optionalIngredientForm.saveError"));
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
              {optionalIngredient ? t("admin.optionalIngredientsManagement.optionalIngredientForm.editTitle") : t("admin.optionalIngredientsManagement.optionalIngredientForm.createTitle")}
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#6b7280",
                margin: 0,
              }}
            >
              {optionalIngredient
                ? t("admin.optionalIngredientsManagement.optionalIngredientForm.editDescription")
                : t("admin.optionalIngredientsManagement.optionalIngredientForm.createDescription")}
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
            {/* Name */}
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
                {t("admin.optionalIngredientsManagement.optionalIngredientForm.ingredientNameRequired")}
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.optionalIngredientsManagement.optionalIngredientForm.ingredientNamePlaceholder")}
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
                {t("admin.optionalIngredientsManagement.optionalIngredientForm.descriptionOptional")}
              </label>
              <textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.optionalIngredientsManagement.optionalIngredientForm.descriptionPlaceholder")}
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
              {t("admin.optionalIngredientsManagement.optionalIngredientForm.cancel")}
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
                ? optionalIngredient
                  ? t("admin.optionalIngredientsManagement.optionalIngredientForm.updating")
                  : t("admin.optionalIngredientsManagement.optionalIngredientForm.creating")
                : optionalIngredient
                ? t("admin.optionalIngredientsManagement.optionalIngredientForm.updateOptionalIngredient")
                : t("admin.optionalIngredientsManagement.optionalIngredientForm.createOptionalIngredient")}
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

export default OptionalIngredientForm;

