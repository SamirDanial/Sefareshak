import ApiService from "./apiService";

export interface Organization {
  id: string;
  name: string;
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
  // Validation fields (optional)
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
  };
}

export interface OrganizationValidation {
  id: string;
  organizationId: string;
  validatedBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  gracePeriodEndsAt: string;
  notes?: string | null;
  isActive?: boolean;
  unvalidatedAt?: string | null;
  unvalidatedBy?: string | null;
  // Payment fields
  amount?: number | null;
  currency?: string | null;
  paymentMethod?: "cash" | "online" | null;
  paymentStatus?: "pending" | "paid" | "failed" | null;
}

export interface ValidationPayment {
  id: string;
  organizationId: string;
  validationId?: string | null;
  amount: number;
  currency: string;
  paymentMethod: "cash" | "online";
  paymentStatus: "pending" | "paid" | "failed";
  paidAt?: string | null;
  transactionId?: string | null;
  notes?: string | null;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationReservationSettings {
  id: string;
  organizationId: string;
  isEnabled?: boolean | null;
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

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  serviceType?: "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK" | null;
  businessName?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessAddress?: string | null;
  businessLogo?: string | null;
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

export interface Branch {
  id: string;
  name: string;
  code?: string | null;
  branchImage?: string | null;
  serviceType?: "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK" | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessAddress?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  organizationId?: string | null;
  organization?: Organization | null;

  // Reservation settings overrides (null/undefined = inherit global)
  reservationIsEnabled?: boolean | null;
  reservationTier?: string | null;
  reservationMondayOpen?: string | null;
  reservationMondayClose?: string | null;
  reservationTuesdayOpen?: string | null;
  reservationTuesdayClose?: string | null;
  reservationWednesdayOpen?: string | null;
  reservationWednesdayClose?: string | null;
  reservationThursdayOpen?: string | null;
  reservationThursdayClose?: string | null;
  reservationFridayOpen?: string | null;
  reservationFridayClose?: string | null;
  reservationSaturdayOpen?: string | null;
  reservationSaturdayClose?: string | null;
  reservationSundayOpen?: string | null;
  reservationSundayClose?: string | null;
  reservationTimeSlotInterval?: number | null;
  reservationMaxGuestsPerReservation?: number | null;
  reservationMinAdvanceBookingHours?: number | null;
  reservationMaxAdvanceBookingDays?: number | null;
  reservationAllowSameDayBooking?: boolean | null;
  reservationAllowCancellation?: boolean | null;
  reservationModificationWindowHours?: number | null;
  reservationEnablePreOrder?: boolean | null;
  reservationPreOrderMinAmount?: number | string | null;
  reservationFullRefundHoursBefore?: number | null;
  reservationPartialRefundHoursBefore?: number | null;
  reservationNoRefundHoursBefore?: number | null;
  reservationMaxCapacityPerTimeSlot?: number | null;
  reservationBufferTimeMinutes?: number | null;
  reservationDepositPercentage?: number | string | null;
  reservationAllowedPaymentMethods?: string[] | null;
  reservationExcludedDates?: any;

  // A subset of settings used by Branch create/edit in admin UI
  deliveryRadius?: number | null;
  deliveryFee?: number | null;
  deliveryRatePerKilometer?: number | null;
  useDynamicDeliveryFee?: boolean | null;
  useTieredDeliveryFee?: boolean | null;
  initialDeliveryRange?: number | null;
  initialDeliveryPrice?: number | null;
  extendedDeliveryThreshold?: number | null;
  extendedDeliveryRate?: number | null;
  deliveryTimeEstimate?: number | null;
  enableFreeDelivery?: boolean | null;
  freeDeliveryThreshold?: number | null;
  taxPercentage?: number | null;
  serviceTaxPercentage?: number | null;
  deliveryTaxPercentage?: number | null;
  enableMinimumOrder?: boolean | null;
  minimumOrderAmount?: number | null;
  taxInclusive?: boolean | null;
  currency?: string | null;

  orderPreparationTime?: number | null;
  maxOrderQuantity?: number | null;
  allowExcludeOptionalIngredients?: boolean | null;
  orderMergeTimeframeMinutes?: number | null;

  pickupEnabled?: boolean | null;
  deliveryEnabled?: boolean | null;

  futureOrdersEnabled?: boolean | null;
  enableFuturePickupOrders?: boolean | null;
  futurePickupOrderDays?: number | null;
  enableFutureDeliveryOrders?: boolean | null;
  futureDeliveryOrderDays?: number | null;
  allowScheduledOrderMerge?: boolean | null;
  scheduledOrderMergeCutoffHours?: number | null;
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
  scheduledOrderTimeSlotInterval?: number | null;
  scheduledOrderMaxOrdersPerSlot?: number | null;

  acceptCash?: boolean | null;
  acceptCard?: boolean | null;
  acceptOnlinePayment?: boolean | null;
  acceptPayPal?: boolean | null;

  pickupAcceptCash?: boolean | null;
  pickupAcceptCard?: boolean | null;
  pickupAcceptOnlinePayment?: boolean | null;
  pickupAcceptPayPal?: boolean | null;
  pickupTakeawayServiceFee?: number | null;

  allowOrdersOutsideHours?: boolean | null;
  mondayIsOff?: boolean | null;
  mondayOpen?: string | null;
  mondayClose?: string | null;
  mondayPeriods?: any;
  tuesdayIsOff?: boolean | null;
  tuesdayOpen?: string | null;
  tuesdayClose?: string | null;
  tuesdayPeriods?: any;
  wednesdayIsOff?: boolean | null;
  wednesdayOpen?: string | null;
  wednesdayClose?: string | null;
  wednesdayPeriods?: any;
  thursdayIsOff?: boolean | null;
  thursdayOpen?: string | null;
  thursdayClose?: string | null;
  thursdayPeriods?: any;
  fridayIsOff?: boolean | null;
  fridayOpen?: string | null;
  fridayClose?: string | null;
  fridayPeriods?: any;
  saturdayIsOff?: boolean | null;
  saturdayOpen?: string | null;
  saturdayClose?: string | null;
  saturdayPeriods?: any;
  sundayIsOff?: boolean | null;
  sundayOpen?: string | null;
  sundayClose?: string | null;
  sundayPeriods?: any;

  facebookUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  websiteUrl?: string | null;
  appStatus?: string | null;
}

const normalizeBranchName = (b: any): string => {
  const name = (b?.name ?? "").toString().trim();
  if (name) return name;
  const code = (b?.code ?? "").toString().trim();
  if (code) return code;
  return (b?.id ?? "").toString();
};

const normalizeBranch = (b: any): Branch => {
  return {
    ...(b || {}),
    id: (b?.id ?? "").toString(),
    name: normalizeBranchName(b),
  } as Branch;
};

const branchService = {
  async getOrganizations(token: string): Promise<Organization[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/admin/organizations", token);
    return ((response as any)?.data || []) as Organization[];
  },

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
    const response = await apiService.get(url, token, { skipOrgHeader: true });

    // ApiService.get() already returns parsed JSON. Depending on backend shape we may get:
    // - { data: Organization[], pagination: {...} }
    // - { data: { data: Organization[], pagination: {...} } }
    const payload = (response as any)?.data ?? response;
    if (payload?.data && payload?.pagination) return payload as any;

    const nested = payload?.data;
    if (nested?.data && nested?.pagination) return nested as any;

    return {
      data: Array.isArray(payload) ? payload : Array.isArray(nested) ? nested : [],
      pagination: {
        page: options?.page ?? 1,
        limit: options?.limit ?? 10,
        total: Array.isArray(payload) ? payload.length : Array.isArray(nested) ? nested.length : 0,
        totalPages: 1,
      },
    };
  },

  // ==================== ORGANIZATION VALIDATION METHODS ====================

  async getOrganizationValidation(organizationId: string, token: string): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/organizations/${organizationId}/validation-details`,
      token,
      { skipOrgHeader: true }
    );
    return ((response as any)?.data ?? response) as any;
  },

  async createValidation(
    organizationId: string,
    data: {
      expiresAt: string;
      amount?: number;
      currency?: string;
      paymentMethod?: string;
      paymentStatus?: string;
      notes?: string;
    },
    token: string
  ): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/organizations/${organizationId}/validation-create`,
      data,
      token,
      { skipOrgHeader: true }
    );
    return (response as any)?.data ?? response;
  },

  async updateValidation(
    organizationId: string,
    validationId: string,
    data: {
      expiresAt: string;
      amount?: number;
      currency?: string;
      paymentMethod?: string;
      paymentStatus?: string;
      notes?: string;
    },
    token: string
  ): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/admin/organizations/${organizationId}/validation/${validationId}`,
      data,
      token,
      { skipOrgHeader: true }
    );
    return (response as any)?.data ?? response;
  },

  async unvalidateValidation(organizationId: string, validationId: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/admin/organizations/${organizationId}/validation/${validationId}/unvalidate`,
      {},
      token,
      { skipOrgHeader: true }
    );
    return (response as any)?.data ?? response;
  },

  async reactivateValidation(organizationId: string, validationId: string, token: string): Promise<any> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/admin/organizations/${organizationId}/validation/${validationId}/reactivate`,
      {},
      token,
      { skipOrgHeader: true }
    );
    return (response as any)?.data ?? response;
  },

  async getOrganizationById(organizationId: string, token: string): Promise<Organization> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/organizations/${organizationId}`, token);
    return ((response as any)?.data || null) as Organization;
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
    return ((response as any)?.data || null) as Organization;
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
    const response = await apiService.put(`/api/admin/organizations/${organizationId}`, data, token);
    return ((response as any)?.data || null) as Organization;
  },

  async getOrganizationSettings(organizationId: string, token: string): Promise<OrganizationSettings | null> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/organizations/${organizationId}/settings`, token, {
      // Backend requires org context for this endpoint. Make sure we send the org that matches the URL param.
      // Otherwise SUPER_ADMIN users can get 403 when their currently-selected org differs.
      skipOrgHeader: true,
      headers: {
        "x-organization-id": organizationId,
      },
    });
    const payload = (response as any)?.data?.data ?? (response as any)?.data ?? null;
    return (payload || null) as OrganizationSettings | null;
  },

  async upsertOrganizationSettings(
    organizationId: string,
    data: Partial<OrganizationSettings> & Record<string, any>,
    token: string
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
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    const payload = (response as any)?.data?.data ?? (response as any)?.data ?? null;
    return (payload || null) as OrganizationReservationSettings | null;
  },

  async upsertOrganizationReservationSettings(
    organizationId: string,
    data: Partial<OrganizationReservationSettings> & Record<string, any>,
    token: string
  ): Promise<OrganizationReservationSettings> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/organizations/${organizationId}/reservation-settings`,
      data,
      token,
      {
        skipOrgHeader: true,
        headers: {
          "x-organization-id": organizationId,
        },
      }
    );
    const payload = (response as any)?.data?.data ?? (response as any)?.data;
    return payload as OrganizationReservationSettings;
  },

  async uploadImage(file: File, token?: string): Promise<{ filename: string }> {
    const apiService = ApiService.getInstance();
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiService.post("/api/upload/image", formData, token);
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

  async getBranches(token?: string): Promise<Branch[]> {
    const apiService = ApiService.getInstance();

    if (!token) {
      const response = await apiService.get("/api/user/branches", token, {
        skipOrgHeader: true,
      });
      return (((response as any)?.data || []) as any[]).map(normalizeBranch);
    }

    let rbacUser: any = null;
    try {
      const permResponse = await apiService.get("/api/permissions/me", token);
      rbacUser = (permResponse as any)?.data;
    } catch {
      rbacUser = null;
    }

    const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";

    try {
      const response = await apiService.get(
        rbacUser?.userType === "SUPER_ADMIN" || isOrgAdmin
          ? "/api/admin/branches"
          : "/api/user/branches/my",
        token
      );

      const branches = (((response as any)?.data || []) as any[]).map(normalizeBranch);
      if (
        Array.isArray(rbacUser?.assignedBranchIds) &&
        rbacUser.assignedBranchIds.length > 0 &&
        rbacUser?.userType !== "SUPER_ADMIN"
      ) {
        return branches.filter((b) => b?.id && rbacUser.assignedBranchIds.includes(b.id));
      }

      return branches;
    } catch {
      const canUseAdminBranches = rbacUser?.userType === "SUPER_ADMIN" || isOrgAdmin;

      if (canUseAdminBranches) {
        const response = await apiService.get("/api/admin/branches", token);
        return (((response as any)?.data || []) as any[]).map(normalizeBranch);
      }

      try {
        const response = await apiService.get("/api/user/branches/my", token, {
          skipOrgHeader: true,
        });
        return (((response as any)?.data || []) as any[]).map(normalizeBranch);
      } catch {
        const response = await apiService.get("/api/user/branches", token, {
          skipOrgHeader: true,
        });
        return (((response as any)?.data || []) as any[]).map(normalizeBranch);
      }
    }
  },

  async getAdminBranches(token: string): Promise<Branch[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get("/api/admin/branches", token);
    return (((response as any)?.data || []) as any[]).map(normalizeBranch);
  },

  async getBranch(id: string, token?: string): Promise<Branch> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/branches/${id}`, token);
    return normalizeBranch((response as any)?.data || null);
  },

  async createBranch(data: Partial<Branch>, token?: string): Promise<Branch> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/admin/branches", data, token);
    return normalizeBranch((response as any)?.data || null);
  },

  async updateBranch(id: string, data: Partial<Branch>, token?: string): Promise<Branch> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(`/api/admin/branches/${id}`, data, token);
    return normalizeBranch((response as any)?.data || null);
  },

  async deleteBranch(id: string, token?: string): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/admin/branches/${id}`, token);
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
    return normalizeBranch((response as any)?.data || null);
  },
};

export default branchService;
