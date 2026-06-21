import ApiService from "@/src/services/apiService";

export interface Category {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  taxPercentage: number | null;
  isActive: boolean;
  isFeatured: boolean;
  featuredOrder?: number | null;
  listOrder?: number | null;
  excludedBranches?: string[];
  createdAt: Date;
  updatedAt: Date;
  _count: {
    meals: number;
    deals?: number;
  };
}

export interface CategoryFormData {
  name: string;
  description?: string;
  image?: string;
  taxPercentage?: number | null;
  isActive?: boolean;
  isFeatured?: boolean;
  excludedBranches?: string[];
}

export interface CategoriesResponse {
  categories: Category[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const categoryService = {
  // Get all categories with pagination and search
  getCategories: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    token?: string,
    status?: "ACTIVE" | "INACTIVE" | "",
    options?: {
      excludeDealCategories?: boolean;
    }
  ): Promise<CategoriesResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });
    if (status) params.append("status", status);

    if (options?.excludeDealCategories) {
      params.append("excludeDealCategories", "true");
    }

    const response = await apiService.get(`/api/categories?${params}`, token);
    return response.data;
  },

  // Get single category by ID
  getCategoryById: async (id: string, token?: string): Promise<Category> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/categories/${id}`, token);
    return response.data;
  },

  // Create new category
  createCategory: async (
    data: CategoryFormData,
    token?: string
  ): Promise<Category> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/categories", data, token);
    return response.data;
  },

  // Update category
  updateCategory: async (
    id: string,
    data: CategoryFormData,
    token?: string
  ): Promise<Category> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/categories/${id}`, data, token);
    return response.data;
  },

  // Delete category
  deleteCategory: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/categories/${id}`, token);
  },

  // Toggle category status
  toggleCategoryStatus: async (
    id: string,
    token?: string
  ): Promise<Category> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/categories/${id}/toggle-status`,
      {},
      token
    );
    return response.data;
  },

  // Reorder categories (featured or list)
  reorderCategories: async (
    type: "featured" | "list",
    orderedCategories: { id: string; order: number }[],
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.put(
      "/api/categories/reorder",
      { type, categories: orderedCategories },
      token
    );
  },

  setCategoryOrganization: async (
    categoryId: string,
    organizationId: string | null,
    token?: string
  ): Promise<Category> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/categories/${categoryId}/organization`,
      { organizationId },
      token
    );
    return response.data;
  },

  copyCategoriesToOrganization: async (
    ids: string[],
    organizationId: string,
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/categories/copy",
      { ids, organizationId },
      token
    );
    return response.data;
  },
};
