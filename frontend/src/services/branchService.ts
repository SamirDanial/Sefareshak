import ApiService from "./apiService";



export type ServiceType = "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK";



export type CustomerServiceMode = "DELIVERY" | "PICKUP" | "RESERVATION";



export interface Branch {

  id: string;

  name?: string | null;

  code?: string | null;

  branchImage?: string | null;

  serviceType?: ServiceType | null;

  address?: string | null;

  city?: string | null;

  state?: string | null;

  country?: string | null;

  timezone?: string | null;

  latitude?: number | null;

  longitude?: number | null;

  isActive?: boolean;

  isUrgentlyClosed?: boolean;

  urgentCloseMessage?: string | null;

  urgentClosedAt?: string | null;

  urgentClosedByUserId?: string | null;

  businessPhone?: string | null;

  businessEmail?: string | null;

  businessAddress?: string | null;

  organizationId?: string | null;

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

      deliveryEnabled?: boolean | null;

      deliveryRadius?: number | string | null;

      initialDeliveryRange?: number | string | null;

    } | null;

  } | null;

  branchTypeId?: string | null;

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

  serviceTaxPercentage?: number | null;

  deliveryTaxPercentage?: number | null;

  taxInclusive?: boolean | null;

  enableMinimumOrder?: boolean | null;

  minimumOrderAmount?: number | null;

  currency?: string | null;

  // Payment Settings

  acceptCash?: boolean | null;

  acceptCard?: boolean | null;

  acceptOnlinePayment?: boolean | null;

  acceptPayPal?: boolean | null;

  pickupAcceptCash?: boolean | null;

  pickupAcceptCard?: boolean | null;

  pickupAcceptOnlinePayment?: boolean | null;

  pickupAcceptPayPal?: boolean | null;

  pickupTakeawayServiceFee?: number | null;

  // Order Settings

  orderMergeTimeframeMinutes?: number | null; // Branch-specific override (null = inherit from global)

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



export interface Organization {

  id: string;

  name: string;

  slug: string;

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

  paymentMethod: "CASH_ON_DELIVERY" | "CARD_ON_DELIVERY" | "ONLINE_PAYMENT";

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



export interface OrganizationReservationSettings {

  id: string;

  organizationId: string;

  isEnabled?: boolean;

  tier?: string | null;

  mondayOpen?: string | null;

  mondayClose?: string | null;

  tuesdayOpen?: string | null;

  tuesdayClose?: string | null;

  wednesdayOpen?: string | null;

  wednesdayClose?: string | null;

  thursdayOpen?: string | null;

  thursdayClose?: string | null;

  fridayOpen?: string | null;

  fridayClose?: string | null;

  saturdayOpen?: string | null;

  saturdayClose?: string | null;

  sundayOpen?: string | null;

  sundayClose?: string | null;

  timeSlotInterval?: number | null;

  maxGuestsPerReservation?: number | null;

  minAdvanceBookingHours?: number | null;

  maxAdvanceBookingDays?: number | null;

  allowSameDayBooking?: boolean | null;

  allowCancellation?: boolean | null;

  modificationWindowHours?: number | null;

  enablePreOrder?: boolean | null;

  preOrderMinAmount?: number | string | null;

  fullRefundHoursBefore?: number | null;

  partialRefundHoursBefore?: number | null;

  noRefundHoursBefore?: number | null;

  maxCapacityPerTimeSlot?: number | null;

  bufferTimeMinutes?: number | null;

  excludedDates?: any;

  depositPercentage?: number | string | null;

  allowedPaymentMethods?: string[] | null;

  createdAt?: string;

  updatedAt?: string;

}



export interface BranchType {

  id: string;

  name: string;

  slug: string;

}



export interface OrganizationSettings {

  id: string;

  organizationId: string;

  businessName?: string | null;

  businessEmail?: string | null;

  businessPhone?: string | null;

  businessAddress?: string | null;

  businessLogo?: string | null;

  serviceType?: ServiceType | null;

  currency?: string | null;

  taxPercentage?: number | string | null;

  serviceTaxPercentage?: number | string | null;

  deliveryTaxPercentage?: number | string | null;

  taxInclusive?: boolean | null;

  appStatus?: string | null;

  allowExcludeOptionalIngredients?: boolean | null;

  orderMergeTimeframeMinutes?: number | null;

  createdAt?: string;

  updatedAt?: string;

}



export interface DeliveryCheckResult {

  available: boolean;

  branch?: Branch;

  distance?: number;

