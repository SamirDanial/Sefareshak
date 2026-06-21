import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@mdi/react";
import {
  mdiPlus,
  mdiPencil,
  mdiDelete,
  mdiRefresh,
  mdiMapMarker,
  mdiAccountGroup,
  mdiChevronLeft,
  mdiChevronRight,
  mdiMagnify,
  mdiSort,
  mdiOfficeBuilding,
  mdiDotsVertical,
  mdiEye,
  mdiEyeOff,
} from "@mdi/js";
import {
  reservationService,
  type Table,
  type TableFormData,
  type TableStatus,
  type Zone,
} from "@/services/reservationService";
import branchService, { type Branch } from "@/services/branchService";
import { toast } from "sonner";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

const TableManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { assignedBranchIds, canAny, isSuperAdmin } = usePermissions();

  const canCreateTable = canAny([
    { resource: RESOURCES.TABLES, action: ACTIONS.CREATE },
  ]);
  const canUpdateTable = canAny([
    { resource: RESOURCES.TABLES, action: ACTIONS.UPDATE },
  ]);
  const canDeleteTable = canAny([
    { resource: RESOURCES.TABLES, action: ACTIONS.DELETE },
  ]);
  const canToggleTableActive = canAny([
    { resource: RESOURCES.TABLES, action: ACTIONS.TOGGLE_ACTIVE },
  ]);

  const canManageTableActions =
    canUpdateTable || canDeleteTable || canToggleTableActive || isSuperAdmin;
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openTableMenuId, setOpenTableMenuId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<string>("");
  const [sortBy, setSortBy] = useState<"tableNumber" | "tableName" | "createdAt">("tableNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [allZonesForFilter, setAllZonesForFilter] = useState<Zone[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingZones, setLoadingZones] = useState(false);

  const lastValidBranchIdRef = useRef<string>("");

  useEffect(() => {
    loadBranches();
    // Don't load tables initially - wait for branch selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selectedBranchId stable and valid for staff users.
  // If staff has explicit branch assignments, always select an allowed branch.
  useEffect(() => {
    if (isSuperAdmin) return;
    if (!branches.length) return;

    const hasExplicitBranchAssignments = assignedBranchIds.length > 0;
    if (hasExplicitBranchAssignments) {
      // If current selection is missing or invalid, pick the first allowed branch that exists.
      if (!selectedBranchId || !assignedBranchIds.includes(selectedBranchId)) {
        const firstAllowed = assignedBranchIds.find((id) => branches.some((b) => b.id === id));
        if (firstAllowed) {
          setSelectedBranchId(firstAllowed);
        }
      }
      return;
    }

    // If no explicit assignments, but staff is not superadmin, pick the first branch.
    if (!selectedBranchId && branches[0]?.id) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, assignedBranchIds, selectedBranchId, isSuperAdmin]);

  useEffect(() => {
    if (selectedBranchId) {
      lastValidBranchIdRef.current = selectedBranchId;
      loadZones(selectedBranchId);
      fetchAllZonesForFilter(selectedBranchId);
    } else {
      setAllZonesForFilter([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  useEffect(() => {
    if (
      (selectedStatus !== "" || selectedZoneId !== "" || selectedBranchId !== "" || selectedActiveStatus !== "") &&
      currentPage === 1
    ) {
      setFiltersLoading(true);
    }
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, selectedStatus, selectedZoneId, selectedBranchId, selectedActiveStatus, sortBy, sortOrder]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadTables();
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const fetchAllZonesForFilter = async (branchId?: string) => {
    try {
      if (!branchId) {
        setAllZonesForFilter([]);
        return;
      }
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(branchId, token);
      setAllZonesForFilter(response.zones);
    } catch (error) {
      console.error("Error fetching zones for filter:", error);
      setAllZonesForFilter([]);
    }
  };

  const loadTables = async () => {
    // Don't clear existing tables if branch becomes temporarily empty during permission hydration.
    // Use the last valid branch to avoid flicker.
    const effectiveBranchId = selectedBranchId || lastValidBranchIdRef.current;
    if (!effectiveBranchId) {
      setLoading(false);
      setPaginationLoading(false);
      setFiltersLoading(false);
      return;
    }

    try {
      if (currentPage === 1) {
      setLoading(true);
      } else {
        setPaginationLoading(true);
      }
      const token = (await getToken()) || undefined;
      const apiSortBy = sortBy === "tableName" ? "tableNumber" : sortBy;
      const response = await reservationService.getTables(
        currentPage,
        12,
        apiSortBy,
        sortOrder,
        searchTerm || undefined,
        selectedStatus || undefined,
        undefined, // Legacy zone string filter - not used anymore
        selectedActiveStatus || undefined,
        effectiveBranchId || undefined,
        selectedZoneId === "__UNASSIGNED__" ? "__UNASSIGNED__" : selectedZoneId || undefined,
        token
      );
      setTables(response.data || []);
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages);
        setTotalCount(response.pagination.totalCount);
      }
    } catch (error: any) {
      console.error("Error loading tables:", error);
      toast.error(t("admin.tableManagement.messages.loadError"));
    } finally {
      setLoading(false);
      setPaginationLoading(false);
      setFiltersLoading(false);
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
    setSelectedZoneId(""); // Reset zone filter when branch changes
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

  const handleSort = (field: "tableNumber" | "tableName" | "createdAt") => {
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
      toast.success(t("admin.tableManagement.messages.statusUpdated"));
      await loadTables();
    } catch (error: any) {
      console.error("Error updating active status:", error);
      toast.error(t("admin.tableManagement.messages.statusError"));
    }
  };

  const hasActiveFilters = searchTerm !== "" || selectedStatus !== "" || selectedZoneId !== "" || selectedBranchId !== "" || selectedActiveStatus !== "";

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetchedBranches = await branchService.getBranches(token || undefined);
      setBranches(fetchedBranches);

      // Default to assigned branch (EMPLOYEE/WAITER) when exactly one; otherwise fall back to single-branch org
      if (!selectedBranchId && assignedBranchIds.length === 1) {
        const candidate = assignedBranchIds[0];
        const exists = fetchedBranches.some((b) => b.id === candidate);
        if (candidate && exists) {
          setSelectedBranchId(candidate);
        }
      } else if (!selectedBranchId && fetchedBranches.length === 1 && fetchedBranches[0]?.id) {
        setSelectedBranchId(fetchedBranches[0].id);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
      toast.error(t("admin.tableManagement.errors.loadBranches") || "Failed to load branches");
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
      setAvailableZones(response.zones);
    } catch (error) {
      console.error("Error loading zones:", error);
      setAvailableZones([]);
    } finally {
      setLoadingZones(false);
    }
  };

  const handleOpenDialog = async (table?: Table) => {
    // Load branches when dialog opens
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
      // Load zones for the table's branch
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
    setFormData({ ...formData, branchId, zoneId: "" }); // Clear zone when branch changes
    await loadZones(branchId);
  };

  const handleZoneIdChange = (zoneId: string) => {
    setFormData({ ...formData, zoneId: zoneId === "none" ? "" : zoneId });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = (await getToken()) || undefined;

      if (selectedTable) {
        await reservationService.updateTable(selectedTable.id, formData, token);
        toast.success(t("admin.tableManagement.messages.tableUpdated"));
      } else {
        await reservationService.createTable(formData, token);
        toast.success(t("admin.tableManagement.messages.tableCreated"));
      }

      await loadTables();
      handleCloseDialog();
      // Reset to first page if we're not on it
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
    } catch (error: any) {
      console.error("Error saving table:", error);
      toast.error(
        error.response?.data?.error || t("admin.tableManagement.messages.saveError")
      );
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
      toast.success(t("admin.tableManagement.messages.tableDeleted"));
      setIsDeleteDialogOpen(false);
      setSelectedTable(null);
      
      // If we deleted the last item on the page and it's not page 1, go to previous page
      if (tables.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
        // loadTables will be called automatically by useEffect when currentPage changes
      } else {
        await loadTables();
      }
    } catch (error: any) {
      console.error("Error deleting table:", error);
      toast.error(
        error.response?.data?.error || t("admin.tableManagement.messages.deleteError")
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (tableId: string, status: TableStatus) => {
    try {
      const token = (await getToken()) || undefined;
      await reservationService.updateTable(tableId, { status }, token);
      toast.success(t("admin.tableManagement.messages.statusUpdated"));
      await loadTables();
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error(t("admin.tableManagement.messages.statusError"));
    }
  };

  const getStatusColors = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE":
        return {
          backgroundColor: "rgba(34, 197, 94, 0.12)", // Green
          textColor: "#22c55e",
        };
      case "RESERVED":
        return {
          backgroundColor: "rgba(251, 191, 36, 0.12)", // Yellow/Amber
          textColor: "#fbbf24",
        };
      case "OCCUPIED":
        return {
          backgroundColor: "rgba(239, 68, 68, 0.12)", // Red
          textColor: "#ef4444",
        };
      case "OUT_OF_SERVICE":
        return {
          backgroundColor: "rgba(107, 114, 128, 0.12)", // Gray
          textColor: "#6b7280",
        };
      default:
        return {
          backgroundColor: "rgba(236, 72, 153, 0.12)", // Pink (fallback)
          textColor: "#ec4899",
        };
    }
  };

  const formatStatus = (status: TableStatus) => {
    const statusMap: Record<TableStatus, { label: string }> = {
      AVAILABLE: { label: t("admin.tableManagement.statuses.available") },
      RESERVED: { label: t("admin.tableManagement.statuses.reserved") },
      OCCUPIED: { label: t("admin.tableManagement.statuses.occupied") },
      OUT_OF_SERVICE: { label: t("admin.tableManagement.statuses.outOfService") },
    };
    return statusMap[status] || { label: status };
  };

  // Helper function to get zone name from table
  const getZoneName = (table: Table): string => {
    // Check if zoneRelation exists (from Zone Management)
    if (table.zoneRelation && table.zoneRelation.name) {
      return table.zoneRelation.name;
    }
    // Fallback to legacy zone string
    if (table.zone && typeof table.zone === 'string') {
      return table.zone;
    }
    // If we have zoneId but no zone relation, try to find it in availableZones
    if (table.zoneId) {
      const zone = availableZones.find(z => z.id === table.zoneId);
      if (zone) return zone.name;
    }
    return t("admin.tableManagement.noZone");
  };

  // Helper function to get zone ID for grouping
  const getZoneId = (table: Table): string => {
    if (table.zoneId) return table.zoneId;
    // If zoneRelation exists, use its id
    if (table.zoneRelation && table.zoneRelation.id) {
      return table.zoneRelation.id;
    }
    // Fallback: use zone name as key for legacy zones
    return getZoneName(table);
  };

  // Sort and group tables by zone (using zoneId from Zone Management)
  const { groupedTables, zones } = React.useMemo(() => {
    const tableNameCollator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });

    const extractFirstNumber = (value: string): number | null => {
      const match = value.match(/\d+/);
      if (!match) return null;
      const num = Number(match[0]);
      return Number.isFinite(num) ? num : null;
    };

    // First, sort all tables based on the selected sort field
    const sortedTables = [...tables].sort((a, b) => {
      const aName = (a.tableNumber || "").trim();
      const bName = (b.tableNumber || "").trim();

      if (sortBy === "createdAt") {
        // Sort by creation date
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        const cmp = dateA - dateB;
        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;

        // Tie-breaker: stable by name then id
        const byName = tableNameCollator.compare(aName, bName);
        if (byName !== 0) return byName;
        return a.id.localeCompare(b.id);
      } else if (sortBy === "tableName") {
        // Natural alphanumeric sort (e.g. Tbl 1, Tbl 2, Tbl 10, Test)
        const cmp = tableNameCollator.compare(aName, bName);
        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;

        // Tie-breaker: id
        return a.id.localeCompare(b.id);
      } else {
        // Sort by table number meaning: primarily the first numeric value in the label
        // Examples:
        // - "Tbl 2" < "Tbl 10"
        // - "Tbl 2" < "Test" (numbers first), but ties are broken by name
        const aNum = extractFirstNumber(aName);
        const bNum = extractFirstNumber(bName);

        if (aNum !== null && bNum !== null && aNum !== bNum) {
          const cmp = aNum - bNum;
          return sortOrder === "asc" ? cmp : -cmp;
        }

        if (aNum !== null && bNum === null) {
          return sortOrder === "asc" ? -1 : 1;
        }

        if (aNum === null && bNum !== null) {
          return sortOrder === "asc" ? 1 : -1;
        }

        // Fallback: natural name compare, then id
        const byName = tableNameCollator.compare(aName, bName);
        if (byName !== 0) return sortOrder === "asc" ? byName : -byName;
        return a.id.localeCompare(b.id);
      }
    });

    // Then group by zoneId, maintaining the sort order within each group
    const grouped = sortedTables.reduce((acc, table) => {
      const zoneId = getZoneId(table);
      const zoneName = getZoneName(table);
      // Use zoneId as key, but store zone name for display
      if (!acc[zoneId]) {
        acc[zoneId] = {
          name: zoneName,
          tables: []
        };
      }
      acc[zoneId].tables.push(table);
      return acc;
    }, {} as Record<string, { name: string; tables: Table[] }>);

    // Zones appear in the order of their first table in the sorted list
    const zoneSet = new Map<string, string>(); // zoneId -> zoneName
    sortedTables.forEach((table) => {
      const zoneId = getZoneId(table);
      if (!zoneSet.has(zoneId)) {
        zoneSet.set(zoneId, getZoneName(table));
      }
    });
    const zoneOrder = Array.from(zoneSet.keys());

    return { groupedTables: grouped, zones: zoneOrder };
  }, [tables, sortBy, sortOrder, t, availableZones]);
  

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.tableManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.tableManagement.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setCurrentPage(1);
              loadTables();
            }}
            variant="outline"
            size="sm"
            disabled={loading}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
          >
            <Icon path={mdiRefresh} size={0.67} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("admin.tableManagement.refresh")}
          </Button>
          {canCreateTable && (
            <Button
              onClick={() => handleOpenDialog()}
              size="sm"
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.tableManagement.addTable")}
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("admin.tableManagement.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-transparent text-foreground border-border"
                />
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Branch Filter */}
                <Select value={selectedBranchId || ""} onValueChange={handleBranchFilter}>
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={t("admin.tableManagement.selectBranch") || "Select a branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select value={selectedStatus || "all"} onValueChange={handleStatusFilter}>
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={t("admin.tableManagement.allStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.tableManagement.allStatus")}</SelectItem>
                    <SelectItem value="AVAILABLE">{t("admin.tableManagement.statuses.available")}</SelectItem>
                    <SelectItem value="RESERVED">{t("admin.tableManagement.statuses.reserved")}</SelectItem>
                    <SelectItem value="OCCUPIED">{t("admin.tableManagement.statuses.occupied")}</SelectItem>
                    <SelectItem value="OUT_OF_SERVICE">{t("admin.tableManagement.statuses.outOfService")}</SelectItem>
                  </SelectContent>
                </Select>

                {/* Zone Filter */}
                <Select 
                  value={selectedZoneId || "all"} 
                  onValueChange={handleZoneFilter}
                  disabled={!selectedBranchId}
                >
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={selectedBranchId ? (t("admin.tableManagement.allZones")) : (t("admin.tableManagement.selectBranchFirst") || "Select Branch First")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.tableManagement.allZones")}</SelectItem>
                    <SelectItem value="__UNASSIGNED__">{t("admin.tableManagement.unassigned")}</SelectItem>
                    {allZonesForFilter.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Active Status Filter */}
                <Select value={selectedActiveStatus || "all"} onValueChange={handleActiveStatusFilter}>
                  <SelectTrigger className="bg-transparent text-foreground border-border">
                    <SelectValue placeholder={t("admin.tableManagement.allActiveStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.tableManagement.allActiveStatus")}</SelectItem>
                    <SelectItem value="true">{t("admin.tableManagement.active")}</SelectItem>
                    <SelectItem value="false">{t("admin.tableManagement.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{t("admin.tableManagement.sortBy")}:</span>
                <Button
                  size="sm"
                  onClick={() => handleSort("tableName")}
                  className={sortBy === "tableName" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  {t("admin.tableManagement.sortTableName") || "Table Name"}
                  {sortBy === "tableName" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("tableNumber")}
                  className={sortBy === "tableNumber" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  {t("admin.tableManagement.sortTableNumber")}
                  {sortBy === "tableNumber" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSort("createdAt")}
                  className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
                >
                  {t("admin.tableManagement.sortDate")}
                  {sortBy === "createdAt" && (
                    <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      {loading || filtersLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.tableManagement.loading")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.tableManagement.loadingDescription")}
            </p>
          </div>
        </div>
      ) : tables.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {!selectedBranchId ? (
              <>
                <Icon path={mdiOfficeBuilding} size={2.00} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-2">{t("admin.tableManagement.selectBranchToView") || "Please select a branch to view tables"}</p>
                <p className="text-sm text-muted-foreground">{t("admin.tableManagement.selectBranchToViewSubtext") || "Choose a branch from the filter above to see its tables"}</p>
              </>
            ) : hasActiveFilters ? (
              <>
                <p className="text-muted-foreground mb-4">{t("admin.tableManagement.noResultsFound") || "No results found"}</p>
                <p className="text-sm text-muted-foreground mb-4">{t("admin.tableManagement.noResultsFoundSubtext") || "Try adjusting your filters"}</p>
              </>
            ) : (
              <>
            <p className="text-muted-foreground mb-4">{t("admin.tableManagement.noTables")}</p>
            {canCreateTable && (
              <Button onClick={() => handleOpenDialog()}>
                <Icon path={mdiPlus} size={0.67} className="mr-2" />
                {t("admin.tableManagement.createFirstTable")}
              </Button>
            )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {paginationLoading && (
            <div className="flex items-center justify-center py-4">
              <Icon path={mdiRefresh} size={1.00} className="animate-spin text-pink-500" />
            </div>
          )}
          {zones.map((zoneId) => {
            const zoneGroup = groupedTables[zoneId];
            if (!zoneGroup) return null;
            return (
              <Card key={zoneId}>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-1.5">
                      <Icon path={mdiMapMarker} size={0.50} />
                      {zoneGroup.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-semibold text-xs">
                        {t("admin.tableManagement.tables") || "Tables"}: {zoneGroup.tables.length}
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {zoneGroup.tables.map((table) => {
                    const statusInfo = formatStatus(table.status);
                    const statusColors = getStatusColors(table.status);
                    return (
                      <Card key={table.id} className="relative">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <h3 className="font-semibold text-sm truncate">
                                {table.tableNumber}
                              </h3>
                              <Badge
                                style={{
                                  backgroundColor: statusColors.backgroundColor,
                                  color: statusColors.textColor,
                                  borderColor: statusColors.textColor,
                                }}
                                className="border text-[10px] px-1.5 py-0 h-4 shrink-0"
                              >
                                  {statusInfo.label}
                                </Badge>
                                {!table.isActive && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">{t("admin.tableManagement.statuses.inactive")}</Badge>
                                )}
                            </div>
                            {canManageTableActions && (
                              <div className="flex gap-0.5 shrink-0">
                                <DropdownMenu
                                  open={openTableMenuId === table.id}
                                  onOpenChange={(open) => {
                                    setOpenTableMenuId(open ? table.id : null);
                                  }}
                                >
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 touch-manipulation relative z-10 pointer-events-auto"
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                      }}
                                      onClick={() => {
                                        setOpenTableMenuId((prev) =>
                                          prev === table.id ? null : table.id
                                        );
                                      }}
                                    >
                                      <Icon path={mdiDotsVertical} size={0.50} />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {canUpdateTable && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setOpenTableMenuId(null);
                                          handleOpenDialog(table);
                                        }}
                                      >
                                        <Icon path={mdiPencil} size={0.67} className="mr-2" />
                                        {t("admin.tableManagement.dialog.editTable")}
                                      </DropdownMenuItem>
                                    )}
                                    {canToggleTableActive && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setOpenTableMenuId(null);
                                          handleToggleActive(table);
                                        }}
                                      >
                                        {table.isActive ? (
                                          <>
                                            <Icon path={mdiEyeOff} size={0.67} className="mr-2" />
                                            {t("admin.tableManagement.inactive")}
                                          </>
                                        ) : (
                                          <>
                                            <Icon path={mdiEye} size={0.67} className="mr-2" />
                                            {t("admin.tableManagement.active")}
                                          </>
                                        )}
                                      </DropdownMenuItem>
                                    )}
                                    {canDeleteTable && (
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setOpenTableMenuId(null);
                                          setSelectedTable(table);
                                          setIsDeleteDialogOpen(true);
                                        }}
                                        className="text-destructive"
                                      >
                                        <Icon path={mdiDelete} size={0.67} className="mr-2" />
                                        {t("admin.tableManagement.deleteDialog.confirm")}
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-1 text-[11px] text-muted-foreground mb-1.5">
                            <div className="flex items-center gap-1">
                              <Icon path={mdiAccountGroup} size={0.50} className="shrink-0" />
                              <span>{t("admin.tableManagement.tableInfo.capacity", { count: table.capacity })}</span>
                            </div>
                            {table.notes && (
                              <span className="truncate md:before:content-['•'] md:before:mr-1">{table.notes}</span>
                            )}
                          </div>
                          <div className="pt-1.5 border-t">
                            <Select
                              value={table.status}
                              onValueChange={(value) =>
                                handleStatusChange(table.id, value as TableStatus)
                              }
                              disabled={!canUpdateTable}
                            >
                              <SelectTrigger className="h-6 text-[11px] py-0 bg-transparent text-foreground border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="AVAILABLE">
                                  {t("admin.tableManagement.statuses.available")}
                                </SelectItem>
                                <SelectItem value="RESERVED" disabled>
                                  {t("admin.tableManagement.statuses.reserved")} {t("admin.tableManagement.statuses.reservedNote") || "(via reservation)"}
                                </SelectItem>
                                <SelectItem value="OCCUPIED">{t("admin.tableManagement.statuses.occupied")}</SelectItem>
                                <SelectItem value="OUT_OF_SERVICE">
                                  {t("admin.tableManagement.statuses.outOfService")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            );
          })}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.tableManagement.pagination", { current: tables.length, total: totalCount })}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1 || paginationLoading}
                      className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 disabled:opacity-50"
                    >
                      <Icon path={mdiChevronLeft} size={0.67} />
                    </Button>
                    <span className="text-sm font-medium px-4">
                      {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages || paginationLoading}
                      className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 disabled:opacity-50"
                    >
                      <Icon path={mdiChevronRight} size={0.67} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {selectedTable ? t("admin.tableManagement.dialog.editTable") : t("admin.tableManagement.dialog.createTable")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedTable
                ? t("admin.tableManagement.dialog.editDescription")
                : t("admin.tableManagement.dialog.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tableNumber" className="text-foreground">{t("admin.tableManagement.form.tableNumber")}</Label>
              <Input
                id="tableNumber"
                value={formData.tableNumber}
                onChange={(e) =>
                  setFormData({ ...formData, tableNumber: e.target.value })
                }
                placeholder={t("admin.tableManagement.form.tableNumberPlaceholder")}
                className="bg-transparent text-foreground border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity" className="text-foreground">{t("admin.tableManagement.form.capacity")}</Label>
              <Input
                id="capacity"
                type="text"
                inputMode="numeric"
                value={formData.capacity > 0 ? formData.capacity.toString() : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow numbers
                  if (value === "" || /^\d+$/.test(value)) {
                    if (value === "") {
                      setFormData({
                        ...formData,
                        capacity: 0,
                      });
                    } else {
                      const numValue = Number(value);
                      if (numValue >= 1 && numValue <= 50) {
                        setFormData({
                          ...formData,
                          capacity: numValue,
                        });
                      }
                    }
                  }
                }}
                placeholder={t("admin.tableManagement.form.capacityPlaceholder")}
                className="bg-transparent text-foreground border-border"
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.tableManagement.form.capacityHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId" className="text-foreground">
                {t("admin.tableManagement.form.branch")} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.branchId || ""}
                onValueChange={handleBranchChange}
                disabled={loadingBranches}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={t("admin.tableManagement.form.selectBranch")} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoneId" className="text-foreground">
                {t("admin.tableManagement.form.zone")}
              </Label>
              <Select
                value={formData.zoneId || "none"}
                onValueChange={handleZoneIdChange}
                disabled={!formData.branchId || loadingZones}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border">
                  <SelectValue placeholder={formData.branchId ? t("admin.tableManagement.form.selectZone") : t("admin.tableManagement.form.selectBranchFirst")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("admin.tableManagement.noZone")}</SelectItem>
                  {availableZones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!formData.branchId && (
                <p className="text-xs text-muted-foreground">
                  {t("admin.tableManagement.form.selectBranchFirst")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-foreground">{t("admin.tableManagement.form.notes")}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder={t("admin.tableManagement.form.notesPlaceholder")}
                rows={3}
                className="bg-transparent text-foreground border-border"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleCloseDialog} className="bg-transparent hover:bg-muted text-foreground border border-border">
                {t("admin.tableManagement.actions.cancel")}
              </Button>
              {((selectedTable && canUpdateTable) || (!selectedTable && canCreateTable)) && (
                <Button 
                  onClick={handleSave} 
                  disabled={saving || !formData.tableNumber || !formData.branchId}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                >
                  {saving ? (
                    <>
                      <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                      {t("admin.tableManagement.actions.saving")}
                    </>
                  ) : (
                    t("admin.tableManagement.actions.save")
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.tableManagement.deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("admin.tableManagement.deleteDialog.description", { tableNumber: selectedTable?.tableNumber })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedTable(null);
              }}
              className="bg-transparent hover:bg-muted text-foreground border border-border"
            >
              {t("admin.tableManagement.deleteDialog.cancel")}
            </Button>
            {canDeleteTable && (
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                    {t("admin.tableManagement.actions.deleting")}
                  </>
                ) : (
                  t("admin.tableManagement.deleteDialog.confirm")
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableManagement;

