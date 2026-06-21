import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Pencil,
  RefreshCw,
  MapPin,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ACTIONS, RESOURCES } from "../lib/permissions";
import branchService, { type Branch } from "../services/branchService";
import {
  reservationService,
  type Zone,
  type ZoneFormData,
  type FloorElement,
} from "../services/reservationService";
import SearchableSelect from "../components/SearchableSelect";
import { FloorPlanEditor } from "../components/FloorPlanEditor";

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const ZoneManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { can, isSuperAdmin, assignedBranchIds } = usePermissions();

  const canViewZones = can(RESOURCES.ZONES, ACTIONS.VIEW);
  const canCreateZone = can(RESOURCES.ZONES, ACTIONS.CREATE);
  const canUpdateZone = can(RESOURCES.ZONES, ACTIONS.UPDATE);
  const canDeleteZone = can(RESOURCES.ZONES, ACTIONS.DELETE);
  const canViewFloorPlan = can(RESOURCES.ZONES, ACTIONS.VIEW_FLOOR_PLAN);
  const canEditFloorPlan = can(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(false);

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const isBusy = loading || loadingBranches || searchLoading;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "capacity">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [openZoneMenuId, setOpenZoneMenuId] = useState<string | null>(null);
  const zoneMenuAnchorRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [zoneMenuPos, setZoneMenuPos] = useState<{ top: number; left: number } | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);

  const [formData, setFormData] = useState<ZoneFormData>({
    branchId: "",
    name: "",
    description: "",
    capacity: undefined,
    isActive: true,
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [orgVersion, setOrgVersion] = useState(0);
  const zonesLoadSeqRef = useRef(0);

  // Floor plan state
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [floorPlanMode, setFloorPlanMode] = useState<"view" | "edit">("view");
  const [selectedZoneForFloorPlan, setSelectedZoneForFloorPlan] = useState<Zone | null>(null);
  const [floorPlanData, setFloorPlanData] = useState<{
    canvasWidth?: number;
    canvasHeight?: number;
    backgroundImage?: string;
    tables: any[];
    floorElements: FloorElement[];
  } | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);

  useEffect(() => {
    if (!canViewZones) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgVersion]);

  // Default branch logic for staff (same as TableManagement)
  useEffect(() => {
    if (isSuperAdmin) return;
    if (!branches.length) return;

    const hasExplicitBranchAssignments = assignedBranchIds.length > 0;
    if (hasExplicitBranchAssignments) {
      if (!selectedBranchId || !assignedBranchIds.includes(selectedBranchId)) {
        const firstAllowed = assignedBranchIds.find((id) => branches.some((b) => b.id === id));
        if (firstAllowed) setSelectedBranchId(firstAllowed);
      }
      return;
    }

    if (!selectedBranchId && branches[0]?.id) {
      setSelectedBranchId(branches[0].id);
    }
  }, [assignedBranchIds, branches, selectedBranchId, isSuperAdmin]);

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

      zonesLoadSeqRef.current += 1;
      setSearchTerm("");
      setSelectedStatus("all");
      setSortBy("name");
      setSortOrder("asc");
      setCurrentPage(1);
      setTotalPages(1);
      setTotalCount(0);
      setZones([]);
      setOpenZoneMenuId(null);
      setSelectedBranchId("");
      setBranches([]);
      setIsDialogOpen(false);
      setIsDeleteDialogOpen(false);
      setSelectedZone(null);
      setIsFloorPlanOpen(false);
      setSelectedZoneForFloorPlan(null);
      setFloorPlanData(null);

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
    const reposition = () => {
      if (!openZoneMenuId) return;
      const el = zoneMenuAnchorRefs.current[openZoneMenuId];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 220, Math.max(8, rect.right - 200));
      const top = Math.min(window.innerHeight - 220, rect.bottom + 6);
      setZoneMenuPos({ top, left });
    };

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [openZoneMenuId]);

  useEffect(() => {
    if (!openZoneMenuId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenZoneMenuId(null);
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      const anchor = zoneMenuAnchorRefs.current[openZoneMenuId];
      const menu = document.getElementById("zone-actions-menu-portal");

      if (anchor && anchor.contains(target)) return;
      if (menu && menu.contains(target)) return;
      setOpenZoneMenuId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openZoneMenuId]);

  useEffect(() => {
    if (!selectedBranchId) {
      setZones([]);
      setTotalPages(1);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    setCurrentPage(1);
    loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) return;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      loadZonesSilently();
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedStatus, sortBy, sortOrder]);

  useEffect(() => {
    if (!selectedBranchId) return;
    if (currentPage > 0) {
      loadZones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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
      alert(t("admin.zoneManagement.messages.loadBranchesError", { defaultValue: "Failed to load branches" }));
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async () => {
    if (!selectedBranchId) return;
    const seq = ++zonesLoadSeqRef.current;

    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(selectedBranchId, token, {
        page: currentPage,
        limit: 12,
        sortBy,
        sortOrder,
        search: searchTerm || undefined,
        isActive: selectedStatus !== "all" ? selectedStatus : undefined,
      });

      if (seq !== zonesLoadSeqRef.current) return;
      setZones(response.zones || []);
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages);
        setTotalCount(response.pagination.totalCount);
      } else {
        setTotalPages(1);
        setTotalCount((response.zones || []).length);
      }
    } catch (error) {
      console.error("Error loading zones:", error);
      alert(t("admin.zoneManagement.messages.loadZonesError", { defaultValue: "Failed to load zones" }));
    } finally {
      if (seq === zonesLoadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const loadZonesSilently = async () => {
    if (!selectedBranchId) return;
    const seq = ++zonesLoadSeqRef.current;

    try {
      setSearchLoading(true);
      const token = (await getToken()) || undefined;
      const response = await reservationService.getZones(selectedBranchId, token, {
        page: 1,
        limit: 12,
        sortBy,
        sortOrder,
        search: searchTerm || undefined,
        isActive: selectedStatus !== "all" ? selectedStatus : undefined,
      });

      if (seq !== zonesLoadSeqRef.current) return;
      setZones(response.zones || []);
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages);
        setTotalCount(response.pagination.totalCount);
      }
      setCurrentPage(1);
    } catch (error) {
      console.error("Error loading zones silently:", error);
      alert(t("admin.zoneManagement.messages.loadZonesError", { defaultValue: "Failed to load zones" }));
    } finally {
      if (seq === zonesLoadSeqRef.current) {
        setSearchLoading(false);
      }
    }
  };

  const handleSort = (field: "name" | "createdAt" | "capacity") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  };

  const handleCreate = () => {
    setSelectedZone(null);
    setFormData({
      branchId: selectedBranchId,
      name: "",
      description: "",
      capacity: undefined,
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (zone: Zone) => {
    setSelectedZone(zone);
    setFormData({
      branchId: zone.branchId,
      name: zone.name,
      description: zone.description || "",
      capacity: zone.capacity || undefined,
      isActive: zone.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (zone: Zone) => {
    setSelectedZone(zone);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert(t("admin.zoneManagement.form.validation.nameRequired", { defaultValue: "Zone name is required" }));
      return;
    }

    if (!formData.branchId) {
      alert(t("admin.zoneManagement.form.validation.branchRequired", { defaultValue: "Branch is required" }));
      return;
    }

    try {
      setSaving(true);
      const token = (await getToken()) || undefined;

      if (selectedZone) {
        await reservationService.updateZone(selectedZone.id, formData, token);
        alert(t("admin.zoneManagement.messages.zoneUpdated", { defaultValue: "Zone updated" }));
      } else {
        await reservationService.createZone({ ...formData, branchId: formData.branchId }, token);
        alert(t("admin.zoneManagement.messages.zoneCreated", { defaultValue: "Zone created" }));
      }

      setIsDialogOpen(false);
      await loadZones();
    } catch (error: any) {
      console.error("Error saving zone:", error);
      alert(error?.response?.data?.error || t("admin.zoneManagement.messages.saveError", { defaultValue: "Failed to save zone" }));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedZone) return;

    try {
      setDeleting(true);
      const token = (await getToken()) || undefined;
      await reservationService.deleteZone(selectedZone.id, token);
      alert(t("admin.zoneManagement.messages.zoneDeleted", { defaultValue: "Zone deleted" }));
      setIsDeleteDialogOpen(false);

      if (zones.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        await loadZones();
      }
    } catch (error: any) {
      console.error("Error deleting zone:", error);
      alert(error?.response?.data?.error || t("admin.zoneManagement.messages.deleteError", { defaultValue: "Failed to delete zone" }));
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenFloorPlan = async (zone: Zone, mode: "view" | "edit") => {
    try {
      setLoadingFloorPlan(true);
      setSelectedZoneForFloorPlan(zone);
      setFloorPlanMode(mode);
      const token = (await getToken()) || undefined;
      const data = await reservationService.getZoneFloorPlan(zone.id, token);
      setFloorPlanData({
        canvasWidth: data.canvasWidth,
        canvasHeight: data.canvasHeight,
        backgroundImage: data.backgroundImage,
        tables: data.tables || [],
        floorElements: data.floorElements || [],
      });
      setIsFloorPlanOpen(true);
    } catch (error: any) {
      console.error("Error loading floor plan:", error);
      alert(t("admin.tableManagement.floorPlan.error", { defaultValue: "Failed to load floor plan" }));
    } finally {
      setLoadingFloorPlan(false);
    }
  };

  const handleCloseFloorPlan = () => {
    setIsFloorPlanOpen(false);
    setSelectedZoneForFloorPlan(null);
    setFloorPlanData(null);
  };

  const handleRequestEditFloorPlan = () => {
    if (!selectedZoneForFloorPlan) return;
    if (!canEditFloorPlan) return;
    setFloorPlanMode("edit");
  };

  const handleSaveFloorPlan = async (data: {
    canvasSettings: { canvasWidth: number; canvasHeight: number; backgroundImage?: string };
    tables: Array<{
      id: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      rotation: number;
      shape: string;
      tableNumber?: string;
      capacity?: number;
    }>;
    deletedTableIds: string[];
    floorElements: FloorElement[];
    deletedElementIds: string[];
    newElements: Array<Omit<FloorElement, "id" | "createdAt" | "updatedAt" | "zoneId">>;
  }) => {
    if (!selectedZoneForFloorPlan) return;

    const token = (await getToken()) || undefined;

    await reservationService.updateZoneCanvas(selectedZoneForFloorPlan.id, data.canvasSettings, token);

    const newTables = data.tables.filter((t) => t.id.startsWith("temp_"));
    const createdTablePositions: Array<{
      id: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      rotation: number;
      shape: string;
    }> = [];

    for (const newTable of newTables) {
      if (newTable.tableNumber && newTable.capacity) {
        const created = await reservationService.createTable(
          {
            tableNumber: newTable.tableNumber,
            capacity: newTable.capacity,
            branchId: selectedZoneForFloorPlan.branchId,
            zoneId: selectedZoneForFloorPlan.id,
          },
          token
        );

        createdTablePositions.push({
          id: created.id,
          positionX: newTable.positionX,
          positionY: newTable.positionY,
          width: newTable.width,
          height: newTable.height,
          rotation: newTable.rotation,
          shape: newTable.shape,
        });
      }
    }

    const existingTables = data.tables.filter((t) => !t.id.startsWith("temp_"));
    const bulkTables = [
      ...existingTables.map((t) => ({
        id: t.id,
        positionX: t.positionX,
        positionY: t.positionY,
        width: t.width,
        height: t.height,
        rotation: t.rotation,
        shape: t.shape,
      })),
      ...createdTablePositions,
    ];

    if (bulkTables.length > 0) {
      await reservationService.bulkUpdateTablePositions(selectedZoneForFloorPlan.id, bulkTables, token);
    }

    for (const table of existingTables) {
      await reservationService.updateTable(
        table.id,
        {
          ...(table.tableNumber !== undefined ? { tableNumber: table.tableNumber } : {}),
          ...(table.capacity !== undefined ? { capacity: table.capacity } : {}),
          ...(table.shape !== undefined ? { shape: table.shape } : {}),
          zoneId: selectedZoneForFloorPlan.id,
        } as any,
        token
      );
    }

    for (const tableId of data.deletedTableIds) {
      await reservationService.updateTable(tableId, { zoneId: null } as any, token);
    }

    for (const elementId of data.deletedElementIds) {
      await reservationService.deleteFloorElement(elementId, token);
    }

    for (const element of data.newElements) {
      await reservationService.createFloorElement(selectedZoneForFloorPlan.id, element, token);
    }

    for (const element of data.floorElements) {
      if (String(element.id).startsWith("temp_")) continue;
      await reservationService.updateFloorElement(
        element.id,
        {
          type: element.type,
          label: element.label || undefined,
          positionX: element.positionX,
          positionY: element.positionY,
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          color: element.color || undefined,
          icon: element.icon || undefined,
        },
        token
      );
    }

    await loadZones();
  };

  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: b.id, label: b.name || b.id })),
    [branches]
  );

  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("admin.zoneManagement.allStatus", { defaultValue: "All Status" }) },
      { value: "true", label: t("admin.zoneManagement.active", { defaultValue: "Active" }) },
      { value: "false", label: t("admin.zoneManagement.inactive", { defaultValue: "Inactive" }) },
    ],
    [t]
  );

  if (!canViewZones) {
    return (
      <div style={{ padding: "24px" }}>
        {t("admin.dashboard.noPermission", { defaultValue: "You don't have permission to access this page." })}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: "#ec4899", margin: 0, }}>
            {t("admin.zoneManagement.title", { defaultValue: "Zone Management" })}
          </h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            {t("admin.zoneManagement.description", { defaultValue: "Manage restaurant zones" })}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => loadZones()}
            disabled={!selectedBranchId || isBusy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              backgroundColor: "#ffffff",
              color: "#111827",
              cursor: !selectedBranchId || isBusy ? "not-allowed" : "pointer",
              opacity: !selectedBranchId || isBusy ? 0.7 : 1,
            }}
          >
            <RefreshCw style={{ height: 18, width: 18, color: "#6b7280", animation: isBusy ? "spin 1s linear infinite" : "none" }} />
            {t("admin.zoneManagement.refresh", { defaultValue: "Refresh" })}
          </button>

          {canCreateZone && (
            <button
              onClick={handleCreate}
              disabled={!selectedBranchId || loadingBranches}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 500,
                border: "none",
                borderRadius: 8,
                backgroundColor: "#ec4899",
                color: "#ffffff",
                cursor: !selectedBranchId || loadingBranches ? "not-allowed" : "pointer",
                opacity: !selectedBranchId || loadingBranches ? 0.7 : 1,
              }}
            >
              <Plus style={{ height: 18, width: 18 }} />
              {t("admin.zoneManagement.addZone", { defaultValue: "Add Zone" })}
            </button>
          )}
        </div>
      </div>

      {/* Branch selector */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
            {t("admin.zoneManagement.selectBranch", { defaultValue: "Select Branch" })}
          </div>
          <SearchableSelect
            options={[
              { value: "", label: t("admin.zoneManagement.selectBranchPlaceholder", { defaultValue: "Select Branch" }) },
              ...branchOptions,
            ]}
            value={selectedBranchId}
            onChange={(value) => {
              if (!isSuperAdmin && assignedBranchIds.length > 0 && !assignedBranchIds.includes(value)) {
                return;
              }
              setSelectedBranchId(value || "");
            }}
            disabled={loadingBranches}
            placeholder={t("admin.zoneManagement.selectBranchPlaceholder", { defaultValue: "Select Branch" })}
            searchable
            searchPlaceholder={t("admin.zoneManagement.searchBranches", { defaultValue: "Search branches..." })}
          />
          {selectedBranchId ? (
            <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#6b7280" }}>
              {t("admin.zoneManagement.selectBranchDescription", { defaultValue: "Zones are scoped to the selected branch." })}
            </p>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(200px, 240px)", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", height: 18, width: 18, color: "#9ca3af" }} />
            <input
              type="text"
              placeholder={t("admin.zoneManagement.searchPlaceholder", { defaultValue: "Search zones..." })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!selectedBranchId}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                fontSize: 14,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                outline: "none",
                opacity: !selectedBranchId ? 0.7 : 1,
              }}
            />
          </div>

          <SearchableSelect
            options={statusOptions}
            value={selectedStatus}
            onChange={(value) => handleStatusFilter(value)}
            disabled={!selectedBranchId}
            placeholder={t("admin.zoneManagement.allStatus", { defaultValue: "All Status" })}
            disabledText={t("admin.zoneManagement.selectBranchFirst", { defaultValue: "Select branch first" })}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>{t("admin.zoneManagement.sortBy", { defaultValue: "Sort by" })}:</span>
          <button
            onClick={() => handleSort("name")}
            disabled={!selectedBranchId}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              backgroundColor: sortBy === "name" ? "#ec4899" : "#ffffff",
              color: sortBy === "name" ? "#ffffff" : "#111827",
              cursor: !selectedBranchId ? "not-allowed" : "pointer",
              opacity: !selectedBranchId ? 0.7 : 1,
            }}
          >
            {t("admin.zoneManagement.nameAZ", { defaultValue: "Name" })}{sortBy === "name" ? (sortOrder === "desc" ? " ↓" : " ↑") : ""}
          </button>
          <button
            onClick={() => handleSort("capacity")}
            disabled={!selectedBranchId}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              backgroundColor: sortBy === "capacity" ? "#ec4899" : "#ffffff",
              color: sortBy === "capacity" ? "#ffffff" : "#111827",
              cursor: !selectedBranchId ? "not-allowed" : "pointer",
              opacity: !selectedBranchId ? 0.7 : 1,
            }}
          >
            {t("admin.zoneManagement.capacity", { defaultValue: "Capacity" })}{sortBy === "capacity" ? (sortOrder === "desc" ? " ↓" : " ↑") : ""}
          </button>
          <button
            onClick={() => handleSort("createdAt")}
            disabled={!selectedBranchId}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              backgroundColor: sortBy === "createdAt" ? "#ec4899" : "#ffffff",
              color: sortBy === "createdAt" ? "#ffffff" : "#111827",
              cursor: !selectedBranchId ? "not-allowed" : "pointer",
              opacity: !selectedBranchId ? 0.7 : 1,
            }}
          >
            {sortBy === "createdAt"
              ? sortOrder === "desc"
                ? t("admin.zoneManagement.newestFirst", { defaultValue: "Newest" })
                : t("admin.zoneManagement.oldestFirst", { defaultValue: "Oldest" })
              : t("admin.zoneManagement.newestFirst", { defaultValue: "Newest" })}
            {sortBy === "createdAt" ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
          </button>
        </div>
      </div>

      {/* Zones List */}
      {!selectedBranchId ? (
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <MapPin style={{ height: 48, width: 48, color: "#9ca3af", marginBottom: 16 }} />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
            {t("admin.zoneManagement.selectBranchToView", { defaultValue: "Select a branch to view zones" })}
          </h3>
          <p style={{ margin: "8px 0 0 0", fontSize: 14, color: "#6b7280" }}>
            {t("admin.zoneManagement.selectBranchToViewSubtext", { defaultValue: "Choose a branch from above" })}
          </p>
        </div>
      ) : loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 16 }}>
          <RefreshCw style={{ height: 48, width: 48, color: "#ec4899", animation: "spin 1s linear infinite" }} />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
            {t("admin.zoneManagement.loading", { defaultValue: "Loading..." })}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            {t("admin.zoneManagement.loadingDescription", { defaultValue: "Fetching zones..." })}
          </p>
        </div>
      ) : zones.length === 0 && !searchTerm && selectedStatus === "all" ? (
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
            {t("admin.zoneManagement.noZones", { defaultValue: "No zones found" })}
          </p>
          {canCreateZone && (
            <button
              onClick={handleCreate}
              style={{ padding: "10px 20px", fontSize: 14, fontWeight: 500, border: "none", borderRadius: 8, backgroundColor: "#ec4899", color: "#ffffff", cursor: "pointer" }}
            >
              <Plus style={{ height: 18, width: 18, marginRight: 8, display: "inline" }} />
              {t("admin.zoneManagement.addFirstZone", { defaultValue: "Add first zone" })}
            </button>
          )}
        </div>
      ) : zones.length === 0 ? (
        <div style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            {t("admin.zoneManagement.noZonesFound", { defaultValue: "No zones found" })}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {zones.map((zone) => {
              const hasTables = (zone as any)?._count?.tables > 0;
              return (
                <div key={zone.id} style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <MapPin style={{ height: 16, width: 16, color: "#ec4899" }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{zone.name}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 9999,
                          backgroundColor: zone.isActive ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.12)",
                          color: zone.isActive ? "#22c55e" : "#6b7280",
                          border: `1px solid ${zone.isActive ? "#22c55e" : "#6b7280"}`,
                        }}
                      >
                        {zone.isActive
                          ? t("admin.zoneManagement.active", { defaultValue: "Active" })
                          : t("admin.zoneManagement.inactive", { defaultValue: "Inactive" })}
                      </span>
                    </div>

                    <div>
                      {(canUpdateZone || canDeleteZone || canViewFloorPlan || canEditFloorPlan) ? (
                        <button
                          ref={(el) => {
                            zoneMenuAnchorRefs.current[zone.id] = el;
                          }}
                          onClick={() => {
                            setOpenZoneMenuId((prev) => (prev === zone.id ? null : zone.id));
                          }}
                          style={{ padding: 6, border: "none", borderRadius: 6, backgroundColor: "transparent", cursor: "pointer" }}
                          aria-label="Zone actions"
                        >
                          <MoreVertical style={{ height: 16, width: 16, color: "#6b7280" }} />
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          {(zone as any)?._count?.tables || 0} {t("admin.zoneManagement.tables", { defaultValue: "Tables" })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: 16 }}>
                    {zone.description ? (
                      <p style={{ margin: "0 0 10px 0", fontSize: 14, color: "#6b7280" }}>{zone.description}</p>
                    ) : null}

                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
                      {zone.capacity ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Users style={{ height: 14, width: 14 }} />
                          {t("admin.zoneManagement.capacity", { defaultValue: "Capacity" })}: {zone.capacity}
                        </span>
                      ) : null}

                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <MapPin style={{ height: 14, width: 14 }} />
                        {(zone as any)?._count?.tables || 0} {t("admin.zoneManagement.tables", { defaultValue: "Tables" })}
                      </span>
                    </div>

                    {hasTables ? (
                      <p style={{ margin: "10px 0 0 0", fontSize: 12, color: "#6b7280" }}>
                        {t("admin.zoneManagement.cannotDeleteHasTables", { defaultValue: "Cannot delete: zone has tables." })}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {openZoneMenuId && zoneMenuPos
            ? createPortal(
                <div
                  id="zone-actions-menu-portal"
                  style={{
                    position: "fixed",
                    top: zoneMenuPos.top,
                    left: zoneMenuPos.left,
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.12)",
                    zIndex: 100000,
                    width: 200,
                    padding: 6,
                  }}
                >
                  {(() => {
                    const zone = zones.find((z) => z.id === openZoneMenuId) || null;
                    if (!zone) return null;
                    const hasTables = (zone as any)?._count?.tables > 0;

                    return (
                      <>
                        {canUpdateZone && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenZoneMenuId(null);
                              handleEdit(zone);
                            }}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
                          >
                            <Edit style={{ height: 16, width: 16 }} />
                            {t("admin.zoneManagement.edit", { defaultValue: "Edit" })}
                          </button>
                        )}

                        {(canViewFloorPlan || canEditFloorPlan) && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenZoneMenuId(null);
                              handleOpenFloorPlan(zone, "view");
                            }}
                            disabled={loadingFloorPlan || !canViewFloorPlan}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "10px 12px", cursor: !canViewFloorPlan ? "not-allowed" : "pointer", opacity: !canViewFloorPlan ? 0.6 : 1, textAlign: "left" }}
                          >
                            <Eye style={{ height: 16, width: 16 }} />
                            {t("admin.tableManagement.viewFloorPlan", { defaultValue: "View floor plan" })}
                          </button>
                        )}

                        {canEditFloorPlan && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenZoneMenuId(null);
                              handleOpenFloorPlan(zone, "edit");
                            }}
                            disabled={loadingFloorPlan}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
                          >
                            <Pencil style={{ height: 16, width: 16 }} />
                            {t("admin.tableManagement.editFloorPlan", { defaultValue: "Edit floor plan" })}
                          </button>
                        )}

                        {canDeleteZone && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenZoneMenuId(null);
                              handleDelete(zone);
                            }}
                            disabled={Boolean(hasTables) || deleting}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "10px 12px", cursor: hasTables ? "not-allowed" : "pointer", opacity: hasTables ? 0.6 : 1, textAlign: "left", color: "#ef4444" }}
                          >
                            <Trash2 style={{ height: 16, width: 16 }} />
                            {t("admin.zoneManagement.delete", { defaultValue: "Delete" })}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>,
                document.body
              )
            : null}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ marginTop: 16, backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, color: "#6b7280" }}>
                {t("admin.zoneManagement.showingZones", {
                  defaultValue: "Showing {{count}} of {{total}} zones",
                  count: zones.length,
                  total: totalCount,
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8, backgroundColor: "#fff", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.6 : 1 }}
                >
                  <ChevronLeft style={{ height: 16, width: 16 }} />
                </button>
                <span style={{ fontSize: 14 }}>
                  {t("admin.zoneManagement.pageOf", {
                    defaultValue: "Page {{current}} of {{total}}",
                    current: currentPage,
                    total: totalPages,
                  })}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8, backgroundColor: "#fff", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.6 : 1 }}
                >
                  <ChevronRight style={{ height: 16, width: 16 }} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => {
            setIsDialogOpen(false);
            setSelectedZone(null);
          }}
        >
          <div
            style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 16px 0" }}>
              {selectedZone
                ? t("admin.zoneManagement.editZone", { defaultValue: "Edit Zone" })
                : t("admin.zoneManagement.createZone", { defaultValue: "Create Zone" })}
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 16px 0" }}>
              {selectedZone
                ? t("admin.zoneManagement.editZoneDescription", { defaultValue: "Update zone details" })
                : t("admin.zoneManagement.createZoneDescription", { defaultValue: "Create a new zone" })}
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                  {t("admin.zoneManagement.zoneName", { defaultValue: "Zone name" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("admin.zoneManagement.zoneNamePlaceholder", { defaultValue: "e.g., Main dining" })}
                  style={{ width: "100%", height: 40, border: "1px solid #e5e7eb", borderRadius: 8, padding: "0 12px", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                  {t("admin.zoneManagement.description", { defaultValue: "Description" })}
                </label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("admin.zoneManagement.descriptionPlaceholder", { defaultValue: "Optional description" })}
                  rows={3}
                  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 14, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                  {t("admin.zoneManagement.capacity", { defaultValue: "Capacity" })}
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.capacity ?? ""}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder={t("admin.zoneManagement.capacityPlaceholder", { defaultValue: "e.g., 20" })}
                  style={{ width: "100%", height: 40, border: "1px solid #e5e7eb", borderRadius: 8, padding: "0 12px", fontSize: 14 }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                  {t("admin.zoneManagement.isActive", { defaultValue: "Active" })}
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(formData.isActive)}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => {
                    setIsDialogOpen(false);
                    setSelectedZone(null);
                  }}
                  style={{ padding: "10px 16px", fontSize: 14, fontWeight: 500, border: "1px solid #e5e7eb", borderRadius: 8, backgroundColor: "#fff", cursor: "pointer" }}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.name.trim()}
                  style={{
                    padding: "10px 16px",
                    fontSize: 14,
                    fontWeight: 500,
                    border: "none",
                    borderRadius: 8,
                    backgroundColor: "#ec4899",
                    color: "#fff",
                    cursor: saving || !formData.name.trim() ? "not-allowed" : "pointer",
                    opacity: saving || !formData.name.trim() ? 0.7 : 1,
                  }}
                >
                  {saving ? t("common.saving", { defaultValue: "Saving..." }) : t("common.save", { defaultValue: "Save" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {isDeleteDialogOpen && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => {
            setIsDeleteDialogOpen(false);
            setSelectedZone(null);
          }}
        >
          <div style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 16px 0" }}>
              {t("admin.zoneManagement.deleteZone", { defaultValue: "Delete Zone" })}
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 24px 0" }}>
              {t("admin.zoneManagement.deleteZoneDescription", {
                defaultValue: 'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
                name: selectedZone?.name,
              })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setSelectedZone(null);
                }}
                style={{ padding: "10px 16px", fontSize: 14, fontWeight: 500, border: "1px solid #e5e7eb", borderRadius: 8, backgroundColor: "#fff", cursor: "pointer" }}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 500,
                  border: "none",
                  borderRadius: 8,
                  backgroundColor: "#ef4444",
                  color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? t("common.deleting", { defaultValue: "Deleting..." }) : t("common.delete", { defaultValue: "Delete" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floor Plan */}
      {isFloorPlanOpen && selectedZoneForFloorPlan && floorPlanData && (
        <FloorPlanEditor
          zoneId={selectedZoneForFloorPlan.id}
          zoneName={selectedZoneForFloorPlan.name}
          canvasWidth={floorPlanData.canvasWidth || 800}
          canvasHeight={floorPlanData.canvasHeight || 600}
          backgroundImage={floorPlanData.backgroundImage}
          tables={floorPlanData.tables as any}
          floorElements={floorPlanData.floorElements}
          onRequestEditMode={handleRequestEditFloorPlan}
          readOnly={floorPlanMode === "view" || !canEditFloorPlan}
          onSave={floorPlanMode === "edit" && canEditFloorPlan ? handleSaveFloorPlan : undefined}
          onCancel={handleCloseFloorPlan}
        />
      )}

      <style>
        {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg);} }`}
      </style>
    </div>
  );
};

export default ZoneManagement;
