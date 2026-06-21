const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://nextfoody.com";

export interface DayHours {
  isOff: boolean;
  open?: string; // Deprecated: kept for backward compatibility
  close?: string; // Deprecated: kept for backward compatibility
  periods?: Array<{ open: string; close: string }>;
}

export interface DeliveryHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface ServingHoursStatus {
  isOpen: boolean;
  isOff: boolean;
  message?: string;
  nextOpenTime?: string;
  currentDayHours?: DayHours;
  hoursUntilOpen?: number;
  minutesUntilOpen?: number;
  nextOpenDay?: string;
  nextOpenTimeString?: string;
}

export interface ServingHoursResponse {
  success: boolean;
  data: {
    hours: DeliveryHours;
    allowOrdersOutsideHours: boolean;
    currentStatus: ServingHoursStatus;
  };
}

class ServingHoursService {
  private static instance: ServingHoursService;

  private constructor() {}

  public static getInstance(): ServingHoursService {
    if (!ServingHoursService.instance) {
      ServingHoursService.instance = new ServingHoursService();
    }
    return ServingHoursService.instance;
  }

  async getServingHours(branchId?: string): Promise<ServingHoursResponse> {
    try {
      const params = new URLSearchParams();
      if (branchId) {
        params.append("branchId", branchId);
      }
      const url = `${API_BASE_URL}/api/user/settings/serving-hours${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to get serving hours:", error);
      throw error;
    }
  }
}

export default ServingHoursService.getInstance();
