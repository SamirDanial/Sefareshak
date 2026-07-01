import ApiService from "./apiService";

export interface MealSize {
  id?: string;
  name: string;
  sizeType: "S" | "M" | "L" | "XL";
  price: number;
  taxPercentage?: number | null;
}

export interface MealAddOn {
  addOn: {
    id: string;
    name: string;
    price?: string; // DEPRECATED: Use addonSizes instead
    type: "BOOLEAN" | "QUANTITY";
    description: string | null;
    addonSizes?: Array<{
      id: string;
      sizeType: "S" | "M" | "L" | "XL";
      price: string;
      taxPercentage: number | null;
    }>;
  };
}

export interface MealDeclaration {
  declaration: {
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    icon: string | null;
  };
}

export interface MealOptionalIngredient {
  optionalIngredient: {
    id: string;
    name: string;
    description: string | null;
  };
}

export interface Meal {
  id: string;
  name: string;
  description: string | null;
  nameFa?: string | null;
  descriptionFa?: string | null;
  basePrice: string;
  taxPercentage: number | null;
  image: string | null;
  isActive: boolean;
  isFeatured?: boolean;
  isDrink?: boolean;
  featuredOrder?: number | null;
  listOrder?: number | null;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    taxPercentage?: number | null;
  };
  mealSizes: MealSize[];
  mealAddOns: MealAddOn[];
  mealDeclarations?: MealDeclaration[];
  mealOptionalIngredients?: MealOptionalIngredient[];
  _count: {
    orderItems: number;
  };
}

export interface MealFormData {
  name: string;
  description?: string;
  nameFa?: string;
  descriptionFa?: string;
  basePrice: number;
  taxPercentage?: number | null;
  image?: string;
  categoryId: string;
  sizes?: MealSize[];
  addOnIds?: string[];
  declarationIds?: string[];
  optionalIngredientIds?: string[];
  excludedBranches?: string[];
  isFeatured?: boolean;
  isDrink?: boolean;
}

export interface MealBranchPrice {
  id: string;
  mealId: string;
  branchId: string;
  basePrice: string;
  taxPercentage: number | null;
  branch: {
    id: string;
    name: string;
    code: string | null;
  };
}

export type MealBranchAvailabilityWindow = {
  id: string;
  availabilityId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type MealBranchAvailability = {
  id: string;
  mealId: string;
  branchId: string;
  isAvailableAllWeek: boolean;
  branch: {
    id: string;
    name: string;
    code: string | null;
    timezone: string | null;
  };
  windows: MealBranchAvailabilityWindow[];
};

export interface MealsResponse {
  meals: Meal[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const mealService = {
  // Get all meals with pagination and search
  getMeals: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    categoryId: string = "",
    status?: "ACTIVE" | "INACTIVE" | "",
    token?: string,
    options?: { isFeatured?: boolean }
  ): Promise<MealsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });

    if (categoryId) {
      params.append("categoryId", categoryId);
    }

    if (status) {
      params.append("status", status);
    }

    if (options?.isFeatured !== undefined) {
      params.append("isFeatured", String(options.isFeatured));
    }

    const response = await apiService.get(`/api/meals?${params}`, token);
    return response.data;
  },

  // Get single meal by ID
  getMealById: async (id: string, token?: string): Promise<Meal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/meals/${id}`, token);
    return response.data;
  },

  // Create new meal
  createMeal: async (data: MealFormData, token?: string): Promise<Meal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/meals", data, token);
    return response.data;
  },

  // Update meal
  updateMeal: async (
    id: string,
    data: MealFormData,
    token?: string
  ): Promise<Meal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/meals/${id}`, data, token);
    return response.data;
  },

  // Delete meal
  deleteMeal: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/meals/${id}`, token);
  },

  // Toggle meal status
  toggleMealStatus: async (id: string, token?: string): Promise<Meal> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/meals/${id}/toggle-status`,
      {},
      token
    );
    return response.data;
  },

  // Reorder featured meals
  reorderFeaturedMeals: async (
    meals: { id: string; order: number }[],
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.put(
      "/api/meals/reorder-featured",
      { meals },
      token
    );
  },

  // Reorder category meals
  reorderCategoryMeals: async (
    categoryId: string,
    meals: { id: string; order: number }[],
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.put(
      "/api/meals/reorder-category",
      { categoryId, meals },
      token
    );
  },

  // Branch price management
  getMealBranchPrices: async (
    mealId: string,
    token?: string
  ): Promise<MealBranchPrice[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/meals/${mealId}/branch-prices`,
      token
    );
    return response.data;
  },

  upsertMealBranchPrice: async (
    mealId: string,
    data: {
      branchId: string;
      basePrice: number;
      taxPercentage?: number | null;
    },
    token?: string
  ): Promise<MealBranchPrice> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/meals/${mealId}/branch-prices`,
      data,
      token
    );
    return response.data;
  },

  deleteMealBranchPrice: async (
    mealId: string,
    branchId: string,
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(
      `/api/admin/meals/${mealId}/branch-prices/${branchId}`,
      token
    );
  },

  getMealBranchAvailability: async (
    mealId: string,
    token?: string
  ): Promise<MealBranchAvailability[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/meals/${mealId}/branch-availability`,
      token
    );
    return response.data;
  },

  upsertMealBranchAvailability: async (
    mealId: string,
    data: {
      branchId: string;
      isAvailableAllWeek: boolean;
      windows?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    },
    token?: string
  ): Promise<MealBranchAvailability> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/meals/${mealId}/branch-availability`,
      data,
      token
    );
    return response.data;
  },

  deleteMealBranchAvailability: async (
    mealId: string,
    branchId: string,
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(
      `/api/admin/meals/${mealId}/branch-availability/${branchId}`,
      token
    );
  },
};
