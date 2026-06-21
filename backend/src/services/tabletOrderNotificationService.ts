import DatabaseSingleton from "../config/database";
import PushNotificationService from "./pushNotificationService";

interface OrderNotificationData {
  orderId: string;
  orderNumber: string;
  branchId: string;
  organizationId: string;
  status: string;
  totalAmount: number;
  orderType?: string; // "PICKUP" or "DELIVERY"
  customerName?: string;
}

class TabletOrderNotificationService {
  private static instance: TabletOrderNotificationService;

  private constructor() {}

  public static getInstance(): TabletOrderNotificationService {
    if (!TabletOrderNotificationService.instance) {
      TabletOrderNotificationService.instance = new TabletOrderNotificationService();
    }
    return TabletOrderNotificationService.instance;
  }

  /**
   * Get users who should receive notifications for a specific order
   * Based on TabletNotificationPreference table
   */
  private async getNotificationRecipients(orderData: OrderNotificationData): Promise<string[]> {
    const db = DatabaseSingleton.getInstance();

    // Get notification preferences matching the order's organization or branch
    const preferences = await db.getPrisma().tabletNotificationPreference.findMany({
      where: {
        enabled: true,
        OR: [
          // Org-wide notification (for org admins/owners)
          {
            organizationId: orderData.organizationId,
            branchId: null,
          },
          // Branch-specific notification (for employees)
          {
            branchId: orderData.branchId,
            organizationId: null,
          },
        ],
      },
      select: {
        userId: true,
      },
    });

    // Get unique user IDs
    const userIds = [...new Set(preferences.map((p) => p.userId))];

    // Convert to Clerk user IDs (push subscriptions use clerkId)
    const users = await db.getPrisma().user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        clerkId: true,
      },
    });

    return users.map((u) => u.clerkId).filter(Boolean);
  }

  /**
   * Send notification when order is created
   */
  public async notifyOrderCreated(orderData: OrderNotificationData): Promise<void> {
    try {
      const recipients = await this.getNotificationRecipients(orderData);

      if (recipients.length === 0) {
        console.log("[TabletOrderNotificationService] No notification recipients for order", orderData.orderNumber);
        return;
      }

      // Get push subscriptions for recipients
      const db = DatabaseSingleton.getInstance();
      const pushSubscriptions = await db.getPrisma().pushSubscription.findMany({
        where: {
          userId: {
            in: recipients,
          },
        },
      });

      if (pushSubscriptions.length === 0) {
        console.log("[TabletOrderNotificationService] No push subscriptions found for recipients");
        return;
      }

      // Build notification message
      const orderTypeLabel = orderData.orderType === "DELIVERY" ? "Delivery" : "Pickup";
      const title = `New Order #${orderData.orderNumber}`;
      const body = `${orderTypeLabel} - €${orderData.totalAmount.toFixed(2)}`;

      // Send notifications via PushNotificationService
      const pushService = PushNotificationService.getInstance();

      for (const subscription of pushSubscriptions) {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh || "",
              auth: subscription.auth || "",
            },
          };

          await pushService.sendNotification(pushSubscription, {
            title,
            body,
            data: {
              orderId: orderData.orderId,
              orderNumber: orderData.orderNumber,
              branchId: orderData.branchId,
              organizationId: orderData.organizationId,
              type: "ORDER_CREATED",
            },
          }, subscription.userAgent);

          console.log(`[TabletOrderNotificationService] Notification sent to user ${subscription.userId}`);
        } catch (error) {
          console.error(`[TabletOrderNotificationService] Failed to send notification to ${subscription.userId}:`, error);
        }
      }
    } catch (error) {
      console.error("[TabletOrderNotificationService] Error in notifyOrderCreated:", error);
    }
  }

  /**
   * Send notification when order is cancelled
   */
  public async notifyOrderCancelled(orderData: OrderNotificationData): Promise<void> {
    try {
      const recipients = await this.getNotificationRecipients(orderData);

      if (recipients.length === 0) {
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const pushSubscriptions = await db.getPrisma().pushSubscription.findMany({
        where: {
          userId: {
            in: recipients,
          },
        },
      });

      if (pushSubscriptions.length === 0) {
        return;
      }

      const title = `Order Cancelled #${orderData.orderNumber}`;
      const body = "Order has been cancelled by customer";

      const pushService = PushNotificationService.getInstance();

      for (const subscription of pushSubscriptions) {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh || "",
              auth: subscription.auth || "",
            },
          };

          await pushService.sendNotification(pushSubscription, {
            title,
            body,
            data: {
              orderId: orderData.orderId,
              orderNumber: orderData.orderNumber,
              branchId: orderData.branchId,
              organizationId: orderData.organizationId,
              type: "ORDER_CANCELLED",
            },
          }, subscription.userAgent);
        } catch (error) {
          console.error(`[TabletOrderNotificationService] Failed to send notification to ${subscription.userId}:`, error);
        }
      }
    } catch (error) {
      console.error("[TabletOrderNotificationService] Error in notifyOrderCancelled:", error);
    }
  }

  /**
   * Send notification when order status is updated
   */
  public async notifyOrderUpdated(
    orderData: OrderNotificationData,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    try {
      const recipients = await this.getNotificationRecipients(orderData);

      if (recipients.length === 0) {
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const pushSubscriptions = await db.getPrisma().pushSubscription.findMany({
        where: {
          userId: {
            in: recipients,
          },
        },
      });

      if (pushSubscriptions.length === 0) {
        return;
      }

      const title = `Order Updated #${orderData.orderNumber}`;
      const body = `${oldStatus} → ${newStatus}`;

      const pushService = PushNotificationService.getInstance();

      for (const subscription of pushSubscriptions) {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh || "",
              auth: subscription.auth || "",
            },
          };

          await pushService.sendNotification(pushSubscription, {
            title,
            body,
            data: {
              orderId: orderData.orderId,
              orderNumber: orderData.orderNumber,
              branchId: orderData.branchId,
              organizationId: orderData.organizationId,
              type: "ORDER_UPDATED",
              oldStatus,
              newStatus,
            },
          }, subscription.userAgent);
        } catch (error) {
          console.error(`[TabletOrderNotificationService] Failed to send notification to ${subscription.userId}:`, error);
        }
      }
    } catch (error) {
      console.error("[TabletOrderNotificationService] Error in notifyOrderUpdated:", error);
    }
  }
}

export default TabletOrderNotificationService.getInstance();
