import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Icon from "@mdi/react";
import { mdiChartBar, mdiAccount, mdiAccountGroup, mdiCurrencyUsd, mdiCalendar, mdiChevronDown, mdiRefresh, mdiClock, mdiCloseCircle, mdiCheckCircle, mdiAlertCircle, mdiChartPie, mdiCalendarClock, mdiTrendingUp } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { reservationService } from "@/services/reservationService";
import Chart, { type ChartData } from "@/components/admin/Chart";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import branchService, { type Branch } from "@/services/branchService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/contexts/PermissionContext";

interface ReservationAnalyticsData {
  summary: {
    totalReservations: number;
    totalGuests: number;
    avgGuestsPerReservation: number;
    totalRevenue: number;
    totalTaxAmount: number;
    totalRemainingAmount: number;
    cancellationRate: number;
    noShowRate: number;
    completionRate: number;
  };
  statusBreakdown: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  reservationsOverTime: Array<{
    label: string;
    count: number;
    guests: number;
    revenue: number;
  }>;
  peakHours: Array<{
    hour: number;
    count: number;
    label: string;
  }>;
  dayOfWeekBreakdown: Array<{
    day: number;
    label: string;
    count: number;
  }>;
  guestSizeDistribution: Array<{
    size: number;
    count: number;
    totalGuests?: number;
    label: string;
    type?: string;
  }>;
  statusCounts: {
    pending: number;
    confirmed: number;
    seated: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
}

const ReservationAnalytics: React.FC = () => {
  const { getToken, userRole, userType, orgRole } = useAuth();
  const { assignedBranchIds, isSuperAdmin } = usePermissions();
  const navigate = useNavigate();
  const { currency } = useSettings();
  const { subscribe } = useAdminWebSocket();
  const { t } = useTranslation();

  const STORAGE_KEY = "bellami:reservationAnalytics:filters";

  const getStoredState = ():
    | {
        selectedPeriod?: string;
        selectedBranchId?: string;
      }
    | null => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || typeof parsed !== "object") return null;
      return {
        selectedPeriod: parsed.selectedPeriod,
        selectedBranchId: parsed.selectedBranchId,
      };
    } catch {
      return null;
    }
  };

  const stored = getStoredState();

  const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  const canSelectAllBranches = isSuperAdmin || isOrgAdmin;
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    typeof stored?.selectedPeriod === "string" && stored.selectedPeriod.trim()
      ? stored.selectedPeriod
      : "last_30_days"
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    typeof stored?.selectedBranchId === "string" && stored.selectedBranchId.trim()
      ? stored.selectedBranchId
      : "all"
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<ReservationAnalyticsData | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [branchReservationsChartData, setBranchReservationsChartData] =
    useState<ChartData | null>(null);

  // Persist filters to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selectedPeriod,
          selectedBranchId,
        })
      );
    } catch {
      // Ignore storage write errors
    }
  }, [STORAGE_KEY, selectedBranchId, selectedPeriod]);

  // Redirect if not admin
  useEffect(() => {
    if (userRole !== "ADMIN") {
      navigate("/");
    }
  }, [userRole, navigate]);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        const token = await getToken();
        const fetchedBranches = await branchService.getBranches(token || undefined);
        setBranches(fetchedBranches);

        const branchExists = (id: string) => fetchedBranches.some((b) => b.id === id);
        const allowedBranchIdsForUser = !canSelectAllBranches
          ? assignedBranchIds.filter((id) => branchExists(id))
          : [];

        const isAllowedSelection = (value: string) => {
          if (value === "all") return canSelectAllBranches;
          if (!branchExists(value)) return false;
          if (canSelectAllBranches) return true;
          if (allowedBranchIdsForUser.length > 0) return allowedBranchIdsForUser.includes(value);
          return true;
        };

        const getDefaultSelection = () => {
          if (canSelectAllBranches) return "all";
          if (allowedBranchIdsForUser.length > 0) return allowedBranchIdsForUser[0];
          return fetchedBranches[0]?.id || "";
        };

        setSelectedBranchId((prev) => {
          if (prev && isAllowedSelection(prev)) return prev;
          return getDefaultSelection();
        });
      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [assignedBranchIds, canSelectAllBranches, getToken, isSuperAdmin, userType]);

  const timePeriods = [
    { value: "today", label: t("admin.categoryInsights.periods.today") },
    { value: "this_week", label: t("admin.categoryInsights.periods.thisWeek") },
    {
      value: "this_month",
      label: t("admin.categoryInsights.periods.thisMonth"),
    },
    {
      value: "last_7_days",
      label: t("admin.categoryInsights.periods.last7Days"),
    },
    {
      value: "last_30_days",
      label: t("admin.categoryInsights.periods.last30Days"),
    },
    {
      value: "last_3_months",
      label: t("admin.categoryInsights.periods.last3Months"),
    },
    {
      value: "last_6_months",
      label: t("admin.categoryInsights.periods.last6Months"),
    },
    { value: "last_year", label: t("admin.categoryInsights.periods.lastYear") },
  ];

  // Fetch analytics data when period or branch changes
  useEffect(() => {
    fetchAnalyticsData();
  }, [selectedPeriod, selectedBranchId]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const unsubscribe = subscribe("reservation-update", () => {
      fetchAnalyticsData();
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedBranchId, subscribe]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
      const isAllBranches = selectedBranchId === "all";

      const promises: Promise<any>[] = [
        reservationService.getReservationAnalytics(
          selectedPeriod,
          branchIdForApi,
          token || undefined
        ),
      ];

      // Only fetch branch reservations chart when "all" is selected
      if (isAllBranches) {
        promises.push(
          reservationService.getBranchReservationsChart(
            selectedPeriod,
            token || undefined
          )
        );
      }

      const results = await Promise.all(promises);
      setAnalyticsData(results[0]);

      if (isAllBranches) {
        setBranchReservationsChartData(results[1]);
      } else {
        setBranchReservationsChartData(null);
      }
    } catch (error) {
      console.error("Error fetching analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedPeriodData = timePeriods.find(
    (p) => p.value === selectedPeriod
  );

  // Prepare chart data
  const reservationsOverTimeData: ChartData | null = analyticsData?.reservationsOverTime
    ? {
        labels: analyticsData.reservationsOverTime.map((item) => item.label),
        datasets: [
          {
            label: t("admin.reservationAnalytics.charts.reservations"),
            data: analyticsData.reservationsOverTime.map((item) => item.count),
            borderColor: "rgb(236, 72, 153)",
            backgroundColor: "rgba(236, 72, 153, 0.1)",
            tension: 0.4,
            yAxisID: "y",
          },
          {
            label: t("admin.reservationAnalytics.charts.guests"),
            data: analyticsData.reservationsOverTime.map((item) => item.guests),
            borderColor: "rgb(34, 197, 94)",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            tension: 0.4,
            yAxisID: "y1",
          },
        ],
      }
    : null;

  const statusBreakdownData: ChartData | null = analyticsData?.statusBreakdown
    ? {
        labels: analyticsData.statusBreakdown.map((item) => item.status),
        datasets: [
          {
            label: t("admin.reservationAnalytics.charts.reservations"),
            data: analyticsData.statusBreakdown.map((item) => item.count),
            backgroundColor: [
              "rgba(236, 72, 153, 0.8)",
              "rgba(34, 197, 94, 0.8)",
              "rgba(59, 130, 246, 0.8)",
              "rgba(245, 158, 11, 0.8)",
              "rgba(139, 69, 19, 0.8)",
              "rgba(239, 68, 68, 0.8)",
            ],
            borderColor: [
              "rgb(236, 72, 153)",
              "rgb(34, 197, 94)",
              "rgb(59, 130, 246)",
              "rgb(245, 158, 11)",
              "rgb(139, 69, 19)",
              "rgb(239, 68, 68)",
            ],
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      }
    : null;

  const typeBreakdownData: ChartData | null = analyticsData?.typeBreakdown
    ? {
        labels: analyticsData.typeBreakdown.map((item) => item.type),
        datasets: [
          {
            label: t("admin.reservationAnalytics.charts.reservations"),
            data: analyticsData.typeBreakdown.map((item) => item.count),
            backgroundColor: [
              "rgba(236, 72, 153, 0.8)",
              "rgba(34, 197, 94, 0.8)",
            ],
            borderColor: ["rgb(236, 72, 153)", "rgb(34, 197, 94)"],
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      }
    : null;

  const peakHoursData: ChartData | null = analyticsData?.peakHours
    ? {
        labels: analyticsData.peakHours.map((item) => item.label),
        datasets: [
          {
            label: t("admin.reservationAnalytics.charts.reservations"),
            data: analyticsData.peakHours.map((item) => item.count),
            backgroundColor: "rgba(236, 72, 153, 0.8)",
            borderColor: "rgb(236, 72, 153)",
            borderWidth: 2,
          },
        ],
      }
    : null;

  const dayOfWeekData: ChartData | null = analyticsData?.dayOfWeekBreakdown
    ? {
        labels: analyticsData.dayOfWeekBreakdown.map((item) => item.label),
        datasets: [
          {
            label: t("admin.reservationAnalytics.charts.reservations"),
            data: analyticsData.dayOfWeekBreakdown.map((item) => item.count),
            backgroundColor: "rgba(59, 130, 246, 0.8)",
            borderColor: "rgb(59, 130, 246)",
            borderWidth: 2,
          },
        ],
      }
    : null;

  const guestSizeData: ChartData | null = analyticsData?.guestSizeDistribution
    ? (() => {
        // Color palettes: different shades for Simple vs Pre-order
        const simpleColors = [
          { bg: "rgba(59, 130, 246, 0.8)", border: "rgb(59, 130, 246)" }, // Blue
          { bg: "rgba(34, 197, 94, 0.8)", border: "rgb(34, 197, 94)" }, // Green
          { bg: "rgba(16, 185, 129, 0.8)", border: "rgb(16, 185, 129)" }, // Emerald
          { bg: "rgba(139, 69, 19, 0.8)", border: "rgb(139, 69, 19)" }, // Brown
        ];
        const preOrderColors = [
          { bg: "rgba(236, 72, 153, 0.8)", border: "rgb(236, 72, 153)" }, // Pink
          { bg: "rgba(245, 158, 11, 0.8)", border: "rgb(245, 158, 11)" }, // Yellow
          { bg: "rgba(168, 85, 247, 0.8)", border: "rgb(168, 85, 247)" }, // Purple
          { bg: "rgba(239, 68, 68, 0.8)", border: "rgb(239, 68, 68)" }, // Red
        ];
        
        const distribution = analyticsData.guestSizeDistribution;
        
        // Track indices for each type separately
        let simpleIndex = 0;
        let preOrderIndex = 0;
        
        // Pre-calculate colors
        const colors = distribution.map((item) => {
          const isPreOrder = item.type === "Pre-order";
          const palette = isPreOrder ? preOrderColors : simpleColors;
          const index = isPreOrder ? preOrderIndex++ : simpleIndex++;
          return palette[index % palette.length];
        });
        
        // Use totalGuests (size × count) instead of just count for chart sizing
        const chartData = distribution.map((item) => {
          // Use totalGuests if available, otherwise calculate it (size × count)
          const totalGuests = item.totalGuests !== undefined 
            ? item.totalGuests 
            : (item.size * item.count);
          const value = typeof totalGuests === 'number' ? totalGuests : Number(totalGuests);
          return isNaN(value) ? 0 : value;
        });
        
        return {
          labels: distribution.map((item) => item.label),
          datasets: [
            {
              label: t("admin.reservationAnalytics.charts.reservations"),
              data: chartData,
              backgroundColor: colors.map((c) => c.bg),
              borderColor: colors.map((c) => c.border),
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        };
      })()
    : null;

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.reservationAnalytics.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.reservationAnalytics.description")}
          </p>
        </div>

        {/* Branch Filter */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground">
            {t("admin.analytics.branchLabel")}
          </Label>
          <Select
            value={selectedBranchId || "all"}
            onValueChange={(value: string) => setSelectedBranchId(value || "all")}
            disabled={loadingBranches}
          >
            <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-auto sm:min-w-[180px]">
              <SelectValue placeholder={t("admin.analytics.selectBranch")} />
            </SelectTrigger>
            <SelectContent>
              {canSelectAllBranches && (
                <SelectItem value="all">{t("admin.analytics.allBranches")}</SelectItem>
              )}
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time Period Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="min-w-[120px] sm:min-w-[140px] justify-between border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
                disabled={loading}
              >
                {loading ? (
                  <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
                ) : (
                  <Icon path={mdiCalendar} size={0.67} />
                )}
                <span className="text-sm font-medium">
                  {selectedPeriodData?.label}
                </span>
                <Icon path={mdiChevronDown} size={0.67} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 sm:w-56">
              {timePeriods.map((period) => (
                <DropdownMenuItem
                  key={period.value}
                  onClick={() => setSelectedPeriod(period.value)}
                  className={cn(
                    "cursor-pointer",
                    selectedPeriod === period.value
                      ? "bg-pink-500/20 text-pink-400 border-l-2 border-pink-500"
                      : "hover:bg-gray-800 hover:text-gray-100"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        selectedPeriod === period.value
                          ? "bg-pink-400"
                          : "bg-gray-400"
                      )}
                    />
                    <span>{period.label}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.reservationAnalytics.loading")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.reservationAnalytics.loadingDescription")}
            </p>
          </div>
        </div>
      )}

      {/* Summary Stats Cards */}
      {analyticsData && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCalendarClock} size={0.83} className="text-pink-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationAnalytics.summary.totalReservations")}
                  </p>
                  <p className="text-lg font-semibold">
                    {analyticsData.summary.totalReservations}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiAccountGroup} size={0.83} className="text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationAnalytics.summary.totalGuests")}
                  </p>
                  <p className="text-lg font-semibold">
                    {analyticsData.summary.totalGuests}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCurrencyUsd} size={0.83} className="text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationAnalytics.summary.revenue")}
                  </p>
                  <p className="text-lg font-semibold">
                    {formatPrice(
                      analyticsData.summary.totalRevenue,
                      currency
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCurrencyUsd} size={0.83} className="text-sky-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationAnalytics.summary.remaining")}
                  </p>
                  <p className="text-lg font-semibold">
                    {formatPrice(
                      analyticsData.summary.totalRemainingAmount,
                      currency
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCurrencyUsd} size={0.83} className="text-amber-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationAnalytics.summary.totalTax")}
                  </p>
                  <p className="text-lg font-semibold">
                    {formatPrice(
                      analyticsData.summary.totalTaxAmount,
                      currency
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiAccount} size={0.83} className="text-purple-500" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.reservationAnalytics.summary.avgGuests")}
                  </p>
                  <p className="text-lg font-semibold">
                    {analyticsData.summary.avgGuestsPerReservation.toFixed(1)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Stats Cards */}
      {analyticsData && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiAlertCircle} size={0.67} className="text-yello" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.reservationAnalytics.statuses.pending")}
                  </p>
                  <p className="text-sm font-semibold">
                    {analyticsData.statusCounts.pending}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCheckCircle} size={0.67} className="text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.reservationAnalytics.statuses.confirmed")}
                  </p>
                  <p className="text-sm font-semibold">
                    {analyticsData.statusCounts.confirmed}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiAccountGroup} size={0.67} className="text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.reservationAnalytics.statuses.seated")}
                  </p>
                  <p className="text-sm font-semibold">
                    {analyticsData.statusCounts.seated}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCheckCircle} size={0.67} className="text-emerald-500" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.reservationAnalytics.statuses.completed")}
                  </p>
                  <p className="text-sm font-semibold">
                    {analyticsData.statusCounts.completed}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCloseCircle} size={0.67} className="text-red-500" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.reservationAnalytics.statuses.cancelled")}
                  </p>
                  <p className="text-sm font-semibold">
                    {analyticsData.statusCounts.cancelled}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Icon path={mdiCloseCircle} size={0.67} className="text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.reservationAnalytics.statuses.noShow")}
                  </p>
                  <p className="text-sm font-semibold">
                    {analyticsData.statusCounts.noShow}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Branch Reservations Chart - Only when "All Branches" is selected */}
        {selectedBranchId === "all" && branchReservationsChartData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon path={mdiChartPie} size={0.67} className="text-pink-500" />
                {t("admin.reservationAnalytics.charts.branchReservations") ||
                  "Reservations by Branch"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <Chart type="doughnut" data={branchReservationsChartData} height={250} />
            </CardContent>
          </Card>
        )}

        {/* Reservations Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiChartBar} size={0.67} className="text-pink-500" />
              {t("admin.reservationAnalytics.charts.reservationsOverTime")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {reservationsOverTimeData ? (
              <Chart type="line" data={reservationsOverTimeData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiChartBar} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.reservationAnalytics.charts.noReservationData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiChartPie} size={0.67} className="text-pink-500" />
              {t("admin.reservationAnalytics.charts.statusBreakdown")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {statusBreakdownData ? (
              <Chart type="doughnut" data={statusBreakdownData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiChartPie} size={2} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.reservationAnalytics.charts.noStatusData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Type Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiChartPie} size={0.67} className="text-pink-500" />
              {t("admin.reservationAnalytics.charts.reservationType")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {typeBreakdownData ? (
              <Chart type="doughnut" data={typeBreakdownData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiChartPie} size={2} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.reservationAnalytics.charts.noTypeData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Peak Hours */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiClock} size={0.67} className="text-pink-500" />
              {t("admin.reservationAnalytics.charts.peakHours")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {peakHoursData ? (
              <Chart type="bar" data={peakHoursData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiClock} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.reservationAnalytics.charts.noPeakHoursData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day of Week Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiCalendar} size={0.67} className="text-pink-500" />
              {t("admin.reservationAnalytics.charts.dayOfWeek")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {dayOfWeekData ? (
              <Chart type="bar" data={dayOfWeekData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiCalendar} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.reservationAnalytics.charts.noDayOfWeekData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Guest Size Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiAccountGroup} size={0.67} className="text-pink-500" />
              {t("admin.reservationAnalytics.charts.guestSizeDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {guestSizeData ? (
              <Chart type="doughnut" data={guestSizeData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiAccountGroup} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.reservationAnalytics.charts.noGuestSizeData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      {analyticsData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon path={mdiTrendingUp} size={0.67} className="text-pink-500" />
                {t("admin.reservationAnalytics.metrics.completionRate")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div className="text-center py-4">
                <p className="text-3xl font-bold text-green-500">
                  {analyticsData.summary.completionRate.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("admin.reservationAnalytics.metrics.completionRateDescription")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon path={mdiCloseCircle} size={0.67} className="text-pink-500" />
                {t("admin.reservationAnalytics.metrics.cancellationRate")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div className="text-center py-4">
                <p className="text-3xl font-bold text-red-500">
                  {analyticsData.summary.cancellationRate.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("admin.reservationAnalytics.metrics.cancellationRateDescription")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon path={mdiAlertCircle} size={0.67} className="text-pink-500" />
                {t("admin.reservationAnalytics.metrics.noShowRate")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <div className="text-center py-4">
                <p className="text-3xl font-bold text-orange-500">
                  {analyticsData.summary.noShowRate.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("admin.reservationAnalytics.metrics.noShowRateDescription")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ReservationAnalytics;

