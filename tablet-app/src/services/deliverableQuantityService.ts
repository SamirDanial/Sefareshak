import ApiService from "@/src/services/apiService";

// Type Definitions
export interface MealSize {
  id: string;
  sizeType: string;
  name: string;
  price: number;
  isActive: boolean;
}

export interface MealSizeWithWeight extends MealSize {
  weight: number | null;
  weightId?: string;
}

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export interface MealWithSizes {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  categoryId: string;
  category: Category;
  mealSizes: MealSize[];
}

export interface DailyDeliverable {
  id: string;
  branchId: string;
  mealId: string;
  dailyDeliverableWeight: number;
}

export interface AvailableWeight {
  availableWeight: number | null;
  dailyDeliverableWeight: number | null;
  consumedWeight: number | null;
}

// Public endpoint response includes size weights for cart validation
export interface PublicAvailableWeight extends AvailableWeight {
  mealId: string;
  mealName: string;
  sizeWeights: Record<string, number>; // { S: 0.5, M: 0.75, L: 1.0 } etc
}

export interface UpsertSizeWeightRequest {
  branchId: string;
  mealId: string;
  mealSizeId: string;
  weight: number;
}

export interface UpsertDailyDeliverableRequest {
  branchId: string;
  mealId: string;
  dailyDeliverableWeight: number;
}

export interface MealSizeWeightRecord {
  id: string;
  branchId: string;
  mealId: string;
  mealSizeId: string;
  weight: number;
  mealSize?: MealSize;
}

export interface CartItemForValidation {
  mealId: string;
  mealSizeType?: string | null;
  quantity: number;
}

export interface CartValidationResult {
  valid: boolean;
  errors: string[];
}

export const deliverableQuantityService = {
  // =====================
  // ADMIN ENDPOINTS (require auth token)
  // =====================

  /**
   * Fetch meals available for a branch (excluding meals excluded for the branch)
   */
  async getMealsForBranch(
    branchId: string,
    token?: string
  ): Promise<MealWithSizes[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/deliverable-quantities/branches/${branchId}/meals`,
      token
    );
    return response.data;
  },

  /**
   * Fetch meal sizes with their configured weights for a specific branch and meal
   */
  async getMealSizes(
    branchId: string,
    mealId: string,
    token?: string
  ): Promise<{ mealId: string; sizes: MealSizeWithWeight[] }> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/deliverable-quantities/branches/${branchId}/meals/${mealId}/sizes`,
      token
    );
    return response.data;
  },

  /**
   * Create or update weight for a meal size
   */
  async upsertSizeWeight(
    data: UpsertSizeWeightRequest,
    token?: string
  ): Promise<MealSizeWeightRecord> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/deliverable-quantities/size-weights`,
      data,
      token
    );
    return response.data;
  },

  /**
   * Delete a size weight configuration
   */
  async deleteSizeWeight(id: string, token?: string): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(
      `/api/admin/deliverable-quantities/size-weights/${id}`,
      token
    );
  },

  /**
   * Get daily deliverable limit for a specific branch and meal (no date - applies every day)
   */
  async getDailyDeliverable(
    branchId: string,
    mealId: string,
    token?: string
  ): Promise<DailyDeliverable | null> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/deliverable-quantities/daily/${branchId}/${mealId}`,
      token
    );
    return response.data;
  },

  /**
   * Create or update daily deliverable limit (no date - applies every day)
   */
  async upsertDailyDeliverable(
    data: UpsertDailyDeliverableRequest,
    token?: string
  ): Promise<DailyDeliverable> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/admin/deliverable-quantities/daily`,
      data,
      token
    );
    return response.data;
  },

  /**
   * Delete daily deliverable limit
   */
  async deleteDailyDeliverable(
    branchId: string,
    mealId: string,
    token?: string
  ): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(
      `/api/admin/deliverable-quantities/daily/${branchId}/${mealId}`,
      token
    );
  },

  /**
   * Get available weight for TODAY (admin endpoint)
   */
  async getAvailableWeight(
    branchId: string,
    mealId: string,
    token?: string
  ): Promise<AvailableWeight> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/deliverable-quantities/available/${branchId}/${mealId}`,
      token
    );
    return response.data;
  },

  // =====================
  // PUBLIC ENDPOINTS (no auth required - for cart validation)
  // =====================

  /**
   * Get available weight for TODAY with size weights (public - for cart validation)
   * Returns null values if no limit is configured (meaning unlimited)
   */
  async getPublicAvailableWeight(
    branchId: string,
    mealId: string
  ): Promise<PublicAvailableWeight> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/user/deliverable-quantities/available/${branchId}/${mealId}`
    );
    return response.data;
  },

  /**
   * Validate cart items against daily limits before checkout
   * Returns validation result with any errors
   */
  async validateCart(
    branchId: string,
    items: CartItemForValidation[]
  ): Promise<CartValidationResult> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(
      `/api/user/deliverable-quantities/validate-cart`,
      { branchId, items }
    );
    return response.data;
  },

  /**
   * Check if a specific item can be added to cart
   * Helper function that uses getPublicAvailableWeight
   */
  async canAddToCart(
    branchId: string,
    mealId: string,
    sizeType: string,
    quantity: number
  ): Promise<{
    canAdd: boolean;
    availableWeight: number | null;
    requiredWeight: number | null;
    message?: string;
  }> {
    try {
      const availability = await this.getPublicAvailableWeight(branchId, mealId);
      
      // If no limit configured, allow unlimited
      if (availability.availableWeight === null) {
        return {
          canAdd: true,
          availableWeight: null,
          requiredWeight: null,
        };
      }

      // Get weight for selected size
      const sizeWeight = availability.sizeWeights?.[sizeType];
      
      // If size weight not configured, allow (no tracking for this size)
      if (!sizeWeight) {
        return {
          canAdd: true,
          availableWeight: availability.availableWeight,
          requiredWeight: null,
        };
      }

      const requiredWeight = sizeWeight * quantity;
      const canAdd = requiredWeight <= availability.availableWeight;

      return {
        canAdd,
        availableWeight: availability.availableWeight,
        requiredWeight,
        message: canAdd
          ? undefined
          : `Daily limit exceeded for ${availability.mealName}. Only ${availability.availableWeight.toFixed(2)} kg available today, but ${requiredWeight.toFixed(2)} kg required.`,
      };
    } catch (error) {
      // If error fetching availability, allow the add (backend will validate)
      console.error("Error checking availability:", error);
      return {
        canAdd: true,
        availableWeight: null,
        requiredWeight: null,
      };
    }
  },
};

export default deliverableQuantityService;

