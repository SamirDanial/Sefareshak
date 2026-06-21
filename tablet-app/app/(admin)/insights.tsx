import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { useBranch } from "@/src/contexts/BranchContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Chart } from "@/components/admin/Chart";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import SocketService from "@/src/services/socketService";
import { notificationService } from "@/src/services/notificationService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import ApiService from "@/src/services/apiService";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

export default function CategoryInsightsScreen() {
  const { t } = useTranslation();
  const { getToken, userType } = useAuthRole();
  const { assignedBranchIds } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const loadInsightsRef = useRef<() => void>(() => {});
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();

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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("last_30_days");
  const { selectedBranchId: ctxBranchId, setSelectedBranch, isLoading: branchLoading } = useBranch();
  const selectedBranchId = ctxBranchId || "all";
  const setSelectedBranchId = (id: string) => setSelectedBranch(id === "all" ? "" : id);
  const [branches, setBranches] = useState<Array<{ id: string; name?: string | null }>>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [branchRevenueChartData, setBranchRevenueChartData] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const isBranchRestricted = userType !== "SUPER_ADMIN" && assignedBranchIds.length > 0;

  const [salesData, setSalesData] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalQuantity: 0,
    avgOrderValue: 0,
  });
  const [salesOverTime, setSalesOverTime] = useState<
    { label: string; revenue: number; orders: number }[]
  >([]);
  const [menuItems, setMenuItems] = useState<
    {
      name: string;
      sales: number;
      orders: number;
      quantity: number;
      avgPrice: number;
    }[]
  >([]);
  const [popularAddOns, setPopularAddOns] = useState<
    { name: string; count: number }[]
  >([]);

  const selectedPeriodLabel = useMemo(
    () =>
      timePeriods.find((p) => p.value === selectedPeriod)?.label ||
      t("admin.categoryInsights.periods.last30Days"),
    [selectedPeriod, t]
  );

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
            ? (result.data as Array<{ id: string; name?: string | null }> )
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
    setCategories([]);
    setSelectedCategory("");
    setBranchRevenueChartData(null);
    setSalesData({
      totalRevenue: 0,
      totalOrders: 0,
      totalQuantity: 0,
      avgOrderValue: 0,
    });
    setSalesOverTime([]);
    setMenuItems([]);
    setPopularAddOns([]);

    const init = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        const apiService = ApiService.getInstance();
        const json: any = await apiService.get(
          "/api/category-insights/categories",
          token || undefined
        );
        const list: string[] = json?.data || [];
        setCategories(list);
        if (list.length) setSelectedCategory(list[0]);
      } catch (e) {
        console.error("Fetch categories error:", e);
        setToast({
          visible: true,
          message: t("admin.categoryInsights.failedToLoadCategories"),
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [selectedOrganizationId, organizationLoading, getToken, t]);

  useEffect(() => {
    if (!selectedCategory) return;
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedPeriod, selectedBranchId, selectedOrganizationId]);

  useEffect(() => {
    loadInsightsRef.current = () => {
      void loadInsights();
    };
  });

  // WebSocket connection for real-time insights updates
  useEffect(() => {
    if (!selectedCategory) return;

    const socketService = SocketService.getInstance();
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        await socketService.connect(token || undefined);

        // Listen for new order events to refetch insights data
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
              message: t("admin.categoryInsights.newOrderReceived", {
                orderNumber: data.order.orderNumber,
              }),
              type: "success",
            });
          }

          loadInsightsRef.current();
        };

        // Listen for order updated events (merges, status changes) to refetch insights data
        const handleOrderUpdated = () => {
          if (!isMounted) return;
          loadInsightsRef.current();
        };

        socketService.on("new-order", handleNewOrder);
        socketService.on("order-updated", handleOrderUpdated);

        cleanupFn = () => {
          socketService.off("new-order", handleNewOrder);
          socketService.off("order-updated", handleOrderUpdated);
        };
      } catch (error) {
        console.error("📈 Insights: Error setting up WebSocket:", error);
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
  }, [selectedCategory, getToken, t]);

  const loadInsights = async () => {
    try {
      if (!refreshing) {
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
      
      const params = new URLSearchParams();
      params.set("category", selectedCategory);
      params.set("period", selectedPeriod);
      if (branchIdForApi) {
        params.set("branchId", branchIdForApi);
      }
      
      const promises: Promise<any>[] = [
        apiService.get(
          `/api/category-insights/insights?${params.toString()}`,
          token || undefined
        ),
      ];

      // Only fetch branch revenue chart when "all" is selected (super admin use-case)
      if (isAllBranches && selectedCategory) {
        const branchChartParams = new URLSearchParams();
        branchChartParams.set("category", selectedCategory);
        branchChartParams.set("period", selectedPeriod);
        promises.push(
          apiService.get(
            `/api/category-insights/branch-revenue-chart?${branchChartParams.toString()}`,
            token || undefined
          )
        );
      }

      const results = await Promise.all(promises);
      const json = results[0];
      const d = json?.data || {};
      setSalesData(
        d.salesData || {
          totalRevenue: 0,
          totalOrders: 0,
          totalQuantity: 0,
          avgOrderValue: 0,
        }
      );
      setSalesOverTime(d.salesOverTime || []);
      setMenuItems(d.menuItems || []);
      setPopularAddOns(d.popularAddOns || []);
      
      if (isAllBranches && selectedCategory && results[1]) {
        const branchJson = results[1];
        if (branchJson && branchJson.success !== false && branchJson.data) {
          setBranchRevenueChartData(branchJson.data);
        } else {
          setBranchRevenueChartData(null);
        }
      } else {
        setBranchRevenueChartData(null);
      }
    } catch (e) {
      console.error("Fetch insights error:", e);
      setToast({
        visible: true,
        message: t("admin.categoryInsights.failedToLoad"),
        type: "error",
      });
    } finally {
      setFiltersLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadInsights();
  };

  // Only show full-screen loader when loading and no data exists
  const hasData = salesData.totalRevenue > 0 || salesData.totalOrders > 0 || salesOverTime.length > 0;
  if (loading && !hasData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={styles.loadingText}>
          {t("admin.categoryInsights.loading")}
        </Text>
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
        {/* Filters toggle */}
        <View style={{ paddingHorizontal: 24, paddingTop: 0, paddingBottom: showFilters ? 4 : 16 }}>
          <TouchableOpacity
            onPress={() => setShowFilters((s) => !s)}
            style={styles.filterTextButtonContainer}
          >
            <Text style={styles.filterTextButton}>
              {showFilters
                ? t("admin.categoryInsights.hideFilters")
                : t("admin.categoryInsights.showFilters")}
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
            {/* Category and Period Filters */}
            <View style={styles.filterDropdownsRow}>
              <TouchableOpacity
                style={[styles.filterDropdown, styles.filterDropdownActive]}
                onPress={() => setShowCategoryPicker(true)}
              >
                <MaterialCommunityIcons
                  name="view-grid"
                  size={14}
                  color="#9CA3AF"
                />
                <Text style={styles.filterDropdownText}>
                  {selectedCategory || t("admin.categoryInsights.selectCategory")}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterDropdown, styles.filterDropdownActive]}
                onPress={() => setShowPeriodPicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={14} color="#9CA3AF" />
                <Text style={styles.filterDropdownText}>
                  {selectedPeriodLabel}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Content */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        {/* KPIs */}
        <View style={styles.kpisGrid}>
          {[
            {
              label: t("admin.categoryInsights.totalRevenue"),
              value: salesData.totalRevenue,
              color: "#22c55e",
              icon: "cash-multiple" as const,
            },
            {
              label: t("admin.categoryInsights.totalOrders"),
              value: salesData.totalOrders,
              color: "#60a5fa",
              icon: "clipboard-list" as const,
            },
            {
              label: t("admin.categoryInsights.itemsSold"),
              value: salesData.totalQuantity,
              color: "#f59e0b",
              icon: "food" as const,
            },
            {
              label: t("admin.categoryInsights.avgOrderValue"),
              value: salesData.avgOrderValue,
              color: "#ec4899",
              icon: "chart-line" as const,
            },
          ].map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <MaterialCommunityIcons name={k.icon} size={18} color={k.color} />
              </View>
              <Text style={[styles.kpiValue, { color: k.color }]}>
                {k.label === t("admin.categoryInsights.totalOrders") ||
                k.label === t("admin.categoryInsights.itemsSold")
                  ? k.value || 0
                  : `$${(k.value || 0).toFixed(2)}`}
              </Text>
            </View>
          ))}
        </View>

        {/* Branch Revenue Chart - Only show when "All Branches" is selected */}
        {selectedBranchId === "all" && branchRevenueChartData && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>
                {t("admin.categoryInsights.branchRevenue") || "Revenue by Branch"}
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
                  {t("admin.categoryInsights.noBranchRevenueData") || "No branch revenue data available"}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Sales Over Time */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>
              {t("admin.categoryInsights.salesOverTime")}
            </Text>
          </View>
          {filtersLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#ec4899" />
            </View>
          ) : salesOverTime.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: "#9CA3AF" }}>
                {t("admin.categoryInsights.noData")}
              </Text>
            </View>
          ) : (
            <Chart
              type="line"
              height={250}
              data={{
                labels: salesOverTime.map((i) => i.label),
                datasets: [
                  {
                    label: t("admin.categoryInsights.revenue"),
                    data: salesOverTime.map((i) => i.revenue),
                    borderColor: "#ec4899",
                    backgroundColor: "rgba(236, 72, 153, 0.2)",
                    tension: 0.4,
                  },
                  {
                    label: t("admin.categoryInsights.orders"),
                    data: salesOverTime.map((i) => i.orders),
                    borderColor: "#22c55e",
                    backgroundColor: "rgba(34, 197, 94, 0.2)",
                    tension: 0.4,
                  },
                ],
              }}
            />
          )}
        </View>

        {/* Menu Items Performance (bar) */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>
              {t("admin.categoryInsights.menuItemsPerformance")}
            </Text>
          </View>
          {filtersLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#ec4899" />
            </View>
          ) : menuItems.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: "#9CA3AF" }}>
                {t("admin.categoryInsights.noData")}
              </Text>
            </View>
          ) : (
            <Chart
              type="bar"
              height={260}
              data={{
                labels: menuItems.map((m) => m.name),
                datasets: [
                  {
                    label: t("admin.categoryInsights.salesLabel"),
                    data: menuItems.map((m) => m.sales),
                    backgroundColor: [
                      "rgba(236, 72, 153, 0.8)",
                      "rgba(34, 197, 94, 0.8)",
                      "rgba(59, 130, 246, 0.8)",
                      "rgba(245, 158, 11, 0.8)",
                      "rgba(139, 69, 19, 0.8)",
                    ],
                  },
                ],
              }}
            />
          )}
        </View>

        {/* Popular Add-ons Donut */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>
              {t("admin.categoryInsights.popularAddons")}
            </Text>
          </View>
          {filtersLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#ec4899" />
            </View>
          ) : popularAddOns.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: "#9CA3AF" }}>
                {t("admin.categoryInsights.noData")}
              </Text>
            </View>
          ) : (
            <Chart
              type="doughnut"
              height={320}
              data={{
                labels: popularAddOns.map((a) => a.name),
                datasets: [
                  {
                    label: t("admin.categoryInsights.count"),
                    data: popularAddOns.map((a) => a.count),
                    backgroundColor: [
                      "rgba(236, 72, 153, 0.9)",
                      "rgba(34, 197, 94, 0.9)",
                      "rgba(59, 130, 246, 0.9)",
                      "rgba(245, 158, 11, 0.9)",
                      "rgba(168, 85, 247, 0.9)",
                      "rgba(239, 68, 68, 0.9)",
                      "rgba(16, 185, 129, 0.9)",
                    ],
                  },
                ],
              }}
            />
          )}
        </View>
        </View>
      </ScrollView>

      {/* Category Picker */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable
          style={styles.bottomSheetOverlay}
          onPress={() => setShowCategoryPicker(false)}
        >
          <Pressable
            style={styles.bottomSheetContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {t("admin.categoryInsights.selectCategory")}
              </Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.bottomSheetOption,
                    selectedCategory === cat && styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedCategory === cat &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                  {selectedCategory === cat && (
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

      {/* Period Picker */}
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
                <MaterialCommunityIcons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetBody}>
              {timePeriods.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.bottomSheetOption,
                    selectedPeriod === p.value &&
                      styles.bottomSheetOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedPeriod(p.value);
                    setShowPeriodPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.bottomSheetOptionText,
                      selectedPeriod === p.value &&
                        styles.bottomSheetOptionTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                  {selectedPeriod === p.value && (
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
  filterDropdownActive: { borderColor: "#ec4899" },
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
});
