import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiPlus, mdiPencil, mdiDelete, mdiRefresh, mdiMapMarker, mdiAccountGroup, mdiOfficeBuilding, mdiMagnify, mdiSort, mdiChevronLeft, mdiChevronRight, mdiFloorPlan, mdiDotsVertical } from "@mdi/js";
import {
  reservationService,
  type Zone,
  type ZoneFormData,
  type FloorElement,
  type ZoneFloorPlan,
} from "@/services/reservationService";
import { FloorPlanEditor } from "@/components/FloorPlanEditor";
import branchService, { type Branch } from "@/services/branchService";
import { toast } from "sonner";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ZoneManagement: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { assignedBranchIds, can } = usePermissions();
  const [zones, setZones] = useState<Zone[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [, setSearchLoading] = useState(false);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "capacity">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [openZoneMenuId, setOpenZoneMenuId] = useState<string | null>(null);

  // Floor plan editor state
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [selectedZoneForFloorPlan, setSelectedZoneForFloorPlan] = useState<Zone | null>(null);
  const [floorPlanData, setFloorPlanData] = useState<ZoneFloorPlan | null>(null);
  const [loadingFloorPlan, setLoadingFloorPlan] = useState(false);
  const [floorPlanMode, setFloorPlanMode] = useState<"view" | "edit">("view");

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      setCurrentPage(1); // Reset to first page when branch changes
      loadZones();
    } else {
      setZones([]);
      setLoading(false);
      setTotalPages(1);
      setTotalCount(0);
    }
  }, [selectedBranchId]);

  // Debounced search effect - silent loading
  useEffect(() => {
    if (!selectedBranchId) return;
    const timeoutId = setTimeout(() => {
      setCurrentPage(1); // Reset to first page when search changes
      loadZonesSilently();
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedStatus, sortBy, sortOrder]);

  // Reload when page changes (with loading indicator)
  useEffect(() => {
    if (selectedBranchId && currentPage > 0) {
      loadZones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const loadBranches = async () => {
    try {
      setLoadingBranches(true);
      const token = await getToken();
      const fetchedBranches = await branchService.getBranches(token ?? undefined);
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
      setBranches(fetchedBranches);
    } catch (error) {
      console.error("Error loading branches:", error);
      toast.error("Failed to load branches");
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadZones = async () => {
    if (!selectedBranchId) return;
    
    try {
      setLoading(true);
      const token = await getToken();
      const branchId: string = (selectedBranchId ?? "") as string;
      const response = await reservationService.getZones(branchId, token ?? undefined, {
        page: currentPage,
        limit: 12,
        sortBy,
        sortOrder,
        search: searchTerm || undefined,
        isActive: selectedStatus !== "all" ? selectedStatus : undefined,
      });
      setZones(response.zones);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
    } catch (error) {
      console.error("Error loading zones:", error);
      toast.error("Failed to load zones");
    } finally {
      setLoading(false);
    }
  };

  const loadZonesSilently = async () => {
    if (!selectedBranchId) return;
    
    try {
      setSearchLoading(true);
      const token = await getToken();
      const branchId: string = (selectedBranchId ?? "") as string;
      const response = await reservationService.getZones(branchId, token ?? undefined, {
        page: 1, // Always reset to page 1 for search/filter
        limit: 12,
        sortBy,
        sortOrder,
        search: searchTerm || undefined,
        isActive: selectedStatus !== "all" ? selectedStatus : undefined,
      });
      setZones(response.zones);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
      setCurrentPage(1); // Ensure currentPage is in sync
    } catch (error) {
      console.error("Error loading zones:", error);
      toast.error("Failed to load zones");
    } finally {
      setSearchLoading(false);
    }
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
      toast.error("Zone name is required");
      return;
    }

    if (!formData.branchId) {
      toast.error("Branch is required");
      return;
    }

    try {
      setSaving(true);
      const token = await getToken();

      if (selectedZone) {
        const zoneId: string = (selectedZone.id ?? "") as string;
        await reservationService.updateZone(zoneId, formData, token ?? undefined);
        toast.success("Zone updated successfully");
      } else {
        const branchId: string = (formData.branchId ?? "") as string;
        await reservationService.createZone({ ...formData, branchId }, token ?? undefined);
        toast.success("Zone created successfully");
      }

      setIsDialogOpen(false);
      loadZones();
    } catch (error: any) {
      console.error("Error saving zone:", error);
      toast.error(error.response?.data?.error || "Failed to save zone");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedZone) return;

    try {
      setDeleting(true);
      const token = await getToken();
      const zoneId: string = (selectedZone.id ?? "") as string;
      await reservationService.deleteZone(zoneId, token ?? undefined);
      toast.success("Zone deleted successfully");
      setIsDeleteDialogOpen(false);
      // If we deleted the last item on the page and it's not page 1, go to previous page
      if (zones.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
        // loadZones will be called automatically by useEffect when currentPage changes
      } else {
        await loadZones();
      }
    } catch (error: any) {
      console.error("Error deleting zone:", error);
      toast.error(error.response?.data?.error || "Failed to delete zone");
    } finally {
      setDeleting(false);
    }
  };

  const handleSort = (field: "name" | "createdAt" | "capacity") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const handleStatusFilter = (value: string) => {
    setSelectedStatus(value);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  // Floor Plan Editor handlers
  const handleOpenFloorPlan = async (zone: Zone, mode: "view" | "edit") => {
    try {
      setLoadingFloorPlan(true);
      setSelectedZoneForFloorPlan(zone);
      setFloorPlanMode(mode);
      const token = (await getToken()) || undefined;
      const data = await reservationService.getZoneFloorPlan(zone.id, token);
      setFloorPlanData(data);
      setIsFloorPlanOpen(true);
    } catch (error) {
      console.error("Error loading floor plan:", error);
      toast.error(t("admin.tableManagement.floorPlan.error") || "Failed to load floor plan");
    } finally {
      setLoadingFloorPlan(false);
    }
  };

  const handleCloseFloorPlan = () => {
    setIsFloorPlanOpen(false);
    setSelectedZoneForFloorPlan(null);
    setFloorPlanData(null);
  };

  const handleSaveFloorPlan = async (data: {
    canvasSettings: { canvasWidth: number; canvasHeight: number };
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
    
    try {
      const token = (await getToken()) || undefined;
      if (import.meta.env.DEV) {
        console.debug("[FloorPlanSave] start", {
          zoneId: selectedZoneForFloorPlan.id,
          hasToken: Boolean(token),
          tokenLength: token?.length ?? 0,
          tables: data.tables.length,
          deletedTableIds: data.deletedTableIds.length,
          floorElements: data.floorElements.length,
          deletedElementIds: data.deletedElementIds.length,
          newElements: data.newElements.length,
        });
      }

      // Update canvas settings
      if (import.meta.env.DEV) console.debug("[FloorPlanSave] updateZoneCanvas");
      await reservationService.updateZoneCanvas(
        selectedZoneForFloorPlan.id,
        data.canvasSettings,
        token
      );

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
          if (import.meta.env.DEV) console.debug("[FloorPlanSave] createTable", newTable.tableNumber);
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
        if (import.meta.env.DEV) console.debug("[FloorPlanSave] bulkUpdateTablePositions", bulkTables.length);
        await reservationService.bulkUpdateTablePositions(
          selectedZoneForFloorPlan.id,
          bulkTables,
          token
        );
      }

      // Persist table metadata updates (e.g., renamed table number, capacity, shape)
      // Note: bulkUpdateTablePositions only saves geometry. Table details must be updated separately.
      for (const table of existingTables) {
        if (import.meta.env.DEV) {
          console.debug("[FloorPlanSave] updateTable metadata", table.id, {
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            shape: table.shape,
          });
        }
        await reservationService.updateTable(
          table.id,
          {
            ...(table.tableNumber !== undefined ? { tableNumber: table.tableNumber } : {}),
            ...(table.capacity !== undefined ? { capacity: table.capacity } : {}),
            ...(table.shape !== undefined ? { shape: table.shape } : {}),
            zoneId: selectedZoneForFloorPlan.id,
          },
          token
        );
      }

      for (const tableId of data.deletedTableIds) {
        if (import.meta.env.DEV) console.debug("[FloorPlanSave] unassignTable", tableId);
        await reservationService.updateTable(tableId, { zoneId: null }, token);
      }

      // Delete removed floor elements
      for (const elementId of data.deletedElementIds) {
        if (import.meta.env.DEV) console.debug("[FloorPlanSave] deleteFloorElement", elementId);
        await reservationService.deleteFloorElement(elementId, token);
      }

      // Create new floor elements
      for (const element of data.newElements) {
        if (import.meta.env.DEV) console.debug("[FloorPlanSave] createFloorElement", element.type);
        await reservationService.createFloorElement(
          selectedZoneForFloorPlan.id,
          element,
          token
        );
      }

      // Update existing floor elements
      for (const element of data.floorElements) {
        if (import.meta.env.DEV) console.debug("[FloorPlanSave] updateFloorElement", element.id);
        await reservationService.updateFloorElement(
          element.id,
          {
            type: element.type,
            label: element.label,
            positionX: element.positionX,
            positionY: element.positionY,
            width: element.width,
            height: element.height,
            rotation: element.rotation,
            color: element.color,
            icon: element.icon,
          },
          token
        );
      }

      toast.success(
        t("admin.tableManagement.floorPlan.saveSuccess", {
          defaultValue: "Floor plan saved successfully",
        })
      );
      handleCloseFloorPlan();
      // Reload zones to reflect any changes
      await loadZones();
    } catch (error) {
      console.error("[FloorPlanSave] error", error);
      if (import.meta.env.DEV) {
        const anyErr = error as any;
        console.debug("[FloorPlanSave] error details", {
          message: anyErr?.message,
          status: anyErr?.status,
          responseStatus: anyErr?.response?.status,
          responseData: anyErr?.response?.data,
        });
      }
      toast.error(
        t("admin.tableManagement.floorPlan.saveFailed", {
          defaultValue: "Failed to save floor plan",
        })
      );
      throw error;
    }
  };

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.zoneManagement.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.zoneManagement.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadZones}
            variant="outline"
            size="sm"
            disabled={!selectedBranchId || loading || loadingBranches}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
          >
            <Icon path={mdiRefresh} size={0.67} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("admin.zoneManagement.refresh")}
          </Button>
          {can(RESOURCES.ZONES, ACTIONS.CREATE) ? (
            <Button
              onClick={handleCreate}
              disabled={!selectedBranchId || loadingBranches}
              size="sm"
              className="bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.zoneManagement.addZone")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Branch Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">
                {t("admin.zoneManagement.selectBranch")}
              </Label>
              <Select
                value={selectedBranchId || ""}
                onValueChange={(value: string) => setSelectedBranchId(value || "")}
                disabled={loadingBranches}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-[300px]">
                  <SelectValue placeholder={t("admin.zoneManagement.selectBranchPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBranch && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {t("admin.zoneManagement.selectBranchDescription")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters and Search - Always Visible */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Icon path={mdiMagnify} size={0.67} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("admin.zoneManagement.searchPlaceholder") || "Search zones..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-transparent text-foreground border-border"
                  disabled={!selectedBranchId}
                />
              </div>
            </div>

            {/* Status Filter */}
            <Select value={selectedStatus} onValueChange={handleStatusFilter} disabled={!selectedBranchId}>
              <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-[180px]">
                <SelectValue placeholder={t("admin.zoneManagement.allStatus") || "All Status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.zoneManagement.allStatus") || "All Status"}</SelectItem>
                <SelectItem value="true">{t("admin.zoneManagement.active")}</SelectItem>
                <SelectItem value="false">{t("admin.zoneManagement.inactive")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">{t("admin.zoneManagement.sortBy") || "Sort by"}:</span>
              <Button
                size="sm"
                onClick={() => handleSort("name")}
                disabled={!selectedBranchId}
                className={sortBy === "name" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                {t("admin.zoneManagement.nameAZ") || "Name"}
                {sortBy === "name" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSort("capacity")}
                disabled={!selectedBranchId}
                className={sortBy === "capacity" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                {t("admin.zoneManagement.capacity")}
                {sortBy === "capacity" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "desc" ? "rotate-180" : ""}`} />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleSort("createdAt")}
                disabled={!selectedBranchId}
                className={sortBy === "createdAt" ? "bg-pink-500 hover:bg-pink-600 text-white" : "bg-transparent text-foreground border border-border hover:bg-muted"}
              >
                {sortBy === "createdAt"
                  ? sortOrder === "desc"
                    ? t("admin.zoneManagement.newestFirst") || "Newest"
                    : t("admin.zoneManagement.oldestFirst") || "Oldest"
                  : t("admin.zoneManagement.newestFirst") || "Newest"}
                {sortBy === "createdAt" && (
                  <Icon path={mdiSort} size={0.5} className={`ml-2 text-white ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zones List */}
      {!selectedBranchId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Icon path={mdiOfficeBuilding} size={2.00} className="text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.zoneManagement.selectBranchToView")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.zoneManagement.selectBranchToViewSubtext")}
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.zoneManagement.loading")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.zoneManagement.loadingDescription")}
            </p>
          </div>
        </div>
      ) : zones.length === 0 && !searchTerm && selectedStatus === "all" ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {t("admin.zoneManagement.noZones")}
            </p>
            <Button onClick={handleCreate}>
              <Icon path={mdiPlus} size={0.67} className="mr-2" />
              {t("admin.zoneManagement.addFirstZone")}
            </Button>
          </CardContent>
        </Card>
      ) : zones.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {t("admin.zoneManagement.noZonesFound") || "No zones found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-6">
            {zones.map((zone) => (
              <Card key={zone.id}>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-1.5">
                      <Icon path={mdiMapMarker} size={0.50} className="text-pink-500" />
                      {zone.name}
                      <Badge
                        variant={zone.isActive ? "default" : "secondary"}
                        className="ml-2 text-[10px] px-1.5 py-0 h-4"
                      >
                        {zone.isActive
                          ? t("admin.zoneManagement.active")
                          : t("admin.zoneManagement.inactive")}
                      </Badge>
                    </div>
                    {(can(RESOURCES.ZONES, ACTIONS.UPDATE) ||
                      can(RESOURCES.ZONES, ACTIONS.VIEW_FLOOR_PLAN) ||
                      can(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN) ||
                      can(RESOURCES.ZONES, ACTIONS.DELETE)) ? (
                      <DropdownMenu
                        open={openZoneMenuId === zone.id}
                        onOpenChange={(open) => {
                          setOpenZoneMenuId(open ? zone.id : null);
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onPointerDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              setOpenZoneMenuId((prev) =>
                                prev === zone.id ? null : zone.id
                              );
                            }}
                          >
                            <Icon path={mdiDotsVertical} size={0.67} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {can(RESOURCES.ZONES, ACTIONS.UPDATE) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenZoneMenuId(null);
                                handleEdit(zone);
                              }}
                            >
                              <Icon path={mdiPencil} size={0.67} className="mr-2" />
                              {t("admin.zoneManagement.edit")}
                            </DropdownMenuItem>
                          )}
                          {can(RESOURCES.ZONES, ACTIONS.VIEW_FLOOR_PLAN) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenZoneMenuId(null);
                                handleOpenFloorPlan(zone, "view");
                              }}
                              disabled={loadingFloorPlan}
                            >
                              <Icon path={mdiFloorPlan} size={0.67} className="mr-2" />
                              {t("admin.tableManagement.viewFloorPlan")}
                            </DropdownMenuItem>
                          )}
                          {can(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenZoneMenuId(null);
                                handleOpenFloorPlan(zone, "edit");
                              }}
                              disabled={loadingFloorPlan}
                            >
                              <Icon path={mdiFloorPlan} size={0.67} className="mr-2" />
                              {t("admin.tableManagement.editFloorPlan")}
                            </DropdownMenuItem>
                          )}
                          {can(RESOURCES.ZONES, ACTIONS.DELETE) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setOpenZoneMenuId(null);
                                handleDelete(zone);
                              }}
                              disabled={(zone._count && zone._count.tables > 0) || deleting}
                              className="text-destructive"
                            >
                              <Icon path={mdiDelete} size={0.67} className="mr-2" />
                              {t("admin.zoneManagement.delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-muted-foreground font-semibold text-xs">
                        {zone._count?.tables || 0} {t("admin.zoneManagement.tables")}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {zone.description && (
                      <p className="text-sm text-muted-foreground">
                        {zone.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {zone.capacity && (
                        <>
                          <Icon path={mdiAccountGroup} size={0.50} className="shrink-0" />
                          <span>
                            {t("admin.zoneManagement.capacity")}: {zone.capacity}
                          </span>
                        </>
                      )}
                      {zone._count && zone._count.tables > 0 && (
                        <>
                          {zone.capacity && <span className="mx-1">•</span>}
                          <Icon path={mdiMapMarker} size={0.50} className="shrink-0" />
                          <span>
                            {zone._count.tables} {t("admin.zoneManagement.tables")}
                          </span>
                        </>
                      )}
                    </div>
                    {zone._count && zone._count.tables > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {t("admin.zoneManagement.cannotDeleteHasTables")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {t("admin.zoneManagement.showingZones", {
                      count: zones.length,
                      total: totalCount,
                    }) || `Showing ${zones.length} out of ${totalCount} zones`}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      <Icon path={mdiChevronLeft} size={0.67} />
                    </Button>
                    <span className="text-sm">
                      {t("admin.zoneManagement.pageOf", {
                        current: currentPage,
                        total: totalPages,
                      }) || `Page ${currentPage} of ${totalPages}`}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <Icon path={mdiChevronRight} size={0.67} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {selectedZone
                ? t("admin.zoneManagement.editZone")
                : t("admin.zoneManagement.createZone")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedZone
                ? t("admin.zoneManagement.editZoneDescription")
                : t("admin.zoneManagement.createZoneDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">
                {t("admin.zoneManagement.zoneName")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("admin.zoneManagement.zoneNamePlaceholder")}
                className="bg-transparent text-foreground border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">
                {t("admin.zoneManagement.description")}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("admin.zoneManagement.descriptionPlaceholder")}
                rows={3}
                className="bg-transparent text-foreground border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity" className="text-foreground">
                {t("admin.zoneManagement.capacity")}
              </Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={formData.capacity || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacity: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder={t("admin.zoneManagement.capacityPlaceholder")}
                className="bg-transparent text-foreground border-border"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
              <Label htmlFor="isActive" className="text-foreground">
                {t("admin.zoneManagement.isActive")}
              </Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                size="sm"
                onClick={() => setIsDialogOpen(false)}
                disabled={saving}
                className="bg-transparent hover:bg-muted text-foreground border border-border"
              >
                {t("admin.zoneManagement.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {saving ? (
                  <>
                    <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                    {t("admin.zoneManagement.saving")}
                  </>
                ) : (
                  t("admin.zoneManagement.save")
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {t("admin.zoneManagement.deleteZone")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("admin.zoneManagement.deleteZoneDescription", {
                name: selectedZone?.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedZone(null);
              }}
              disabled={deleting}
              className="bg-transparent hover:bg-muted text-foreground border border-border"
            >
              {t("admin.zoneManagement.cancel")}
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Icon path={mdiRefresh} size={0.67} className="mr-2 animate-spin" />
                  {t("admin.zoneManagement.deleting")}
                </>
              ) : (
                t("admin.zoneManagement.delete")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floor Plan Editor */}
      {isFloorPlanOpen && selectedZoneForFloorPlan && floorPlanData && (
        <FloorPlanEditor
          zoneId={selectedZoneForFloorPlan.id}
          zoneName={selectedZoneForFloorPlan.name}
          canvasWidth={floorPlanData.canvasWidth || 800}
          canvasHeight={floorPlanData.canvasHeight || 600}
          backgroundImage={floorPlanData.backgroundImage}
          tables={floorPlanData.tables}
          floorElements={floorPlanData.floorElements}
          readOnly={floorPlanMode === "view" || !can(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN)}
          onSave={
            floorPlanMode === "edit" && can(RESOURCES.ZONES, ACTIONS.EDIT_FLOOR_PLAN)
              ? handleSaveFloorPlan
              : undefined
          }
          onCancel={handleCloseFloorPlan}
        />
      )}
    </div>
  );
};

export default ZoneManagement;

