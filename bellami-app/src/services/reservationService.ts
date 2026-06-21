import ApiService from "./apiService";

export type ReservationType = "SIMPLE" | "PRE_ORDER";
export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type ReservationTier = "SIMPLE" | "MEDIUM" | "COMPLEX";

export interface ReservationSettings {
  id?: string;
  isEnabled?: boolean;
  tier?: ReservationTier;
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
  timeSlotInterval?: number;
  maxGuestsPerReservation?: number;
  minAdvanceBookingHours?: number;
  maxAdvanceBookingDays?: number;
  allowSameDayBooking?: boolean;
  allowCancellation?: boolean;
  modificationWindowHours?: number;
  enablePreOrder?: boolean;
  preOrderMinAmount?: number;
  fullRefundHoursBefore?: number;
  partialRefundHoursBefore?: number;
  noRefundHoursBefore?: number;
  maxCapacityPerTimeSlot?: number;
  bufferTimeMinutes?: number;
  excludedDates?: ExcludedDatesPayload | string | null;
  depositPercentage?: number;
  allowedPaymentMethods?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ExcludedDatesPayload {
  singleDates: string[];
  dateRanges: Array<{ start: string; end: string }>;
}

export type ReservationSettingsFormData = ReservationSettings;

export type TableStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "OCCUPIED"
  | "OUT_OF_SERVICE";

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  zone?: string | null; // Legacy string field (deprecated)
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
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedReservation?: {
    id: string;
    reservationNumber: string;
  } | null;
}

export interface TableFormData {
  tableNumber: string;
  capacity: number;
  branchId: string;
  zoneId?: string;
  zone?: string; // Legacy support
  notes?: string;
  isActive?: boolean;
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

// Floor Plan Types
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

export interface FloorPlanTable extends Table {
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  shape?: "ROUND" | "SQUARE" | "RECTANGLE";
}

export interface ZoneFloorPlan extends Zone {
  tables: FloorPlanTable[];
  floorElements: FloorElement[];
}

// Floor Plan Editor Types
export interface TablePosition {
  id: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  shape?: "ROUND" | "SQUARE" | "RECTANGLE";
}

export interface FloorElementFormData {
  type: FloorElementType;
  label?: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  color?: string;
  icon?: string;
}

export interface CanvasSettings {
  canvasWidth: number;
  canvasHeight: number;
}

export interface ZoneFormData {
  branchId: string;
  name: string;
  description?: string;
  capacity?: number;
  isActive: boolean;
}

export interface Reservation {
  id: string;
  reservationNumber: string;
  userId?: string;
  tableId?: string;
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
      meal?: {
        id: string;
        name: string;
        image?: string;
      };
    }>;
  };
}

export interface ReservationsResponse {
  success: boolean;
  data: Reservation[];
  pagination?: {
    page: number;
    limit: number;
    totalPages: number;
    totalCount: number;
  };
}

