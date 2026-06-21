import ApiService from "./apiService";

const unwrapData = <T,>(response: unknown): T => {
  if (response && typeof response === "object" && "data" in (response as any)) {
    return (response as any).data as T;
  }
  return response as T;
};

export interface CategoryInsightsData {
  category: string;
  period: string;
  salesData: {
    totalRevenue: number;
    totalOrders: number;
    totalQuantity: number;
    avgOrderValue: number;
  };
  menuItems: Array<{
    name: string;
    sales: number;
    orders: number;
    quantity: number;
    avgPrice: number;
  }>;
  popularAddOns: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
  salesOverTime: Array<{
    label: string;
    revenue: number;
    orders: number;
    quantity: number;
  }>;
}

export const categoryInsightsService = {
  // Get all available categories
  getCategories: async (token?: string): Promise<string[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      "/api/category-insights/categories",
      token
    );
    return unwrapData<string[]>(response);
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
    return unwrapData<CategoryInsightsData>(response);
  },

  // Get branch revenue chart for a category (only when all branches selected)
  getBranchRevenueChart: async (
    category: string,
    period: string = "last_30_days",
    token?: string
  ): Promise<{ labels: string[]; datasets: any[] }> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    params.append("category", category);
    params.append("period", period);
    const response = await apiService.get(
      `/api/category-insights/branch-revenue-chart?${params.toString()}`,
      token
    );
    return unwrapData<any>(response);
  },
};