  message?: string;

}



const branchService = {

  async uploadImage(file: File, token?: string): Promise<{ filename: string }> {

    const apiService = ApiService.getInstance();

    const formData = new FormData();

    formData.append("image", file);

    const response = await apiService.post("/api/upload/image", formData, token);

    // ApiService returns parsed JSON. Upload API returns: { success: true, data: { filename: string, ... } }

    const filename =

      (response as any)?.data?.filename ||

      (response as any)?.data?.data?.filename ||

      (response as any)?.filename;

    if (!filename) {

      throw new Error(

        (response as any)?.message ||

          (response as any)?.error ||

          "Failed to upload image"

      );

    }

    return { filename };

  },



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

      organizationId?: string | null;

      organizationSlug?: string | null;

      query?: string | null;

    }

  ): Promise<Branch[]> {

    const apiService = ApiService.getInstance();



    // Use public endpoint if no token.

    // If token exists, prefer admin endpoint but fall back to staff-safe "my branches" endpoint

    let response: any;

    if (!token) {

      const params = new URLSearchParams();

      if (filters?.serviceType) params.set("serviceType", filters.serviceType);

      if (filters?.serviceMode) params.set("serviceMode", String(filters.serviceMode));

      if (typeof filters?.radiusKm === "number" && !isNaN(filters.radiusKm) && filters.radiusKm > 0) {

        params.set("radiusKm", String(filters.radiusKm));

      }

      if (filters?.query && String(filters.query).trim()) params.set("q", String(filters.query).trim());

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

      // Public branch listing must NOT be scoped by x-organization-id.

      // Customers should see branches from all organizations.

      response = await apiService.get(url, token, {

        skipOrgHeader: true,

      });

      return response.data as Branch[];

    } else {

      let rbacUser: any = null;

      try {

        const permResponse = await apiService.get("/api/permissions/me", token);

        rbacUser = permResponse?.data;

      } catch {

        rbacUser = null;

      }



      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";

      if (rbacUser?.userType === "SUPER_ADMIN" || isOrgAdmin) {

        response = await apiService.get("/api/admin/branches", token);

      } else {

        try {

          response = await apiService.get("/api/user/branches/my", token);

        } catch (e: any) {

          // If staff-safe endpoint fails unexpectedly, fall back to admin endpoint.

          response = await apiService.get("/api/admin/branches", token);

        }

      }

    }



    const branches = response.data as Branch[];



    // If authenticated and not SUPER_ADMIN, only show allowed branches when assigned.

    // This keeps branch filter dropdowns consistent across admin pages.

    if (token) {

      try {

        const permResponse = await apiService.get("/api/permissions/me", token);

        const rbacUser = permResponse?.data;

        if (

          Array.isArray(rbacUser?.assignedBranchIds) &&

          rbacUser.assignedBranchIds.length > 0

        ) {

          if (rbacUser?.userType === "SUPER_ADMIN") return branches;

          return branches.filter((b) => b?.id && rbacUser.assignedBranchIds.includes(b.id));

        }

      } catch {

        // If permission fetch fails, fall back to unfiltered list

      }

    }



    return branches;

  },



  async getBranch(id: string, token?: string): Promise<Branch> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get(`/api/admin/branches/${id}`, token);

    return response.data as Branch;

  },



  async createBranch(data: Partial<Branch>, token?: string): Promise<Branch> {

    const apiService = ApiService.getInstance();

    const response = await apiService.post("/api/admin/branches", data, token);

    return response.data as Branch;

  },



  async updateBranch(

    id: string,

    data: Partial<Branch>,

    token?: string

  ): Promise<Branch> {

    const apiService = ApiService.getInstance();

    const response = await apiService.put(

      `/api/admin/branches/${id}`,

      data,

      token

    );

    return response.data as Branch;

  },



  async deleteBranch(id: string, token?: string): Promise<void> {

    const apiService = ApiService.getInstance();

    await apiService.delete(`/api/admin/branches/${id}`, token);

  },



  async getOrganizations(token: string): Promise<Organization[]> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get("/api/admin/organizations", token);

    return (response.data || []) as Organization[];

  },



  async getOrganizationById(organizationId: string, token: string): Promise<Organization> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get(`/api/admin/organizations/${organizationId}`, token);

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

    const response = await apiService.post("/api/admin/organizations", data, token);

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

      token

    );

    return response.data as Organization;

  },



  async getOrganizationSettings(

    organizationId: string,

    token: string

  ): Promise<OrganizationSettings | null> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get(

      `/api/admin/organizations/${organizationId}/settings`,

      token

    );

    const payload =

      (response as any)?.data?.data ?? (response as any)?.data ?? null;

    return (payload || null) as OrganizationSettings | null;

  },



  async upsertOrganizationSettings(

    organizationId: string,

    data: Partial<OrganizationSettings>,

    token: string

  ): Promise<OrganizationSettings> {

    const apiService = ApiService.getInstance();

    const response = await apiService.put(

      `/api/admin/organizations/${organizationId}/settings`,

      data,

      token

    );

    const payload = (response as any)?.data?.data ?? (response as any)?.data;

    return payload as OrganizationSettings;

  },



  async getOrganizationReservationSettings(

    organizationId: string,

    token: string

  ): Promise<OrganizationReservationSettings | null> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get(

      `/api/admin/organizations/${organizationId}/reservation-settings`,

      token

    );

    const payload =

      (response as any)?.data?.data ?? (response as any)?.data ?? null;

    return (payload || null) as OrganizationReservationSettings | null;

  },



  async upsertOrganizationReservationSettings(

    organizationId: string,

    data: Partial<OrganizationReservationSettings>,

    token: string

  ): Promise<OrganizationReservationSettings> {

    const apiService = ApiService.getInstance();

    const response = await apiService.put(

      `/api/admin/organizations/${organizationId}/reservation-settings`,

      data,

      token

    );

    const payload = (response as any)?.data?.data ?? (response as any)?.data;

    return payload as OrganizationReservationSettings;

  },



  async getBranchTypes(token: string): Promise<BranchType[]> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get("/api/admin/branch-types", token);

    return (response.data || []) as BranchType[];

  },



  async createBranchType(

    data: { name: string; slug?: string },

    token: string

  ): Promise<BranchType> {

    const apiService = ApiService.getInstance();

    const response = await apiService.post("/api/admin/branch-types", data, token);

    return response.data as BranchType;

  },



  async getUnassignedBranches(token: string): Promise<Branch[]> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get(

      "/api/admin/branches/unassigned-organization",

      token

    );

    return (response.data || []) as Branch[];

  },



  async setBranchOrganization(

    branchId: string,

    organizationId: string | null,

    token: string

  ): Promise<Branch> {

    const apiService = ApiService.getInstance();

    const response = await apiService.patch(

      `/api/admin/branches/${branchId}/organization`,

      { organizationId },

      token

    );

    return response.data as Branch;

  },



  async setBranchType(

    branchId: string,

    branchTypeId: string | null,

    token: string

  ): Promise<Branch> {

    const apiService = ApiService.getInstance();

    const response = await apiService.patch(

      `/api/admin/branches/${branchId}/branch-type`,

      { branchTypeId },

      token

    );

    return response.data as Branch;

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

    const response = await apiService.get(url, token);

    

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

    const response = await apiService.get(`/api/admin/organizations/${organizationId}/validation-details`, token);

    return response.data;

  },



  async createValidation(

    organizationId: string,

    data: {

      expiresAt: string; // ISO date string

      amount?: number;

      currency?: string;

      paymentMethod?: "CASH" | "ONLINE";

      notes?: string;

    },

    token: string

  ): Promise<any> {

    const apiService = ApiService.getInstance();

    const response = await apiService.post(`/api/admin/organizations/${organizationId}/validation-create`, data, token);

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

      notes?: string;

    },

    token: string

  ): Promise<any> {

    const apiService = ApiService.getInstance();

    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}`, data, token);

    return response.data;

  },



  async unvalidateValidation(organizationId: string, validationId: string, token: string): Promise<any> {

    const apiService = ApiService.getInstance();

    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}/unvalidate`, {}, token);

    return response.data;

  },



  async reactivateValidation(organizationId: string, validationId: string, token: string): Promise<any> {

    const apiService = ApiService.getInstance();

    const response = await apiService.patch(`/api/admin/organizations/${organizationId}/validation/${validationId}/reactivate`, {}, token);

    return response.data;

  },



  async checkOrganizationValidity(organizationId: string): Promise<{

    isValid: boolean;

    status: "valid" | "expired" | "grace_period" | "unvalidated";

    organization: {

      id: string;

      name: string;

      slug: string;

    };

    validationDetails: {

      isValidated: boolean;

      validationExpiresAt?: string;

      gracePeriodEndsAt?: string;

    };

  }> {

    const apiService = ApiService.getInstance();

    const response = await apiService.get(`/api/admin/public/organizations/${organizationId}/validity`);

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





