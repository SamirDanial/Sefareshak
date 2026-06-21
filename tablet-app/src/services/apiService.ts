import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const normalizeBaseUrl = (value: string): string => String(value || "").trim().replace(/\/+$/, "");

const getDevHost = (): string | null => {
  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.expoConfig?.debuggerHost ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest2?.debuggerHost;

  const candidate = String(hostUri || "").trim();
  if (!candidate) return null;
  const withoutScheme = candidate.replace(/^\w+:\/\//, "");
  const host = withoutScheme.split(":")[0]?.trim();
  if (!host) return null;
  if (host === "localhost" || host === "127.0.0.1") return null;
  return host;
};

export const API_BASE_URL = (() => {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return normalizeBaseUrl(fromEnv);

  const fromExtra = (Constants as any)?.expoConfig?.extra?.apiBaseUrl;
  if (fromExtra) return normalizeBaseUrl(fromExtra);

  if (__DEV__) {
    const host = getDevHost();
    if (host) return `http://${host}:3001`;
    if (Platform.OS === "android") return "http://10.0.2.2:3001";
    return "http://localhost:3001";
  }

  return "https://nextfoody.com";
})();

const ORG_HEADER_KEY = "x-organization-id";
const ORG_STORAGE_KEY = "nf:selectedOrganizationId";

const POS_DEVICE_HEADER_KEY = "x-pos-device-id";
const POS_DEVICE_STORAGE_KEY = "nf:selectedPosDeviceId";

type RequestOptions = {
  headers?: Record<string, string>;
  skipOrgHeader?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 30000;

class ApiService {
  private static instance: ApiService;
  private tokenRefreshPromise: Promise<string> | null = null;
  private static isLoggingOut = false;
  private static orgCacheLoaded = false;
  private static posCacheLoaded = false;
  private static cachedOrganizationId: string | null = null;
  private static cachedPosDeviceId: string | null = null;

  private constructor() {}

  public static setSelectedOrganizationIdCache(organizationId: string | null): void {
    const next = (organizationId || "").trim();
    ApiService.cachedOrganizationId = next.length > 0 ? next : null;
    ApiService.orgCacheLoaded = true;
  }

  public static getSelectedOrganizationIdCache(): string | null {
    return ApiService.cachedOrganizationId;
  }

  public static setSelectedPosDeviceIdCache(posDeviceId: string | null): void {
    const next = (posDeviceId || "").trim();
    ApiService.cachedPosDeviceId = next.length > 0 ? next : null;
    ApiService.posCacheLoaded = true;
  }

  private async ensureHeaderCacheLoaded(): Promise<void> {
    if (ApiService.orgCacheLoaded && ApiService.posCacheLoaded) return;
    try {
      const [rawOrgId, rawPosDeviceId] = await Promise.all([
        AsyncStorage.getItem(ORG_STORAGE_KEY),
        AsyncStorage.getItem(POS_DEVICE_STORAGE_KEY),
      ]);

      const orgId = (rawOrgId || "").trim();
      const posId = (rawPosDeviceId || "").trim();

      if (!ApiService.orgCacheLoaded) {
        ApiService.cachedOrganizationId = orgId.length > 0 ? orgId : null;
        ApiService.orgCacheLoaded = true;
      }
      if (!ApiService.posCacheLoaded) {
        ApiService.cachedPosDeviceId = posId.length > 0 ? posId : null;
        ApiService.posCacheLoaded = true;
      }
    } catch {
      if (!ApiService.orgCacheLoaded) {
        ApiService.cachedOrganizationId = null;
        ApiService.orgCacheLoaded = true;
      }
      if (!ApiService.posCacheLoaded) {
        ApiService.cachedPosDeviceId = null;
        ApiService.posCacheLoaded = true;
      }
    } finally {
    }
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  public static setLoggingOut(isLoggingOut: boolean): void {
    ApiService.isLoggingOut = isLoggingOut;
  }

  public static shouldPreventRequest(): boolean {
    return ApiService.isLoggingOut;
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
    } catch {
    }

    if (
      response.status === 403 &&
      String(errorData?.code || "").trim() === "POS_DEVICE_REQUIRED"
    ) {
      if (typeof __DEV__ === "undefined" || __DEV__ === false) {
        console.error("[ApiService] POS_DEVICE_REQUIRED", {
          url,
          method,
          cachedPosDeviceId: ApiService.cachedPosDeviceId,
          cachedOrganizationId: ApiService.cachedOrganizationId,
        });
      }
    }

    // Check if this is an organization selection error and downgrade to warning
    if (response.status === 400 && errorMessage.includes("Organization selection is required")) {
      console.warn("Organization selection is required - this is expected for super admins without organization");
      const error = new Error("Organization selection is required");
      (error as any).status = response.status;
      (error as any).data = errorData;
      (error as any).method = method;
      (error as any).isWarning = true;
      throw error;
    }
    
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).data = errorData;
    (error as any).method = method;
    (error as any).url = url;
    throw error;
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    token?: string,
    options?: RequestOptions,
    data?: any
  ) {
    if (ApiService.shouldPreventRequest()) {
      const e = new Error("Request cancelled during logout");
      (e as any).isCancelled = true;
      throw e;
    }

    await this.ensureHeaderCacheLoaded();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (!options?.skipOrgHeader) {
      if (ApiService.cachedOrganizationId) {
        headers[ORG_HEADER_KEY] = ApiService.cachedOrganizationId;
      }
      if (ApiService.cachedPosDeviceId) {
        headers[POS_DEVICE_HEADER_KEY] = ApiService.cachedPosDeviceId;
      }
    }

    if (method === "PUT" && url.startsWith("/api/admin/orders/")) {
    }

    const fullUrl = `${API_BASE_URL}${url}`;

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let didTimeout = false;

    let abortListener: (() => void) | null = null;
    if (options?.signal) {
      abortListener = () => controller.abort();
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", abortListener, { once: true });
      }
    }

    const timeoutId =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            didTimeout = true;
            controller.abort();
          }, timeoutMs)
        : null;

    try {
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: data !== undefined ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          const error = new Error("Your session has expired. Please log in again to continue.");
          (error as any).status = 401;
          (error as any).isAuthError = true;
          (error as any).requiresReauth = true;
          throw error;
        }

        await this.buildHttpError(response, method, url);
      }

      if (method === "DELETE") {
        return await response.json().catch(() => ({}));
      }

      return await response.json();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        if (didTimeout) {
          const e = new Error("Request timeout");
          (e as any).isTimeout = true;
          throw e;
        }
        const e = new Error("Request aborted");
        (e as any).isAborted = true;
        throw e;
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (options?.signal && abortListener) {
        try {
          options.signal.removeEventListener("abort", abortListener);
        } catch {
        }
      }
    }
  }

  async get(url: string, token?: string, options?: RequestOptions) {
    return this.request("GET", url, token, options);
  }

  async post(
    url: string,
    data?: any,
    token?: string,
    options?: RequestOptions
  ) {
    return this.request("POST", url, token, options, data);
  }

  async put(
    url: string,
    data?: any,
    token?: string,
    options?: RequestOptions
  ) {
    return this.request("PUT", url, token, options, data);
  }

  async patch(
    url: string,
    data?: any,
    token?: string,
    options?: RequestOptions
  ) {
    return this.request("PATCH", url, token, options, data);
  }

  async delete(
    url: string,
    token?: string,
    options?: RequestOptions
  ) {
    return this.request("DELETE", url, token, options);
  }

  async getUserProfile(token: string, options?: RequestOptions) {
    return this.get("/api/user/profile", token, options);
  }

  async getMyPermissions(token: string, options?: RequestOptions) {
    return this.get("/api/permissions/me", token, options);
  }

  async getSettings(token?: string, branchId?: string) {
    const params = new URLSearchParams();
    if (branchId) {
      const safe = String(branchId).trim();
      if (safe) params.set("branchId", safe);
    }
    const qs = params.toString();
    return this.get(`/api/user/settings${qs ? `?${qs}` : ""}`, token);
  }

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
    return response.json();
  }

  async autoCreateNotificationPreferences(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/tablet-notification-preferences/auto-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });
    return response.json();
  }

  async getNotificationPreferences(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/tablet-notification-preferences`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    return response.json();
  }

  async setNotificationPreference(token: string, data: { organizationId?: string; branchId?: string; enabled: boolean }) {
    const response = await fetch(`${API_BASE_URL}/api/tablet-notification-preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async deleteNotificationPreference(token: string, preferenceId: string) {
    const response = await fetch(`${API_BASE_URL}/api/tablet-notification-preferences/${preferenceId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    return response.json();
  }
}

export default ApiService;
