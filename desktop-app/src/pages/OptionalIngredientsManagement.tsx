import React, { useState, useEffect } from "react";
import {
  Utensils,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Filter,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import { optionalIngredientService, type OptionalIngredient } from "../services/optionalIngredientService";
import PageHeader from "../components/PageHeader";
import OptionalIngredientForm from "../components/OptionalIngredientForm";
import OrganizationSearchSelect from "../components/OrganizationSearchSelect";
import branchService, { type Organization } from "../services/branchService";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const OptionalIngredientsManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny, isSuperAdmin } = usePermissions();
  const canCreateOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.CREATE },
  ]);
  const canUpdateOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.UPDATE },
  ]);
  const canDeleteOptionalIngredient = canAny([
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.DELETE },
  ]);

  const [optionalIngredients, setOptionalIngredients] = useState<
    OptionalIngredient[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [orgVersion, setOrgVersion] = useState(0);
  const [showDropdownMenu, setShowDropdownMenu] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedOptionalIngredient, setSelectedOptionalIngredient] = useState<OptionalIngredient | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [selectedOptionalIngredientIds, setSelectedOptionalIngredientIds] =
    useState<Set<string>>(new Set());
  const [allSelectedOnPage, setAllSelectedOnPage] = useState(false);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [optionalIngredientToMove, setOptionalIngredientToMove] = useState<OptionalIngredient | null>(null);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);

  // Fetch optional ingredients
  const fetchOptionalIngredients = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await optionalIngredientService.getOptionalIngredients(
        currentPage,
        10,
        debouncedSearchTerm,
        sortBy,
        sortOrder,
        token || undefined
      );

      setOptionalIngredients(response.optionalIngredients);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching optional ingredients:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptionalIngredients();
  }, [currentPage, debouncedSearchTerm, sortBy, sortOrder, orgVersion]);

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
      setDebouncedSearchTerm("");
      setCurrentPage(1);
      setSelectedOptionalIngredientIds(new Set());
      setAllSelectedOnPage(false);
      setShowDropdownMenu(null);
      setShowDeleteDialog(null);
      setIsFormOpen(false);
      setSelectedOptionalIngredient(null);
      setOptionalIngredientToMove(null);
      setMoveDialogOpen(false);
      setCopyDialogOpen(false);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setSelectedOptionalIngredientIds((prev) => {
      const next = new Set(prev);
      // Remove selections that aren't on the current page if unchecking all
      if (!allSelectedOnPage) {
        optionalIngredients.forEach((oi) => next.delete(oi.id));
      } else {
        optionalIngredients.forEach((oi) => next.add(oi.id));
      }
      return next;
    });
  }, [allSelectedOnPage, optionalIngredients]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const allIds = optionalIngredients.map((oi) => oi.id);
    if (allIds.length === 0) {
      setAllSelectedOnPage(false);
      return;
    }
    const allSelected = allIds.every((id) => selectedOptionalIngredientIds.has(id));
    setAllSelectedOnPage(allSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionalIngredients, selectedOptionalIngredientIds, isSuperAdmin]);

  const toggleSelectedOptionalIngredient = (id: string, checked: boolean) => {
    setSelectedOptionalIngredientIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openMoveOptionalIngredients = async (ingredient?: OptionalIngredient) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setTargetOrganizationId("");
      setOptionalIngredientToMove(ingredient || null);
      setMoveDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.optionalIngredientsManagement.selectOrganization"));
    }
  };

  const openCopyOptionalIngredients = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setTargetOrganizationId("");
      setCopyDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.optionalIngredientsManagement.selectOrganization"));
    }
  };

  const handleMoveOptionalIngredients = async () => {
    const ids = optionalIngredientToMove
      ? [optionalIngredientToMove.id]
      : Array.from(selectedOptionalIngredientIds);

    if (ids.length === 0) return;
    if (!targetOrganizationId) {
      alert(t("admin.optionalIngredientsManagement.selectOrganization"));
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const results = await Promise.allSettled(
        ids.map((id) =>
          optionalIngredientService.setOptionalIngredientOrganization(id, targetOrganizationId, token || undefined)
        )
      );
      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        alert(t("admin.optionalIngredientsManagement.bulkMoveFailed"));
      } else {
        alert(t("admin.optionalIngredientsManagement.bulkMoved"));
      }
      setMoveDialogOpen(false);
      setOptionalIngredientToMove(null);
      setSelectedOptionalIngredientIds(new Set());
      await fetchOptionalIngredients();
    } catch (e: any) {
      console.error("Move optional ingredients failed:", e);
      alert(e?.message || t("admin.optionalIngredientsManagement.bulkMoveFailed"));
    } finally {
      setMoving(false);
    }
  };

  const handleCopyOptionalIngredients = async () => {
    const ids = Array.from(selectedOptionalIngredientIds);
    if (ids.length === 0) return;
    if (!targetOrganizationId) {
      alert(t("admin.optionalIngredientsManagement.selectOrganization"));
      return;
    }

    setCopying(true);
    try {
      const token = await getToken();
      if (!token) return;
      await optionalIngredientService.copyOptionalIngredientsToOrganization(ids, targetOrganizationId, token || undefined);
      alert(t("admin.optionalIngredientsManagement.bulkCopied"));
      setCopyDialogOpen(false);
      setSelectedOptionalIngredientIds(new Set());
      await fetchOptionalIngredients();
    } catch (e: any) {
      console.error("Copy optional ingredients failed:", e);
      alert(e?.message || t("admin.optionalIngredientsManagement.bulkCopyFailed"));
    } finally {
      setCopying(false);
    }
  };

  // Handle delete
  const handleDelete = async (optionalIngredient: OptionalIngredient) => {
    try {
      setIsActionLoading(optionalIngredient.id);
      const token = await getToken();
      await optionalIngredientService.deleteOptionalIngredient(
        optionalIngredient.id,
        token || undefined
      );
      setShowDeleteDialog(null);
      await fetchOptionalIngredients();
    } catch (error) {
      console.error("Error deleting optional ingredient:", error);
      alert(t("admin.optionalIngredientsManagement.deleteError"));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      if (showDropdownMenu) {
        if (
          !target.closest(`[data-dropdown-menu]`) &&
          !target.closest(`[data-dropdown-trigger]`)
        ) {
          setShowDropdownMenu(null);
        }
      }
      
      if (showSortDropdown) {
        if (!target.closest('[data-sort-dropdown]')) {
          setShowSortDropdown(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdownMenu, showSortDropdown]);

  if (loading && optionalIngredients.length === 0) {
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
            {t("admin.optionalIngredientsManagement.loadingTitle")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.optionalIngredientsManagement.loadingDescription")}
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
          title={t("admin.optionalIngredientsManagement.title")}
          description={t("admin.optionalIngredientsManagement.description")}
          actions={
            <button
              onClick={() => {
                if (!canCreateOptionalIngredient) {
                  alert(t("admin.dashboard.noPermission"));
                  return;
                }
                setSelectedOptionalIngredient(null);
                setIsFormOpen(true);
              }}
              disabled={!canCreateOptionalIngredient}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "500",
                border: "none",
                borderRadius: "8px",
                backgroundColor: canCreateOptionalIngredient ? "#ec4899" : "#d1d5db",
                color: "#ffffff",
                cursor: canCreateOptionalIngredient ? "pointer" : "not-allowed",
                boxShadow: "0 2px 4px rgba(236, 72, 153, 0.2)",
                opacity: canCreateOptionalIngredient ? 1 : 0.7,
              }}
              onMouseEnter={(e) => {
                if (canCreateOptionalIngredient) e.currentTarget.style.backgroundColor = "#db2777";
              }}
              onMouseLeave={(e) => {
                if (canCreateOptionalIngredient) e.currentTarget.style.backgroundColor = "#ec4899";
              }}
            >
              <Plus style={{ height: "18px", width: "18px" }} />
              {t("admin.optionalIngredientsManagement.addOptionalIngredient")}
            </button>
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
              checked={
                optionalIngredients.length > 0 &&
                optionalIngredients.every((oi) => selectedOptionalIngredientIds.has(oi.id))
              }
              onChange={(e) => setAllSelectedOnPage(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#ec4899" }}
            />
            {t("admin.optionalIngredientsManagement.selectedCount", { count: selectedOptionalIngredientIds.size })}
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedOptionalIngredientIds(new Set())}
              disabled={selectedOptionalIngredientIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedOptionalIngredientIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedOptionalIngredientIds.size === 0 ? 0.5 : 1,
                fontWeight: 800,
              }}
            >
              {t("common.clear", { defaultValue: "Clear" })}
            </button>
            <button
              type="button"
              onClick={() => openMoveOptionalIngredients()}
              disabled={selectedOptionalIngredientIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #ec4899",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: selectedOptionalIngredientIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedOptionalIngredientIds.size === 0 ? 0.5 : 1,
                fontWeight: 900,
              }}
            >
              {t("admin.optionalIngredientsManagement.moveSelected")}
            </button>
            <button
              type="button"
              onClick={() => openCopyOptionalIngredients()}
              disabled={selectedOptionalIngredientIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedOptionalIngredientIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedOptionalIngredientIds.size === 0 ? 0.5 : 1,
                fontWeight: 900,
              }}
            >
              {t("admin.optionalIngredientsManagement.copySelected")}
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
              placeholder={t("admin.optionalIngredientsManagement.searchPlaceholder")}
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

          {/* Sort Filter */}
          <div style={{ position: "relative" }} data-sort-dropdown>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              data-sort-dropdown
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                cursor: "pointer",
                color: "#111827",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ffffff";
              }}
            >
              <Filter style={{ height: "16px", width: "16px" }} />
              {t("admin.optionalIngredientsManagement.sort")}
            </button>
            {showSortDropdown && (
              <div
                data-sort-dropdown
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
                  minWidth: "200px",
                  padding: "4px",
                }}
              >
                <button
                  onClick={() => {
                    setSortBy("name");
                    setSortOrder("asc");
                    setShowSortDropdown(false);
                  }}
                  style={{
                    width: "100%",
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
                  {t("admin.optionalIngredientsManagement.nameAZ")}
                </button>
                <button
                  onClick={() => {
                    setSortBy("name");
                    setSortOrder("desc");
                    setShowSortDropdown(false);
                  }}
                  style={{
                    width: "100%",
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
                  {t("admin.optionalIngredientsManagement.nameZA")}
                </button>
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "#e5e7eb",
                    margin: "4px 0",
                  }}
                />
                <button
                  onClick={() => {
                    setSortBy("createdAt");
                    setSortOrder("desc");
                    setShowSortDropdown(false);
                  }}
                  style={{
                    width: "100%",
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
                  {t("admin.optionalIngredientsManagement.newestFirst")}
                </button>
                <button
                  onClick={() => {
                    setSortBy("createdAt");
                    setSortOrder("asc");
                    setShowSortDropdown(false);
                  }}
                  style={{
                    width: "100%",
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
                  {t("admin.optionalIngredientsManagement.oldestFirst")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Optional Ingredients Grid */}
      {optionalIngredients.length === 0 ? (
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
          <Utensils
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
            {t("admin.optionalIngredientsManagement.noOptionalIngredientsFound")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {searchTerm
              ? t("admin.optionalIngredientsManagement.tryAdjustingSearch")
              : t("admin.optionalIngredientsManagement.getStartedByCreating")}
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
          {optionalIngredients.map((ingredient) => (
            <div
              key={ingredient.id}
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
                <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  {isSuperAdmin ? (
                    <input
                      type="checkbox"
                      checked={selectedOptionalIngredientIds.has(ingredient.id)}
                      onChange={(e) => toggleSelectedOptionalIngredient(ingredient.id, e.target.checked)}
                      style={{ width: 16, height: 16, marginTop: 10, accentColor: "#ec4899" }}
                    />
                  ) : null}
                  {/* Icon */}
                  <div
                    style={{
                      fontSize: "24px",
                      flexShrink: 0,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      backgroundColor: "#fce7f3",
                    }}
                  >
                    <Utensils
                      style={{
                        height: "20px",
                        width: "20px",
                        color: "#ec4899",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#111827",
                        margin: 0,
                      }}
                    >
                      {ingredient.name}
                    </h3>
                  </div>
                </div>

                {/* Actions Menu */}
                <div style={{ position: "relative" }}>
                  <button
                    data-dropdown-trigger
                    onClick={() => {
                      setShowDropdownMenu(
                        showDropdownMenu === ingredient.id ? null : ingredient.id
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

                  {showDropdownMenu === ingredient.id && (
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
                      <button
                        onClick={() => {
                          if (!canUpdateOptionalIngredient) {
                            alert(t("admin.dashboard.noPermission"));
                            return;
                          }
                          setSelectedOptionalIngredient(ingredient);
                          setIsFormOpen(true);
                          setShowDropdownMenu(null);
                        }}
                        disabled={!canUpdateOptionalIngredient}
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
                          cursor: canUpdateOptionalIngredient ? "pointer" : "not-allowed",
                          color: "#111827",
                          textAlign: "left",
                          opacity: canUpdateOptionalIngredient ? 1 : 0.6,
                        }}
                        onMouseEnter={(e) => {
                          if (canUpdateOptionalIngredient) e.currentTarget.style.backgroundColor = "#f9fafb";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <Edit style={{ height: "16px", width: "16px" }} />
                        {t("admin.optionalIngredientsManagement.edit")}
                      </button>
                      {isSuperAdmin ? (
                        <>
                          <button
                            onClick={() => {
                              openMoveOptionalIngredients(ingredient);
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
                            <ChevronRight style={{ height: "16px", width: "16px" }} />
                            {t("admin.optionalIngredientsManagement.moveToOrganization", {
                              defaultValue: "Move to organization",
                            })}
                          </button>
                          <div
                            style={{
                              height: "1px",
                              backgroundColor: "#e5e7eb",
                              margin: "4px 0",
                            }}
                          />
                        </>
                      ) : (
                        <div
                          style={{
                            height: "1px",
                            backgroundColor: "#e5e7eb",
                            margin: "4px 0",
                          }}
                        />
                      )}
                      <button
                        onClick={() => {
                          if (!canDeleteOptionalIngredient) {
                            alert(t("admin.dashboard.noPermission"));
                            return;
                          }
                          setShowDeleteDialog(ingredient.id);
                          setShowDropdownMenu(null);
                        }}
                        disabled={isActionLoading === ingredient.id || !canDeleteOptionalIngredient}
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
                          cursor: isActionLoading === ingredient.id || !canDeleteOptionalIngredient ? "not-allowed" : "pointer",
                          color: "#dc2626",
                          textAlign: "left",
                          opacity: isActionLoading === ingredient.id || !canDeleteOptionalIngredient ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (isActionLoading !== ingredient.id && canDeleteOptionalIngredient) {
                            e.currentTarget.style.backgroundColor = "#fef2f2";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isActionLoading !== ingredient.id && canDeleteOptionalIngredient) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <Trash2 style={{ height: "16px", width: "16px" }} />
                        {t("admin.optionalIngredientsManagement.delete")}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {ingredient.description && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    margin: 0,
                    marginBottom: "12px",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {ingredient.description}
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
                  {ingredient._count?.mealOptionalIngredients || 0} {(ingredient._count?.mealOptionalIngredients || 0) !== 1 ? t("admin.optionalIngredientsManagement.mealsPlural") : t("admin.optionalIngredientsManagement.meals")}
                </span>
                <span>
                  {new Date(ingredient.createdAt).toLocaleDateString()}
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
            {t("admin.optionalIngredientsManagement.showingOptionalIngredients", { count: optionalIngredients.length, total: totalCount })}
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
              {t("admin.optionalIngredientsManagement.pageOf", { current: currentPage, total: totalPages })}
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
      {showDeleteDialog && optionalIngredients.find((i) => i.id === showDeleteDialog) && (
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
              {t("admin.optionalIngredientsManagement.deleteOptionalIngredientTitle")}
            </h3>
            {(() => {
              const ingredientToDelete = optionalIngredients.find((i) => i.id === showDeleteDialog);
              return (
                <>
                  <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
                    {t("admin.optionalIngredientsManagement.deleteOptionalIngredientDescription", { name: ingredientToDelete?.name })}
                    {ingredientToDelete && ingredientToDelete._count?.mealOptionalIngredients > 0 && (
                      <span
                        style={{
                          display: "block",
                          marginTop: "8px",
                          color: "#dc2626",
                          fontWeight: "500",
                        }}
                      >
                        {t("admin.optionalIngredientsManagement.deleteOptionalIngredientWarning", { 
                          count: ingredientToDelete._count.mealOptionalIngredients,
                          meal: ingredientToDelete._count.mealOptionalIngredients !== 1 ? t("admin.optionalIngredientsManagement.mealsPlural") : t("admin.optionalIngredientsManagement.meals")
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
                      {t("admin.optionalIngredientsManagement.deleteOptionalIngredientCancel")}
                    </button>
                    <button
                      onClick={() => {
                        if (ingredientToDelete) {
                          handleDelete(ingredientToDelete);
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
                      {isActionLoading === showDeleteDialog ? t("admin.optionalIngredientsManagement.deleting") : t("admin.optionalIngredientsManagement.deleteOptionalIngredientConfirm")}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Optional Ingredient Form Modal */}
      <OptionalIngredientForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedOptionalIngredient(null);
        }}
        optionalIngredient={selectedOptionalIngredient}
        onSuccess={async () => {
          await fetchOptionalIngredients();
        }}
      />

      {moveDialogOpen ? (
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
          onClick={() => {
            if (!moving) setMoveDialogOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "480px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 900, color: "#111827" }}>
              {t("admin.optionalIngredientsManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.optionalIngredientsManagement.targetOrganization")}
            </p>

            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.optionalIngredientsManagement.selectOrganization")}
              searchPlaceholder={t("common.search")}
              noResultsText={t("common.noResults")}
              disabled={moving}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                disabled={moving}
                onClick={() => setMoveDialogOpen(false)}
                style={{
                  padding: "8px 14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  cursor: moving ? "not-allowed" : "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={moving}
                onClick={handleMoveOptionalIngredients}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: moving ? "#d1d5db" : "#ec4899",
                  color: "#ffffff",
                  cursor: moving ? "not-allowed" : "pointer",
                }}
              >
                {moving ? t("admin.optionalIngredientsManagement.moving", { defaultValue: "Moving..." }) : t("admin.optionalIngredientsManagement.move", { defaultValue: "Move" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {copyDialogOpen ? (
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
          onClick={() => {
            if (!copying) setCopyDialogOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "480px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px", fontWeight: 900, color: "#111827" }}>
              {t("admin.optionalIngredientsManagement.copySelected")}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.optionalIngredientsManagement.targetOrganization")}
            </p>

            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.optionalIngredientsManagement.selectOrganization")}
              searchPlaceholder={t("common.search")}
              noResultsText={t("common.noResults")}
              disabled={copying}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                disabled={copying}
                onClick={() => setCopyDialogOpen(false)}
                style={{
                  padding: "8px 14px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  cursor: copying ? "not-allowed" : "pointer",
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={copying}
                onClick={handleCopyOptionalIngredients}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: copying ? "#d1d5db" : "#111827",
                  color: "#ffffff",
                  cursor: copying ? "not-allowed" : "pointer",
                }}
              >
                {copying ? t("admin.optionalIngredientsManagement.copying", { defaultValue: "Copying..." }) : t("admin.optionalIngredientsManagement.copy", { defaultValue: "Copy" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OptionalIngredientsManagement;

