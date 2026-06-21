import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  ListOrdered,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { categoryService, type Category } from "../services/categoryService";
import PageHeader from "../components/PageHeader";
import CategoryForm from "../components/CategoryForm";
import OrganizationSearchSelect from "../components/OrganizationSearchSelect";
import branchService, { type Organization } from "../services/branchService";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const CategoryManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { isSuperAdmin, canAny } = usePermissions();
  const navigate = useNavigate();
  const canCreateCategory = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.CREATE }]);
  const canUpdateCategory = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.UPDATE }]);
  const canDeleteCategory = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.DELETE }]);
  const canToggleCategory = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.TOGGLE_ACTIVE }]);
  const canCategoryOrdering = canAny([{ resource: RESOURCES.CATEGORIES, action: ACTIONS.ORDERING }]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<"name" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [orgVersion, setOrgVersion] = useState(0);
  const [showDropdownMenu, setShowDropdownMenu] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [imageCacheBust, setImageCacheBust] = useState<number>(Date.now());
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [categoryToMove, setCategoryToMove] = useState<Category | null>(null);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);

  const statusOptions = [
    { id: "all", name: t("admin.categoryManagement.allStatus") },
    { id: "ACTIVE", name: t("admin.categoryManagement.active") },
    { id: "INACTIVE", name: t("admin.categoryManagement.inactive") },
  ];

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await categoryService.getCategories(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined
      );

      // Filter by status if selected
      let filteredCategories = response.categories;
      if (selectedStatus && selectedStatus !== "all") {
        filteredCategories = response.categories.filter(
          (category: Category) => {
            if (selectedStatus === "ACTIVE") return category.isActive;
            if (selectedStatus === "INACTIVE") return !category.isActive;
            return true;
          }
        );
      }
      setCategories(filteredCategories);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizations = async () => {
    const token = await getToken();
    if (!token) return;
    const orgs = await branchService.getOrganizations(token);
    setOrganizations(Array.isArray(orgs) ? orgs : []);
  };

  const toggleSelectedCategory = (id: string, checked: boolean) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllSelectedOnPage = (checked: boolean) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        categories.forEach((c) => next.add(c.id));
      } else {
        categories.forEach((c) => next.delete(c.id));
      }
      return next;
    });
  };

  const openMoveDialog = async (category?: Category) => {
    try {
      await loadOrganizations();
      setCategoryToMove(category || null);
      setTargetOrganizationId("");
      setMoveDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.categoryManagement.selectOrganization"));
    }
  };

  const openCopyDialog = async () => {
    try {
      await loadOrganizations();
      setTargetOrganizationId("");
      setCopyDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.categoryManagement.selectOrganization"));
    }
  };

  const handleMove = async () => {
    if (!targetOrganizationId) {
      alert(t("admin.categoryManagement.selectOrganization"));
      return;
    }

    const ids = categoryToMove ? [categoryToMove.id] : Array.from(selectedCategoryIds);
    if (ids.length === 0) return;

    try {
      setMoving(true);
      const token = await getToken();
      if (!token) return;

      const results = await Promise.allSettled(
        ids.map((id) => categoryService.setCategoryOrganization(id, targetOrganizationId, token || undefined))
      );
      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        alert(t("admin.categoryManagement.bulkMoveFailed"));
      } else {
        alert(t("admin.categoryManagement.bulkMoved"));
      }

      setMoveDialogOpen(false);
      setCategoryToMove(null);
      setSelectedCategoryIds(new Set());
      await fetchCategories();
    } catch (e: any) {
      console.error("Move categories failed:", e);
      alert(e?.message || t("admin.categoryManagement.bulkMoveFailed"));
    } finally {
      setMoving(false);
    }
  };

  const handleCopy = async () => {
    if (!targetOrganizationId) {
      alert(t("admin.categoryManagement.selectOrganization"));
      return;
    }
    const ids = Array.from(selectedCategoryIds);
    if (ids.length === 0) return;

    try {
      setCopying(true);
      const token = await getToken();
      if (!token) return;
      await categoryService.copyCategoriesToOrganization(ids, targetOrganizationId, token || undefined);
      alert(t("admin.categoryManagement.bulkCopied"));
      setCopyDialogOpen(false);
      setSelectedCategoryIds(new Set());
      await fetchCategories();
    } catch (e: any) {
      console.error("Copy categories failed:", e);
      alert(e?.message || t("admin.categoryManagement.bulkCopyFailed"));
    } finally {
      setCopying(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [currentPage, searchTerm, sortBy, sortOrder, selectedStatus, orgVersion]);

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
      setSelectedStatus("all");
      setSortBy("createdAt");
      setSortOrder("desc");
      setCurrentPage(1);
      setCategories([]);
      setTotalPages(1);
      setTotalCount(0);
      setSelectedCategoryIds(new Set());
      setShowDropdownMenu(null);
      setShowDeleteDialog(null);
      setIsFormOpen(false);
      setSelectedCategory(null);
      setMoveDialogOpen(false);
      setCopyDialogOpen(false);
      setCategoryToMove(null);
      setTargetOrganizationId("");

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

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDropdownMenu) {
        const target = event.target as HTMLElement;
        if (
          !target.closest(`[data-dropdown-menu]`) &&
          !target.closest(`[data-dropdown-trigger]`)
        ) {
          setShowDropdownMenu(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdownMenu]);

  const isExternalImage = (url: string): boolean => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  // Handle toggle status
  const handleToggleStatus = async (category: Category) => {
    try {
      setIsActionLoading(category.id);
      const token = await getToken();
      await categoryService.toggleCategoryStatus(
        category.id,
        token || undefined
      );
      setShowDropdownMenu(null);
      await fetchCategories();
    } catch (error) {
      console.error("Error toggling category status:", error);
      alert(t("admin.categoryManagement.toggleStatusError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Handle delete
  const handleDelete = async (category: Category) => {
    try {
      setIsActionLoading(category.id);
      const token = await getToken();
      await categoryService.deleteCategory(category.id, token || undefined);
      setShowDeleteDialog(null);
      await fetchCategories();
    } catch (error) {
      console.error("Error deleting category:", error);
      alert(t("admin.categoryManagement.deleteError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const getOptimizedImageUrl = (imagePath: string | null, cacheBust?: boolean): string => {
    if (!imagePath) return "";
    
    // If it's an external URL, return as-is
    if (isExternalImage(imagePath)) {
      return imagePath;
    }

    let url = "";
    // If it already starts with /uploads/images/, handle accordingly
    if (imagePath.startsWith("/uploads/images/")) {
      const filename = imagePath.replace("/uploads/images/", "");
      url = `${API_BASE_URL}/uploads/images/${filename}`;
    } else {
      // Simple filename - append to base URL
      url = `${API_BASE_URL}/uploads/images/${imagePath}`;
    }

    // Add cache-busting parameter if needed
    if (cacheBust) {
      url += `?t=${Date.now()}`;
    }

    return url;
  };

  if (loading && categories.length === 0) {
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
            {t("admin.categoryManagement.loadingTitle")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.categoryManagement.loadingDescription")}
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
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <PageHeader
          title={t("admin.categoryManagement.title")}
          description={t("admin.categoryManagement.description")}
          actions={
            <>
              {canCategoryOrdering && (
                <button
                  type="button"
                  onClick={() => navigate("/admin/categories/ordering")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ec4899",
                    backgroundColor: "transparent",
                    color: "#ec4899",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(236, 72, 153, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <ListOrdered style={{ height: "18px", width: "18px" }} />
                  {t("admin.categoryManagement.orderingAndDisplayPriority", {
                    defaultValue: "Ordering & Display Priority",
                  })}
                </button>
              )}

              <button
                onClick={() => {
                  setImageCacheBust(Date.now());
                  fetchCategories();
                }}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                <RefreshCw
                  style={{
                    width: 16,
                    height: 16,
                    color: "#6b7280",
                    animation: loading ? "spin 1s linear infinite" : "none",
                  }}
                />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </button>

              {canCreateCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    setIsFormOpen(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ec4899",
                    backgroundColor: "#ec4899",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#db2777";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ec4899";
                  }}
                >
                  <Plus style={{ width: "18px", height: "18px" }} />
                  {t("admin.categoryManagement.addCategory")}
                </button>
              )}
            </>
          }
        />
      </div>

      {isSuperAdmin && (
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#111827", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={categories.length > 0 && categories.every((c) => selectedCategoryIds.has(c.id))}
              onChange={(e) => setAllSelectedOnPage(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#ec4899" }}
            />
            {t("admin.categoryManagement.selectedCount", { count: selectedCategoryIds.size })}
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedCategoryIds(new Set())}
              disabled={selectedCategoryIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedCategoryIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedCategoryIds.size === 0 ? 0.5 : 1,
                fontWeight: 600,
              }}
            >
              {t("common.clear", { defaultValue: "Clear" })}
            </button>

            <button
              type="button"
              onClick={() => openMoveDialog()}
              disabled={selectedCategoryIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #ec4899",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: selectedCategoryIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedCategoryIds.size === 0 ? 0.5 : 1,
                fontWeight: 700,
              }}
            >
              {t("admin.categoryManagement.moveSelected")}
            </button>
            <button
              type="button"
              onClick={() => openCopyDialog()}
              disabled={selectedCategoryIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedCategoryIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedCategoryIds.size === 0 ? 0.5 : 1,
                fontWeight: 600,
              }}
            >
              {t("admin.categoryManagement.copySelected")}
            </button>
          </div>
        </div>
      )}

      {/* Search and Filters */}
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
            flexWrap: "wrap",
          }}
        >
          {/* Search */}
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
              placeholder={t("admin.categoryManagement.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
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

          {/* Status Filter */}
          <div style={{ minWidth: "170px" }}>
            <OrganizationSearchSelect
              organizations={statusOptions}
              value={selectedStatus}
              onValueChange={(value) => {
                setSelectedStatus(value);
                setCurrentPage(1);
              }}
              placeholder={t("admin.categoryManagement.status")}
              searchPlaceholder={t("common.search")}
              noResultsText={t("common.noResults")}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleSort("name")}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: sortBy === "name" ? "#ec4899" : "#ffffff",
                color: sortBy === "name" ? "#ffffff" : "#111827",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {t("admin.categoryManagement.nameAZ")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("createdAt")}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: sortBy === "createdAt" ? "#ec4899" : "#ffffff",
                color: sortBy === "createdAt" ? "#ffffff" : "#111827",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {sortBy === "createdAt" && sortOrder === "asc"
                ? t("admin.categoryManagement.oldestFirst")
                : t("admin.categoryManagement.newestFirst")}
            </button>
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      {categories.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 24px",
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
          }}
        >
          <Package
            style={{
              height: "64px",
              width: "64px",
              color: "#d1d5db",
              marginBottom: "16px",
            }}
          />
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#111827",
              margin: 0,
              marginBottom: "8px",
            }}
          >
            {t("admin.categoryManagement.noCategoriesFound")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {searchTerm
              ? t("admin.categoryManagement.tryAdjustingSearch")
              : t("admin.categoryManagement.getStartedByCreating")}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          {categories.map((category) => (
            <div
              key={category.id}
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "20px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "16px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    {isSuperAdmin && (
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.has(category.id)}
                        onChange={(e) => toggleSelectedCategory(category.id, e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: "#ec4899" }}
                      />
                    )}
                    <Package
                      style={{
                        height: "18px",
                        width: "18px",
                        color: "#ec4899",
                      }}
                    />
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#111827",
                        margin: 0,
                      }}
                    >
                      {category.name}
                    </h3>
                    {category.isFeatured && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          backgroundColor: "#fce7f3",
                          border: "1px solid #f9a8d4",
                        }}
                        title={t("admin.categoryManagement.featuredOnHome")}
                      >
                        <Eye style={{ height: "12px", width: "12px", color: "#ec4899" }} />
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      fontSize: "12px",
                      fontWeight: "500",
                      borderRadius: "12px",
                      backgroundColor: category.isActive
                        ? "#d1fae5"
                        : "#fee2e2",
                      color: category.isActive ? "#065f46" : "#991b1b",
                    }}
                  >
                    {category.isActive ? t("admin.categoryManagement.active") : t("admin.categoryManagement.inactive")}
                  </span>
                </div>

                {/* Actions Menu */}
                <div style={{ position: "relative" }}>
                  {(canUpdateCategory || canToggleCategory || canDeleteCategory || isSuperAdmin) && (
                    <button
                      data-dropdown-trigger
                      onClick={() => {
                        setShowDropdownMenu(
                          showDropdownMenu === category.id ? null : category.id
                        );
                      }}
                      style={{
                        padding: "6px",
                        border: "none",
                        borderRadius: "6px",
                        backgroundColor: "transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <MoreVertical
                        style={{ height: "18px", width: "18px", color: "#6b7280" }}
                      />
                    </button>
                  )}

                  {showDropdownMenu === category.id && (
                    <div
                      data-dropdown-menu
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: "4px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                        zIndex: 1000,
                        minWidth: "240px",
                        padding: "4px",
                      }}
                    >
                      {canUpdateCategory && (
                        <button
                          onClick={() => {
                            setSelectedCategory(category);
                            setIsFormOpen(true);
                            setShowDropdownMenu(null);
                          }}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            whiteSpace: "nowrap",
                            padding: "10px",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            borderRadius: "6px",
                            fontSize: "14px",
                            color: "#111827",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <Edit style={{ height: "16px", width: "16px" }} />
                          {t("admin.categoryManagement.edit")}
                        </button>
                      )}

                      {isSuperAdmin && (
                        <button
                          onClick={() => {
                            setShowDropdownMenu(null);
                            openMoveDialog(category);
                          }}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            whiteSpace: "nowrap",
                            padding: "10px",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            borderRadius: "6px",
                            fontSize: "14px",
                            color: "#111827",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <Package style={{ height: "16px", width: "16px" }} />
                          {t("admin.categoryManagement.moveToOrganization")}
                        </button>
                      )}
                      {canToggleCategory && (
                        <button
                          onClick={() => {
                            handleToggleStatus(category);
                          }}
                          disabled={isActionLoading === category.id}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 12px",
                            fontSize: "14px",
                            border: "none",
                            borderRadius: "6px",
                            backgroundColor: "transparent",
                            cursor: isActionLoading === category.id ? "not-allowed" : "pointer",
                            color: "#111827",
                            textAlign: "left",
                            opacity: isActionLoading === category.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (isActionLoading !== category.id) {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isActionLoading !== category.id) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          {category.isActive ? (
                            <>
                              <EyeOff style={{ height: "16px", width: "16px" }} />
                              {t("admin.categoryManagement.deactivate")}
                            </>
                          ) : (
                            <>
                              <Eye style={{ height: "16px", width: "16px" }} />
                              {t("admin.categoryManagement.activate")}
                            </>
                          )}
                        </button>
                      )}

                      {(canDeleteCategory || (isSuperAdmin && canToggleCategory) || (canDeleteCategory && canUpdateCategory)) && (
                        <div
                          style={{
                            height: "1px",
                            backgroundColor: "#e5e7eb",
                            margin: "4px 0",
                          }}
                        />
                      )}

                      {canDeleteCategory && (
                        <button
                          onClick={() => {
                            setShowDeleteDialog(category.id);
                            setShowDropdownMenu(null);
                          }}
                          disabled={isActionLoading === category.id}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 12px",
                            fontSize: "14px",
                            border: "none",
                            borderRadius: "6px",
                            backgroundColor: "transparent",
                            cursor: isActionLoading === category.id ? "not-allowed" : "pointer",
                            color: "#dc2626",
                            textAlign: "left",
                            opacity: isActionLoading === category.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (isActionLoading !== category.id) {
                              e.currentTarget.style.backgroundColor = "#fef2f2";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isActionLoading !== category.id) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          <Trash2 style={{ height: "16px", width: "16px" }} />
                          {t("admin.categoryManagement.delete")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Image */}
              {category.image && (
                <div
                  style={{
                    width: "100%",
                    height: "120px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "#f3f4f6",
                    marginBottom: "12px",
                  }}
                >
                  <img
                    key={`${category.id}-${imageCacheBust}`}
                    src={getOptimizedImageUrl(category.image, true)}
                    alt={category.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      console.error("Image failed to load:", {
                        src: e.currentTarget.src,
                        categoryName: category.name,
                        imagePath: category.image,
                      });
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* Description */}
              {category.description && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    margin: 0,
                    marginBottom: "12px",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {category.description}
                </p>
              )}

              {/* Footer Info */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  color: "#9ca3af",
                  paddingTop: "12px",
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <span>
                  {category._count.meals} {category._count.meals !== 1 ? t("admin.categoryManagement.meals") : t("admin.categoryManagement.meal")}
                </span>
                <span>
                  {new Date(category.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 0",
            gap: "12px",
          }}
        >
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {t("admin.categoryManagement.showingCategories", { count: categories.length, total: totalCount })}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                color: currentPage === 1 ? "#9ca3af" : "#111827",
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              <ChevronLeft style={{ height: "18px", width: "18px" }} />
            </button>
            <span
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "#111827",
                padding: "8px 16px",
                backgroundColor: "#f3f4f6",
                borderRadius: "8px",
              }}
            >
              {t("admin.categoryManagement.pageOf", { current: currentPage, total: totalPages })}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                color: currentPage === totalPages ? "#9ca3af" : "#111827",
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }
              }}
            >
              <ChevronRight style={{ height: "18px", width: "18px" }} />
            </button>
          </div>
        </div>
      )}

      {/* Move Dialog (super admin) */}
      {isSuperAdmin && moveDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
          }}
          onClick={() => {
            if (!moving) setMoveDialogOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 800, color: "#111827" }}>
              {t("admin.categoryManagement.moveToOrganization")}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.categoryManagement.targetOrganization")}
            </p>
            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.categoryManagement.selectOrganization")}
              searchPlaceholder={t("common.search")}
              noResultsText={t("common.noResults")}
              disabled={moving}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => setMoveDialogOpen(false)}
                disabled={moving}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  cursor: moving ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleMove}
                disabled={moving}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ec4899",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: moving ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  opacity: moving ? 0.7 : 1,
                }}
              >
                {moving ? t("admin.categoryManagement.moving") : t("admin.categoryManagement.move")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Dialog (super admin) */}
      {isSuperAdmin && copyDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
          }}
          onClick={() => {
            if (!copying) setCopyDialogOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 800, color: "#111827" }}>
              {t("admin.categoryManagement.copySelected")}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.categoryManagement.targetOrganization")}
            </p>
            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.categoryManagement.selectOrganization")}
              searchPlaceholder={t("common.search")}
              noResultsText={t("common.noResults")}
              disabled={copying}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => setCopyDialogOpen(false)}
                disabled={copying}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  cursor: copying ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={copying}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ec4899",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: copying ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  opacity: copying ? 0.7 : 1,
                }}
              >
                {copying ? t("admin.categoryManagement.copying") : t("admin.categoryManagement.copy")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && categories.find((c) => c.id === showDeleteDialog) && (
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
          onClick={() => setShowDeleteDialog(null)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.categoryManagement.deleteCategory")}
            </h3>
            {(() => {
              const categoryToDelete = categories.find((c) => c.id === showDeleteDialog);
              return (
                <>
                  <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
                    {t("admin.categoryManagement.deleteCategoryDescription", { name: categoryToDelete?.name })}
                    {categoryToDelete && categoryToDelete._count.meals > 0 && (
                      <span
                        style={{
                          display: "block",
                          marginTop: "8px",
                          color: "#dc2626",
                          fontWeight: "500",
                        }}
                      >
                        {t("admin.categoryManagement.deleteCategoryWarning", { 
                          count: categoryToDelete._count.meals, 
                          meal: categoryToDelete._count.meals !== 1 ? t("admin.categoryManagement.meals") : t("admin.categoryManagement.meal")
                        })}
                      </span>
                    )}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "12px",
                    }}
                  >
                    <button
                      onClick={() => setShowDeleteDialog(null)}
                      disabled={isActionLoading === showDeleteDialog}
                      style={{
                        padding: "8px 16px",
                        fontSize: "14px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        backgroundColor: "#ffffff",
                        cursor: isActionLoading === showDeleteDialog ? "not-allowed" : "pointer",
                        color: "#111827",
                        opacity: isActionLoading === showDeleteDialog ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (isActionLoading !== showDeleteDialog) {
                          e.currentTarget.style.backgroundColor = "#f9fafb";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isActionLoading !== showDeleteDialog) {
                          e.currentTarget.style.backgroundColor = "#ffffff";
                        }
                      }}
                    >
                      {t("admin.categoryManagement.cancel")}
                    </button>
                    <button
                      onClick={() => {
                        if (categoryToDelete) {
                          handleDelete(categoryToDelete);
                        }
                      }}
                      disabled={
                        isActionLoading === showDeleteDialog || isActionLoading !== null
                      }
                      style={{
                        padding: "8px 16px",
                        fontSize: "14px",
                        border: "none",
                        borderRadius: "6px",
                        backgroundColor: "#dc2626",
                        cursor:
                          isActionLoading === showDeleteDialog || isActionLoading !== null
                            ? "not-allowed"
                            : "pointer",
                        color: "#ffffff",
                        opacity:
                          isActionLoading === showDeleteDialog || isActionLoading !== null ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (
                          isActionLoading !== showDeleteDialog &&
                          isActionLoading === null
                        ) {
                          e.currentTarget.style.backgroundColor = "#b91c1c";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (
                          isActionLoading !== showDeleteDialog &&
                          isActionLoading === null
                        ) {
                          e.currentTarget.style.backgroundColor = "#dc2626";
                        }
                      }}
                    >
                      {isActionLoading === showDeleteDialog ? t("admin.categoryManagement.deleting") : t("admin.categoryManagement.deleteConfirm")}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      <CategoryForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedCategory(null);
        }}
        category={selectedCategory}
        onSuccess={async () => {
          // Force image cache refresh
          setImageCacheBust(Date.now());
          // Small delay to ensure backend has processed the update
          await new Promise(resolve => setTimeout(resolve, 100));
          await fetchCategories();
        }}
      />
    </div>
  );
};

export default CategoryManagement;

