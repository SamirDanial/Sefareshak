import ApiService from "./apiService";

// Types and Interfaces for Reservation System
export type ReservationType = "SIMPLE" | "PRE_ORDER";
export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type ReservationTier = "SIMPLE" | "MEDIUM" | "COMPLEX";
export type TableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "OUT_OF_SERVICE";

export interface Reservation {
  id: string;
  reservationNumber: string;
  userId?: string;
  tableId?: string;
  tableIds?: string[];
  status: ReservationStatus;
  type: ReservationType;
  reservationDate: string;
  numberOfGuests: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  specialRequests?: string;
  preferredZone?: string;
  reservationOrderId?: string;
  paymentStatus?: string;
  paymentIntentId?: string;
  confirmedAt?: string;
  seatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  internalNotes?: string;
  noShow: boolean;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
  notifications?: Array<{
    id: string;
    isSeen: boolean;
  }>;
  table?: Table;
  tables?: Array<{
    table: Table;
  }>;
  zone?: {
    id: string;
    name: string;
  } | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  reservationOrder?: {
    id: string;
    orderNumber: string;
    totalAmount: number;
    taxAmount: number;
    itemTaxAmount?: number;
    addonTaxAmount?: number;
    status: string;
    paymentStatus: string;
    paymentMethod?: string;
    paymentIntentId?: string;
    paidAmount?: number;
    depositPercentage?: number;
    payment?: {
      id: string;
      paymentProvider: "STRIPE" | "PAYPAL";
      amount?: number;
    };
    items?: Array<{
      id: string;
      mealId: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      taxAmount?: number;
      taxPercentage?: number;
      selectedSize?: string;
      specialInstructions?: string;
      meal?: {
        id: string;
        name: string;
        image?: string;
      };
      addons?: Array<{
        id: string;
        addOnName: string;
        addOnPrice: number;
        quantity: number;
        taxAmount?: number;
        taxPercentage?: number;
      }>;
      optionalIngredients?: Array<{
        id: string;
        ingredientName: string;
        isIncluded: boolean;
      }>;
    }>;
  };
}

export interface Zone {
  id: string;
  branchId: string;
  name: string;
  description?: string;
  isActive: boolean;
  capacity?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundImage?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tables: number;
  };
}

export interface ZoneFormData {
  branchId: string;
  name: string;
  description?: string;
  capacity?: number;
  isActive?: boolean;
}

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  zone?: string; // Legacy string field (deprecated)
  zoneId?: string;
  zoneRelation?: { // Zone relation object from Zone Management
    id: string;
    name: string;
    description?: string;
    branchId: string;
  } | null;
  branchId?: string;
  status: TableStatus;
  isActive: boolean;
  notes?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  shape?: string;
  createdAt: string;
  updatedAt: string;
  isAssigned?: boolean;
  assignedReservation?: {
    id: string;
    reservationNumber: string;
  } | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

export type FloorElementType = 
  | "WINDOW" 
  | "DOOR" 
  | "STAIRS" 
  | "GARDEN" 
  | "WALL" 
  | "BAR" 
  | "KITCHEN" 
  | "RESTROOM" 
  | "PLANT" 
  | "PILLAR" 
  | "LABEL"
  | "FLOOR_AREA";

