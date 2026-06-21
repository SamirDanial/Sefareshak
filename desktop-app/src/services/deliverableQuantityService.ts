import ApiService from "./apiService";

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

const unwrapData = <T,>(response: unknown): T => {
  if (response && typeof response === "object" && "data" in (response as any)) {
    return (response as any).data as T;
  }
  return response as T;
};

export const deliverableQuantityService = {
  async getMealsForBranch(branchId: string, token?: string): Promise<MealWithSizes[]> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(
      `/api/admin/deliverable-quantities/branches/${branchId}/meals`,
      token
    );
    return unwrapData<MealWithSizes[]>(response);
  },

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
    return unwrapData<{ mealId: string; sizes: MealSizeWithWeight[] }>(response);
  },

  async upsertSizeWeight(data: UpsertSizeWeightRequest, token?: string): Promise<MealSizeWeightRecord> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/admin/deliverable-quantities/size-weights`, data, token);
    return unwrapData<MealSizeWeightRecord>(response);
  },

  async deleteSizeWeight(id: string, token?: string): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/admin/deliverable-quantities/size-weights/${id}`, token);
  },

  async getDailyDeliverable(branchId: string, mealId: string, token?: string): Promise<DailyDeliverable | null> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/deliverable-quantities/daily/${branchId}/${mealId}`, token);
    return unwrapData<DailyDeliverable | null>(response);
  },

  async upsertDailyDeliverable(data: UpsertDailyDeliverableRequest, token?: string): Promise<DailyDeliverable> {
    const apiService = ApiService.getInstance();
    const response = await apiService.post(`/api/admin/deliverable-quantities/daily`, data, token);
    return unwrapData<DailyDeliverable>(response);
  },

  async deleteDailyDeliverable(branchId: string, mealId: string, token?: string): Promise<void> {
    const apiService = ApiService.getInstance();
    await apiService.delete(`/api/admin/deliverable-quantities/daily/${branchId}/${mealId}`, token);
  },

  async getAvailableWeight(branchId: string, mealId: string, token?: string): Promise<AvailableWeight> {
    const apiService = ApiService.getInstance();
    const response = await apiService.get(`/api/admin/deliverable-quantities/available/${branchId}/${mealId}`, token);
    return unwrapData<AvailableWeight>(response);
  },
};
