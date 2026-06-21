import ApiService from "@/src/services/apiService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LocalDbService from "./localDbService";

export type ServiceType = "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK";

export type CustomerServiceMode = "DELIVERY" | "PICKUP" | "RESERVATION";

export interface Branch {
  id: string;
  organizationId?: string | null;
  name?: string | null;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  deliveryRadius?: number | null;
  // Financial Settings
  deliveryFee?: number | null;
  deliveryRatePerKilometer?: number | null;
  useDynamicDeliveryFee?: boolean | null;
  useTieredDeliveryFee?: boolean | null;
  initialDeliveryRange?: number | null;
  initialDeliveryPrice?: number | null;
  extendedDeliveryThreshold?: number | null;
  extendedDeliveryRate?: number | null;
  enableFreeDelivery?: boolean | null;
  freeDeliveryThreshold?: number | null;
  taxPercentage?: number | null;
  deliveryTaxPercentage?: number | null;
  taxInclusive?: boolean | null;
  enableMinimumOrder?: boolean | null;
  minimumOrderAmount?: number | null;
  currency?: string | null;
  // Payment Settings
  acceptCash?: boolean | null;
  acceptCard?: boolean | null;
  acceptOnlinePayment?: boolean | null;
  // Pickup Payment Settings
  pickupAcceptCash?: boolean | null;
  pickupAcceptCard?: boolean | null;
  pickupAcceptOnlinePayment?: boolean | null;
  pickupAcceptPayPal?: boolean | null;
  // Order Settings
  orderMergeTimeframeMinutes?: number | null;
  pickupEnabled?: boolean | null;
  deliveryEnabled?: boolean | null;

  // Future Order Settings (null = inherit from global)
  futureOrdersEnabled?: boolean | null;
  enableFuturePickupOrders?: boolean | null;
  futurePickupOrderDays?: number | null;
  enableFutureDeliveryOrders?: boolean | null;
  futureDeliveryOrderDays?: number | null;

  // Scheduled Order Merge Settings (null = inherit from global)
  allowScheduledOrderMerge?: boolean | null;
  scheduledOrderMergeCutoffHours?: number | null;

  // Scheduled Order Management Settings (null = inherit from global)
  scheduledOrderAllowCancellation?: boolean | null;
  scheduledOrderCancellationWindowHours?: number | null;
  scheduledOrderFullRefundHoursBefore?: number | null;
  scheduledOrderPartialRefundHoursBefore?: number | null;
  scheduledOrderNoRefundHoursBefore?: number | null;
  scheduledOrderPartialRefundPercentage?: number | null;
  scheduledOrderReducedRefundPercentage?: number | null;
  scheduledOrderAllowModification?: boolean | null;
  scheduledOrderModificationWindowHours?: number | null;
  scheduledOrderAllowShallowModification?: boolean | null;
  scheduledOrderAutoConfirm?: boolean | null;
  scheduledOrderMinimumAmount?: number | null;

  // Scheduled Order Time Slot Settings (null = inherit from global)
  scheduledOrderTimeSlotInterval?: number | null;

  // Scheduled Order Capacity (null = inherit from global; global null = unlimited)
  scheduledOrderMaxOrdersPerSlot?: number | null;
}

export interface DeliveryCheckResult {
  available: boolean;
  branch?: Branch;
  distance?: number;
  message?: string;
}

export interface Organization {
  id: string;
  name?: string | null;
  slug?: string;
  organizationNumber?: string | null;
  isActive?: boolean;
  maxActiveBranches?: number | null;
  freeVersion?: boolean;
  reservationsAllowed?: boolean;
  onlinePaymentsAllowed?: boolean;
  cardPaymentsAllowed?: boolean;
  paypalAllowed?: boolean;
  vouchersAllowed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Validation fields
  isValidated?: boolean;
  validatedAt?: string | null;
  validatedBy?: string | null;
  validationExpiresAt?: string | null;
  validationNotes?: string | null;
  gracePeriodEndsAt?: string | null;
  validations?: OrganizationValidation[];
  validationPayments?: ValidationPayment[];
  _count?: {
    branches?: number;
    validations?: number;
    validationPayments?: number;
  };
}

export type FiskalyEnvironment = "TEST" | "LIVE";

