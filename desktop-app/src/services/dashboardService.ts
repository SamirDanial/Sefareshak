import ApiService from "./apiService";
import BranchClickService from "./branchClickService";

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
    borderColor?: string | string[];
    backgroundColor?: string | string[];
    tension?: number;
    yAxisID?: string;
    borderWidth?: number;
    hoverOffset?: number;
  }>;
}

export const dashboardService = {
  // Get organization click statistics
  getOrganizationClickStats: async (_period: string, token?: string): Promise<{ totalClicks: number }> => {
    try {
      const apiService = ApiService.getInstance();
      const branchesResponse = await apiService.get("/api/user/branches", token);
      const branches = branchesResponse.data || [];

      if (!branches.length) { 
        return { totalClicks: 0 }; 
      }

      const orgGroups = branches.reduce((groups: any, branch: any) => {
        const orgId = branch.organizationId;
        if (!orgId) return groups;
        if (!groups[orgId]) {
          groups[orgId] = { 
            organizationId: orgId, 
            branches: [], 
            name: branch.organization?.name || 'Unknown Organization' 
          };
        }
        groups[orgId].branches.push(branch);
        return groups;
      }, {});

      const orgEntries = Object.entries(orgGroups);
      if (!orgEntries.length) { 
        return { totalClicks: 0 }; 
      }

      const targetOrg = orgEntries.reduce((best: any, [, orgData]: [string, any]) => {
        return orgData.branches.length > best.branches.length ? orgData : best;
      }, orgEntries[0][1]);

      let totalClicks = 0;
      for (const branch of targetOrg.branches) {
        try {
          const branchStats = await BranchClickService.getBranchClickStats(branch.id);
          totalClicks += branchStats.totalClicks;
        } catch (error) {
          console.error(`Error fetching stats for branch ${branch.id}:`, error);
        }
      }
      return { totalClicks };
    } catch (error) {
      console.error("Error fetching organization click stats:", error);
      return { totalClicks: 0 };
    }
  },

  // Get dashboard statistics
  getDashboardStats: async (
    period: string = "today",
    branchId?: string,
    token?: string
  ): Promise<DashboardStats> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({ period });
    if (branchId) params.append("branchId", branchId);
    const response = await apiService.get(`/api/dashboard/stats?${params}`, token);

    let stats = response.data;
    const shouldFetchOrgStats = !branchId;

    if (branchId || shouldFetchOrgStats) {
      try {
        let clickStats;
        if (shouldFetchOrgStats) {
          clickStats = await dashboardService.getOrganizationClickStats(period, token);
        } else {
          clickStats = await BranchClickService.getBranchClickStats(branchId);
        }

        stats = {
          ...stats,
          totalBranchClicks: clickStats.totalClicks,
          branchClicksChange: 0
        };
      } catch (error) {
        console.error("Error fetching branch click stats:", error);
      }
    }
    return stats;
  },

  // Get chart data
  getChartData: async (
    period: string = "this_month",
    chartType: string = "orders",
    branchId?: string,
    token?: string
  ): Promise<ChartData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({ period, chartType });
    if (branchId) params.append("branchId", branchId);
    const response = await apiService.get(`/api/dashboard/charts?${params}`, token);
    return response.data;
  },
};

