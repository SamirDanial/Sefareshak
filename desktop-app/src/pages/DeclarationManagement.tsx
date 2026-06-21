import React, { useState, useEffect } from "react";
import {
  Tag,
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
  Filter,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { declarationService, type Declaration } from "../services/declarationService";
import DeclarationForm from "../components/DeclarationForm";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import OrganizationSearchSelect from "../components/OrganizationSearchSelect";
import branchService, { type Organization } from "../services/branchService";
import PageHeader from "../components/PageHeader";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const DeclarationManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny, isSuperAdmin } = usePermissions();
  const canCreateDeclaration = canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.CREATE }]);
  const canUpdateDeclaration = canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.UPDATE }]);
  const canDeleteDeclaration = canAny([{ resource: RESOURCES.DECLARATIONS, action: ACTIONS.DELETE }]);

  const canManageDeclarationActions = canUpdateDeclaration || canDeleteDeclaration || isSuperAdmin;

  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [allDeclarations, setAllDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedType, setSelectedType] = useState<string>("");
  const [orgVersion, setOrgVersion] = useState(0);
  const [showDropdownMenu, setShowDropdownMenu] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState<Declaration | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string>("");
  const [selectedDeclarationIds, setSelectedDeclarationIds] = useState<Set<string>>(new Set());
  const [allSelectedOnPage, setAllSelectedOnPage] = useState(false);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [declarationToMove, setDeclarationToMove] = useState<Declaration | null>(null);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);

  const uniqueTypes = Array.from(
    new Set((allDeclarations || []).map((d) => (d.type || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const toggleSelectedDeclaration = (id: string, checked: boolean) => {
    setSelectedDeclarationIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Fetch declarations
  const fetchDeclarations = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await declarationService.getDeclarations(
        currentPage,
        10,
        debouncedSearchTerm,
        sortBy,
        sortOrder,
        selectedType,
        token || undefined
      );

      setDeclarations(response.declarations);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error fetching declarations:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDeclarationsForTypes = async () => {
    try {
      const token = await getToken();
      const response = await declarationService.getDeclarations(1, 100, "", "createdAt", "desc", "", token || undefined);
      setAllDeclarations(response.declarations || []);
    } catch (e) {
      console.error("Error fetching declarations for types:", e);
      setAllDeclarations([]);
    }
  };

  useEffect(() => {
    fetchDeclarations();
  }, [currentPage, debouncedSearchTerm, sortBy, sortOrder, selectedType, orgVersion]);

  useEffect(() => {
    fetchAllDeclarationsForTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setDebouncedSearchTerm("");
      setSelectedType("");
      setSortBy("createdAt");
      setSortOrder("desc");
      setCurrentPage(1);
      setDeclarations([]);
      setAllDeclarations([]);
      setTotalPages(1);
      setTotalCount(0);
      setSelectedDeclarationIds(new Set());
      setAllSelectedOnPage(false);
      setShowDropdownMenu(null);
      setShowDeleteDialog(null);
      setIsFormOpen(false);
      setSelectedDeclaration(null);
      setDeclarationToMove(null);
      setMoveDialogOpen(false);
      setCopyDialogOpen(false);
      setTargetOrganizationId("");
      setOrganizations([]);

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
    setSelectedDeclarationIds((prev) => {
      const next = new Set(prev);
      if (!allSelectedOnPage) {
        declarations.forEach((d) => next.delete(d.id));
      } else {
        declarations.forEach((d) => next.add(d.id));
      }
      return next;
    });
  }, [allSelectedOnPage, declarations]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const allIds = declarations.map((d) => d.id);
    if (allIds.length === 0) {
      setAllSelectedOnPage(false);
      return;
    }
    const allSelected = allIds.every((id) => selectedDeclarationIds.has(id));
    setAllSelectedOnPage(allSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declarations, selectedDeclarationIds, isSuperAdmin]);

  // Handle delete
  const handleDelete = async (declaration: Declaration) => {
    try {
      setIsActionLoading(declaration.id);
      const token = await getToken();
      await declarationService.deleteDeclaration(declaration.id, token || undefined);
      setShowDeleteDialog(null);
      await fetchDeclarations();
    } catch (error) {
      console.error("Error deleting declaration:", error);
      alert(t("admin.declarationManagement.deleteError"));
    } finally {
      setIsActionLoading(null);
    }
  };

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
      if (showSortDropdown) {
        const target = event.target as HTMLElement;
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

  const openMoveDeclarations = async (declaration?: Declaration) => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setTargetOrganizationId("");
      setDeclarationToMove(declaration || null);
      setMoveDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.declarationManagement.selectOrganization"));
    }
  };

  const openCopyDeclarations = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const orgs = await branchService.getOrganizations(token);
      setOrganizations(orgs || []);
      setTargetOrganizationId("");
      setCopyDialogOpen(true);
    } catch (e) {
      console.error("Failed to load organizations:", e);
      alert(t("admin.declarationManagement.selectOrganization"));
    }
  };

  const handleMoveDeclarations = async () => {
    const ids = declarationToMove ? [declarationToMove.id] : Array.from(selectedDeclarationIds);
    if (ids.length === 0) return;
    if (!targetOrganizationId) {
      alert(t("admin.declarationManagement.selectOrganization"));
      return;
    }

    setMoving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const results = await Promise.allSettled(
        ids.map((id) => declarationService.setDeclarationOrganization(id, targetOrganizationId, token || undefined))
      );
      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) alert(t("admin.declarationManagement.bulkMoveFailed"));
      else alert(t("admin.declarationManagement.bulkMoved"));
      setMoveDialogOpen(false);
      setDeclarationToMove(null);
      setSelectedDeclarationIds(new Set());
      await fetchDeclarations();
    } catch (e: any) {
      console.error("Move declarations failed:", e);
      alert(e?.message || t("admin.declarationManagement.bulkMoveFailed"));
    } finally {
      setMoving(false);
    }
  };

  const handleCopyDeclarations = async () => {
    const ids = Array.from(selectedDeclarationIds);
    if (ids.length === 0) return;
    if (!targetOrganizationId) {
      alert(t("admin.declarationManagement.selectOrganization"));
      return;
    }

    setCopying(true);
    try {
      const token = await getToken();
      if (!token) return;
      await declarationService.copyDeclarationsToOrganization(ids, targetOrganizationId, token || undefined);
      alert(t("admin.declarationManagement.bulkCopied"));
      setCopyDialogOpen(false);
      setSelectedDeclarationIds(new Set());
      await fetchDeclarations();
    } catch (e: any) {
      console.error("Copy declarations failed:", e);
      alert(e?.message || t("admin.declarationManagement.bulkCopyFailed"));
    } finally {
      setCopying(false);
    }
  };

  if (loading && declarations.length === 0) {
    return (
      <div style={{ padding: "24px", height: "100%", overflow: "auto" }}>
        <PageHeader
          title={t("admin.declarationManagement.title")}
          description={t("admin.declarationManagement.description")}
        />
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
            {t("admin.declarationManagement.loadingTitle")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.declarationManagement.loadingDescription")}
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
          title={t("admin.declarationManagement.title")}
          description={t("admin.declarationManagement.description")}
          actions={
            canCreateDeclaration ? (
              <button
                onClick={() => {
                  setSelectedDeclaration(null);
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
                {t("admin.declarationManagement.addDeclaration")}
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
              checked={declarations.length > 0 && declarations.every((d) => selectedDeclarationIds.has(d.id))}
              onChange={(e) => setAllSelectedOnPage(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#ec4899" }}
            />
            {t("admin.declarationManagement.selectedCount", { count: selectedDeclarationIds.size, defaultValue: "Selected: {{count}}" })}
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedDeclarationIds(new Set())}
              disabled={selectedDeclarationIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedDeclarationIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedDeclarationIds.size === 0 ? 0.5 : 1,
                fontWeight: 800,
              }}
            >
              {t("common.clear", { defaultValue: "Clear" })}
            </button>
            <button
              type="button"
              onClick={() => openMoveDeclarations()}
              disabled={selectedDeclarationIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #ec4899",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: selectedDeclarationIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedDeclarationIds.size === 0 ? 0.5 : 1,
                fontWeight: 900,
              }}
            >
              {t("admin.declarationManagement.moveSelected", { defaultValue: "Move selected" })}
            </button>
            <button
              type="button"
              onClick={() => openCopyDeclarations()}
              disabled={selectedDeclarationIds.size === 0}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#ffffff",
                cursor: selectedDeclarationIds.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedDeclarationIds.size === 0 ? 0.5 : 1,
                fontWeight: 900,
              }}
            >
              {t("admin.declarationManagement.copySelected", { defaultValue: "Copy selected" })}
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
              placeholder={t("admin.declarationManagement.searchPlaceholder")}
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

          {/* Type Filter */}
          <select
            value={selectedType || "all"}
            onChange={(e) => {
              setSelectedType(e.target.value === "all" ? "" : e.target.value);
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
            <option value="all">{t("admin.declarationManagement.allTypes")}</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

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
              {t("admin.declarationManagement.sort")}
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
                  minWidth: "220px",
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
                  {t("admin.declarationManagement.nameAZ", { defaultValue: "Name A-Z" })}
                </button>
                <div style={{ height: "1px", backgroundColor: "#e5e7eb", margin: "4px 0" }} />
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
                  {t("admin.declarationManagement.newestFirst", { defaultValue: "Newest First" })}
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
                  {t("admin.declarationManagement.oldestFirst", { defaultValue: "Oldest First" })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Declarations Grid */}
      {declarations.length === 0 ? (
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
          <Tag
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
            {t("admin.declarationManagement.noDeclarationsFound")}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {searchTerm || selectedType
              ? t("admin.declarationManagement.tryAdjustingSearch")
              : t("admin.declarationManagement.getStartedByCreating")}
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
          {declarations.map((declaration) => (
            <div
              key={declaration.id}
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "20px",
                position: "relative",
                zIndex: showDropdownMenu === declaration.id ? 50 : 1,
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
                      checked={selectedDeclarationIds.has(declaration.id)}
                      onChange={(e) => toggleSelectedDeclaration(declaration.id, e.target.checked)}
                      style={{ width: 16, height: 16, marginTop: 6, accentColor: "#ec4899" }}
                    />
                  ) : null}
                  {/* Icon */}
                  {declaration.icon && (
                    <span
                      style={{
                        fontSize: "24px",
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      {declaration.icon}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "4px",
                        flexWrap: "wrap",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "16px",
                          fontWeight: "600",
                          color: "#111827",
                          margin: 0,
                        }}
                      >
                        {declaration.name}
                      </h3>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          backgroundColor: declaration.shownInFilter
                            ? "#fce7f3"
                            : "#f3f4f6",
                          border: `1px solid ${declaration.shownInFilter ? "#f9a8d4" : "#d1d5db"}`,
                        }}
                        title={declaration.shownInFilter ? t("admin.declarationManagement.visibleInFilter") : t("admin.declarationManagement.hiddenInFilter")}
                      >
                        {declaration.shownInFilter ? (
                          <Eye style={{ height: "12px", width: "12px", color: "#ec4899" }} />
                        ) : (
                          <EyeOff style={{ height: "12px", width: "12px", color: "#6b7280" }} />
                        )}
                      </span>
                      {declaration.type && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#ec4899",
                            fontWeight: "500",
                          }}
                        >
                          {declaration.type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions Menu */}
                {canManageDeclarationActions && (
                  <div style={{ position: "relative" }}>
                    <button
                      data-dropdown-trigger
                      onClick={() => {
                        setShowDropdownMenu(
                          showDropdownMenu === declaration.id ? null : declaration.id
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

                    {showDropdownMenu === declaration.id && (
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
                        {canUpdateDeclaration && (
                          <button
                            onClick={() => {
                              setSelectedDeclaration(declaration);
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
                            {t("admin.declarationManagement.edit")}
                          </button>
                        )}

                        {isSuperAdmin && (
                          <button
                            onClick={() => {
                              openMoveDeclarations(declaration);
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
                            <ChevronRightIcon style={{ height: "16px", width: "16px" }} />
                            {t("admin.declarationManagement.moveOrganization", {
                              defaultValue: "Move to organization",
                            })}
                          </button>
                        )}

                        {canDeleteDeclaration && (
                          <button
                            onClick={() => {
                              setShowDeleteDialog(declaration.id);
                              setShowDropdownMenu(null);
                            }}
                            disabled={isActionLoading !== null}
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
                              cursor: isActionLoading === null ? "pointer" : "not-allowed",
                              color: "#dc2626",
                              textAlign: "left",
                              opacity: isActionLoading === null ? 1 : 0.6,
                            }}
                            onMouseEnter={(e) => {
                              if (isActionLoading === null) e.currentTarget.style.backgroundColor = "#fef2f2";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <Trash2 style={{ height: "16px", width: "16px" }} />
                            {t("admin.declarationManagement.delete")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              {declaration.description && (
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
                  {declaration.description}
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
                  {declaration._count?.mealDeclarations || 0} {(declaration._count?.mealDeclarations || 0) !== 1 ? t("admin.declarationManagement.mealsPlural") : t("admin.declarationManagement.meals")}
                </span>
                <span>
                  {new Date(declaration.createdAt).toLocaleDateString()}
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
            {t("admin.declarationManagement.showingDeclarations", { count: declarations.length, total: totalCount })}
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
              {t("admin.declarationManagement.pageOf", { current: currentPage, total: totalPages })}
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
      {showDeleteDialog && declarations.find((d) => d.id === showDeleteDialog) && (
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
              {t("admin.declarationManagement.deleteDeclarationTitle")}
            </h3>
            {(() => {
              const declarationToDelete = declarations.find((d) => d.id === showDeleteDialog);
              return (
                <>
                  <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
                    {t("admin.declarationManagement.deleteDeclarationDescription", { name: declarationToDelete?.name })}
                    {declarationToDelete && declarationToDelete._count?.mealDeclarations && declarationToDelete._count.mealDeclarations > 0 && (
                      <span
                        style={{
                          display: "block",
                          marginTop: "8px",
                          color: "#dc2626",
                          fontWeight: "500",
                        }}
                      >
                        {t("admin.declarationManagement.deleteDeclarationWarning", { 
                          count: declarationToDelete._count.mealDeclarations,
                          meal: declarationToDelete._count.mealDeclarations !== 1 ? t("admin.declarationManagement.mealsPlural") : t("admin.declarationManagement.meals")
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
                      {t("admin.declarationManagement.deleteDeclarationCancel")}
                    </button>
                    <button
                      onClick={() => {
                        if (declarationToDelete) {
                          handleDelete(declarationToDelete);
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
                      {isActionLoading === showDeleteDialog ? t("admin.declarationManagement.deleting") : t("admin.declarationManagement.deleteDeclarationConfirm")}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Declaration Form Modal */}
      <DeclarationForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedDeclaration(null);
        }}
        declaration={selectedDeclaration}
        onSuccess={async () => {
          await fetchDeclarations();
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
              {t("admin.declarationManagement.moveOrganization", { defaultValue: "Move to organization" })}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.declarationManagement.targetOrganization", { defaultValue: "Target organization" })}
            </p>

            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.declarationManagement.selectOrganization", { defaultValue: "Select an organization" })}
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
                onClick={handleMoveDeclarations}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: moving ? "#d1d5db" : "#ec4899",
                  color: "#ffffff",
                  cursor: moving ? "not-allowed" : "pointer",
                }}
              >
                {moving ? t("admin.declarationManagement.moving", { defaultValue: "Moving..." }) : t("admin.declarationManagement.move", { defaultValue: "Move" })}
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
              {t("admin.declarationManagement.copySelected", { defaultValue: "Copy selected" })}
            </h3>
            <p style={{ marginTop: 0, marginBottom: "16px", fontSize: "13px", color: "#6b7280" }}>
              {t("admin.declarationManagement.targetOrganization", { defaultValue: "Target organization" })}
            </p>

            <OrganizationSearchSelect
              organizations={organizations}
              value={targetOrganizationId}
              onValueChange={setTargetOrganizationId}
              placeholder={t("admin.declarationManagement.selectOrganization", { defaultValue: "Select an organization" })}
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
                onClick={handleCopyDeclarations}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: copying ? "#d1d5db" : "#111827",
                  color: "#ffffff",
                  cursor: copying ? "not-allowed" : "pointer",
                }}
              >
                {copying ? t("admin.declarationManagement.copying", { defaultValue: "Copying..." }) : t("admin.declarationManagement.copy", { defaultValue: "Copy" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DeclarationManagement;

