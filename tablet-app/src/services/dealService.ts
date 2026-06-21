import ApiService from "@/src/services/apiService";

export interface DealComponent {
  id?: string;
  name: string;
  quantity?: number;
  price: number;
  taxPercentage: number;
  sortOrder?: number;
  effectivePrice?: number;
  effectiveTaxPercentage?: number;
}

export interface Deal {
  id: string;
  name: string;
  description: string | null;
  sku?: string | null;
  image: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  featuredOrder?: number | null;
  listOrder?: number | null;
  categoryId: string;
  excludedBranches?: string[];
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    taxPercentage?: number | null;
    excludedBranches?: string[];
  };
  components: DealComponent[];
  dealAddOns?: Array<{ id: string; addOn: any }>;
  dealDeclarations?: Array<{ id: string; declaration: any }>;
  dealOptionalIngredients?: Array<{ id: string; optionalIngredient: any }>;
  _count?: {
    orderItems: number;
  };
}

export interface DealFormData {
  name: string;
  description?: string;
  sku?: string;
  image?: string;
  categoryId: string;
  excludedBranches?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  components: DealComponent[];
  addOnIds?: string[];
  declarationIds?: string[];
  optionalIngredientIds?: string[];
}

export interface DealsResponse {
  deals: Deal[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const dealService = {
  getDeals: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    categoryId: string = "",
    token?: string,
    options?: {
      isFeatured?: boolean;
      status?: string;
      branchId?: string;
    }
  ): Promise<DealsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });

    if (categoryId) params.append("categoryId", categoryId);
    if (options?.isFeatured !== undefined) {
      params.append("isFeatured", String(options.isFeatured));
    }
    if (options?.status) params.append("status", options.status);
    if (options?.branchId) params.append("branchId", options.branchId);

    const response = await apiService.get(`/api/deals?${params}`, token);
    return response.data;
  },

  getDealById: async (id: string, token?: string): Promise<Deal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/deals/${id}`, token);
    return response.data;
  },

  createDeal: async (data: DealFormData, token?: string): Promise<Deal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/deals", data, token);
    return response.data;
  },

  updateDeal: async (id: string, data: DealFormData, token?: string): Promise<Deal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/deals/${id}`, data, token);
    return response.data;
  },

  deleteDeal: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/deals/${id}`, token);
  },

  toggleDealStatus: async (id: string, token?: string): Promise<Deal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/deals/${id}/toggle-status`, {}, token);
    return response.data;
  },

  reorderCategoryDeals: async (
    categoryId: string,
    deals: { id: string; order: number }[],
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.put("/api/deals/reorder-category", { categoryId, deals }, token);
  },
};
