import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Icon from "@mdi/react";
import { mdiCalendar, mdiChevronLeft, mdiChevronRight, mdiFilter, mdiRefresh, mdiMapMarker, mdiAccountGroup, mdiPhone, mdiEmail, mdiClock, mdiCheckCircle, mdiCloseCircle, mdiArrowExpand, mdiArrowCollapse } from "@mdi/js";
import { DatePicker } from "@/components/ui/date-picker";

const ITEMS_PER_PAGE = 12;
import ApiService from "@/services/apiService";
import branchService, { type Branch } from "@/services/branchService";
import { reservationService, type Zone } from "@/services/reservationService";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePermissions } from "@/contexts/PermissionContext";
import { RESOURCES, ACTIONS } from "@/lib/permissions";

interface TableStatusGridData {
  date: string;
  timeSlots: string[];
  tables: Array<{
    id: string;
    tableNumber: string;
    capacity: number;
    zone: string | null;
    status: string;
    timeSlots: Record<string, {
      status: "AVAILABLE" | "RESERVED";
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
    }>;
  }>;
  operatingHours: {
    open: string;
    close: string;
  };
}

const TableStatusGrid: React.FC = () => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const { assignedBranchIds, canAny } = usePermissions();

  const canViewTableStatusGrid = canAny([
    { resource: RESOURCES.TABLE_STATUS_GRID, action: ACTIONS.VIEW },
  ]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [gridData, setGridData] = useState<TableStatusGridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    tableId: string;
    tableNumber: string;
    timeSlot: string;
    reservation: any;
  } | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>("all");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [, setLoadingBranches] = useState(false);
  const [loadingZones, setLoadingZones] = useState(false);
  const [timeRangeStart, setTimeRangeStart] = useState<string>("");
  const [timeRangeEnd, setTimeRangeEnd] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRotated, setIsRotated] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(true);

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
      const token = await getToken();
      const response = await reservationService.getZones(branchId, token || undefined);
      setAvailableZones(response.zones);
    } catch (error) {
      console.error("Error loading zones:", error);
      setAvailableZones([]);
    } finally {
      setLoadingZones(false);
    }
  };

  const loadGridData = async () => {
    if (!selectedBranchId) {
      setGridData(null);
      return;
    }
    try {
      setLoading(true);
      const token = await getToken();
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const apiService = ApiService.getInstance();
      const params = new URLSearchParams({
        date: dateStr,
        branchId: selectedBranchId,
      });
      if (selectedZoneId && selectedZoneId !== "all") {
        params.append("zoneId", selectedZoneId);
      }
      const result = await apiService.get(
        `/api/reservations/tables/status-grid?${params.toString()}`,
        token || undefined
      );

      if (result.success) {
        setGridData(result.data);
      } else {
        throw new Error(result.error || "Failed to load data");
      }
    } catch (error: any) {
      console.error("Error loading grid data:", error);
      toast.error(error.message || "Failed to load table status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canViewTableStatusGrid) {
      loadBranches();
    }
  }, []);

  useEffect(() => {
    if (!canViewTableStatusGrid) {
      setGridData(null);
      setAvailableZones([]);
      return;
    }
    if (selectedBranchId) {
      loadZones(selectedBranchId);
      loadGridData();
    } else {
      setGridData(null);
      setAvailableZones([]);
    }
  }, [selectedBranchId, selectedDate, selectedZoneId]);

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const handleCellClick = (tableId: string, tableNumber: string, timeSlot: string, reservation: any) => {
    setSelectedCell({
      tableId,
      tableNumber,
      timeSlot,
      reservation,
    });
    setIsDetailsDialogOpen(true);
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    setSelectedZoneId("all"); // Reset zone when branch changes
  };

  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
  };

  const getFilteredTables = () => {
    if (!gridData) return [];
    // Backend already filters by branch and zone, so just return all tables
    return gridData.tables;
  };

  const getFilteredTimeSlots = () => {
    if (!gridData) return [];
    let slots = gridData.timeSlots;

    // Filter by time range
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
        return "bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-300 dark:border-red-800/50 hover:from-red-100 hover:to-red-150 dark:hover:from-red-950/50 dark:hover:to-red-900/30 transition-all duration-200";
      case "AVAILABLE":
        return "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 border-green-300 dark:border-green-800/50 hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-950/50 dark:hover:to-emerald-950/30 transition-all duration-200";
      default:
        return "bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-900/30 dark:to-gray-800/20 border-gray-300 dark:border-gray-700/50";
    }
  };

  const filteredTables = getFilteredTables();
  const filteredTimeSlots = getFilteredTimeSlots();

  // Check if filters are applied
  const hasFilters = selectedZoneId !== "all" || timeRangeStart || timeRangeEnd;
  
  // Pagination logic - only apply when no filters
  const totalPages = hasFilters ? 1 : Math.ceil(filteredTables.length / ITEMS_PER_PAGE);
  const startIndex = hasFilters ? 0 : (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = hasFilters ? filteredTables.length : startIndex + ITEMS_PER_PAGE;
  const paginatedTables = filteredTables.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedZoneId, timeRangeStart, timeRangeEnd]);

  return (
    <div className="space-y-6 pb-6">
      {!canViewTableStatusGrid ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("common.error")}
            </h3>
            <p className="text-sm text-muted-foreground">
              Access denied
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.tableStatusGrid.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.tableStatusGrid.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadGridData}
                disabled={loading}
              className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 shadow-sm"
              >
                <Icon path={mdiRefresh} size={0.67} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
                {t("admin.tableStatusGrid.refresh")}
              </Button>
          </div>
        </div>

        <Card className="shadow-lg border-2">
        <CardHeader className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
              <Icon path={mdiClock} size={0.83} className="text-pink-600 dark:text-pink-400" />
            </div>
            <span className="text-foreground">{t("admin.tableStatusGrid.tableReservations")}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {/* Date Selector */}
          <div className="bg-gradient-to-r from-pink-50/50 to-rose-50/50 dark:from-pink-950/10 dark:to-rose-950/10 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-4 flex-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange(-1)}
                className="flex-shrink-0 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 shadow-sm"
              >
                <Icon path={mdiChevronLeft} size={0.67} />
              </Button>
              <DatePicker
                date={selectedDate}
                onDateChange={(date) => date && setSelectedDate(date)}
                placeholder={t("admin.tableStatusGrid.selectDate")}
                variant="outline"
                className="bg-transparent border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 min-w-[160px] justify-start text-left font-normal h-10 flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange(1)}
                className="flex-shrink-0 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 shadow-sm"
              >
                <Icon path={mdiChevronRight} size={0.67} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
                className="flex-shrink-0 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 shadow-sm"
              >
                {t("admin.tableStatusGrid.today")}
              </Button>
              </div>
              {gridData?.operatingHours && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground text-center sm:text-right whitespace-nowrap bg-background/50 rounded-md px-3 py-2 border border-border">
                  <Icon path={mdiClock} size={0.50} className="text-pink-500" />
                  <span className="font-medium">{gridData.operatingHours.open} - {gridData.operatingHours.close}</span>
                </div>
              )}
            </div>
          </div>

          {/* Branch and Zone Filters */}
          <div className="bg-gradient-to-r from-pink-50/50 to-rose-50/50 dark:from-pink-950/10 dark:to-rose-950/10 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30">
                  <Icon path={mdiFilter} size={0.67} className="text-pink-600 dark:text-pink-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">{t("admin.tableStatusGrid.filters")}</span>
              </div>
              <Select value={selectedBranchId || "none"} onValueChange={handleBranchChange}>
                <SelectTrigger className="w-full sm:w-[180px] bg-transparent shadow-sm">
                  <SelectValue placeholder={t("admin.tableStatusGrid.selectBranch") || "Select Branch"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("admin.tableStatusGrid.selectBranch") || "Select Branch"}</SelectItem>
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
                <SelectTrigger className="w-full sm:w-[180px] bg-transparent shadow-sm">
                  <SelectValue placeholder={selectedBranchId ? (t("admin.tableStatusGrid.allZones")) : (t("admin.tableStatusGrid.selectBranchFirst") || "Select Branch First")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("admin.tableStatusGrid.allZones")}</SelectItem>
                  <SelectItem value="__UNASSIGNED__">{t("admin.tableStatusGrid.unassigned")}</SelectItem>
                  {availableZones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                placeholder={t("admin.tableStatusGrid.startTime")}
                value={timeRangeStart}
                onChange={(e) => setTimeRangeStart(e.target.value)}
                className="w-full sm:w-[140px] bg-transparent shadow-sm"
              />
              <Input
                type="time"
                placeholder={t("admin.tableStatusGrid.endTime")}
                value={timeRangeEnd}
                onChange={(e) => setTimeRangeEnd(e.target.value)}
                className="w-full sm:w-[140px] bg-transparent shadow-sm"
              />
              {(timeRangeStart || timeRangeEnd) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTimeRangeStart("");
                    setTimeRangeEnd("");
                  }}
                  className="w-full sm:w-auto border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 shadow-sm"
                >
                  {t("admin.tableStatusGrid.clearTimeFilter")}
                </Button>
              )}
            </div>
          </div>

          {/* Grid */}
          {!selectedBranchId ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 dark:bg-pink-900/30 mb-4">
                <Icon path={mdiMapMarker} size={1.33} className="text-pink-500 dark:text-pink-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.tableStatusGrid.selectBranchToView") || "Select a Branch"}</h3>
              <p className="text-sm text-muted-foreground">{t("admin.tableStatusGrid.selectBranchToViewDescription") || "Please select a branch to view table status grid"}</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 dark:bg-pink-900/30 mb-4">
                  <Icon path={mdiRefresh} size={1.33} className="animate-spin text-pink-600 dark:text-pink-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t("admin.tableStatusGrid.loading")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.tableStatusGrid.loadingDescription")}
                </p>
              </div>
            </div>
          ) : !gridData || gridData.tables.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 dark:bg-pink-900/30 mb-4">
                <Icon path={mdiClock} size={1.33} className="text-pink-500 dark:text-pink-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.tableStatusGrid.noTablesAvailable")}</h3>
              <p className="text-sm text-muted-foreground">{t("admin.tableStatusGrid.noTablesFound")}</p>
            </div>
          ) : (
            <div className="relative">
              {/* Full View Button - Mobile Only - Outside table */}
              <div className="flex justify-end mb-2 sm:hidden">
                <Button
                  onClick={() => setIsRotated(!isRotated)}
                  variant="outline"
                  size="sm"
                  className={`border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 shadow-sm ${
                    isRotated ? 'bg-pink-500 text-white border-pink-500 hover:bg-pink-600' : ''
                  }`}
                >
                  {isRotated ? (
                    <>
                      <Icon path={mdiArrowCollapse} size={0.67} className="mr-2" />
                      {t("admin.tableStatusGrid.normal")}
                    </>
                  ) : (
                    <>
                      <Icon path={mdiArrowExpand} size={0.67} className="mr-2" />
                      {t("admin.tableStatusGrid.fullView")}
                    </>
                  )}
                </Button>
              </div>
              
              <div 
                className={`w-full rounded-lg border border-border shadow-inner transition-all duration-300 sm:transition-none ${
                  isRotated 
                    ? 'fixed inset-0 z-[50] sm:relative sm:z-auto sm:inset-auto overflow-hidden' 
                    : 'bg-muted/20 overflow-hidden'
                }`}
                style={isRotated ? {
                  transform: 'rotate(90deg)',
                  transformOrigin: 'center center',
                  width: '100vh',
                  height: '100vw',
                  left: '50%',
                  top: '50%',
                  marginLeft: 'calc(-50vh)',
                  marginTop: 'calc(-50vw)',
                  backgroundColor: 'hsl(var(--background))',
                  display: 'flex',
                  flexDirection: 'column'
                } : {}}
              >
                {/* Full View Controls - Mobile Only */}
                {isRotated && (
                  <>
                    {/* Date Navigation - Top */}
                    {showDatePicker && (
                      <div className="absolute top-4 left-4 right-4 z-[60] flex items-center justify-center sm:hidden">
                        <div className="flex items-center gap-2 bg-background/30 backdrop-blur-lg rounded-lg px-3 py-2 border border-border/40 shadow-lg">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateChange(-1)}
                            className="border-pink-200/40 bg-background/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 shadow-sm h-8 w-8 p-0 flex-shrink-0"
                          >
                            <Icon path={mdiChevronLeft} size={0.67} />
                          </Button>
                          <DatePicker
                            date={selectedDate}
                            onDateChange={(date) => date && setSelectedDate(date)}
                            placeholder={t("admin.tableStatusGrid.selectDate")}
                            variant="outline"
                            className="bg-background/30 backdrop-blur-lg border-pink-200/40 text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 min-w-[140px] h-8 text-xs"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateChange(1)}
                            className="border-pink-200/40 bg-background/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 shadow-sm h-8 w-8 p-0 flex-shrink-0"
                          >
                            <Icon path={mdiChevronRight} size={0.67} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedDate(new Date())}
                            className="border-pink-200/40 bg-background/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 shadow-sm h-8 px-2 text-xs flex-shrink-0"
                          >
                            {t("admin.tableStatusGrid.today")}
                          </Button>
                        </div>
                      </div>
                    )}
                    {/* Toggle Date Picker Button - Top Right */}
                    <div className="absolute top-4 right-4 z-[60] sm:hidden">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="bg-background/30 backdrop-blur-lg border-pink-200/40 text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 shadow-lg h-8 w-8 p-0"
                      >
                        <Icon path={mdiCalendar} size={0.67} />
                      </Button>
                    </div>
                    {/* Exit and Pagination - Bottom */}
                    <div className="absolute bottom-4 left-4 right-4 z-[60] flex items-center justify-between gap-2 sm:hidden flex-wrap">
                      <Button
                        onClick={() => setIsRotated(false)}
                        variant="outline"
                        size="sm"
                        className="bg-pink-500/30 backdrop-blur-lg text-white border-pink-500/40 hover:bg-pink-600/40 shadow-lg font-semibold flex-shrink-0"
                      >
                        <Icon path={mdiArrowCollapse} size={0.67} className="mr-2" />
                        {t("admin.tableStatusGrid.exitFullView")}
                      </Button>
                      {/* Pagination */}
                      {!hasFilters && filteredTables.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center gap-2 bg-background/30 backdrop-blur-lg rounded-lg px-4 py-2 border border-border/40 shadow-lg flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="border-pink-200/40 bg-background/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 disabled:opacity-50 shadow-sm h-8 w-8 p-0"
                          >
                            <Icon path={mdiChevronLeft} size={0.67} />
                          </Button>
                          <span className="text-sm font-semibold px-3 text-foreground bg-background/30 backdrop-blur-lg rounded-md py-1 border border-border/40 min-w-[60px] text-center">
                            {currentPage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="border-pink-200/40 bg-background/30 backdrop-blur-lg text-pink-600 hover:bg-pink-50/40 dark:border-pink-400/40 dark:text-pink-400 dark:hover:bg-pink-500/20 disabled:opacity-50 shadow-sm h-8 w-8 p-0"
                          >
                            <Icon path={mdiChevronRight} size={0.67} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                <div className={`${isRotated ? 'flex-1 w-full overflow-x-auto overflow-y-auto' : 'overflow-x-auto overflow-y-auto max-h-[600px]'}`}>
                  <table 
                    className="border-collapse w-full"
                    style={isRotated ? { 
                      tableLayout: 'fixed',
                      width: '100%',
                      minHeight: '100%'
                    } : { 
                      minWidth: '100%', 
                      tableLayout: 'auto' 
                    }}
                  >
                    <thead className={`${isRotated ? 'sticky top-0' : 'sticky top-0'} z-20`}>
                      <tr className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950">
                        <th 
                          className={`${isRotated ? 'sticky left-0' : 'sticky left-0'} z-[30] bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950 border-b-2 border-pink-200 dark:border-pink-800 p-3 text-left font-bold shadow-[2px_0_4px_rgba(0,0,0,0.1)]`}
                          style={isRotated ? { width: '15%' } : { width: '120px' }}
                        >
                          <span className="text-xs sm:text-sm text-pink-600 dark:text-pink-400 uppercase tracking-wide">{t("admin.tableStatusGrid.table")}</span>
                        </th>
                        {filteredTimeSlots.map((timeSlot) => (
                          <th
                            key={timeSlot}
                            className="border-b-2 border-pink-200 dark:border-pink-800 p-2 sm:p-3 text-center font-bold bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950"
                            style={isRotated ? { width: `${85 / filteredTimeSlots.length}%` } : { minWidth: '100px' }}
                          >
                            <span className="text-xs sm:text-sm whitespace-nowrap text-foreground font-semibold">{timeSlot}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                  <tbody>
                    {paginatedTables.map((table, index) => (
                      <tr 
                        key={table.id} 
                        className={`hover:bg-muted/30 transition-colors ${index % 2 === 0 ? 'bg-background' : isRotated ? 'bg-muted' : 'bg-muted/10'}`}
                      >
                        <td 
                          className={`${isRotated ? 'sticky left-0' : 'sticky left-0'} z-[5] border-r-2 border-pink-200 dark:border-pink-800 p-3 shadow-[2px_0_4px_rgba(0,0,0,0.1)] ${index % 2 === 0 ? 'bg-background dark:bg-background' : 'bg-muted dark:bg-muted'}`}
                          style={isRotated ? { width: '15%', verticalAlign: 'top' } : { width: '120px' }}
                        >
                          <div className={`font-bold text-sm sm:text-base text-foreground mb-2 ${isRotated ? 'text-base sm:text-lg' : ''}`}>{table.tableNumber}</div>
                          <div className={`text-[10px] sm:text-xs text-muted-foreground flex flex-col gap-1.5 mt-2 ${isRotated ? 'text-xs sm:text-sm' : ''}`}>
                            {table.zone && (
                              <div className="flex items-center gap-1.5 bg-muted/50 rounded px-1.5 py-1">
                                <Icon path={mdiMapMarker} size={isRotated ? 0.67 : 0.5} className="flex-shrink-0 text-pink-500" />
                                <span className={`truncate ${isRotated ? 'text-xs sm:text-sm' : 'text-[9px] sm:text-[10px]'} font-medium`}>{table.zone}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 bg-muted/50 rounded px-1.5 py-1">
                              <Icon path={mdiAccountGroup} size={isRotated ? 0.67 : 0.5} className="flex-shrink-0 text-pink-500" />
                              <span className={`${isRotated ? 'text-xs sm:text-sm' : 'text-[9px] sm:text-[10px]'} font-medium`}>{table.capacity} {t("admin.tableStatusGrid.seats")}</span>
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
                              className={`border border-border/50 p-2 sm:p-3 text-center cursor-pointer transition-all duration-200 group ${getStatusColor(
                                status
                              )}`}
                              style={isRotated ? { 
                                width: `${85 / filteredTimeSlots.length}%`,
                                verticalAlign: 'middle'
                              } : { minWidth: '100px' }}
                              onClick={() =>
                                handleCellClick(
                                  table.id,
                                  table.tableNumber,
                                  timeSlot,
                                  reservation
                                )
                              }
                            >
                              {reservation ? (
                                <div className="space-y-1.5 flex flex-col items-center">
                                  <div className="flex items-center gap-1.5 w-full justify-center">
                                    <Icon path={mdiCloseCircle} size={0.50} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                                    <div className="font-semibold text-[10px] sm:text-xs truncate leading-tight text-foreground">
                                      {reservation.customerName}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 text-muted-foreground text-[9px] sm:text-[10px]">
                                    <Icon path={mdiAccountGroup} size={0.33} />
                                    <span>{reservation.numberOfGuests} {t("admin.tableStatusGrid.guests")}</span>
                                  </div>
                                  <Badge
                                    variant={
                                      reservation.status === "CONFIRMED"
                                        ? "default"
                                        : "secondary"
                                    }
                                    className="text-[8px] sm:text-[10px] px-1.5 py-0.5 mt-0.5 h-auto leading-tight shadow-sm"
                                  >
                                    {reservation.status}
                                  </Badge>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <Icon path={mdiCheckCircle} size={0.67} className="text-green-600 dark:text-green-400" />
                                  <span className="text-[9px] sm:text-xs font-medium text-green-700 dark:text-green-400">
                                    {t("admin.tableStatusGrid.available")}
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

          {/* Pagination Controls - Only show when no filters applied */}
          {!hasFilters && filteredTables.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between pt-4 border-t border-border bg-gradient-to-r from-pink-50/50 to-rose-50/50 dark:from-pink-950/10 dark:to-rose-950/10 -mx-6 px-6 pb-0 rounded-b-lg">
              <p className="text-sm font-medium text-foreground">
                Showing <span className="text-pink-600 dark:text-pink-400 font-semibold">{paginatedTables.length}</span> of <span className="text-pink-600 dark:text-pink-400 font-semibold">{filteredTables.length}</span> {t("admin.tableStatusGrid.table")}s
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 disabled:opacity-50 shadow-sm"
                >
                  <Icon path={mdiChevronLeft} size={0.67} />
                </Button>
                <span className="text-sm font-semibold px-4 text-foreground bg-background rounded-md py-1 border border-border">
                  {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 disabled:opacity-50 shadow-sm"
                >
                  <Icon path={mdiChevronRight} size={0.67} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reservation Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background border-border">
          <DialogHeader className="pb-4 border-b border-border">
            <DialogTitle className="text-lg sm:text-xl text-foreground flex items-center gap-2">
              <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                <Icon path={mdiClock} size={0.83} className="text-pink-600 dark:text-pink-400" />
              </div>
              <div>
                <div className="font-bold">{t("admin.tableStatusGrid.reservationDetails")}</div>
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  {selectedCell?.tableNumber} {t("admin.tableStatusGrid.at")} {selectedCell?.timeSlot}
                </div>
              </div>
            </DialogTitle>
            {selectedCell?.reservation && (
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-2 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  #{selectedCell.reservation.reservationNumber}
                </Badge>
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedCell?.reservation ? (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.customerName")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30">
                      <Icon path={mdiAccountGroup} size={0.67} className="text-pink-600 dark:text-pink-400" />
                    </div>
                    <span className="text-foreground font-semibold">{selectedCell.reservation.customerName}</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.numberOfGuests")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30">
                      <Icon path={mdiAccountGroup} size={0.67} className="text-pink-600 dark:text-pink-400" />
                    </div>
                    <span className="text-foreground font-semibold">{selectedCell.reservation.numberOfGuests}</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.phone")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30">
                      <Icon path={mdiPhone} size={0.67} className="text-pink-600 dark:text-pink-400" />
                    </div>
                    <span className="text-foreground font-semibold">{selectedCell.reservation.customerPhone}</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.email")}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-pink-100 dark:bg-pink-900/30">
                      <Icon path={mdiEmail} size={0.67} className="text-pink-600 dark:text-pink-400" />
                    </div>
                    <span className="text-foreground font-semibold break-all">{selectedCell.reservation.customerEmail}</span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.status")}
                  </label>
                  <div className="mt-1">
                    <Badge
                      variant={
                        selectedCell.reservation.status === "CONFIRMED"
                          ? "default"
                          : "secondary"
                      }
                      className="text-xs px-3 py-1 shadow-sm"
                    >
                      {selectedCell.reservation.status}
                    </Badge>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.type")}
                  </label>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-xs px-3 py-1 shadow-sm">
                      {selectedCell.reservation.type}
                    </Badge>
                  </div>
                </div>
              </div>
              {selectedCell.reservation.user && (
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 rounded-lg p-4 border border-pink-100 dark:border-pink-900/30">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    {t("admin.tableStatusGrid.userAccount")}
                  </label>
                  <div className="text-foreground font-semibold">
                    {selectedCell.reservation.user.firstName ||
                    selectedCell.reservation.user.lastName
                      ? `${selectedCell.reservation.user.firstName || ""} ${
                          selectedCell.reservation.user.lastName || ""
                        }`.trim()
                      : selectedCell.reservation.user.email}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button
                  onClick={() => setIsDetailsDialogOpen(false)}
                  className="bg-pink-500 hover:bg-pink-600 text-white shadow-lg px-6"
                >
                  {t("admin.tableStatusGrid.close")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <Icon path={mdiCheckCircle} size={1.33} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.tableStatusGrid.tableAvailable")}</h3>
              <p className="text-sm text-muted-foreground">{t("admin.tableStatusGrid.tableAvailableAt", { timeSlot: selectedCell?.timeSlot })}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
};

export default TableStatusGrid;
