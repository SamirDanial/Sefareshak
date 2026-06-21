import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { addonService, type Addon } from "../services/addonService";
import PageHeader from "../components/PageHeader";
import AddonForm from "../components/AddonForm";
import OrganizationSearchSelect from "../components/OrganizationSearchSelect";
import branchService, { type Organization } from "../services/branchService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const AddonManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny, isSuperAdmin } = usePermissions();
  const [addons, setAddons] = useState<Addon[]>([]);
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
  const [imageCacheBust, setImageCacheBust] = useState<number>(Date.now());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<Addon | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set());
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [addonToMove, setAddonToMove] = useState<Addon | null>(null);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);

  const canCreateAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.CREATE }]);
  const canUpdateAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.UPDATE }]);
  const canDeleteAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.DELETE }]);
  const canToggleAddon = canAny([{ resource: RESOURCES.ADDONS, action: ACTIONS.TOGGLE_ACTIVE }]);

  const canManageAddonActions = canUpdateAddon || canToggleAddon || canDeleteAddon || isSuperAdmin;

  const loadOrganizations = async () => {
    const token = await getToken();
    if (!token) return;
    const orgs = await branchService.getOrganizations(token);
    setOrganizations(Array.isArray(orgs) ? orgs : []);
  };

  const toggleSelectedAddon = (id: string, checked: boolean) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const setAllSelectedOnPage = (checked: boolean) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        addons.forEach((a) => next.add(a.id));
      } else {
        addons.forEach((a) => next.delete(a.id));
      }
      return next;
    });
  };

  const openMoveDialog = async (addon?: Addon) => {
    try {
      await loadOrganizations();
      setAddonToMove(addon || null);
      setTargetOrganizationId("");
      setMoveDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.addonManagement.selectOrganization"));
    }
  };

  const openCopyDialog = async () => {
    try {
      await loadOrganizations();
      setTargetOrganizationId("");
      setCopyDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.addonManagement.selectOrganization"));
    }
  };

  const handleMoveAddons = async () => {
    if (!targetOrganizationId) {
      alert(t("admin.addonManagement.selectOrganization"));
      return;
    }

    const ids = addonToMove ? [addonToMove.id] : Array.from(selectedAddonIds);
    if (ids.length === 0) return;

    setMoving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const results = await Promise.allSettled(
        ids.map((id) =>
          addonService.setAddonOrganization(id, targetOrganizationId, token || undefined)
        )
      );
      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        alert(t("admin.addonManagement.bulkMoveFailed"));
      } else {
        alert(t("admin.addonManagement.bulkMoved"));
      }

      setMoveDialogOpen(false);
      setAddonToMove(null);
      setSelectedAddonIds(new Set());
      await fetchAddons();
    } catch (e: any) {
      console.error("Move addons failed:", e);
      alert(e?.message || t("admin.addonManagement.bulkMoveFailed"));
    } finally {
      setMoving(false);
    }
  };

  const handleCopyAddons = async () => {
    if (!targetOrganizationId) {
      alert(t("admin.addonManagement.selectOrganization"));
      return;
    }

    const ids = Array.from(selectedAddonIds);
    if (ids.length === 0) return;

    setCopying(true);
    try {
      const token = await getToken();
      if (!token) return;
      await addonService.copyAddonsToOrganization(ids, targetOrganizationId, token || undefined);
      alert(t("admin.addonManagement.bulkCopied"));
      setCopyDialogOpen(false);
      setSelectedAddonIds(new Set());
      await fetchAddons();
    } catch (e: any) {
      console.error("Copy addons failed:", e);
      alert(e?.message || t("admin.addonManagement.bulkCopyFailed"));
    } finally {
      setCopying(false);
    }
  };

  const handleSort = (field: "name" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  // Fetch addons
  const fetchAddons = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const statusParam =
        selectedStatus === "ACTIVE"
          ? "ACTIVE"
          : selectedStatus === "INACTIVE"
            ? "INACTIVE"
            : "";
      const response = await addonService.getAddons(
        currentPage,
        10,
        searchTerm,
        sortBy,
        sortOrder,
        token || undefined,
        statusParam as "ACTIVE" | "INACTIVE" | ""
      );

      setAddons(response.addons);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching addons:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddons();
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
      setAddons([]);
      setTotalPages(1);
      setTotalCount(0);
      setSelectedAddonIds(new Set());
      setShowDropdownMenu(null);
      setShowDeleteDialog(null);
      setIsFormOpen(false);
      setSelectedAddon(null);
      setMoveDialogOpen(false);
      setCopyDialogOpen(false);
      setAddonToMove(null);
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
  const handleToggleStatus = async (addon: Addon) => {
    try {
      if (!canToggleAddon) return;
      setIsActionLoading(addon.id);
      const token = await getToken();
      await addonService.toggleAddonStatus(
        addon.id,
        token || undefined
      );
      setShowDropdownMenu(null);
      await fetchAddons();
    } catch (error) {
      console.error("Error toggling addon status:", error);
      alert(t("admin.addonManagement.toggleStatusError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Handle delete
  const handleDelete = async (addon: Addon) => {
    try {
      if (!canDeleteAddon) return;
      setIsActionLoading(addon.id);
      const token = await getToken();
      await addonService.deleteAddon(addon.id, token || undefined);
      setShowDeleteDialog(null);
      await fetchAddons();
    } catch (error) {
      console.error("Error deleting addon:", error);
      alert(t("admin.addonManagement.deleteError"));
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

  const formatPrice = (price: string | number): string => {
    const numPrice = typeof price === "string" ? parseFloat(price) : price;
    return `$${numPrice.toFixed(2)}`;
  };

  if (loading && addons.length === 0) {
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
            {t("admin.addonManagement.loadingTitle")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.addonManagement.loadingDescription")}
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
      <div style={{ marginBottom: "24px" }}>
        <PageHeader
          title={t("admin.addonManagement.title")}
          description={t("admin.addonManagement.description")}
          actions={
            canCreateAddon ? (
              <button
                onClick={() => {
                  setSelectedAddon(null);
                  setIsFormOpen(true);
                }}
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
                  boxShadow: "0 2px 4px rgba(236, 72, 153, 0.2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#db2777";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ec4899";
                }}
              >
                <Plus style={{ height: "18px", width: "18px" }} />
                {t("admin.addonManagement.addAddon")}
              </button>
            ) : null
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
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#111827", fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={addons.length > 0 && addons.every((a) => selectedAddonIds.has(a.id))}
              onChange={(e) => setAllSelectedOnPage(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#ec4899" }}
            />
            {t("admin.addonManagement.selectedCount", { count: selectedAddonIds.size })}
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedAddonIds(new Set())}
              disabled={selectedAddonIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedAddonIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedAddonIds.size === 0 ? 0.5 : 1,
                fontWeight: 800,
              }}
            >
              {t("common.clear", { defaultValue: "Clear" })}
            </button>

            <button
              type="button"
              onClick={() => openMoveDialog()}
              disabled={selectedAddonIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #ec4899",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: selectedAddonIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedAddonIds.size === 0 ? 0.5 : 1,
                fontWeight: 900,
              }}
            >
              {t("admin.addonManagement.moveSelected")}
            </button>
            <button
              type="button"
              onClick={() => openCopyDialog()}
              disabled={selectedAddonIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedAddonIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedAddonIds.size === 0 ? 0.5 : 1,
                fontWeight: 900,
              }}
            >
              {t("admin.addonManagement.copySelected")}
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
              placeholder={t("admin.addonManagement.searchPlaceholder")}
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
          <select
            value={selectedStatus || "all"}
            onChange={(e) => {
              setSelectedStatus(e.target.value === "all" ? "all" : e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              outline: "none",
              minWidth: "140px",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#ec4899";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e5e7eb";
            }}
          >
            <option value="all">{t("admin.addonManagement.allStatus")}</option>
            <option value="ACTIVE">{t("admin.addonManagement.active")}</option>
            <option value="INACTIVE">{t("admin.addonManagement.inactive")}</option>
          </select>

          {/* Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => handleSort("name")}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: sortBy === "name" ? "#ec4899" : "#ffffff",
                cursor: "pointer",
                color: sortBy === "name" ? "#ffffff" : "#111827",
              }}
              onMouseEnter={(e) => {
                if (sortBy !== "name") e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                if (sortBy !== "name") e.currentTarget.style.backgroundColor = "#ffffff";
              }}
            >
              {t("admin.addonManagement.nameAZ", { defaultValue: "Name A-Z" })}
            </button>
            <button
              onClick={() => handleSort("createdAt")}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: sortBy === "createdAt" ? "#ec4899" : "#ffffff",
                cursor: "pointer",
                color: sortBy === "createdAt" ? "#ffffff" : "#111827",
              }}
              onMouseEnter={(e) => {
                if (sortBy !== "createdAt") e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                if (sortBy !== "createdAt") e.currentTarget.style.backgroundColor = "#ffffff";
              }}
            >
              {sortBy === "createdAt"
                ? sortOrder === "desc"
                  ? t("admin.addonManagement.newestFirst", { defaultValue: "Newest First" })
                  : t("admin.addonManagement.oldestFirst", { defaultValue: "Oldest First" })
                : t("admin.addonManagement.newestFirst", { defaultValue: "Newest First" })}
            </button>
          </div>
        </div>
      </div>

      {/* Addons Grid */}
      {addons.length === 0 ? (
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
            {t("admin.addonManagement.noAddonsFound")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {searchTerm
              ? t("admin.addonManagement.tryAdjustingSearch")
              : t("admin.addonManagement.getStartedByCreating")}
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
          {addons.map((addon) => (
            <div
              key={addon.id}
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
                        checked={selectedAddonIds.has(addon.id)}
                        onChange={(e) => toggleSelectedAddon(addon.id, e.target.checked)}
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
                      {addon.name}
                    </h3>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        borderRadius: "12px",
                        backgroundColor: addon.isActive
                          ? "#d1fae5"
                          : "#fee2e2",
                        color: addon.isActive ? "#065f46" : "#991b1b",
                      }}
                    >
                      {addon.isActive ? t("admin.addonManagement.active") : t("admin.addonManagement.inactive")}
                    </span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: "500",
                        borderRadius: "12px",
                        backgroundColor: "#e0e7ff",
                        color: "#3730a3",
                      }}
                    >
                      {addon.type === "BOOLEAN" ? t("admin.addonManagement.boolean") : t("admin.addonManagement.quantity")}
                    </span>
                  </div>
                </div>

                {/* Actions Menu */}
                {canManageAddonActions && (
                  <div style={{ position: "relative" }}>
                    <button
                      data-dropdown-trigger
                      onClick={() => {
                        setShowDropdownMenu(
                          showDropdownMenu === addon.id ? null : addon.id
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

                    {showDropdownMenu === addon.id && (
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
                          minWidth: "160px",
                          padding: "4px",
                        }}
                      >
                      {canUpdateAddon && (
                        <button
                          onClick={() => {
                            setSelectedAddon(addon);
                            setIsFormOpen(true);
                            setShowDropdownMenu(null);
                          }}
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
                            cursor: "pointer",
                            color: "#111827",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <Edit style={{ height: "16px", width: "16px" }} />
                          {t("admin.addonManagement.edit")}
                        </button>
                      )}

                      {canToggleAddon && (
                        <button
                          onClick={() => {
                            handleToggleStatus(addon);
                          }}
                          disabled={isActionLoading === addon.id}
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
                            cursor:
                              isActionLoading === addon.id ? "not-allowed" : "pointer",
                            color: "#111827",
                            textAlign: "left",
                            opacity: isActionLoading === addon.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (isActionLoading !== addon.id) {
                              e.currentTarget.style.backgroundColor = "#f9fafb";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isActionLoading !== addon.id) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          {addon.isActive ? (
                            <>
                              <EyeOff style={{ height: "16px", width: "16px" }} />
                              {t("admin.addonManagement.deactivate")}
                            </>
                          ) : (
                            <>
                              <Eye style={{ height: "16px", width: "16px" }} />
                              {t("admin.addonManagement.activate")}
                            </>
                          )}
                        </button>
                      )}

                      {isSuperAdmin && (
                        <button
                          onClick={() => {
                            openMoveDialog(addon);
                            setShowDropdownMenu(null);
                          }}
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
                            cursor: "pointer",
                            color: "#111827",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f9fafb";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <ChevronRight style={{ height: "16px", width: "16px" }} />
                          {t("admin.addonManagement.moveToOrganization", {
                            defaultValue: "Move to organization",
                          })}
                        </button>
                      )}

                      <div
                        style={{
                          height: "1px",
                          backgroundColor: "#e5e7eb",
                          margin: "4px 0",
                        }}
                      />
                      {canDeleteAddon && (
                        <button
                          onClick={() => {
                            setShowDeleteDialog(addon.id);
                            setShowDropdownMenu(null);
                          }}
                          disabled={isActionLoading === addon.id}
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
                            cursor:
                              isActionLoading === addon.id ? "not-allowed" : "pointer",
                            color: "#dc2626",
                            textAlign: "left",
                            opacity: isActionLoading === addon.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (isActionLoading !== addon.id) {
                              e.currentTarget.style.backgroundColor = "#fef2f2";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (isActionLoading !== addon.id) {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }
                          }}
                        >
                          <Trash2 style={{ height: "16px", width: "16px" }} />
                          {t("admin.addonManagement.delete")}
                        </button>
                      )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Image */}
              {addon.image && (
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
                    key={`${addon.id}-${imageCacheBust}`}
                    src={getOptimizedImageUrl(addon.image, true)}
                    alt={addon.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      console.error("Image failed to load:", {
                        src: e.currentTarget.src,
                        addonName: addon.name,
                        imagePath: addon.image,
                      });
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* Description */}
              {addon.description && (
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
                  {addon.description}
                </p>
              )}

              {/* Categories */}
              {addon.addonCategories && addon.addonCategories.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      fontWeight: "500",
                    }}
                  >
                    {t("admin.addonManagement.categories")}
                  </span>
                  {addon.addonCategories.map((ac) => (
                    <span
                      key={ac.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: "500",
                        backgroundColor: "#fce7f3",
                        color: "#9f1239",
                        border: "1px solid #f9a8d4",
                      }}
                    >
                      {ac.category.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Price and Type */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: "600",
                      color: "#111827",
                    }}
                  >
                    {formatPrice(addon.price ?? 0)}
                  </span>
                </div>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: "500",
                    backgroundColor: addon.type === "BOOLEAN" ? "#dbeafe" : "#e9d5ff",
                    color: addon.type === "BOOLEAN" ? "#1e40af" : "#6b21a8",
                  }}
                >
                  {addon.type === "BOOLEAN" ? t("admin.addonManagement.yesNo") : t("admin.addonManagement.quantity")}
                </span>
              </div>

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
                  {addon._count.mealAddOns} {addon._count.mealAddOns !== 1 ? t("admin.addonManagement.mealsPlural") : t("admin.addonManagement.meals")}
                </span>
                <span>
                  {new Date(addon.createdAt).toLocaleDateString()}
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
          }}
        >
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {t("admin.addonManagement.showingAddons", { count: addons.length, total: totalCount })}
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
              {t("admin.addonManagement.pageOf", { current: currentPage, total: totalPages })}
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

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && addons.find((a) => a.id === showDeleteDialog) && (
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
              {t("admin.addonManagement.deleteAddonTitle")}
            </h3>
            {(() => {
              const addonToDelete = addons.find((a) => a.id === showDeleteDialog);
              return (
                <>
                  <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
                    {t("admin.addonManagement.deleteAddonDescription", { name: addonToDelete?.name })}
                    {addonToDelete && addonToDelete._count.mealAddOns > 0 && (
                      <span
                        style={{
                          display: "block",
                          marginTop: "8px",
                          color: "#dc2626",
                          fontWeight: "500",
                        }}
                      >
                        {t("admin.addonManagement.deleteAddonWarning", { 
                          count: addonToDelete._count.mealAddOns,
                          meal: addonToDelete._count.mealAddOns !== 1 ? t("admin.addonManagement.mealsPlural") : t("admin.addonManagement.meals")
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
                      {t("admin.addonManagement.deleteAddonCancel")}
                    </button>
                    <button
                      onClick={() => {
                        if (addonToDelete) {
                          handleDelete(addonToDelete);
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
                      {isActionLoading === showDeleteDialog ? t("admin.addonManagement.deleting") : t("admin.addonManagement.deleteAddonConfirm")}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Addon Form Modal */}
      <AddonForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedAddon(null);
        }}
        addon={selectedAddon}
        onSuccess={async () => {
          // Force image cache refresh
          setImageCacheBust(Date.now());
          // Small delay to ensure backend has processed the update
          await new Promise(resolve => setTimeout(resolve, 100));
          await fetchAddons();
        }}
      />

      {/* Move Dialog (super admin) */}
      {isSuperAdmin && moveDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
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
              maxWidth: "520px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 900, color: "#111827" }}>
              {t("admin.addonManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.addonManagement.targetOrganization")}
            </p>
            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.addonManagement.selectOrganization")}
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
                  opacity: moving ? 0.6 : 1,
                  fontWeight: 800,
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleMoveAddons}
                disabled={moving}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ec4899",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: moving ? "not-allowed" : "pointer",
                  opacity: moving ? 0.8 : 1,
                  fontWeight: 900,
                }}
              >
                {moving ? t("common.loading") : t("common.save")}
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
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
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
              maxWidth: "520px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 900, color: "#111827" }}>
              {t("admin.addonManagement.copySelected")}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.addonManagement.targetOrganization")}
            </p>
            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.addonManagement.selectOrganization")}
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
                  opacity: copying ? 0.6 : 1,
                  fontWeight: 800,
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleCopyAddons}
                disabled={copying}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ec4899",
                  backgroundColor: "#ec4899",
                  color: "#ffffff",
                  cursor: copying ? "not-allowed" : "pointer",
                  opacity: copying ? 0.8 : 1,
                  fontWeight: 900,
                }}
              >
                {copying ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddonManagement;