export type OrganizationSettings = {
  id?: string;
  organizationId?: string;
  fiskalyEnabled?: boolean;
  fiskalyEnvironment?: FiskalyEnvironment;
  fiskalyApiBaseUrl?: string | null;
  fiskalyClientId?: string | null;
  fiskalyClientSecret?: string | null;
  fiskalyManagedOrganizationId?: string | null;
  fiskalyTssId?: string | null;
  fiskalyTssAdminPuk?: string | null;
  fiskalyProvisioningStatus?:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "READY"
    | "FAILED"
    | null;
  fiskalyProvisioningLastErrorCode?: string | null;
  fiskalyProvisioningLastErrorMessage?: string | null;
  fiskalyProvisionedAt?: string | null;
  // German Tax Information for DSFinV-K
  taxNumber?: string | null;
  vatId?: string | null;
  fiscalName?: string | null;
  fiscalStreet?: string | null;
  fiscalZip?: string | null;
  fiscalCity?: string | null;
  fiscalCountry?: string | null;
  createdAt?: string;
  updatedAt?: string;
} | null;

export interface OrganizationValidation {
  id: string;
  organizationId: string;
  validatedBy: string;
  validatedAt: string;
  expiresAt: string;
  gracePeriodEndsAt: string;
  notes?: string | null;
  isActive: boolean;
  unvalidatedAt?: string | null;
  unvalidatedBy?: string | null;
  requestedAt?: string | null;
  requestedBy?: string | null;
  requestNotes?: string | null;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface ValidationPayment {
  id: string;
  organizationId: string;
  validationId?: string | null;
  amount: number;
  currency: string;
  paymentMethod: "CASH_ON_DELIVERY" | "CARD_ON_DELIVERY" | "ONLINE_PAYMENT" | "CASH" | "ONLINE";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  paidAt?: string | null;
  transactionId?: string | null;
  notes?: string | null;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
}

let organizationsCache: Organization[] | null = null;
let organizationsCacheAt = 0;
let organizationsInFlight: Promise<Organization[]> | null = null;
let organizationsStorageLoaded = false;
const ORGANIZATIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const ORGANIZATIONS_CACHE_STORAGE_KEY = "nf:organizations-cache:v1";
const LEGACY_ORGANIZATIONS_CACHE_STORAGE_KEY = "bellami:organizations-cache:v1";

// Event emitter for organization changes
type OrganizationChangeListener = () => void;
const organizationChangeListeners: Set<OrganizationChangeListener> = new Set();

const loadOrganizationsFromStorage = async (): Promise<{
  data: Organization[];
  cachedAt: number;
} | null> => {
  try {
    // One-time migration from legacy 'bellami:' key to 'nf:' key
    const legacyRaw = await AsyncStorage.getItem(LEGACY_ORGANIZATIONS_CACHE_STORAGE_KEY);
    if (legacyRaw !== null) {
      await Promise.all([
        AsyncStorage.setItem(ORGANIZATIONS_CACHE_STORAGE_KEY, legacyRaw),
        AsyncStorage.removeItem(LEGACY_ORGANIZATIONS_CACHE_STORAGE_KEY),
      ]);
    }

    const raw = await AsyncStorage.getItem(ORGANIZATIONS_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      data?: Organization[];
      cachedAt?: number;
    };
    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    if (data.length === 0) return null;
    return {
      data,
      cachedAt: Number(parsed?.cachedAt || 0),
    };
  } catch {
    return null;
  }
};

const persistOrganizationsToStorage = async (
  data: Organization[],
  cachedAt: number
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      ORGANIZATIONS_CACHE_STORAGE_KEY,
      JSON.stringify({ data, cachedAt })
    );
  } catch {
    // ignore cache persistence errors
  }
};

const clearOrganizationsStorage = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ORGANIZATIONS_CACHE_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const fetchOrganizationsFromApi = async (token?: string): Promise<Organization[]> => {
  try {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/admin/organizations", token, {
      skipOrgHeader: true,
    });
    const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    const next = Array.isArray(data) ? (data as Organization[]) : [];

    // Save to SQLite
    try {
      const localDb = LocalDbService.getInstance();
      await localDb.cacheOrganizations(next.map(org => ({ id: org.id, name: org.name || "" })));
    } catch (e) {
      console.error("[branchService] Failed to cache organizations in SQLite:", e);
    }

    organizationsCache = next;
    organizationsCacheAt = Date.now();
    void persistOrganizationsToStorage(next, organizationsCacheAt);
    return next;
  } catch (error) {
    // Fail-safe SQLite Fallback
    try {
      const localDb = LocalDbService.getInstance();
      const cachedOrgs = await localDb.getCachedOrganizations();
      if (cachedOrgs.length > 0) {
        console.log("[branchService] Network failed, loaded organizations from SQLite");
        const next = cachedOrgs.map(o => ({ id: o.id, name: o.name } as Organization));
        organizationsCache = next;
        organizationsCacheAt = Date.now();
        return next;
      }
    } catch (sqliteError) {
      console.error("[branchService] Failed to load cached organizations from SQLite:", sqliteError);
    }
    throw error;
  }
};

