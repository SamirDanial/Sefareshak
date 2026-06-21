import { Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";
import WebSocketService from "../services/websocketService";
import { type OrganizationContextRequest } from "../middleware/organizationContext";

export class NotificationController {
  // Get all unseen notifications (admin only)
  public getUnseenNotifications = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const notifications = await db.getPrisma().notification.findMany({
        where: {
          isSeen: false,
          OR: [
            { order: { branch: { organizationId } } },
            { reservation: { branch: { organizationId } } },
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          order: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
              orderItems: {
                include: {
                  deal: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                  meal: {
                    select: {
                      id: true,
                      name: true,
                      basePrice: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
          reservation: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      });

      res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      console.error("Error fetching unseen notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notifications",
      });
    }
  };

  // Get all notifications (admin only) - optional for future use
  public getAllNotifications = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { page = 1, limit = 10 } = req.query;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [notifications, total] = await Promise.all([
        db.getPrisma().notification.findMany({
          where: {
            OR: [
              { order: { branch: { organizationId } } },
              { reservation: { branch: { organizationId } } },
            ],
          },
          skip,
          take: Number(limit),
          orderBy: {
            createdAt: "desc",
          },
          include: {
            order: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
                orderItems: {
                  include: {
                    deal: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                      },
                    },
                    meal: {
                      select: {
                        id: true,
                        name: true,
                        basePrice: true,
                        image: true,
                      },
                    },
                  },
                },
              },
            },
            reservation: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        }),
        db.getPrisma().notification.count({
          where: {
            OR: [
              { order: { branch: { organizationId } } },
              { reservation: { branch: { organizationId } } },
            ],
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch notifications",
      });
    }
  };

  // Mark notification as seen by notificationId
  public markAsSeen = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { notificationId } = req.params;
      const db = DatabaseSingleton.getInstance();

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      // Find notification by id
      const notification = await db.getPrisma().notification.findFirst({
        where: {
          id: notificationId,
          OR: [
            { order: { branch: { organizationId } } },
            { reservation: { branch: { organizationId } } },
          ],
        },
      });

      if (!notification) {
        res.status(404).json({
          success: false,
          error: "Notification not found",
        });
        return;
      }

      if (notification.isSeen) {
        res.status(200).json({
          success: true,
          data: notification,
          message: "Notification already seen",
        });
        return;
      }

      // Update notification to seen with timestamp
      const updatedNotification = await db.getPrisma().notification.update({
        where: {
          id: notificationId,
        },
        data: {
          isSeen: true,
          seenAt: new Date(),
        },
        include: {
          order: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
              orderItems: {
                include: {
                  meal: {
                    select: {
                      id: true,
                      name: true,
                      basePrice: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
          reservation: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      });

      // Emit WebSocket event to notify all admins in real-time
      const wsService = WebSocketService.getInstance();
      wsService.emitNotificationSeen({
        orderId: updatedNotification.orderId || undefined,
        reservationId: updatedNotification.reservationId || undefined,
        notificationId: updatedNotification.id,
        isSeen: true,
        seenAt: updatedNotification.seenAt,
      });

      res.json({
        success: true,
        data: updatedNotification,
        message: "Notification marked as seen",
      });
    } catch (error) {
      console.error("Error marking notification as seen:", error);
      res.status(500).json({
        success: false,
        error: "Failed to mark notification as seen",
      });
    }
  };

  // Mark all notifications as seen (admin only)
  public markAllAsSeen = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const seenAt = new Date();
      const result = await db.getPrisma().notification.updateMany({
        where: {
          isSeen: false,
          OR: [
            { order: { branch: { organizationId } } },
            { reservation: { branch: { organizationId } } },
          ],
        },
        data: {
          isSeen: true,
          seenAt: seenAt,
        },
      });

      // Emit WebSocket event to notify all admins in real-time
      const wsService = WebSocketService.getInstance();
      wsService.emitAllNotificationsSeen({
        count: result.count,
        seenAt: seenAt,
      });

      res.json({
        success: true,
        data: {
          count: result.count,
        },
        message: `${result.count} notification(s) marked as seen`,
      });
    } catch (error) {
      console.error("Error marking all notifications as seen:", error);
      res.status(500).json({
        success: false,
        error: "Failed to mark all notifications as seen",
      });
    }
  };
}
