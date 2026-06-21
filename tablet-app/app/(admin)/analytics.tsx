import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { Chart } from "@/components/admin/Chart";
import { FullscreenChart } from "@/components/admin/FullscreenChart";
import AnalyticsTimePeriodFilter, {
  type TimePeriod,
  type TimePeriodType,
} from "@/components/admin/AnalyticsTimePeriodFilter";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import ApiService from "@/src/services/apiService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

type RevenuePoint = {
  month: string;
  revenue: number;
  refunds: number;
  orders: number;
};

const presets: {
  key: string;
  label: string;
  getRange: () => { start: Date; end: Date };
}[] = [
  {
    key: "this_month",
    label: "This Month",
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59
      );
      return { start, end };
    },
  },
  {
    key: "last_7",
    label: "Last 7 Days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    },
  },
  {
    key: "last_30",
    label: "Last 30 Days",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    },
  },
  {
    key: "today",
    label: "Today",
    getRange: () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      return { start, end };
    },
  },
];

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { getToken, userType } = useAuthRole();
  const { assignedBranchIds } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const loadDataRef = useRef<() => void>(() => {});
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [paginationLoading, setPaginationLoading] = useState(false); // placeholder for consistency
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  const [showFilters, setShowFilters] = useState(false);
  const [showFullscreenChart, setShowFullscreenChart] = useState(false);
  const { selectedBranchId: ctxBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const selectedBranchId = ctxBranchId || "all";
  const setSelectedBranchId = (id: string) => setSelectedBranch(id === "all" ? "" : id);
  const [branches, setBranches] = useState<Array<{ id: string; name?: string | null }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [branchRevenueChartData, setBranchRevenueChartData] = useState<any>(null);

  const isBranchRestricted = userType !== "SUPER_ADMIN" && assignedBranchIds.length > 0;

  const [activeTab, setActiveTab] = useState<"revenue" | "refunds">("revenue");
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>(() => {
    const now = new Date();
    return {
      type: "monthly",
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      ),
      label: `${new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ).toLocaleDateString("en-US", { month: "long" })} ${now.getFullYear()}`,
      year: now.getFullYear(),
      month: now.getMonth(),
    };
  });

  const [summary, setSummary] = useState<any>({
    totalRevenue: 0,
    totalRefunds: 0,
    totalTaxes: 0,
    netRevenue: 0,
    totalOrders: 0,
    monthOverMonthChanges: undefined,
  });
  const [series, setSeries] = useState<RevenuePoint[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);
  // Refunds tab state
  const [refundSummary, setRefundSummary] = useState({
    totalRefundAmount: 0,
    totalRefundsCount: 0,
    averageRefundAmount: 0,
  });
  const [refundSeries, setRefundSeries] = useState<
    { month: string; amount: number; count: number }[]
  >([]);
  const [refundsByStatus, setRefundsByStatus] = useState<any[]>([]);
  const [refundsByType, setRefundsByType] = useState<any[]>([]);
  const [refundsByPaymentMethod, setRefundsByPaymentMethod] = useState<any[]>(
    []
  );
  const [recentRefunds, setRecentRefunds] = useState<any[]>([]);

  // Load branches on mount
  useEffect(() => {
    if (branchLoading) return; // Wait for AsyncStorage to restore persisted branch
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);
        const token = (await getToken()) || undefined;
        const apiService = ApiService.getInstance();
        const result = await apiService.get("/api/admin/branches", token);
        if (result.success && result.data) {
          const nextBranches = Array.isArray(result.data)
            ? (result.data as Array<{ id: string; name?: string | null }>)
            : [];

          const filtered = isBranchRestricted
            ? nextBranches.filter((b) => assignedBranchIds.includes(b.id))
            : nextBranches;
          setBranches(filtered);

          if (isBranchRestricted) {
            if (!(selectedBranchId && selectedBranchId !== "all" && filtered.some((b) => b.id === selectedBranchId))) {
              setSelectedBranchId(filtered[0]?.id || "");
            }
          } else {
            if (!selectedBranchId || (selectedBranchId !== "all" && !filtered.some((b) => b.id === selectedBranchId))) {
              setSelectedBranchId("all");
            }
          }
        }
      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [getToken, userType, assignedBranchIds, isBranchRestricted, selectedOrganizationId, branchLoading]);

  useEffect(() => {
    if (organizationLoading) return;
    setBranches([]);
    setBranchRevenueChartData(null);
    setSummary({
      totalRevenue: 0,
      totalRefunds: 0,
      totalTaxes: 0,
      netRevenue: 0,
      totalOrders: 0,
      monthOverMonthChanges: undefined,
    });
    setSeries([]);
    setPaymentBreakdown([]);
    setStatusBreakdown([]);
    setRefundSummary({
      totalRefundAmount: 0,
      totalRefundsCount: 0,
      averageRefundAmount: 0,
    });
    setRefundSeries([]);
    setRefundsByStatus([]);
    setRefundsByType([]);
    setRefundsByPaymentMethod([]);
    setRecentRefunds([]);
  }, [selectedOrganizationId, organizationLoading]);

  useEffect(() => {
    if (!loading) setFiltersLoading(true);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, activeTab, selectedBranchId, selectedOrganizationId]);

  useEffect(() => {
    loadDataRef.current = () => {
      void loadData();
    };
  });

  // WebSocket connection for real-time analytics updates
  useEffect(() => {
    const socketService = SocketService.getInstance();
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        await socketService.connect(token || undefined);

        // Listen for new order events to refetch analytics data
        const handleNewOrder = (data: { notification: any; order: any }) => {
          if (!isMounted) return;

          // Play new order sound and long vibration
          notificationService.notifyNewOrder().catch((error) => {
            console.error("Failed to play new order sound:", error);
          });

          // Show toast notification
          if (data.order?.orderNumber) {
            setToast({
              visible: true,
              message: t("admin.analytics.newOrderReceived", {
                orderNumber: data.order.orderNumber,
              }),
              type: "success",
            });
          }

          loadDataRef.current();
        };

        // Listen for order updated events (merges, status changes) to refetch analytics data
        const handleOrderUpdated = () => {
          if (!isMounted) return;
          loadDataRef.current();
        };

        socketService.on("new-order", handleNewOrder);
        socketService.on("order-updated", handleOrderUpdated);

        cleanupFn = () => {
          socketService.off("new-order", handleNewOrder);
          socketService.off("order-updated", handleOrderUpdated);
        };
      } catch (error) {
        console.error("💰 Analytics: Error setting up WebSocket:", error);
      }
    };

    setupWebSocket();

    return () => {
      isMounted = false;
      if (cleanupFn) {
        cleanupFn();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, t]);

  const loadData = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const apiService = ApiService.getInstance();
      
      // Ensure startDate is before or equal to endDate
      let startDate = new Date(selectedPeriod.startDate);
      let endDate = new Date(selectedPeriod.endDate);
      
      // Normalize dates to start/end of day in local time, then convert to UTC
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      
      // If startDate is after endDate, swap them
      if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
        endDate.setHours(23, 59, 59, 999);
      }
      
      const safeSelectedBranchId = isBranchRestricted && selectedBranchId === "all" ? "" : selectedBranchId;
      const branchIdForApi = safeSelectedBranchId === "all" || !safeSelectedBranchId ? undefined : safeSelectedBranchId;
      const isAllBranches = !isBranchRestricted && selectedBranchId === "all";

      if (branchIdForApi && !branches.some((b) => b.id === branchIdForApi)) {
        return;
      }
      
      const params = new URLSearchParams();
      params.set("startDate", startDate.toISOString());
      params.set("endDate", endDate.toISOString());
      params.set("periodType", selectedPeriod.type);
      if (branchIdForApi) {
        params.set("branchId", branchIdForApi);
      }
      
      if (activeTab === "revenue") {
        const promises: Promise<any>[] = [
          apiService.get(
            `/api/admin/analytics/revenue-detailed?${params.toString()}`,
            token || undefined
          ),
        ];

        // Only fetch branch revenue chart when "all" is selected (super admin use-case)
        if (isAllBranches) {
          const branchChartParams = new URLSearchParams();
          branchChartParams.set("startDate", startDate.toISOString());
          branchChartParams.set("endDate", endDate.toISOString());
          promises.push(
            apiService.get(
              `/api/admin/analytics/revenue/branch-chart?${branchChartParams.toString()}`,
              token || undefined
            )
          );
        }

        const results = await Promise.all(promises);
        const json = results[0];
        
        if (!json || json.success === false || !json.data) {
          throw new Error(json?.message || "No data returned");
        }
        const d = json.data as any;
        setSummary({
          ...(d.summary || {}),
          totalRevenue: Number(d.summary?.totalRevenue) || 0,
          totalRefunds: Number(d.summary?.totalRefunds) || 0,
          totalTaxes: Number(d.summary?.totalTaxes) || 0,
          netRevenue: Number(d.summary?.netRevenue) || 0,
          totalOrders: Number(d.summary?.totalOrders) || 0,
        });
        setSeries(
          (d.chartData || []).map((p: any) => ({
            month: String(p.month),
            revenue: Number(p.revenue) || 0,
            refunds: Number(p.refunds) || 0,
            orders: Number(p.orders) || 0,
          }))
        );
        setPaymentBreakdown(d.paymentMethodBreakdown || []);
        setStatusBreakdown(d.orderStatusBreakdown || []);
        
        if (isAllBranches && results[1]) {
          const branchJson = results[1];
          if (branchJson && branchJson.success !== false && branchJson.data) {
            setBranchRevenueChartData(branchJson.data);
          } else {
            setBranchRevenueChartData(null);
          }
        } else {
          setBranchRevenueChartData(null);
        }
      } else {
        const json: any = await apiService.get(
          `/api/admin/analytics/refunds?${params.toString()}`,
          token || undefined
        );
        if (!json || json.success === false || !json.data) {
          throw new Error(json?.message || "No data returned");
        }
        const d = json.data as any;
        setRefundSummary({
          totalRefundAmount: Number(d.summary?.totalRefundAmount) || 0,
          totalRefundsCount: Number(d.summary?.totalRefundsCount) || 0,
          averageRefundAmount: Number(d.summary?.averageRefundAmount) || 0,
        });
        setRefundSeries(
          (d.chartData || []).map((p: any) => ({
            month: String(p.month),
            amount: Number(p.amount) || 0,
            count: Number(p.count) || 0,
          }))
        );
        setRefundsByStatus(d.refundsByStatus || []);
        setRefundsByType(d.refundsByType || []);
        setRefundsByPaymentMethod(d.refundsByPaymentMethod || []);
        setRecentRefunds(d.recentRefunds || []);
      }
    } catch (e) {
      console.error("Revenue analytics error:", e);
      setToast({
        visible: true,
        message: t("admin.analytics.failedToLoad"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
      setPaginationLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const maxValue = useMemo(() => {
    const vals = series.flatMap((p) => [p.revenue, p.refunds]);
    const m = Math.max(1, ...vals);
    // round up to a nice step
    const magnitude = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / magnitude) * magnitude;
  }, [series]);

  // Only show full-screen loader when loading and no data exists
  const hasData = summary.totalRevenue > 0 || summary.totalOrders > 0 || series.length > 0 || refundSeries.length > 0;
  if (loading && !hasData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>{t("admin.analytics.loading")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#f3f4f6"
          />
        }
      >
        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "revenue" && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab("revenue")}
          >
            <MaterialCommunityIcons
              name="currency-usd"
              size={16}
              color={activeTab === "revenue" ? "#fff" : "#ec4899"}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "revenue" && styles.tabButtonTextActive,
              ]}
            >
              {t("admin.analytics.revenueTab")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "refunds" && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab("refunds")}
          >
            <MaterialCommunityIcons
              name="receipt"
              size={16}
              color={activeTab === "refunds" ? "#fff" : "#ec4899"}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "refunds" && styles.tabButtonTextActive,
              ]}
            >
              {t("admin.analytics.refundTab")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filters toggle */}
        <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 0 }}>
          <TouchableOpacity
            onPress={() => setShowFilters((s) => !s)}
            style={styles.filterTextButtonContainer}
          >
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.analytics.hideFilters")
                : t("admin.analytics.showFilters")}
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            {/* Branch Filter */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>
                {t("admin.analytics.branchLabel")}
              </Text>
              <TouchableOpacity
                style={[
                  styles.branchFilterButton,
                  selectedBranchId !== "" && styles.branchFilterButtonActive,
                ]}
                onPress={() => setShowBranchFilterModal(true)}
                disabled={loadingBranches}
              >
                <MaterialCommunityIcons name="office-building" size={14} color="#6b7280" />
                <Text style={styles.branchFilterText}>
                  {selectedBranchId === "all" && !isBranchRestricted
                    ? t("admin.analytics.allBranches")
                    : selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name ||
                      t("admin.analytics.selectBranch")
                    : t("admin.analytics.selectBranch")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {/* Period Filter */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>
                {t("admin.analytics.periodLabel")}
              </Text>
              <AnalyticsTimePeriodFilter
                selectedPeriod={selectedPeriod}
                onPeriodChange={setSelectedPeriod}
              />
            </View>
          </View>
        )}

        {/* Content */}
        <View style={{ paddingHorizontal: 16 }}>
          {activeTab === "revenue" ? (
            <>
              {/* KPIs */}
              <View style={styles.kpisGrid}>
            {[
              {
                label: t("admin.analytics.revenue.totalRevenue"),
                value: summary.totalRevenue,
                color: "#22c55e",
                icon: "cash-multiple" as const,
              },
              {
                label: t("admin.analytics.revenue.totalRefunds"),
                value: summary.totalRefunds,
                color: "#ef4444",
                icon: "cash-refund" as const,
              },
              {
                label: t("admin.analytics.revenue.taxesOwed"),
                value: summary.totalTaxes || 0,
                color: "#f59e0b",
                icon: "receipt" as const,
              },
              {
                label: t("admin.analytics.revenue.netRevenue"),
                value: summary.netRevenue,
                color: "#ec4899",
                icon: "trending-up" as const,
              },
              {
                label: t("admin.analytics.revenue.totalOrders"),
                value: summary.totalOrders,
                color: "#3b82f6",
                icon: "clipboard-list" as const,
              },
            ].map((k) => (
              <View key={k.label} style={styles.kpiCard}>
                <View style={styles.kpiHeader}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <MaterialCommunityIcons name={k.icon} size={18} color={k.color} />
                </View>
                <Text style={[styles.kpiValue, { color: k.color }]}>
                  {k.label === t("admin.analytics.revenue.totalOrders")
                    ? summary.totalOrders
                    : `$${(k.value || 0).toFixed(2)}`}
                </Text>
              </View>
            ))}
          </View>

          {/* Revenue Trend */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>
                {(() => {
                  const periodType = selectedPeriod.type;
                  switch (periodType) {
                    case "yearly":
                      return t("admin.analytics.revenue.yearlyRevenueTrend");
                    case "monthly":
                      return t("admin.analytics.revenue.monthlyRevenueTrend");
                    case "weekly":
                      return t("admin.analytics.revenue.weeklyRevenueTrend");
                    case "daily":
                      return t("admin.analytics.revenue.dailyRevenueTrend");
                    case "custom":
                      return selectedPeriod.label || t("admin.analytics.revenue.monthlyRevenueTrend");
                    default:
                      return t("admin.analytics.revenue.monthlyRevenueTrend");
                  }
                })()}
              </Text>
            </View>
            {filtersLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : series.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#9CA3AF" }}>
                  {t("admin.analytics.noData")}
                </Text>
              </View>
            ) : (
              <Chart
                type={selectedPeriod.type === "custom" ? "line" : "bar"}
                height={320}
                showFullscreenButton={selectedPeriod.type === "custom"}
                onFullscreen={() => setShowFullscreenChart(true)}
                data={{
                  labels: (() => {
                    const periodType = selectedPeriod.type;
                    if (periodType === "custom") {
                      let previousMonth: number | null = null;
                      return series.map((p) => {
                        const date = new Date(p.month + "T00:00:00");
                        const currentMonth = date.getMonth();
                        const day = date.getDate();

                        // Show month only when it changes or on first item
                        if (
                          previousMonth === null ||
                          currentMonth !== previousMonth
                        ) {
                          previousMonth = currentMonth;
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        } else {
                          // Just show the day number
                          return day.toString();
                        }
                      });
                    } else {
                      return series.map((p) => {
                        if (periodType === "daily") {
                          const date = new Date(p.month + "T00:00:00");
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        } else if (periodType === "weekly") {
                          // For weekly, show the week label (e.g., "Week 5, 2024")
                          return selectedPeriod.label;
                        } else if (periodType === "yearly") {
                          // item.month is in "yyyy" format
                          return p.month;
                        } else {
                          // monthly - item.month is in "yyyy-MM" format
                          const d = new Date(`${p.month}-01`);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                          });
                        }
                      });
                    }
                  })(),
                  datasets:
                    selectedPeriod.type === "custom"
                      ? [
                          // Line chart order: Revenue, Refunds, Orders
                          {
                            label: t("admin.analytics.revenue.revenue"),
                            data: series.map((p) => p.revenue),
                            borderColor: "rgb(34, 197, 94)",
                            backgroundColor: "rgba(34, 197, 94, 0.1)",
                            tension: 0.4,
                          },
                          {
                            label: t("admin.analytics.revenue.refunds"),
                            data: series.map((p) => p.refunds),
                            borderColor: "rgb(239, 68, 68)",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            tension: 0.4,
                          },
                          {
                            label: t("admin.analytics.revenue.orders"),
                            data: series.map((p) => p.orders),
                            borderColor: "rgb(59, 130, 246)",
                            backgroundColor: "rgba(59, 130, 246, 0.1)",
                            tension: 0.4,
                          },
                        ]
                      : [
                          // Bar chart order: Revenue (left), Orders (middle), Refunds (right)
                          {
                            label: t("admin.analytics.revenue.revenue"),
                            data: series.map((p) => p.revenue),
                            backgroundColor: "rgba(34, 197, 94, 0.8)",
                            borderColor: "rgb(34, 197, 94)",
                          },
                          {
                            label: t("admin.analytics.revenue.orders"),
                            data: series.map((p) => p.orders),
                            backgroundColor: "rgba(59, 130, 246, 0.8)",
                            borderColor: "rgb(59, 130, 246)",
                          },
                          {
                            label: t("admin.analytics.revenue.refunds"),
                            data: series.map((p) => p.refunds),
                            backgroundColor: "rgba(239, 68, 68, 0.8)",
                            borderColor: "rgb(239, 68, 68)",
                          },
                        ],
                }}
              />
            )}
          </View>

          {/* Branch Revenue Chart - Only show when "All Branches" is selected */}
          {selectedBranchId === "all" && branchRevenueChartData && (
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>
                  {t("admin.analytics.revenue.branchRevenue") || "Revenue by Branch"}
                </Text>
              </View>
              {filtersLoading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : branchRevenueChartData.labels &&
                branchRevenueChartData.labels.length > 0 &&
                branchRevenueChartData.labels[0] !== "No Data" ? (
                <Chart
                  type="doughnut"
                  height={320}
                  data={branchRevenueChartData}
                />
              ) : (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: "#9CA3AF" }}>
                    {t("admin.analytics.noBranchRevenueData") || "No branch revenue data available"}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Payment Methods Donut Chart */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>
                {t("admin.analytics.revenue.paymentMethodBreakdown")}
              </Text>
            </View>
            {filtersLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : paymentBreakdown.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#9CA3AF" }}>
                  {t("admin.analytics.noData")}
                </Text>
              </View>
            ) : (
              <Chart
                type="doughnut"
                height={320}
                data={{
                  labels: paymentBreakdown
                    .filter((p: any) => p.method)
                    .map((p: any) => String(p.method).replace("_", " ")),
                  datasets: [
                    {
                      label: t("admin.analytics.revenue.revenue"),
                      data: paymentBreakdown
                        .filter((p: any) => p.method)
                        .map((p: any) => Number(p.revenue) || 0),
                      backgroundColor: [
                        "rgba(236, 72, 153, 0.9)", // pink
                        "rgba(59, 130, 246, 0.9)", // blue
                        "rgba(16, 185, 129, 0.9)", // emerald
                        "rgba(245, 158, 11, 0.9)", // amber
                        "rgba(168, 85, 247, 0.9)", // violet
                        "rgba(239, 68, 68, 0.9)", // red
                      ],
                    },
                  ],
                }}
              />
            )}
          </View>

          {/* Breakdowns */}
          <View style={{ marginTop: 16, gap: 12 }}>
            <View style={styles.breakdownCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>
                  {t("admin.analytics.revenue.paymentMethodBreakdown")}
                </Text>
              </View>
              <View style={{ padding: 12, gap: 10 }}>
                {paymentBreakdown.map((item, i) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLeft}>
                      {String(item.method || "Unknown").replace("_", " ")}
                    </Text>
                    <Text style={styles.breakdownRight}>
                      ${Number(item.revenue || 0).toFixed(2)} •{" "}
                      {Number(item.orders || 0)}{" "}
                      {t("admin.analytics.revenue.ordersText")}
                    </Text>
                  </View>
                ))}
                {paymentBreakdown.length === 0 && (
                  <Text style={{ color: "#9CA3AF", paddingVertical: 8 }}>
                    {t("admin.analytics.noData")}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.breakdownCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>
                  {t("admin.analytics.revenue.orderStatusBreakdown")}
                </Text>
              </View>
              <View style={{ padding: 12, gap: 10 }}>
                {statusBreakdown.map((item, i) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLeft}>
                      {String(item.status || "Unknown").replace("_", " ")}
                    </Text>
                    <Text style={styles.breakdownRight}>
                      ${Number(item.revenue || 0).toFixed(2)} •{" "}
                      {Number(item.orders || 0)}{" "}
                      {t("admin.analytics.revenue.ordersText")}
                    </Text>
                  </View>
                ))}
                {statusBreakdown.length === 0 && (
                  <Text style={{ color: "#9CA3AF", paddingVertical: 8 }}>
                    {t("admin.analytics.noData")}
                  </Text>
                )}
              </View>
            </View>
          </View>
            </>
          ) : (
            <>
              {/* KPIs */}
              <View style={styles.kpisGrid}>
            {[
              {
                label: t("admin.analytics.refund.totalRefundAmount"),
                value: refundSummary.totalRefundAmount,
                color: "#ef4444",
                icon: "cash-refund" as const,
              },
              {
                label: t("admin.analytics.refund.totalRefunds"),
                value: refundSummary.totalRefundsCount,
                color: "#f59e0b",
                icon: "counter" as const,
              },
              {
                label: t("admin.analytics.refund.averageRefund"),
                value: refundSummary.averageRefundAmount,
                color: "#60a5fa",
                icon: "calculator" as const,
              },
            ].map((k) => (
              <View key={k.label} style={styles.kpiCard}>
                <View style={styles.kpiHeader}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <MaterialCommunityIcons name={k.icon} size={18} color={k.color} />
                </View>
                <Text style={[styles.kpiValue, { color: k.color }]}>
                  {k.label === t("admin.analytics.refund.totalRefunds")
                    ? refundSummary.totalRefundsCount
                    : `$${(k.value || 0).toFixed(2)}`}
                </Text>
              </View>
            ))}
          </View>

          {/* Refunds Trend */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>
                {selectedPeriod.type === "yearly"
                  ? t("admin.analytics.refund.yearlyRefundsTrend") ||
                    "Yearly Refunds Trend"
                  : selectedPeriod.type === "monthly"
                  ? t("admin.analytics.refund.monthlyRefundsTrend")
                  : selectedPeriod.type === "weekly"
                  ? t("admin.analytics.refund.weeklyRefundsTrend") ||
                    "Weekly Refunds Trend"
                  : selectedPeriod.type === "daily"
                  ? t("admin.analytics.refund.dailyRefundsTrend") ||
                    "Daily Refunds Trend"
                  : t("admin.analytics.refund.monthlyRefundsTrend")}
              </Text>
            </View>
            {filtersLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : refundSeries.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#9CA3AF" }}>
                  {t("admin.analytics.noData")}
                </Text>
              </View>
            ) : (
              <Chart
                type={selectedPeriod.type === "custom" ? "line" : "bar"}
                height={320}
                data={{
                  labels: (() => {
                    const periodType = selectedPeriod.type;
                    if (periodType === "custom") {
                      let previousMonth: number | null = null;
                      return refundSeries.map((p) => {
                        const date = new Date(p.month + "T00:00:00");
                        const currentMonth = date.getMonth();
                        const day = date.getDate();

                        // Show month only when it changes or on first item
                        if (
                          previousMonth === null ||
                          currentMonth !== previousMonth
                        ) {
                          previousMonth = currentMonth;
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        } else {
                          // Just show the day number
                          return day.toString();
                        }
                      });
                    } else {
                      return refundSeries.map((p) => {
                        if (periodType === "daily") {
                          const date = new Date(p.month + "T00:00:00");
                          return date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        } else if (periodType === "weekly") {
                          // For weekly, show the week label (e.g., "Week 5, 2024")
                          return selectedPeriod.label;
                        } else if (periodType === "yearly") {
                          const d = new Date(`${p.month}-01`);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                          });
                        } else {
                          const d = new Date(`${p.month}-01`);
                          return d.toLocaleDateString("en-US", {
                            month: "short",
                          });
                        }
                      });
                    }
                  })(),
                  datasets: [
                    {
                      label: t("admin.analytics.refund.refundAmount"),
                      data: refundSeries.map((p) => p.amount),
                      borderColor: "#ef4444",
                      backgroundColor: "rgba(239, 68, 68, 0.2)",
                      tension: 0.4,
                    },
                  ],
                }}
              />
            )}
          </View>

          {/* Refund Status Donut */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>
                {t("admin.analytics.refund.refundStatusBreakdown")}
              </Text>
            </View>
            {filtersLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color="#ec4899" />
              </View>
            ) : refundsByStatus.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ color: "#9CA3AF" }}>
                  {t("admin.analytics.noData")}
                </Text>
              </View>
            ) : (
              (() => {
                const labels = refundsByStatus
                  .filter((r: any) => r.status)
                  .map((r: any) => String(r.status));
                const values = refundsByStatus
                  .filter((r: any) => r.status)
                  .map((r: any) => Number(r.amount) || 0);
                const colors = labels.map((raw) => {
                  const s = raw.toLowerCase();
                  if (
                    s.includes("succeeded") ||
                    s === "success" ||
                    s === "succeed"
                  ) {
                    return "rgba(34, 197, 94, 0.9)"; // green
                  }
                  if (s.includes("pending")) {
                    return "rgba(245, 158, 11, 0.9)"; // yellow
                  }
                  if (
                    s.includes("failed") ||
                    s.includes("canceled") ||
                    s.includes("cancelled")
                  ) {
                    return "rgba(239, 68, 68, 0.9)"; // red
                  }
                  return "rgba(107, 114, 128, 0.9)"; // gray
                });
                return (
                  <Chart
                    type="doughnut"
                    height={320}
                    data={{
                      labels: labels.map((l) => l.replace("_", " ")),
                      datasets: [
                        {
                          label: t("admin.analytics.refund.refundsText"),
                          data: values,
                          backgroundColor: colors,
                        },
                      ],
                    }}
                  />
                );
              })()
            )}
          </View>

          {/* Refund breakdown lists */}
          <View style={{ marginTop: 16, gap: 12 }}>
            <View style={styles.breakdownCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>
                  {t("admin.analytics.refund.refundTypeBreakdown")}
                </Text>
              </View>
              <View style={{ padding: 12, gap: 10 }}>
                {refundsByType.map((item: any, i: number) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLeft}>
                      {String(item.type || "Unknown").replace("_", " ")}
                    </Text>
                    <Text style={styles.breakdownRight}>
                      ${Number(item.amount || 0).toFixed(2)} •{" "}
                      {Number(item.count || 0)}{" "}
                      {t("admin.analytics.refund.refundsText")}
                    </Text>
                  </View>
                ))}
                {refundsByType.length === 0 && (
                  <Text style={{ color: "#9CA3AF", paddingVertical: 8 }}>
                    {t("admin.analytics.noData")}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.breakdownCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>
                  {t("admin.analytics.refund.refundsByPaymentMethod")}
                </Text>
              </View>
              <View style={{ padding: 12, gap: 10 }}>
                {refundsByPaymentMethod.map((item: any, i: number) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLeft}>
                      {String(item.method || "Unknown").replace("_", " ")}
                    </Text>
                    <Text style={styles.breakdownRight}>
                      ${Number(item.amount || 0).toFixed(2)} •{" "}
                      {Number(item.count || 0)}{" "}
                      {t("admin.analytics.refund.refundsText")}
                    </Text>
                  </View>
                ))}
                {refundsByPaymentMethod.length === 0 && (
                  <Text style={{ color: "#9CA3AF", paddingVertical: 8 }}>
                    {t("admin.analytics.noData")}
                  </Text>
                )}
              </View>
            </View>
          </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Fullscreen Chart Modal for Custom Range */}
      {selectedPeriod.type === "custom" &&
        ((activeTab === "revenue" && series.length > 0) ||
          (activeTab === "refunds" && refundSeries.length > 0)) && (
          <FullscreenChart
            visible={showFullscreenChart}
            onClose={() => setShowFullscreenChart(false)}
            data={{
              labels: (() => {
                let previousMonth: number | null = null;
                const dataSource =
                  activeTab === "revenue" ? series : refundSeries;
                return dataSource.map((p) => {
                  const date = new Date(p.month + "T00:00:00");
                  const currentMonth = date.getMonth();
                  const day = date.getDate();

                  // Show month only when it changes or on first item
                  if (
                    previousMonth === null ||
                    currentMonth !== previousMonth
                  ) {
                    previousMonth = currentMonth;
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  } else {
                    // Just show the day number
                    return day.toString();
                  }
                });
              })(),
              datasets:
                activeTab === "revenue"
                  ? [
                      {
                        label: t("admin.analytics.revenue.revenue"),
                        data: series.map((p) => p.revenue),
                        borderColor: "rgb(34, 197, 94)",
                        backgroundColor: "rgba(34, 197, 94, 0.1)",
                        tension: 0.4,
                      },
                      {
                        label: t("admin.analytics.revenue.refunds"),
                        data: series.map((p) => p.refunds),
                        borderColor: "rgb(239, 68, 68)",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        tension: 0.4,
                      },
                      {
                        label: t("admin.analytics.revenue.orders"),
                        data: series.map((p) => p.orders),
                        borderColor: "rgb(59, 130, 246)",
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        tension: 0.4,
                      },
                    ]
                  : [
                      {
                        label: t("admin.analytics.refund.refundAmount"),
                        data: refundSeries.map((p) => p.amount),
                        borderColor: "rgb(239, 68, 68)",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        tension: 0.4,
                      },
                    ],
            }}
            title={(() => {
              // Use type assertion to prevent TypeScript narrowing since we're inside a "custom" conditional
              const periodType = selectedPeriod.type as TimePeriodType;
              if (activeTab === "revenue") {
                switch (periodType) {
                  case "yearly":
                    return t("admin.analytics.revenue.yearlyRevenueTrend");
                  case "monthly":
                    return t("admin.analytics.revenue.monthlyRevenueTrend");
                  case "weekly":
                    return t("admin.analytics.revenue.weeklyRevenueTrend");
                  case "daily":
                    return t("admin.analytics.revenue.dailyRevenueTrend");
                  case "custom":
                    return selectedPeriod.label || t("admin.analytics.revenue.monthlyRevenueTrend");
                  default:
                    return t("admin.analytics.revenue.monthlyRevenueTrend");
                }
              } else {
                switch (periodType) {
                  case "yearly":
                    return t("admin.analytics.refund.yearlyRefundsTrend");
                  case "monthly":
                    return t("admin.analytics.refund.monthlyRefundsTrend");
                  case "weekly":
                    return t("admin.analytics.refund.weeklyRefundsTrend");
                  case "daily":
                    return t("admin.analytics.refund.dailyRefundsTrend");
                  case "custom":
                    return selectedPeriod.label || t("admin.analytics.refund.monthlyRefundsTrend");
                  default:
                    return t("admin.analytics.refund.monthlyRefundsTrend");
                }
              }
            })()}
          />
        )}

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Refresh Loading Spinner */}
      <RefreshSpinner visible={refreshing} topOffset={headerHeight + 16} />

      {/* Branch Filter Bottom Sheet */}
      <Modal
        visible={showBranchFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBranchFilterModal(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBranchFilterModal(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.analytics.selectBranch")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowBranchFilterModal(false)}
              >
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {loadingBranches ? (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : (
                <>
                  {!isBranchRestricted && (
                    <TouchableOpacity
                      style={[
                        styles.bottomSheetOption,
                        selectedBranchId === "all" && styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedBranchId("all");
                        setShowBranchFilterModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.bottomSheetOptionText,
                          selectedBranchId === "all" &&
                            styles.bottomSheetOptionTextActive,
                        ]}
                      >
                        {t("admin.analytics.allBranches")}
                      </Text>
                      {selectedBranchId === "all" && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={18}
                          color="#ec4899"
                        />
                      )}
                    </TouchableOpacity>
                  )}
                  {branches.map((branch) => (
                    <TouchableOpacity
                      key={branch.id}
                      style={[
                        styles.bottomSheetOption,
                        selectedBranchId === branch.id &&
                          styles.bottomSheetOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedBranchId(branch.id);
                        setShowBranchFilterModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.bottomSheetOptionText,
                          selectedBranchId === branch.id &&
                            styles.bottomSheetOptionTextActive,
                        ]}
                      >
                        {branch.name || branch.id}
                      </Text>
                      {selectedBranchId === branch.id && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={18}
                          color="#ec4899"
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#6b7280" },

  filterTextButtonContainer: { alignSelf: "flex-end" },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
    paddingBottom: 16,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  filterGroup: {
    flexDirection: "column",
    gap: 8,
    width: "100%",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4b5563",
    marginBottom: 4,
  },
  branchFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    width: "100%",
  },
  branchFilterButtonActive: {
    borderColor: "#ec4899",
    backgroundColor: "#f9fafb",
  },
  branchFilterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  presetChipActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
  },
  presetChipText: { color: "#111827", fontSize: 12, fontWeight: "500" },
  presetChipTextActive: { color: "#ec4899" },

  filterDropdownsRow: { flexDirection: "row", gap: 12 },
  filterDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterDropdownActive: { borderColor: "#ec4899", backgroundColor: "#f9fafb" },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  kpisGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flexBasis: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  kpiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  kpiLabel: { fontSize: 12, color: "#6b7280", flex: 1, marginRight: 8 },
  kpiValue: { fontSize: 18, fontWeight: "800" },

  chartCard: {
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chartHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  chartTitle: { color: "#111827", fontWeight: "700", fontSize: 16 },
  chartArea: { paddingHorizontal: 12, paddingVertical: 12 },
  chartBars: {
    height: 160,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  lineChartArea: {
    height: 160,
    width: "100%",
    position: "relative",
  },
  lineDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
    marginLeft: -3,
    marginTop: -3,
  },
  lineSegment: {
    position: "absolute",
    height: 2,
    backgroundColor: "#22c55e",
    marginLeft: -1,
  },
  barWrapper: { flex: 1, alignItems: "center" },
  bar: { width: 12, borderRadius: 6, backgroundColor: "#ec4899" },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  legendText: { color: "#6b7280", fontSize: 12 },
  xAxisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  xAxisLabelText: {
    color: "#6b7280",
    fontSize: 10,
    width: 20,
    textAlign: "center",
  },
  breakdownCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  breakdownLeft: { color: "#111827", fontSize: 14, fontWeight: "600" },
  breakdownRight: { color: "#6b7280", fontSize: 12 },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ec4899",
    backgroundColor: "transparent",
  },
  tabButtonActive: {
    backgroundColor: "#ec4899",
    borderColor: "#ec4899",
  },
  tabButtonText: { color: "#ec4899", fontWeight: "700", fontSize: 14 },
  tabButtonTextActive: { color: "#fff" },

  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  bottomSheetBody: { padding: 20, maxHeight: 500 },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bottomSheetOptionActive: {
    backgroundColor: "rgba(236, 72, 153, 0.1)",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: { fontSize: 14, color: "#111827", fontWeight: "500" },
  bottomSheetOptionTextActive: { color: "#ec4899", fontWeight: "600" },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  monthCell: {
    width: "23%",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    alignItems: "center",
  },
  monthCellActive: {
    borderColor: "#ec4899",
    backgroundColor: "rgba(236, 72, 153, 0.1)",
  },
  monthCellText: { color: "#111827", fontWeight: "600" },
  monthCellTextActive: { color: "#ec4899" },
});
