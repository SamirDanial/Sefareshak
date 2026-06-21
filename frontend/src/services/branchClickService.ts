import { getApiBaseUrl } from "./apiService";

export interface BranchClickData {
  id: string;
  branchId: string;
  userId: string | null;
  clickTime: string;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
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
  clicksByHour: Array<{ hour: number; clicks: number }>;
  clicksByDay: Array<{ date: string; clicks: number }>;
}

export interface BranchClicksResponse {
  clicks: BranchClickData[];
  total: number;
  page: number;
  totalPages: number;
}

export interface OrganizationClickStats {
  totalClicks: number;
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

  /**
   * Record a branch click
   */
  async recordBranchClick(branchId: string, userId?: string | null): Promise<BranchClickData> {
    try {
      // Use direct fetch since ApiService.parseJsonOrNull is failing for this endpoint
      const response = await fetch(`${getApiBaseUrl()}/api/user/branches/${branchId}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userId || null })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ [BranchClick] JSON parse error:', parseError);
        console.error('❌ [BranchClick] Raw response:', text);
        throw new Error('Failed to parse server response');
      }
      
      if (result && result.success) {
        return result.data;
      }
      
      throw new Error(result?.error || 'Failed to record branch click');
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
      const response = await fetch(`${getApiBaseUrl()}/api/user/branches/${branchId}/click-stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ [BranchClick] JSON parse error in stats:', parseError);
        throw new Error('Failed to parse server response');
      }
      
      if (result && result.success) {
        return result.data;
      }
      
      throw new Error(result?.error || 'Failed to get branch click statistics');
    } catch (error) {
      console.error('Error getting branch click stats:', error);
      throw error;
    }
  }

  /**
   * Get recent branch clicks with pagination
   */
  async getBranchClicks(
    branchId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<BranchClicksResponse> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/user/branches/${branchId}/clicks?page=${page}&limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ [BranchClick] JSON parse error in clicks:', parseError);
        throw new Error('Failed to parse server response');
      }
      
      if (result && result.success) {
        return result.data;
      }
      
      throw new Error(result?.error || 'Failed to get branch clicks');
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
      const response = await fetch(`${getApiBaseUrl()}/api/admin/organizations/${organizationId}/click-stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      let result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        console.error('❌ [BranchClick] JSON parse error in org stats:', parseError);
        throw new Error('Failed to parse server response');
      }
      
      if (result && result.success) {
        return result.data;
      }
      
      throw new Error(result?.error || 'Failed to get organization click statistics');
    } catch (error) {
      console.error('Error getting organization click stats:', error);
      throw error;
    }
  }
}

export default BranchClickService.getInstance();
