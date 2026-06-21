import ApiService from "./apiService";

const unwrapData = <T,>(response: unknown): T => {
  if (response && typeof response === "object" && "data" in (response as any)) {
    return (response as any).data as T;
  }
  return response as T;
};

export type ReservationType = "SIMPLE" | "PRE_ORDER";

export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface ReservationOrderItem {
  id: string;
  quantity: number;
  selectedSize?: string;
  totalPrice: number | string;
  specialInstructions?: string | null;
  meal?: {
    id: string;
    name: string;
    image?: string | null;
  } | null;
  addons?: Array<{
    id: string;
    addOnName?: string | null;
    addOnPrice?: number | string | null;
    quantity?: number | null;
    addon?: {
      id: string;
      name: string;
    } | null;
  }>;
  optionalIngredients?: Array<{
    id: string;
    ingredientName: string;
    isIncluded: boolean;
  }>;
}

export interface ReservationOrder {
  id: string;
  orderNumber: string;
  totalAmount: number | string;
  currency: string;
  taxAmount?: number | string | null;
  itemTaxAmount?: number | string | null;
  addonTaxAmount?: number | string | null;
  paidAmount?: number | string | null;
  depositPercentage?: number | string | null;
  paymentStatus?: string | null;
  paymentIntentId?: string | null;
  items?: ReservationOrderItem[];
}

export interface Reservation {
  id: string;
  reservationNumber: string;
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
  tableId?: string;
  tableIds?: string[];
  table?: {
    id: string;
    tableNumber: string;
    capacity: number;
    zoneRelation?: {
      id: string;
      name: string;
    } | null;
  } | null;
  tables?: Array<{
    table: {
      id: string;
      tableNumber: string;
      capacity: number;
      zoneRelation?: {
        id: string;
        name: string;
      } | null;
    };
  }>;
  zone?: {
    id: string;
    name: string;
  } | null;
  branch?: {
    id: string;
    name: string;
  } | null;
  reservationOrder?: ReservationOrder | null;
  notifications?: Array<{
    id: string;
    isSeen: boolean;
  }>;
}

export interface ReservationsResponse {
  success: boolean;
  data: {
    reservations: Reservation[];
    pagination: {
      page: number;
      limit: number;
      pages: number;
      total: number;
    };
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
  _count?: {
    tables: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ZoneFormData {
  branchId: string;
  name: string;
  description?: string;
  capacity?: number;
  isActive?: boolean;
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
  label?: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  color?: string | null;
  icon?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TableStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "OUT_OF_SERVICE";

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  isActive: boolean;
  notes?: string;
  zoneId?: string;
  branchId?: string;
  zone?: string; // Legacy string field
  positionX?: number | null;
  positionY?: number | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  shape?: string | null;
  zoneRelation?: {
    id: string;
    name: string;
    description?: string;
    branchId: string;
  } | null;
  assignedReservation?: {
    id: string;
    reservationNumber: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TableFormData {
  tableNumber: string;
  capacity: number;
  branchId?: string | null;
  zoneId?: string | null;
  zone?: string | null;
  notes?: string;
}

export interface TableAvailabilityResponse {
  success: boolean;
  data: {
    available: Table[];
    assigned?: Table[];
    reserved: Table[];
  };
}

export type ReservationTier = "SIMPLE" | "MEDIUM" | "COMPLEX";

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

export const reservationService = {
  getSettings: async (token?: string, branchId?: string): Promise<ReservationSettings> => {
    const apiService = ApiService.getInstance();
    const url = branchId
      ? `/api/reservations/settings?branchId=${branchId}`
      : "/api/reservations/settings";
    const response = await apiService.get(url, token);
    return (response as any)?.data ?? (response as any);
  },

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
    return unwrapData<any>(response);
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
    return unwrapData<any>(response);
  },

  updateSettings: async (
    data: Partial<ReservationSettingsFormData>,
    token?: string
  ): Promise<ReservationSettings> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch("/api/reservations/settings", data, token);
    return (response as any)?.data ?? (response as any);
  },

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
      page: String(page),
      limit: String(limit),
    });

    if (filters?.status) params.append("status", filters.status);
    if (filters?.type) params.append("type", filters.type);
    if (filters?.date) params.append("date", filters.date);
    if (filters?.fromDate) params.append("fromDate", filters.fromDate);
    if (filters?.toDate) params.append("toDate", filters.toDate);
    if (filters?.branchId) params.append("branchId", filters.branchId);
    if (filters?.zoneId) params.append("zoneId", filters.zoneId);

    const response = await apiService.get(`/api/reservations?${params.toString()}`, token);
    return response as ReservationsResponse;
  },

