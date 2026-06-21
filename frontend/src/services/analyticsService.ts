import ApiService from "./apiService";
import type { ChartData } from "./dashboardService";

export interface MonthOverMonthChanges {
  revenueChange: number;
  refundsChange: number;
  ordersChange: number;
  netRevenueChange: number;
}

export interface RevenueAnalyticsSummary {
  totalRevenue: number;
  totalRefunds: number;
  totalTaxes?: number;
  netRevenue: number;
  totalOrders: number;
  monthOverMonthChanges?: MonthOverMonthChanges;
}

export interface RevenueChartData {
  month: string;
  revenue: number;
  refunds: number;
  orders: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  revenue: number;
  orders: number;
}

export interface OrderStatusBreakdown {
  status: string;
  revenue: number;
  orders: number;
}

export interface RevenueAnalyticsData {
  summary: RevenueAnalyticsSummary;
  chartData: RevenueChartData[];
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  orderStatusBreakdown: OrderStatusBreakdown[];
}

export interface RefundAnalyticsSummary {
  totalRefundAmount: number;
  totalRefundsCount: number;
  averageRefundAmount: number;
}

export interface RefundChartData {
  month: string;
  amount: number;
  count: number;
}

export interface RefundBreakdown {
  status?: string;
  type?: string;
  method?: string;
  amount: number;
  count: number;
}

export interface RecentRefund {
  id: string;
  orderNumber: string;
  amount: number;
  refundType: string;
  status: string;
  reason?: string;
  refundedBy: string;
  createdAt: string;
  refundedAt?: string;
}

export interface RefundAnalyticsData {
  summary: RefundAnalyticsSummary;
  chartData: RefundChartData[];
  refundsByStatus: RefundBreakdown[];
  refundsByType: RefundBreakdown[];
  refundsByPaymentMethod: RefundBreakdown[];
  recentRefunds: RecentRefund[];
}

export interface MonthFilter {
  year: number;
  month: number;
  label: string;
}

export interface TimePeriod {
  type: "yearly" | "monthly" | "weekly" | "daily" | "custom";
  startDate: Date;
  endDate: Date;
  label: string;
  year?: number;
  month?: number;
  week?: number;
}

export interface AnalyticsFilters {
  timePeriod?: TimePeriod;
  monthFilter?: MonthFilter; // For backward compatibility
  paymentMethod?: string;
  orderStatus?: string;
}

export const analyticsService = {
  // Get revenue analytics
  getRevenueAnalytics: async (
    filters: AnalyticsFilters,
    branchId?: string,
    token?: string
  ): Promise<RevenueAnalyticsData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();

    let startDate: Date;
    let endDate: Date;
    let periodType: string;

    // Use timePeriod if available, otherwise fall back to monthFilter for backward compatibility
    if (filters.timePeriod) {
      startDate = filters.timePeriod.startDate;
      endDate = filters.timePeriod.endDate;
      periodType = filters.timePeriod.type;
    } else if (filters.monthFilter) {
      // Backward compatibility
      startDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month,
        1
      );
      endDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month + 1,
        0,
        23,
        59,
        59
      );
      periodType = "monthly";
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      periodType = "monthly";
    }

    params.append("startDate", startDate.toISOString());
    params.append("endDate", endDate.toISOString());
    params.append("periodType", periodType);

    if (filters.paymentMethod)
      params.append("paymentMethod", filters.paymentMethod);
    if (filters.orderStatus) params.append("orderStatus", filters.orderStatus);
    if (branchId) params.append("branchId", branchId);

    const response = await apiService.get(
      `/api/admin/analytics/revenue-detailed?${params.toString()}`,
      token
    );
    return response.data;
  },

  // Get refund analytics
  getRefundAnalytics: async (
    filters: AnalyticsFilters,
    branchId?: string,
    token?: string
  ): Promise<RefundAnalyticsData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();

    let startDate: Date;
    let endDate: Date;
    let periodType: string;

    // Use timePeriod if available, otherwise fall back to monthFilter for backward compatibility
    if (filters.timePeriod) {
      startDate = filters.timePeriod.startDate;
      endDate = filters.timePeriod.endDate;
      periodType = filters.timePeriod.type;
    } else if (filters.monthFilter) {
      // Backward compatibility
      startDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month,
        1
      );
      endDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month + 1,
        0,
        23,
        59,
        59
      );
      periodType = "monthly";
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      periodType = "monthly";
    }

    params.append("startDate", startDate.toISOString());
    params.append("endDate", endDate.toISOString());
    params.append("periodType", periodType);

    if (filters.paymentMethod)
      params.append("paymentMethod", filters.paymentMethod);
    if (filters.orderStatus) params.append("orderStatus", filters.orderStatus);
    if (branchId) params.append("branchId", branchId);

    const response = await apiService.get(
      `/api/admin/analytics/refunds?${params.toString()}`,
      token
    );
    return response.data;
  },

  // Get branch revenue chart (only when all branches selected)
  getBranchRevenueChart: async (
    filters: AnalyticsFilters,
    token?: string
  ): Promise<ChartData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();

    let startDate: Date;
    let endDate: Date;

    // Use timePeriod if available, otherwise fall back to monthFilter for backward compatibility
    if (filters.timePeriod) {
      startDate = filters.timePeriod.startDate;
      endDate = filters.timePeriod.endDate;
    } else if (filters.monthFilter) {
      // Backward compatibility
      startDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month,
        1
      );
      endDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month + 1,
        0,
        23,
        59,
        59
      );
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    params.append("startDate", startDate.toISOString());
    params.append("endDate", endDate.toISOString());

    const response = await apiService.get(
      `/api/admin/analytics/revenue/branch-chart?${params.toString()}`,
      token
    );
    return response.data;
  },

  // Get branch refunds chart (only when all branches selected)
  getBranchRefundsChart: async (
    filters: AnalyticsFilters,
    token?: string
  ): Promise<ChartData> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();

    let startDate: Date;
    let endDate: Date;

    // Use timePeriod if available, otherwise fall back to monthFilter for backward compatibility
    if (filters.timePeriod) {
      startDate = filters.timePeriod.startDate;
      endDate = filters.timePeriod.endDate;
    } else if (filters.monthFilter) {
      // Backward compatibility
      startDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month,
        1
      );
      endDate = new Date(
        filters.monthFilter.year,
        filters.monthFilter.month + 1,
        0,
        23,
        59,
        59
      );
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    params.append("startDate", startDate.toISOString());
    params.append("endDate", endDate.toISOString());

    const response = await apiService.get(
      `/api/admin/analytics/refunds/branch-chart?${params.toString()}`,
      token
    );
    return response.data;
  },
};
