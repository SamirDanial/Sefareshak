const normalizeOrigin = (value: string) => value.replace(/\/$/, "");

const parseEnvOrigins = (raw: unknown): string[] => {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
};

const resolveApiBaseUrl = (): string => {
  const raw = import.meta.env.VITE_API_URL as unknown;
  const candidates = parseEnvOrigins(raw);

  if (typeof window !== "undefined") {
    // Prefer same-origin in the browser so one deployment can serve multiple domains.
    const current = normalizeOrigin(window.location.origin);

    if (candidates.length === 0) return "";

    const exact = candidates.find((c) => normalizeOrigin(c) === current);
    if (exact) return exact;

    const withoutWww = current.replace(/:\/\/www\./, "://");
    const matchWithoutWww = candidates.find(
      (c) => normalizeOrigin(c).replace(/:\/\/www\./, "://") === withoutWww
    );
    if (matchWithoutWww) return matchWithoutWww;

    return candidates[0];
  }

  // Non-browser environments (SSR/tests): fall back to the first configured URL or localhost
  return candidates[0] || "http://localhost:3001";
};

const API_BASE_URL = resolveApiBaseUrl();

export const getApiBaseUrl = (): string => API_BASE_URL;

const ORG_HEADER_KEY = "x-organization-id";
const ORG_STORAGE_KEY = "bellami:selectedOrganizationId";

const getSelectedOrganizationId = (): string | null => {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
    if (!raw) return null;
    const val = raw.trim();
    return val.length > 0 ? val : null;
  } catch {
    return null;
  }
};

const parseJsonOrNull = async (response: Response) => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

class ApiService {
  private static instance: ApiService;

  private constructor() {}

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private async buildAndThrowError(response: Response) {
    let errorData: any = null;
    try {
      errorData = await parseJsonOrNull(response);
    } catch {
      errorData = { error: response.statusText || `HTTP error! status: ${response.status}` };
    }

    const error = new Error(
      errorData?.error || errorData?.message || `HTTP error! status: ${response.status}`
    ) as any;
    error.status = response.status;
    error.response = { data: errorData, status: response.status };
    throw error;
  }

  // Generic HTTP methods
  async get(
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

    // Only scope requests by organization when authenticated.
    // Public/customer endpoints should not be implicitly scoped.
    if (token && !options?.skipOrgHeader) {
      const selectedOrgId = getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      await this.buildAndThrowError(response);
    }

    return await parseJsonOrNull(response);
  }

  async post(
    url: string,
    data?: any,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {};

    // Don't set Content-Type for FormData - browser will set it with boundary
    if (!(data instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token && !options?.skipOrgHeader) {
      const selectedOrgId = getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "POST",
      headers,
      body:
        data instanceof FormData
          ? data
          : data
          ? JSON.stringify(data)
          : undefined,
    });

    if (!response.ok) {
      await this.buildAndThrowError(response);
    }

    return await parseJsonOrNull(response);
  }

  async put(
    url: string,
    data?: any,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {};

    // Don't set Content-Type for FormData - browser will set it with boundary
    if (!(data instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token && !options?.skipOrgHeader) {
      const selectedOrgId = getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "PUT",
      headers,
      body:
        data instanceof FormData
          ? data
          : data
          ? JSON.stringify(data)
          : undefined,
    });

    if (!response.ok) {
      await this.buildAndThrowError(response);
    }

    return await parseJsonOrNull(response);
  }

  async delete(
    url: string,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token && !options?.skipOrgHeader) {
      const selectedOrgId = getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      await this.buildAndThrowError(response);
    }

