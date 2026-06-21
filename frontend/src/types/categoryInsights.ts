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
