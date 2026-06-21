import { Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";
import PushNotificationService from "../services/pushNotificationService";

export class OrganizationPushNotificationController {
  /**
   * Send notification to organization subscribers
   */
  public sendOrganizationNotification = async (
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

      const { organizationId } = req.params;
      const { branchId, title, message, image, actionUrl, actionLabel } = req.body;

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

      const db = DatabaseSingleton.getInstance();

      // Validate organization exists
      const organization = await db.getPrisma().organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        res.status(404).json({
          success: false,
          error: "Organization not found",
        });
        return;
      }

      // If branchId provided, validate branch belongs to organization
      if (branchId) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId },
        });

        if (!branch) {
          res.status(404).json({
            success: false,
            error: "Branch not found",
          });
          return;
        }

        if (branch.organizationId !== organizationId) {
          res.status(400).json({
            success: false,
            error: "Branch does not belong to this organization",
          });
          return;
        }
      }

      const pushService = PushNotificationService.getInstance();

      if (!pushService.isInitialized()) {
        res.status(500).json({
          success: false,
          error:
            "Push notification service not initialized. Please configure VAPID keys in your .env file.",
        });
        return;
      }

      // Send organization notification
      const result = await pushService.sendOrganizationNotification({
        organizationId,
        branchId,
        title,
        message,
        image: image || undefined,
        actionUrl: actionUrl || undefined,
        actionLabel: actionLabel || undefined,
        sentBy: req.auth.userId,
      });

      let responseMessage = "Notification sent successfully";
      if (result.totalRecipients === 0) {
        responseMessage =
          "Notification saved, but no subscribers found for this organization.";
      }

      res.json({
        success: true,
        data: result,
        message: responseMessage,
      });
    } catch (error: any) {
      console.error("Error sending organization notification:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to send notification",
      });
    }
  };

  /**
   * Get notification history for organization
   */
  public getOrganizationNotificationHistory = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const db = DatabaseSingleton.getInstance();
      const skip = (Number(page) - 1) * Number(limit);

      const [notifications, total] = await Promise.all([
        db.getPrisma().pushNotification.findMany({
          where: {
            organizationId,
          },
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
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        db.getPrisma().pushNotification.count({
          where: {
            organizationId,
          },
        }),
      ]);

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
      console.error("Error fetching organization notification history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notification history",
      });
    }
  };

  /**
   * Get detailed stats for a notification
   */
  public getOrganizationNotificationStats = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { organizationId, notificationId } = req.params;

      const db = DatabaseSingleton.getInstance();

      const notification = await db.getPrisma().pushNotification.findFirst({
        where: {
          id: notificationId,
          organizationId,
        },
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
      console.error("Error fetching organization notification stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notification stats",
      });
    }
  };

  /**
   * Get subscribers count for organization
   */
  public getOrganizationSubscribersCount = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const { branchId } = req.query;

      const db = DatabaseSingleton.getInstance();

      let count: number;

      if (branchId) {
        // Count subscribers for specific branch
        const subscriptions = await db.getPrisma().branchSubscription.findMany({
          where: {
            branchId: branchId as string,
            branch: {
              organizationId,
            },
          },
          select: {
            userId: true,
          },
        });
        const uniqueUserIds = [...new Set(subscriptions.map((s) => s.userId))];
        count = uniqueUserIds.length;
      } else {
        // Count subscribers for all branches in organization
        const subscriptions = await db.getPrisma().branchSubscription.findMany({
          where: {
            branch: {
              organizationId,
            },
          },
          select: {
            userId: true,
          },
        });
        const uniqueUserIds = [...new Set(subscriptions.map((s) => s.userId))];
        count = uniqueUserIds.length;
      }

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      console.error("Error fetching organization subscribers count:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch subscribers count",
      });
    }
  };
}
