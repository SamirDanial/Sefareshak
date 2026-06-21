import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { Chart } from "@/components/admin/Chart";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiAccountGroup,
  mdiChartPie,
  mdiChartBar,
  mdiClock,
  mdiCalendar,
  mdiTrendingUp,
  mdiCalendarClock,
  mdiCurrencyUsd,
  mdiAccount,
} from "@mdi/js";
import { reservationService } from "@/src/services/reservationService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import ApiService from "@/src/services/apiService";

interface ReservationAnalyticsData {
  summary: {
    totalReservations: number;
    totalGuests: number;
    avgGuestsPerReservation: number;
    totalRevenue: number;
    totalTaxAmount?: number;
    totalRemainingAmount?: number;
    cancellationRate: number;
    noShowRate: number;
    completionRate: number;
  };
  statusCounts: {
    pending: number;
    confirmed: number;
    seated: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  statusBreakdown: Array<{ status: string; count: number; percentage: number }>;
  typeBreakdown: Array<{ type: string; count: number; percentage: number }>;
  reservationsOverTime: Array<{
    label: string;
    count: number;
    guests: number;
    revenue: number;
  }>;
  peakHours: Array<{ hour: number; count: number; label: string }>;
  dayOfWeekBreakdown: Array<{ day: number; count: number; label: string }>;
  guestSizeDistribution: Array<{ size: number; count: number; label: string }>;
}

const timePeriods = [
  { value: "today", labelKey: "admin.categoryInsights.periods.today" },
  { value: "this_week", labelKey: "admin.categoryInsights.periods.thisWeek" },
  { value: "this_month", labelKey: "admin.categoryInsights.periods.thisMonth" },
  { value: "last_7_days", labelKey: "admin.categoryInsights.periods.last7Days" },
  {
    value: "last_30_days",
    labelKey: "admin.categoryInsights.periods.last30Days",
  },
  {
    value: "last_3_months",
    labelKey: "admin.categoryInsights.periods.last3Months",
  },
  {
    value: "last_6_months",
    labelKey: "admin.categoryInsights.periods.last6Months",
  },
  { value: "last_year", labelKey: "admin.categoryInsights.periods.lastYear" },
];

const statusColors: Record<string, string> = {
  pending: "#fbbf24",
  confirmed: "#22c55e",
  seated: "#60a5fa",
  completed: "#34d399",
  cancelled: "#f87171",
  noShow: "#a855f7",
};

const statusIcons: Record<string, string> = {
  pending: mdiAlertCircle,
  confirmed: mdiCheckCircle,
  seated: mdiAccountGroup,
  completed: mdiCheckCircle,
  cancelled: mdiCloseCircle,
  noShow: mdiCloseCircle,
};

function MdiIcon({
  path,
  size,
  color,
}: {
  path: string;
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={path} fill={color} />
    </Svg>
  );
}

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

const formatCurrency = (value?: number) =>
  `$${(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function ReservationAnalyticsScreen() {
  const { t } = useTranslation();
  const { getToken, userType } = useAuthRole();
  const { assignedBranchIds, refreshPermissions } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const headerHeight = insets.top + getAdminHeaderHeight();

  const [selectedPeriod, setSelectedPeriod] = useState("last_30_days");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<Array<{ id: string; name?: string | null }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [branchReservationsChartData, setBranchReservationsChartData] = useState<any>(null);
  const [data, setData] = useState<ReservationAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const isBranchRestricted = userType !== "SUPER_ADMIN" && assignedBranchIds.length > 0;

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection("down");
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection("up");
    }
    lastScrollY.current = currentScrollY;
  };

  // Load branches on mount
  useEffect(() => {
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

          setSelectedBranchId((prev) => {
            if (isBranchRestricted) {
              if (prev && prev !== "all" && filtered.some((b) => b.id === prev)) return prev;
              return filtered[0]?.id || "";
            }

            if (prev && (prev === "all" || filtered.some((b) => b.id === prev))) return prev;
            return prev || "all";
          });
        }
      } catch (error) {
        console.error("Error loading branches:", error);
      } finally {
        setLoadingBranches(false);
      }
    };
    loadBranches();
  }, [getToken, userType, assignedBranchIds, isBranchRestricted, selectedOrganizationId]);

  useEffect(() => {
    if (organizationLoading) return;
    refreshPermissions();
    setBranches([]);
    setSelectedBranchId("all");
    setData(null);
    setBranchReservationsChartData(null);
  }, [selectedOrganizationId, organizationLoading, refreshPermissions]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedBranchId, selectedOrganizationId]);

  const loadData = async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      if (!refreshing && !loading) {
        setFiltersLoading(true);
      }
      const token = await getToken();
      const apiService = ApiService.getInstance();
      const safeSelectedBranchId = isBranchRestricted && selectedBranchId === "all" ? "" : selectedBranchId;
      const branchIdForApi = safeSelectedBranchId === "all" || !safeSelectedBranchId ? undefined : safeSelectedBranchId;
      const isAllBranches = !isBranchRestricted && selectedBranchId === "all";

      if (branchIdForApi && !branches.some((b) => b.id === branchIdForApi)) {
        return;
      }
      
      const promises: Promise<any>[] = [
        reservationService.getReservationAnalytics(
          selectedPeriod,
          branchIdForApi,
          token || undefined
        ),
      ];

      // Only fetch branch reservations chart when "all" is selected (super admin use-case)
      if (isAllBranches) {
        const branchChartParams = new URLSearchParams();
        branchChartParams.set("period", selectedPeriod);
        promises.push(
          apiService.get(
            `/api/reservations/analytics/branch-chart?${branchChartParams.toString()}`,
            token || undefined
          )
        );
      }

      const results = await Promise.all(promises);
      setData(results[0]);
      
      if (isAllBranches && results[1]) {
        const branchJson = results[1];
        if (branchJson && branchJson.success !== false && branchJson.data) {
          setBranchReservationsChartData(branchJson.data);
        } else {
          setBranchReservationsChartData(null);
        }
      } else {
        setBranchReservationsChartData(null);
      }
    } catch (error) {
      console.error("Reservation analytics error:", error);
      setToast({
        visible: true,
        message: t("admin.reservationAnalytics.loadError"),
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
      setFiltersLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: t("admin.reservationAnalytics.summary.totalReservations"),
        value: data.summary.totalReservations.toLocaleString(),
        icon: mdiCalendarClock,
        color: "#ec4899",
      },
      {
        label: t("admin.reservationAnalytics.summary.totalGuests"),
        value: data.summary.totalGuests.toLocaleString(),
        icon: mdiAccountGroup,
        color: "#22c55e",
      },
      {
        label: t("admin.reservationAnalytics.summary.revenue"),
        value: formatCurrency(data.summary.totalRevenue),
        icon: mdiCurrencyUsd,
        color: "#60a5fa",
      },
      {
        label: t("admin.reservationAnalytics.summary.remaining"),
        value: formatCurrency(data.summary.totalRemainingAmount || 0),
        icon: mdiCurrencyUsd,
        color: "#0ea5e9",
      },
      {
        label: t("admin.reservationAnalytics.summary.totalTax"),
        value: formatCurrency(data.summary.totalTaxAmount || 0),
        icon: mdiCurrencyUsd,
        color: "#f59e0b",
      },
      {
        label: t("admin.reservationAnalytics.summary.avgGuests"),
        value: data.summary.avgGuestsPerReservation.toFixed(1),
        icon: mdiAccount,
        color: "#a855f7",
      },
    ];
  }, [data, t]);

  const reservationsOverTimeData = useMemo(() => {
    if (!data?.reservationsOverTime?.length) return null;
    return {
      labels: data.reservationsOverTime.map((item) => item.label),
      datasets: [
        {
          label: t("admin.reservationAnalytics.charts.reservations"),
          data: data.reservationsOverTime.map((item) => item.count),
          borderColor: "rgb(236,72,153)",
          backgroundColor: "rgba(236,72,153,0.1)",
          tension: 0.4,
        },
        {
          label: t("admin.reservationAnalytics.charts.guests"),
          data: data.reservationsOverTime.map((item) => item.guests),
          borderColor: "rgb(34,197,94)",
          backgroundColor: "rgba(34,197,94,0.1)",
          tension: 0.4,
        },
      ],
    };
  }, [data, t]);

  const statusBreakdownData = useMemo(() => {
    if (!data?.statusBreakdown?.length) return null;
    const labels = data.statusBreakdown.map((item) => item.status);
    return {
      labels,
      datasets: [
        {
          label: t("admin.reservationAnalytics.charts.reservations"),
          data: data.statusBreakdown.map((item) => item.count),
          backgroundColor: labels.map(
            (status) => statusColors[status.toLowerCase()] || "rgba(236,72,153,0.8)"
          ),
        },
      ],
    };
  }, [data, t]);

  const typeBreakdownData = useMemo(() => {
    if (!data?.typeBreakdown?.length) return null;
    const labels = data.typeBreakdown.map((item) => item.type);
    return {
      labels,
      datasets: [
        {
          label: t("admin.reservationAnalytics.charts.reservations"),
          data: data.typeBreakdown.map((item) => item.count),
          backgroundColor: ["rgba(236,72,153,0.8)", "rgba(34,197,94,0.8)"],
        },
      ],
    };
  }, [data, t]);

  const peakHoursData = useMemo(() => {
    if (!data?.peakHours?.length) return null;
    return {
      labels: data.peakHours.map((item) => item.label),
      datasets: [
        {
          label: t("admin.reservationAnalytics.charts.reservations"),
          data: data.peakHours.map((item) => item.count),
          backgroundColor: "rgba(236,72,153,0.8)",
          borderColor: "rgb(236,72,153)",
          borderWidth: 2,
        },
      ],
    };
  }, [data, t]);

  const dayOfWeekData = useMemo(() => {
    if (!data?.dayOfWeekBreakdown?.length) return null;
    return {
      labels: data.dayOfWeekBreakdown.map((item) => item.label),
      datasets: [
        {
          label: t("admin.reservationAnalytics.charts.reservations"),
          data: data.dayOfWeekBreakdown.map((item) => item.count),
          backgroundColor: "rgba(59,130,246,0.8)",
          borderColor: "rgb(59,130,246)",
          borderWidth: 2,
        },
      ],
    };
  }, [data, t]);

  const guestSizeData = useMemo(() => {
    if (!data?.guestSizeDistribution?.length) return null;
    const palette = [
      "rgba(236,72,153,0.8)",
      "rgba(34,197,94,0.8)",
      "rgba(59,130,246,0.8)",
      "rgba(245,158,11,0.8)",
      "rgba(168,85,247,0.8)",
      "rgba(16,185,129,0.8)",
    ];
    return {
      labels: data.guestSizeDistribution.map((item) => item.label),
      datasets: [
        {
          label: t("admin.reservationAnalytics.charts.reservations"),
          data: data.guestSizeDistribution.map((item) => item.count),
          backgroundColor: data.guestSizeDistribution.map(
            (_, index) => palette[index % palette.length]
          ),
        },
      ],
    };
  }, [data, t]);

  const renderEmptyChart = (icon: string, message: string) => (
    <View style={styles.emptyChart}>
      <MaterialCommunityIcons name={icon as any} size={28} color="#6B7280" />
      <Text style={styles.emptyChartText}>{message}</Text>
    </View>
  );

  // Only show full-screen loader when loading and no data exists
  const hasData = data && (data.summary.totalReservations > 0 || data.summary.totalRevenue > 0);
  if (loading && !hasData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>
          {t("admin.reservationAnalytics.loading")}
        </Text>
        <Text style={styles.loadingSubText}>
          {t("admin.reservationAnalytics.loadingDescription")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight - 8,
          paddingBottom: 40,
          paddingHorizontal: 16,
          gap: 16,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        {/* Filters toggle */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 0 }}>
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
                <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
                <Text style={styles.branchFilterText}>
                  {selectedBranchId === "all" && !isBranchRestricted
                    ? t("admin.analytics.allBranches")
                    : selectedBranchId
                    ? branches.find((b) => b.id === selectedBranchId)?.name ||
                      t("admin.analytics.selectBranch")
                    : t("admin.analytics.selectBranch")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            {/* Period Filter */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>
                {t("admin.analytics.periodLabel")}
              </Text>
              <TouchableOpacity
                style={[styles.filterDropdown, styles.filterDropdownActive]}
                onPress={() => setShowPeriodPicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {timePeriods.find((p) => p.value === selectedPeriod)
                    ? t(timePeriods.find((p) => p.value === selectedPeriod)!.labelKey)
                    : t("admin.categoryInsights.periods.last30Days")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Summary */}
        <View style={styles.summaryGrid}>
          {summaryCards.map((card) => (
            <View key={card.label} style={styles.summaryCard}>
              <View
                style={[
                  styles.summaryIconWrapper,
                  { backgroundColor: hexToRgba(card.color, 0.12) },
                ]}
              >
                <MdiIcon path={card.icon as any} size={18} color={card.color} />
              </View>
              <View style={styles.summaryTextContainer}>
                <Text style={styles.summaryLabel}>{card.label}</Text>
                <Text style={styles.summaryValue}>{card.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Status cards */}
        {data && (
          <View style={styles.statusGrid}>
            {[
              { key: "pending", label: t("admin.reservationAnalytics.statuses.pending") },
              {
                key: "confirmed",
                label: t("admin.reservationAnalytics.statuses.confirmed"),
              },
              { key: "seated", label: t("admin.reservationAnalytics.statuses.seated") },
              {
                key: "completed",
                label: t("admin.reservationAnalytics.statuses.completed"),
              },
              {
                key: "cancelled",
                label: t("admin.reservationAnalytics.statuses.cancelled"),
              },
              { key: "noShow", label: t("admin.reservationAnalytics.statuses.noShow") },
            ].map((status) => (
              <View key={status.key} style={styles.statusCard}>
                <View style={styles.statusHeader}>
                  <View
                    style={[
                      styles.statusIconWrapper,
                      {
                        backgroundColor: hexToRgba(
                          statusColors[status.key] || "#6B7280",
                          0.12
                        ),
                      },
                    ]}
                  >
                    <MdiIcon
                      path={(statusIcons[status.key] || mdiAlertCircle) as any}
                      size={16}
                      color={statusColors[status.key] || "#6B7280"}
                    />
                  </View>
                  <Text style={styles.statusLabel}>{status.label}</Text>
                </View>
                <Text style={styles.statusValue}>
                  {(data.statusCounts as any)[status.key] ??
                    (data.statusCounts as any)[status.key.toLowerCase()] ??
                    0}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Branch Reservations Chart - Only show when "All Branches" is selected */}
        {selectedBranchId === "all" && branchReservationsChartData && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MdiIcon path={mdiChartPie} size={18} color="#ec4899" />
              <Text style={styles.chartTitle}>
                {t("admin.reservationAnalytics.charts.branchReservations") || "Reservations by Branch"}
              </Text>
            </View>
            <View style={styles.chartContent}>
              {filtersLoading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#ec4899" />
                </View>
              ) : branchReservationsChartData.labels &&
                branchReservationsChartData.labels.length > 0 &&
                branchReservationsChartData.labels[0] !== "No Data" ? (
                <Chart
                  type="doughnut"
                  height={280}
                  data={branchReservationsChartData}
                />
              ) : (
                <View style={styles.emptyChart}>
                  <Text style={styles.emptyChartText}>
                    {t("admin.reservationAnalytics.charts.noBranchReservationsData") || "No branch reservations data available"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Reservations over time */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <MdiIcon path={mdiChartBar} size={18} color="#ec4899" />
            <Text style={styles.chartTitle}>
              {t("admin.reservationAnalytics.charts.reservationsOverTime")}
            </Text>
          </View>
          <View style={styles.chartContent}>
            {reservationsOverTimeData ? (
              <Chart type="line" height={260} data={reservationsOverTimeData} />
            ) : (
              renderEmptyChart(
                "chart-bar",
                t("admin.reservationAnalytics.charts.noReservationData")
              )
            )}
          </View>
        </View>

        {/* Pie charts */}
        <View style={styles.dualColumn}>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MdiIcon path={mdiChartPie} size={18} color="#ec4899" />
              <Text style={styles.chartTitle}>
                {t("admin.reservationAnalytics.charts.statusBreakdown")}
              </Text>
            </View>
            <View style={styles.chartContent}>
              {statusBreakdownData ? (
                <Chart type="doughnut" height={260} data={statusBreakdownData} />
              ) : (
                renderEmptyChart(
                  "chart-bar",
                  t("admin.reservationAnalytics.charts.noStatusData")
                )
              )}
            </View>
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MdiIcon path={mdiChartPie} size={18} color="#ec4899" />
              <Text style={styles.chartTitle}>
                {t("admin.reservationAnalytics.charts.reservationType")}
              </Text>
            </View>
            <View style={styles.chartContent}>
              {typeBreakdownData ? (
                <Chart type="doughnut" height={260} data={typeBreakdownData} />
              ) : (
                renderEmptyChart(
                  "chart-bar",
                  t("admin.reservationAnalytics.charts.noTypeData")
                )
              )}
            </View>
          </View>
        </View>

        {/* Peak hours & day of week */}
        <View style={styles.dualColumn}>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MdiIcon path={mdiClock} size={18} color="#ec4899" />
              <Text style={styles.chartTitle}>
                {t("admin.reservationAnalytics.charts.peakHours")}
              </Text>
            </View>
            <View style={styles.chartContent}>
              {peakHoursData ? (
                <Chart type="bar" height={260} data={peakHoursData} />
              ) : (
                renderEmptyChart(
                  "clock-outline",
                  t("admin.reservationAnalytics.charts.noPeakHoursData")
                )
              )}
            </View>
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MdiIcon path={mdiCalendar} size={18} color="#ec4899" />
              <Text style={styles.chartTitle}>
                {t("admin.reservationAnalytics.charts.dayOfWeek")}
              </Text>
            </View>
            <View style={styles.chartContent}>
              {dayOfWeekData ? (
                <Chart type="bar" height={260} data={dayOfWeekData} />
              ) : (
                renderEmptyChart(
                  "calendar",
                  t("admin.reservationAnalytics.charts.noDayOfWeekData")
                )
              )}
            </View>
          </View>
        </View>

        {/* Guest size distribution */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <MdiIcon path={mdiAccountGroup} size={18} color="#ec4899" />
            <Text style={styles.chartTitle}>
              {t("admin.reservationAnalytics.charts.guestSizeDistribution")}
            </Text>
          </View>
          <View style={styles.chartContent}>
              {guestSizeData ? (
                <Chart type="doughnut" height={280} data={guestSizeData} />
              ) : (
                renderEmptyChart(
                  "account-group",
                  t("admin.reservationAnalytics.charts.noGuestSizeData")
                )
              )}
          </View>
        </View>

        {/* Performance metrics */}
        {data && (
          <View style={styles.metricsRow}>
            {[
              {
                label: t("admin.reservationAnalytics.metrics.completionRate"),
                value: data.summary.completionRate,
                color: "#22c55e",
                icon: mdiTrendingUp,
                description: t(
                  "admin.reservationAnalytics.metrics.completionRateDescription"
                ),
              },
              {
                label: t("admin.reservationAnalytics.metrics.cancellationRate"),
                value: data.summary.cancellationRate,
                color: "#ef4444",
                icon: mdiCloseCircle,
                description: t(
                  "admin.reservationAnalytics.metrics.cancellationRateDescription"
                ),
              },
              {
                label: t("admin.reservationAnalytics.metrics.noShowRate"),
                value: data.summary.noShowRate,
                color: "#f97316",
                icon: mdiAlertCircle,
                description: t(
                  "admin.reservationAnalytics.metrics.noShowRateDescription"
                ),
              },
            ].map((metric) => (
              <View key={metric.label} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <MdiIcon path={metric.icon} size={16} color="#ec4899" />
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
                <Text style={[styles.metricValue, { color: metric.color }]}>
                  {metric.value.toFixed(1)}%
                </Text>
                <Text style={styles.metricDescription}>{metric.description}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
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
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
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

      {/* Period Picker Bottom Sheet */}
      <Modal
        visible={showPeriodPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPeriodPicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowPeriodPicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.categoryInsights.selectPeriod")}
              </Text>
              <TouchableOpacity onPress={() => setShowPeriodPicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {timePeriods.map((period) => (
                <TouchableOpacity
                  key={period.value}
                  style={[
                    styles.bottomSheetOption,
                    selectedPeriod === period.value &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedPeriod(period.value);
                    setShowPeriodPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedPeriod === period.value &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {t(period.labelKey)}
                  </Text>
                  {selectedPeriod === period.value && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="#ec4899"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#0a0a0a",
  },
  loadingText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  loadingSubText: { color: "#9CA3AF", fontSize: 13 },
  filterTextButtonContainer: { alignSelf: "flex-end" },
  filterTextButton: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ec4899",
    textDecorationLine: "underline",
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  filterGroup: {
    flexDirection: "column",
    gap: 8,
    width: "100%",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
    marginBottom: 4,
  },
  branchFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
    width: "100%",
  },
  branchFilterButtonActive: {
    borderColor: "#ec4899",
    backgroundColor: "#171717",
  },
  branchFilterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  filterDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#262626",
    width: "100%",
  },
  filterDropdownActive: {
    borderColor: "#ec4899",
  },
  filterDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryCard: {
    flexBasis: "48%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTextContainer: { flex: 1, gap: 2 },
  summaryLabel: { color: "#9CA3AF", fontSize: 12, fontWeight: "500" },
  summaryValue: { color: "#fff", fontSize: 18, fontWeight: "700" },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusCard: {
    flexBasis: "31%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#151515",
    padding: 12,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  statusIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  statusLabel: { color: "#9CA3AF", fontSize: 11, marginBottom: 4 },
  statusValue: { color: "#fff", fontSize: 16, fontWeight: "700" },
  chartCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  chartTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  chartContent: { padding: 12, minHeight: 220 },
  dualColumn: {
    flexDirection: "column",
    gap: 16,
  },
  emptyChart: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyChartText: { color: "#6B7280", fontSize: 12 },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metricCard: {
    flexBasis: "48%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    padding: 16,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricLabel: { color: "#9CA3AF", fontSize: 12, fontWeight: "600" },
  metricValue: { fontSize: 24, fontWeight: "800", marginTop: 6 },
  metricDescription: { color: "#9CA3AF", fontSize: 12, marginTop: 6 },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    zIndex: 1000,
    elevation: 1000,
  },
  bottomSheetContent: {
    backgroundColor: "#171717",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#262626",
    borderBottomWidth: 0,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  bottomSheetTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  bottomSheetBody: { padding: 20, maxHeight: 500 },
  bottomSheetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#0f0f0f",
    borderWidth: 1,
    borderColor: "#262626",
  },
  bottomSheetOptionActive: {
    backgroundColor: "#1a1a1a",
    borderColor: "#ec4899",
  },
  bottomSheetOptionText: { fontSize: 14, color: "#D1D5DB", fontWeight: "500" },
  bottomSheetOptionTextActive: { color: "#fff", fontWeight: "600" },
});


