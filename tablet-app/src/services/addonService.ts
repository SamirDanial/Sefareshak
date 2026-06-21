import ApiService from "@/src/services/apiService";

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
  sku?: string | null; // Article number for DSFinV-K export
  price?: string; // Base price (DEPRECATED: Use addonSizes instead)
  taxPercentage: number | null;
  image: string | null;
  type: "BOOLEAN" | "QUANTITY";
  isActive: boolean;
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

export interface AddonSizeFormData {
  sizeType: "S" | "M" | "L" | "XL";
  price: number; // Additional price (base price + this = total)
  taxPercentage?: number | null;
}

export interface AddonFormData {
  name: string;
  description?: string;
  sku?: string | null; // Article number for DSFinV-K export
  price: number; // Base price
  sizes: AddonSizeFormData[]; // Additional prices for each size
  taxPercentage?: number | null;
  image?: string;
  type: "BOOLEAN" | "QUANTITY";
  isActive?: boolean;
  categoryIds?: string[];
  excludedBranches?: string[];
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
  };
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
    status?: "ACTIVE" | "INACTIVE" | ""
  ): Promise<AddonsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search,
      sortBy,
      sortOrder,
    });
    if (status) params.append("status", status);

    const response = await apiService.get(`/api/addons?${params}`, token);
    return response.data;
  },

  // Get single addon by ID
  getAddonById: async (id: string, token?: string): Promise<Addon> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/addons/${id}`, token);
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
