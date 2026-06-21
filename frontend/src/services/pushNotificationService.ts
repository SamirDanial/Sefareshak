import ApiService from "./apiService";

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private publicKey: string | null = null;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  private constructor() {}

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Check if browser supports push notifications
   */
  public isSupported(): boolean {
    return (
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }

  /**
   * Check current notification permission status
   */
  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) {
      return "denied";
    }
    return Notification.permission;
  }

  /**
   * Request notification permission from user
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      throw new Error("Push notifications are not supported in this browser");
    }

    if (Notification.permission === "granted") {
      return "granted";
    }

    if (Notification.permission === "denied") {
      throw new Error(
        "Notification permission was previously denied. Please enable it in your browser settings."
      );
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  /**
   * Register service worker
   */
  public async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported");
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      this.serviceWorkerRegistration = registration;
      return registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      throw error;
    }
  }

  /**
   * Get VAPID public key from backend
   */
  public async getPublicKey(): Promise<string> {
    if (this.publicKey) {
      return this.publicKey;
    }

    try {
      const apiService = ApiService.getInstance();
      const response = await apiService.get(
        "/api/push-notifications/public-key"
      );

      if (response.success && response.data?.publicKey) {
        const publicKey = response.data.publicKey;
        if (typeof publicKey === "string") {
          this.publicKey = publicKey;
          return this.publicKey;
        }
      }

      throw new Error("Failed to get public key");
    } catch (error) {
      console.error("Error getting VAPID public key:", error);
      throw error;
    }
  }

  /**
   * Convert base64 URL to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Subscribe to push notifications
   */
  public async subscribe(token?: string): Promise<PushSubscriptionData> {
    if (!this.isSupported()) {
      throw new Error("Push notifications are not supported");
    }

    // Check permission
    if (Notification.permission !== "granted") {
      const permission = await this.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied");
      }
    }

    // Register service worker if not already registered
    if (!this.serviceWorkerRegistration) {
      await this.registerServiceWorker();
    }

    // Get public key
    const publicKey = await this.getPublicKey();

    // Get existing subscription or create new one
    let subscription =
      await this.serviceWorkerRegistration!.pushManager.getSubscription();

    if (!subscription) {
      try {
        const keyArray = this.urlBase64ToUint8Array(publicKey);
        const buffer = new ArrayBuffer(keyArray.length);
        const view = new Uint8Array(buffer);
        view.set(keyArray);
        subscription =
          await this.serviceWorkerRegistration!.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: buffer,
          });
      } catch (error: any) {
        console.error("Error subscribing to push:", error);
        throw new Error(
          error.message || "Failed to subscribe to push notifications"
        );
      }
    }

    // Convert subscription to format needed for backend
    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: this.arrayBufferToBase64(
          subscription.getKey("p256dh") as ArrayBuffer
        ),
        auth: this.arrayBufferToBase64(
          subscription.getKey("auth") as ArrayBuffer
        ),
      },
    };

    // Send subscription to backend
    try {
      const apiService = ApiService.getInstance();
      await apiService.post(
        "/api/push-notifications/subscribe",
        {
          ...subscriptionData,
          userAgent: navigator.userAgent,
        },
        token
      );
    } catch (error) {
      console.error("Error sending subscription to backend:", error);
      throw error;
    }

    return subscriptionData;
  }

  /**
   * Unsubscribe from push notifications
   */
  public async unsubscribe(token?: string): Promise<void> {
    if (!this.serviceWorkerRegistration) {
      return;
    }

    const subscription =
      await this.serviceWorkerRegistration.pushManager.getSubscription();

    if (!subscription) {
      return;
    }

    const endpoint = subscription.endpoint;

    // Unsubscribe from push service
    try {
      await subscription.unsubscribe();
    } catch (error) {
      console.error("Error unsubscribing from push:", error);
    }

    // Remove subscription from backend
    try {
      const apiService = ApiService.getInstance();
      await apiService.post(
        "/api/push-notifications/unsubscribe",
        { endpoint },
        token
      );
    } catch (error) {
      console.error("Error removing subscription from backend:", error);
      throw error;
    }
  }

  /**
   * Check if user is currently subscribed
   */
  public async isSubscribed(): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      return false;
    }

    const subscription =
      await this.serviceWorkerRegistration.pushManager.getSubscription();
    return subscription !== null;
  }

  /**
   * Get current subscription
   */
  public async getSubscription(): Promise<PushSubscription | null> {
    if (!this.serviceWorkerRegistration) {
      return null;
    }

    return await this.serviceWorkerRegistration.pushManager.getSubscription();
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  /**
   * Initialize push notifications (register SW, request permission, subscribe)
   */
  public async initialize(token?: string): Promise<{
    subscribed: boolean;
    permission: NotificationPermission;
  }> {
    if (!this.isSupported()) {
      return {
        subscribed: false,
        permission: "denied",
      };
    }

    try {
      // Register service worker
      await this.registerServiceWorker();

      // Check permission
      const permission = this.getPermissionStatus();

      if (permission === "granted" && token) {
        // If permission granted and user is authenticated, subscribe
        try {
          await this.subscribe(token);
          return {
            subscribed: true,
            permission: "granted",
          };
        } catch (error) {
          console.error("Error subscribing during initialization:", error);
          return {
            subscribed: false,
            permission: "granted",
          };
        }
      }

      return {
        subscribed: false,
        permission,
      };
    } catch (error) {
      console.error("Error initializing push notifications:", error);
      return {
        subscribed: false,
        permission: this.getPermissionStatus(),
      };
    }
  }
}

export default PushNotificationService;
