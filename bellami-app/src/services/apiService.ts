import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

const ORG_HEADER_KEY = "x-organization-id";
const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

class ApiService {
  private static instance: ApiService;

  private constructor() {}

  private async getSelectedBranchId(): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem("bellami:selectedBranch");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      const id = typeof parsed?.id === "string" ? parsed.id.trim() : "";
      return id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

  private async getSelectedOrganizationId(): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem(ORG_STORAGE_KEY);
      const val = (raw || "").trim();
      return val.length > 0 ? val : null;
    } catch {
      return null;
    }
  }

  private async ensurePublicBranchScope(): Promise<string | null> {
    const existingBranchId = await this.getSelectedBranchId();
    if (existingBranchId) return existingBranchId;

    try {
      const response = await this.get("/api/user/branches", undefined, {
        skipOrgHeader: true,
      });

      const branches = Array.isArray((response as any)?.data) ? (response as any).data : [];
      const firstActive = branches.find((b: any) => b && b.isActive !== false && b.id);
      const branchId = typeof firstActive?.id === "string" ? firstActive.id.trim() : "";
      if (!branchId) return null;

      try {
        await AsyncStorage.setItem(
          "bellami:selectedBranch",
          JSON.stringify({ id: branchId, name: firstActive?.name ?? null, distanceKm: null })
        );
      } catch {
        // ignore
      }

      const orgId = typeof firstActive?.organizationId === "string" ? firstActive.organizationId.trim() : "";
      if (orgId) {
        try {
          await AsyncStorage.setItem(ORG_STORAGE_KEY, orgId);
        } catch {
          // ignore
        }
      }

      return branchId;
    } catch {
      return null;
    }
  }

  private async buildHttpError(response: Response, method: string, url: string) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    let errorData: any = null;
    try {
      errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // ignore json parsing issues
    }

    console.error(`[ApiService] ${method} ${url} failed`, {
      status: response.status,
      data: errorData,
    });

    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).data = errorData;
    (error as any).response = { data: errorData, status: response.status };
    (error as any).method = method;
    (error as any).url = url;
    throw error;
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  // Generic HTTP methods
  async get(
    url: string,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean; skipCacheBust?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (!options?.skipOrgHeader) {
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    // Add cache-busting timestamp for iOS to prevent aggressive URLSession caching
    const finalUrl = options?.skipCacheBust
      ? url
      : `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;

    const response = await fetch(`${API_BASE_URL}${finalUrl}`, {
      method: "GET",
      headers: {
        ...headers,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      let errorData: any = null;
      try {
        errorData = await response.json();
        if (errorData?.error) {
          errorMessage = errorData.error;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
      }
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).data = errorData;
      (error as any).response = { data: errorData, status: response.status };
      throw error;
    }

    return await response.json();
  }

  async post(
    url: string,
    data?: any,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (!options?.skipOrgHeader) {
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "POST",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      let errorData: any = null;
      try {
        errorData = await response.json();
        if (errorData?.error) {
          errorMessage = errorData.error;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // If response is not JSON, use default error message
      }
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).data = errorData;
      (error as any).response = { data: errorData, status: response.status };
      throw error;
    }

    return await response.json();
  }

  async put(
    url: string,
    data?: any,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (!options?.skipOrgHeader) {
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "PUT",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      await this.buildHttpError(response, "PUT", url);
    }

    return await response.json();
  }

  async delete(
    url: string,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (!options?.skipOrgHeader) {
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      await this.buildHttpError(response, "DELETE", url);
    }

    return await response.json();
  }

  async patch(
    url: string,
    data?: any,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (!options?.skipOrgHeader) {
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "PATCH",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      await this.buildHttpError(response, "PATCH", url);
    }

    return await response.json();
  }

  // User-specific methods
  async registerUser(data: {
    clerkId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/api/user/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async getUserProfile(token: string) {
    try {
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }

      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to get user profile:", error);
      throw error;
    }
  }

  // Get deal categories (categories that contain deals)
  async getDealCategories(featured?: boolean, branchId?: string) {
    try {
      const params = new URLSearchParams();
      if (featured) {
        params.append("featured", "true");
      }
      if (branchId) {
        params.append("branchId", branchId);
      }

      const url = `/api/user/deal-categories${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await this.get(url);
      return response;
    } catch (error) {
      console.error("Failed to fetch deal categories:", error);
      throw error;
    }
  }

  // Get single deal category with deals
  async getDealCategory(categoryId: string, branchId?: string, bypassLocationFilter?: boolean) {
    try {
      const params = new URLSearchParams();
      if (branchId) {
        params.append("branchId", branchId);
      }
      if (bypassLocationFilter) {
        params.append("bypassLocationFilter", "true");
      }

      const url = `/api/user/deal-categories/${categoryId}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await this.get(url);
      return response;
    } catch (error) {
      console.error("Failed to fetch deal category:", error);
      throw error;
    }
  }

  // Get single deal
  async getDeal(dealId: string, branchId?: string) {
    try {
      const params = new URLSearchParams();
      if (branchId) {
        params.append("branchId", branchId);
      }

      const url = `/api/user/deals/${dealId}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await this.get(url);
      return response;
    } catch (error) {
      console.error("Failed to fetch deal:", error);
      throw error;
    }
  }

  async getUserOrders(token: string, page = 1, limit = 10) {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/order/user/orders?${params}`,
        {
          headers,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to get user orders:", error);
      throw error;
    }
  }

  async cancelOrder(
    token: string,
    orderId: string,
    data?: {
      cancelType?: string;
      reason?: string;
    }
  ) {
    return await this.patch(`/api/order/${orderId}/cancel`, data, token);
  }

  async rescheduleOrder(
    token: string,
    orderId: string,
    data: {
      scheduledDate: string | null;
      reason?: string;
    }
  ) {
    return await this.patch(`/api/order/${orderId}/reschedule`, data, token);
  }

  async updateProfile(
    token: string,
    profileData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      description?: string;
    }
  ) {
    try {
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }

      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to update profile:", error);
      throw error;
    }
  }

  async getSettings(token?: string, branchId?: string) {
    try {
      const headers: HeadersInit = {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      };

      if (token) {
        const selectedOrgId = await this.getSelectedOrganizationId();
        if (selectedOrgId) {
          (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
        }
      }

      const params = new URLSearchParams();
      if (branchId) {
        const safe = String(branchId).trim();
        if (safe) params.set("branchId", safe);
      }
      const qs = params.toString();

      // Use /api/user/settings for all authenticated users (read-only access)
      // This endpoint is available to both admin and normal users
      const response = await fetch(`${API_BASE_URL}/api/user/settings${qs ? `?${qs}` : ""}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to get settings:", error);
      throw error;
    }
  }

  async getPublicSettings() {
    try {
      // Use public endpoint that doesn't require authentication
      // Returns allowExcludeOptionalIngredients, appStatus, and currency
      const response = await fetch(`${API_BASE_URL}/api/user/settings/public`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to get public settings:", error);
      throw error;
    }
  }

  async getAddonById(id: string, token?: string, branchId?: string) {
    try {
      const params = new URLSearchParams();
      if (branchId) {
        params.append("branchId", branchId);
      }
      const url = `/api/addons/${id}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await this.get(url, token);
      return response.data || response;
    } catch (error) {
      console.error("Failed to get addon:", error);
      throw error;
    }
  }

  // Get user's active order (for merge check)
  async getActiveOrder(token: string) {
    try {
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const selectedOrgId = await this.getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/order/user/active-order`,
        {
          headers,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch active order:", error);
      throw error;
    }
  }

  async getCategories(featured?: boolean, branchId?: string, bypassLocationFilter?: boolean) {
    try {
      const params = new URLSearchParams();
      if (featured) {
        params.append("featured", "true");
      }

      const effectiveBranchId =
        typeof branchId === "string" && branchId.trim().length > 0
          ? branchId.trim()
          : await this.ensurePublicBranchScope();

      if (effectiveBranchId) {
        params.append("branchId", effectiveBranchId);
      }
      if (bypassLocationFilter) {
        params.append("bypassLocationFilter", "true");
      }
      const url = `/api/user/categories${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await this.get(url);

      return response;
    } catch (error) {
      console.error("Failed to fetch categories:", error);
      throw error;
    }
  }

  async getMeals(params?: {
    categoryId?: string;
    search?: string;
    featured?: boolean;
    branchId?: string;
    bypassLocationFilter?: boolean;
  }) {
    try {
      const searchParams = new URLSearchParams();
      if (params?.categoryId)
        searchParams.append("categoryId", params.categoryId);
      if (params?.search) searchParams.append("search", params.search);
      if (params?.featured !== undefined)
        searchParams.append("featured", String(params.featured));
      if (params?.branchId) searchParams.append("branchId", params.branchId);
      if (params?.bypassLocationFilter) searchParams.append("bypassLocationFilter", "true");

      const url = `/api/user/meals${
        searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;

      const response = await this.get(url);
      return response;
    } catch (error) {
      console.error("Failed to fetch meals:", error);
      throw error;
    }
  }

  async getMealById(id: string, branchId?: string, token?: string) {
    try {
      const params = new URLSearchParams();
      if (branchId) {
        params.append("branchId", branchId);
      }
      const url = `/api/user/meals/${id}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await this.get(url, token);
      return response.data || response;
    } catch (error) {
      console.error("Failed to get meal:", error);
      throw error;
    }
  }

  getBaseUrl() {
    return API_BASE_URL;
  }
}

export default ApiService;
