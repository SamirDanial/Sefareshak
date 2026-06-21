import { Router } from "express";
import { PushNotificationController } from "../controllers/pushNotificationController";
import AuthMiddleware from "../middleware/auth";

const router = Router();
const pushNotificationController = new PushNotificationController();
const authMiddleware = AuthMiddleware.getInstance();

// Get public VAPID key (public endpoint, no auth required)
router.get("/public-key", pushNotificationController.getPublicKey);

// Subscribe to push notifications (authenticated users)
router.post(
  "/subscribe",
  authMiddleware.requireAuth,
  pushNotificationController.subscribe
);

// Unsubscribe from push notifications (authenticated users)
router.post(
  "/unsubscribe",
  authMiddleware.requireAuth,
  pushNotificationController.unsubscribe
);

// Get app-level subscription status (authenticated users)
router.get(
  "/app-level-status",
  authMiddleware.requireAuth,
  pushNotificationController.getAppLevelSubscriptionStatus
);

// Update app-level subscription status (authenticated users)
router.post(
  "/app-level-status",
  authMiddleware.requireAuth,
  pushNotificationController.updateAppLevelSubscription
);

// Track notification click (public - called by service worker)
// Service workers can't reliably send auth tokens, so we validate via endpoint
router.post("/track-click", pushNotificationController.trackClick);

export default router;