export interface FloorElement {
  id: string;
  zoneId: string;
  type: FloorElementType;
  label?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FloorElementFormData {
  type: FloorElementType;
  label?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  color?: string;
  icon?: string;
}

export interface TablePosition {
  id: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  shape?: string;
}

export interface CanvasSettings {
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundImage?: string;
}

export interface ZoneFloorPlan extends Zone {
  tables: Table[];
  floorElements: FloorElement[];
}

export interface ReservationSettings {
  id: string;
  isEnabled: boolean;
  tier: ReservationTier;
  mondayOpen?: string;
  mondayClose?: string;
  tuesdayOpen?: string;
  tuesdayClose?: string;
  wednesdayOpen?: string;
  wednesdayClose?: string;
  thursdayOpen?: string;
  thursdayClose?: string;
  fridayOpen?: string;
  fridayClose?: string;
  saturdayOpen?: string;
  saturdayClose?: string;
  sundayOpen?: string;
  sundayClose?: string;
  timeSlotInterval: number;
  maxGuestsPerReservation: number;
  minAdvanceBookingHours: number;
  maxAdvanceBookingDays: number;
  allowSameDayBooking: boolean;
  allowCancellation: boolean;
  modificationWindowHours?: number;
  enablePreOrder: boolean;
  preOrderMinAmount?: number;
  fullRefundHoursBefore?: number;
  partialRefundHoursBefore?: number;
  noRefundHoursBefore?: number;
  maxCapacityPerTimeSlot?: number;
  bufferTimeMinutes?: number;
  blockedDates: string[];
  excludedDates?: any;
  depositPercentage?: number;
  allowedPaymentMethods?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReservationFormData {
  reservationDate: string;
  time: string;
  numberOfGuests: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  specialRequests?: string;
  preferredZone?: string;
  branchId?: string;
  tableIds?: string[];
  zoneId?: string;
}

export interface PreOrderReservationFormData extends ReservationFormData {
  orderItems: any[];
  paymentIntentId?: string; // Stripe payment intent ID
  paypalOrderId?: string; // PayPal order ID
}

export interface ReservationSettingsFormData {
  isEnabled: boolean;
  tier: ReservationTier;
  mondayOpen?: string;
  mondayClose?: string;
  tuesdayOpen?: string;
  tuesdayClose?: string;
  wednesdayOpen?: string;
  wednesdayClose?: string;
  thursdayOpen?: string;
  thursdayClose?: string;
  fridayOpen?: string;
  fridayClose?: string;
  saturdayOpen?: string;
  saturdayClose?: string;
  sundayOpen?: string;
  sundayClose?: string;
  timeSlotInterval: number;
  maxGuestsPerReservation: number;
  minAdvanceBookingHours: number;
  maxAdvanceBookingDays: number;
  allowSameDayBooking: boolean;
  allowCancellation: boolean;
  modificationWindowHours?: number;
  enablePreOrder: boolean;
  preOrderMinAmount?: number;
  fullRefundHoursBefore?: number;
  partialRefundHoursBefore?: number;
  noRefundHoursBefore?: number;
  maxCapacityPerTimeSlot?: number;
  bufferTimeMinutes?: number;
  blockedDates: string[];
  excludedDates?: any;
  depositPercentage?: number;
  allowedPaymentMethods?: string[];
}

export interface TableFormData {
  tableNumber: string;
  capacity: number;
  branchId?: string | null;
  zoneId?: string | null;
  zone?: string | null; // Keep for backward compatibility
  notes?: string;
}

export interface ReservationsResponse {
  success: boolean;
  data: {
    reservations: Reservation[];
    total: number;
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

export interface AvailabilityResponse {
  success: boolean;
  data: {
    available: boolean;
    reason?: string;
  };
}

export interface TimeSlotsResponse {
  success: boolean;
  data: {
    timeSlots: string[];
  };
}

export interface TablesResponse {
  success: boolean;
  data: Table[];
  pagination?: {
    page: number;
    limit: number;
    totalPages: number;
    totalCount: number;
  };
}

export interface TableAvailabilityResponse {
  success: boolean;
  data: {
    available: Table[];
    assigned?: Table[];
    reserved: Table[];
  };
}

export const reservationService = {
  // Settings
  getSettings: async (token?: string, branchId?: string): Promise<ReservationSettings> => {
    const apiService = ApiService.getInstance();
    const url = branchId 
      ? `/api/reservations/settings?branchId=${branchId}`
      : "/api/reservations/settings";
    const response = await apiService.get(url, token);
    return response.data;
  },

  updateSettings: async (
    data: Partial<ReservationSettingsFormData>,
    token?: string
  ): Promise<ReservationSettings> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      "/api/reservations/settings",
      data,
      token
    );
    return response.data;
  },

