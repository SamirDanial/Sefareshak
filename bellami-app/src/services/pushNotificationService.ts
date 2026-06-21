import { Platform } from "react-native";
import Constants from "expo-constants";
import { Alert } from "react-native";

// IMPORTANT: Push notifications only work on physical iOS and Android devices.
// iOS simulators cannot generate Expo push tokens and will not receive push notifications.
// For testing push notifications, use a physical device or Expo Go on a physical device.
const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "=https://nextfoody.com";

// Lazy load expo-notifications and expo-device to avoid errors if native modules aren't available
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

const loadNotificationsModule = async () => {
  if (!Notifications) {
    try {
      Notifications = await import("expo-notifications");

      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
        handleSuccess: async (notificationId) => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      // Configure Android notification channel for images
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });

        // Create a separate channel for image notifications
        await Notifications.setNotificationChannelAsync("image-notifications", {
          name: "Image Notifications",
          description: "Notifications with images",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
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

export interface PushNotificationData {
  title: string;
  body: string;
  data?: any;
  image?: string;
  actionUrl?: string;
  actionLabel?: string;
}

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
        Alert.alert(
          "Not Supported",
          "Push notifications are only available on physical devices with native modules installed."
        );
        return false;
      }

      if (!Device.isDevice) {
        Alert.alert(
          "Not Supported",
          "Push notifications are only available on physical devices."
        );
        return false;
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings."
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error requesting permission:", error);
      return false;
    }
  }

  /**
   * Register for push notifications and get Expo push token
   */
  public async registerForPushNotifications(
    token?: string
  ): Promise<string | null> {
    try {
      const notificationsLoaded = await loadNotificationsModule();
      const deviceLoaded = await loadDeviceModule();

      if (!notificationsLoaded || !deviceLoaded || !Notifications || !Device) {
        const errorMsg = `Step 1/5 FAILED: Push notification modules not available\n\nPlatform: ${Platform.OS}\nNotifications loaded: ${notificationsLoaded}\nDevice loaded: ${deviceLoaded}\n\nPlease ensure expo-notifications and expo-device are installed in package.json.`;
        console.error("[PushNotificationService] Error:", errorMsg);
        Alert.alert("Push Notification Error", errorMsg);
        return null;
      }

      if (!Device.isDevice) {
        const errorMsg = `Step 2/5 FAILED: Not a physical device\n\nPlatform: ${Platform.OS}\nDevice.isDevice: ${Device.isDevice}\nDevice.modelName: ${Device.modelName || 'unknown'}\n\nPush notifications only work on physical devices, not emulators.\nPlease use a physical Android device to test push notifications.`;
        console.error("[PushNotificationService] Error:", errorMsg);
        Alert.alert("Push Notification Error", errorMsg);
        return null;
      }

      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        const errorMsg = `Step 3/5 FAILED: Permission denied\n\nPlatform: ${Platform.OS}\n\nPush notification permission was denied.\n\nTo fix:\n1. Go to Settings > Apps > Next Foody\n2. Tap Notifications\n3. Enable "Allow notifications"\n4. Reopen the app and try again`;
        console.error("[PushNotificationService] Error:", errorMsg);
        Alert.alert("Push Notification Error", errorMsg);
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
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const errorMsg = `Step 4/5 FAILED: Could not get Expo push token\n\nPlatform: ${Platform.OS}\nEAS Project ID: ${projectId || 'NOT FOUND'}\n\nThe Expo push token is null or undefined.\n\nTo fix:\n1. Check that EAS project ID is configured in app.json\n2. Ensure the project ID matches your Expo dashboard\n3. Make sure Firebase credentials are configured in Expo dashboard\n4. Rebuild the app after configuration changes`;
        console.error("[PushNotificationService] Error:", errorMsg);
        Alert.alert("Push Notification Error", errorMsg);
        return null;
      }

      if (token) {
        try {
          console.log("[PushNotificationService] Sending push token to backend:", {
            url: `${API_BASE_URL}/api/push-notifications/subscribe`,
            tokenPrefix: this.expoPushToken?.substring(0, 20) + "...",
          });

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
                expoPushToken: this.expoPushToken,
                platform: Platform.OS,
              }),
            }
          );

          console.log("[PushNotificationService] Backend response:", {
            status: response.status,
            ok: response.ok,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = `Step 5/5 FAILED: Backend registration error\n\nPlatform: ${Platform.OS}\nBackend URL: ${API_BASE_URL}/api/push-notifications/subscribe\nHTTP Status: ${response.status}\nError: ${errorData.error || response.statusText}\n\nExpo Token: ${this.expoPushToken.substring(0, 20)}...\n\nTo fix:\n1. Check if backend server is running\n2. Verify API_BASE_URL is correct\n3. Check backend logs for more details\n4. Ensure you are logged in with valid session`;
            console.error("[PushNotificationService] Error:", errorMsg);
            Alert.alert("Push Notification Error", errorMsg);
            return null;
          }

          console.log("[PushNotificationService] Push token registered successfully with backend");
          const responseData = await response.json().catch(() => ({}));
          console.log("[PushNotificationService] Backend response data:", responseData);
        } catch (error: any) {
          const errorMsg = `Step 5/5 FAILED: Network error\n\nPlatform: ${Platform.OS}\nBackend URL: ${API_BASE_URL}/api/push-notifications/subscribe\nError: ${error.message}\n\nExpo Token: ${this.expoPushToken.substring(0, 20)}...\n\nTo fix:\n1. Check internet connection\n2. Verify backend server is running\n3. Check if device can reach the backend URL\n4. Ensure you are logged in with valid session`;
          console.error("[PushNotificationService] Error:", errorMsg);
          Alert.alert("Push Notification Error", errorMsg);
          return null;
        }
      } else {
        const errorMsg = `Step 5/5 FAILED: No authentication token\n\nPlatform: ${Platform.OS}\nExpo Token: ${this.expoPushToken.substring(0, 20)}...\n\nYou are not logged in or your session has expired.\n\nTo fix:\n1. Log out and log back in\n2. Ensure Clerk authentication is working\n3. Check if you have a valid session`;
        console.error("[PushNotificationService] Error:", errorMsg);
        Alert.alert("Push Notification Error", errorMsg);
        return null;
      }

      return this.expoPushToken;
    } catch (error: any) {
      const errorMsg = `Step FAILED: Unexpected error\n\nPlatform: ${Platform.OS}\nError: ${error.message}\nCode: ${error.code || 'N/A'}\n\nThis is an unexpected error during push notification registration.\n\nExpo Token: ${this.expoPushToken ? this.expoPushToken.substring(0, 20) + '...' : 'not obtained'}\n\nTo fix:\n1. Check console logs for full error details\n2. Verify all Expo packages are installed correctly\n3. Ensure the app has proper permissions\n4. Report this error with the full error message`;
      console.error("[PushNotificationService] Error:", errorMsg);
      console.error("[PushNotificationService] Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      Alert.alert("Push Notification Error", errorMsg);
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
            endpoint: this.expoPushToken, // Use Expo token as endpoint for unsubscribe
          }),
        });
      } catch (error) {
        console.error("Error unregistering push token:", error);
      }
    }

    this.expoPushToken = null;
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
      this.notificationListener = Notifications.addNotificationReceivedListener(
        (notification) => {
          onNotificationReceived?.(notification);
        }
      );

      // Listener for when user taps on notification
      this.responseListener =
        Notifications.addNotificationResponseReceivedListener((response) => {
          onNotificationTapped?.(response);

          // Handle action URL if present
          const data = response.notification.request.content.data;
          if (data?.actionUrl) {
            // You can use expo-linking to open the URL
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
        // In newer versions of expo-notifications, subscription objects have a remove() method
        if (typeof this.notificationListener.remove === 'function') {
          this.notificationListener.remove();
        }
      } catch (error) {
        // Silently fail - don't log warnings for deprecated API issues
      }
      this.notificationListener = null;
    }
    if (this.responseListener) {
      try {
        // In newer versions of expo-notifications, subscription objects have a remove() method
        if (typeof this.responseListener.remove === 'function') {
          this.responseListener.remove();
        }
      } catch (error) {
        // Silently fail - don't log warnings for deprecated API issues
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

export default PushNotificationService.getInstance();
