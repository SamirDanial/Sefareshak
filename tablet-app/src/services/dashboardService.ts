import ApiService from "@/src/services/apiService";
import BranchClickService from "./branchClickService";
import LocalDbService from "./localDbService";
import NetInfo from '@react-native-community/netinfo';

const inFlightRequests = new Map<string, Promise<any>>();

const withRequestDedupe = <T>(key: string, requestFactory: () => Promise<T>): Promise<T> => {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const request = requestFactory().finally(() => {
    if (inFlightRequests.get(key) === request) {
      inFlightRequests.delete(key);
    }
  });

  inFlightRequests.set(key, request as Promise<any>);
  return request;
};

export interface DashboardStats {
  totalUsers: number;
  totalMenuItems: number;
  totalOrders: number;
  totalRevenue: number;
  ordersChange: number;
  revenueChange: number;
  period: string;
  totalBranchClicks?: number;
  branchClicksChange?: number;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string | string[];
    tension?: number;
    yAxisID?: string;
    borderWidth?: number;
  }>;
}

export const dashboardService = {
  // Get organization click statistics via single backend endpoint
  getOrganizationClickStats: async (
    organizationId: string,
    token?: string
  ): Promise<{ totalClicks: number }> => {
    if (!organizationId) return { totalClicks: 0 };
    const dedupeKey = `org-clicks:${organizationId}`;
    return withRequestDedupe(dedupeKey, async () => {
      try {
        const apiService = ApiService.getInstance();
        const response = await apiService.get(
          `/api/admin/organizations/${organizationId}/click-stats`,
          token
        );
        const data = (response as any)?.data ?? response;
        const totalClicks = Number((data as any)?.totalClicks || 0);
        return { totalClicks: Number.isFinite(totalClicks) ? totalClicks : 0 };
      } catch (error: any) {
        const message = String(error?.message || "");
        const isTransientOrgError =
          error?.status === 403 ||
          error?.status === 400 ||
          error?.isWarning ||
          message.includes("Selected organization does not match") ||
          message.includes("Organization selection is required");
        if (isTransientOrgError) {
          console.warn("Skipping organization click stats:", message);
        } else {
          console.error("Error fetching organization click stats:", error);
        }
        return { totalClicks: 0 };
      }
    });
  },

  // Get dashboard statistics
  getDashboardStats: async (
    period: string = "today",
    branchId?: string,
    token?: string,
    organizationId?: string
  ): Promise<DashboardStats> => {
    const dedupeKey = `dashboard-stats:${period}:${branchId || "all"}:${organizationId || "none"}`;
    return withRequestDedupe(dedupeKey, async () => {
      const localDb = LocalDbService.getInstance();
      
      // Check if offline
      const netInfo = await NetInfo.fetch();
      const isOffline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);
      
      if (isOffline) {
        // Try to load from cache
        const cached = await localDb.getCachedDashboardStats(period, branchId, organizationId);
        if (cached) {
          return cached;
        }
        console.warn("[DashboardService] No cached data available and offline");
        throw new Error("No cached data available and offline");
      }
      
      // Online: fetch from API
      const apiService = ApiService.getInstance();
      const params = new URLSearchParams({ period });
      if (branchId) {
        params.append("branchId", branchId);
      }
      const response = await apiService.get(
        `/api/dashboard/stats?${params}`,
        token
      );

      // Extract actual data from response (backend returns { success: true, data: { ... } })
      let stats = response.data?.data || response.data;

      try {
        let clickStats: { totalClicks: number } | null = null;
        if (branchId) {
          clickStats = await BranchClickService.getBranchClickStats(branchId, token);
        } else if (organizationId) {
          clickStats = await dashboardService.getOrganizationClickStats(organizationId, token);
        }

        if (clickStats) {
          stats = {
            ...stats,
            totalBranchClicks: clickStats.totalClicks,
            branchClicksChange: 0,
          };
        }
      } catch (error) {
        console.error("Error fetching branch click stats:", error);
      }
      
      // Cache the result
      try {
        await localDb.cacheDashboardStats({
          totalUsers: stats.totalUsers || 0,
          totalMenuItems: stats.totalMenuItems || 0,
          totalOrders: stats.totalOrders || 0,
          totalRevenue: stats.totalRevenue || 0,
          ordersChange: stats.ordersChange || 0,
          revenueChange: stats.revenueChange || 0,
          period: stats.period || period,
          totalBranchClicks: stats.totalBranchClicks,
          branchClicksChange: stats.branchClicksChange,
          branchId,
          organizationId,
          cachedAt: new Date().toISOString(),
        });
      } catch (cacheError) {
        console.error("[DashboardService] Failed to cache stats:", cacheError);
      }
      
      return stats;
    });
  },

  // Get chart data
  getChartData: async (
    period: string = "this_month",
    chartType: string = "orders",
    branchId?: string,
    token?: string,
    organizationId?: string
  ): Promise<ChartData> => {
    const dedupeKey = `dashboard-chart:${period}:${chartType}:${branchId || "all"}:${organizationId || "none"}`;
    return withRequestDedupe(dedupeKey, async () => {
      const localDb = LocalDbService.getInstance();
      
      // Check if offline
      const netInfo = await NetInfo.fetch();
      const isOffline = !(netInfo.isConnected && netInfo.isInternetReachable !== false);
      
      if (isOffline) {
        // Try to load from cache
        const cached = await localDb.getCachedChartData(chartType, period, branchId, organizationId);
        if (cached) {
          return cached;
        }
        console.warn("[DashboardService] No cached chart data available and offline");
        throw new Error("No cached chart data available and offline");
      }
      
      // Online: fetch from API
      const apiService = ApiService.getInstance();
      const params = new URLSearchParams({ period, chartType });
      if (branchId) {
        params.append("branchId", branchId);
      }
      const response = await apiService.get(
        `/api/dashboard/charts?${params}`,
        token
      );
      
      // Extract actual data from response (backend returns { success: true, data: { ... } })
      const chartData = response.data?.data || response.data;
      
      // Cache the result
      try {
        await localDb.cacheChartData({
          labels: chartData.labels || [],
          datasets: chartData.datasets || [],
          chartType,
          period,
          branchId,
          organizationId,
          cachedAt: new Date().toISOString(),
        });
      } catch (cacheError) {
        console.error("[DashboardService] Failed to cache chart data:", cacheError);
      }
      
      return chartData;
    });
  },
};