  // Availability
  checkAvailability: async (
    date: string,
    time: string,
    numberOfGuests: number,
    token?: string
  ): Promise<AvailabilityResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      date,
      time,
      numberOfGuests: numberOfGuests.toString(),
    });
    const response = await apiService.get(
      `/api/reservations/availability?${params}`,
      token
    );
    return response;
  },

  getAvailableTimeSlots: async (
    date: string,
    numberOfGuests: number,
    token?: string,
    branchId?: string
  ): Promise<TimeSlotsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      date,
      numberOfGuests: numberOfGuests.toString(),
    });
    if (branchId) {
      params.append("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/reservations/time-slots?${params}`,
      token
    );
    return response;
  },

  // Reservations
  getReservations: async (
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: ReservationStatus;
      type?: ReservationType;
      date?: string;
      fromDate?: string;
      toDate?: string;
      branchId?: string;
      zoneId?: string;
    },
    token?: string
  ): Promise<ReservationsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (filters?.status) {
      params.append("status", filters.status);
    }
    if (filters?.type) {
      params.append("type", filters.type);
    }
    if (filters?.date) {
      params.append("date", filters.date);
    }
    if (filters?.fromDate) {
      params.append("fromDate", filters.fromDate);
    }
    if (filters?.toDate) {
      params.append("toDate", filters.toDate);
    }
    if (filters?.branchId) {
      params.append("branchId", filters.branchId);
    }
    if (filters?.zoneId) {
      params.append("zoneId", filters.zoneId);
    }

    const response = await apiService.get(
      `/api/reservations?${params}`,
      token
    );
    return response;
  },

  getUserReservations: async (
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: ReservationStatus;
      type?: ReservationType;
    },
    token?: string
  ): Promise<ReservationsResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (filters?.status) {
      params.append("status", filters.status);
    }
    if (filters?.type) {
      params.append("type", filters.type);
    }

    const response = await apiService.get(
      `/api/reservations/user/my-reservations?${params}`,
      token
    );
    return response;
  },

  getReservationById: async (
    id: string,
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/reservations/${id}`, token);
    return response.data;
  },

  createSimpleReservation: async (
    data: ReservationFormData,
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/reservations",
      data,
      token
    );
    return response.data;
  },

  createPreOrderReservation: async (
    data: PreOrderReservationFormData,
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/reservations/pre-order",
      data,
      token
    );
    return response.data;
  },

  updateReservationStatus: async (
    id: string,
    status: ReservationStatus,
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/status`,
      { status },
      token
    );
    return response.data;
  },

  completeReservationPayment: async (
    id: string,
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/complete-payment`,
      {},
      token
    );
    return response.data;
  },

  assignTable: async (
    id: string,
    tableIds: string | string[] | { tableIds: string[]; overrideCapacity?: boolean; overrideNote?: string },
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    
    // Handle both legacy format and new object format
    let requestBody: any;
    if (typeof tableIds === "object" && !Array.isArray(tableIds) && tableIds.tableIds) {
      // New format with override options
      requestBody = tableIds;
    } else {
      // Legacy format - just tableIds
      const tableIdsArray = Array.isArray(tableIds) ? tableIds : [tableIds];
      requestBody = { tableIds: tableIdsArray };
    }
    
    const response = await apiService.patch(
      `/api/reservations/${id}/assign-table`,
      requestBody,
      token
    );
    return response.data;
  },

  cancelReservation: async (
    id: string,
    reason?: string,
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/cancel`,
      { reason },
      token
    );
    return response.data;
  },

  getReservationOrder: async (
    id: string,
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/${id}/order`,
      token
    );
    return response.data;
  },

  getReservationHistory: async (
    id: string,
    token?: string
  ): Promise<Array<{
    type: string;
    action: string;
    timestamp: string;
    details?: any;
  }>> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/${id}/history`,
      token
    );
    return response.data;
  },

  // Tables
  getTables: async (
    page: number = 1,
    limit: number = 12,
    sortBy: string = "tableNumber",
    sortOrder: "asc" | "desc" = "asc",
    search?: string,
    status?: string,
    zone?: string,
    isActive?: string,
    branchId?: string,
    zoneId?: string,
    token?: string
  ): Promise<{
    success: boolean;
    data: Table[];
    pagination?: {
      page: number;
      limit: number;
      totalPages: number;
      totalCount: number;
    };
  }> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sortBy,
      sortOrder,
    });
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (zone) params.append("zone", zone);
    if (isActive) params.append("isActive", isActive);
    if (branchId) params.append("branchId", branchId);
    if (zoneId) params.append("zoneId", zoneId);
    
    const response = await apiService.get(`/api/reservations/tables?${params.toString()}`, token);
    return response;
  },

  getTableById: async (id: string, token?: string): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/tables/${id}`,
      token
    );
    return (response as any)?.data ?? response;
  },

  createTable: async (
    data: TableFormData,
    token?: string
  ): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      "/api/reservations/tables",
      data,
      token
    );
    return (response as any)?.data ?? response;
  },

  updateTable: async (
    id: string,
    data: Partial<TableFormData & { status: TableStatus; isActive: boolean }>,
    token?: string
  ): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/tables/${id}`,
      data,
      token
    );
    return (response as any)?.data ?? response;
  },

  deleteTable: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/tables/${id}`, token);
  },

  getTableAvailability: async (
    date: string,
    time: string,
    numberOfGuests: number,
    token?: string,
    branchId?: string,
    zoneId?: string
  ): Promise<TableAvailabilityResponse> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      date,
      time,
      numberOfGuests: numberOfGuests.toString(),
    });
    if (branchId) {
      params.append("branchId", branchId);
    }
    if (zoneId) {
      params.append("zoneId", zoneId);
    }
    const response = await apiService.get(
      `/api/reservations/tables/availability?${params}`,
      token
    );
    return response;
  },

  // Get reservation analytics
  getReservationAnalytics: async (
    period: string = "last_30_days",
    branchId?: string,
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    params.append("period", period);
    if (branchId) {
      params.append("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/reservations/analytics?${params.toString()}`,
      token
    );
    return response.data;
  },

  getBranchReservationsChart: async (
    period: string = "last_30_days",
    token?: string
  ): Promise<any> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/analytics/branch-chart?period=${period}`,
      token
    );
    return response.data;
  },

  // Modify reservation
  modifyReservation: async (
    id: string,
    data: {
      reservationDate?: string;
      time?: string;
      numberOfGuests?: number;
      orderItems?: any[]; // For PRE_ORDER reservations
      paymentIntentId?: string; // For new items payment when modifying (Stripe)
      paypalOrderId?: string; // For new items payment when modifying (PayPal)
      zoneId?: string | null; // Zone selection
      tableIds?: string[]; // Table selection
    },
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/modify`,
      data,
      token
    );
    return response.data;
  },

  // Zone Management
  getPublicZones: async (
    branchId: string,
    token?: string
  ): Promise<{
    zones: Zone[];
  }> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({ branchId });
    const response = await apiService.get(
      `/api/reservations/public/zones?${params.toString()}`,
      token
    );
    return {
      zones: (response as any)?.data ?? response,
    };
  },

  getZones: async (
    branchId: string,
    token?: string,
    options?: {
      page?: number;
      limit?: number;
      sortBy?: "name" | "createdAt" | "capacity";
      sortOrder?: "asc" | "desc";
      search?: string;
      isActive?: string;
    }
  ): Promise<{
    zones: Zone[];
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      totalCount: number;
    };
  }> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      branchId,
      ...(options?.page && { page: options.page.toString() }),
      ...(options?.limit && { limit: options.limit.toString() }),
      ...(options?.sortBy && { sortBy: options.sortBy }),
      ...(options?.sortOrder && { sortOrder: options.sortOrder }),
      ...(options?.search && { search: options.search }),
      ...(options?.isActive && { isActive: options.isActive }),
    });
    const response = await apiService.get(
      `/api/reservations/zones?${params.toString()}`,
      token
    );
    return {
      zones: response.data,
      pagination: response.pagination,
    };
  },

  createZone: async (
    data: ZoneFormData,
    token?: string
  ): Promise<Zone> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/reservations/zones`,
      data,
      token
    );
    return (response as any)?.data ?? response;
  },

  updateZone: async (
    id: string,
    data: Partial<ZoneFormData>,
    token?: string
  ): Promise<Zone> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/zones/${id}`,
      data,
      token
    );
    return (response as any)?.data ?? response;
  },

  deleteZone: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/zones/${id}`, token);
  },

  // Zone Canvas Settings
  updateZoneCanvas: async (
    zoneId: string,
    canvas: CanvasSettings,
    token?: string
  ): Promise<Zone> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/zones/${zoneId}/canvas`,
      canvas,
      token
    );
    return (response as any)?.data ?? response;
  },

  // Floor Plan
  getZoneFloorPlan: async (
    zoneId: string,
    token?: string
  ): Promise<ZoneFloorPlan> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/zones/${zoneId}/floor-plan`,
      token
    );
    return (response as any)?.data ?? response;
  },

  // Table Position
  updateTablePosition: async (
    tableId: string,
    position: TablePosition,
    token?: string
  ): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/tables/${tableId}/position`,
      position,
      token
    );
    return (response as any)?.data ?? response;
  },

  // Bulk Update Table Positions
  bulkUpdateTablePositions: async (
    zoneId: string,
    tables: TablePosition[],
    token?: string
  ): Promise<Table[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/reservations/zones/${zoneId}/tables/positions`,
      { tables },
      token
    );
    return (response as any)?.data ?? response;
  },

  // Floor Elements
  getFloorElements: async (
    zoneId: string,
    token?: string
  ): Promise<FloorElement[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/zones/${zoneId}/floor-elements`,
      token
    );
    return (response as any)?.data ?? response;
  },

  createFloorElement: async (
    zoneId: string,
    element: FloorElementFormData,
    token?: string
  ): Promise<FloorElement> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/reservations/zones/${zoneId}/floor-elements`,
      element,
      token
    );
    return (response as any)?.data ?? response;
  },

  updateFloorElement: async (
    elementId: string,
    element: Partial<FloorElementFormData>,
    token?: string
  ): Promise<FloorElement> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/floor-elements/${elementId}`,
      element,
      token
    );
    return (response as any)?.data ?? response;
  },

  deleteFloorElement: async (elementId: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/floor-elements/${elementId}`, token);
  },
};

