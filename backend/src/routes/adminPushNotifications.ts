import { Router } from "express";
import { PushNotificationController } from "../controllers/pushNotificationController";
import RBACMiddleware from "../middleware/rbac";

const router = Router();
const pushNotificationController = new PushNotificationController();
const rbac = RBACMiddleware.getInstance();

// Send notification to all subscribers (admin only)
router.post(
  "/send",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  pushNotificationController.sendNotification
);

// Get notification history (admin only)
router.get(
  "/history",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  pushNotificationController.getHistory
);

// Get detailed stats for a notification (admin only)
router.get(
  "/stats/:notificationId",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  pushNotificationController.getStats
);

// Get total subscribers count (admin only)
router.get(
  "/subscribers/count",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  pushNotificationController.getSubscribersCount
);

export default router;

