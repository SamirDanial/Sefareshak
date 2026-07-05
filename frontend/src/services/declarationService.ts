import ApiService from "./apiService";

export interface Declaration {
  id: string;
  name: string;
  nameFa?: string | null;
  type: string | null;
  description: string | null;
  descriptionFa?: string | null;
  icon: string | null;
  shownInFilter: boolean;
  excludedBranches?: string[];
  organizationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    mealDeclarations: number;
  };
}

export interface DeclarationFormData {
  name: string;
  nameFa?: string | null;
  type?: string | null;
  description?: string | null;
  descriptionFa?: string | null;
  icon?: string | null;
  shownInFilter?: boolean;
  excludedBranches?: string[];
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
    token?: string,
    branchId?: string
  ): Promise<Declaration[]> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    if (type) {
      params.append("type", type);
    }

    if (!token) {
      if (!branchId || !branchId.trim()) {
        throw new Error("branchId is required");
      }
      params.append("branchId", branchId.trim());
    }

    // Customer pages should use the public endpoint (no auth, no org selection requirement).
    // Admin pages (token present) should continue using the protected declarations endpoint.
    const url = token
      ? `/api/declarations/all${params.toString() ? `?${params}` : ""}`
      : `/api/user/declarations/all${params.toString() ? `?${params}` : ""}`;

    const response = await apiService.get(url, token, {
      // Ensure public requests never get accidentally scoped by x-organization-id.
      skipOrgHeader: !token,
    });
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

  // SUPER_ADMIN: Move declaration to a different organization
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
