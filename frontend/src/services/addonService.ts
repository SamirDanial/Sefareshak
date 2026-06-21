import ApiService from "./apiService";

export interface AddonSize {
  id: string;
  sizeType: "S" | "M" | "L" | "XL";
  price: string; // Prisma Decimal fields are returned as strings
  taxPercentage: number | null;
}

export interface Addon {
  id: string;
  name: string;
  description: string | null;
  price?: string; // DEPRECATED: Use addonSizes instead. Kept for backward compatibility
  taxPercentage: number | null;
  effectiveBasePrice?: number; // Branch-specific base price if available
  effectiveTaxPercentage?: number | null; // Branch-specific tax percentage if available
  image: string | null;
  type: "BOOLEAN" | "QUANTITY";
  isActive: boolean;
  excludedBranches?: string[];
  organizationId?: string | null;
  addonCategories: {
    id: string;
    category: {
      id: string;
      name: string;
    };
  }[];
  addonSizes?: AddonSize[];
  createdAt: Date;
  updatedAt: Date;
  _count: {
    mealAddOns: number;
  };
}

export interface AddonBranchPrice {
  id: string;
  addonId: string;
  branchId: string;
  basePrice: string;
  taxPercentage: number | null;
  branch: {
    id: string;
    name: string;
    code: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AddonSizeFormData {
  sizeType: "S" | "M" | "L" | "XL";
  price: number;
  taxPercentage?: number | null;
}

export interface AddonFormData {
  name: string;
  description?: string;
  price: number; // Base price (like meals have basePrice)
  sizes: AddonSizeFormData[]; // Additional prices for each size
  taxPercentage?: number | null;
  image?: string;
  type: "BOOLEAN" | "QUANTITY";
  excludedBranches?: string[];
  isActive?: boolean;
  categoryIds?: string[];
}

export interface AddonsResponse {
  addons: Addon[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const addonService = {
  // Get all addons with pagination and search
  getAddons: async (
    page: number = 1,
    limit: number = 10,
    search: string = "",
    sortBy: string = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
    token?: string,
    status?: "ACTIVE" | "INACTIVE" | "",
    branchId?: string
  ): Promise<AddonsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });
    if (status) {
      params.append("status", status);
    }
    if (branchId) {
      params.append("branchId", branchId);
    }

    const response = await apiService.get(`/api/addons?${params}`, token);
    return response.data;
  },

  // Get single addon by ID
  getAddonById: async (id: string, token?: string, branchId?: string): Promise<Addon> => {
    const apiService = ApiService.getInstance();
    const basePath = token ? "/api/addons" : "/api/user/addons";
    const url = branchId ? `${basePath}/${id}?branchId=${branchId}` : `${basePath}/${id}`;
    const response = await apiService.get(url, token);
    return response.data;
  },

  // Create new addon
  createAddon: async (data: AddonFormData, token?: string): Promise<Addon> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/addons", data, token);
    return response.data;
  },

  // Update addon
  updateAddon: async (
    id: string,
    data: AddonFormData,
    token?: string
  ): Promise<Addon> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/addons/${id}`, data, token);
    return response.data;
  },

  // Delete addon
  deleteAddon: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/addons/${id}`, token);
  },

  // Toggle addon status
  toggleAddonStatus: async (id: string, token?: string): Promise<Addon> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/addons/${id}/toggle-status`,
      {},
      token
    );
    return response.data;
  },

  // Get all branch prices for an addon
  getAddonBranchPrices: async (addonId: string, token?: string): Promise<AddonBranchPrice[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/addons/${addonId}/branch-prices`, token);
    return response.data;
  },

  // Create or update branch price for an addon
  upsertAddonBranchPrice: async (
    addonId: string,
    data: { branchId: string; basePrice: number; taxPercentage?: number | null },
    token?: string
  ): Promise<AddonBranchPrice> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/addons/${addonId}/branch-prices`, data, token);
    return response.data;
  },

  // Delete branch price for an addon
  deleteAddonBranchPrice: async (addonId: string, branchId: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/addons/${addonId}/branch-prices/${branchId}`, token);
  },

  // SUPER_ADMIN: Move addon to a different organization
  setAddonOrganization: async (
    id: string,
    organizationId: string,
    token?: string
  ): Promise<Addon> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/addons/${id}/organization`,
      { organizationId },
      token
    );
    return response.data;
  },

  copyAddonsToOrganization: async (
    ids: string[],
    organizationId: string,
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/addons/copy",
      { ids, organizationId },
      token
    );
    return response.data;
  },
};
