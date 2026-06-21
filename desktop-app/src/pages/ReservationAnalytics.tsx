import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import Icon from "@mdi/react";
import {
  mdiAccount,
  mdiAccountGroup,
  mdiAlertCircle,
  mdiCalendar,
  mdiCalendarClock,
  mdiChartBar,
  mdiChartPie,
  mdiCheckCircle,
  mdiClock,
  mdiCloseCircle,
  mdiCurrencyUsd,
  mdiRefresh,
  mdiTrendingUp,
} from "@mdi/js";

import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";

import Chart, { type ChartData } from "@/components/admin/Chart";
import branchService, { type Branch } from "@/services/branchService";
import { reservationService } from "@/services/reservationService";
import { SettingsService } from "@/services/settingsService";
import { formatPrice } from "@/utils/currency";
import PageHeader from "@/components/PageHeader";

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

const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";
const ORG_CHANGED_EVENT = "bellami:organizationChanged";

const getSelectedOrganizationId = (): string | null => {
  try {
    const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
    if (!raw) return null;
    const val = raw.trim();
    return val.length > 0 ? val : null;
  } catch {
    return null;
  }
};

const ReservationAnalytics: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getToken, userRole } = useAuth();
  const { assignedBranchIds, isSuperAdmin, isOrgAdmin } = usePermissions();
  const { subscribe } = useAdminWebSocket();

  const STORAGE_KEY = "bellami:reservationAnalytics:filters";

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
    getSelectedOrganizationId()
  );

  const canSelectAllBranches = isSuperAdmin || isOrgAdmin;

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

  const [currency, setCurrency] = useState<string>("USD");

  const [analyticsData, setAnalyticsData] = useState<ReservationAnalyticsData | null>(null);
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
      // ignore
    }
  }, [STORAGE_KEY, selectedBranchId, selectedPeriod]);

  // Redirect if not admin
  useEffect(() => {
    if (userRole !== "ADMIN") {
      navigate("/");
    }
  }, [navigate, userRole]);

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const settings = await SettingsService.getSettings(token);
        const nextCurrency = (settings as any)?.data?.currency;
        if (typeof nextCurrency === "string" && nextCurrency.trim()) {
          setCurrency(nextCurrency);
        }
      } catch {
        // ignore
      }
    };
    loadCurrency();
  }, [getToken, selectedOrganizationId]);

  // Load branches
  useEffect(() => {
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        const token = await getToken();
        if (!token) {
          setBranches([]);
          setSelectedBranchId(canSelectAllBranches ? "all" : "");
          return;
        }

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
      } catch {
        // ignore
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [assignedBranchIds, canSelectAllBranches, getToken, selectedOrganizationId]);

  // React to organization switch
  useEffect(() => {
    const onOrganizationChange = () => {
      const nextOrgId = getSelectedOrganizationId();
      setSelectedOrganizationId(nextOrgId);
      setBranches([]);
      setSelectedBranchId(canSelectAllBranches ? "all" : "");
      setAnalyticsData(null);
      setBranchReservationsChartData(null);
    };

    window.addEventListener(ORG_CHANGED_EVENT, onOrganizationChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === ORG_STORAGE_KEY) onOrganizationChange();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(ORG_CHANGED_EVENT, onOrganizationChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [canSelectAllBranches]);

  const timePeriods = useMemo(
    () => [
      { value: "today", label: t("admin.categoryInsights.periods.today") },
      { value: "this_week", label: t("admin.categoryInsights.periods.thisWeek") },
      { value: "this_month", label: t("admin.categoryInsights.periods.thisMonth") },
      { value: "last_7_days", label: t("admin.categoryInsights.periods.last7Days") },
      { value: "last_30_days", label: t("admin.categoryInsights.periods.last30Days") },
      { value: "last_3_months", label: t("admin.categoryInsights.periods.last3Months") },
      { value: "last_6_months", label: t("admin.categoryInsights.periods.last6Months") },
      { value: "last_year", label: t("admin.categoryInsights.periods.lastYear") },
    ],
    [t]
  );

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setAnalyticsData(null);
        setBranchReservationsChartData(null);
        return;
      }

      const branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
      const isAllBranches = selectedBranchId === "all";

      const promises: Array<Promise<any>> = [
        reservationService.getReservationAnalytics(
          selectedPeriod,
          branchIdForApi,
          token || undefined
        ),
      ];

      if (isAllBranches) {
        promises.push(
          reservationService.getBranchReservationsChart(selectedPeriod, token || undefined)
        );
      }

      const results = await Promise.all(promises);
      setAnalyticsData(results[0]);

      if (isAllBranches) {
        setBranchReservationsChartData(results[1] as ChartData);
      } else {
        setBranchReservationsChartData(null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Fetch analytics data when filters change
  useEffect(() => {
    fetchAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedBranchId, selectedOrganizationId]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const unsubscribe = subscribe("reservation-update", () => {
      fetchAnalyticsData();
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedBranchId, selectedOrganizationId, subscribe]);

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
            backgroundColor: ["rgba(236, 72, 153, 0.8)", "rgba(34, 197, 94, 0.8)"],
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
        const simpleColors = [
          { bg: "rgba(59, 130, 246, 0.8)", border: "rgb(59, 130, 246)" },
          { bg: "rgba(34, 197, 94, 0.8)", border: "rgb(34, 197, 94)" },
          { bg: "rgba(16, 185, 129, 0.8)", border: "rgb(16, 185, 129)" },
          { bg: "rgba(139, 69, 19, 0.8)", border: "rgb(139, 69, 19)" },
        ];
        const preOrderColors = [
          { bg: "rgba(236, 72, 153, 0.8)", border: "rgb(236, 72, 153)" },
          { bg: "rgba(245, 158, 11, 0.8)", border: "rgb(245, 158, 11)" },
          { bg: "rgba(168, 85, 247, 0.8)", border: "rgb(168, 85, 247)" },
          { bg: "rgba(239, 68, 68, 0.8)", border: "rgb(239, 68, 68)" },
        ];

        const distribution = analyticsData.guestSizeDistribution;
        let simpleIndex = 0;
        let preOrderIndex = 0;

        const colors = distribution.map((item) => {
          const isPreOrder = item.type === "Pre-order";
          const palette = isPreOrder ? preOrderColors : simpleColors;
          const index = isPreOrder ? preOrderIndex++ : simpleIndex++;
          return palette[index % palette.length];
        });

        const chartData = distribution.map((item) => {
          const totalGuests = item.totalGuests !== undefined ? item.totalGuests : item.size * item.count;
          const value = typeof totalGuests === "number" ? totalGuests : Number(totalGuests);
          return Number.isFinite(value) ? value : 0;
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
    <div className="p-6 h-full overflow-auto space-y-6">
      <PageHeader
        title={t("admin.reservationAnalytics.title")}
        description={t("admin.reservationAnalytics.description")}
        actions={
          <Button variant="outline" size="sm" onClick={fetchAnalyticsData} disabled={loading}>
            <Icon path={mdiRefresh} size={0.7} className={loading ? "animate-spin" : ""} />
            <span className="ml-2">{t("admin.revenueAnalytics.refresh")}</span>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon path={mdiChartBar} size={0.8} className="text-muted-foreground" />
            {t("admin.revenueAnalytics.filters", { defaultValue: "Filters" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("admin.branches.branch")}</Label>
              <Select
                value={selectedBranchId || "all"}
                onValueChange={(val) => setSelectedBranchId(val || "all")}
                disabled={loadingBranches}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.businessDay.selectBranchPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {canSelectAllBranches ? (
                    <SelectItem value="all">{t("admin.branches.allBranches")}</SelectItem>
                  ) : null}
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>{t("admin.dashboard.filters.timePeriod")}</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.dashboard.filters.timePeriod")} />
                </SelectTrigger>
                <SelectContent>
                  {timePeriods.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
          <Icon path={mdiRefresh} size={2} className="text-pink-500 animate-spin" />
          <h3 className="text-lg font-semibold">{t("admin.reservationAnalytics.loading")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("admin.reservationAnalytics.loadingDescription")}
          </p>
        </div>
      ) : null}

      {analyticsData ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiCalendarClock} size={0.83} className="text-pink-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.reservationAnalytics.summary.totalReservations")}
                    </p>
                    <p className="text-lg font-semibold">{analyticsData.summary.totalReservations}</p>
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
                    <p className="text-lg font-semibold">{analyticsData.summary.totalGuests}</p>
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
                      {formatPrice(analyticsData.summary.totalRevenue, currency)}
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
                      {formatPrice(analyticsData.summary.totalRemainingAmount, currency)}
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
                      {formatPrice(analyticsData.summary.totalTaxAmount, currency)}
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

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiAlertCircle} size={0.67} className="text-yellow-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin.reservationAnalytics.statuses.pending")}</p>
                    <p className="text-sm font-semibold">{analyticsData.statusCounts.pending}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiCheckCircle} size={0.67} className="text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin.reservationAnalytics.statuses.confirmed")}</p>
                    <p className="text-sm font-semibold">{analyticsData.statusCounts.confirmed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiAccountGroup} size={0.67} className="text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin.reservationAnalytics.statuses.seated")}</p>
                    <p className="text-sm font-semibold">{analyticsData.statusCounts.seated}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiCheckCircle} size={0.67} className="text-emerald-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin.reservationAnalytics.statuses.completed")}</p>
                    <p className="text-sm font-semibold">{analyticsData.statusCounts.completed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiCloseCircle} size={0.67} className="text-red-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin.reservationAnalytics.statuses.cancelled")}</p>
                    <p className="text-sm font-semibold">{analyticsData.statusCounts.cancelled}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon path={mdiCloseCircle} size={0.67} className="text-orange-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin.reservationAnalytics.statuses.noShow")}</p>
                    <p className="text-sm font-semibold">{analyticsData.statusCounts.noShow}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {selectedBranchId === "all" && branchReservationsChartData ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon path={mdiChartPie} size={0.67} className="text-pink-500" />
                    {t("admin.reservationAnalytics.charts.branchReservations")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  <Chart type="doughnut" data={branchReservationsChartData} height={250} />
                </CardContent>
              </Card>
            ) : null}

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
                      <Icon path={mdiChartBar} size={2.0} className="mx-auto mb-4 text-muted-foreground/50" />
                      <p>{t("admin.reservationAnalytics.charts.noReservationData")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <Icon path={mdiChartPie} size={2.0} className="mx-auto mb-4 text-muted-foreground/50" />
                      <p>{t("admin.reservationAnalytics.charts.noStatusData")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <Icon path={mdiChartPie} size={2.0} className="mx-auto mb-4 text-muted-foreground/50" />
                      <p>{t("admin.reservationAnalytics.charts.noTypeData")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <Icon path={mdiClock} size={2.0} className="mx-auto mb-4 text-muted-foreground/50" />
                      <p>{t("admin.reservationAnalytics.charts.noPeakHoursData")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <Icon path={mdiCalendar} size={2.0} className="mx-auto mb-4 text-muted-foreground/50" />
                      <p>{t("admin.reservationAnalytics.charts.noDayOfWeekData")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <Icon path={mdiAccountGroup} size={2.0} className="mx-auto mb-4 text-muted-foreground/50" />
                      <p>{t("admin.reservationAnalytics.charts.noGuestSizeData")}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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
        </>
      ) : null}
    </div>
  );
};

export default ReservationAnalytics;
