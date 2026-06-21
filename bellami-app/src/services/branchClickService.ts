import ApiService from "./apiService";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface BranchClickData {
  id: string;
  branchId: string;
  userId: string | null;
  clickTime: string;
}

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

export interface BranchClicksResponse {
  clicks: BranchClickData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrganizationClickStats {
  totalClicks: number;
  uniqueUsers: number;
  anonymousClicks: number;
  branchStats: Array<{
    branchId: string;
    branchName: string;
    totalClicks: number;
    uniqueUsers: number;
  }>;
}

class BranchClickService {
  private static instance: BranchClickService;

  static getInstance(): BranchClickService {
    if (!BranchClickService.instance) {
      BranchClickService.instance = new BranchClickService();
    }
    return BranchClickService.instance;
  }

  private apiService = ApiService.getInstance();

  /**
   * Record a branch click
   */
  async recordBranchClick(branchId: string, userId?: string | null): Promise<BranchClickData> {
    try {
      const token = await this.getTokenFromStorage();
      const response = await this.apiService.post(
        `/api/user/branches/${branchId}/click`,
        { userId: userId || null },
        token || undefined,
        { skipOrgHeader: true }
      );

      if (response && response.success) {
        return response.data;
      }

      throw new Error(response?.error || 'Failed to record branch click');
    } catch (error: any) {
      console.error('❌ [BranchClick] Error recording branch click:', error);
      // Don't throw error for click tracking - it should be non-blocking
      throw error;
    }
  }

  /**
   * Get branch click statistics
   */
  async getBranchClickStats(branchId: string): Promise<BranchClickStats> {
    try {
      const token = await this.getTokenFromStorage();
      const response = await this.apiService.get(
        `/api/user/branches/${branchId}/click-stats`,
        token || undefined,
        { skipOrgHeader: true }
      );

      if (response && response.success) {
        return response.data;
      }

      throw new Error(response?.error || 'Failed to get branch click statistics');
    } catch (error) {
      console.error('Error getting branch click stats:', error);
      throw error;
    }
  }

  /**
   * Get paginated branch clicks
   */
  async getBranchClicks(
    branchId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<BranchClicksResponse> {
    try {
      const token = await this.getTokenFromStorage();
      const response = await this.apiService.get(
        `/api/user/branches/${branchId}/clicks?page=${page}&limit=${limit}`,
        token || undefined,
        { skipOrgHeader: true }
      );

      if (response && response.success) {
        return response.data;
      }

      throw new Error(response?.error || 'Failed to get branch clicks');
    } catch (error) {
      console.error('Error getting branch clicks:', error);
      throw error;
    }
  }

  /**
   * Get organization click statistics (admin only)
   */
  async getOrganizationClickStats(organizationId: string): Promise<OrganizationClickStats> {
    try {
      const token = await this.getTokenFromStorage();
      const response = await this.apiService.get(
        `/api/admin/organizations/${organizationId}/click-stats`,
        token || undefined
      );

      if (response && response.success) {
        return response.data;
      }

      throw new Error(response?.error || 'Failed to get organization click statistics');
    } catch (error) {
      console.error('Error getting organization click stats:', error);
      throw error;
    }
  }

  /**
   * Helper method to get auth token from storage
   */
  private async getTokenFromStorage(): Promise<string | null> {
    try {
      // Try to get token from AsyncStorage (where Clerk typically stores it)
      const token = await AsyncStorage.getItem('clerk_token');
      return token;
    } catch (error) {
      console.error('Error getting auth token from storage:', error);
      return null;
    }
  }
}

export default BranchClickService.getInstance();