  getReservationById: async (id: string, token?: string): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/reservations/${id}`, token);
    return (response as any)?.data ?? (response as Reservation);
  },

  modifyReservation: async (
    id: string,
    payload: {
      reservationDate?: string;
      time?: string;
      numberOfGuests?: number;
      zoneId?: string | null;
      tableIds?: string[];
      orderItems?: any[];
      paymentId?: string | null;
    },
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/reservations/${id}/modify`, payload, token);
    return (response as any)?.data ?? (response as Reservation);
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
    return (response as any)?.data ?? (response as Reservation);
  },

  cancelReservation: async (id: string, reason?: string, token?: string): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/cancel`,
      { reason },
      token
    );
    return (response as any)?.data ?? (response as Reservation);
  },

  completeReservationPayment: async (id: string, token?: string): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/complete-payment`,
      {},
      token
    );
    return (response as any)?.data ?? (response as Reservation);
  },

  assignTable: async (
    id: string,
    payload: { tableIds: string[]; overrideCapacity?: boolean; overrideNote?: string },
    token?: string
  ): Promise<Reservation> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/assign-table`,
      payload,
      token
    );
    return (response as any)?.data ?? (response as Reservation);
  },

  getReservationHistory: async (
    id: string,
    token?: string
  ): Promise<
    Array<{
      type: string;
      action: string;
      timestamp: string;
      details?: any;
    }>
  > => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/reservations/${id}/history`, token);
    return (response as any)?.data ?? (response as any);
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
    pagination?: {
      page: number;
      limit: number;
      totalPages: number;
      totalCount: number;
    };
  }> => {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      branchId,
      ...(options?.page && { page: String(options.page) }),
      ...(options?.limit && { limit: String(options.limit) }),
      ...(options?.sortBy && { sortBy: options.sortBy }),
      ...(options?.sortOrder && { sortOrder: options.sortOrder }),
      ...(options?.search && { search: options.search }),
      ...(options?.isActive && { isActive: options.isActive }),
    });
    const response = await apiService.get(`/api/reservations/zones?${params.toString()}`, token);

    if ((response as any)?.zones) {
      return { zones: (response as any).zones };
    }

    if ((response as any)?.data && Array.isArray((response as any).data)) {
      return {
        zones: (response as any).data as Zone[],
        pagination: (response as any).pagination,
      };
    }

    return {
      zones: ((response as any)?.data ?? []) as Zone[],
      pagination: (response as any).pagination,
    };
  },

  createZone: async (data: ZoneFormData, token?: string): Promise<Zone> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/reservations/zones", data, token);
    return ((response as any)?.data ?? response) as Zone;
  },

  updateZone: async (id: string, data: Partial<ZoneFormData>, token?: string): Promise<Zone> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/reservations/zones/${id}`, data, token);
    return ((response as any)?.data ?? response) as Zone;
  },

  deleteZone: async (id: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/zones/${id}`, token);
  },

  updateZoneCanvas: async (
    zoneId: string,
    canvas: { canvasWidth?: number; canvasHeight?: number; backgroundImage?: string },
    token?: string
  ): Promise<Zone> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/reservations/zones/${zoneId}/canvas`, canvas, token);
    return ((response as any)?.data ?? response) as Zone;
  },

  getZoneFloorPlan: async (
    zoneId: string,
    token?: string
  ): Promise<{
    id: string;
    name: string;
    canvasWidth?: number;
    canvasHeight?: number;
    backgroundImage?: string;
    tables: Table[];
    floorElements: FloorElement[];
  }> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/reservations/zones/${zoneId}/floor-plan`, token);
    return ((response as any)?.data ?? response) as any;
  },

  createFloorElement: async (
    zoneId: string,
    element: Omit<FloorElement, "id" | "createdAt" | "updatedAt" | "zoneId">,
    token?: string
  ): Promise<FloorElement> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/reservations/zones/${zoneId}/floor-elements`, element, token);
    return ((response as any)?.data ?? response) as FloorElement;
  },

  updateFloorElement: async (
    elementId: string,
    updates: Partial<Omit<FloorElement, "id" | "createdAt" | "updatedAt" | "zoneId">>,
    token?: string
  ): Promise<FloorElement> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/reservations/floor-elements/${elementId}`, updates, token);
    return ((response as any)?.data ?? response) as FloorElement;
  },

  deleteFloorElement: async (elementId: string, token?: string): Promise<void> => {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/floor-elements/${elementId}`, token);
  },

  bulkUpdateTablePositions: async (
    zoneId: string,
    tables: Array<{
      id: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      rotation: number;
      shape: string;
    }>,
    token?: string
  ): Promise<Table[]> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/reservations/zones/${zoneId}/tables/positions`, { tables }, token);
    return (((response as any)?.data ?? response) as Table[]) || [];
  },

  updateTablePosition: async (
    tableId: string,
    payload: {
      positionX?: number;
      positionY?: number;
      width?: number;
      height?: number;
      rotation?: number;
      shape?: string;
    },
    token?: string
  ): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/reservations/tables/${tableId}/position`, payload, token);
    return ((response as any)?.data ?? response) as Table;
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

    const response = await apiService.get(
      `/api/reservations/tables?${params.toString()}`,
      token
    );
    return response as any;
  },

  getTableById: async (id: string, token?: string): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/reservations/tables/${id}`, token);
    return ((response as any)?.data ?? response) as Table;
  },

  createTable: async (data: TableFormData, token?: string): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/reservations/tables", data, token);
    return ((response as any)?.data ?? response) as Table;
  },

  updateTable: async (
    id: string,
    data: Partial<TableFormData & { status: TableStatus; isActive: boolean }>,
    token?: string
  ): Promise<Table> => {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(`/api/reservations/tables/${id}`, data, token);
    return ((response as any)?.data ?? response) as Table;
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
      numberOfGuests: String(numberOfGuests),
    });
    if (branchId) params.append("branchId", branchId);
    if (zoneId) params.append("zoneId", zoneId);

    const response = await apiService.get(
      `/api/reservations/tables/availability?${params.toString()}`,
      token
    );
    return response as TableAvailabilityResponse;
  },
};
