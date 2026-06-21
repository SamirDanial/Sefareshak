import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MapPin,
  Plus,
  Search,
  MoreVertical,
  Edit,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import {
  reservationService,
  type Table,
  type TableStatus,
  type TableFormData,
  type Zone,
} from "../services/reservationService";
import branchService, { type Branch } from "../services/branchService";
import SearchableSelect from "../components/SearchableSelect";
import PageHeader from "../components/PageHeader";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const TableManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny, isSuperAdmin, assignedBranchIds } = usePermissions();

  const canCreateTable = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.CREATE }]);
  const canUpdateTable = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.UPDATE }]);
  const canDeleteTable = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.DELETE }]);
  const canToggleTableActive = canAny([{ resource: RESOURCES.TABLES, action: ACTIONS.TOGGLE_ACTIVE }]);

  const canManageTableActions = canUpdateTable || canDeleteTable || canToggleTableActive || isSuperAdmin;

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [openTableMenuId, setOpenTableMenuId] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<string>("");
  const [sortBy, setSortBy] = useState<"tableNumber" | "createdAt">("tableNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [allZonesForFilter, setAllZonesForFilter] = useState<Zone[]>([]);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingZones, setLoadingZones] = useState(false);

  const [orgVersion, setOrgVersion] = useState(0);
  const lastValidBranchIdRef = useRef<string>("");
  const tablesLoadSeqRef = useRef(0);

  const [formData, setFormData] = useState<TableFormData>({
    tableNumber: "",
    capacity: 2,
    branchId: "",
    zoneId: "",
    zone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load branches on mount
  useEffect(() => {
    loadBranches();
  }, [orgVersion]);

  // Staff branch selection logic (match frontend behavior)
  useEffect(() => {
    if (isSuperAdmin) return;
    if (!branches.length) return;

    const hasExplicitBranchAssignments = assignedBranchIds.length > 0;
    if (hasExplicitBranchAssignments) {
      if (!selectedBranchId || !assignedBranchIds.includes(selectedBranchId)) {
        const firstAllowed = assignedBranchIds.find((id) => branches.some((b) => b.id === id));
        if (firstAllowed) {
          setSelectedBranchId(firstAllowed);
        }
      }
      return;
    }

    if (!selectedBranchId && branches[0]?.id) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, assignedBranchIds, selectedBranchId, isSuperAdmin]);

  // Load zones when branch changes
  useEffect(() => {
    if (selectedBranchId) {
      lastValidBranchIdRef.current = selectedBranchId;
      loadZones(selectedBranchId);
      fetchAllZonesForFilter(selectedBranchId);
    } else {
      setAllZonesForFilter([]);
      setAvailableZones([]);
    }
  }, [selectedBranchId]);

  // Load tables when filters/pagination/sort change
  useEffect(() => {
    loadTables();
  }, [
    currentPage,
    debouncedSearchTerm,
    selectedStatus,
    selectedZoneId,
    selectedBranchId,
    selectedActiveStatus,
    sortBy,
    sortOrder,
    orgVersion,
  ]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Org switch reload
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

      tablesLoadSeqRef.current += 1;

      setSearchTerm("");
      setDebouncedSearchTerm("");
      setSelectedStatus("");
      setSelectedZoneId("");
      setSelectedActiveStatus("");
      setSortBy("tableNumber");
      setSortOrder("asc");
      setCurrentPage(1);
      setTables([]);
      setTotalPages(1);
      setTotalCount(0);
      setOpenTableMenuId(null);
      setIsDialogOpen(false);
      setIsDeleteDialogOpen(false);
      setSelectedTable(null);
      setSelectedBranchId("");
      setBranches([]);
      setAllZonesForFilter([]);
      setAvailableZones([]);
      lastValidBranchIdRef.current = "";

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

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetched = await branchService.getBranches(token || undefined);
      setBranches(fetched);

      setSelectedBranchId((prev) => {
        const nextPrev = String(prev || "").trim();
        if (nextPrev && fetched.some((b) => b.id === nextPrev)) return nextPrev;
        return fetched[0]?.id || "";
      });
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async (branchId: string) => {
    if (!branchId) {
      setAvailableZones([]);
      return;
    }
    try {
      setLoadingZones(true);
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAvailableZones(response.zones || []);
    } catch (error) {
      console.error("Error loading zones:", error);
      setAvailableZones([]);
    } finally {
      setLoadingZones(false);
    }
  };

  const fetchAllZonesForFilter = async (branchId?: string) => {
    try {
      if (!branchId) {
        setAllZonesForFilter([]);
        return;
      }
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAllZonesForFilter(response.zones || []);
    } catch (error) {
      console.error("Error fetching zones for filter:", error);
      setAllZonesForFilter([]);
    }
  };

  const loadTables = async () => {
    const seq = ++tablesLoadSeqRef.current;
    const orgAtStart = (() => {
      try {
        return (window.localStorage.getItem(ORG_STORAGE_KEY) || "").trim();
      } catch {
        return "";
      }
    })();

    const effectiveBranchId = selectedBranchId || lastValidBranchIdRef.current;
    if (!effectiveBranchId) {
      setLoading(false);
      setPaginationLoading(false);
      return;
    }

    try {
      if (currentPage === 1) {
        setLoading(true);
      } else {
        setPaginationLoading(true);
      }
      const token = (await getToken()) || undefined;
      const apiSortBy = sortBy === "tableNumber" ? "tableNumber" : sortBy;
      const response = await reservationService.getTables(
        currentPage,
        12,
        apiSortBy,
        sortOrder,
        debouncedSearchTerm || undefined,
        selectedStatus || undefined,
        undefined,
        selectedActiveStatus || undefined,
        effectiveBranchId || undefined,
        selectedZoneId === "__UNASSIGNED__" ? "__UNASSIGNED__" : selectedZoneId || undefined,
        token
      );

      const orgNow = (() => {
        try {
          return (window.localStorage.getItem(ORG_STORAGE_KEY) || "").trim();
        } catch {
          return "";
        }
      })();

      if (seq !== tablesLoadSeqRef.current) return;
      if (orgAtStart !== orgNow) return;

      setTables(response.data || []);
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages);
        setTotalCount(response.pagination.totalCount);
      }
    } catch (error: any) {
      console.error("Error loading tables:", error);
      alert(t("admin.tableManagement.messages.loadError", { defaultValue: "Failed to load tables" }));
    } finally {
      if (seq === tablesLoadSeqRef.current) {
        setLoading(false);
        setPaginationLoading(false);
      }
    }
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status === "all" ? "" : status);
    setCurrentPage(1);
  };

  const handleBranchFilter = (branchId: string) => {
    if (!isSuperAdmin && assignedBranchIds.length > 0 && !assignedBranchIds.includes(branchId)) {
      return;
    }
    setSelectedBranchId(branchId || "");
    setSelectedZoneId("");
    setCurrentPage(1);
  };

  const handleZoneFilter = (zoneId: string) => {
    if (zoneId === "all") {
      setSelectedZoneId("");
    } else if (zoneId === "__UNASSIGNED__") {
      setSelectedZoneId("__UNASSIGNED__");
    } else {
      setSelectedZoneId(zoneId);
    }
    setCurrentPage(1);
  };

  const handleActiveStatusFilter = (activeStatus: string) => {
    setSelectedActiveStatus(activeStatus === "all" ? "" : activeStatus);
    setCurrentPage(1);
  };

  const handleSort = (field: "tableNumber" | "createdAt") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  const handleToggleActive = async (table: Table) => {
    try {
      const token = (await getToken()) || undefined;
      await reservationService.updateTable(table.id, { isActive: !table.isActive }, token);
      alert(t("admin.tableManagement.messages.statusUpdated", { defaultValue: "Status updated" }));
      await loadTables();
    } catch (error: any) {
      console.error("Error updating active status:", error);
      alert(t("admin.tableManagement.messages.statusError", { defaultValue: "Failed to update status" }));
    }
  };

  const handleStatusChange = async (tableId: string, status: TableStatus) => {
    try {
      const token = (await getToken()) || undefined;
      await reservationService.updateTable(tableId, { status }, token);
      alert(t("admin.tableManagement.messages.statusUpdated", { defaultValue: "Status updated" }));
      await loadTables();
    } catch (error: any) {
      console.error("Error updating status:", error);
      alert(t("admin.tableManagement.messages.statusError", { defaultValue: "Failed to update status" }));
    }
  };

  const handleOpenDialog = async (table?: Table) => {
    await loadBranches();
    if (table) {
      setSelectedTable(table);
      setFormData({
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        branchId: table.branchId || "",
        zoneId: table.zoneId || "",
        zone: table.zone || "",
        notes: table.notes || "",
      });
      if (table.branchId) {
        await loadZones(table.branchId);
      }
    } else {
      setSelectedTable(null);
      setFormData({
        tableNumber: "",
        capacity: 2,
        branchId: "",
        zoneId: "",
        zone: "",
        notes: "",
      });
      setAvailableZones([]);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedTable(null);
    setFormData({
      tableNumber: "",
      capacity: 2,
      branchId: "",
      zoneId: "",
      zone: "",
      notes: "",
    });
    setAvailableZones([]);
  };

  const handleBranchChange = async (branchId: string) => {
    setFormData({ ...formData, branchId, zoneId: "" });
    await loadZones(branchId);
  };

  const handleZoneIdChange = (zoneId: string) => {
    setFormData({ ...formData, zoneId: zoneId === "none" ? "" : zoneId });
  };

  const handleSave = async () => {
    if (!formData.tableNumber || !formData.branchId) {
      alert(t("admin.tableManagement.form.validation.required", { defaultValue: "Table number and branch are required" }));
      return;
    }
    if (!formData.zoneId) {
      alert(t("admin.tableManagement.form.validation.zoneRequired", { defaultValue: "Zone is required" }));
      return;
    }
    try {
      setSaving(true);
      const token = (await getToken()) || undefined;
      if (selectedTable) {
        await reservationService.updateTable(selectedTable.id, formData, token);
        alert(t("admin.tableManagement.messages.tableUpdated", { defaultValue: "Table updated" }));
      } else {
        await reservationService.createTable(formData, token);
        alert(t("admin.tableManagement.messages.tableCreated", { defaultValue: "Table created" }));
      }
      await loadTables();
      handleCloseDialog();
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
    } catch (error: any) {
      console.error("Error saving table:", error);
      alert(error?.response?.data?.error || t("admin.tableManagement.messages.saveError", { defaultValue: "Failed to save table" }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTable) return;
    try {
      setDeleting(true);
      const token = (await getToken()) || undefined;
      await reservationService.deleteTable(selectedTable.id, token);
      alert(t("admin.tableManagement.messages.tableDeleted", { defaultValue: "Table deleted" }));
      setIsDeleteDialogOpen(false);
      setSelectedTable(null);
      if (tables.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        await loadTables();
      }
    } catch (error: any) {
      console.error("Error deleting table:", error);
      alert(error?.response?.data?.error || t("admin.tableManagement.messages.deleteError", { defaultValue: "Failed to delete table" }));
    } finally {
      setDeleting(false);
    }
  };

  const getStatusColors = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE":
        return { backgroundColor: "rgba(34, 197, 94, 0.12)", textColor: "#22c55e" };
      case "RESERVED":
        return { backgroundColor: "rgba(251, 191, 36, 0.12)", textColor: "#fbbf24" };
      case "OCCUPIED":
        return { backgroundColor: "rgba(239, 68, 68, 0.12)", textColor: "#ef4444" };
      case "OUT_OF_SERVICE":
        return { backgroundColor: "rgba(107, 114, 128, 0.12)", textColor: "#6b7280" };
      default:
        return { backgroundColor: "rgba(236, 72, 153, 0.12)", textColor: "#ec4899" };
    }
  };

  const formatStatus = (status: TableStatus) => {
    const map: Record<TableStatus, string> = {
      AVAILABLE: t("admin.tableManagement.statuses.available", { defaultValue: "Available" }),
      RESERVED: t("admin.tableManagement.statuses.reserved", { defaultValue: "Reserved" }),
      OCCUPIED: t("admin.tableManagement.statuses.occupied", { defaultValue: "Occupied" }),
      OUT_OF_SERVICE: t("admin.tableManagement.statuses.outOfService", { defaultValue: "Out of Service" }),
    };
    return map[status] || status;
  };

  const getZoneName = (table: Table): string => {
    if (table.zoneRelation && table.zoneRelation.name) {
      return table.zoneRelation.name;
    }
    if (table.zone && typeof table.zone === "string") {
      return table.zone;
    }
    if (table.zoneId) {
      const zone = availableZones.find((z) => z.id === table.zoneId);
      if (zone) return zone.name;
    }
    return t("admin.tableManagement.noZone", { defaultValue: "No Zone" });
  };

  const getZoneId = (table: Table): string => {
    if (table.zoneId) return table.zoneId;
    if (table.zoneRelation && table.zoneRelation.id) {
      return table.zoneRelation.id;
    }
    return getZoneName(table);
  };

  const groupedTables = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const sorted = [...tables].sort((a, b) => {
      const aName = (a.tableNumber || "").trim();
      const bName = (b.tableNumber || "").trim();
      if (sortBy === "createdAt") {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        const cmp = dateA - dateB;
        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
        const byName = collator.compare(aName, bName);
        if (byName !== 0) return byName;
        return a.id.localeCompare(b.id);
      } else {
        const cmp = collator.compare(aName, bName);
        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
        return a.id.localeCompare(b.id);
      }
    });

    const grouped = sorted.reduce((acc, table) => {
      const zoneId = getZoneId(table);
      const zoneName = getZoneName(table);
      if (!acc[zoneId]) {
        acc[zoneId] = { name: zoneName, tables: [] };
      }
      acc[zoneId].tables.push(table);
      return acc;
    }, {} as Record<string, { name: string; tables: Table[] }>);

    const zoneOrder = new Map<string, string>();
    sorted.forEach((table) => {
      const zid = getZoneId(table);
      if (!zoneOrder.has(zid)) {
        zoneOrder.set(zid, getZoneName(table));
      }
    });

    return { groupedTables: grouped, zones: Array.from(zoneOrder.keys()) };
  }, [tables, sortBy, sortOrder, availableZones, t]);

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedStatus !== "" ||
    selectedZoneId !== "" ||
    selectedBranchId !== "" ||
    selectedActiveStatus !== "";

  if (loading && tables.length === 0) {
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
            {t("admin.tableManagement.loadingTitle", { defaultValue: "Loading Tables" })}
          </h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>
            {t("admin.tableManagement.loadingDescription", { defaultValue: "Fetching table data..." })}
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
          title={t("admin.tableManagement.title", { defaultValue: "Table Management" })}
          description={t("admin.tableManagement.description", { defaultValue: "Manage restaurant tables" })}
          actions={
            <>
              <button
                onClick={() => {
                  setCurrentPage(1);
                  loadTables();
                }}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: "500",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <RefreshCw
                  style={{
                    height: "18px",
                    width: "18px",
                    animation: loading ? "spin 1s linear infinite" : undefined,
                  }}
                />
                {t("common.refresh", { defaultValue: "Refresh" })}
              </button>

              {canCreateTable && (
                <button
                  onClick={() => {
                    setSelectedTable(null);
                    setIsDialogOpen(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: "500",
                    border: "none",
                    borderRadius: "10px",
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
                  {t("admin.tableManagement.addNew", { defaultValue: "Add table" })}
                </button>
              )}
            </>
          }
        />
      </div>

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
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
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
              placeholder={t("admin.tableManagement.searchPlaceholder", { defaultValue: "Search tables..." })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                outline: "none",
              }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {/* Branch Filter */}
            <SearchableSelect
              options={[
                { value: "", label: t("admin.tableManagement.selectBranch", { defaultValue: "Select Branch" }) },
                ...branches.map((b) => ({ value: b.id, label: b.name || b.id })),
              ]}
              value={selectedBranchId}
              onChange={(value) => handleBranchFilter(value)}
              disabled={loadingBranches}
              placeholder={t("admin.tableManagement.selectBranch", { defaultValue: "Select Branch" })}
            />

            {/* Status Filter */}
            <SearchableSelect
              options={[
                { value: "all", label: t("admin.tableManagement.allStatus", { defaultValue: "All Status" }) },
                { value: "AVAILABLE", label: t("admin.tableManagement.statuses.available", { defaultValue: "Available" }) },
                { value: "RESERVED", label: t("admin.tableManagement.statuses.reserved", { defaultValue: "Reserved" }) },
                { value: "OCCUPIED", label: t("admin.tableManagement.statuses.occupied", { defaultValue: "Occupied" }) },
                { value: "OUT_OF_SERVICE", label: t("admin.tableManagement.statuses.outOfService", { defaultValue: "Out of Service" }) },
              ]}
              value={selectedStatus || "all"}
              onChange={(value) => handleStatusFilter(value)}
              placeholder={t("admin.tableManagement.allStatus", { defaultValue: "All Status" })}
            />

            {/* Zone Filter */}
            <SearchableSelect
              options={[
                { value: "all", label: t("admin.tableManagement.allZones", { defaultValue: "All Zones" }) },
                { value: "__UNASSIGNED__", label: t("admin.tableManagement.unassigned", { defaultValue: "Unassigned" }) },
                ...allZonesForFilter.map((z) => ({ value: z.id, label: z.name })),
              ]}
              value={selectedZoneId || "all"}
              onChange={(value) => handleZoneFilter(value)}
              disabled={!selectedBranchId}
              placeholder={t("admin.tableManagement.allZones", { defaultValue: "All Zones" })}
              disabledText={t("admin.tableManagement.selectBranchFirst", { defaultValue: "Select Branch First" })}
            />

            {/* Active Status Filter */}
            <SearchableSelect
              options={[
                { value: "all", label: t("admin.tableManagement.allActiveStatus", { defaultValue: "All Active Status" }) },
                { value: "true", label: t("admin.tableManagement.active", { defaultValue: "Active" }) },
                { value: "false", label: t("admin.tableManagement.inactive", { defaultValue: "Inactive" }) },
              ]}
              value={selectedActiveStatus || "all"}
              onChange={(value) => handleActiveStatusFilter(value)}
              placeholder={t("admin.tableManagement.allActiveStatus", { defaultValue: "All Active Status" })}
            />
          </div>

          {/* Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.tableManagement.sortBy", { defaultValue: "Sort by" })}:
            </span>
            <button
              onClick={() => handleSort("tableNumber")}
              style={{
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: sortBy === "tableNumber" ? "#ec4899" : "#ffffff",
                color: sortBy === "tableNumber" ? "#ffffff" : "#111827",
                cursor: "pointer",
              }}
            >
              {t("admin.tableManagement.sortTableNumber", { defaultValue: "Table Number" })}
            </button>
            <button
              onClick={() => handleSort("createdAt")}
              style={{
                padding: "8px 12px",
                fontSize: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: sortBy === "createdAt" ? "#ec4899" : "#ffffff",
                color: sortBy === "createdAt" ? "#ffffff" : "#111827",
                cursor: "pointer",
              }}
            >
              {t("admin.tableManagement.sortDate", { defaultValue: "Date" })}
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {(loading || paginationLoading) && tables.length === 0 && (
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
            {t("admin.tableManagement.loading", { defaultValue: "Loading..." })}
          </h3>
        </div>
      )}

      {/* Empty State */}
      {!loading && tables.length === 0 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          {!selectedBranchId ? (
            <>
              <MapPin style={{ height: "48px", width: "48px", color: "#9ca3af", marginBottom: "16px" }} />
              <p style={{ color: "#6b7280", marginBottom: "8px" }}>
                {t("admin.tableManagement.selectBranchToView", { defaultValue: "Please select a branch to view tables" })}
              </p>
              <p style={{ fontSize: "14px", color: "#9ca3af" }}>
                {t("admin.tableManagement.selectBranchToViewSubtext", { defaultValue: "Choose a branch from the filter above" })}
              </p>
            </>
          ) : hasActiveFilters ? (
            <>
              <p style={{ color: "#6b7280", marginBottom: "16px" }}>
                {t("admin.tableManagement.noResultsFound", { defaultValue: "No results found" })}
              </p>
              <p style={{ fontSize: "14px", color: "#9ca3af" }}>
                {t("admin.tableManagement.noResultsFoundSubtext", { defaultValue: "Try adjusting your filters" })}
              </p>
            </>
          ) : (
            <>
              <p style={{ color: "#6b7280", marginBottom: "16px" }}>
                {t("admin.tableManagement.noTables", { defaultValue: "No tables found" })}
              </p>
              {canCreateTable && (
                <button
                  onClick={() => handleOpenDialog()}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: "500",
                    border: "none",
                    borderRadius: "8px",
                    backgroundColor: "#ec4899",
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <Plus style={{ height: "18px", width: "18px", marginRight: "8px", display: "inline" }} />
                  {t("admin.tableManagement.createFirstTable", { defaultValue: "Create First Table" })}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Tables List Grouped by Zone */}
      {tables.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {paginationLoading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}>
              <RefreshCw style={{ height: "24px", width: "24px", color: "#ec4899", animation: "spin 1s linear infinite" }} />
            </div>
          )}
          {groupedTables.zones.map((zoneId) => {
            const zoneGroup = groupedTables.groupedTables[zoneId];
            if (!zoneGroup) return null;
            return (
              <div
                key={zoneId}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    backgroundColor: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <MapPin style={{ height: "16px", width: "16px", color: "#6b7280" }} />
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>{zoneGroup.name}</span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    {t("admin.tableManagement.tables", { defaultValue: "Tables" })}: {zoneGroup.tables.length}
                  </span>
                </div>
                <div style={{ padding: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                    {zoneGroup.tables.map((table) => {
                      const statusColors = getStatusColors(table.status);
                      return (
                        <div
                          key={table.id}
                          style={{
                            backgroundColor: "#ffffff",
                            border: "1px solid #e5e7eb",
                            borderRadius: "10px",
                            padding: "16px",
                            position: "relative",
                            zIndex: openTableMenuId === table.id ? 50 : 1,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#111827", margin: 0 }}>
                                {table.tableNumber}
                              </h3>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "600",
                                  padding: "2px 8px",
                                  borderRadius: "9999px",
                                  backgroundColor: statusColors.backgroundColor,
                                  color: statusColors.textColor,
                                  border: `1px solid ${statusColors.textColor}`,
                                }}
                              >
                                {formatStatus(table.status)}
                              </span>
                              {!table.isActive && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    padding: "2px 8px",
                                    borderRadius: "9999px",
                                    backgroundColor: "transparent",
                                    color: "#6b7280",
                                    border: "1px solid #6b7280",
                                  }}
                                >
                                  {t("admin.tableManagement.inactive", { defaultValue: "Inactive" })}
                                </span>
                              )}
                            </div>
                            {canManageTableActions && (
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={() => setOpenTableMenuId(openTableMenuId === table.id ? null : table.id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    borderRadius: "6px",
                                    backgroundColor: "transparent",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MoreVertical style={{ height: "16px", width: "16px", color: "#6b7280" }} />
                                </button>
                                {openTableMenuId === table.id && (
                                  <div
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
                                    {canUpdateTable && (
                                      <button
                                        onClick={() => {
                                          setOpenTableMenuId(null);
                                          handleOpenDialog(table);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                          width: "100%",
                                          padding: "8px 12px",
                                          fontSize: "14px",
                                          border: "none",
                                          borderRadius: "6px",
                                          backgroundColor: "transparent",
                                          cursor: "pointer",
                                          textAlign: "left",
                                        }}
                                      >
                                        <Edit style={{ height: "16px", width: "16px" }} />
                                        {t("admin.tableManagement.edit", { defaultValue: "Edit" })}
                                      </button>
                                    )}
                                    {canToggleTableActive && (
                                      <button
                                        onClick={() => {
                                          setOpenTableMenuId(null);
                                          handleToggleActive(table);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                          width: "100%",
                                          padding: "8px 12px",
                                          fontSize: "14px",
                                          border: "none",
                                          borderRadius: "6px",
                                          backgroundColor: "transparent",
                                          cursor: "pointer",
                                          textAlign: "left",
                                        }}
                                      >
                                        {table.isActive ? (
                                          <>
                                            <EyeOff style={{ height: "16px", width: "16px" }} />
                                            {t("admin.tableManagement.inactive", { defaultValue: "Deactivate" })}
                                          </>
                                        ) : (
                                          <>
                                            <Eye style={{ height: "16px", width: "16px" }} />
                                            {t("admin.tableManagement.active", { defaultValue: "Activate" })}
                                          </>
                                        )}
                                      </button>
                                    )}
                                    {canDeleteTable && (
                                      <button
                                        onClick={() => {
                                          setOpenTableMenuId(null);
                                          setSelectedTable(table);
                                          setIsDeleteDialogOpen(true);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                          width: "100%",
                                          padding: "8px 12px",
                                          fontSize: "14px",
                                          border: "none",
                                          borderRadius: "6px",
                                          backgroundColor: "transparent",
                                          cursor: "pointer",
                                          textAlign: "left",
                                          color: "#ef4444",
                                        }}
                                      >
                                        <Trash2 style={{ height: "16px", width: "16px" }} />
                                        {t("admin.tableManagement.delete", { defaultValue: "Delete" })}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "12px", color: "#6b7280" }}>
                            <Users style={{ height: "14px", width: "14px" }} />
                            <span>
                              {t("admin.tableManagement.capacity", { defaultValue: "Capacity" })}: {table.capacity}
                            </span>
                          </div>
                          {table.notes && (
                            <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 8px 0" }}>{table.notes}</p>
                          )}
                          <div style={{ paddingTop: "8px", borderTop: "1px solid #e5e7eb" }}>
                            <SearchableSelect
                              options={[
                                { value: "AVAILABLE", label: t("admin.tableManagement.statuses.available", { defaultValue: "Available" }) },
                                { value: "RESERVED", label: `${t("admin.tableManagement.statuses.reserved", { defaultValue: "Reserved" })} (${t("admin.tableManagement.statuses.reservedNote", { defaultValue: "via reservation" })})`, disabled: true },
                                { value: "OCCUPIED", label: t("admin.tableManagement.statuses.occupied", { defaultValue: "Occupied" }) },
                                { value: "OUT_OF_SERVICE", label: t("admin.tableManagement.statuses.outOfService", { defaultValue: "Out of Service" }) },
                              ]}
                              value={table.status}
                              onChange={(value) => handleStatusChange(table.id, value as TableStatus)}
                              disabled={!canUpdateTable}
                              placeholder={t("admin.tableManagement.selectStatus", { defaultValue: "Select Status" })}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "16px",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                {t("admin.tableManagement.pagination", { defaultValue: "Showing {{current}} of {{total}}", current: tables.length, total: totalCount })}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1 || paginationLoading}
                  style={{
                    padding: "8px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#ffffff",
                    cursor: currentPage === 1 || paginationLoading ? "not-allowed" : "pointer",
                    opacity: currentPage === 1 || paginationLoading ? 0.5 : 1,
                  }}
                >
                  <ChevronLeft style={{ height: "16px", width: "16px" }} />
                </button>
                <span style={{ fontSize: "14px", fontWeight: "500", padding: "0 16px" }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages || paginationLoading}
                  style={{
                    padding: "8px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#ffffff",
                    cursor: currentPage === totalPages || paginationLoading ? "not-allowed" : "pointer",
                    opacity: currentPage === totalPages || paginationLoading ? 0.5 : 1,
                  }}
                >
                  <ChevronRight style={{ height: "16px", width: "16px" }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
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
          }}
          onClick={handleCloseDialog}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "500px",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#111827", margin: "0 0 16px 0" }}>
              {selectedTable
                ? t("admin.tableManagement.dialog.editTable", { defaultValue: "Edit Table" })
                : t("admin.tableManagement.dialog.createTable", { defaultValue: "Create Table" })}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "4px" }}>
                  {t("admin.tableManagement.form.tableNumber", { defaultValue: "Table Number" })}
                </label>
                <input
                  type="text"
                  value={formData.tableNumber}
                  onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
                  placeholder={t("admin.tableManagement.form.tableNumberPlaceholder", { defaultValue: "e.g., T1, Table 1" })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "4px" }}>
                  {t("admin.tableManagement.form.capacity", { defaultValue: "Capacity" })}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formData.capacity > 0 ? formData.capacity.toString() : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^\d+$/.test(value)) {
                      if (value === "") {
                        setFormData({ ...formData, capacity: 0 });
                      } else {
                        const numValue = Number(value);
                        if (numValue >= 1 && numValue <= 50) {
                          setFormData({ ...formData, capacity: numValue });
                        }
                      }
                    }
                  }}
                  placeholder={t("admin.tableManagement.form.capacityPlaceholder", { defaultValue: "2" })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                  {t("admin.tableManagement.form.capacityHint", { defaultValue: "Max 50 guests" })}
                </p>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "4px" }}>
                  {t("admin.tableManagement.form.branch", { defaultValue: "Branch" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <SearchableSelect
                  options={[
                    { value: "", label: t("admin.tableManagement.form.selectBranch", { defaultValue: "Select Branch" }) },
                    ...branches.map((b) => ({ value: b.id, label: b.name || b.id })),
                  ]}
                  value={formData.branchId || ""}
                  onChange={(value) => handleBranchChange(value)}
                  disabled={loadingBranches}
                  placeholder={t("admin.tableManagement.form.selectBranch", { defaultValue: "Select Branch" })}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "4px" }}>
                  {t("admin.tableManagement.form.zone", { defaultValue: "Zone" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <SearchableSelect
                  options={[
                    { value: "none", label: t("admin.tableManagement.form.selectZone", { defaultValue: "Select Zone" }) },
                    ...availableZones.map((z) => ({ value: z.id, label: z.name })),
                  ]}
                  value={formData.zoneId || "none"}
                  onChange={(value) => handleZoneIdChange(value)}
                  disabled={!formData.branchId || loadingZones}
                  placeholder={t("admin.tableManagement.form.selectZone", { defaultValue: "Select Zone" })}
                  disabledText={t("admin.tableManagement.form.selectBranchFirst", { defaultValue: "Select a branch first" })}
                />
                {!formData.branchId && (
                  <p style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0 0" }}>
                    {t("admin.tableManagement.form.selectBranchFirst", { defaultValue: "Select a branch first" })}
                  </p>
                )}
              </div>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#111827", marginBottom: "4px" }}>
                  {t("admin.tableManagement.form.notes", { defaultValue: "Notes" })}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("admin.tableManagement.form.notesPlaceholder", { defaultValue: "Optional notes about this table" })}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
                <button
                  onClick={handleCloseDialog}
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: "500",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#ffffff",
                    color: "#111827",
                    cursor: "pointer",
                  }}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
                {((selectedTable && canUpdateTable) || (!selectedTable && canCreateTable)) && (
                  <button
                    onClick={handleSave}
                    disabled={saving || !formData.tableNumber || !formData.branchId || !formData.zoneId}
                    style={{
                      padding: "10px 16px",
                      fontSize: "14px",
                      fontWeight: "500",
                      border: "none",
                      borderRadius: "8px",
                      backgroundColor: "#ec4899",
                      color: "#ffffff",
                      cursor: saving || !formData.tableNumber || !formData.branchId || !formData.zoneId ? "not-allowed" : "pointer",
                      opacity: saving || !formData.tableNumber || !formData.branchId || !formData.zoneId ? 0.7 : 1,
                    }}
                  >
                    {saving ? (
                      <>
                        <RefreshCw style={{ height: "16px", width: "16px", marginRight: "8px", display: "inline", animation: "spin 1s linear infinite" }} />
                        {t("common.saving", { defaultValue: "Saving..." })}
                      </>
                    ) : (
                      t("common.save", { defaultValue: "Save" })
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {isDeleteDialogOpen && (
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
          }}
          onClick={() => {
            setIsDeleteDialogOpen(false);
            setSelectedTable(null);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "400px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#111827", margin: "0 0 16px 0" }}>
              {t("admin.tableManagement.deleteDialog.title", { defaultValue: "Delete Table" })}
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 24px 0" }}>
              {t("admin.tableManagement.deleteDialog.description", {
                defaultValue: 'Are you sure you want to delete "{{tableNumber}}"? This action cannot be undone.',
                tableNumber: selectedTable?.tableNumber,
              })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setSelectedTable(null);
                }}
                style={{
                  padding: "10px 16px",
                  fontSize: "14px",
                  fontWeight: "500",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  cursor: "pointer",
                }}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              {canDeleteTable && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    fontWeight: "500",
                    border: "none",
                    borderRadius: "8px",
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    cursor: deleting ? "not-allowed" : "pointer",
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? (
                    <>
                      <RefreshCw style={{ height: "16px", width: "16px", marginRight: "8px", display: "inline", animation: "spin 1s linear infinite" }} />
                      {t("common.deleting", { defaultValue: "Deleting..." })}
                    </>
                  ) : (
                    t("common.delete", { defaultValue: "Delete" })
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableManagement;
