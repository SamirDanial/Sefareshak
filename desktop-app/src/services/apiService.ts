// API service for desktop app
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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

type RequestOptions = {
  headers?: HeadersInit;
  skipOrgHeader?: boolean;
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

  // Generic HTTP methods
  async get(url: string, token?: string, options?: RequestOptions) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (options?.headers) {
      Object.assign(headers as any, options.headers as any);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

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
      const errorBody = await parseJsonOrNull(response);
      const error = new Error(
        (errorBody as any)?.error ||
          (errorBody as any)?.message ||
          `HTTP error! status: ${response.status}`
      ) as any;
      error.status = response.status;
      error.response = { data: errorBody, status: response.status };
      throw error;
    }

    return await parseJsonOrNull(response);
  }

  async post(url: string, data?: any, token?: string, options?: RequestOptions) {
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
      const errorBody = await parseJsonOrNull(response);
      const error = new Error(
        (errorBody as any)?.error ||
          (errorBody as any)?.message ||
          `HTTP error! status: ${response.status}`
      ) as any;
      error.status = response.status;
      error.response = { data: errorBody, status: response.status };
      throw error;
    }

    return await parseJsonOrNull(response);
  }

  async put(url: string, data?: any, token?: string, options?: RequestOptions) {
    const headers: HeadersInit = {};

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
      const errorBody = await parseJsonOrNull(response);
      const error = new Error(
        (errorBody as any)?.error ||
          (errorBody as any)?.message ||
          `HTTP error! status: ${response.status}`
      ) as any;
      error.status = response.status;
      error.response = { data: errorBody, status: response.status };
      throw error;
    }

    return await parseJsonOrNull(response);
  }

  async patch(url: string, data?: any, token?: string, options?: RequestOptions) {
    const headers: HeadersInit = {};

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
      const errorBody = await parseJsonOrNull(response);
      const error = new Error(
        (errorBody as any)?.error ||
          (errorBody as any)?.message ||
          `HTTP error! status: ${response.status}`
      ) as any;
      error.status = response.status;
      error.response = { data: errorBody, status: response.status };
      throw error;
    }

    return await parseJsonOrNull(response);
  }

  async delete(url: string, token?: string, options?: RequestOptions) {
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
      const errorBody = await parseJsonOrNull(response);
      const error = new Error(
        (errorBody as any)?.error ||
          (errorBody as any)?.message ||
          `HTTP error! status: ${response.status}`
      ) as any;
      error.status = response.status;
      error.response = { data: errorBody, status: response.status };
      throw error;
    }

    return await parseJsonOrNull(response);
  }

  // Register user with backend
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
        const errorBody = await parseJsonOrNull(response);
        const error = new Error(
          (errorBody as any)?.error ||
            (errorBody as any)?.message ||
            `HTTP error! status: ${response.status}`
        );
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to register user:", error);
      throw error;
    }
  }

  // Get user profile from backend
  async getUserProfile(token: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await parseJsonOrNull(response);
        const error = new Error(
          (errorBody as any)?.error ||
            (errorBody as any)?.message ||
            `HTTP error! status: ${response.status}`
        ) as any;
        error.status = response.status;
        error.response = { data: errorBody, status: response.status };
        throw error;
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error("Failed to fetch user profile:", error);
      console.error("Error type:", error?.constructor?.name);
      console.error("Error message:", error?.message);
      throw error;
    }
  }
}

export default ApiService;

