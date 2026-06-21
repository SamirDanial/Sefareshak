import ApiService from "./apiService";

export interface Settings {
  id: string;

  // Business Information
  businessName?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessLogo?: string;
  country?: string;
  state?: string;
  city?: string;
  addressLineOne?: string;
  latitude?: number | string;
  longitude?: number | string;

  // Financial Settings
  taxPercentage: number;
  deliveryTaxPercentage: number;
  deliveryFee: number;
  enableMinimumOrder: boolean;
  minimumOrderAmount: number;
  currency: string;
  taxInclusive: boolean;

  // Order Settings
  orderPreparationTime: number;
  maxOrderQuantity: number;
  allowPreOrders: boolean;
  preOrderAdvanceTime: number;
  allowExcludeOptionalIngredients?: boolean;

  // Delivery Settings
  deliveryRadius: number;
  deliveryRatePerKilometer: number;
  useDynamicDeliveryFee: boolean;
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

  // Social Media & Contact
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface SettingsResponse {
  success: boolean;
  data: Settings;
  message?: string;
}

export class SettingsService {
  static async getSettings(token?: string): Promise<SettingsResponse> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      "/api/user/settings",
      token || undefined
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
}

