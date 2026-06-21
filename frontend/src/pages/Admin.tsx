import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useAdminWebSocket } from "@/contexts/AdminWebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiAccountGroup, mdiFood, mdiChartBar, mdiCurrencyUsd, mdiClipboardList, mdiRefresh, mdiArrowExpand, mdiArrowCollapse, mdiShape, mdiCursorPointer } from "@mdi/js";
import TimePeriodFilter from "@/components/admin/TimePeriodFilter";
import Chart from "@/components/admin/Chart";
import StatsCard from "@/components/admin/StatsCard";
import { dashboardService } from "@/services/dashboardService";
import type { TimePeriod } from "@/components/admin/TimePeriodFilter";
import type { DashboardStats, ChartData } from "@/services/dashboardService";
import { useTranslation } from "react-i18next";
import branchService, { type Branch } from "@/services/branchService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const Admin: React.FC = () => {
  const { t } = useTranslation();
  const { userRole, userType, orgRole, getToken } = useAuth();
  const { subscribe } = useAdminWebSocket();
  const navigate = useNavigate();
  const { currency } = useSettings();

  // Helper function to determine validation status
  const getValidationStatus = (organization: any) => {
    if (!organization.validation) {
      return { status: 'no_validation', message: 'No validation record found' };
    }

    const { validation } = organization;
    const now = new Date();
    const expiresAt = new Date(validation.expiresAt);
    const gracePeriodEndsAt = new Date(validation.gracePeriodEndsAt);

    // Check if expired
    if (now > expiresAt) {
      // Check if still in grace period
      if (now <= gracePeriodEndsAt) {
        return { status: 'grace_period', message: 'In grace period after expiration' };
      } else {
        return { status: 'expired', message: 'Validation expired' };
      }
    }

    // If validation was manually unvalidated (temporarily invalid) - only if not expired
    if (validation.unvalidatedAt || validation.isActive === false) {
      return { status: 'temporarily_invalid', message: 'Validation temporarily inactive' };
    }

    // Valid
    return { status: 'valid', message: 'Valid', expiresAt };
  };

  const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  const canSelectAllBranches = userType === "SUPER_ADMIN" || isOrgAdmin;

  // State management
  const [selectedPeriod, setSelectedPeriod] =
    useState<TimePeriod>("last_30_days");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ordersChartData, setOrdersChartData] = useState<ChartData | null>(
    null
  );
  const [categoriesChartData, setCategoriesChartData] =
    useState<ChartData | null>(null);
  const [branchRevenueChartData, setBranchRevenueChartData] =
    useState<ChartData | null>(null);
  const [branchOrdersChartData, setBranchOrdersChartData] =
    useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChartMaximized, setIsChartMaximized] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

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
          ? fetchedBranches.map((b) => b.id) // branchService already scopes to allowed branches for non-admins
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
  }, [getToken, isOrgAdmin, userType]);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    if (!selectedBranchId || selectedBranchId === "") {
      // Don't load if no branch is selected
      setLoading(false);
      setStats(null);
      setOrdersChartData(null);
      setCategoriesChartData(null);
      setBranchRevenueChartData(null);
      setBranchOrdersChartData(null);
      return;
    }

    try {
      setLoading(true);

      // Get authentication token
      const token = await getToken();

      // Pass undefined for "all" to backend (for other dashboard stats), but handle organization click stats separately
      const isAllBranches = selectedBranchId === "all";
      const branchIdForApi = isAllBranches ? undefined : selectedBranchId;

      // Fetch stats and charts in parallel
      const promises: Promise<any>[] = [
        dashboardService.getDashboardStats(selectedPeriod, branchIdForApi, token || undefined),
        dashboardService.getChartData(
          selectedPeriod,
          "orders",
          branchIdForApi,
          token || undefined
        ),
        dashboardService.getChartData(
          selectedPeriod,
          "categories",
          branchIdForApi,
          token || undefined
        ),
      ];

      // Only fetch branch charts when "all" is selected
      if (isAllBranches) {
        promises.push(
          dashboardService.getChartData(
            selectedPeriod,
            "branchRevenue",
            branchIdForApi,
            token || undefined
          ),
          dashboardService.getChartData(
            selectedPeriod,
            "branchOrders",
            branchIdForApi,
            token || undefined
          )
        );
      }

      const results = await Promise.all(promises);
      
      setStats(results[0]);
      setOrdersChartData(results[1]);
      setCategoriesChartData(results[2]);
      
      if (isAllBranches) {
        setBranchRevenueChartData(results[3]);
        setBranchOrdersChartData(results[4]);
      } else {
        setBranchRevenueChartData(null);
        setBranchOrdersChartData(null);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get period label for change labels
  const getPeriodLabel = (period: TimePeriod): string => {
    const periodMap: Record<TimePeriod, string> = {
      today: t("admin.dashboard.periods.yesterday"),
      this_week: t("admin.dashboard.periods.lastWeek"),
      this_month: t("admin.dashboard.periods.lastMonth"),
      last_7_days: t("admin.dashboard.periods.lastWeek"),
      last_30_days: t("admin.dashboard.periods.lastMonth"),
      last_3_months: t("admin.dashboard.periods.previousPeriod"),
      last_6_months: t("admin.dashboard.periods.previousPeriod"),
      this_year: t("admin.dashboard.periods.previousPeriod"),
    };
    return periodMap[period] || t("admin.dashboard.periods.previousPeriod");
  };

  // Fetch data when component mounts or period/branch changes
  useEffect(() => {
    fetchDashboardData();
  }, [selectedPeriod, selectedBranchId]);

  // Handle window resize for maximized chart
  useEffect(() => {
    if (!isChartMaximized) return;

    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial call

    return () => window.removeEventListener("resize", handleResize);
  }, [isChartMaximized]);

  // WebSocket connection for real-time dashboard updates
  useEffect(() => {
    // Only subscribe if branch is selected (including "all")
    if (!selectedBranchId || selectedBranchId === "") {
      return;
    }

    // Subscribe to new order events with automatic cleanup
    const unsubscribe = subscribe("new-order", () => {
      fetchDashboardData();
    });

    // Cleanup on unmount or when selectedPeriod/branch changes
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedBranchId, subscribe]); // Include selectedPeriod and selectedBranchId to refetch when they change

  // Redirect if not admin
  if (userRole !== "ADMIN") {
    return (
      <div className="min-h-screen bg-background py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-red-500 text-6xl mb-4">🚫</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {t("admin.dashboard.accessDenied")}
              </h2>
              <p className="text-muted-foreground mb-4">
                {t("admin.dashboard.noPermission")}
              </p>
              <Button
                onClick={() => navigate("/")}
                className="bg-pink-500 hover:bg-pink-600 text-white"
              >
                {t("admin.dashboard.goHome")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 pb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-pink-500">
              {t("admin.dashboard.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin.dashboard.description")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex flex-col gap-2 flex-1 sm:flex-initial">
              <Label className="text-sm font-medium text-foreground">
                {t("admin.dashboard.branchLabel")}
              </Label>
              <Select
                value={selectedBranchId}
                onValueChange={(value: string) => {
                  setSelectedBranchId(value);
                }}
                disabled={loadingBranches}
              >
                <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-auto sm:min-w-[180px]">
                  <SelectValue placeholder={t("admin.dashboard.selectBranch")} />
                </SelectTrigger>
                <SelectContent>
                  {canSelectAllBranches && (
                    <SelectItem value="all">{t("admin.dashboard.allBranches")}</SelectItem>
                  )}
                  {branches.map((branch: Branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 flex-1 sm:flex-initial">
              <Label className="text-sm font-medium text-foreground">
                {t("admin.dashboard.periodLabel")}
              </Label>
              <TimePeriodFilter
                selectedPeriod={selectedPeriod}
                onPeriodChange={setSelectedPeriod}
              />
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Icon path={mdiRefresh} size={2.00} className="animate-spin text-pink-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("admin.dashboard.loadingTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("admin.dashboard.loadingDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-pink-500 mb-4">
          {t("admin.dashboard.title")}
        </h2>
        {/* Filters - Below title, stacked on mobile, side-by-side on desktop */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="flex flex-col gap-2 flex-1 sm:flex-initial">
            <Label className="text-sm font-medium text-foreground">
              {t("admin.dashboard.branchLabel")}
            </Label>
            <Select
              value={selectedBranchId}
              onValueChange={(value: string) => {
                setSelectedBranchId(value);
              }}
              disabled={loadingBranches}
            >
              <SelectTrigger className="bg-transparent text-foreground border-border w-full sm:w-auto sm:min-w-[180px]">
                <SelectValue placeholder={t("admin.dashboard.selectBranch")} />
              </SelectTrigger>
              <SelectContent>
                {canSelectAllBranches && (
                  <SelectItem value="all">{t("admin.dashboard.allBranches")}</SelectItem>
                )}
                {branches.map((branch: Branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 flex-1 sm:flex-initial">
            <Label className="text-sm font-medium text-foreground">
              {t("admin.dashboard.periodLabel")}
            </Label>
            <TimePeriodFilter
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
          </div>
        </div>
      </div>

      {/* Inactive Branch Message */}
      {stats?.selectedBranch && !stats.selectedBranch.isActive && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="text-orange-500 text-sm">⚠️</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800">
                {t("admin.dashboard.inactiveBranchMessage", {
                  branchName: stats.selectedBranch.name,
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Inactive Organization Message */}
      {stats?.selectedOrganization && !stats.selectedOrganization.isActive && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="text-red-500 text-sm">🚫</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {t("admin.dashboard.inactiveOrganizationMessage", {
                  organizationName: stats.selectedOrganization.name,
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Organization Validation Status Messages */}
      {stats?.selectedOrganization && stats.selectedOrganization.isActive && stats.selectedOrganization.validation && (() => {
        const validationStatus = getValidationStatus(stats.selectedOrganization);
        const formatDate = (dateString: string) => {
          return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        };

        switch (validationStatus.status) {
          case 'valid':
            return (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-green-500 text-sm">✅</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">
                      {t("admin.dashboard.validationValidMessage", {
                        organizationName: stats.selectedOrganization.name,
                        validUntil: validationStatus.expiresAt ? formatDate(validationStatus.expiresAt.toISOString()) : 'Unknown',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          case 'grace_period':
            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-yellow-500 text-sm">⏰</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">
                      {t("admin.dashboard.validationGracePeriodMessage", {
                        organizationName: stats.selectedOrganization.name,
                        gracePeriodEnds: formatDate(stats.selectedOrganization.validation.gracePeriodEndsAt),
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          case 'expired':
            return (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-red-500 text-sm">❌</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      {t("admin.dashboard.validationExpiredMessage", {
                        organizationName: stats.selectedOrganization.name,
                        expiredOn: formatDate(stats.selectedOrganization.validation.expiresAt),
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          case 'unvalidated':
            return (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-orange-500 text-sm">⚠️</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800">
                      {t("admin.dashboard.validationUnvalidatedMessage", {
                        organizationName: stats.selectedOrganization.name,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          case 'temporarily_invalid':
            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-yellow-500 text-sm">⏸️</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">
                      {t("admin.dashboard.validationTemporarilyInvalidMessage", {
                        organizationName: stats.selectedOrganization.name,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          default:
            return null;
        }
      })()}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title={t("admin.dashboard.totalUsers")}
          value={stats?.totalUsers || 0}
          iconPath={mdiAccountGroup}
          iconColor="text-blue-500"
        />
        <StatsCard
          title={t("admin.dashboard.menuItems")}
          value={stats?.totalMenuItems || 0}
          iconPath={mdiFood}
          iconColor="text-green-500"
        />
        <StatsCard
          title={t("admin.dashboard.orders")}
          value={stats?.totalOrders || 0}
          change={stats?.ordersChange}
          changeLabel={t("admin.dashboard.fromPeriod", {
            period: getPeriodLabel(selectedPeriod),
          })}
          iconPath={mdiClipboardList}
          iconColor="text-purple-500"
        />
        <StatsCard
          title={t("admin.dashboard.revenue")}
          value={formatPrice(stats?.totalRevenue || 0, currency)}
          change={stats?.revenueChange}
          changeLabel={t("admin.dashboard.fromPeriod", {
            period: getPeriodLabel(selectedPeriod),
          })}
          iconPath={mdiCurrencyUsd}
          iconColor="text-pink-500"
        />
        {/* Branch Clicks - Show for all branches and specific branches */}
        <StatsCard
          title={selectedBranchId === "all" 
            ? t("admin.dashboard.totalBranchClicks") 
            : t("admin.dashboard.branchClicks")
          }
          value={stats?.totalBranchClicks || 0}
          change={stats?.branchClicksChange}
          changeLabel={t("admin.dashboard.fromPeriod", {
            period: getPeriodLabel(selectedPeriod),
          })}
          iconPath={mdiCursorPointer}
          iconColor="text-orange-500"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6">
        {/* Orders & Revenue Chart */}
        <Card
          className={isChartMaximized ? "fixed z-50 m-0 rounded-none" : ""}
          style={
            isChartMaximized
              ? {
                  transform: "rotate(90deg)",
                  transformOrigin: "center center",
                  width: `${viewportSize.height}px`,
                  height: `${viewportSize.width}px`,
                  top: "50%",
                  left: "50%",
                  marginTop: `-${viewportSize.width / 2}px`,
                  marginLeft: `-${viewportSize.height / 2}px`,
                }
              : {}
          }
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Icon path={mdiChartBar} size={0.83} className="text-pink-500" />
                {t("admin.dashboard.ordersRevenueTrend")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChartMaximized(!isChartMaximized)}
                className="text-xs px-2 py-1 h-6 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10 md:hidden"
              >
                {isChartMaximized ? (
                  <>
                    <Icon path={mdiArrowCollapse} size={0.50} className="mr-1" />
                    {t("admin.dashboard.minimize")}
                  </>
                ) : (
                  <>
                    <Icon path={mdiArrowExpand} size={0.50} className="mr-1" />
                    {t("admin.dashboard.maximize")}
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent
            className={
              isChartMaximized
                ? "h-[calc(100%-80px)] p-6 flex flex-col justify-end"
                : ""
            }
          >
            {ordersChartData ? (
              <div className={isChartMaximized ? "w-full" : ""}>
                <Chart
                  type="line"
                  data={ordersChartData}
                  height={isChartMaximized ? viewportSize.width - 200 : 300}
                />
              </div>
            ) : (
              <div
                className={`${
                  isChartMaximized ? "h-full" : "h-[300px]"
                } flex items-center justify-center text-muted-foreground`}
              >
                {t("admin.dashboard.noDataAvailable")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Categories Chart - Hide when chart is maximized */}
        {!isChartMaximized && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Icon path={mdiShape} size={0.83} className="text-pink-500" />
                  {t("admin.dashboard.popularCategories")}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/admin/insights")}
                  className="text-xs px-2 py-1 h-6 border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-400 dark:text-pink-400 dark:hover:bg-pink-500/10"
                >
                  {t("admin.dashboard.insights")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {categoriesChartData &&
              categoriesChartData.labels &&
              categoriesChartData.labels.length > 0 ? (
                <Chart
                  type="doughnut"
                  data={categoriesChartData}
                  height={300}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Icon path={mdiShape} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                    <p>{t("admin.dashboard.noCategoryData")}</p>
                    <p className="text-sm text-muted-foreground/70">
                      {t("admin.dashboard.tryDifferentPeriod")}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Branch Revenue Chart - Only show when "All Branches" is selected */}
        {!isChartMaximized && selectedBranchId === "all" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon path={mdiCurrencyUsd} size={0.8} className="text-pink-500" />
                {t("admin.dashboard.branchRevenue")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {branchRevenueChartData &&
              branchRevenueChartData.labels &&
              branchRevenueChartData.labels.length > 0 &&
              branchRevenueChartData.labels[0] !== "No Data" ? (
                <Chart
                  type="doughnut"
                  data={branchRevenueChartData}
                  height={300}
                  onElementClick={(idx) => {
                    const branchIds = (branchRevenueChartData as any)?.branchIds as string[] | undefined;
                    const next = branchIds?.[idx];
                    if (next) setSelectedBranchId(next);
                  }}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Icon path={mdiCurrencyUsd} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                    <p>{t("admin.dashboard.noBranchRevenueData")}</p>
                    <p className="text-sm text-muted-foreground/70">
                      {t("admin.dashboard.tryDifferentPeriod")}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Branch Orders Chart - Only show when "All Branches" is selected */}
        {!isChartMaximized && selectedBranchId === "all" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon path={mdiShape} size={0.8} className="text-pink-500" />
                {t("admin.dashboard.branchOrders")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {branchOrdersChartData &&
              branchOrdersChartData.labels &&
              branchOrdersChartData.labels.length > 0 &&
              branchOrdersChartData.labels[0] !== "No Data" ? (
                <Chart
                  type="doughnut"
                  data={branchOrdersChartData}
                  height={300}
                  onElementClick={(idx) => {
                    const branchIds = (branchOrdersChartData as any)?.branchIds as string[] | undefined;
                    const next = branchIds?.[idx];
                    if (next) setSelectedBranchId(next);
                  }}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Icon path={mdiClipboardList} size={2.00} className="mx-auto mb-4 text-muted-foreground/50" />
                    <p>{t("admin.dashboard.noBranchOrdersData")}</p>
                    <p className="text-sm text-muted-foreground/70">
                      {t("admin.dashboard.tryDifferentPeriod")}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Admin;
