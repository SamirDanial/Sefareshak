import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect } from "react";

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://nextfoody.com";

// Lazy load expo-notifications and expo-device to avoid errors if native modules aren't available
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

const loadNotificationsModule = async () => {
  if (!Notifications) {
    try {
      const module = await import("expo-notifications");
      Notifications = module;

      // Configure notification handler - defer to avoid initialization race
      setTimeout(() => {
        try {
          if (Notifications?.setNotificationHandler) {
            Notifications.setNotificationHandler({
              handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
              }),
            });
          }
        } catch (err) {
          console.warn("Failed to set notification handler:", err);
        }
      }, 100);

      // Configure Android notification channel - defer to avoid initialization race
      if (Platform.OS === "android") {
        setTimeout(async () => {
          try {
            if (Notifications?.setNotificationChannelAsync && Notifications?.AndroidImportance) {
              await Notifications.setNotificationChannelAsync("default", {
                name: "default",
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#FF231F7C",
              });
            }
          } catch (err) {
            console.warn("Failed to set notification channel:", err);
          }
        }, 200);
      }
    } catch (error) {
      console.warn("Failed to load expo-notifications:", error);
      return false;
    }
  }
  return true;
};

const loadDeviceModule = async () => {
  if (!Device) {
    try {
      Device = await import("expo-device");
    } catch (error) {
      console.warn("Failed to load expo-device:", error);
      return false;
    }
  }
  return true;
};

class PushNotificationService {
  private static instance: PushNotificationService;
  private expoPushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;

  private constructor() {}

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Check if push notifications are supported
   */
  public async isSupported(): Promise<boolean> {
    try {
      const deviceLoaded = await loadDeviceModule();
      if (!deviceLoaded || !Device) {
        return false;
      }
      return Device.isDevice;
    } catch (error) {
      return false;
    }
  }

  /**
   * Request notification permissions
   */
  public async requestPermission(): Promise<boolean> {
    try {
      const notificationsLoaded = await loadNotificationsModule();
      const deviceLoaded = await loadDeviceModule();

      if (!notificationsLoaded || !deviceLoaded || !Notifications || !Device) {
        console.error("[PushNotificationService] Modules not available for permission request");
        return false;
      }

      if (!Device.isDevice) {
        console.error("[PushNotificationService] Not a physical device");
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log("[PushNotificationService] Existing permission status:", existingStatus);
      console.log("[PushNotificationService] Platform:", Platform.OS);
      console.log("[PushNotificationService] Device model:", Device.modelName);

      // Always request permission to ensure the dialog is shown
      // This is especially important on Android 13+ where POST_NOTIFICATIONS is a runtime permission
      console.log("[PushNotificationService] Forcing permission request to ensure dialog is shown...");
      const { status } = await Notifications.requestPermissionsAsync();
      console.log("[PushNotificationService] Permission request result:", status);

      if (status !== "granted") {
        console.warn("[PushNotificationService] Permission denied, status:", status);
        return false;
      }

      console.log("[PushNotificationService] Permission granted");
      return true;
    } catch (error) {
      console.error("[PushNotificationService] Error requesting permission:", error);
      return false;
    }
  }

  /**
   * Register for push notifications and get Expo push token
   */
  public async registerForPushNotifications(
    token?: string,
    organizationId?: string,
    branchId?: string
  ): Promise<string | null> {
    try {
      const notificationsLoaded = await loadNotificationsModule();
      const deviceLoaded = await loadDeviceModule();

      if (!notificationsLoaded || !deviceLoaded || !Notifications || !Device) {
        console.error("[PushNotificationService] Push notification modules not available");
        return null;
      }

      if (!Device.isDevice) {
        console.warn("[PushNotificationService] Push notifications only work on physical devices");
        return null;
      }

      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn("[PushNotificationService] Push notification permission denied");
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      this.expoPushToken = tokenData.data;

      console.log("[PushNotificationService] Expo push token obtained:", {
        token: this.expoPushToken?.substring(0, 30) + "...",
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
        platform: Platform.OS,
      });

      if (!this.expoPushToken) {
        console.error("[PushNotificationService] Could not get Expo push token");
        return null;
      }

      if (token) {
        try {
          console.log("[PushNotificationService] Sending push token to backend");

          const response = await fetch(
            `${API_BASE_URL}/api/push-notifications/subscribe`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                endpoint: this.expoPushToken,
                keys: {
                  p256dh: "",
                  auth: "",
                },
                userAgent: `Expo/${Platform.OS}`,
                organizationId,
                branchId,
                expoPushToken: this.expoPushToken,
                platform: Platform.OS,
              }),
            }
          );

          if (!response.ok) {
            const error = await response.text();
            console.error("[PushNotificationService] Failed to register push token:", error);
            return null;
          }

          console.log("[PushNotificationService] Push token registered successfully with backend");
        } catch (error: any) {
          console.error("[PushNotificationService] Error registering push token:", error);
          return null;
        }
      } else {
        console.warn("[PushNotificationService] No authentication token available");
      }

