import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
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
  mdiClipboardList,
  mdiCurrencyUsd,
  mdiDownload,
  mdiFilter,
  mdiRefresh,
  mdiTrendingDown,
  mdiTrendingUp,
} from "@mdi/js";

import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";
import { formatPrice } from "@/utils/currency";
import StatsCard from "@/components/admin/StatsCard";
import Chart from "@/components/admin/Chart";
import AnalyticsTimePeriodFilter, { type TimePeriod } from "@/components/admin/AnalyticsTimePeriodFilter";
import { analyticsService } from "@/services/analyticsService";
import branchService, { type Branch } from "@/services/branchService";
import { SettingsService } from "@/services/settingsService";
import type {
  AnalyticsFilters,
  RefundAnalyticsData,
  RevenueAnalyticsData,
} from "@/services/analyticsService";

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

const RevenueAnalytics: React.FC = () => {
  const { t } = useTranslation();
  const { getToken, userRole } = useAuth();
  const { assignedBranchIds, isSuperAdmin, isOrgAdmin } = usePermissions();
  const { subscribe } = useAdminWebSocket();

  const STORAGE_KEY = "bellami:revenueAnalytics:filters";

  const canSelectAllBranches = isSuperAdmin || isOrgAdmin;

  const getStoredState = ():
    | {
        activeTab?: "revenue" | "refunds";
        selectedBranchId?: string;
        filters?: AnalyticsFilters;
      }
    | null => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || typeof parsed !== "object") return null;

      const storedFilters = parsed.filters as AnalyticsFilters | undefined;
      const tp = storedFilters?.timePeriod as any;
      if (tp?.startDate) tp.startDate = new Date(tp.startDate);
      if (tp?.endDate) tp.endDate = new Date(tp.endDate);

      return {
        activeTab: parsed.activeTab,
        selectedBranchId: parsed.selectedBranchId,
        filters: storedFilters,
      };
    } catch {
      return null;
    }
  };

  const stored = getStoredState();

  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
    getSelectedOrganizationId()
  );

  const [currency, setCurrency] = useState<string>("USD");
  const [activeTab, setActiveTab] = useState<"revenue" | "refunds">(
    stored?.activeTab === "refunds" ? "refunds" : "revenue"
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    typeof stored?.selectedBranchId === "string" && stored.selectedBranchId.trim()
      ? stored.selectedBranchId
      : "all"
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loading, setLoading] = useState(true);

  const [revenueData, setRevenueData] = useState<RevenueAnalyticsData | null>(null);
  const [refundData, setRefundData] = useState<RefundAnalyticsData | null>(null);
  const [branchRevenueChartData, setBranchRevenueChartData] = useState<any | null>(null);
  const [branchRefundsChartData, setBranchRefundsChartData] = useState<any | null>(null);

  const [filters, setFilters] = useState<AnalyticsFilters>(() => {
    const storedFilters = stored?.filters;
    const tp = storedFilters?.timePeriod;
    if (
      tp &&
      tp.type &&
      tp.startDate instanceof Date &&
      !Number.isNaN(tp.startDate.getTime()) &&
      tp.endDate instanceof Date &&
      !Number.isNaN(tp.endDate.getTime())
    ) {
      return storedFilters as AnalyticsFilters;
    }

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return {
      timePeriod: {
        type: "monthly",
        startDate,
        endDate,
        label: `${startDate.toLocaleDateString("en-US", { month: "long" })} ${now.getFullYear()}`,
        year: now.getFullYear(),
        month: now.getMonth(),
      },
    };
  });

  useEffect(() => {
    try {
      if (!filters.timePeriod) return;
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeTab,
          selectedBranchId,
          filters: {
            ...filters,
            timePeriod: {
              ...filters.timePeriod,
              startDate:
                (filters.timePeriod.startDate as any)?.toISOString?.() || filters.timePeriod.startDate,
              endDate:
                (filters.timePeriod.endDate as any)?.toISOString?.() || filters.timePeriod.endDate,
            },
          },
        })
      );
    } catch {
      // ignore
    }
  }, [STORAGE_KEY, activeTab, filters, selectedBranchId]);

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const token = await getToken();
        const settingsResponse = await SettingsService.getSettings(token || undefined);
        const maybeCurrency = (settingsResponse as any)?.data?.currency;
        if (typeof maybeCurrency === "string" && maybeCurrency.trim()) {
          setCurrency(maybeCurrency.trim());
        }
      } catch {
        // ignore
      }
    };
    loadCurrency();
  }, [getToken, selectedOrganizationId]);

  useEffect(() => {
    const onOrganizationChange = () => {
      const nextOrgId = getSelectedOrganizationId();
      setSelectedOrganizationId(nextOrgId);

      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }

      setRevenueData(null);
      setRefundData(null);
      setBranchRevenueChartData(null);
      setBranchRefundsChartData(null);
      setSelectedBranchId(canSelectAllBranches ? "all" : "");
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
  }, [STORAGE_KEY, canSelectAllBranches]);

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
      } catch {
        setBranches([]);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [assignedBranchIds, canSelectAllBranches, getToken, selectedOrganizationId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      const branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
      const isAllBranches = selectedBranchId === "all";

      if (activeTab === "revenue") {
        const promises: Promise<any>[] = [
          analyticsService.getRevenueAnalytics(filters, branchIdForApi, token),
        ];
        if (isAllBranches) {
          promises.push(analyticsService.getBranchRevenueChart(filters, token));
        }
        const results = await Promise.all(promises);
        setRevenueData(results[0]);
        setBranchRevenueChartData(isAllBranches ? results[1] : null);
      } else {
        const promises: Promise<any>[] = [
          analyticsService.getRefundAnalytics(filters, branchIdForApi, token),
        ];
        if (isAllBranches) {
          promises.push(analyticsService.getBranchRefundsChart(filters, token));
        }
        const results = await Promise.all(promises);
        setRefundData(results[0]);
        setBranchRefundsChartData(isAllBranches ? results[1] : null);
      }
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab, selectedBranchId, selectedOrganizationId]);

  useEffect(() => {
    const unsubscribe = subscribe("new-order", () => {
      loadData();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab, selectedBranchId, selectedOrganizationId, subscribe]);

  const handleTimePeriodChange = (timePeriod: TimePeriod) => {
    setFilters((prev) => ({ ...prev, timePeriod }));
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "revenue" | "refunds");
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleExport = () => {
    try {
      const payload =
        activeTab === "revenue"
          ? {
              tab: "revenue",
              selectedBranchId,
              filters,
              currency,
              revenueData,
              branchRevenueChartData,
            }
          : {
              tab: "refunds",
              selectedBranchId,
              filters,
              currency,
              refundData,
              branchRefundsChartData,
            };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safePeriod = String(filters.timePeriod?.type || "period");
      a.href = url;
      a.download = `revenue-analytics-${activeTab}-${safePeriod}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const formatCurrency = (amount: number) => {
    return formatPrice(amount, currency);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  const formatPaymentMethod = (method: string) => {
    const methodKey = `admin.orderManagement.paymentMethods.${method
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(methodKey, { defaultValue: method.replace("_", " ") });
    return translated !== methodKey ? translated : method.replace("_", " ");
  };

  const formatOrderStatus = (status: string) => {
    const statusKey = `admin.orderManagement.statuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status.replace("_", " ") });
    return translated !== statusKey ? translated : status.replace("_", " ");
  };

  const formatRefundStatus = (status: string) => {
    const statusKey = `admin.orderManagement.refundStatuses.${status
      .toLowerCase()
      .replace(/_/g, "")}`;
    const translated = t(statusKey, { defaultValue: status.replace("_", " ") });
    return translated !== statusKey ? translated : status.replace("_", " ");
  };

  const formatRefundType = (type: string) => {
    const normalizedType = type.toUpperCase().replace(/_/g, "");
    const typeMap: { [key: string]: string } = {
      FULL: "admin.orderManagement.fullRefund",
      PARTIAL: "admin.orderManagement.partialRefund",
      ITEMSPECIFIC: "admin.orderManagement.itemSpecificRefund",
    };
    const typeKey = typeMap[normalizedType] || `admin.orderManagement.refundType`;
    const translated = t(typeKey, { defaultValue: type.replace("_", " ") });
    return translated !== typeKey ? translated : type.replace("_", " ");
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "succeeded":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "canceled":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    }
  };

  const getRefundTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "full":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "partial":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      case "item_specific":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (userRole !== "ADMIN") {
    return null;
  }

  // Format chart labels based on period type
  const formatChartLabel = (itemMonth: string, periodType: string): string => {
    if (periodType === "daily") {
      const date = new Date(itemMonth + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } else if (periodType === "weekly") {
      const date = new Date(itemMonth + "T00:00:00");
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + 6);
      return `${date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;
    } else if (periodType === "yearly") {
      return itemMonth;
    } else if (periodType === "custom") {
      const date = new Date(itemMonth + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } else {
      // monthly
      const date = new Date(itemMonth + "-01");
      return date.toLocaleDateString("en-US", {
        month: "short",
      });
    }
  };

  if (loading && !revenueData && !refundData) {
    return (
      <div className="p-6 h-full overflow-auto">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Icon path={mdiRefresh} size={2} className="text-pink-500 animate-spin" />
          <h3 className="text-lg font-semibold">{t("admin.revenueAnalytics.loadingTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("admin.revenueAnalytics.loadingDescription")}
          </p>
        </div>
      </div>
    );
  }

  const isAllBranchesSelected = selectedBranchId === "all";
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) || null;

  return (
    <div className="p-6 h-full overflow-auto space-y-6">
      <div className="flex flex-col gap-2">
        <PageHeader
          title={t("admin.revenueAnalytics.title")}
          description={t("admin.revenueAnalytics.description")}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <Icon path={mdiRefresh} size={0.7} className={loading ? "animate-spin" : ""} />
                <span className="ml-2">{t("admin.revenueAnalytics.refresh")}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Icon path={mdiDownload} size={0.7} />
                <span className="ml-2">{t("admin.revenueAnalytics.export")}</span>
              </Button>
            </>
          }
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon path={mdiFilter} size={0.8} className="text-muted-foreground" />
              {t("admin.revenueAnalytics.filters")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("admin.branches.branch")}</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={(val) => setSelectedBranchId(val)}
                  disabled={loadingBranches}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canSelectAllBranches ? (
                      <SelectItem value="all">{t("admin.branches.allBranches")}</SelectItem>
                    ) : null}
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("admin.dashboard.filters.timePeriod")}</Label>
                <AnalyticsTimePeriodFilter
                  selectedPeriod={filters.timePeriod!}
                  onPeriodChange={handleTimePeriodChange}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="w-fit">
                <Icon path={mdiCurrencyUsd} size={0.7} />
                <span className="ml-2">{currency}</span>
              </Badge>
              {selectedBranch ? (
                <Badge variant="secondary" className="w-fit">
                  <Icon path={mdiClipboardList} size={0.7} />
                  <span className="ml-2">{selectedBranch.name}</span>
                </Badge>
              ) : null}
              {isAllBranchesSelected ? (
                <Badge variant="secondary" className="w-fit">
                  <Icon path={mdiClipboardList} size={0.7} />
                  <span className="ml-2">{t("admin.branches.allBranches")}</span>
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="revenue">{t("admin.revenueAnalytics.revenueTab")}</TabsTrigger>
          <TabsTrigger value="refunds">{t("admin.revenueAnalytics.refundTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Icon path={mdiRefresh} size={1.5} className="text-pink-500 animate-spin" />
            </div>
          ) : revenueData ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatsCard
                  title={t("admin.revenueAnalytics.totalRevenue")}
                  value={formatCurrency(revenueData.summary.totalRevenue)}
                  iconColor="#10b981"
                  iconNode={<Icon path={mdiTrendingUp} size={1} />}
                  change={revenueData.summary.monthOverMonthChanges?.revenueChange}
                />
                <StatsCard
                  title={t("admin.revenueAnalytics.taxesOwed")}
                  value={formatCurrency(revenueData.summary.totalTaxes || 0)}
                  iconColor="#f59e0b"
                  iconNode={<Icon path={mdiTrendingDown} size={1} />}
                />
                <StatsCard
                  title={t("admin.revenueAnalytics.totalRefunds")}
                  value={formatCurrency(revenueData.summary.totalRefunds)}
                  iconColor="#ef4444"
                  iconNode={<Icon path={mdiTrendingDown} size={1} />}
                  change={revenueData.summary.monthOverMonthChanges?.refundsChange}
                />
                <StatsCard
                  title={t("admin.revenueAnalytics.netRevenue")}
                  value={formatCurrency(revenueData.summary.netRevenue)}
                  iconColor="#3b82f6"
                  iconNode={<Icon path={mdiTrendingUp} size={1} />}
                  change={revenueData.summary.monthOverMonthChanges?.netRevenueChange}
                />
                <StatsCard
                  title={t("admin.revenueAnalytics.totalOrders")}
                  value={formatNumber(revenueData.summary.totalOrders)}
                  iconColor="#8b5cf6"
                  iconNode={<Icon path={mdiClipboardList} size={1} />}
                  change={revenueData.summary.monthOverMonthChanges?.ordersChange}
                />
              </div>

              {isAllBranchesSelected && branchRevenueChartData ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.dashboard.branchRevenue")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart type="bar" data={branchRevenueChartData} height={300} />
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {filters.timePeriod?.type === "daily"
                        ? t("admin.revenueAnalytics.dailyRevenueTrend")
                        : filters.timePeriod?.type === "weekly"
                        ? t("admin.revenueAnalytics.weeklyRevenueTrend")
                        : filters.timePeriod?.type === "yearly"
                        ? t("admin.revenueAnalytics.yearlyRevenueTrend")
                        : t("admin.revenueAnalytics.monthlyRevenueTrend")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type={filters.timePeriod?.type === "custom" ? "line" : "bar"}
                      data={{
                        labels: revenueData.chartData.map((item) =>
                          formatChartLabel(item.month, filters.timePeriod?.type || "monthly")
                        ),
                        datasets:
                          filters.timePeriod?.type === "custom"
                            ? [
                                {
                                  label: t("admin.revenueAnalytics.revenue"),
                                  data: revenueData.chartData.map((item) => item.revenue),
                                  borderColor: "rgb(34, 197, 94)",
                                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                                  tension: 0.4,
                                  yAxisID: "y",
                                },
                                {
                                  label: t("admin.revenueAnalytics.refunds"),
                                  data: revenueData.chartData.map((item) => item.refunds),
                                  borderColor: "rgb(239, 68, 68)",
                                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                                  tension: 0.4,
                                  yAxisID: "y",
                                },
                                {
                                  label: t("admin.revenueAnalytics.ordersLabel"),
                                  data: revenueData.chartData.map((item) => item.orders),
                                  borderColor: "rgb(59, 130, 246)",
                                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                                  tension: 0.4,
                                  yAxisID: "y1",
                                },
                              ]
                            : [
                                {
                                  label: t("admin.revenueAnalytics.revenue"),
                                  data: revenueData.chartData.map((item) => item.revenue),
                                  backgroundColor: "rgba(34, 197, 94, 0.8)",
                                  borderColor: "rgb(34, 197, 94)",
                                  borderWidth: 1,
                                  yAxisID: "y",
                                },
                                {
                                  label: t("admin.revenueAnalytics.ordersLabel"),
                                  data: revenueData.chartData.map((item) => item.orders),
                                  backgroundColor: "rgba(59, 130, 246, 0.8)",
                                  borderColor: "rgb(59, 130, 246)",
                                  borderWidth: 1,
                                  yAxisID: "y1",
                                },
                                {
                                  label: t("admin.revenueAnalytics.refunds"),
                                  data: revenueData.chartData.map((item) => item.refunds),
                                  backgroundColor: "rgba(239, 68, 68, 0.8)",
                                  borderColor: "rgb(239, 68, 68)",
                                  borderWidth: 1,
                                  yAxisID: "y",
                                },
                              ],
                      }}
                      height={300}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.paymentMethodBreakdown")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type="doughnut"
                      data={{
                        labels: revenueData.paymentMethodBreakdown
                          .filter((item) => item.method)
                          .map((item) => formatPaymentMethod(item.method)),
                        datasets: [
                          {
                            label: t("admin.revenueAnalytics.revenue"),
                            data: revenueData.paymentMethodBreakdown
                              .filter((item) => item.method)
                              .map((item) => item.revenue),
                            backgroundColor: [
                              "rgba(236, 72, 153, 0.8)",
                              "rgba(59, 130, 246, 0.8)",
                              "rgba(16, 185, 129, 0.8)",
                              "rgba(245, 158, 11, 0.8)",
                            ],
                          },
                        ],
                      }}
                      height={300}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.paymentMethodDetails")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {revenueData.paymentMethodBreakdown.map((item, index) => (
                        <div key={index} className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                          <div>
                            <p className="text-sm font-semibold">{formatPaymentMethod(item.method)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(item.orders)} {t("admin.revenueAnalytics.orders")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(item.revenue)}</p>
                            <p className="text-xs text-muted-foreground">
                              {((item.revenue / revenueData.summary.totalRevenue) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.orderStatusDetails")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {revenueData.orderStatusBreakdown.map((item, index) => (
                        <div key={index} className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                          <div>
                            <p className="text-sm font-semibold">{formatOrderStatus(item.status)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(item.orders)} {t("admin.revenueAnalytics.orders")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(item.revenue)}</p>
                            <p className="text-xs text-muted-foreground">
                              {((item.revenue / revenueData.summary.totalRevenue) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center gap-2">
                  <Icon path={mdiClipboardList} size={2} className="text-muted-foreground" />
                  <h3 className="text-lg font-semibold">{t("admin.revenueAnalytics.noRevenueData")}</h3>
                  <p className="text-sm text-muted-foreground">{t("admin.revenueAnalytics.noRevenueDataDescription")}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="refunds" className="mt-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Icon path={mdiRefresh} size={1.5} className="text-pink-500 animate-spin" />
            </div>
          ) : refundData ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatsCard
                  title={t("admin.revenueAnalytics.totalRefundAmount")}
                  value={formatCurrency(refundData.summary.totalRefundAmount)}
                  iconColor="#ef4444"
                  iconNode={<Icon path={mdiTrendingDown} size={1} />}
                />
                <StatsCard
                  title={t("admin.revenueAnalytics.totalRefundsCount")}
                  value={formatNumber(refundData.summary.totalRefundsCount)}
                  iconColor="#f59e0b"
                  iconNode={<Icon path={mdiClipboardList} size={1} />}
                />
                <StatsCard
                  title={t("admin.revenueAnalytics.averageRefund")}
                  value={formatCurrency(refundData.summary.averageRefundAmount)}
                  iconColor="#8b5cf6"
                  iconNode={<Icon path={mdiCurrencyUsd} size={1} />}
                />
              </div>

              {isAllBranchesSelected && branchRefundsChartData ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.dashboard.branchRefunds")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart type="bar" data={branchRefundsChartData} height={300} />
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {filters.timePeriod?.type === "daily"
                        ? t("admin.revenueAnalytics.dailyRefundsTrend")
                        : filters.timePeriod?.type === "weekly"
                        ? t("admin.revenueAnalytics.weeklyRefundsTrend")
                        : filters.timePeriod?.type === "yearly"
                        ? t("admin.revenueAnalytics.yearlyRefundsTrend")
                        : t("admin.revenueAnalytics.monthlyRefundsTrend")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type="bar"
                      data={{
                        labels: refundData.chartData.map((item) =>
                          formatChartLabel(item.month, filters.timePeriod?.type || "monthly")
                        ),
                        datasets: [
                          {
                            label: t("admin.revenueAnalytics.refundAmount"),
                            data: refundData.chartData.map((item) => item.amount),
                            backgroundColor: "rgba(239, 68, 68, 0.8)",
                            borderColor: "rgb(239, 68, 68)",
                            borderWidth: 1,
                            yAxisID: "y",
                          },
                          {
                            label: t("admin.revenueAnalytics.refundCount"),
                            data: refundData.chartData.map((item) => item.count),
                            backgroundColor: "rgba(245, 158, 11, 0.8)",
                            borderColor: "rgb(245, 158, 11)",
                            borderWidth: 1,
                            yAxisID: "y1",
                          },
                        ],
                      }}
                      height={300}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.refundStatusBreakdown")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type="doughnut"
                      data={{
                        labels: refundData.refundsByStatus
                          .filter((item) => item.status)
                          .map((item) => formatRefundStatus(item.status!)),
                        datasets: [
                          {
                            label: t("admin.revenueAnalytics.refunds"),
                            data: refundData.refundsByStatus
                              .filter((item) => item.status)
                              .map((item) => item.amount),
                            backgroundColor: [
                              "rgba(16, 185, 129, 0.8)",
                              "rgba(245, 158, 11, 0.8)",
                              "rgba(239, 68, 68, 0.8)",
                              "rgba(107, 114, 128, 0.8)",
                            ],
                          },
                        ],
                      }}
                      height={300}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.refundTypeBreakdown")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {refundData.refundsByType.map((item, index) => (
                        <div key={index} className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                          <div>
                            <Badge className={getRefundTypeColor(item.type || "")}>
                              {formatRefundType(item.type || "")}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatNumber(item.count)} {t("admin.revenueAnalytics.refunds")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(item.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {((item.amount / refundData.summary.totalRefundAmount) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.refundsByPaymentMethod")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {refundData.refundsByPaymentMethod.map((item, index) => (
                        <div key={index} className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                          <div>
                            <p className="text-sm font-semibold">
                              {item.method ? formatPaymentMethod(item.method) : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(item.count)} {t("admin.revenueAnalytics.refunds")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(item.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              {((item.amount / refundData.summary.totalRefundAmount) * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {refundData.recentRefunds && refundData.recentRefunds.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("admin.revenueAnalytics.recentRefunds")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                              {t("admin.revenueAnalytics.orderNumber")}
                            </th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                              {t("admin.revenueAnalytics.amount")}
                            </th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                              {t("admin.revenueAnalytics.type")}
                            </th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                              {t("admin.revenueAnalytics.status")}
                            </th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                              {t("admin.revenueAnalytics.refundedBy")}
                            </th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">
                              {t("admin.revenueAnalytics.date")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {refundData.recentRefunds.map((refund) => (
                            <tr key={refund.id} className="border-b hover:bg-muted/30">
                              <td className="p-3 text-sm">{refund.orderNumber}</td>
                              <td className="p-3 text-sm font-semibold">{formatCurrency(refund.amount)}</td>
                              <td className="p-3 text-sm">
                                <Badge className={getRefundTypeColor(refund.refundType)}>
                                  {formatRefundType(refund.refundType)}
                                </Badge>
                              </td>
                              <td className="p-3 text-sm">
                                <Badge className={getStatusColor(refund.status)}>
                                  {formatRefundStatus(refund.status)}
                                </Badge>
                              </td>
                              <td className="p-3 text-sm text-muted-foreground">{refund.refundedBy}</td>
                              <td className="p-3 text-sm text-muted-foreground">
                                {new Date(refund.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center gap-2">
                  <Icon path={mdiClipboardList} size={2} className="text-muted-foreground" />
                  <h3 className="text-lg font-semibold">{t("admin.revenueAnalytics.noRefundData")}</h3>
                  <p className="text-sm text-muted-foreground">{t("admin.revenueAnalytics.noRefundDataDescription")}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RevenueAnalytics;
