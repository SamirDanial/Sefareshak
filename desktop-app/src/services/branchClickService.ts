import ApiService from "./apiService";

export interface BranchClickStats {
  totalClicks: number;
  uniqueUsers: number;
  anonymousClicks: number;
  recentClicks: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  clicksByHour: { hour: number; clicks: number }[];
  clicksByDay: { date: string; clicks: number }[];
}

export interface OrganizationClickStats {
  totalClicks: number;
  uniqueUsers: number;
  branches: {
    branchId: string;
    branchName: string;
    clicks: number;
    uniqueUsers: number;
  }[];
}

class BranchClickService {
  private apiService: ApiService;

  constructor() {
    this.apiService = ApiService.getInstance();
  }

  // Record a branch click
  async recordBranchClick(branchId: string, token?: string): Promise<void> {
    try {
      await this.apiService.post(
        "/api/user/branches/click",
        { branchId },
        token
      );
    } catch (error) {
      console.error("Error recording branch click:", error);
      throw error;
    }
  }

  // Get branch click statistics
  async getBranchClickStats(branchId: string): Promise<BranchClickStats> {
    try {
      const response = await this.apiService.get(
        `/api/user/branches/${branchId}/click-stats`
      );
      
      if (!response.success) {
        throw new Error(response.message || "Failed to get branch click statistics");
      }
      
      return response.data;
    } catch (error) {
      console.error("Error getting branch click stats:", error);
      throw error;
    }
  }

  // Get recent branch clicks
  async getBranchClicks(
    branchId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.offset) params.append("offset", options.offset.toString());
      if (options?.startDate) params.append("startDate", options.startDate);
      if (options?.endDate) params.append("endDate", options.endDate);

      const response = await this.apiService.get(
        `/api/user/branches/${branchId}/clicks?${params}`
      );
      
      if (!response.success) {
        throw new Error(response.message || "Failed to get branch clicks");
      }
      
      return response.data;
    } catch (error) {
      console.error("Error getting branch clicks:", error);
      throw error;
    }
  }

  // Get organization-level click statistics
  async getOrganizationClickStats(
    organizationId: string,
    options?: {
      startDate?: string;
      endDate?: string;
    }
  ): Promise<OrganizationClickStats> {
    try {
      const params = new URLSearchParams();
      if (options?.startDate) params.append("startDate", options.startDate);
      if (options?.endDate) params.append("endDate", options.endDate);

      const response = await this.apiService.get(
        `/api/admin/organizations/${organizationId}/click-stats?${params}`
      );
      
      if (!response.success) {
        throw new Error(response.message || "Failed to get organization click statistics");
      }
      
      return response.data;
    } catch (error) {
      console.error("Error getting organization click stats:", error);
      throw error;
    }
  }
}

export default new BranchClickService();