    return await parseJsonOrNull(response);
  }

  async patch(
    url: string,
    data?: any,
    token?: string,
    options?: { headers?: HeadersInit; skipOrgHeader?: boolean }
  ) {
    const headers: HeadersInit = {};

    // Don't set Content-Type for FormData - browser will set it with boundary
    if (!(data instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token && !options?.skipOrgHeader) {
      const selectedOrgId = getSelectedOrganizationId();
      if (selectedOrgId) {
        (headers as any)[ORG_HEADER_KEY] = selectedOrgId;
      }
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: "PATCH",
      headers,
      body:
        data instanceof FormData
          ? data
          : data
          ? JSON.stringify(data)
          : undefined,
    });

    if (!response.ok) {
      await this.buildAndThrowError(response);
    }

    return await parseJsonOrNull(response);
  }

  // Register or update user in our database
  async registerUser(userData: {
    clerkId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: string;
  }) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to register user:", error);
      throw error;
    }
  }

  // Reschedule a scheduled order (shallow modification)
  async rescheduleOrder(
    token: string,
    orderId: string,
    payload: { scheduledDate: string | null; reason?: string }
  ) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/order/${orderId}/reschedule`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to reschedule order:", error);
      throw error;
    }
  }

  // Cancel order
  async cancelOrder(
    token: string,
    orderId: string,
    payload?: { reason?: string; cancelType?: string }
  ) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/order/${orderId}/cancel`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload || {}),
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to cancel order:", error);
      throw error;
    }
  }

  // Get user profile
  async getUserProfile(token: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to get user profile:", error);
      throw error;
    }
  }

  // Update user profile
  async updateUserProfile(
    token: string,
    profileData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      description?: string;
    }
  ) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to update user profile:", error);
      throw error;
    }
  }

  // Get all categories
  async getCategories(featured?: boolean, branchId?: string) {
    try {
      const params = new URLSearchParams();
      if (featured) {
        params.append("featured", "true");
      }
      if (branchId) {
        params.append("branchId", branchId);
      }
      const url = `${API_BASE_URL}/api/user/categories${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch categories:", error);
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

      const url = `${API_BASE_URL}/api/user/deal-categories${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch deal categories:", error);
      throw error;
    }
  }

  // Get single deal category with deals
  async getDealCategory(categoryId: string, branchId?: string) {
    try {
      const url = new URL(`${API_BASE_URL}/api/user/deal-categories/${categoryId}`);
      if (branchId) {
        url.searchParams.append("branchId", branchId);
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch deal category:", error);
      throw error;
    }
  }

  // Get single deal
  async getDeal(dealId: string, branchId?: string) {
    try {
      const url = new URL(`${API_BASE_URL}/api/user/deals/${dealId}`);
      if (branchId) {
        url.searchParams.append("branchId", branchId);
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch deal:", error);
      throw error;
    }
  }

  // Get single category with meals
  async getCategory(categoryId: string, branchId?: string) {
    try {
      const url = new URL(`${API_BASE_URL}/api/user/categories/${categoryId}`);
      if (branchId) {
        url.searchParams.append("branchId", branchId);
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch category:", error);
      throw error;
    }
  }

  // Get all meals
  async getMeals(params?: {
    categoryId?: string;
    search?: string;
    featured?: boolean;
    branchId?: string;
  }) {
    try {
      const searchParams = new URLSearchParams();
      if (params?.categoryId)
        searchParams.append("categoryId", params.categoryId);
      if (params?.search) searchParams.append("search", params.search);
      if (params?.featured !== undefined)
        searchParams.append("featured", String(params.featured));
      if (params?.branchId) searchParams.append("branchId", params.branchId);

      const url = `${API_BASE_URL}/api/user/meals${
        searchParams.toString() ? `?${searchParams.toString()}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch meals:", error);
      throw error;
    }
  }

  // Get single meal
  async getMeal(mealId: string, token?: string, branchId?: string) {
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const url = new URL(`${API_BASE_URL}/api/meals/${mealId}`);
      if (branchId) {
        url.searchParams.append("branchId", branchId);
      }

      const response = await fetch(url.toString(), {
        headers,
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch meal:", error);
      throw error;
    }
  }

  // Get user addresses
  async getUserAddresses(token: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/addresses`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch user addresses:", error);
      throw error;
    }
  }

  // Add new address
  async addAddress(
    token: string,
    addressData: {
      label: string;
      street: string;
      city: string;
      state: string;
      zipCode: string;
      isDefault?: boolean;
    }
  ) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/addresses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addressData),
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to add address:", error);
      throw error;
    }
  }

  getBaseUrl() {
    return API_BASE_URL;
  }

  // Get user's active order (for merge check)
  async getActiveOrder(token: string) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/order/user/active-order`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch active order:", error);
      throw error;
    }
  }

  // Get user orders
  async getUserOrders(token: string, page = 1, limit = 10, status?: string) {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (status) {
        params.append("status", status);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/order/user/orders?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch user orders:", error);
      throw error;
    }
  }

  // Get order by ID
  async getOrderById(token: string, orderId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/order/${orderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to fetch order:", error);
      throw error;
    }
  }

  // Create Cash on Delivery order
  async createCODOrder(token: string, orderData: any) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/order/create-cod`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        await this.buildAndThrowError(response);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Failed to create COD order:", error);
      throw error;
    }
  }

  // Delivery availability check
  async checkDeliveryAvailability(latitude: number, longitude: number) {
    const response = await fetch(
      `${API_BASE_URL}/api/user/branches/delivery-check?latitude=${latitude}&longitude=${longitude}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) {
      await this.buildAndThrowError(response);
    }
    return await response.json();
  }

  // Validate cart items for a branch
  async validateCart(token: string, payload: { cartItems: any[]; branchId: string }) {
    const response = await fetch(`${API_BASE_URL}/api/order/validate-cart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      await this.buildAndThrowError(response);
    }
    return await response.json();
  }
}

export default ApiService;
