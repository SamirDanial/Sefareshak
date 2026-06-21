import webpush, { PushSubscription, SendResult } from "web-push";
import DatabaseSingleton from "../config/database";

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  badge?: string;
  tag?: string;
  data?: any;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

interface ExpoPushMessage {
  to: string;
  sound?: string;
  title?: string;
  body?: string;
  data?: any;
  badge?: number;
  image?: string;
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized: boolean = false;

  private constructor() {
    this.initializeVAPID();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize VAPID keys from environment variables
   */
  private initializeVAPID(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:support@nextfoody.de";

    if (!publicKey || !privateKey) {
      console.warn(
        "⚠️  VAPID keys not found in environment variables. Push notifications will not work."
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.initialized = true;
  }

  /**
   * Validate subscription format
   */
  public validateSubscription(
    subscription: any
  ): subscription is PushSubscription {
    return (
      subscription &&
      typeof subscription === "object" &&
      typeof subscription.endpoint === "string" &&
      subscription.keys &&
      typeof subscription.keys.p256dh === "string" &&
      typeof subscription.keys.auth === "string"
    );
  }

  /**
   * Check if a subscription is an Expo push token
   */
  private isExpoSubscription(subscription: any): boolean {
    // Expo tokens start with "ExponentPushToken" or "ExpoPushToken"
    return (
      typeof subscription.endpoint === "string" &&
      (subscription.endpoint.startsWith("ExponentPushToken[") ||
        subscription.endpoint.startsWith("ExpoPushToken["))
    );
  }

  /**
   * Send notification to Expo push token
   */
  private async sendExpoNotification(
    expoPushToken: string,
    payload: NotificationPayload
  ): Promise<void> {
    const expoPushMessage: ExpoPushMessage = {
      to: expoPushToken,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data,
      badge: payload.badge ? Number(payload.badge) : undefined,
    };

    if (payload.image) {
      expoPushMessage.image = payload.image;
    }

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(expoPushMessage),
    });


    const result = (await response.json()) as any;

    if (!response.ok) {
      const errorMessage = result?.data?.error || `HTTP ${response.status}`;

      // Handle specific Expo error codes
      if (errorMessage.includes("DeviceNotRegistered")) {
        throw new Error("Subscription expired");
      } else if (errorMessage.includes("MessageTooBig")) {
        throw new Error("Message too big");
      } else if (errorMessage.includes("RateLimitExceeded")) {
        throw new Error("Rate limited");
      } else {
        throw new Error(errorMessage);
      }
    }

    if (result.data?.status === "error") {
      const errorMessage = result.data.message || "Unknown error";
      if (errorMessage.includes("DeviceNotRegistered")) {
        throw new Error("Subscription expired");
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * Send notification to a single subscription
   */
  public async sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload,
    userAgent?: string | null
  ): Promise<SendResult | void> {
    // Check if this is an Expo subscription
    const isExpo =
      this.isExpoSubscription(subscription) ||
      (userAgent && userAgent.startsWith("Expo/"));

    if (isExpo) {
      // Extract Expo push token from endpoint
      const expoToken = subscription.endpoint;
      await this.sendExpoNotification(expoToken, payload);
      return {} as SendResult; // Return empty result for Expo
    }

    // Use web-push for web subscriptions
    if (!this.initialized) {
      throw new Error("VAPID keys not initialized");
    }

    try {
      const payloadString = JSON.stringify(payload);
      const result = await webpush.sendNotification(
        subscription,
        payloadString
      );
      return result;
    } catch (error: any) {
      // Handle specific error codes
      if (error.statusCode === 410) {
        // Subscription expired or no longer valid
        throw new Error("Subscription expired");
      } else if (error.statusCode === 429) {
        // Too many requests
        throw new Error("Rate limited");
      } else {
        throw error;
      }
    }
  }

  /**
   * Send notification to all active subscriptions
   */
  public async sendBroadcastNotification(notificationData: {
    title: string;
    message: string;
    image?: string;
    actionUrl?: string;
    actionLabel?: string;
    sentBy: string;
  }): Promise<{
    notificationId: string;
    totalRecipients: number;
    successful: number;
    failed: number;
  }> {
    const db = DatabaseSingleton.getInstance();

    // Get all app-level subscriptions
    const subscriptions = await db.getPrisma().pushSubscription.findMany({
      where: {
        isAppLevelSubscription: true,
      },
    });

    // Create notification record (even if no subscriptions)
    const notificationTitle = `[Next Foody] ${notificationData.title}`;
    const notification = await db.getPrisma().pushNotification.create({
      data: {
        title: notificationTitle,
        message: notificationData.message,
        image: notificationData.image || null,
        actionUrl: notificationData.actionUrl || null,
        actionLabel: notificationData.actionLabel || null,
        sentBy: notificationData.sentBy,
        totalRecipients: subscriptions.length,
      },
    });

    // If no subscriptions, return early with success (notification saved for history)
    if (subscriptions.length === 0) {
      return {
        notificationId: notification.id,
        totalRecipients: 0,
        successful: 0,
        failed: 0,
      };
    }

    // Prepare payload
    // Ensure body uses only the message - don't combine with title or any other text
    const payload: NotificationPayload = {
      title: notificationTitle,
      body: notificationData.message || "", // Use message directly as body, no prepending
      icon: "/NextFoody.png", // Default application icon
      badge: "/NextFoody.png", // Default badge icon
      tag: `notification-${notification.id}`, // Unique tag for each notification
      data: {
        notificationId: notification.id,
        actionUrl: notificationData.actionUrl,
      },
    };

    // Add image if provided
    if (notificationData.image) {
      payload.image = notificationData.image;
    }

    // Add action button if actionUrl and actionLabel are provided
    if (notificationData.actionUrl && notificationData.actionLabel) {
      payload.actions = [
        {
          action: "view",
          title: notificationData.actionLabel,
        },
      ];
    }

    let successful = 0;
    let failed = 0;

    // Send to all subscriptions
    const deliveryPromises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription: PushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh || "",
            auth: sub.auth || "",
          },
        };

        await this.sendNotification(pushSubscription, payload, sub.userAgent);

        // Record successful delivery
        await db.getPrisma().pushNotificationDelivery.create({
          data: {
            notificationId: notification.id,
            subscriptionId: sub.id,
            delivered: true,
            deliveredAt: new Date(),
          },
        });

        successful++;
        return { success: true, subscriptionId: sub.id };
      } catch (error: any) {
        const errorMessage =
          error.message || error.toString() || "Unknown error";

        // Record failed delivery
        await db.getPrisma().pushNotificationDelivery.create({
          data: {
            notificationId: notification.id,
            subscriptionId: sub.id,
            delivered: false,
            failed: true,
            failureReason: errorMessage,
          },
        });

        failed++;

        // If subscription expired or device not registered, delete it
        if (
          errorMessage === "Subscription expired" ||
          errorMessage.includes("DeviceNotRegistered") ||
          errorMessage.includes("410 Gone")
        ) {
          try {
            await db.getPrisma().pushSubscription.delete({
              where: { id: sub.id },
            });
          } catch (deleteError) {
            console.error(
              `Failed to delete expired subscription ${sub.id}:`,
              deleteError
            );
          }
        }

        return {
          success: false,
          subscriptionId: sub.id,
          error: errorMessage,
        };
      }
    });

    await Promise.all(deliveryPromises);

    return {
      notificationId: notification.id,
      totalRecipients: subscriptions.length,
      successful,
      failed,
    };
  }

  /**
   * Get public VAPID key for frontend
   */
  public getPublicKey(): string {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      throw new Error("VAPID public key not configured");
    }
    return publicKey;
  }

  /**
   * Check if service is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Send notification to organization subscribers
   * If branchId is provided, send only to subscribers of that branch
   * If no branchId, send to all subscribers of any branch in the organization
   */
  public async sendOrganizationNotification(notificationData: {
    organizationId: string;
    branchId?: string;
    title: string;
    message: string;
    image?: string;
    actionUrl?: string;
    actionLabel?: string;
    sentBy: string;
  }): Promise<{
    notificationId: string;
    totalRecipients: number;
    successful: number;
    failed: number;
  }> {
    const db = DatabaseSingleton.getInstance();

    // Get user IDs subscribed to the organization/branch
    let subscribedUserIds: string[] = [];

    if (notificationData.branchId) {
      // Get users subscribed to specific branch
      const subscriptions = await db.getPrisma().branchSubscription.findMany({
        where: {
          branchId: notificationData.branchId,
          branch: {
            organizationId: notificationData.organizationId,
          },
        },
        select: {
          userId: true,
        },
      });
      subscribedUserIds = subscriptions.map((s) => s.userId);
    } else {
      // Get users subscribed to any branch in the organization
      const subscriptions = await db.getPrisma().branchSubscription.findMany({
        where: {
          branch: {
            organizationId: notificationData.organizationId,
          },
        },
        select: {
          userId: true,
        },
      });
      subscribedUserIds = subscriptions.map((s) => s.userId);
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(subscribedUserIds)];

    // Get Clerk user IDs for these database user IDs
    const users = await db.getPrisma().user.findMany({
      where: {
        id: {
          in: uniqueUserIds,
        },
      },
      select: {
        clerkId: true,
      },
    });

    const clerkUserIds = users.map((u) => u.clerkId).filter(Boolean);

    // Get push subscriptions for these Clerk user IDs
    const pushSubscriptions = await db.getPrisma().pushSubscription.findMany({
      where: {
        userId: {
          in: clerkUserIds,
        },
      },
    });

    // Fetch organization name for notification title
    const organization = await db.getPrisma().organization.findUnique({
      where: { id: notificationData.organizationId },
      select: { name: true },
    });

    const organizationName = organization?.name || "Next Foody";
    const notificationTitle = `[${organizationName}] ${notificationData.title}`;

    // Create notification record
    const notification = await db.getPrisma().pushNotification.create({
      data: {
        title: notificationTitle,
        message: notificationData.message,
        image: notificationData.image || null,
        actionUrl: notificationData.actionUrl || null,
        actionLabel: notificationData.actionLabel || null,
        sentBy: notificationData.sentBy,
        totalRecipients: pushSubscriptions.length,
        organizationId: notificationData.organizationId,
        branchId: notificationData.branchId || null,
      },
    });

    // If no push subscriptions, return early with success
    if (pushSubscriptions.length === 0) {
      return {
        notificationId: notification.id,
        totalRecipients: 0,
        successful: 0,
        failed: 0,
      };
    }

    // Prepare payload
    const payload: NotificationPayload = {
      title: notificationTitle,
      body: notificationData.message || "",
      icon: "/NextFoody.png",
      badge: "/NextFoody.png",
      tag: `notification-${notification.id}`,
      data: {
        notificationId: notification.id,
        actionUrl: notificationData.actionUrl,
        branchId: notificationData.branchId || null,
        organizationId: notificationData.organizationId,
      },
    };

    if (notificationData.image) {
      payload.image = notificationData.image;
    }

    if (notificationData.actionUrl && notificationData.actionLabel) {
      payload.actions = [
        {
          action: "view",
          title: notificationData.actionLabel,
        },
      ];
    }

    let successful = 0;
    let failed = 0;

    // Send to all subscriptions
    const deliveryPromises = pushSubscriptions.map(async (sub) => {
      try {
        const pushSubscription: PushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh || "",
            auth: sub.auth || "",
          },
        };

        await this.sendNotification(pushSubscription, payload, sub.userAgent);

        // Record successful delivery
        await db.getPrisma().pushNotificationDelivery.create({
          data: {
            notificationId: notification.id,
            subscriptionId: sub.id,
            delivered: true,
            deliveredAt: new Date(),
          },
        });

        successful++;
        return { success: true, subscriptionId: sub.id };
      } catch (error: any) {
        const errorMessage =
          error.message || error.toString() || "Unknown error";

        // Record failed delivery
        await db.getPrisma().pushNotificationDelivery.create({
          data: {
            notificationId: notification.id,
            subscriptionId: sub.id,
            delivered: false,
            failed: true,
            failureReason: errorMessage,
          },
        });

        failed++;

        // If subscription expired or device not registered, delete it
        if (
          errorMessage === "Subscription expired" ||
          errorMessage.includes("DeviceNotRegistered") ||
          errorMessage.includes("410 Gone")
        ) {
          try {
            await db.getPrisma().pushSubscription.delete({
              where: { id: sub.id },
            });
          } catch (deleteError) {
            console.error(
              `Failed to delete expired subscription ${sub.id}:`,
              deleteError
            );
          }
        }

        return {
          success: false,
          subscriptionId: sub.id,
          error: errorMessage,
        };
      }
    });

    await Promise.all(deliveryPromises);

    return {
      notificationId: notification.id,
      totalRecipients: pushSubscriptions.length,
      successful,
      failed,
    };
  }
}

export default PushNotificationService;
