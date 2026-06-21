import { Router } from "express";
import { NotificationController } from "../controllers/notificationController";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = Router();
const notificationController = new NotificationController();
const rbac = RBACMiddleware.getInstance();

const requireOrgSelectionForSuperAdmin = (req: any, res: any, next: any) => {
  const rbacUser = req.rbacUser;
  if (rbacUser?.userType !== "SUPER_ADMIN") {
    next();
    return;
  }

  const headerVal = req.headers?.["x-organization-id"];
  const queryVal = req.query?.organizationId;
  const hasOrg =
    (typeof headerVal === "string" && headerVal.trim()) ||
    (typeof queryVal === "string" && queryVal.trim());

  if (!hasOrg) {
    res.status(400).json({
      success: false,
      error: "Organization selection is required",
    });
    return;
  }

  next();
};

// Get all unseen notifications (admin only)
router.get(
  "/unseen",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW),
  notificationController.getUnseenNotifications
);

// Get all notifications with pagination (admin only)
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW),
  notificationController.getAllNotifications
);

// Mark all notifications as seen (admin only) - MUST come before /:orderId/seen
router.patch(
  "/mark-all-seen",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW),
  notificationController.markAllAsSeen
);

// Mark notification as seen by notificationId (admin only) - MUST come after specific routes
router.patch(
  "/:notificationId/seen",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.NOTIFICATIONS, ACTIONS.VIEW),
  notificationController.markAsSeen
);

export default router;
