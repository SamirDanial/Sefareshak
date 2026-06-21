import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useAdminWebSocket } from "../contexts/AdminWebSocketContext";
import { usePermissions } from "../contexts/PermissionContext";
import { formatPrice } from "../utils/currency";
import {
  Users,
  Package,
  BarChart3,
  DollarSign,
  Receipt,
  RefreshCw,
  Calendar,
  ChevronDown,
  MousePointer,
} from "lucide-react";
import TimePeriodFilter, { type TimePeriod } from "../components/admin/TimePeriodFilter";
import Chart from "../components/admin/Chart";
import StatsCard from "../components/admin/StatsCard";
import { dashboardService } from "../services/dashboardService";
import type { DashboardStats, ChartData } from "../services/dashboardService";
import branchService, { type Branch, type Organization } from "../services/branchService";
import PageHeader from "../components/PageHeader";
import { getValidationStatus } from "../utils/validationStatus";

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

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { userRole, getToken, userType } = useAuth();
  const { isSuperAdmin, isOrgAdmin } = usePermissions();
  const { subscribe } = useAdminWebSocket();
  const navigate = useNavigate();

  // State management
  const [selectedPeriod, setSelectedPeriod] =
    useState<TimePeriod>("last_30_days");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ordersChartData, setOrdersChartData] = useState<ChartData | null>(
    null
  );
  const [categoriesChartData, setCategoriesChartData] =
    useState<ChartData | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [branchRevenueChartData, setBranchRevenueChartData] =
    useState<ChartData | null>(null);
  const [branchOrdersChartData, setBranchOrdersChartData] =
    useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

  const canSelectAllBranches = isSuperAdmin || isOrgAdmin || userType === "SUPER_ADMIN";

  const loadBranches = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const list = await branchService.getBranches(token);
      const all = Array.isArray(list) ? list : [];
      setBranches(all);

      setSelectedBranchId((prev) => {
        // Users without permission to view all branches cannot use "all".
        if (!canSelectAllBranches) {
          if (prev && prev !== "all" && all.some((b) => b.id === prev)) return prev;
          return all[0]?.id || "";
        }

        // Super/org admin can default to "all".
        if (prev && (prev === "all" || all.some((b) => b.id === prev))) return prev;
        return prev || "all";
      });
    } catch {
      setBranches([]);
      if (!canSelectAllBranches) {
        setSelectedBranchId("");
      }
    }
  };

  const fetchSelectedOrganization = async () => {
    try {
      if (userType !== "SUPER_ADMIN") {
        setSelectedOrganization(null);
        return;
      }

      const orgId = getSelectedOrganizationId();
      if (!orgId) {
        setSelectedOrganization(null);
        return;
      }

      const token = await getToken();
      if (!token) return;

      const organizations = await branchService.getOrganizationsWithValidation(token, { limit: 1000 });
      const org = organizations.data.find((o) => o.id === orgId) || null;
      setSelectedOrganization(org);
    } catch {
      setSelectedOrganization(null);
    }
  };

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      if (userType === "SUPER_ADMIN" && !getSelectedOrganizationId()) {
        return;
      }

      // Get authentication token
      const token = await getToken();

      const branchIdForApi = selectedBranchId === "all" ? undefined : selectedBranchId;

      // Fetch stats and charts in parallel
      const basePromises: Array<Promise<any>> = [
        dashboardService.getDashboardStats(
          selectedPeriod,
          branchIdForApi,
          token || undefined
        ),
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

      // Only fetch branch charts when viewing ALL branches
      if (selectedBranchId === "all") {
        basePromises.push(
          dashboardService.getChartData(
            selectedPeriod,
            "branchRevenue",
            undefined,
            token || undefined
          ),
          dashboardService.getChartData(
            selectedPeriod,
            "branchOrders",
            undefined,
            token || undefined
          )
        );
      }

      const results = await Promise.all(basePromises);
      const statsData = results[0] as DashboardStats;
      const ordersData = results[1] as ChartData;
      const categoriesData = results[2] as ChartData;

      setStats(statsData);
      fetchSelectedOrganization();
      setOrdersChartData(ordersData);
      setCategoriesChartData(categoriesData);

      if (selectedBranchId === "all") {
        setBranchRevenueChartData((results[3] as ChartData) || null);
        setBranchOrdersChartData((results[4] as ChartData) || null);
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

  // Fetch data when component mounts or period changes
  useEffect(() => {
    fetchDashboardData();
  }, [selectedPeriod, selectedBranchId]);

  // Load branches on mount, and refresh when organization changes (super admin org switcher)
  useEffect(() => {
    loadBranches();

    const handler = () => {
      setSelectedBranchId(canSelectAllBranches ? "all" : "");
      loadBranches();
      fetchSelectedOrganization();
      fetchDashboardData();
    };
    window.addEventListener(ORG_CHANGED_EVENT, handler as any);
    return () => window.removeEventListener(ORG_CHANGED_EVENT, handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBranch = useMemo(() => {
    if (!selectedBranchId || selectedBranchId === "all") return null;
    return branches.find((b) => b.id === selectedBranchId) || null;
  }, [branches, selectedBranchId]);

  const validationStatus = useMemo(() => {
    if (!selectedOrganization || selectedOrganization.isActive === false) return null;
    return getValidationStatus(selectedOrganization);
  }, [selectedOrganization]);

  // WebSocket connection for real-time dashboard updates
  useEffect(() => {
    // Subscribe to new order events with automatic cleanup
    const unsubscribe = subscribe("new-order", () => {
      fetchDashboardData();
    });

    // Cleanup on unmount or when selectedPeriod changes
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, subscribe]); // Include selectedPeriod to refetch when period changes

  // Redirect if not admin
  if (userRole !== "ADMIN") {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "32px",
          backgroundColor: "#f9fafb",
        }}
      >
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "48px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>🚫</div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#111827",
              marginBottom: "8px",
            }}
          >
            {t("admin.dashboard.accessDenied")}
          </h2>
          <p style={{ color: "#6b7280", marginBottom: "24px" }}>
            {t("admin.dashboard.noPermission")}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "24px" }}>
        <div style={{ marginBottom: "24px" }}>
          <PageHeader
            title={t("admin.dashboard.title")}
            description={t("admin.dashboard.description", {
              defaultValue: "Overview of your business performance",
            })}
            actions={
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <RefreshCw
                  style={{
                    height: "16px",
                    width: "16px",
                    color: "#ec4899",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span style={{ fontSize: "14px", color: "#6b7280" }}>{t("common.loading")}</span>
              </div>
            }
          />
        </div>

        {/* Loading Spinner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <RefreshCw
              style={{
                height: "48px",
                width: "48px",
                color: "#ec4899",
                margin: "0 auto 16px",
                animation: "spin 1s linear infinite",
              }}
            />
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "8px",
              }}
            >
              {t("admin.dashboard.loadingTitle")}
            </h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>
              {t("admin.dashboard.loadingDescription")}
            </p>
          </div>
        </div>
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "100%" }}>
      {/* Header with Time Period Filter */}
      <div style={{ marginBottom: "24px" }}>
        <PageHeader
          title={t("admin.dashboard.title")}
          description={t("admin.dashboard.description", {
            defaultValue: "Overview of your business performance",
          })}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
              {t("admin.branches.branch")}
            </label>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setIsBranchDropdownOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#ec4899",
                  backgroundColor: "#ffffff",
                  border: "1px solid #fce7f3",
                  borderRadius: "8px",
                  cursor: "pointer",
                  minWidth: "220px",
                  justifyContent: "space-between",
                  height: "36px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#fdf2f8";
                  e.currentTarget.style.borderColor = "#fbcfe8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.borderColor = "#fce7f3";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <Calendar style={{ height: "16px", width: "16px" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedBranchId === "all"
                      ? t("admin.branches.allBranches")
                      : branches.find((b) => b.id === selectedBranchId)?.name || ""}
                  </span>
                </div>
                <ChevronDown style={{ height: "16px", width: "16px" }} />
              </button>

              {isBranchDropdownOpen && (
                <>
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 40,
                    }}
                    onClick={() => setIsBranchDropdownOpen(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      marginTop: "8px",
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      boxShadow: "0 10px 15px rgba(0, 0, 0, 0.1)",
                      minWidth: "240px",
                      zIndex: 50,
                      overflow: "hidden",
                      maxHeight: "280px",
                      overflowY: "auto",
                    }}
                  >
                    {(canSelectAllBranches
                      ? [{ id: "all", name: t("admin.branches.allBranches") }, ...branches]
                      : branches
                    ).map((b: any) => {
                      const value = (b as any).id as string;
                      const label = (b as any).name as string;
                      const isSelected = selectedBranchId === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setSelectedBranchId(value);
                            setIsBranchDropdownOpen(false);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            textAlign: "left",
                            cursor: "pointer",
                            border: "none",
                            backgroundColor: isSelected ? "#fdf2f8" : "transparent",
                            borderLeft: isSelected ? "3px solid #ec4899" : "3px solid transparent",
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = "#f9fafb";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: "500",
                              color: isSelected ? "#ec4899" : "#111827",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {label}
                          </span>
                          {isSelected ? (
                            <div
                              style={{
                                marginLeft: "auto",
                                height: "8px",
                                width: "8px",
                                borderRadius: "9999px",
                                backgroundColor: "#ec4899",
                              }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
              {t("admin.dashboard.filters.timePeriod")}
            </label>
            <TimePeriodFilter selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
          </div>
        </div>
      </div>

      {selectedBranch && selectedBranch.isActive === false ? (
        <div
          style={{
            backgroundColor: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: "12px",
            padding: "12px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div style={{ color: "#f97316", fontSize: "14px" }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#9a3412" }}>
              {t("admin.dashboard.inactiveBranchMessage", {
                branchName: selectedBranch.name,
              })}
            </p>
          </div>
        </div>
      ) : null}

      {selectedOrganization && selectedOrganization.isActive === false ? (
        <div
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            padding: "12px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <div style={{ color: "#ef4444", fontSize: "14px" }}>🚫</div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#991b1b" }}>
              {t("admin.dashboard.inactiveOrganizationMessage", {
                organizationName: selectedOrganization.name,
              })}
            </p>
          </div>
        </div>
      ) : null}

      {selectedOrganization && selectedOrganization.isActive !== false && validationStatus ? (
        (() => {
          const formatDate = (value: Date) => {
            const d = value.getDate();
            const m = value.toLocaleDateString("en-US", { month: "short" });
            const y = value.getFullYear();
            return `${d}-${m}-${y}`;
          };

          if (validationStatus.status === "valid") {
            return (
              <div
                style={{
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "12px",
                  padding: "12px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ color: "#10b981", fontSize: "14px" }}>✅</div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#166534" }}>
                    {t("admin.dashboard.validationValidMessage", {
                      organizationName: selectedOrganization.name,
                      validUntil: formatDate(validationStatus.expiresAt),
                    })}
                  </p>
                </div>
              </div>
            );
          }

          if (validationStatus.status === "grace_period") {
            const grace = selectedOrganization.validations?.[0]?.gracePeriodEndsAt
              ? new Date(selectedOrganization.validations[0].gracePeriodEndsAt)
              : null;
            return (
              <div
                style={{
                  backgroundColor: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "12px",
                  padding: "12px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ color: "#f59e0b", fontSize: "14px" }}>⏰</div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#92400e" }}>
                    {t("admin.dashboard.validationGracePeriodMessage", {
                      organizationName: selectedOrganization.name,
                      gracePeriodEnds: grace ? formatDate(grace) : "",
                    })}
                  </p>
                </div>
              </div>
            );
          }

          if (validationStatus.status === "expired") {
            const exp = selectedOrganization.validations?.[0]?.expiresAt
              ? new Date(selectedOrganization.validations[0].expiresAt)
              : null;
            return (
              <div
                style={{
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "12px",
                  padding: "12px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ color: "#ef4444", fontSize: "14px" }}>❌</div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#991b1b" }}>
                    {t("admin.dashboard.validationExpiredMessage", {
                      organizationName: selectedOrganization.name,
                      expiredOn: exp ? formatDate(exp) : "",
                    })}
                  </p>
                </div>
              </div>
            );
          }

          if (validationStatus.status === "temporarily_invalid") {
            return (
              <div
                style={{
                  backgroundColor: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: "12px",
                  padding: "12px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ color: "#f97316", fontSize: "14px" }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#9a3412" }}>
                    {t("admin.dashboard.validationTemporarilyInvalidMessage", {
                      organizationName: selectedOrganization.name,
                    })}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              style={{
                backgroundColor: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: "12px",
                padding: "12px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ color: "#f97316", fontSize: "14px" }}>⚠️</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#9a3412" }}>
                  {t("admin.dashboard.validationUnvalidatedMessage", {
                    organizationName: selectedOrganization.name,
                  })}
                </p>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* Quick Stats - Full Width Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatsCard
          title={t("admin.dashboard.totalUsers")}
          value={stats?.totalUsers || 0}
          icon={Users}
          iconColor="#3b82f6"
        />
        <StatsCard
          title={t("admin.dashboard.menuItems")}
          value={stats?.totalMenuItems || 0}
          icon={Package}
          iconColor="#10b981"
        />
        <StatsCard
          title={t("admin.dashboard.orders")}
          value={stats?.totalOrders || 0}
          change={stats?.ordersChange}
          changeLabel={t("admin.dashboard.fromPeriod", { period: getPeriodLabel(selectedPeriod) })}
          icon={Receipt}
          iconColor="#a855f7"
        />
        <StatsCard
          title={t("admin.dashboard.revenue")}
          value={formatPrice(stats?.totalRevenue || 0, "USD")}
          change={stats?.revenueChange}
          changeLabel={t("admin.dashboard.fromPeriod", { period: getPeriodLabel(selectedPeriod) })}
          icon={DollarSign}
          iconColor="#ec4899"
        />
        {/* Branch Clicks - Show for all branches and specific branches */}
        <StatsCard
          title={selectedBranchId === "all" 
            ? t("admin.dashboard.totalBranchClicks") 
            : t("admin.dashboard.branchClicks")
          }
          value={stats?.totalBranchClicks || 0}
          change={stats?.branchClicksChange}
          changeLabel={t("admin.dashboard.fromPeriod", { period: getPeriodLabel(selectedPeriod) })}
          icon={MousePointer}
          iconColor="#f97316"
        />
      </div>

      {/* Charts Section - Full Width */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
          gap: "24px",
        }}
      >
        {/* Orders & Revenue Chart */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20px",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <BarChart3 style={{ height: "20px", width: "20px", color: "#ec4899" }} />
              {t("admin.dashboard.ordersRevenueTrend")}
            </h3>
          </div>
          <div>
            {ordersChartData ? (
              <Chart type="line" data={ordersChartData} height={400} />
            ) : (
                <div
                style={{
                  height: "400px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                }}
              >
                {t("admin.dashboard.noDataAvailable")}
              </div>
            )}
          </div>
        </div>

        {/* Categories Chart */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20px",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Package style={{ height: "20px", width: "20px", color: "#ec4899" }} />
              {t("admin.dashboard.popularCategories")}
            </h3>
            <button
              onClick={() => navigate("/admin/insights")}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ec4899",
                backgroundColor: "#ffffff",
                border: "1px solid #fce7f3",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#fdf2f8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#ffffff";
              }}
            >
              {t("admin.dashboard.viewInsights")}
            </button>
          </div>
          <div>
            {categoriesChartData &&
            categoriesChartData.labels &&
            categoriesChartData.labels.length > 0 ? (
              <Chart type="doughnut" data={categoriesChartData} height={400} />
            ) : (
              <div
                style={{
                  height: "400px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                }}
              >
                <Package
                  style={{
                    height: "48px",
                    width: "48px",
                    marginBottom: "16px",
                    opacity: 0.5,
                  }}
                />
                <p>{t("admin.dashboard.noCategoryData")}</p>
                <p style={{ fontSize: "12px", marginTop: "4px" }}>
                  {t("admin.dashboard.tryDifferentPeriod")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Branch Revenue Chart (only for all branches) */}
        {selectedBranchId === "all" ? (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <DollarSign style={{ height: "20px", width: "20px", color: "#ec4899" }} />
                {t("admin.dashboard.branchRevenue")}
              </h3>
            </div>
            <div>
              {branchRevenueChartData &&
              branchRevenueChartData.labels &&
              branchRevenueChartData.labels.length > 0 &&
              branchRevenueChartData.labels[0] !== "No Data" ? (
                <Chart
                  type="doughnut"
                  data={branchRevenueChartData as any}
                  height={400}
                  onElementClick={(idx) => {
                    const branchIds = (branchRevenueChartData as any)?.branchIds as string[] | undefined;
                    const next = branchIds?.[idx];
                    if (next) setSelectedBranchId(next);
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "400px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                  }}
                >
                  <DollarSign
                    style={{
                      height: "48px",
                      width: "48px",
                      marginBottom: "16px",
                      opacity: 0.5,
                    }}
                  />
                  <p>{t("admin.dashboard.noBranchRevenueData")}</p>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    {t("admin.dashboard.tryDifferentPeriod")}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Branch Orders Chart (only for all branches) */}
        {selectedBranchId === "all" ? (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Receipt style={{ height: "20px", width: "20px", color: "#ec4899" }} />
                {t("admin.dashboard.branchOrders")}
              </h3>
            </div>
            <div>
              {branchOrdersChartData &&
              branchOrdersChartData.labels &&
              branchOrdersChartData.labels.length > 0 &&
              branchOrdersChartData.labels[0] !== "No Data" ? (
                <Chart
                  type="doughnut"
                  data={branchOrdersChartData as any}
                  height={400}
                  onElementClick={(idx) => {
                    const branchIds = (branchOrdersChartData as any)?.branchIds as string[] | undefined;
                    const next = branchIds?.[idx];
                    if (next) setSelectedBranchId(next);
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "400px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280",
                  }}
                >
                  <Receipt
                    style={{
                      height: "48px",
                      width: "48px",
                      marginBottom: "16px",
                      opacity: 0.5,
                    }}
                  />
                  <p>{t("admin.dashboard.noBranchOrdersData")}</p>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    {t("admin.dashboard.tryDifferentPeriod")}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Dashboard;
