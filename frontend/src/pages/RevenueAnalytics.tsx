import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiCurrencyUsd, mdiTrendingUp, mdiTrendingDown, mdiClipboardList, mdiFilter, mdiRefresh, mdiDownload } from "@mdi/js";
import AnalyticsTimePeriodFilter, {
  type TimePeriod,
} from "@/components/admin/AnalyticsTimePeriodFilter";
import Chart from "@/components/admin/Chart";
import StatsCard from "@/components/admin/StatsCard";
import { analyticsService } from "@/services/analyticsService";
import type { ChartData } from "@/services/dashboardService";
import type {
  RevenueAnalyticsData,
  RefundAnalyticsData,
  AnalyticsFilters,
} from "@/services/analyticsService";
import { useTranslation } from "react-i18next";
import branchService, { type Branch } from "@/services/branchService";
import { usePermissions } from "@/contexts/PermissionContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const RevenueAnalytics: React.FC = () => {
  const { userRole, userType, orgRole, getToken } = useAuth();
  const { assignedBranchIds, isSuperAdmin } = usePermissions();
  const navigate = useNavigate();
  const { currency } = useSettings();
  const { subscribe } = useAdminWebSocket();
  const { t } = useTranslation();

  const STORAGE_KEY = "bellami:revenueAnalytics:filters";

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

  const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  const canSelectAllBranches = isSuperAdmin || isOrgAdmin;
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
  const [revenueData, setRevenueData] = useState<RevenueAnalyticsData | null>(
    null
  );
  const [refundData, setRefundData] = useState<RefundAnalyticsData | null>(
    null
  );
  const [branchRevenueChartData, setBranchRevenueChartData] =
    useState<ChartData | null>(null);
  const [branchRefundsChartData, setBranchRefundsChartData] =
    useState<ChartData | null>(null);
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

    return {
      timePeriod: {
        type: "monthly",
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        endDate: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0,
          23,
          59,
          59
        ),
        label: `${new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1
        ).toLocaleDateString("en-US", {
          month: "long",
        })} ${new Date().getFullYear()}`,
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
      },
    };
  });

  // Persist filters to sessionStorage
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
              endDate: (filters.timePeriod.endDate as any)?.toISOString?.() || filters.timePeriod.endDate,
            },
          },
        })
      );
    } catch {
      // Ignore storage write errors
    }
  }, [STORAGE_KEY, activeTab, filters, selectedBranchId]);

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

  // Load data function
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

        // Only fetch branch charts when "all" is selected
        if (isAllBranches) {
          promises.push(
            analyticsService.getBranchRevenueChart(filters, token)
          );
        }

        const results = await Promise.all(promises);
        setRevenueData(results[0]);
        
        if (isAllBranches) {
          setBranchRevenueChartData(results[1]);
        } else {
          setBranchRevenueChartData(null);
        }
      } else {
        const promises: Promise<any>[] = [
          analyticsService.getRefundAnalytics(filters, branchIdForApi, token),
        ];

        // Only fetch branch refunds chart when "all" is selected
        if (isAllBranches) {
          promises.push(
            analyticsService.getBranchRefundsChart(filters, token)
          );
        }

        const results = await Promise.all(promises);
        setRefundData(results[0]);
        
        if (isAllBranches) {
          setBranchRefundsChartData(results[1]);
        } else {
          setBranchRefundsChartData(null);
        }
      }
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load data when filters change
  useEffect(() => {
    loadData();
  }, [filters, activeTab, selectedBranchId, getToken]);

  // WebSocket connection for real-time analytics updates
  useEffect(() => {
    // Subscribe to new order events with automatic cleanup
    const unsubscribe = subscribe("new-order", () => {
      loadData();
    });

    // Cleanup on unmount
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeTab, selectedBranchId, subscribe]); // Include filters, activeTab, and selectedBranchId to refetch with current filters

  const handleTimePeriodChange = (timePeriod: TimePeriod) => {
    setFilters((prev) => ({ ...prev, timePeriod }));
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      const branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;

      if (activeTab === "revenue") {
        const data = await analyticsService.getRevenueAnalytics(filters, branchIdForApi, token);
        setRevenueData(data);
      } else {
        const data = await analyticsService.getRefundAnalytics(filters, branchIdForApi, token);
        setRefundData(data);
      }
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "revenue" | "refunds");
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
    const typeKey =
      typeMap[normalizedType] || `admin.orderManagement.refundType`;
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

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.analytics.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.analytics.description")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground">
            {t("admin.analytics.branchLabel")}
          </Label>
          <Select
            value={selectedBranchId || "all"}
            onValueChange={(value: string) => setSelectedBranchId(value || "all")}
            disabled={loadingBranches}
          >
            <SelectTrigger className="bg-transparent text-foreground border-border w-full">
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
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <Icon path={mdiFilter} size={0.67} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t("admin.analytics.filters")}
            </span>
          </div>
          <AnalyticsTimePeriodFilter
            selectedPeriod={filters.timePeriod!}
            onPeriodChange={handleTimePeriodChange}
          />
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center justify-center gap-2 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 w-full sm:w-auto"
            >
              <Icon path={mdiRefresh} size={0.67} className={loading ? "animate-spin" : ""} />
              {t("admin.analytics.refresh")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center justify-center gap-2 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 w-full sm:w-auto"
            >
              <Icon path={mdiDownload} size={0.67} />
              {t("admin.analytics.export")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800">
          <TabsTrigger
            value="revenue"
            className="flex items-center gap-2 data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Icon path={mdiCurrencyUsd} size={0.67} />
            {t("admin.analytics.revenueTab")}
          </TabsTrigger>
          <TabsTrigger
            value="refunds"
            className="flex items-center gap-2 data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Icon path={mdiClipboardList} size={0.67} />
            {t("admin.analytics.refundTab")}
          </TabsTrigger>
        </TabsList>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Icon path={mdiRefresh} size={1.33} className="animate-spin text-pink-500" />
            </div>
          ) : revenueData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatsCard
                  title={t("admin.analytics.revenue.totalRevenue")}
                  value={formatCurrency(revenueData.summary.totalRevenue)}
                  iconPath={mdiCurrencyUsd}
                  change={
                    revenueData.summary.monthOverMonthChanges?.revenueChange ||
                    0
                  }
                  iconColor="text-green-500"
                />
                <StatsCard
                  title={t("admin.analytics.revenue.taxesOwed")}
                  value={formatCurrency(revenueData.summary.totalTaxes || 0)}
                  iconPath={mdiTrendingDown}
                  change={0}
                  iconColor="text-orange-500"
                />
                <StatsCard
                  title={t("admin.analytics.revenue.totalRefunds")}
                  value={formatCurrency(revenueData.summary.totalRefunds)}
                  iconPath={mdiTrendingDown}
                  change={
                    revenueData.summary.monthOverMonthChanges?.refundsChange ||
                    0
                  }
                  iconColor="text-red-500"
                />
                <StatsCard
                  title={t("admin.analytics.revenue.netRevenue")}
                  value={formatCurrency(revenueData.summary.netRevenue)}
                  iconPath={mdiTrendingUp}
                  change={
                    revenueData.summary.monthOverMonthChanges
                      ?.netRevenueChange || 0
                  }
                  iconColor="text-blue-500"
                />
                <StatsCard
                  title={t("admin.analytics.revenue.totalOrders")}
                  value={formatNumber(revenueData.summary.totalOrders)}
                  iconPath={mdiClipboardList}
                  change={
                    revenueData.summary.monthOverMonthChanges?.ordersChange || 0
                  }
                  iconColor="text-purple-500"
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Branch Revenue Chart - Only when "All Branches" is selected */}
                {selectedBranchId === "all" && branchRevenueChartData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Icon path={mdiCurrencyUsd} size={0.83} className="text-pink-500" />
                        {t("admin.analytics.revenue.branchRevenue") ||
                          "Revenue by Branch"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Chart
                        type="doughnut"
                        data={branchRevenueChartData}
                        height={300}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Monthly Revenue Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon path={mdiTrendingUp} size={0.83} className="text-pink-500" />
                      {filters.timePeriod?.type === "daily"
                        ? t("admin.analytics.revenue.dailyRevenueTrend") ||
                          "Daily Revenue Trend"
                        : filters.timePeriod?.type === "weekly"
                        ? t("admin.analytics.revenue.weeklyRevenueTrend") ||
                          "Weekly Revenue Trend"
                        : filters.timePeriod?.type === "yearly"
                        ? t("admin.analytics.revenue.yearlyRevenueTrend") ||
                          "Yearly Revenue Trend"
                        : t("admin.analytics.revenue.monthlyRevenueTrend")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type={
                        filters.timePeriod?.type === "custom" ? "line" : "bar"
                      }
                      data={{
                        labels: revenueData.chartData.map((item) => {
                          // Format label based on period type
                          const periodType =
                            filters.timePeriod?.type || "monthly";
                          if (periodType === "daily") {
                            // item.month is in "yyyy-MM-dd" format
                            const date = new Date(item.month + "T00:00:00");
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                          } else if (periodType === "weekly") {
                            // item.month is the week start date in "yyyy-MM-dd" format
                            const date = new Date(item.month + "T00:00:00");
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
                            // item.month is in "yyyy" format
                            return item.month;
                          } else if (periodType === "custom") {
                            // item.month is in "yyyy-MM-dd" format for custom
                            const date = new Date(item.month + "T00:00:00");
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                          } else {
                            // monthly - item.month is in "yyyy-MM" format
                            const date = new Date(item.month + "-01");
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                            });
                          }
                        }),
                        datasets:
                          filters.timePeriod?.type === "custom"
                            ? [
                                // Line chart order: Revenue, Refunds, Orders
                                {
                                  label: t("admin.analytics.revenue.revenue"),
                                  data: revenueData.chartData.map(
                                    (item) => item.revenue
                                  ),
                                  borderColor: "rgb(34, 197, 94)",
                                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                                  tension: 0.4,
                                  yAxisID: "y",
                                },
                                {
                                  label: t("admin.analytics.revenue.refunds"),
                                  data: revenueData.chartData.map(
                                    (item) => item.refunds
                                  ),
                                  borderColor: "rgb(239, 68, 68)",
                                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                                  tension: 0.4,
                                  yAxisID: "y",
                                },
                                {
                                  label: t("admin.analytics.revenue.orders"),
                                  data: revenueData.chartData.map(
                                    (item) => item.orders
                                  ),
                                  borderColor: "rgb(59, 130, 246)",
                                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                                  tension: 0.4,
                                  yAxisID: "y1",
                                },
                              ]
                            : [
                                // Bar chart order: Revenue (left), Orders (middle), Refunds (right)
                                {
                                  label: t("admin.analytics.revenue.revenue"),
                                  data: revenueData.chartData.map(
                                    (item) => item.revenue
                                  ),
                                  backgroundColor: "rgba(34, 197, 94, 0.8)",
                                  borderColor: "rgb(34, 197, 94)",
                                  borderWidth: 1,
                                  yAxisID: "y",
                                },
                                {
                                  label: t("admin.analytics.revenue.orders"),
                                  data: revenueData.chartData.map(
                                    (item) => item.orders
                                  ),
                                  backgroundColor: "rgba(59, 130, 246, 0.8)",
                                  borderColor: "rgb(59, 130, 246)",
                                  borderWidth: 1,
                                  yAxisID: "y1",
                                },
                                {
                                  label: t("admin.analytics.revenue.refunds"),
                                  data: revenueData.chartData.map(
                                    (item) => item.refunds
                                  ),
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

                {/* Payment Method Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon path={mdiCurrencyUsd} size={0.83} className="text-pink-500" />
                      {t("admin.analytics.revenue.paymentMethodBreakdown")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type="doughnut"
                      data={{
                        labels: revenueData.paymentMethodBreakdown
                          .filter((item) => item.method)
                          .map((item) =>
                            item.method.replace("_", " ").toUpperCase()
                          ),
                        datasets: [
                          {
                            label: t("admin.analytics.revenue.revenue"),
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

              {/* Detailed Breakdown Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Method Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t("admin.analytics.revenue.paymentMethodDetails")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {revenueData.paymentMethodBreakdown.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {formatPaymentMethod(item.method)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatNumber(item.orders)}{" "}
                              {t("admin.analytics.revenue.ordersText")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">
                              {formatCurrency(item.revenue)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {(
                                (item.revenue /
                                  revenueData.summary.totalRevenue) *
                                100
                              ).toFixed(1)}
                              %
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Order Status Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t("admin.analytics.revenue.orderStatusDetails")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {revenueData.orderStatusBreakdown.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {formatOrderStatus(item.status)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatNumber(item.orders)}{" "}
                              {t("admin.analytics.revenue.ordersText")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">
                              {formatCurrency(item.revenue)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {(
                                (item.revenue /
                                  revenueData.summary.totalRevenue) *
                                100
                              ).toFixed(1)}
                              %
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
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {t("admin.analytics.revenue.noDataAvailable")}
              </p>
            </div>
          )}
        </TabsContent>

        {/* Refunds Tab */}
        <TabsContent value="refunds" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Icon path={mdiRefresh} size={1.33} className="animate-spin text-pink-500" />
            </div>
          ) : refundData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatsCard
                  title={t("admin.analytics.refund.totalRefundAmount")}
                  value={formatCurrency(refundData.summary.totalRefundAmount)}
                  iconPath={mdiTrendingDown}
                  change={0}
                  iconColor="text-red-500"
                />
                <StatsCard
                  title={t("admin.analytics.refund.totalRefunds")}
                  value={formatNumber(refundData.summary.totalRefundsCount)}
                  iconPath={mdiClipboardList}
                  change={0}
                  iconColor="text-orange-500"
                />
                <StatsCard
                  title={t("admin.analytics.refund.averageRefund")}
                  value={formatCurrency(refundData.summary.averageRefundAmount)}
                  iconPath={mdiCurrencyUsd}
                  change={0}
                  iconColor="text-purple-500"
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Branch Refunds Chart - Only when "All Branches" is selected */}
                {selectedBranchId === "all" && branchRefundsChartData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Icon path={mdiTrendingDown} size={0.83} className="text-pink-500" />
                        {t("admin.analytics.refund.branchRefunds") ||
                          "Refunds by Branch"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Chart
                        type="doughnut"
                        data={branchRefundsChartData}
                        height={300}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Monthly Refunds Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon path={mdiTrendingDown} size={0.83} className="text-red-500" />
                      {filters.timePeriod?.type === "daily"
                        ? t("admin.analytics.refund.dailyRefundsTrend") ||
                          "Daily Refunds Trend"
                        : filters.timePeriod?.type === "weekly"
                        ? t("admin.analytics.refund.weeklyRefundsTrend") ||
                          "Weekly Refunds Trend"
                        : filters.timePeriod?.type === "yearly"
                        ? t("admin.analytics.refund.yearlyRefundsTrend") ||
                          "Yearly Refunds Trend"
                        : t("admin.analytics.refund.monthlyRefundsTrend")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Chart
                      type="bar"
                      data={{
                        labels: refundData.chartData.map((item) => {
                          // Format label based on period type
                          const periodType =
                            filters.timePeriod?.type || "monthly";
                          if (periodType === "daily") {
                            // item.month is in "yyyy-MM-dd" format
                            const date = new Date(item.month + "T00:00:00");
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                          } else if (periodType === "weekly") {
                            // item.month is the week start date in "yyyy-MM-dd" format
                            const date = new Date(item.month + "T00:00:00");
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
                            // item.month is in "yyyy" format
                            return item.month;
                          } else {
                            // monthly - item.month is in "yyyy-MM" format
                            const date = new Date(item.month + "-01");
                            return date.toLocaleDateString("en-US", {
                              month: "short",
                            });
                          }
                        }),
                        datasets: [
                          {
                            label: t("admin.analytics.refund.refundAmount"),
                            data: refundData.chartData.map(
                              (item) => item.amount
                            ),
                            backgroundColor: "rgba(239, 68, 68, 0.8)",
                            borderColor: "rgb(239, 68, 68)",
                          },
                          {
                            label: t("admin.analytics.refund.refundCount"),
                            data: refundData.chartData.map(
                              (item) => item.count
                            ),
                            backgroundColor: "rgba(245, 158, 11, 0.8)",
                            borderColor: "rgb(245, 158, 11)",
                            yAxisID: "y1",
                          },
                        ],
                      }}
                      height={300}
                    />
                  </CardContent>
                </Card>

                {/* Refund Status Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon path={mdiClipboardList} size={0.83} className="text-red-500" />
                      {t("admin.analytics.refund.refundStatusBreakdown")}
                    </CardTitle>
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
                            label: t("admin.analytics.refund.refundsText"),
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

              {/* Refund Details Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Refund Type Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t("admin.analytics.refund.refundTypeBreakdown")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {refundData.refundsByType.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div>
                            <Badge
                              className={getRefundTypeColor(item.type || "")}
                            >
                              {formatRefundType(item.type || "")}
                            </Badge>
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatNumber(item.count)}{" "}
                              {t("admin.analytics.refund.refundsText")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">
                              {formatCurrency(item.amount)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {(
                                (item.amount /
                                  refundData.summary.totalRefundAmount) *
                                100
                              ).toFixed(1)}
                              %
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Method Refunds */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t("admin.analytics.refund.refundsByPaymentMethod")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {refundData.refundsByPaymentMethod.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-foreground">
                              {item.method
                                ? formatPaymentMethod(item.method)
                                : ""}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatNumber(item.count)}{" "}
                              {t("admin.analytics.refund.refundsText")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-foreground">
                              {formatCurrency(item.amount)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {(
                                (item.amount /
                                  refundData.summary.totalRefundAmount) *
                                100
                              ).toFixed(1)}
                              %
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Refunds Table */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("admin.analytics.refund.recentRefunds")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            {t("admin.analytics.refund.orderNumber")}
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            {t("admin.analytics.refund.amount")}
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            {t("admin.analytics.refund.type")}
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            {t("admin.analytics.refund.status")}
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            {t("admin.analytics.refund.refundedBy")}
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                            {t("admin.analytics.refund.date")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {refundData.recentRefunds.map((refund) => (
                          <tr
                            key={refund.id}
                            className="border-b hover:bg-muted/50"
                          >
                            <td className="py-3 px-4 text-foreground">
                              {refund.orderNumber}
                            </td>
                            <td className="py-3 px-4 font-semibold text-foreground">
                              {formatCurrency(refund.amount)}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                className={getRefundTypeColor(
                                  refund.refundType
                                )}
                              >
                                {formatRefundType(refund.refundType)}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge className={getStatusColor(refund.status)}>
                                {formatRefundStatus(refund.status)}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {refund.refundedBy}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {new Date(refund.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {t("admin.analytics.refund.noDataAvailable")}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RevenueAnalytics;
