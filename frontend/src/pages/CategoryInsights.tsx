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
import { mdiChartBar, mdiChartLine, mdiFood, mdiCashMultiple, mdiClipboardList, mdiCalendar, mdiChevronDown, mdiRefresh, mdiChartPie, mdiViewGrid, mdiCurrencyUsd } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { categoryInsightsService } from "@/services/categoryInsightsService";
import type { CategoryInsightsData } from "@/types/categoryInsights";
import Chart, { type ChartData } from "@/components/admin/Chart";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";
import { useTranslation } from "react-i18next";
import branchService, { type Branch } from "@/services/branchService";
import { usePermissions } from "@/contexts/PermissionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const CategoryInsights: React.FC = () => {
  const { getToken, userType, orgRole } = useAuth();
  const { assignedBranchIds, isSuperAdmin } = usePermissions();
  const { currency } = useSettings();
  const { subscribe } = useAdminWebSocket();
  const { t } = useTranslation();

  const STORAGE_KEY = "bellami:categoryInsights:filters";

  const getStoredState = ():
    | {
        selectedCategory?: string;
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
        selectedCategory: parsed.selectedCategory,
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
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    typeof stored?.selectedCategory === "string" ? stored.selectedCategory : ""
  );
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
  const [insightsData, setInsightsData] = useState<CategoryInsightsData | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [branchRevenueChartData, setBranchRevenueChartData] =
    useState<ChartData | null>(null);

  // Persist filters to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selectedCategory,
          selectedPeriod,
          selectedBranchId,
        })
      );
    } catch {
      // Ignore storage write errors
    }
  }, [STORAGE_KEY, selectedBranchId, selectedCategory, selectedPeriod]);

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

  // Fetch available categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = await getToken();
        const categoriesData = await categoryInsightsService.getCategories(
          token || undefined
        );
        setCategories(categoriesData);
        if (categoriesData.length > 0) {
          setSelectedCategory((prev) => {
            if (prev && categoriesData.includes(prev)) return prev;
            return categoriesData[0];
          });
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };

    fetchCategories();
  }, [getToken]);

  // Fetch insights data when category, period, or branch changes
  useEffect(() => {
    if (selectedCategory) {
      fetchInsightsData();
    }
  }, [selectedCategory, selectedPeriod, selectedBranchId]);

  // WebSocket connection for real-time category insights updates
  useEffect(() => {
    // Subscribe to new order events with automatic cleanup
    const unsubscribe = subscribe("new-order", () => {
      if (selectedCategory) {
        fetchInsightsData();
      }
    });

    // Cleanup on unmount
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedPeriod, selectedBranchId, subscribe]); // Include dependencies to refetch with current settings

  const fetchInsightsData = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;
      const isAllBranches = selectedBranchId === "all";

      const promises: Promise<any>[] = [
        categoryInsightsService.getCategoryInsights(
          selectedCategory,
          selectedPeriod,
          branchIdForApi,
          token || undefined
        ),
      ];

      // Only fetch branch revenue chart when "all" is selected
      if (isAllBranches && selectedCategory) {
        promises.push(
          categoryInsightsService.getBranchRevenueChart(
            selectedCategory,
            selectedPeriod,
            token || undefined
          )
        );
      }

      const results = await Promise.all(promises);
      setInsightsData(results[0]);

      if (isAllBranches && selectedCategory) {
        setBranchRevenueChartData(results[1]);
      } else {
        setBranchRevenueChartData(null);
      }
    } catch (error) {
      console.error("Error fetching insights data:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedPeriodData = timePeriods.find(
    (p) => p.value === selectedPeriod
  );

  // Prepare chart data
  const salesOverTimeData = insightsData?.salesOverTime
    ? {
        labels: insightsData.salesOverTime.map((item) => item.label),
        datasets: [
          {
            label: `${t("admin.categoryInsights.revenue")} (${currency})`,
            data: insightsData.salesOverTime.map((item) => item.revenue),
            borderColor: "rgb(236, 72, 153)",
            backgroundColor: "rgba(236, 72, 153, 0.1)",
            tension: 0.4,
            yAxisID: "y",
          },
          {
            label: t("admin.categoryInsights.orders"),
            data: insightsData.salesOverTime.map((item) => item.orders),
            borderColor: "rgb(34, 197, 94)",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            tension: 0.4,
            yAxisID: "y1",
          },
        ],
      }
    : null;

  const menuItemsData: ChartData | null = insightsData?.menuItems
    ? {
        labels: insightsData.menuItems.map((item) => item.name),
        datasets: [
          {
            label: `${t("admin.categoryInsights.sales")} ($)`,
            data: insightsData.menuItems.map((item) => item.sales),
            backgroundColor: [
              "rgba(236, 72, 153, 0.8)",
              "rgba(34, 197, 94, 0.8)",
              "rgba(59, 130, 246, 0.8)",
              "rgba(245, 158, 11, 0.8)",
              "rgba(139, 69, 19, 0.8)",
            ],
            borderColor: [
              "rgb(236, 72, 153)",
              "rgb(34, 197, 94)",
              "rgb(59, 130, 246)",
              "rgb(245, 158, 11)",
              "rgb(139, 69, 19)",
            ],
            borderWidth: 2,
          },
        ],
      }
    : null;

  const addOnsData: ChartData | null = insightsData?.popularAddOns
    ? {
        labels: insightsData.popularAddOns.map((item) => item.name),
        datasets: [
          {
            label: t("admin.categoryInsights.count"),
            data: insightsData.popularAddOns.map((item) => item.count),
            backgroundColor: [
              "rgba(236, 72, 153, 0.8)",
              "rgba(34, 197, 94, 0.8)",
              "rgba(59, 130, 246, 0.8)",
              "rgba(245, 158, 11, 0.8)",
              "rgba(139, 69, 19, 0.8)",
              "rgba(168, 85, 247, 0.8)",
              "rgba(239, 68, 68, 0.8)",
              "rgba(16, 185, 129, 0.8)",
            ],
            borderColor: [
              "rgb(236, 72, 153)",
              "rgb(34, 197, 94)",
              "rgb(59, 130, 246)",
              "rgb(245, 158, 11)",
              "rgb(139, 69, 19)",
              "rgb(168, 85, 247)",
              "rgb(239, 68, 68)",
              "rgb(16, 185, 129)",
            ],
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      }
    : null;

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-pink-500">
            {t("admin.categoryInsights.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("admin.categoryInsights.description")}
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Category Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="min-w-[140px] sm:min-w-[160px] justify-between border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
                disabled={loading}
              >
                {loading ? (
                  <Icon path={mdiRefresh} size={0.67} className="animate-spin" />
                ) : (
                  <Icon path={mdiViewGrid} size={0.67} />
                )}
                <span className="text-sm font-medium">
                  {selectedCategory ||
                    t("admin.categoryInsights.selectCategory")}
                </span>
                <Icon path={mdiChevronDown} size={0.67} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 sm:w-56">
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    "cursor-pointer",
                    selectedCategory === category
                      ? "bg-pink-500/20 text-pink-400 border-l-2 border-pink-500"
                      : "hover:bg-gray-800 hover:text-gray-100"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        selectedCategory === category
                          ? "bg-pink-400"
                          : "bg-gray-400"
                      )}
                    />
                    <span>{category}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Time Period Filter */}
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
              {t("admin.categoryInsights.loading")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.categoryInsights.loadingDescription")}
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Icon path={mdiCashMultiple} size={0.83} className="text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("admin.categoryInsights.totalRevenue")}
                </p>
                <p className="text-lg font-semibold">
                  {formatPrice(
                    insightsData?.salesData.totalRevenue || 0,
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
              <Icon path={mdiClipboardList} size={0.83} className="text-blue-400" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("admin.categoryInsights.totalOrders")}
                </p>
                <p className="text-lg font-semibold">
                  {insightsData?.salesData.totalOrders || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Icon path={mdiFood} size={0.83} className="text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("admin.categoryInsights.itemsSold")}
                </p>
                <p className="text-lg font-semibold">
                  {insightsData?.salesData.totalQuantity || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Icon path={mdiChartLine} size={0.83} className="text-pink-500" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("admin.categoryInsights.avgOrderValue")}
                </p>
                <p className="text-lg font-semibold">
                  {formatPrice(
                    insightsData?.salesData.avgOrderValue || 0,
                    currency
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Branch Revenue Chart - Only when "All Branches" is selected */}
        {selectedBranchId === "all" && branchRevenueChartData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon path={mdiCurrencyUsd} size={0.67} className="text-pink-500" />
                {t("admin.categoryInsights.branchRevenue") ||
                  "Revenue by Branch"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <Chart type="doughnut" data={branchRevenueChartData} height={250} />
            </CardContent>
          </Card>
        )}

        {/* Sales Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiChartBar} size={0.67} className="text-pink-500" />
              {t("admin.categoryInsights.salesOverTime")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {salesOverTimeData ? (
              <Chart type="line" data={salesOverTimeData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiChartBar} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.categoryInsights.noSalesData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Menu Items Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiFood} size={0.67} className="text-pink-500" />
              {t("admin.categoryInsights.menuItemsPerformance")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {menuItemsData ? (
              <Chart type="bar" data={menuItemsData} height={250} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Icon path={mdiFood} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                  <p>{t("admin.categoryInsights.noMenuItemsData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Popular Add-ons Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icon path={mdiChartPie} size={0.67} className="text-pink-500" />
            {t("admin.categoryInsights.popularAddons")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          {addOnsData ? (
            <Chart type="doughnut" data={addOnsData} height={250} />
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Icon path={mdiChartPie} size={2} className="mx-auto mb-4 text-muted-foreground/50" />
                <p>{t("admin.categoryInsights.noAddonsData")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Menu Items Table */}
      {insightsData?.menuItems && insightsData.menuItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon path={mdiFood} size={0.67} className="text-pink-500" />
              {t("admin.categoryInsights.menuItemsBreakdown")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-1 text-xs font-medium">
                      {t("admin.categoryInsights.item")}
                    </th>
                    <th className="text-right p-1 text-xs font-medium">
                      {t("admin.categoryInsights.sales")}
                    </th>
                    <th className="text-right p-1 text-xs font-medium">
                      {t("admin.categoryInsights.orders")}
                    </th>
                    <th className="text-right p-1 text-xs font-medium">
                      {t("admin.categoryInsights.qty")}
                    </th>
                    <th className="text-right p-1 text-xs font-medium">
                      {t("admin.categoryInsights.avg")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {insightsData.menuItems.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-1 text-xs font-medium">{item.name}</td>
                      <td className="p-1 text-right text-xs">
                        {formatPrice(item.sales, currency)}
                      </td>
                      <td className="p-1 text-right text-xs">{item.orders}</td>
                      <td className="p-1 text-right text-xs">
                        {item.quantity}
                      </td>
                      <td className="p-1 text-right text-xs">
                        {formatPrice(item.avgPrice, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CategoryInsights;
