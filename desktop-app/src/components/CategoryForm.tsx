import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { categoryService, type Category, type CategoryFormData } from "../services/categoryService";
import ImageUpload from "./ImageUpload";
import branchService, { type Branch } from "../services/branchService";

interface CategoryFormProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category | null;
  onSuccess: () => void;
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  isOpen,
  onClose,
  category,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const canToggleCategory = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.TOGGLE_ACTIVE }]);
  const canCategoryOrdering = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    description: "",
    image: "",
    taxPercentage: null,
    excludedBranches: [],
    isActive: true,
    isFeatured: false,
  });

  // Reset form when dialog opens/closes or category changes
  useEffect(() => {
    if (isOpen) {
      if (category) {
        // Edit mode - populate form with category data
        setFormData({
          name: category.name,
          description: category.description || "",
          image: category.image || "",
          taxPercentage: category.taxPercentage,
          excludedBranches: category.excludedBranches || [],
          isActive: category.isActive,
          isFeatured: category.isFeatured !== undefined ? category.isFeatured : false,
        });
      } else {
        // Create mode - reset to defaults
        setFormData({
          name: "",
          description: "",
          image: "",
          taxPercentage: null,
          excludedBranches: [],
          isActive: true,
          isFeatured: false,
        });
      }
    }
  }, [isOpen, category]);

  useEffect(() => {
    const loadBranches = async () => {
      if (!isOpen) return;
      try {
        const token = await getToken();
        if (!token) return;
        const data = await branchService.getBranches(token);
        setBranches(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load branches for category form:", e);
        setBranches([]);
      }
    };

    loadBranches();
  }, [getToken, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert(t("admin.categoryManagement.categoryForm.categoryNameRequiredError"));
      return;
    }

    try {
      setIsSubmitting(true);
      const token = await getToken();

      if (category) {
        // Update existing category
        await categoryService.updateCategory(
          category.id,
          formData,
          token || undefined
        );
      } else {
        // Create new category
        await categoryService.createCategory(formData, token || undefined);
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving category:", error);
      alert(error?.message || t("admin.categoryManagement.categoryForm.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const toggleExcludedBranch = (branchId: string) => {
    const current = formData.excludedBranches || [];
    const next = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    setFormData({ ...formData, excludedBranches: next });
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
              {category ? t("admin.categoryManagement.categoryForm.editTitle") : t("admin.categoryManagement.categoryForm.createTitle")}
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "#6b7280",
                margin: 0,
              }}
            >
              {category
                ? t("admin.categoryManagement.categoryForm.editDescription")
                : t("admin.categoryManagement.categoryForm.createDescription")}
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
            {/* Category Name */}
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
                {t("admin.categoryManagement.categoryForm.categoryNameRequired")}
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.categoryManagement.categoryForm.categoryNamePlaceholder")}
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

            {/* Excluded Branches */}
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
                {t("admin.categoryManagement.categoryForm.excludedBranches")}
              </label>
              <p style={{ fontSize: "12px", color: "#6b7280", marginTop: 0, marginBottom: "10px" }}>
                {t("admin.categoryManagement.categoryForm.excludedBranchesDescription")}
              </p>

              <div
                style={{
                  maxHeight: "220px",
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "8px",
                  backgroundColor: "#ffffff",
                }}
              >
                {branches.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#6b7280", padding: "10px" }}>
                    {t("admin.categoryManagement.categoryForm.noBranchesAvailable")}
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
                          padding: "10px 12px",
                          borderRadius: "10px",
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                          opacity: isSubmitting ? 0.7 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isSubmitting}
                            onChange={() => toggleExcludedBranch(branch.id)}
                          />
                          <span style={{ fontSize: "13px", color: "#111827", fontWeight: 600 }}>
                            {branch.name}
                          </span>
                        </div>
                        {checked ? (
                          <span style={{ fontSize: "12px", color: "#ec4899", fontWeight: 700 }}>
                            {t("admin.categoryManagement.categoryForm.excluded")}
                          </span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
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
                {t("admin.categoryManagement.categoryForm.description")}
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.categoryManagement.categoryForm.descriptionPlaceholder")}
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

            {/* Tax Percentage */}
            <div>
              <label
                htmlFor="taxPercentage"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "8px",
                }}
              >
                {t("admin.categoryManagement.categoryForm.taxPercentage")}
              </label>
              <input
                id="taxPercentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.taxPercentage !== null && formData.taxPercentage !== undefined ? formData.taxPercentage : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    setFormData({
                      ...formData,
                      taxPercentage: null,
                    });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      setFormData({
                        ...formData,
                        taxPercentage: numValue,
                      });
                    }
                  }
                }}
                placeholder={t("admin.categoryManagement.categoryForm.taxPercentagePlaceholder")}
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
              <p
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  margin: "6px 0 0 0",
                }}
              >
                {t("admin.categoryManagement.categoryForm.taxPercentageHint")}
              </p>
            </div>

            {/* Category Image */}
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
                {t("admin.categoryManagement.categoryForm.categoryImage")}
              </label>
              <ImageUpload
                value={formData.image}
                onChange={(value) => setFormData({ ...formData, image: value })}
                disabled={isSubmitting}
                translationNamespace="admin.categoryManagement.categoryForm"
              />
            </div>

            {/* Is Active */}
            {canToggleCategory && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  disabled={isSubmitting}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    accentColor: "#ec4899",
                  }}
                />
                <label
                  htmlFor="isActive"
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#111827",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    margin: 0,
                  }}
                >
                  {t("admin.categoryManagement.categoryForm.makeActive")}
                </label>
              </div>
            )}

            {/* Is Featured */}
            {canCategoryOrdering && (
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
                    htmlFor="isFeatured"
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "4px",
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {t("admin.categoryManagement.categoryForm.featuredOnHome")}
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      margin: 0,
                    }}
                  >
                    {t("admin.categoryManagement.categoryForm.featuredOnHomeHint")}
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
                    id="isFeatured"
                    checked={formData.isFeatured || false}
                    onChange={(e) =>
                      setFormData({ ...formData, isFeatured: e.target.checked })
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
                      backgroundColor: formData.isFeatured ? "#ec4899" : "#d1d5db",
                      borderRadius: "24px",
                      transition: "background-color 0.2s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: formData.isFeatured ? "22px" : "2px",
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
            )}
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
              {t("admin.categoryManagement.categoryForm.cancel")}
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
                border: "none",
                borderRadius: "8px",
                backgroundColor: isSubmitting ? "#d1d5db" : "#ec4899",
                color: "#ffffff",
                cursor: isSubmitting ? "not-allowed" : "pointer",
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
                ? category
                  ? t("admin.categoryManagement.categoryForm.updating")
                  : t("admin.categoryManagement.categoryForm.creating")
                : category
                ? t("admin.categoryManagement.categoryForm.updateCategory")
                : t("admin.categoryManagement.categoryForm.createCategory")}
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

export default CategoryForm;