export const reservationService = {
  async getSettings(
    token?: string,
    branchId?: string,
    organizationId?: string
  ): Promise<ReservationSettings> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    if (branchId) {
      params.append("branchId", branchId);
    }
    const basePath = token && organizationId ? "/api/reservations/settings/admin" : "/api/reservations/settings";
    const url = `${basePath}${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiService.get(url, token, {
      skipOrgHeader: Boolean(organizationId),
      headers: organizationId
        ? {
            "x-organization-id": organizationId,
          }
        : undefined,
    });
    return response.data ?? response;
  },

  async updateSettings(
    data: Partial<ReservationSettingsFormData>,
    token?: string,
    organizationId?: string
  ): Promise<ReservationSettings> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      "/api/reservations/settings",
      data,
      token,
      {
        skipOrgHeader: Boolean(organizationId),
        headers: organizationId
          ? {
              "x-organization-id": organizationId,
            }
          : undefined,
      }
    );
    return response.data ?? response;
  },

  async getReservationAnalytics(
    period: string,
    branchId?: string,
    token?: string
  ): Promise<any> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams();
    params.set("period", period);
    if (branchId) {
      params.set("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/reservations/analytics?${params.toString()}`,
      token
    );
    return response.data ?? response;
  },

  async getTables(
    page: number = 1,
    limit: number = 12,
    sortBy: string = "tableNumber",
    sortOrder: "asc" | "desc" = "asc",
    search?: string,
    status?: string,
    zone?: string, // Legacy zone string filter
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
  }> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sortBy,
      sortOrder,
    });
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (zone) params.append("zone", zone); // Legacy support
    if (isActive !== undefined) params.append("isActive", isActive);
    if (branchId) params.append("branchId", branchId);
    if (zoneId) params.append("zoneId", zoneId);
    const response = await apiService.get(
      `/api/reservations/tables?${params.toString()}`,
      token
    );
    return response;
  },

  async createTable(
    data: TableFormData,
    token?: string
  ): Promise<{ data: Table }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/reservations/tables", data, token);
    return response.data ?? response;
  },

  async updateTable(
    id: string,
    data: Partial<TableFormData & { status: TableStatus; isActive: boolean }>,
    token?: string
  ): Promise<{ data: Table }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/tables/${id}`,
      data,
      token
    );
    return response.data ?? response;
  },

  async deleteTable(id: string, token?: string): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/tables/${id}`, token);
  },

  // Reservation Management Methods
  async getReservations(
    page: number = 1,
    limit: number = 10,
    filters?: {
      status?: ReservationStatus;
      type?: ReservationType;
      date?: string;
      fromDate?: string;
      toDate?: string;
      search?: string;
      branchId?: string;
      zoneId?: string;
    },
    token?: string
  ): Promise<ReservationsResponse> {
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
    if (filters?.search) {
      params.append("search", filters.search);
    }
    if (filters?.branchId) {
      params.append("branchId", filters.branchId);
    }
    if (filters?.zoneId) {
      params.append("zoneId", filters.zoneId);
    }

    const response = await apiService.get(
      `/api/reservations?${params.toString()}`,
      token
    );
    return response;
  },

  async getReservationById(
    id: string,
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/reservations/${id}`, token);
    return response.data ?? response;
  },

  async updateReservationStatus(
    id: string,
    status: ReservationStatus,
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/status`,
      { status },
      token
    );
    return response.data ?? response;
  },

  async assignTable(
    id: string,
    tableIds: string | string[] | { tableIds: string[]; overrideCapacity?: boolean; overrideNote?: string },
    token?: string
  ): Promise<Reservation> {
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
    return response.data ?? response;
  },

  async cancelReservation(
    id: string,
    reason?: string,
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/cancel`,
      { reason },
      token
    );
    return response.data ?? response;
  },

  async getReservationHistory(
    id: string,
    token?: string
  ): Promise<Array<{
    type: string;
    action: string;
    timestamp: string;
    details?: any;
  }>> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/${id}/history`,
      token
    );
    return response.data ?? response;
  },

  // User-facing reservation methods
  async getAvailableTimeSlots(
    date: string,
    numberOfGuests: number,
    token?: string,
    branchId?: string
  ): Promise<{ success: boolean; data: { timeSlots: string[] } }> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      date,
      numberOfGuests: numberOfGuests.toString(),
    });
    if (branchId) {
      params.append("branchId", branchId);
    }
    const response = await apiService.get(
      `/api/reservations/time-slots?${params.toString()}`,
      token
    );
    return response;
  },

  async getTableAvailability(
    date: string,
    time: string,
    numberOfGuests: number,
    token?: string,
    branchId?: string,
    zoneId?: string
  ): Promise<{
    success: boolean;
    data: {
      available: Table[];
      reserved: Table[];
    };
  }> {
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
      `/api/reservations/tables/availability/user?${params.toString()}`,
      token
    );
    return response;
  },

  async createSimpleReservation(
    data: {
      reservationDate: string;
      time: string;
      numberOfGuests: number;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      specialRequests?: string;
      preferredZone?: string;
      tableIds?: string[];
      branchId?: string;
      zoneId?: string;
    },
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/reservations", data, token);
    return response.data ?? response;
  },

  async getUserReservations(
    page: number = 1,
    limit: number = 10,
    status?: ReservationStatus,
    token?: string
  ): Promise<{ data: { reservations: Reservation[]; pagination: any } }> {
    const apiService = ApiService.getInstance();
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (status) {
      params.append("status", status);
    }
    const response = await apiService.get(
      `/api/reservations/user/my-reservations?${params.toString()}`,
      token
    );
    return response;
  },

  async createPreOrderReservation(
    data: {
      reservationDate: string;
      time: string;
      numberOfGuests: number;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      specialRequests?: string;
      preferredZone?: string;
      branchId?: string;
      zoneId?: string;
      tableIds?: string[];
      orderItems: Array<{
        mealId: string;
        mealSizeType?: string;
        quantity: number;
        addons?: Array<{
          addonId: string;
          name?: string;
          quantity: number;
          price: number;
          type?: string;
          sizeType?: string;
        }>;
        optionalIngredients?: Array<{
          id: string;
          name: string;
          isIncluded: boolean;
        }>;
        specialInstructions?: string;
      }>;
      paymentIntentId: string;
    },
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post("/api/reservations/pre-order", data, token);
    return response.data ?? response;
  },

  async modifyReservation(
    id: string,
    data: {
      reservationDate?: string;
      time?: string;
      numberOfGuests?: number;
      zoneId?: string | null;
      tableIds?: string[];
      orderItems?: Array<{
        mealId: string;
        mealSizeType?: string;
        quantity: number;
        addons?: Array<{
          addonId: string;
          name?: string;
          quantity: number;
          price: number;
          type?: string;
          sizeType?: string;
        }>;
        optionalIngredients?: Array<{
          id: string;
          name: string;
          isIncluded: boolean;
        }>;
        specialInstructions?: string;
      }>;
      paymentIntentId?: string; // For new items payment when modifying
    },
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/modify`,
      data,
      token
    );
    return response.data ?? response;
  },

  // Zone Management
  async getZones(
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
  }> {
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

  async createZone(
    data: ZoneFormData,
    token?: string
  ): Promise<Zone> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/reservations/zones`,
      data,
      token
    );
    return response.data ?? response;
  },

  async updateZone(
    id: string,
    data: ZoneFormData,
    token?: string
  ): Promise<Zone> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/zones/${id}`,
      data,
      token
    );
    return response.data ?? response;
  },

  async deleteZone(
    id: string,
    token?: string
  ): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/reservations/zones/${id}`, token);
  },

  // Floor Plan Methods
  async getZoneFloorPlan(
    zoneId: string,
    token?: string
  ): Promise<ZoneFloorPlan> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/zones/${zoneId}/floor-plan`,
      token
    );
    return response.data ?? response;
  },

  // Table Position
  async updateTablePosition(
    tableId: string,
    position: TablePosition,
    token?: string
  ): Promise<Table> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/tables/${tableId}/position`,
      position,
      token
    );
    return response.data ?? response;
  },

  // Bulk Update Table Positions
  async bulkUpdateTablePositions(
    zoneId: string,
    tables: TablePosition[],
    token?: string
  ): Promise<Table[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/reservations/zones/${zoneId}/tables/positions`,
      { tables },
      token
    );
    return response.data ?? response;
  },

  // Floor Elements CRUD
  async getFloorElements(
    zoneId: string,
    token?: string
  ): Promise<FloorElement[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/reservations/zones/${zoneId}/floor-elements`,
      token
    );
    return response.data ?? response;
  },

  async createFloorElement(
    zoneId: string,
    element: FloorElementFormData,
    token?: string
  ): Promise<FloorElement> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/reservations/zones/${zoneId}/floor-elements`,
      element,
      token
    );
    return response.data ?? response;
  },

  async updateFloorElement(
    elementId: string,
    element: Partial<FloorElementFormData>,
    token?: string
  ): Promise<FloorElement> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/floor-elements/${elementId}`,
      element,
      token
    );
    return response.data ?? response;
  },

  async deleteFloorElement(
    elementId: string,
    token?: string
  ): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(
      `/api/reservations/floor-elements/${elementId}`,
      token
    );
  },

  // Canvas Settings
  async updateCanvasSettings(
    zoneId: string,
    settings: CanvasSettings,
    token?: string
  ): Promise<Zone> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/zones/${zoneId}/canvas`,
      settings,
      token
    );
    return response.data ?? response;
  },

  async completeReservationPayment(
    id: string,
    token?: string
  ): Promise<Reservation> {
    const apiService = ApiService.getInstance();
    const response = await apiService.patch(
      `/api/reservations/${id}/complete-payment`,
      {},
      token
    );
    return response.data ?? response;
  },
};