const invalidateOrganizationsCache = () => {
  organizationsCache = null;
  organizationsCacheAt = 0;
  organizationsStorageLoaded = false;
  void clearOrganizationsStorage();
  notifyOrganizationsChanged();
};

const notifyOrganizationsChanged = () => {
  organizationChangeListeners.forEach(callback => callback());
};

const onOrganizationsChanged = (callback: OrganizationChangeListener) => {
  organizationChangeListeners.add(callback);
  return () => organizationChangeListeners.delete(callback);
};

const branchService = {
  getCachedOrganizations(): Organization[] {
    return organizationsCache ? [...organizationsCache] : [];
  },

  async prefetchOrganizations(token?: string): Promise<void> {
    try {
      await this.getOrganizations(token);
    } catch {
      // ignore prefetch errors
    }
  },

  async checkDeliveryAvailability(latitude: number, longitude: number): Promise<DeliveryCheckResult> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/user/branches/delivery-check?latitude=${latitude}&longitude=${longitude}`
    );
    return {
      available: (response as any).available ?? false,
      branch: (response as any).branch,
      distance: (response as any).distance,
      message: (response as any).message,
    } as DeliveryCheckResult;
  },

  async getBranch(id: string, token?: string): Promise<Branch> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/branches/${id}`, token);
    const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    return data as Branch;
  },

  async getBranches(
    token?: string,
    filters?: {
      serviceType?: ServiceType | null;
      serviceMode?: CustomerServiceMode | null;
      organizationId?: string | null;
    }
  ): Promise<Branch[]> {
    try {
      const apiService = ApiService.getInstance();
      let url = "/api/admin/branches";
      const params = new URLSearchParams();
      if (filters?.serviceType) params.append("serviceType", filters.serviceType);
      if (filters?.serviceMode) params.append("serviceMode", filters.serviceMode);
      if (filters?.organizationId) params.append("organizationId", filters.organizationId);
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const response = await apiService.get(url, token, {
        skipOrgHeader: Boolean(filters?.organizationId),
        headers: filters?.organizationId
          ? {
              "x-organization-id": String(filters.organizationId),
            }
          : undefined,
      });

      const branches = Array.isArray((response as any)?.data) ? (response as any).data : [];

      // Save branches to SQLite
      if (branches.length > 0) {
        try {
          const localDb = LocalDbService.getInstance();
          await localDb.cacheBranches(
            branches.map((b: any) => ({
              id: b.id,
              organizationId: b.organizationId || String(filters?.organizationId || ""),
              name: b.name || "",
              deliveryFee: b.deliveryFee,
              deliveryTaxPercentage: b.deliveryTaxPercentage,
              taxPercentage: b.taxPercentage,
              taxInclusive: b.taxInclusive,
              address: b.address,
              city: b.city,
              state: b.state,
              country: b.country,
              latitude: b.latitude,
              longitude: b.longitude,
            }))
          );
        } catch (e) {
          console.error("[branchService] Failed to cache branches in SQLite:", e);
        }
      }

      return branches as Branch[];
    } catch (error) {
      // Fail-safe SQLite Fallback
      try {
        const localDb = LocalDbService.getInstance();
        const cachedBranches = await localDb.getCachedBranches(filters?.organizationId || undefined);
        if (cachedBranches.length > 0) {
          console.log("[branchService] Network failed, loaded branches from SQLite with organization filter");
          return cachedBranches as Branch[];
        }
      } catch (sqliteError) {
        console.error("[branchService] Failed to load cached branches from SQLite:", sqliteError);
      }
      throw error;
    }
  },

  async getOrganizations(token?: string): Promise<Organization[]> {
    const now = Date.now();
    if (organizationsCache && now - organizationsCacheAt < ORGANIZATIONS_CACHE_TTL_MS) {
      return organizationsCache;
    }

    if (organizationsCache && organizationsInFlight) {
      return organizationsCache;
    }

    if (organizationsInFlight) {
      return organizationsInFlight;
    }

    if (!organizationsStorageLoaded && !organizationsCache) {
      organizationsStorageLoaded = true;
      const persisted = await loadOrganizationsFromStorage();
      if (persisted?.data?.length) {
        organizationsCache = persisted.data;
        organizationsCacheAt = persisted.cachedAt || 0;

        const isFresh =
          now - organizationsCacheAt < ORGANIZATIONS_CACHE_TTL_MS;
        if (!isFresh) {
          organizationsInFlight = (async () => {
            try {
              return await fetchOrganizationsFromApi(token);
            } finally {
              organizationsInFlight = null;
            }
          })();
        }

        return organizationsCache;
      }
    }

    organizationsInFlight = (async () => {
      try {
        return await fetchOrganizationsFromApi(token);
      } finally {
        organizationsInFlight = null;
      }
    })();

    return organizationsInFlight;
  },

  async searchOrganizations(search: string, token?: string): Promise<Organization[]> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    if (search && search.trim()) {
      params.append("search", search.trim());
    }
    const url = `/api/admin/organizations${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiService.get(url, token, {
      skipOrgHeader: true,
    });
    const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    return Array.isArray(data) ? data : [];
  },

  async getOrganizationById(
    organizationId: string,
    token?: string
  ): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/organizations/${organizationId}`,
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return (response as any)?.data as Organization;
  },

  async getOrganizationSettings(
    organizationId: string,
    token?: string
  ): Promise<OrganizationSettings> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/organizations/${organizationId}/settings`,
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return ((response as any)?.data?.data ?? (response as any)?.data ?? response) as OrganizationSettings;
  },

  async upsertOrganizationSettings(
    organizationId: string,
    data: Record<string, any>,
    token?: string
  ): Promise<OrganizationSettings> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/organizations/${organizationId}/settings`,
      data,
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return ((response as any)?.data?.data ?? (response as any)?.data ?? response) as OrganizationSettings;
  },

  /**
   * TEMPORARY: Reset all Fiskaly data for an organization.
   * Clears org-level Fiskaly settings and per-device Fiskaly client fields.
   */
  async toggleFiskalyForOrganization(
    organizationId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; data?: { fiskalyEnabled: boolean } }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/organizations/${organizationId}/fiskaly/toggle`,
      {},
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async disableFiskalyTssPermanently(
    organizationId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; data?: { fiskalyEnabled: boolean; state?: string } }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/organizations/${organizationId}/fiskaly/disable-permanent`,
      {},
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async decommissionFiskalyForOrganization(
    organizationId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; data?: { apiDeactivationSuccessful: boolean; requiresManualAction: boolean } }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/organizations/${organizationId}/fiskaly/decommission`,
      {},
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async recommissionFiskalyForOrganization(
    organizationId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; data?: { newClientId: string } }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/organizations/${organizationId}/fiskaly/recommission`,
      {},
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async verifyFiskalyStatus(
    organizationId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; data?: { status: string; state: string } }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/organizations/${organizationId}/fiskaly/verify`,
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async rotateFiskalyForOrganization(
    organizationId: string,
    token?: string
  ): Promise<{ success: boolean; message?: string; data?: OrganizationSettings }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/organizations/${organizationId}/fiskaly/rotate`,
      {},
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async updateFiskalyTaxInfo(
    organizationId: string,
    taxNumber: string,
    vatId: string,
    token?: string,
    fiscalData?: {
      fiscalName?: string;
      fiscalStreet?: string;
      fiscalZip?: string;
      fiscalCity?: string;
      fiscalCountry?: string;
    }
  ): Promise<{ success: boolean; message?: string; error?: string; data?: { taxNumber: string; vatId: string; results?: Array<{ deviceId: string; deviceName: string; success: boolean; error?: string }> } }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/organizations/${organizationId}/fiskaly/tax-info`,
      { taxNumber, vatId, ...(fiscalData || {}) },
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async verifyFiskalyTaxInfo(
    organizationId: string,
    token?: string
  ): Promise<{
    success: boolean;
    data?: {
      fiskaly: {
        tax_number: string | null;
        vat_id: string | null;
        name: string | null;
        street: string | null;
        zip: string | null;
        city: string | null;
        country_code: string | null;
      };
      local: {
        taxNumber: string | null;
        vatId: string | null;
      };
      match: {
        taxNumber: boolean;
        vatId: boolean;
      };
    };
  }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/organizations/${organizationId}/fiskaly/tax-info`,
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    return response as any;
  },

  async createOrganization(
    data: {
      name: string;
      slug?: string;
      maxActiveBranches?: number | null;
      reservationsAllowed?: boolean;
      onlinePaymentsAllowed?: boolean;
      cardPaymentsAllowed?: boolean;
      paypalAllowed?: boolean;
      vouchersAllowed?: boolean;
    },
    token?: string
  ): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/admin/organizations", data, token, {
      skipOrgHeader: true,
    });
    invalidateOrganizationsCache();
    return (response as any)?.data as Organization;
  },

  async updateOrganization(
    organizationId: string,
    data: {
      name?: string;
      isActive?: boolean;
      maxActiveBranches?: number | null;
      reservationsAllowed?: boolean;
      onlinePaymentsAllowed?: boolean;
      cardPaymentsAllowed?: boolean;
      paypalAllowed?: boolean;
      vouchersAllowed?: boolean;
    },
    token?: string
  ): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/organizations/${organizationId}`,
      data,
      token,
      { skipOrgHeader: true }
    );
    invalidateOrganizationsCache();
    return (response as any)?.data as Organization;
  },

  // ==================== ORGANIZATION VALIDATION METHODS ====================

  async getOrganizationsWithValidation(
    token: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: "validated" | "unvalidated" | "expired" | "grace_period";
    }
  ): Promise<{
    data: Organization[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    
    if (options?.page) params.append("page", String(options.page));
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.search) params.append("search", options.search);
    if (options?.status) params.append("status", options.status);
    
    const url = `/api/admin/organizations-list/validation${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiService.get(url, token, {
      skipOrgHeader: true,
    });
    
    // The response should have the structure: { success: true, data: [...], pagination: {...} }
    // But if the response is directly the array, handle that case too
    if (Array.isArray(response)) {
      // If response is directly an array, wrap it in the expected structure
      return {
        data: response,
        pagination: {
          page: options?.page || 1,
          limit: options?.limit || 20,
          total: response.length,
          totalPages: 1,
        },
      };
    }
    
    // If response has the expected structure, return it as-is
    return response || {
      data: [],
      pagination: {
        page: options?.page || 1,
        limit: options?.limit || 20,
        total: 0,
        totalPages: 0,
      },
    };
  },

  async getOrganizationValidation(organizationId: string, token: string): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/organizations/${organizationId}/validation-details`, token, {
      skipOrgHeader: true,
    });
    return (response as any)?.data;
  },

  async createValidation(
    organizationId: string,
    data: {
      expiresAt: string; // ISO date string
      amount?: number;
      currency?: string;
      paymentMethod?: "CASH" | "ONLINE";
      paymentStatus?: "PENDING" | "PAID" | "FAILED";
      notes?: string;
    },
    token: string
  ): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/admin/organizations/${organizationId}/validation-create`, data, token, {
      skipOrgHeader: true,
    });
    return (response as any)?.data;
  },

  async updateValidation(
    organizationId: string,
    validationId: string,
    data: {
      expiresAt: string; // ISO date string
      amount?: number;
      currency?: string;
      paymentMethod?: "CASH" | "ONLINE";
      paymentStatus?: "PENDING" | "PAID" | "FAILED";
      notes?: string;
    },
    token: string
  ): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}`, data, token, {
      skipOrgHeader: true,
    });
    return (response as any)?.data;
  },

  async unvalidateValidation(organizationId: string, validationId: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}/unvalidate`, {}, token, {
      skipOrgHeader: true,
    });
    return (response as any)?.data;
  },

  async reactivateValidation(organizationId: string, validationId: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}/reactivate`, {}, token, {
      skipOrgHeader: true,
    });
    return (response as any)?.data;
  },

  async getOrganizationBranchLikes(
    organizationId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    branchId?: string,
    token?: string
  ): Promise<{ success: boolean; data: any[]; pagination: any }> {
    const apiService = ApiService.getInstance();
    let url = `/api/admin/organizations/${organizationId}/branch-likes?page=${page}&limit=${limit}`;
    if (search && search.trim()) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    if (branchId) {
      url += `&branchId=${encodeURIComponent(branchId)}`;
    }
    const response = await apiService.get(url, token, {
      skipOrgHeader: true,
      headers: {
        "x-organization-id": String(organizationId),
      },
    });
    return response as any;
  },
};

export { onOrganizationsChanged };
export default branchService;
