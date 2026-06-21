import { Router } from "express";
import { OrganizationPushNotificationController } from "../controllers/organizationPushNotificationController";
import RBACMiddleware from "../middleware/rbac";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = Router();
const organizationPushNotificationController = new OrganizationPushNotificationController();
const rbac = RBACMiddleware.getInstance();

// Send notification to organization subscribers
router.post(
  "/:organizationId/notifications/send",
  rbac.authenticate,
  rbac.requireOrganizationPermission(RESOURCES.PUSH_NOTIFICATIONS, ACTIONS.SEND_ORGANIZATION),
  organizationPushNotificationController.sendOrganizationNotification
);

// Get notification history for organization
router.get(
  "/:organizationId/notifications/history",
  rbac.authenticate,
  rbac.requireOrganizationPermission(RESOURCES.PUSH_NOTIFICATIONS, ACTIONS.VIEW_STATS),
  organizationPushNotificationController.getOrganizationNotificationHistory
);

// Get detailed stats for a notification
router.get(
  "/:organizationId/notifications/stats/:notificationId",
  rbac.authenticate,
  rbac.requireOrganizationPermission(RESOURCES.PUSH_NOTIFICATIONS, ACTIONS.VIEW_STATS),
  organizationPushNotificationController.getOrganizationNotificationStats
);

// Get subscribers count for organization
router.get(
  "/:organizationId/subscribers/count",
  rbac.authenticate,
  rbac.requireOrganizationPermission(RESOURCES.PUSH_NOTIFICATIONS, ACTIONS.VIEW),
  organizationPushNotificationController.getOrganizationSubscribersCount
);

export default router;
