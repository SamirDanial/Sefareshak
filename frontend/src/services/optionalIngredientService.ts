import ApiService from "./apiService";

export interface OptionalIngredient {
  id: string;
  name: string;
  nameFa?: string | null;
  description: string | null;
  descriptionFa?: string | null;
  organizationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    mealOptionalIngredients: number;
  };
}

export interface OptionalIngredientFormData {
  name: string;
  nameFa?: string | null;
  description?: string;
  descriptionFa?: string | null;
}

export interface OptionalIngredientsResponse {
  optionalIngredients: OptionalIngredient[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const optionalIngredientService = {
  // Get all optional ingredients with pagination and search
  getOptionalIngredients: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    token?: string
  ): Promise<OptionalIngredientsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });

    const response = await apiService.get(
      `/api/optional-ingredients?${params}`,
      token
    );
    return response.data;
  },

  // Get all optional ingredients (simplified, for dropdowns)
  getAllOptionalIngredients: async (
    token?: string
  ): Promise<OptionalIngredient[]> => {
    try {
      const apiService = ApiService.getInstance();
      const response = await apiService.get(
        `/api/optional-ingredients/all`,
        token
      );
      // API returns { success: true, data: [...] }
      // response is the full JSON, so response.data is the array
      if (response && response.data && Array.isArray(response.data)) {
        return response.data;
      }
      // Fallback: if response is already an array (shouldn't happen but just in case)
      if (Array.isArray(response)) {
        return response;
      }
      console.warn(
        "Unexpected response format for optional ingredients:",
        response
      );
      return [];
    } catch (error) {
      console.error("Error fetching optional ingredients:", error);
      return [];
    }
  },

  // Get single optional ingredient by ID
  getOptionalIngredientById: async (
    id: string,
    token?: string
  ): Promise<OptionalIngredient> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/optional-ingredients/${id}`,
      token
    );
    return response.data;
  },

  // Create new optional ingredient
  createOptionalIngredient: async (
    data: OptionalIngredientFormData,
    token?: string
  ): Promise<OptionalIngredient> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/optional-ingredients",
      data,
      token
    );
    return response.data;
  },

  // Update optional ingredient
  updateOptionalIngredient: async (
    id: string,
    data: OptionalIngredientFormData,
    token?: string
  ): Promise<OptionalIngredient> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/optional-ingredients/${id}`,
      data,
      token
    );
    return response.data;
  },

  // Delete optional ingredient
  deleteOptionalIngredient: async (
    id: string,
    token?: string
  ): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/optional-ingredients/${id}`, token);
  },

  // SUPER_ADMIN: Move optional ingredient to a different organization
  setOptionalIngredientOrganization: async (
    id: string,
    organizationId: string,
    token?: string
  ): Promise<OptionalIngredient> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/optional-ingredients/${id}/organization`,
      { organizationId },
      token
    );
    return response.data;
  },

  copyOptionalIngredientsToOrganization: async (
    ids: string[],
    organizationId: string,
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/optional-ingredients/copy",
      { ids, organizationId },
      token
    );
    return response.data;
  },
};
