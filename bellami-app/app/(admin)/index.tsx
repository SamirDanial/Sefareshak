import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAuthRole } from "@/src/contexts/AuthContext";
import { usePermissions } from "@/src/contexts/PermissionContext";
import { useOrganization } from "@/src/contexts/OrganizationContext";
import { ACTIONS, RESOURCES } from "@/src/utils/permissions";
import { dashboardService } from "@/src/services/dashboardService";
import branchService, { type Organization, type Branch } from "@/src/services/branchService";
import type {
  DashboardStats,
  ChartData,
} from "@/src/services/dashboardService";
import { useScroll } from "@/src/contexts/ScrollContext";
import { getAdminHeaderHeight } from "./_layout";
import {
  TimePeriodFilter,
  type TimePeriod,
} from "@/components/admin/TimePeriodFilter";
import { StatsCard } from "@/components/admin/StatsCard";
import { Chart } from "@/components/admin/Chart";
import { FullscreenChart } from "@/components/admin/FullscreenChart";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import SocketService from "@/src/services/socketService";
import { Toast } from "@/components/Toast";
import { RefreshSpinner } from "@/components/RefreshSpinner";
import { notificationService } from "@/src/services/notificationService";
import Constants from "expo-constants";
import ApiService from "@/src/services/apiService";
import { Modal, Pressable, Platform } from "react-native";
import { getValidationStatus, getValidationIcon, getValidationColor, getValidationTranslationKey } from "@/src/utils/validationStatus";

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userType, getToken } = useAuthRole();
  const { assignedBranchIds, canAny, isOrgAdmin, rbacUser, isLoading: permissionsLoading } = usePermissions();
  const { selectedOrganizationId, isLoading: organizationLoading } = useOrganization();
  const insets = useSafeAreaInsets();
  const { setScrollDirection, setScrollPosition } = useScroll();
  const lastScrollY = useRef(0);
  const statusBarHeight = insets.top;
  const headerHeight = statusBarHeight + getAdminHeaderHeight();
  const [selectedPeriod, setSelectedPeriod] =
    useState<TimePeriod>("last_30_days");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchFilterModal, setShowBranchFilterModal] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
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
  const [refreshing, setRefreshing] = useState(false);
  const [showFullscreenChart, setShowFullscreenChart] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });

  const effectiveUserType = ((rbacUser as any)?.userType as string | null | undefined) || userType;
  const isEntitledAdmin = Boolean(isOrgAdmin || (effectiveUserType && effectiveUserType !== "USER"));

  const isBranchAdmin = effectiveUserType === "BRANCH_ADMIN";
  const isEmployee = effectiveUserType === "EMPLOYEE";
  const isWaiter = effectiveUserType === "WAITER";
  const isBranchScoped = isBranchAdmin || isEmployee || isWaiter;

  const canViewBranches =
    !permissionsLoading &&
    canAny([{ resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW }]);

  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollPosition(currentScrollY);
    
    // Determine scroll direction
    if (currentScrollY > lastScrollY.current && currentScrollY > 10) {
      setScrollDirection('down');
    } else if (currentScrollY < lastScrollY.current) {
      setScrollDirection('up');
    }
    
    lastScrollY.current = currentScrollY;
  };

  const formatPrice = (amount: number): string => {
    // Get locale based on currency for proper formatting
    const getLocaleForCurrency = (curr: string): string => {
      const currencyLocaleMap: { [key: string]: string } = {
        USD: "en-US",
        EUR: "de-DE",
        GBP: "en-GB",
        INR: "en-IN",
        AED: "ar-AE",
      };
      return currencyLocaleMap[curr] || "en-US";
    };

    return new Intl.NumberFormat(getLocaleForCurrency(currency), {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  // Fetch settings to get currency
  const fetchSettings = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const apiService = ApiService.getInstance();
      const result = await apiService.getSettings(token);
      const settings = (result as any)?.data?.data ?? (result as any)?.data ?? (result as any);
      if (settings?.currency) {
        setCurrency(settings.currency);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      // Keep default USD if fetch fails
    }
  };

  const fetchOrganizationData = async () => {
    if (!selectedOrganizationId || userType !== "SUPER_ADMIN") {
      setSelectedOrganization(null);
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const organizations = await branchService.getOrganizationsWithValidation(token, {
        limit: 1000, // Get all organizations to find the selected one
      });

      const org = organizations.data.find(org => org.id === selectedOrganizationId);
      setSelectedOrganization(org || null);
    } catch (error) {
      console.error("Error fetching organization data:", error);
      setSelectedOrganization(null);
    }
  };

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
      const token = await getToken();

      // Pass "all" as undefined to backend, or pass the branchId if a specific branch is selected
      const safeSelectedBranchId = isBranchScoped && selectedBranchId === "all" ? "" : selectedBranchId;
      const branchIdForApi = safeSelectedBranchId === "all" || !safeSelectedBranchId ? undefined : safeSelectedBranchId;
      const isAllBranches = !isBranchScoped && selectedBranchId === "all";

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

      // Only fetch branch charts when "all" is selected (super admin use-case)
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

      // Also fetch organization data for validation status
      fetchOrganizationData();

      // Format labels to show month only when it changes
      const formatLabels = (labels: string[]): string[] => {
        return labels.map((label, index) => {
          if (index === 0) return label;

          // Parse current and previous labels
          const currentParts = label.split(" ");
          const prevLabel = labels[index - 1];
          const prevParts = prevLabel.split(" ");

          // Check if month changed
          const currentMonth = currentParts[0];
          const prevMonth = prevParts[0];

          if (currentMonth === prevMonth) {
            // Same month, return only day
            return currentParts[1] || label;
          } else {
            // Month changed, return full label
            return label;
          }
        });
      };

      // Translate dataset labels for orders chart
      const ordersData = results[1];
      if (ordersData) {
        const translatedOrdersData = {
          ...ordersData,
          labels: ordersData.labels
            ? formatLabels(ordersData.labels)
            : ordersData.labels,
          datasets: ordersData.datasets.map((dataset: any) => {
            const labelLower = dataset.label?.toLowerCase() || "";
            let translatedLabel = dataset.label;

            if (labelLower === "orders" || labelLower.includes("order")) {
              translatedLabel = t("admin.dashboard.chartLabels.orders");
            } else if (
              labelLower === "revenue" ||
              labelLower.includes("revenue")
            ) {
              translatedLabel = t("admin.dashboard.chartLabels.revenue");
            }

            return {
              ...dataset,
              label: translatedLabel,
            };
          }),
        };
        setOrdersChartData(translatedOrdersData);
      } else {
        setOrdersChartData(ordersData);
      }

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
      setRefreshing(false);
    }
  };

  // Load branches on mount
  useEffect(() => {
    if (!isEntitledAdmin) return;
    const loadBranches = async () => {
      try {
        setLoadingBranches(true);

        if (userType === "SUPER_ADMIN" && !selectedOrganizationId) {
          setBranches([]);
          setSelectedBranchId("all");
          return;
        }

        // If the user cannot view admin branches, don't hit /api/admin/branches (it will 403).
        // Instead, use the user branches endpoint to resolve names, then restrict to assignedBranchIds.
        if (!canViewBranches) {
          const token = (await getToken()) || undefined;
          const apiService = ApiService.getInstance();

          let userBranches: Array<{ id: string; name?: string | null }> = [];
          try {
            const userResult = await apiService.get("/api/user/branches", token);
            userBranches = Array.isArray(userResult?.data)
              ? (userResult.data as Array<{ id: string; name?: string | null }>)
              : [];
          } catch (e) {
            // ignore; will fall back to id-only branches
          }

          const fallbackBranches = (assignedBranchIds || []).map((id) => {
            const match = userBranches.find((b) => b.id === id);
            return match ? { id: match.id, name: match.name } : { id };
          });

          setBranches(fallbackBranches);
          setSelectedBranchId((prev) => {
            if (isBranchScoped) {
              if (prev && prev !== "all" && fallbackBranches.some((b) => b.id === prev)) return prev;
              return fallbackBranches[0]?.id || "";
            }
            return prev || "all";
          });
          return;
        }

        const token = (await getToken()) || undefined;
        const apiService = ApiService.getInstance();
        const result = await apiService.get("/api/admin/branches", token);
        if (result.success && result.data) {
          const nextBranches = Array.isArray(result.data)
            ? (result.data as Array<{ id: string; name?: string | null }>)
            : [];

          const filtered =
            isBranchScoped && assignedBranchIds.length
              ? nextBranches.filter((b) => assignedBranchIds.includes(b.id))
              : nextBranches;
          setBranches(filtered);

          setSelectedBranchId((prev) => {
            // Branch-scoped users cannot use "all" and must stay within assigned branches
            if (isBranchScoped) {
              if (prev && prev !== "all" && filtered.some((b) => b.id === prev)) return prev;
              return filtered[0]?.id || "";
            }

            // SUPER_ADMIN default to "all" when nothing is selected
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
  }, [isEntitledAdmin, getToken, assignedBranchIds, canViewBranches, isBranchScoped, selectedOrganizationId]);

  useEffect(() => {
    if (organizationLoading) return;
    if (!isEntitledAdmin) {
      router.replace("/(tabs)");
      return;
    }
    fetchSettings();
    fetchDashboardData();
  }, [selectedPeriod, selectedBranchId, isEntitledAdmin, t, selectedOrganizationId, organizationLoading]);

  useEffect(() => {
    if (organizationLoading) return;
    if (!isEntitledAdmin) return;

    setBranches([]);
    setSelectedBranchId(isBranchScoped ? "" : "all");
    setStats(null);
    setOrdersChartData(null);
    setCategoriesChartData(null);
    setBranchRevenueChartData(null);
    setBranchOrdersChartData(null);

    // Branches will reload because the branches effect depends on selectedOrganizationId.
    // fetchDashboardData will run again after selectedBranchId is set by loadBranches.
  }, [selectedOrganizationId, organizationLoading, isEntitledAdmin, isBranchScoped]);

  // WebSocket connection for real-time dashboard updates
  useEffect(() => {
    if (!isEntitledAdmin) return;

    const socketService = SocketService.getInstance();
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const setupWebSocket = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        await socketService.connect(token || undefined);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Listen for new order events to refetch dashboard data
        const handleNewOrder = (data: { notification: any; order: any }) => {
          if (!isMounted) return;

          // Play new order sound and long vibration
          notificationService.notifyNewOrder().catch((error) => {
            console.error("Failed to play new order sound:", error);
          });

          // Show toast notification
          if (data.order?.orderNumber) {
            const toastMessage = t(
              "admin.notifications.newOrderReceivedToast",
              {
                orderNumber: data.order.orderNumber,
              }
            );
            setToast({
              visible: true,
              message: toastMessage,
              type: "success",
            });
          }

          fetchDashboardData();
        };

        // Listen for order updated events (merges, status changes) to refetch dashboard data
        const handleOrderUpdated = () => {
          if (!isMounted) return;
          fetchDashboardData();
        };

        socketService.on("new-order", handleNewOrder);
        socketService.on("order-updated", handleOrderUpdated);

        cleanupFn = () => {
          socketService.off("new-order", handleNewOrder);
          socketService.off("order-updated", handleOrderUpdated);
        };
      } catch (error) {
        console.error("📊 Dashboard: Error setting up WebSocket:", error);
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
  }, [isEntitledAdmin, selectedPeriod, selectedBranchId, getToken, t]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (!isEntitledAdmin) {
    return null;
  }

  if (loading && !stats) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec4899" />
          <Text style={styles.loadingText}>{t("admin.dashboard.loading")}</Text>
        </View>
      </View>
    );
  }

  const getChangeLabel = () => {
    if (selectedPeriod === "today")
      return t("admin.dashboard.periods.yesterday");
    if (selectedPeriod === "this_week")
      return t("admin.dashboard.periods.lastWeek");
    if (selectedPeriod === "this_month")
      return t("admin.dashboard.periods.lastMonth");
    return t("admin.dashboard.periods.previousPeriod");
  };

  return (
    <View style={styles.container}>
    <ScrollView
        style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + 12 }]}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#ec4899"
            colors={["#ec4899"]}
            progressBackgroundColor="#1f1f1f"
        />
      }
    >
      {/* Header actions (no on-page title) */}
      <View style={styles.header}>
        <View style={styles.filtersContainer}>
          {/* Branch Filter */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>
              {t("admin.dashboard.branchLabel")}
            </Text>
            <TouchableOpacity
              style={[
                styles.branchFilterButton,
                selectedBranchId !== "" && styles.branchFilterButtonActive,
              ]}
              onPress={() => setShowBranchFilterModal(true)}
              disabled={loadingBranches || (isBranchScoped && branches.length <= 1)}
            >
              <MaterialCommunityIcons name="office-building" size={14} color="#9CA3AF" />
              <Text style={styles.branchFilterText}>
                {selectedBranchId === "all" && !isBranchScoped
                  ? t("admin.dashboard.allBranches")
                  : selectedBranchId
                  ? branches.find((b) => b.id === selectedBranchId)?.name ||
                    selectedBranchId
                  : t("admin.dashboard.selectBranch")}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          {/* Period Filter */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>
              {t("admin.dashboard.periodLabel")}
            </Text>
            <TimePeriodFilter
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
          </View>
        </View>
      </View>

      {/* Inactive Branch Message */}
      {selectedBranchId && selectedBranchId !== "" && selectedBranchId !== "all" && (() => {
        const selectedBranch = branches.find(b => b.id === selectedBranchId);
        return selectedBranch && !selectedBranch.isActive ? (
          <View style={[styles.validationMessage, { backgroundColor: '#FFF7ED', borderColor: '#F97316' }]}>
            <Text style={{ fontSize: 14, color: '#F97316', marginRight: 8 }}>⚠️</Text>
            <Text style={[styles.validationMessageText, { color: '#9A3412' }]}>
              {t("admin.dashboard.validation.inactiveBranchMessage", {
                branchName: selectedBranch.name || 'Unknown',
              })}
            </Text>
          </View>
        ) : null;
      })()}

      {/* Inactive Organization Message */}
      {selectedOrganization && !selectedOrganization.isActive && (
        <View style={[styles.validationMessage, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}>
          <Text style={{ fontSize: 14, color: '#EF4444', marginRight: 8 }}>🚫</Text>
          <Text style={[styles.validationMessageText, { color: '#991B1B' }]}>
            {t("admin.dashboard.validation.inactiveOrganizationMessage", {
              organizationName: selectedOrganization.name || 'Unknown',
            })}
          </Text>
        </View>
      )}

      {/* Organization Validation Status Messages */}
      {selectedOrganization && selectedOrganization.isActive && (() => {
        const validationStatus = getValidationStatus(selectedOrganization);
        const formatDate = (dateString: string) => {
          const date = new Date(dateString);
          const day = date.getDate();
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          const year = date.getFullYear();
          return `${day}-${month}-${year}`;
        };

        if (validationStatus.status === 'valid') {
          return (
            <View style={[styles.validationMessage, { backgroundColor: '#F0FDF4', borderColor: '#10B981' }]}>
              <Text style={{ fontSize: 14, color: '#10B981', marginRight: 8 }}>✅</Text>
              <Text style={[styles.validationMessageText, { color: '#166534' }]}>
                {t("admin.dashboard.validation.validationValidMessage", {
                  organizationName: selectedOrganization.name || 'Unknown',
                  validUntil: validationStatus.expiresAt ? formatDate(validationStatus.expiresAt.toISOString()) : 'Unknown',
                })}
              </Text>
            </View>
          );
        }

        if (validationStatus.status === 'grace_period') {
          return (
            <View style={[styles.validationMessage, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]}>
              <Text style={{ fontSize: 14, color: '#F59E0B', marginRight: 8 }}>⏰</Text>
              <Text style={[styles.validationMessageText, { color: '#92400E' }]}>
                {t("admin.dashboard.validation.validationGracePeriodMessage", {
                  organizationName: selectedOrganization.name || 'Unknown',
                  gracePeriodEnds: selectedOrganization.validations?.[0]?.gracePeriodEndsAt ? formatDate(selectedOrganization.validations[0].gracePeriodEndsAt) : 'Unknown',
                })}
              </Text>
            </View>
          );
        }

        if (validationStatus.status === 'expired') {
          return (
            <View style={[styles.validationMessage, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}>
              <Text style={{ fontSize: 14, color: '#EF4444', marginRight: 8 }}>❌</Text>
              <Text style={[styles.validationMessageText, { color: '#991B1B' }]}>
                {t("admin.dashboard.validation.validationExpiredMessage", {
                  organizationName: selectedOrganization.name || 'Unknown',
                  expiredOn: selectedOrganization.validations?.[0]?.expiresAt ? formatDate(selectedOrganization.validations[0].expiresAt) : 'Unknown',
                })}
              </Text>
            </View>
          );
        }

        if (validationStatus.status === 'temporarily_invalid') {
          return (
            <View style={[styles.validationMessage, { backgroundColor: '#FFF7ED', borderColor: '#F97316' }]}>
              <Text style={{ fontSize: 14, color: '#F97316', marginRight: 8 }}>⚠️</Text>
              <Text style={[styles.validationMessageText, { color: '#9A3412' }]}>
                {t("admin.dashboard.validation.validationTemporarilyInvalidMessage", {
                  organizationName: selectedOrganization.name || 'Unknown',
                })}
              </Text>
            </View>
          );
        }

        // no_validation or unvalidated
        return (
          <View style={[styles.validationMessage, { backgroundColor: '#FFF7ED', borderColor: '#F97316' }]}>
            <Text style={{ fontSize: 14, color: '#F97316', marginRight: 8 }}>⚠️</Text>
            <Text style={[styles.validationMessageText, { color: '#9A3412' }]}>
              {t("admin.dashboard.validation.validationUnvalidatedMessage", {
                organizationName: selectedOrganization.name || 'Unknown',
              })}
            </Text>
          </View>
        );
      })()}

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statsCardWrapper}>
          <StatsCard
            title={t("admin.dashboard.totalUsers")}
            value={stats?.totalUsers || 0}
            icon="account-group"
            iconColor="#3b82f6"
          />
        </View>
        <View style={styles.statsCardWrapper}>
          <StatsCard
            title={t("admin.dashboard.menuItems")}
            value={stats?.totalMenuItems || 0}
            icon="food"
            iconColor="#22c55e"
          />
        </View>
        <View style={styles.statsCardWrapper}>
          <StatsCard
            title={t("admin.dashboard.orders")}
            value={stats?.totalOrders || 0}
            change={stats?.ordersChange}
            changeLabel={t("admin.dashboard.fromPeriod", {
              period: getChangeLabel(),
            })}
            icon="clipboard-list"
            iconColor="#a855f7"
          />
        </View>
        <View style={styles.statsCardWrapper}>
          <StatsCard
            title={t("admin.dashboard.revenue")}
            value={formatPrice(stats?.totalRevenue || 0)}
            change={stats?.revenueChange}
            changeLabel={t("admin.dashboard.fromPeriod", {
              period: getChangeLabel(),
            })}
            icon="currency-usd"
            iconColor="#ec4899"
          />
        </View>
        <View style={styles.statsCardWrapper}>
          <StatsCard
            title={!isBranchScoped && selectedBranchId === "all" 
              ? (t("admin.dashboard.totalBranchClicks") || "Total Branch Clicks")
              : (t("admin.dashboard.branchClicks") || "Branch Clicks")}
            value={stats?.totalBranchClicks || 0}
            icon="cursor-default-click"
            iconColor="#f97316"
          />
        </View>
      </View>

      {/* Charts Section */}
      <View style={styles.chartsContainer}>
        {/* Orders & Revenue Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleContainer}>
              <MaterialCommunityIcons name="chart-bar" size={20} color="#ec4899" />
              <Text style={styles.chartTitle}>
                {t("admin.dashboard.ordersRevenueTrend")}
              </Text>
            </View>
          </View>
          <View style={styles.chartContent}>
            {ordersChartData ? (
              <Chart
                type="line"
                data={ordersChartData}
                height={300}
                showFullscreenButton={true}
                onFullscreen={() => setShowFullscreenChart(true)}
                title={undefined}
              />
            ) : (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>
                  {t("admin.dashboard.noDataAvailable")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Categories Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleContainer}>
              <MaterialCommunityIcons
                name="package-variant"
                size={20}
                color="#ec4899"
              />
              <Text style={styles.chartTitle}>
                {t("admin.dashboard.popularCategories")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(admin)/insights" as any)}
            >
              <Text style={styles.insightsButton}>
                {t("admin.dashboard.insights")}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chartContent}>
            {categoriesChartData &&
            categoriesChartData.labels &&
            categoriesChartData.labels.length > 0 ? (
              <Chart type="doughnut" data={categoriesChartData} height={300} />
            ) : (
              <View style={styles.emptyChart}>
                <MaterialCommunityIcons
                  name="package-variant"
                  size={48}
                  color="#9CA3AF"
                />
                <Text style={styles.emptyText}>
                  {t("admin.dashboard.noCategoryData")}
                </Text>
                <Text style={styles.emptySubtext}>
                  {t("admin.dashboard.tryDifferentPeriod")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Branch Revenue Chart - Only show when "All Branches" is selected (super admin use-case) */}
        {!isBranchAdmin && selectedBranchId === "all" && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.chartTitleContainer}>
                <MaterialCommunityIcons name="chart-bar" size={20} color="#ec4899" />
                <Text style={styles.chartTitle}>
                  {t("admin.dashboard.branchRevenue")}
                </Text>
              </View>
            </View>
            <View style={styles.chartContent}>
              {branchRevenueChartData &&
              branchRevenueChartData.labels &&
              branchRevenueChartData.labels.length > 0 &&
              branchRevenueChartData.labels[0] !== "No Data" ? (
                <Chart type="doughnut" data={branchRevenueChartData} height={300} />
              ) : (
                <View style={styles.emptyChart}>
                  <MaterialCommunityIcons name="chart-bar" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>
                    {t("admin.dashboard.noBranchRevenueData")}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {t("admin.dashboard.tryDifferentPeriod")}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Branch Orders Chart - Only show when "All Branches" is selected (super admin use-case) */}
        {!isBranchAdmin && selectedBranchId === "all" && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.chartTitleContainer}>
                <MaterialCommunityIcons name="file-document" size={20} color="#ec4899" />
                <Text style={styles.chartTitle}>
                  {t("admin.dashboard.branchOrders")}
                </Text>
              </View>
            </View>
            <View style={styles.chartContent}>
              {branchOrdersChartData &&
              branchOrdersChartData.labels &&
              branchOrdersChartData.labels.length > 0 &&
              branchOrdersChartData.labels[0] !== "No Data" ? (
                <Chart type="doughnut" data={branchOrdersChartData} height={300} />
              ) : (
                <View style={styles.emptyChart}>
                  <MaterialCommunityIcons name="file-document" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>
                    {t("admin.dashboard.noBranchOrdersData")}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {t("admin.dashboard.tryDifferentPeriod")}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Fullscreen Chart Modal */}
      {ordersChartData && (
        <FullscreenChart
          visible={showFullscreenChart}
          onClose={() => setShowFullscreenChart(false)}
          data={ordersChartData}
          title={t("admin.dashboard.ordersRevenueTrend")}
        />
      )}

      </ScrollView>

      {/* Toast */}
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
                {t("admin.dashboard.selectBranch")}
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
                  {!isBranchScoped && (
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
                        {t("admin.dashboard.allBranches")}
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
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  header: {
    flexDirection: "column",
    marginBottom: 16,
    gap: 16,
  },
  filtersContainer: {
    flexDirection: "column",
    gap: 16,
    width: "100%",
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
    fontSize: 13,
    fontWeight: "500",
    color: "#D1D5DB",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ec4899",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
    justifyContent: "space-between",
  },
  statsCardWrapper: {
    width: "48%",
  },
  chartsContainer: {
    gap: 16,
  },
  chartCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 16,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: "#262626",
    marginBottom: 16,
    overflow: "hidden",
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  chartTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  insightsButton: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ec4899",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ec4899",
  },
  chartContent: {
    minHeight: 300,
    overflow: "hidden",
    width: "100%",
  },
  emptyChart: {
    height: 300,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
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
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  bottomSheetBody: {
    padding: 20,
    maxHeight: 500,
  },
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
  bottomSheetOptionText: {
    fontSize: 14,
    color: "#D1D5DB",
    fontWeight: "500",
  },
  bottomSheetOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  validationMessage: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  validationMessageText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
});
