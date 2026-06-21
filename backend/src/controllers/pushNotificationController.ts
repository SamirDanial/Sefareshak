import { Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";
import PushNotificationService from "../services/pushNotificationService";

export class PushNotificationController {
  /**
   * Get public VAPID key for frontend
   */
  public getPublicKey = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const pushService = PushNotificationService.getInstance();
      const publicKey = pushService.getPublicKey();

      res.json({
        success: true,
        data: { publicKey },
      });
    } catch (error: any) {
      console.error("Error getting VAPID public key:", error);
      const errorMessage = error?.message || "Failed to get public key";
      res.status(500).json({
        success: false,
        error: errorMessage.includes("not configured")
          ? "VAPID keys not configured. Please generate keys using 'node scripts/generate-vapid-keys.js' and add them to your .env file."
          : "Failed to get public key",
      });
    }
  };

  /**
   * Subscribe user to push notifications
   */
  public subscribe = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { endpoint, keys, userAgent, organizationId, branchId } = req.body;

      console.log("[PushNotificationController] Subscribe request received:", {
        userId: req.auth.userId,
        endpoint: endpoint.substring(0, 50) + "...",
        userAgent,
        hasKeys: !!keys,
        organizationId,
        branchId,
      });

      if (!endpoint) {
        res.status(400).json({
          success: false,
          error: "Missing required field: endpoint",
        });
        return;
      }

      // Check if this is an Expo subscription
      const isExpoSubscription =
        endpoint.startsWith("ExponentPushToken[") ||
        endpoint.startsWith("ExpoPushToken[") ||
        (userAgent && userAgent.startsWith("Expo/"));

      console.log("[PushNotificationController] Subscription type detected:", {
        isExpoSubscription,
        userAgent,
      });

      // For Expo subscriptions, keys can be empty
      // For web push subscriptions, keys are required
      if (!isExpoSubscription) {
        if (!keys || !keys.p256dh || !keys.auth) {
          res.status(400).json({
            success: false,
            error: "Missing required fields: keys.p256dh, keys.auth",
          });
          return;
        }

        const pushService = PushNotificationService.getInstance();

        // Validate subscription format for web push
        const subscription = {
          endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        };

        if (!pushService.validateSubscription(subscription)) {
          res.status(400).json({
            success: false,
            error: "Invalid subscription format",
          });
          return;
        }
      }

      const db = DatabaseSingleton.getInstance();

      // Check if subscription already exists
      const existingSubscription = await db
        .getPrisma()
        .pushSubscription.findUnique({
          where: { endpoint },
        });

      if (existingSubscription) {
        // Update existing subscription
        await db.getPrisma().pushSubscription.update({
          where: { endpoint },
          data: {
            userId: req.auth.userId,
            p256dh: keys?.p256dh || "",
            organizationId: organizationId || null,
            branchId: branchId || null,
            auth: keys?.auth || "",
            userAgent: userAgent || null,
          },
        });

        res.json({
          success: true,
          message: "Subscription updated successfully",
        });
        return;
      }

      // Create new subscription
      await db.getPrisma().pushSubscription.create({
        data: {
          userId: req.auth.userId,
          endpoint,
          organizationId: organizationId || null,
          branchId: branchId || null,
          p256dh: keys?.p256dh || "",
          auth: keys?.auth || "",
          userAgent: userAgent || null,
          isAppLevelSubscription: true, // Auto-set as app-level subscription
        },
      });

      res.json({
        success: true,
        message: "Subscribed to push notifications successfully",
      });
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to subscribe to push notifications",
      });
    }
  };

  /**
   * Unsubscribe user from push notifications
   */
  public unsubscribe = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { endpoint } = req.body;

      if (!endpoint) {
        res.status(400).json({
          success: false,
          error: "Missing endpoint",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Check if subscription exists and belongs to user
      const subscription = await db.getPrisma().pushSubscription.findUnique({
        where: { endpoint },
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
        return;
      }

      if (subscription.userId !== req.auth.userId) {
        res.status(403).json({
          success: false,
          error: "Forbidden: Subscription does not belong to user",
        });
        return;
      }

      // Delete subscription
      await db.getPrisma().pushSubscription.delete({
        where: { endpoint },
      });

      res.json({
        success: true,
        message: "Unsubscribed from push notifications successfully",
      });
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to unsubscribe from push notifications",
      });
    }
  };

  /**
   * Send notification to all subscribers (Admin only)
   */
  public sendNotification = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { title, message, image, actionUrl, actionLabel } = req.body;

      console.log("[PushNotificationController] Send notification request received:", {
        userId: req.auth.userId,
        title,
        message,
        image,
        actionUrl,
        actionLabel,
      });

      // Validation
      if (!title || !message) {
        res.status(400).json({
          success: false,
          error: "Title and message are required",
        });
        return;
      }

      if (title.length > 100) {
        res.status(400).json({
          success: false,
          error: "Title must be 100 characters or less",
        });
        return;
      }

      if (message.length > 500) {
        res.status(400).json({
          success: false,
          error: "Message must be 500 characters or less",
        });
        return;
      }

      const pushService = PushNotificationService.getInstance();

      if (!pushService.isInitialized()) {
        res.status(500).json({
          success: false,
          error:
            "Push notification service not initialized. Please configure VAPID keys in your .env file. Run 'node scripts/generate-vapid-keys.js' to generate keys.",
        });
        return;
      }

      // Send broadcast notification
      const result = await pushService.sendBroadcastNotification({
        title,
        message,
        image: image || undefined,
        actionUrl: actionUrl || undefined,
        actionLabel: actionLabel || undefined,
        sentBy: req.auth.userId,
      });

      console.log("[PushNotificationController] Notification send result:", {
        totalRecipients: result.totalRecipients,
        successful: result.successful,
        failed: result.failed,
      });

      // Customize response message based on recipients
      let responseMessage = "Notification sent successfully";
      if (result.totalRecipients === 0) {
        responseMessage =
          "Notification saved, but no active subscribers found. Users can enable push notifications in their settings.";
      }

      res.json({
        success: true,
        data: result,
        message: responseMessage,
      });
    } catch (error: any) {
      console.error("Error sending push notification:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to send push notification",
      });
    }
  };

  /**
   * Get notification history (Admin only)
   */
  public getHistory = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { page = 1, limit = 20 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const [notifications, total] = await Promise.all([
        db.getPrisma().pushNotification.findMany({
          skip,
          take: Number(limit),
          orderBy: {
            createdAt: "desc",
          },
          include: {
            _count: {
              select: {
                deliveries: true,
                clicks: true,
              },
            },
          },
        }),
        db.getPrisma().pushNotification.count(),
      ]);

      // Calculate stats for each notification
      const notificationsWithStats = await Promise.all(
        notifications.map(async (notification) => {
          const [delivered, failed, clicked] = await Promise.all([
            db.getPrisma().pushNotificationDelivery.count({
              where: {
                notificationId: notification.id,
                delivered: true,
              },
            }),
            db.getPrisma().pushNotificationDelivery.count({
              where: {
                notificationId: notification.id,
                failed: true,
              },
            }),
            db.getPrisma().pushNotificationClick.count({
              where: {
                notificationId: notification.id,
              },
            }),
          ]);

          const clickRate =
            notification.totalRecipients > 0
              ? (clicked / notification.totalRecipients) * 100
              : 0;

          return {
            ...notification,
            stats: {
              delivered,
              failed,
              clicked,
              clickRate: parseFloat(clickRate.toFixed(2)),
            },
          };
        })
      );

      res.json({
        success: true,
        data: {
          notifications: notificationsWithStats,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching notification history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notification history",
      });
    }
  };

  /**
   * Get detailed stats for a notification (Admin only)
   */
  public getStats = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { notificationId } = req.params;

      if (!notificationId) {
        res.status(400).json({
          success: false,
          error: "Notification ID is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      const notification = await db.getPrisma().pushNotification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        res.status(404).json({
          success: false,
          error: "Notification not found",
        });
        return;
      }

      const [delivered, failed, clicked] = await Promise.all([
        db.getPrisma().pushNotificationDelivery.count({
          where: {
            notificationId: notification.id,
            delivered: true,
          },
        }),
        db.getPrisma().pushNotificationDelivery.count({
          where: {
            notificationId: notification.id,
            failed: true,
          },
        }),
        db.getPrisma().pushNotificationClick.count({
          where: {
            notificationId: notification.id,
          },
        }),
      ]);

      const clickRate =
        notification.totalRecipients > 0
          ? (clicked / notification.totalRecipients) * 100
          : 0;

      res.json({
        success: true,
        data: {
          notification,
          stats: {
            totalRecipients: notification.totalRecipients,
            delivered,
            failed,
            clicked,
            clickRate: parseFloat(clickRate.toFixed(2)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching notification stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notification stats",
      });
    }
  };

  /**
   * Track notification click
   */
  public trackClick = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { notificationId, endpoint } = req.body;

      if (!notificationId || !endpoint) {
        res.status(400).json({
          success: false,
          error: "Notification ID and endpoint are required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Find subscription by endpoint
      const subscription = await db.getPrisma().pushSubscription.findUnique({
        where: { endpoint },
      });

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
        return;
      }

      // Check if click already exists
      const existingClick = await db
        .getPrisma()
        .pushNotificationClick.findFirst({
          where: {
            notificationId,
            subscriptionId: subscription.id,
          },
        });

      if (existingClick) {
        // Click already tracked
        res.json({
          success: true,
          message: "Click already tracked",
        });
        return;
      }

      // Create click record
      await db.getPrisma().pushNotificationClick.create({
        data: {
          notificationId,
          subscriptionId: subscription.id,
        },
      });

      res.json({
        success: true,
        message: "Click tracked successfully",
      });
    } catch (error) {
      console.error("Error tracking notification click:", error);
      res.status(500).json({
        success: false,
        error: "Failed to track click",
      });
    }
  };

  /**
   * Update app-level subscription status
   */
  public updateAppLevelSubscription = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: "enabled must be a boolean",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Update all subscriptions for this user
      await db.getPrisma().pushSubscription.updateMany({
        where: { userId: req.auth.userId },
        data: { isAppLevelSubscription: enabled },
      });

      res.json({
        success: true,
        message: enabled
          ? "App-level notifications enabled"
          : "App-level notifications disabled",
      });
    } catch (error) {
      console.error("Error updating app-level subscription:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update app-level subscription",
      });
    }
  };

  /**
   * Get app-level subscription status
   */
  public getAppLevelSubscriptionStatus = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      const subscriptions = await db.getPrisma().pushSubscription.findMany({
        where: { userId: req.auth.userId },
        select: { isAppLevelSubscription: true },
      });

      // User has app-level notifications enabled if any subscription has it enabled
      const isEnabled = subscriptions.some((s) => s.isAppLevelSubscription);

      res.json({
        success: true,
        data: { enabled: isEnabled },
      });
    } catch (error) {
      console.error("Error getting app-level subscription status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get app-level subscription status",
      });
    }
  };

  /**
   * Get total subscribers count (Admin only)
   */
  public getSubscribersCount = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      const count = await db.getPrisma().pushSubscription.count();

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      console.error("Error fetching subscribers count:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch subscribers count",
      });
    }
  };
}
