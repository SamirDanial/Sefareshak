import ApiService from "./apiService";
import branchClickService from "./branchClickService";

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
  selectedBranch?: {
    id: string;
    name: string;
    isActive: boolean;
  };
  selectedOrganization?: {
    id: string;
    name: string;
    isActive: boolean;
    validation?: {
      id: string;
      validatedAt: string;
      expiresAt: string;
      gracePeriodEndsAt: string;
      isActive: boolean;
      unvalidatedAt?: string;
      unvalidatedBy?: string;
    };
  };
}

export interface ChartData {
  branchIds?: string[];
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
  // Helper function to get organization click stats with time period filtering
  getOrganizationClickStats: async (_period: string, token?: string): Promise<{ totalClicks: number }> => {
    try {
      // Get all branches for the organization and sum their click stats
      const apiService = ApiService.getInstance();
      
      // Get all branches first - we'll infer the organization from the branches
      const branchesResponse = await apiService.get("/api/user/branches", token);
      const branches = branchesResponse.data || [];
      
      if (!branches.length) {
        return { totalClicks: 0 };
      }
      
      // Group branches by organization ID to find the organization with the most branches
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
      
      // Find the organization with the most branches (most likely the user's organization)
      const orgEntries = Object.entries(orgGroups);
      if (!orgEntries.length) {
        return { totalClicks: 0 };
      }
      
      const targetOrg = orgEntries.reduce((best: any, [, orgData]: [string, any]) => {
        return orgData.branches.length > best.branches.length ? orgData : best;
      }, orgEntries[0][1]);
      
      // Get click stats for each branch and sum them up
      let totalClicks = 0;
      
      for (const branch of targetOrg.branches) {
        try {
          const branchStats = await branchClickService.getBranchClickStats(branch.id);
          totalClicks += branchStats.totalClicks;
        } catch (error) {
          console.error(`Error fetching stats for branch ${branch.id}:`, error);
          // Continue with other branches
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
    if (branchId) {
      params.append("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/dashboard/stats?${params}`,
      token
    );
    
    // If we have a specific branch, add branch click stats
    // If "all" is selected (branchId is undefined), add organization-level click stats
    let stats = response.data;
    
    // Check if we should fetch organization stats (when branchId is undefined, meaning "All Branches")
    const shouldFetchOrgStats = !branchId;
    
    if (branchId || shouldFetchOrgStats) {
      try {
        let clickStats;
        if (shouldFetchOrgStats) {
          // Get organization-level stats when "All Branches" is selected
          clickStats = await dashboardService.getOrganizationClickStats(period, token);
        } else {
          // Get specific branch stats
          clickStats = await branchClickService.getBranchClickStats(branchId);
        }
        
        stats = {
          ...stats,
          totalBranchClicks: clickStats.totalClicks,
          // Note: branchClicksChange would need to be calculated based on historical data
          // For now, we'll set it to 0 or calculate it if the API provides it
          branchClicksChange: 0
        };
      } catch (error) {
        console.error("Error fetching branch click stats:", error);
        // Don't fail the entire stats call if click stats fail
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
    if (branchId) {
      params.append("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/dashboard/charts?${params}`,
      token
    );
    return response.data;
  },
};
