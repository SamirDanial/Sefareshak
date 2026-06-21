import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "@mdi/react";
import {
  mdiAccountGroup,
  mdiArrowCollapse,
  mdiArrowExpand,
  mdiCalendar,
  mdiCheckCircle,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClock,
  mdiCloseCircle,
  mdiEmail,
  mdiFilter,
  mdiMapMarker,
  mdiPhone,
  mdiRefresh,
} from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";
import ApiService from "@/services/apiService";
import branchService, { type Branch } from "@/services/branchService";
import { reservationService, type Zone } from "@/services/reservationService";
import { toast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";

const ITEMS_PER_PAGE = 12;

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

type SlotStatus = "AVAILABLE" | "RESERVED";

interface TableStatusGridData {
  date: string;
  timeSlots: string[];
  tables: Array<{
    id: string;
    tableNumber: string;
    capacity: number;
    zone: string | null;
    status: string;
    timeSlots: Record<
      string,
      {
        status: SlotStatus;
        reservation: {
          reservationId: string;
          reservationNumber: string;
          customerName: string;
          customerEmail: string;
          customerPhone: string;
          numberOfGuests: number;
          status: string;
          type: string;
          userId?: string;
          user?: {
            id: string;
            firstName?: string;
            lastName?: string;
            email: string;
          };
        } | null;
      }
    >;
  }>;
  operatingHours?: {
    open: string;
    close: string;
  };
}

function formatDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateInputValue(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  const [y, m, d] = raw.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const TableStatusGrid: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { canAny } = usePermissions();

  const zonesLoadSeqRef = useRef(0);
  const gridLoadSeqRef = useRef(0);

  const canViewTableStatusGrid = canAny([
    { resource: RESOURCES.TABLE_STATUS_GRID, action: ACTIONS.VIEW },
  ]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [gridData, setGridData] = useState<TableStatusGridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("all");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [timeRangeStart, setTimeRangeStart] = useState<string>("");
  const [timeRangeEnd, setTimeRangeEnd] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRotated, setIsRotated] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(true);

  const [selectedCell, setSelectedCell] = useState<{
    tableId: string;
    tableNumber: string;
    timeSlot: string;
    reservation: any;
  } | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  const [orgVersion, setOrgVersion] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

      // Reset state and refetch under new org header.
      setGridData(null);
      setBranches([]);
      setAvailableZones([]);
      setSelectedBranchId("");
      setSelectedZoneId("all");
      setTimeRangeStart("");
      setTimeRangeEnd("");
      setCurrentPage(1);
      setIsRotated(false);
      setShowDatePicker(true);
      setSelectedCell(null);
      setIsDetailsDialogOpen(false);

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
      const token = await getToken();
      if (!token) return;
      const fetchedBranches = await branchService.getBranches(token || undefined);
      setBranches(fetchedBranches);

      setSelectedBranchId((prev) => {
        const nextPrev = String(prev || "").trim();
        if (nextPrev && fetchedBranches.some((b) => b.id === nextPrev)) return nextPrev;
        return fetchedBranches[0]?.id || "";
      });
    } catch (error) {
      console.error("Error loading branches:", error);
    }
  };

  const loadZones = async (branchId: string, seq: number) => {
    if (!branchId) {
      setAvailableZones([]);
      return;
    }
    try {
      setLoadingZones(true);
      const token = await getToken();
      const response = await reservationService.getZones(branchId, token || undefined);
      if (seq !== zonesLoadSeqRef.current) return;
      setAvailableZones(response.zones);
    } catch (error) {
      console.error("Error loading zones:", error);
      if (seq !== zonesLoadSeqRef.current) return;
      setAvailableZones([]);
    } finally {
      if (seq !== zonesLoadSeqRef.current) return;
      setLoadingZones(false);
    }
  };

  const loadGridData = async (opts: { branchId: string; zoneId: string; date: Date; seq: number }) => {
    const { branchId, zoneId, date, seq } = opts;

    if (!branchId) {
      setGridData(null);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const dateStr = formatDateInputValue(date);
      const apiService = ApiService.getInstance();
      const params = new URLSearchParams({
        date: dateStr,
        branchId,
      });

      if (zoneId && zoneId !== "all") {
        params.append("zoneId", zoneId);
      }

      const result = await apiService.get(
        `/api/reservations/tables/status-grid?${params.toString()}`,
        token
      );

      if ((result as any)?.success) {
        if (seq !== gridLoadSeqRef.current) return;
        setGridData((result as any).data as TableStatusGridData);
      } else {
        throw new Error((result as any)?.error || "Failed to load data");
      }
    } catch (error: any) {
      console.error("Error loading grid data:", error);
      if (seq !== gridLoadSeqRef.current) return;

      const backendMessage = String(error?.message || "").trim();
      if (backendMessage === "Reservations are not enabled for this branch") {
        toast.error(
          t("admin.tableStatusGrid.reservationsNotEnabled", {
            defaultValue: "Reservations are not enabled for this branch",
          })
        );
        return;
      }

      toast.error(
        backendMessage ||
          t("admin.tableStatusGrid.loadFailed", { defaultValue: "Failed to load table status" })
      );
    } finally {
      if (seq !== gridLoadSeqRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canViewTableStatusGrid) {
      loadBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgVersion]);

  useEffect(() => {
    if (!canViewTableStatusGrid) {
      setGridData(null);
      setAvailableZones([]);
      return;
    }

    if (selectedBranchId) {
      // Immediately clear previous branch's data so it can't visually "carry".
      setGridData(null);
      setAvailableZones([]);

      zonesLoadSeqRef.current += 1;
      const zonesSeq = zonesLoadSeqRef.current;
      loadZones(selectedBranchId, zonesSeq);

      gridLoadSeqRef.current += 1;
      const gridSeq = gridLoadSeqRef.current;
      loadGridData({
        branchId: selectedBranchId,
        zoneId: selectedZoneId,
        date: selectedDate,
        seq: gridSeq,
      });
    } else {
      setGridData(null);
      setAvailableZones([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, selectedDate, selectedZoneId, orgVersion]);

  const handleDateChange = (days: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(next);
  };

  const handleCellClick = (
    tableId: string,
    tableNumber: string,
    timeSlot: string,
    reservation: any
  ) => {
    setSelectedCell({ tableId, tableNumber, timeSlot, reservation });
    setIsDetailsDialogOpen(true);
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId === "none" ? "" : branchId);
    setSelectedZoneId("all");
    setCurrentPage(1);
    setSelectedCell(null);
    setIsDetailsDialogOpen(false);
    setGridData(null);
    setAvailableZones([]);
  };

  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
  };

  const refreshGrid = () => {
    if (!selectedBranchId) return;
    gridLoadSeqRef.current += 1;
    const gridSeq = gridLoadSeqRef.current;
    loadGridData({
      branchId: selectedBranchId,
      zoneId: selectedZoneId,
      date: selectedDate,
      seq: gridSeq,
    });
  };

  const getFilteredTables = () => {
    if (!gridData) return [];
    return gridData.tables;
  };

  const getFilteredTimeSlots = () => {
    if (!gridData) return [];
    let slots = gridData.timeSlots;

    if (timeRangeStart) {
      slots = slots.filter((slot) => slot >= timeRangeStart);
    }
    if (timeRangeEnd) {
      slots = slots.filter((slot) => slot <= timeRangeEnd);
    }

    return slots;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RESERVED":
        return "bg-gradient-to-br from-red-50 to-red-100/50 border-red-300 hover:from-red-100 hover:to-red-200 transition-all duration-200";
      case "AVAILABLE":
        return "bg-gradient-to-br from-green-50 to-emerald-50 border-green-300 hover:from-green-100 hover:to-emerald-100 transition-all duration-200";
      default:
        return "bg-gradient-to-br from-gray-50 to-gray-100/50 border-gray-300";
    }
  };

  const filteredTables = getFilteredTables();
  const filteredTimeSlots = getFilteredTimeSlots();

  const hasFilters = selectedZoneId !== "all" || timeRangeStart || timeRangeEnd;
  const totalPages = hasFilters ? 1 : Math.ceil(filteredTables.length / ITEMS_PER_PAGE);
  const startIndex = hasFilters ? 0 : (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = hasFilters ? filteredTables.length : startIndex + ITEMS_PER_PAGE;
  const paginatedTables = filteredTables.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedZoneId, timeRangeStart, timeRangeEnd]);

  if (!canViewTableStatusGrid) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t("common.error", { defaultValue: "Error" })}
          </h3>
          <p className="text-sm text-gray-600">
            {t("common.accessDenied", { defaultValue: "Access denied" })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 pb-10">
      <PageHeader
        title={t("admin.tableStatusGrid.title", { defaultValue: "Table Status Grid" })}
        description={t("admin.tableStatusGrid.description", {
          defaultValue: "View table reservations across time slots",
        })}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshGrid}
            disabled={loading}
            className="border-pink-200 text-pink-600 hover:bg-pink-50 shadow-sm"
          >
            <Icon path={mdiRefresh} size={0.67} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("admin.tableStatusGrid.refresh", { defaultValue: "Refresh" })}
          </Button>
        }
      />

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 bg-gradient-to-r from-pink-50 to-rose-50">
          <div className="p-2 rounded-lg bg-pink-100">
            <Icon path={mdiClock} size={0.83} className="text-pink-600" />
          </div>
          <div className="font-semibold text-gray-900">
            {t("admin.tableStatusGrid.tableReservations", {
              defaultValue: "Table Reservations",
            })}
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="bg-gradient-to-r from-pink-50/60 to-rose-50/60 rounded-lg p-4 border border-pink-100">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-4 flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDateChange(-1)}
                  className="flex-shrink-0 border-pink-200 text-pink-600 hover:bg-pink-50 shadow-sm"
                >
                  <Icon path={mdiChevronLeft} size={0.67} />
                </Button>

                <div className="flex-1 min-w-[160px]">
                  <Input
                    type="date"
                    value={formatDateInputValue(selectedDate)}
                    onChange={(e) => {
                      const parsed = parseDateInputValue(e.target.value);
                      if (parsed) setSelectedDate(parsed);
                    }}
                    className="bg-transparent border-pink-200 text-pink-700"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDateChange(1)}
                  className="flex-shrink-0 border-pink-200 text-pink-600 hover:bg-pink-50 shadow-sm"
                >
                  <Icon path={mdiChevronRight} size={0.67} />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date())}
                  className="flex-shrink-0 border-pink-200 text-pink-600 hover:bg-pink-50 shadow-sm"
                >
                  {t("admin.tableStatusGrid.today", { defaultValue: "Today" })}
                </Button>
              </div>

              {gridData?.operatingHours ? (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 whitespace-nowrap bg-white/60 rounded-md px-3 py-2 border border-gray-200">
                  <Icon path={mdiClock} size={0.5} className="text-pink-500" />
                  <span className="font-medium">
                    {gridData.operatingHours.open} - {gridData.operatingHours.close}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="bg-gradient-to-r from-pink-50/60 to-rose-50/60 rounded-lg p-4 border border-pink-100">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="p-1.5 rounded-md bg-pink-100">
                  <Icon path={mdiFilter} size={0.67} className="text-pink-600" />
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {t("admin.tableStatusGrid.filters", { defaultValue: "Filters" })}
                </span>
              </div>

              <Select value={selectedBranchId || "none"} onValueChange={handleBranchChange}>
                <SelectTrigger className="w-full sm:w-[200px] bg-white shadow-sm">
                  <SelectValue
                    placeholder={t("admin.tableStatusGrid.selectBranch", {
                      defaultValue: "Select Branch",
                    })}
                  />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="none">
                    {t("admin.tableStatusGrid.selectBranch", {
                      defaultValue: "Select Branch",
                    })}
                  </SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedZoneId || "all"}
                onValueChange={handleZoneChange}
                disabled={!selectedBranchId || loadingZones}
              >
                <SelectTrigger className="w-full sm:w-[200px] bg-white shadow-sm">
                  <SelectValue
                    placeholder={
                      selectedBranchId
                        ? t("admin.tableStatusGrid.allZones", { defaultValue: "All Zones" })
                        : t("admin.tableStatusGrid.selectBranchFirst", {
                            defaultValue: "Select Branch First",
                          })
                    }
                  />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">
                    {t("admin.tableStatusGrid.allZones", { defaultValue: "All Zones" })}
                  </SelectItem>
                  <SelectItem value="__UNASSIGNED__">
                    {t("admin.tableStatusGrid.unassigned", {
                      defaultValue: "Unassigned",
                    })}
                  </SelectItem>
                  {availableZones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="time"
                value={timeRangeStart}
                onChange={(e) => setTimeRangeStart(e.target.value)}
                className="w-full sm:w-[140px] bg-white shadow-sm"
              />

              <Input
                type="time"
                value={timeRangeEnd}
                onChange={(e) => setTimeRangeEnd(e.target.value)}
                className="w-full sm:w-[140px] bg-white shadow-sm"
              />

              {(timeRangeStart || timeRangeEnd) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTimeRangeStart("");
                    setTimeRangeEnd("");
                  }}
                  className="w-full sm:w-auto border-pink-200 text-pink-600 hover:bg-pink-50 shadow-sm"
                >
                  {t("admin.tableStatusGrid.clearTimeFilter", {
                    defaultValue: "Clear",
                  })}
                </Button>
              )}
            </div>
          </div>

          {!selectedBranchId ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 mb-4">
                <Icon path={mdiMapMarker} size={1.33} className="text-pink-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("admin.tableStatusGrid.selectBranchToView", {
                  defaultValue: "Select a Branch",
                })}
              </h3>
              <p className="text-sm text-gray-600">
                {t("admin.tableStatusGrid.selectBranchToViewDescription", {
                  defaultValue: "Please select a branch to view table status grid",
                })}
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 mb-4">
                  <Icon path={mdiRefresh} size={1.33} className="animate-spin text-pink-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t("admin.tableStatusGrid.loading", { defaultValue: "Loading..." })}
                </h3>
                <p className="text-sm text-gray-600">
                  {t("admin.tableStatusGrid.loadingDescription", {
                    defaultValue: "Fetching table status data",
                  })}
                </p>
              </div>
            </div>
          ) : !gridData || gridData.tables.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 mb-4">
                <Icon path={mdiClock} size={1.33} className="text-pink-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("admin.tableStatusGrid.noTablesAvailable", {
                  defaultValue: "No tables available",
                })}
              </h3>
              <p className="text-sm text-gray-600">
                {t("admin.tableStatusGrid.noTablesFound", {
                  defaultValue: "No tables found for the selected date",
                })}
              </p>
            </div>
          ) : (
            <div className="relative">
              {isMobile ? (
                <div className="flex justify-end mb-2 sm:hidden">
                  <Button
                    onClick={() => setIsRotated(!isRotated)}
                    variant="outline"
                    size="sm"
                    className={`border-pink-200 text-pink-600 hover:bg-pink-50 shadow-sm ${
                      isRotated
                        ? "bg-pink-500 text-white border-pink-500 hover:bg-pink-600"
                        : ""
                    }`}
                  >
                    {isRotated ? (
                      <>
                        <Icon path={mdiArrowCollapse} size={0.67} className="mr-2" />
                        {t("admin.tableStatusGrid.normal", {
                          defaultValue: "Normal",
                        })}
                      </>
                    ) : (
                      <>
                        <Icon path={mdiArrowExpand} size={0.67} className="mr-2" />
                        {t("admin.tableStatusGrid.fullView", {
                          defaultValue: "Full View",
                        })}
                      </>
                    )}
                  </Button>
                </div>
              ) : null}

              <div
                className={`w-full rounded-lg border border-gray-200 shadow-inner transition-all duration-300 ${
                  isRotated
                    ? "fixed inset-0 z-[50] overflow-hidden"
                    : "bg-gray-50 overflow-hidden"
                }`}
                style={
                  isRotated
                    ? {
                        transform: "rotate(90deg)",
                        transformOrigin: "center center",
                        width: "100vh",
                        height: "100vw",
                        left: "50%",
                        top: "50%",
                        marginLeft: "calc(-50vh)",
                        marginTop: "calc(-50vw)",
                        backgroundColor: "white",
                        display: "flex",
                        flexDirection: "column",
                      }
                    : {}
                }
              >
                {isRotated && (
                  <>
                    {showDatePicker && (
                      <div className="absolute top-4 left-4 right-4 z-[60] flex items-center justify-center sm:hidden">
                        <div className="flex items-center gap-2 bg-white/40 backdrop-blur-lg rounded-lg px-3 py-2 border border-gray-200/60 shadow-lg">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateChange(-1)}
                            className="border-pink-200/50 bg-white/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 shadow-sm h-8 w-8 p-0"
                          >
                            <Icon path={mdiChevronLeft} size={0.67} />
                          </Button>
                          <Input
                            type="date"
                            value={formatDateInputValue(selectedDate)}
                            onChange={(e) => {
                              const parsed = parseDateInputValue(e.target.value);
                              if (parsed) setSelectedDate(parsed);
                            }}
                            className="bg-white/30 backdrop-blur-lg border-pink-200/50 text-pink-700 min-w-[140px] h-8 text-xs"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateChange(1)}
                            className="border-pink-200/50 bg-white/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 shadow-sm h-8 w-8 p-0"
                          >
                            <Icon path={mdiChevronRight} size={0.67} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedDate(new Date())}
                            className="border-pink-200/50 bg-white/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 shadow-sm h-8 px-2 text-xs"
                          >
                            {t("admin.tableStatusGrid.today", { defaultValue: "Today" })}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="absolute top-4 right-4 z-[60] sm:hidden">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="bg-white/40 backdrop-blur-lg border-pink-200/50 text-pink-600 hover:bg-pink-50/40 shadow-lg h-8 w-8 p-0"
                      >
                        <Icon path={mdiCalendar} size={0.67} />
                      </Button>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 z-[60] flex items-center justify-between gap-2 sm:hidden flex-wrap">
                      <Button
                        onClick={() => setIsRotated(false)}
                        variant="outline"
                        size="sm"
                        className="bg-pink-500/30 backdrop-blur-lg text-white border-pink-500/50 hover:bg-pink-600/40 shadow-lg font-semibold"
                      >
                        <Icon path={mdiArrowCollapse} size={0.67} className="mr-2" />
                        {t("admin.tableStatusGrid.exitFullView", {
                          defaultValue: "Exit",
                        })}
                      </Button>

                      {!hasFilters && filteredTables.length > ITEMS_PER_PAGE ? (
                        <div className="flex items-center gap-2 bg-white/40 backdrop-blur-lg rounded-lg px-4 py-2 border border-gray-200/60 shadow-lg">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="border-pink-200/50 bg-white/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 disabled:opacity-50 shadow-sm h-8 w-8 p-0"
                          >
                            <Icon path={mdiChevronLeft} size={0.67} />
                          </Button>
                          <span className="text-sm font-semibold px-3 text-gray-900 bg-white/30 backdrop-blur-lg rounded-md py-1 border border-gray-200/60 min-w-[60px] text-center">
                            {currentPage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="border-pink-200/50 bg-white/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 disabled:opacity-50 shadow-sm h-8 w-8 p-0"
                          >
                            <Icon path={mdiChevronRight} size={0.67} />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                <div className={`${isRotated ? "flex-1 w-full overflow-x-auto overflow-y-auto" : "overflow-x-auto overflow-y-auto max-h-[650px]"}`}>
                  <table
                    className="border-collapse w-full"
                    style={
                      isRotated
                        ? {
                            tableLayout: "fixed",
                            width: "100%",
                            minHeight: "100%",
                          }
                        : {
                            minWidth: "100%",
                            tableLayout: "auto",
                          }
                    }
                  >
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-gradient-to-r from-pink-50 to-rose-50">
                        <th
                          className="sticky left-0 z-[30] bg-gradient-to-r from-pink-50 to-rose-50 border-b-2 border-pink-200 p-3 text-left font-bold shadow-[2px_0_4px_rgba(0,0,0,0.08)]"
                          style={isRotated ? { width: "15%" } : { width: "140px" }}
                        >
                          <span className="text-xs sm:text-sm text-pink-600 uppercase tracking-wide">
                            {t("admin.tableStatusGrid.table", {
                              defaultValue: "Table",
                            })}
                          </span>
                        </th>

                        {filteredTimeSlots.map((timeSlot) => (
                          <th
                            key={timeSlot}
                            className="border-b-2 border-pink-200 p-2 sm:p-3 text-center font-bold bg-gradient-to-r from-pink-50 to-rose-50"
                            style={
                              isRotated
                                ? { width: `${85 / filteredTimeSlots.length}%` }
                                : { minWidth: "110px" }
                            }
                          >
                            <span className="text-xs sm:text-sm whitespace-nowrap text-gray-900 font-semibold">
                              {timeSlot}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedTables.map((table, index) => (
                        <tr
                          key={table.id}
                          className={`hover:bg-gray-100/40 transition-colors ${
                            index % 2 === 0 ? "bg-white" : "bg-gray-50"
                          }`}
                        >
                          <td
                            className={`sticky left-0 z-[5] border-r-2 border-pink-200 p-3 shadow-[2px_0_4px_rgba(0,0,0,0.08)] ${
                              index % 2 === 0 ? "bg-white" : "bg-gray-50"
                            }`}
                            style={
                              isRotated
                                ? { width: "15%", verticalAlign: "top" }
                                : { width: "140px" }
                            }
                          >
                            <div className={`font-bold text-sm sm:text-base text-gray-900 mb-2 ${isRotated ? "text-base sm:text-lg" : ""}`}>
                              {table.tableNumber}
                            </div>
                            <div className={`text-[10px] sm:text-xs text-gray-600 flex flex-col gap-1.5 mt-2 ${isRotated ? "text-xs sm:text-sm" : ""}`}>
                              {table.zone ? (
                                <div className="flex items-center gap-1.5 bg-gray-100 rounded px-1.5 py-1">
                                  <Icon path={mdiMapMarker} size={isRotated ? 0.67 : 0.5} className="flex-shrink-0 text-pink-500" />
                                  <span className={`truncate ${isRotated ? "text-xs sm:text-sm" : "text-[9px] sm:text-[10px]"} font-medium`}>
                                    {table.zone}
                                  </span>
                                </div>
                              ) : null}
                              <div className="flex items-center gap-1.5 bg-gray-100 rounded px-1.5 py-1">
                                <Icon path={mdiAccountGroup} size={isRotated ? 0.67 : 0.5} className="flex-shrink-0 text-pink-500" />
                                <span className={`${isRotated ? "text-xs sm:text-sm" : "text-[9px] sm:text-[10px]"} font-medium`}>
                                  {table.capacity} {t("admin.tableStatusGrid.seats", { defaultValue: "seats" })}
                                </span>
                              </div>
                            </div>
                          </td>

                          {filteredTimeSlots.map((timeSlot) => {
                            const slotData = table.timeSlots[timeSlot];
                            const status = slotData?.status || "AVAILABLE";
                            const reservation = slotData?.reservation;

                            return (
                              <td
                                key={timeSlot}
                                className={`border border-gray-200 p-2 sm:p-3 text-center cursor-pointer transition-all duration-200 group ${getStatusColor(status)}`}
                                style={
                                  isRotated
                                    ? {
                                        width: `${85 / filteredTimeSlots.length}%`,
                                        verticalAlign: "middle",
                                      }
                                    : { minWidth: "110px" }
                                }
                                onClick={() => handleCellClick(table.id, table.tableNumber, timeSlot, reservation)}
                              >
                                {reservation ? (
                                  <div className="space-y-1.5 flex flex-col items-center">
                                    <div className="flex items-center gap-1.5 w-full justify-center">
                                      <Icon path={mdiCloseCircle} size={0.5} className="text-red-600 flex-shrink-0" />
                                      <div className="font-semibold text-[10px] sm:text-xs truncate leading-tight text-gray-900">
                                        {reservation.customerName}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-gray-600 text-[9px] sm:text-[10px]">
                                      <Icon path={mdiAccountGroup} size={0.33} />
                                      <span>
                                        {reservation.numberOfGuests} {t("admin.tableStatusGrid.guests", { defaultValue: "guests" })}
                                      </span>
                                    </div>
                                    <Badge
                                      variant={reservation.status === "CONFIRMED" ? "default" : "secondary"}
                                      className="text-[8px] sm:text-[10px] px-1.5 py-0.5 mt-0.5 h-auto leading-tight shadow-sm"
                                    >
                                      {reservation.status}
                                    </Badge>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <Icon path={mdiCheckCircle} size={0.67} className="text-green-600" />
                                    <span className="text-[9px] sm:text-xs font-medium text-green-700">
                                      {t("admin.tableStatusGrid.available", { defaultValue: "Available" })}
                                    </span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!hasFilters && filteredTables.length > ITEMS_PER_PAGE ? (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 bg-gradient-to-r from-pink-50/50 to-rose-50/50 -mx-5 px-5 pb-1 rounded-b-xl">
              <p className="text-sm font-medium text-gray-900">
                {t("admin.tableStatusGrid.showing", { defaultValue: "Showing" })}{" "}
                <span className="text-pink-600 font-semibold">{paginatedTables.length}</span> {t("admin.tableStatusGrid.of", { defaultValue: "of" })}{" "}
                <span className="text-pink-600 font-semibold">{filteredTables.length}</span>{" "}
                {t("admin.tableStatusGrid.tables", { defaultValue: "tables" })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="border-pink-200 text-pink-600 hover:bg-pink-50 disabled:opacity-50 shadow-sm"
                >
                  <Icon path={mdiChevronLeft} size={0.67} />
                </Button>
                <span className="text-sm font-semibold px-4 text-gray-900 bg-white rounded-md py-1 border border-gray-200">
                  {currentPage} {t("admin.tableStatusGrid.of", { defaultValue: "of" })} {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="border-pink-200 text-pink-600 hover:bg-pink-50 disabled:opacity-50 shadow-sm"
                >
                  <Icon path={mdiChevronRight} size={0.67} />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-gray-200">
          <DialogHeader className="pb-4 border-b border-gray-200">
            <DialogTitle className="text-lg sm:text-xl text-gray-900 flex items-center gap-2">
              <div className="p-2 rounded-lg bg-pink-100">
                <Icon path={mdiClock} size={0.83} className="text-pink-600" />
              </div>
              <div>
                <div className="font-bold">
                  {t("admin.tableStatusGrid.reservationDetails", {
                    defaultValue: "Reservation Details",
                  })}
                </div>
                <div className="text-sm font-normal text-gray-600 mt-1">
                  {selectedCell?.tableNumber} {t("admin.tableStatusGrid.at", { defaultValue: "at" })} {selectedCell?.timeSlot}
                </div>
              </div>
            </DialogTitle>
            {selectedCell?.reservation ? (
              <DialogDescription className="text-xs sm:text-sm text-gray-600 mt-2 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  #{selectedCell.reservation.reservationNumber}
                </Badge>
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {selectedCell?.reservation ? (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.customerName", { defaultValue: "Customer" })}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100">
                      <Icon path={mdiAccountGroup} size={0.67} className="text-pink-600" />
                    </div>
                    <span className="text-gray-900 font-semibold">{selectedCell.reservation.customerName}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.numberOfGuests", { defaultValue: "Guests" })}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100">
                      <Icon path={mdiAccountGroup} size={0.67} className="text-pink-600" />
                    </div>
                    <span className="text-gray-900 font-semibold">{selectedCell.reservation.numberOfGuests}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.phone", { defaultValue: "Phone" })}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100">
                      <Icon path={mdiPhone} size={0.67} className="text-pink-600" />
                    </div>
                    <span className="text-gray-900 font-semibold">{selectedCell.reservation.customerPhone}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.email", { defaultValue: "Email" })}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100">
                      <Icon path={mdiEmail} size={0.67} className="text-pink-600" />
                    </div>
                    <span className="text-gray-900 font-semibold break-all">{selectedCell.reservation.customerEmail}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.status", { defaultValue: "Status" })}
                  </label>
                  <div className="mt-1">
                    <Badge
                      variant={selectedCell.reservation.status === "CONFIRMED" ? "default" : "secondary"}
                      className="text-xs px-3 py-1 shadow-sm"
                    >
                      {selectedCell.reservation.status}
                    </Badge>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.type", { defaultValue: "Type" })}
                  </label>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-xs px-3 py-1 shadow-sm">
                      {selectedCell.reservation.type}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedCell.reservation.user ? (
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-4 border border-pink-100">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.userAccount", { defaultValue: "User Account" })}
                  </label>
                  <div className="text-gray-900 font-semibold">
                    {selectedCell.reservation.user.firstName || selectedCell.reservation.user.lastName
                      ? `${selectedCell.reservation.user.firstName || ""} ${selectedCell.reservation.user.lastName || ""}`.trim()
                      : selectedCell.reservation.user.email}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                <Button
                  onClick={() => setIsDetailsDialogOpen(false)}
                  className="bg-pink-600 hover:bg-pink-700 text-white shadow-sm px-6"
                >
                  {t("admin.tableStatusGrid.close", { defaultValue: "Close" })}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <Icon path={mdiCheckCircle} size={1.33} className="text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("admin.tableStatusGrid.tableAvailable", {
                  defaultValue: "Table Available",
                })}
              </h3>
              <p className="text-sm text-gray-600">
                {t("admin.tableStatusGrid.tableAvailableAt", {
                  defaultValue: "Table is available at {{timeSlot}}",
                  timeSlot: selectedCell?.timeSlot,
                })}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableStatusGrid;
