import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Image as ImageIcon, Package, RefreshCw, Search, Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { categoryService, type Category } from "../services/categoryService";
import PageHeader from "../components/PageHeader";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const MenuCategories: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();
  const navigate = useNavigate();

  const canReorderFeaturedMeals = canAny([
    { resource: RESOURCES.MENU, action: ACTIONS.REORDER_FEATURED },
    { resource: RESOURCES.MEALS, action: ACTIONS.REORDER_FEATURED },
  ]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);
  const [orgVersion, setOrgVersion] = useState(0);

  useEffect(() => {
    loadCategories();
  }, [orgVersion]);

  // React to organization switch changes
  useEffect(() => {
    const getSelectedOrganizationId = (): string => {
      try {
        const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
        return (raw || "").trim();
      } catch {
        return "";
      }
    };

    let currentOrgId = getSelectedOrganizationId();

    const applyOrgChange = (nextOrgId: string) => {
      const normalized = String(nextOrgId || "").trim();
      if (normalized === currentOrgId) return;
      currentOrgId = normalized;

      setSearchTerm("");
      setShowEmptyCategories(false);
      setCategories([]);
      setOrgVersion((v) => v + 1);
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as any;
      applyOrgChange(detail?.organizationId);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ORG_STORAGE_KEY) return;
      applyOrgChange(event.newValue || "");
    };

    window.addEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ORG_CHANGED_EVENT, onCustomEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isExternalImage = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const getOptimizedImageUrl = (imagePath: string | null): string => {
    if (!imagePath) return "";

    if (isExternalImage(imagePath)) return imagePath;

    if (imagePath.startsWith("/uploads/images/")) {
      const filename = imagePath.replace("/uploads/images/", "");
      return `${API_BASE_URL}/uploads/images/${filename}`;
    }

    return `${API_BASE_URL}/uploads/images/${imagePath}`;
  };

  const loadCategories = async () => {
    try {
      setRefreshing(true);
      const token = await getToken();
      const data = await categoryService.getCategories(
        1,
        100,
        "",
        "listOrder",
        "asc",
        token || undefined
      );

      // Show all categories (both active and inactive) in admin menu
      setCategories(data.categories);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const visibleCategories = categories.filter((category) => {
      const mealsCount = category._count?.meals ?? 0;
      const hasMeals = mealsCount > 0;
      const isEmpty = mealsCount === 0;

      if (showEmptyCategories) return isEmpty;
      return hasMeals;
    });

    if (!normalizedSearch) return visibleCategories;

    return visibleCategories.filter((category) =>
      category.name.toLowerCase().includes(normalizedSearch)
    );
  }, [categories, searchTerm, showEmptyCategories]);

  if (loading) {
    return (
      <div style={{ padding: "24px", height: "100%", overflow: "auto" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "400px",
            gap: "16px",
          }}
        >
          <RefreshCw
            style={{
              height: "48px",
              width: "48px",
              color: "#ec4899",
              animation: "spin 1s linear infinite",
            }}
          />
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#111827" }}>
            {t("admin.menuCategories.loadingTitle", { defaultValue: "Loading categories" })}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.menuCategories.loadingDescription", {
              defaultValue: "Please wait while we load your menu categories",
            })}
          </p>
        </div>
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", height: "100%", overflow: "auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <PageHeader
          title={t("admin.menuCategories.title", { defaultValue: "Menu Categories" })}
          description={t("admin.menuCategories.description", {
            defaultValue: "Select a category to manage its menu items",
          })}
          actions={
            <>
              {canReorderFeaturedMeals && (
                <button
                  type="button"
                  onClick={() => navigate("/admin/menu/featured-ordering")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: 700,
                    border: "1px solid #fbcfe8",
                    borderRadius: "10px",
                    backgroundColor: "#ffffff",
                    color: "#db2777",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#fff1f2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ffffff";
                  }}
                >
                  <Star style={{ width: "16px", height: "16px" }} />
                  {t("admin.featuredMealsOrdering.cta", { defaultValue: "Featured Ordering" })}
                </button>
              )}

              <button
                onClick={loadCategories}
                disabled={refreshing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: 700,
                  border: "1px solid #fbcfe8",
                  borderRadius: "10px",
                  backgroundColor: "#ffffff",
                  color: "#db2777",
                  cursor: "pointer",
                  opacity: refreshing ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#fff1f2";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
              >
                <RefreshCw
                  style={{
                    width: "16px",
                    height: "16px",
                    animation: refreshing ? "spin 1s linear infinite" : undefined,
                  }}
                />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </button>
            </>
          }
        />
      </div>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                height: "18px",
                width: "18px",
                color: "#9ca3af",
              }}
            />
            <input
              type="text"
              placeholder={t("admin.menuCategories.searchPlaceholder", {
                defaultValue: "Search categories...",
              })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                fontSize: "14px",
                outline: "none",
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

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "13px",
              color: "#6b7280",
              userSelect: "none",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showEmptyCategories}
              onChange={(e) => setShowEmptyCategories(e.target.checked)}
              style={{ width: "16px", height: "16px" }}
            />
            {t("admin.menuCategories.showEmptyCategories", {
              defaultValue: "Show empty categories",
            })}
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 10px",
              backgroundColor: "#f3f4f6",
              borderRadius: "999px",
              fontSize: "12px",
              color: "#374151",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            <Package style={{ width: "14px", height: "14px", color: "#6b7280" }} />
            {t("admin.menuCategories.totalCategories", {
              count: categories.length,
              defaultValue: `Total: ${categories.length}`,
            })}
          </div>
        </div>
      </div>

      {filteredCategories.length === 0 ? (
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <Package style={{ width: "48px", height: "48px", color: "#9ca3af", margin: "0 auto 12px" }} />
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            {t("admin.menuCategories.noMenuCategoriesFound", {
              defaultValue: "No menu categories found",
            })}
          </p>
          {searchTerm.trim().length > 0 && (
            <button
              onClick={() => setSearchTerm("")}
              style={{
                marginTop: "16px",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              {t("admin.menuCategories.clearSearch", { defaultValue: "Clear search" })}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0" }}>
          {filteredCategories.map((category) => {
            const imageUrl = getOptimizedImageUrl(category.image);
            return (
              <div
                key={category.id}
                style={{
                  width: "48%",
                  marginBottom: "16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "16px",
                  overflow: "hidden",
                  cursor: "pointer",
                  backgroundColor: "#ffffff",
                  transition: "box-shadow 150ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
                onClick={() => navigate(`/admin/menu/${category.id}`)}
              >
                {imageUrl ? (
                  <div style={{ width: "100%", height: "144px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                    <img
                      src={imageUrl}
                      alt={category.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                      onError={(event) => {
                        console.error("Failed to load category image", {
                          src: event.currentTarget.src,
                          categoryName: category.name,
                        });
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "144px",
                      backgroundColor: "#f3f4f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ImageIcon style={{ width: "28px", height: "28px", color: "#9ca3af" }} />
                  </div>
                )}

                <div style={{ padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#111827",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        marginRight: "8px",
                      }}
                    >
                      {category.name}
                    </div>
                    {!category.isActive && (
                      <div
                        style={{
                          backgroundColor: "#f3f4f6",
                          color: "#6b7280",
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Inactive
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      minHeight: "32px",
                      lineHeight: "16px",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      marginBottom: "12px",
                    }}
                  >
                    {category.description ||
                      t("admin.menuCategories.noDescription", { defaultValue: "No description" })}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>
                        {t("admin.menuCategories.mealCount", {
                          count: category._count?.meals ?? 0,
                          defaultValue: `${category._count?.meals ?? 0} items`,
                        })}
                      </span>
                    </div>
                    <ChevronRight style={{ width: "18px", height: "18px", color: "#9ca3af" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default MenuCategories;
