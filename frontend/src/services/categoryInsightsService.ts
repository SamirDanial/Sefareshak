import ApiService from "./apiService";
import type { CategoryInsightsData } from "../types/categoryInsights";
import type { ChartData } from "./dashboardService";

export const categoryInsightsService = {
  // Get all available categories
  getCategories: async (token?: string): Promise<string[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      "/api/category-insights/categories",
      token
    );
    return response.data;
  },

  // Get insights for a specific category
  getCategoryInsights: async (
    category: string,
    period: string = "last_30_days",
    branchId?: string,
    token?: string
  ): Promise<CategoryInsightsData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    params.append("category", category);
    params.append("period", period);
    if (branchId) {
      params.append("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/category-insights/insights?${params.toString()}`,
      token
    );
    return response.data;
  },

  // Get branch revenue chart for a category (only when all branches selected)
  getBranchRevenueChart: async (
    category: string,
    period: string = "last_30_days",
    token?: string
  ): Promise<ChartData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    params.append("category", category);
    params.append("period", period);
    const response = await apiService.get(
      `/api/category-insights/branch-revenue-chart?${params.toString()}`,
      token
    );
    return response.data;
  },
};
