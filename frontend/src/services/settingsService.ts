import ApiService from "./apiService";

export type AppStatus = "LIVE" | "COMING_SOON" | "MAINTENANCE" | "OUT_OF_SERVICE";

export type ServiceType = "RESTAURANT" | "MEAT_SHOP" | "BAKERY" | "FOOD_TRUCK";

export interface Settings {
  id: string;
  organizationId?: string | null;

  // Business Information
  businessName?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  timezone?: string | null;
  serviceType?: ServiceType;
  businessLogo?: string;
  country?: string;
  state?: string;
  city?: string;
  addressLineOne?: string;
  latitude?: number | string;
  longitude?: number | string;

  // Financial Settings
  taxPercentage: number;
  serviceTaxPercentage: number;
  deliveryTaxPercentage: number;
  deliveryFee: number;
  enableMinimumOrder: boolean;
  minimumOrderAmount: number;
  currency: string;
  taxInclusive: boolean;

  // Order Settings
  orderPreparationTime: number;
  maxOrderQuantity: number;
  allowExcludeOptionalIngredients?: boolean; // Allow users to exclude optional ingredients
  orderMergeTimeframeMinutes?: number; // Minutes within which orders can be merged (default: 10)
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;

  // Future Order Settings
  futureOrdersEnabled: boolean;
  enableFuturePickupOrders: boolean;
  futurePickupOrderDays: number;
  enableFutureDeliveryOrders: boolean;
  futureDeliveryOrderDays: number;

  // Scheduled Order Merge Settings
  allowScheduledOrderMerge: boolean;
  scheduledOrderMergeCutoffHours: number;

  // Scheduled Order Management Settings (Cancellation/Modification/Refund)
  scheduledOrderAllowCancellation: boolean;
  scheduledOrderCancellationWindowHours: number;
  scheduledOrderFullRefundHoursBefore: number;
  scheduledOrderPartialRefundHoursBefore: number;
  scheduledOrderNoRefundHoursBefore: number;
  scheduledOrderPartialRefundPercentage: number;
  scheduledOrderReducedRefundPercentage: number;
  scheduledOrderAllowModification: boolean;
  scheduledOrderModificationWindowHours: number;
  scheduledOrderAllowShallowModification?: boolean;
  scheduledOrderAutoConfirm?: boolean;
  scheduledOrderMinimumAmount?: number;

  // Scheduled Order Time Slot Settings
  scheduledOrderTimeSlotInterval: number;

  // Scheduled Order Capacity (null = unlimited)
  scheduledOrderMaxOrdersPerSlot?: number | null;

  // Delivery Settings
  deliveryRadius: number;
  deliveryRatePerKilometer: number;
  useDynamicDeliveryFee: boolean;
  // Tiered Delivery Settings
  useTieredDeliveryFee?: boolean;
  initialDeliveryRange?: number;
  initialDeliveryPrice?: number;
  extendedDeliveryThreshold?: number | null;
  extendedDeliveryRate?: number | null;
  deliveryTimeEstimate: number;
  enableFreeDelivery: boolean;
  freeDeliveryThreshold: number;

  // Payment Settings
  acceptCash: boolean;
  acceptCard: boolean;
  acceptOnlinePayment: boolean;
  acceptPayPal: boolean;
  // Pickup Payment Settings
  pickupAcceptCash: boolean;
  pickupAcceptCard: boolean;
  pickupAcceptOnlinePayment: boolean;
  pickupAcceptPayPal: boolean;
  pickupTakeawayServiceFee?: number;

  // Application Status
  appStatus?: AppStatus;

  // Main Branch Configuration
  mainBranchId?: string | null; // ID of the branch to use as main branch in branch switcher

  // Social Media & Contact
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;

  // Delivery Serving Hours
  allowOrdersOutsideHours?: boolean;
  mondayIsOff?: boolean;
  mondayOpen?: string; // Deprecated: kept for backward compatibility
  mondayClose?: string; // Deprecated: kept for backward compatibility
  mondayPeriods?: Array<{ open: string; close: string }>;
  tuesdayIsOff?: boolean;
  tuesdayOpen?: string; // Deprecated
  tuesdayClose?: string; // Deprecated
  tuesdayPeriods?: Array<{ open: string; close: string }>;
  wednesdayIsOff?: boolean;
  wednesdayOpen?: string; // Deprecated
  wednesdayClose?: string; // Deprecated
  wednesdayPeriods?: Array<{ open: string; close: string }>;
  thursdayIsOff?: boolean;
  thursdayOpen?: string; // Deprecated
  thursdayClose?: string; // Deprecated
  thursdayPeriods?: Array<{ open: string; close: string }>;
  fridayIsOff?: boolean;
  fridayOpen?: string; // Deprecated
  fridayClose?: string; // Deprecated
  fridayPeriods?: Array<{ open: string; close: string }>;
  saturdayIsOff?: boolean;
  saturdayOpen?: string; // Deprecated
  saturdayClose?: string; // Deprecated
  saturdayPeriods?: Array<{ open: string; close: string }>;
  sundayIsOff?: boolean;
  sundayOpen?: string; // Deprecated
  sundayClose?: string; // Deprecated
  sundayPeriods?: Array<{ open: string; close: string }>;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface SettingsResponse {
  success: boolean;
  data: Settings;
  message?: string;
}

export interface PublicSettingsResponse {
  success: boolean;
  data: {
    allowExcludeOptionalIngredients: boolean;
    appStatus: AppStatus;
  };
  message?: string;
}

export class SettingsService {
  static async getSettings(
    token?: string,
    options?: { branchId?: string }
  ): Promise<SettingsResponse> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    if (options?.branchId) {
      params.set("branchId", options.branchId);
    }

    // Use user endpoint for all authenticated users (read-only access)
    const response = await apiService.get(
      `/api/user/settings${params.toString() ? `?${params}` : ""}`,
      token || undefined
    );
    return response;
  }

  static async getPublicSettings(options?: { branchId?: string }): Promise<PublicSettingsResponse> {
    const apiService = ApiService.getInstance();
    // Use public endpoint that doesn't require authentication
    const params = new URLSearchParams();
    if (options?.branchId) {
      params.set("branchId", options.branchId);
    }
    const response = await apiService.get(
      `/api/user/settings/public${params.toString() ? `?${params}` : ""}`
    );
    return response;
  }

  static async updateSettings(
    settings: Partial<Settings>,
    token?: string
  ): Promise<SettingsResponse> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      "/api/admin/settings",
      settings,
      token || undefined
    );
    return response;
  }

  static async resetSettings(token?: string): Promise<SettingsResponse> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/admin/settings/reset",
      {},
      token || undefined
    );
    return response;
  }

  static async assignSettingsToOrganization(
    settingsId: string,
    organizationId: string,
    token?: string
  ): Promise<SettingsResponse> {
    const apiService = ApiService.getInstance();
    const response = await apiService.put(
      `/api/admin/settings/${settingsId}/assign-organization`,
      { organizationId },
      token || undefined
    );
    return response;
  }
}
