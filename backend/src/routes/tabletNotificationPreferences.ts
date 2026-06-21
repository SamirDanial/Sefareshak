import { Router } from "express";
import { TabletNotificationPreferenceController } from "../controllers/tabletNotificationPreferenceController";
import AuthMiddleware from "../middleware/auth";

const router = Router();
const controller = new TabletNotificationPreferenceController();
const authMiddleware = AuthMiddleware.getInstance();

// Get user's tablet notification preferences
router.get(
  "/",
  authMiddleware.requireAuth,
  controller.getPreferences
);

// Set tablet notification preference
router.post(
  "/",
  authMiddleware.requireAuth,
  controller.setPreference
);

// Delete tablet notification preference
router.delete(
  "/:id",
  authMiddleware.requireAuth,
  controller.deletePreference
);

// Auto-create preferences based on user role (called on first login)
router.post(
  "/auto-create",
  authMiddleware.requireAuth,
  controller.autoCreatePreferences
);

export default router;
