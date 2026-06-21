import { Router } from "express";
import { SubscriptionController } from "../controllers/subscriptionController";
import AuthMiddleware from "../middleware/auth";

const router = Router();
const subscriptionController = new SubscriptionController();
const authMiddleware = AuthMiddleware.getInstance();

// Subscribe to a branch (authenticated users)
router.post(
  "/branches/:branchId/subscribe",
  authMiddleware.requireAuth,
  subscriptionController.subscribeToBranch
);

// Unsubscribe from a branch (authenticated users)
router.delete(
  "/branches/:branchId/unsubscribe",
  authMiddleware.requireAuth,
  subscriptionController.unsubscribeFromBranch
);

// Get subscription status for a specific branch (authenticated users)
router.get(
  "/branches/:branchId/subscription-status",
  authMiddleware.requireAuth,
  subscriptionController.getSubscriptionStatus
);

// Get all branches the user is subscribed to (authenticated users)
router.get(
  "/user/subscriptions",
  authMiddleware.requireAuth,
  subscriptionController.getUserSubscriptions
);

export default router;