      // Set up notification listeners
      console.log("[PushNotificationService] Setting up notification listeners...");
      this.setupNotificationListeners(
        (notification) => {
          console.log("[PushNotificationService] Notification received:", notification);
        },
        (response) => {
          console.log("[PushNotificationService] Notification tapped:", response);
        }
      );

      return this.expoPushToken;
    } catch (error: any) {
      console.error("[PushNotificationService] Error registering for push notifications:", error);
      return null;
    }
  }

  /**
   * Unregister from push notifications
   */
  public async unregister(token?: string): Promise<void> {
    if (this.expoPushToken && token) {
      try {
        await fetch(`${API_BASE_URL}/api/push-notifications/unsubscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            endpoint: this.expoPushToken,
          }),
        });
      } catch (error) {
        console.error("Error unregistering push token:", error);
      }
    }

    this.expoPushToken = null;
    this.removeNotificationListeners();
  }

  /**
   * Get current Expo push token
   */
  public getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Set up notification listeners
   */
  public setupNotificationListeners(
    onNotificationReceived?: (notification: any) => void,
    onNotificationTapped?: (response: any) => void
  ): void {
    // Remove existing listeners
    this.removeNotificationListeners();

    // Load modules asynchronously
    loadNotificationsModule().then((loaded) => {
      if (!loaded || !Notifications) {
        console.warn(
          "Cannot setup notification listeners: module not available"
        );
        return;
      }

      // Listener for notifications received while app is foregrounded
      // Commented out to allow notifications to show in status bar even when app is in foreground
      // this.notificationListener = Notifications.addNotificationReceivedListener(
      //   (notification) => {
      //     console.log("[PushNotificationService] ========== NOTIFICATION RECEIVED ==========");
      //     console.log("[PushNotificationService] Full notification object:", JSON.stringify(notification, null, 2));
      //     console.log("[PushNotificationService] Notification request content:", JSON.stringify(notification.request.content, null, 2));
      //     console.log("[PushNotificationService] ==================================================");
      //     onNotificationReceived?.(notification);
      //   }
      // );

      // Listener for when user taps on notification
      this.responseListener =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log("[PushNotificationService] ========== NOTIFICATION TAPPED ==========");
          console.log("[PushNotificationService] Full response object:", JSON.stringify(response, null, 2));
          console.log("[PushNotificationService] ===========================================");
          onNotificationTapped?.(response);

          // Handle action URL if present
          const data = response.notification.request.content.data;
          if (data?.actionUrl) {
            const Linking = require("expo-linking");
            Linking.openURL(data.actionUrl);
          }
        });
    });
  }

  /**
   * Remove notification listeners
   */
  public removeNotificationListeners(): void {
    if (this.notificationListener) {
      try {
        if (typeof this.notificationListener.remove === 'function') {
          this.notificationListener.remove();
        }
      } catch (error) {
        // Silently fail
      }
      this.notificationListener = null;
    }
    if (this.responseListener) {
      try {
        if (typeof this.responseListener.remove === 'function') {
          this.responseListener.remove();
        }
      } catch (error) {
        // Silently fail
      }
      this.responseListener = null;
    }
  }

  /**
   * Get notification permission status
   */
  public async getPermissionStatus(): Promise<string> {
    try {
      const loaded = await loadNotificationsModule();
      if (!loaded || !Notifications) {
        return "undetermined";
      }
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch (error) {
      return "undetermined";
    }
  }

  /**
   * Check if currently registered
   */
  public isRegistered(): boolean {
    return this.expoPushToken !== null;
  }
}

export default PushNotificationService;

/**
 * Hook for managing push notification permissions
 * Similar to expo-camera's useCameraPermissions
 */
export function usePushNotificationPermissions() {
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestPermission = async () => {
    setIsLoading(true);
    try {
      const service = PushNotificationService.getInstance();
      const granted = await service.requestPermission();
      
      const notificationsLoaded = await loadNotificationsModule();
      if (notificationsLoaded && Notifications) {
        const { status } = await Notifications.getPermissionsAsync();
        setPermission({
          granted: status === "granted",
          canAskAgain: status !== "denied",
        });
      }
      
      return granted;
    } catch (error) {
      console.error("[usePushNotificationPermissions] Error requesting permission:", error);
      setPermission({ granted: false, canAskAgain: true });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const checkPermission = async () => {
      const service = PushNotificationService.getInstance();
      const status = await service.getPermissionStatus();
      setPermission({
        granted: status === "granted",
        canAskAgain: status !== "denied",
      });
    };
    checkPermission();
  }, []);

  return { permission, requestPermission, isLoading };
}
