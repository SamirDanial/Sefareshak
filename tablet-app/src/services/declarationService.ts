import ApiService from "@/src/services/apiService";

export interface Declaration {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  icon: string | null;
  shownInFilter: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    mealDeclarations: number;
  };
}

export interface DeclarationFormData {
  name: string;
  type?: string | null;
  description?: string | null;
  icon?: string | null;
  shownInFilter?: boolean;
}

export interface DeclarationsResponse {
  declarations: Declaration[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const declarationService = {
  // Get all declarations with pagination and search
  getDeclarations: async (
    page: number = 1,
    limit: number = 100,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    type: string = "",
    token?: string
  ): Promise<DeclarationsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });

    if (type) {
      params.append("type", type);
    }

    const response = await apiService.get(`/api/declarations?${params}`, token);
    return response.data;
  },

  // Get all declarations (simplified, for dropdowns)
  getAllDeclarations: async (
    type?: string,
    token?: string
  ): Promise<Declaration[]> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    if (type) {
      params.append("type", type);
    }

    const response = await apiService.get(
      `/api/declarations/all${params.toString() ? `?${params}` : ""}`,
      token
    );
    return response.data;
  },

  // Get single declaration by ID
  getDeclarationById: async (
    id: string,
    token?: string
  ): Promise<Declaration> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/declarations/${id}`, token);
    return response.data;
  },

  // Create new declaration
  createDeclaration: async (
    data: DeclarationFormData,
    token?: string
  ): Promise<Declaration> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/declarations", data, token);
    return response.data;
  },

  // Update declaration
  updateDeclaration: async (
    id: string,
    data: DeclarationFormData,
    token?: string
  ): Promise<Declaration> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/declarations/${id}`,
      data,
      token
    );
    return response.data;
  },

  // Delete declaration
  deleteDeclaration: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/declarations/${id}`, token);
  },

  setDeclarationOrganization: async (
    id: string,
    organizationId: string,
    token?: string
  ): Promise<Declaration> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/declarations/${id}/organization`,
      { organizationId },
      token
    );
    return response.data;
  },

  copyDeclarationsToOrganization: async (
    ids: string[],
    organizationId: string,
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/declarations/copy",
      { ids, organizationId },
      token
    );
    return response.data;
  },
};
