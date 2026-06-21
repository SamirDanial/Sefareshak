import ApiService from "./apiService";

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
  isUrgentlyClosed?: boolean;
  urgentCloseMessage?: string | null;
  urgentClosedAt?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessAddress?: string | null;
  deliveryRadius?: number | null;
  organization?: {
    id: string;
    isActive?: boolean;
    maxActiveBranches?: number | null;
    freeVersion?: boolean;
    reservationsAllowed?: boolean;
    onlinePaymentsAllowed?: boolean;
    cardPaymentsAllowed?: boolean;
    paypalAllowed?: boolean;
    settings?: {
      businessName?: string | null;
      businessLogo?: string | null;
      businessPhone?: string | null;
      businessEmail?: string | null;
      businessAddress?: string | null;
      latitude?: number | string | null;
      longitude?: number | string | null;
      serviceType?: ServiceType | null;
      appStatus?: "LIVE" | "COMING_SOON" | "MAINTENANCE" | "OUT_OF_SERVICE" | string | null;
      deliveryEnabled?: boolean | null;
      deliveryRadius?: number | string | null;
      initialDeliveryRange?: number | string | null;
    } | null;
  } | null;
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
  isActive?: boolean;
  maxActiveBranches?: number | null;
  freeVersion?: boolean;
  reservationsAllowed?: boolean;
  onlinePaymentsAllowed?: boolean;
  cardPaymentsAllowed?: boolean;
  paypalAllowed?: boolean;
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

const branchService = {
  async checkDeliveryAvailability(
    latitude: number,
    longitude: number
  ): Promise<DeliveryCheckResult> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/user/branches/delivery-check?latitude=${latitude}&longitude=${longitude}`
    );
    // The API returns { success: true, available: ..., branch: ..., distance: ..., message: ... }
    // ApiService.get() returns the JSON directly, so response is the entire object
    return {
      available: response.available ?? false,
      branch: response.branch,
      distance: response.distance,
      message: response.message,
    } as DeliveryCheckResult;
  },

  async getBranches(
    token?: string,
    filters?: {
      serviceType?: ServiceType | null;
      serviceMode?: CustomerServiceMode | null;
      radiusKm?: number | null;
      latitude?: number | null;
      longitude?: number | null;
      query?: string | null;
      organizationId?: string | null;
      organizationSlug?: string | null;
    }
  ): Promise<Branch[]> {
    const apiService = ApiService.getInstance();
    // Use public endpoint if no token.
    // If token exists, prefer admin endpoint only for SUPER_ADMIN; otherwise use staff-safe "my branches" endpoint.
    let response: any;
    if (!token) {
      const params = new URLSearchParams();
      if (filters?.serviceType) params.set("serviceType", filters.serviceType);
      if (filters?.serviceMode) params.set("serviceMode", String(filters.serviceMode));
      if (typeof filters?.radiusKm === "number" && !isNaN(filters.radiusKm) && filters.radiusKm > 0) {
        params.set("radiusKm", String(filters.radiusKm));
      }
      if (filters?.query) params.set("query", filters.query);
      if (filters?.organizationId) params.set("organizationId", filters.organizationId);
      if (filters?.organizationSlug) params.set("org", filters.organizationSlug);
      if (
        typeof filters?.latitude === "number" &&
        typeof filters?.longitude === "number" &&
        !isNaN(filters.latitude) &&
        !isNaN(filters.longitude)
      ) {
        params.set("latitude", String(filters.latitude));
        params.set("longitude", String(filters.longitude));
      }

      const url = `/api/user/branches${params.toString() ? `?${params.toString()}` : ""}`;
      response = await apiService.get(url, token, { skipOrgHeader: true });
      return response.data as Branch[];
    }

    let rbacUser: any = null;
    try {
      const permResponse = await apiService.get("/api/permissions/me", token);
      rbacUser = permResponse?.data;
    } catch {
      rbacUser = null;
    }

    if (rbacUser?.userType === "SUPER_ADMIN") {
      response = await apiService.get("/api/admin/branches", token);
      return response.data as Branch[];
    }

    const orgRole = rbacUser?.orgRole as string | null | undefined;
    const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
    if (isOrgAdmin) {
      // Org admins should see all branches in their organization.
      // /api/user/branches/my returns only assigned branches and may be empty for org admins.
      response = await apiService.get("/api/admin/branches", token);
      return response.data as Branch[];
    }

    try {
      response = await apiService.get("/api/user/branches/my", token);
    } catch {
      // If staff-safe endpoint fails unexpectedly, fall back to admin endpoint.
      response = await apiService.get("/api/admin/branches", token);
    }

    const branches = response.data as Branch[];

    // If authenticated and not SUPER_ADMIN, only show allowed branches when assigned.
    if (
      Array.isArray(rbacUser?.assignedBranchIds) &&
      rbacUser.assignedBranchIds.length > 0
    ) {
      return branches.filter(
        (b) => b?.id && rbacUser.assignedBranchIds.includes(b.id)
      );
    }

    return branches;
  },

  async getBranch(id: string, token?: string): Promise<Branch> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/branches/${id}`, token);
    return response.data as Branch;
  },

  async getOrganizations(token: string): Promise<Organization[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/admin/organizations", token, {
      skipOrgHeader: true,
    });
    return (response.data || []) as Organization[];
  },

  async getOrganizationById(
    organizationId: string,
    token: string
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
    return response.data as Organization;
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
    },
    token: string
  ): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/admin/organizations", data, token, {
      skipOrgHeader: true,
    });
    return response.data as Organization;
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
    },
    token: string
  ): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/organizations/${organizationId}`,
      data,
      token,
      { skipOrgHeader: true }
    );
    return response.data as Organization;
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
    return response.data;
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
    return response.data;
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
    return response.data;
  },

  async unvalidateValidation(organizationId: string, validationId: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}/unvalidate`, {}, token, {
      skipOrgHeader: true,
    });
    return response.data;
  },

  async reactivateValidation(organizationId: string, validationId: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}/reactivate`, {}, token, {
      skipOrgHeader: true,
    });
    return response.data;
  },

  async likeBranch(id: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    return await apiService.post(`/api/user/branches/${id}/like`, {}, token);
  },

  async unlikeBranch(id: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    return await apiService.post(`/api/user/branches/${id}/unlike`, {}, token);
  },

  async getLikedBranches(token: string): Promise<{ success: boolean; data: Branch[] }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/user/branches/liked`, token);
    return response as any;
  },
};

export default branchService;

