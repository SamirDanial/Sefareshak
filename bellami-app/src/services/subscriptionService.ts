import ApiService from "./apiService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PushNotificationService from "./pushNotificationService";

class SubscriptionService {
  private static instance: SubscriptionService;

  private constructor() {}

  public static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Subscribe to a branch
   */
  async subscribeToBranch(branchId: string, token?: string) {
    try {
      if (!token) {
        throw new Error("Authentication required");
      }

      const pushService = PushNotificationService;
      const expoPushToken = await pushService.registerForPushNotifications(token);

      const apiService = ApiService.getInstance();
      const response = await apiService.post(
        `/api/subscriptions/branches/${branchId}/subscribe`,
        {},
        token
      );

      return response;
    } catch (error) {
      console.error("[SubscriptionService] Failed to subscribe to branch:", error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a branch
   */
  async unsubscribeFromBranch(branchId: string, token?: string) {
    try {
      if (!token) {
        throw new Error("Authentication required");
      }

      const apiService = ApiService.getInstance();
      const response = await apiService.delete(
        `/api/subscriptions/branches/${branchId}/unsubscribe`,
        token
      );

      return response;
    } catch (error) {
      console.error("Failed to unsubscribe from branch:", error);
      throw error;
    }
  }

  /**
   * Get subscription status for a specific branch
   */
  async getSubscriptionStatus(branchId: string, token?: string): Promise<{ isSubscribed: boolean; subscription?: any }> {
    try {
      if (!token) {
        return { isSubscribed: false };
      }

      const apiService = ApiService.getInstance();
      const response = await apiService.get(
        `/api/subscriptions/branches/${branchId}/subscription-status`,
        token
      );

      return response.data || { isSubscribed: false };
    } catch (error) {
      // If user is not authenticated or subscription not found, return unsubscribed
      console.error("Failed to get subscription status:", error);
      return { isSubscribed: false };
    }
  }

  /**
   * Get all branches the user is subscribed to
   */
  async getUserSubscriptions(token?: string, page = 1, limit = 20) {
    try {
      if (!token) {
        return { subscriptions: [], pagination: { page, limit, total: 0, pages: 0 } };
      }

      const apiService = ApiService.getInstance();
      const response = await apiService.get(
        `/api/subscriptions/user/subscriptions?page=${page}&limit=${limit}`,
        token
      );

      return response.data || { subscriptions: [], pagination: { page, limit, total: 0, pages: 0 } };
    } catch (error) {
      console.error("Failed to get user subscriptions:", error);
      throw error;
    }
  }
}

export default SubscriptionService;
