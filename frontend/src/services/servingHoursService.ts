import ApiService from "./apiService";

export interface DayHours {
  isOff: boolean;
  open?: string;
  close?: string;
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
  // Structured data for translation
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

export class ServingHoursService {
  static async getServingHours(branchId?: string): Promise<ServingHoursResponse> {
    const apiService = ApiService.getInstance();
    const url = branchId 
      ? `/api/user/settings/serving-hours?branchId=${branchId}`
      : "/api/user/settings/serving-hours";
    const response = await apiService.get(url);
    return response;
  }
}

