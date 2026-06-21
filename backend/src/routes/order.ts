import { Router } from "express";
import { OrderController } from "../controllers/orderController";
import AuthMiddleware from "../middleware/auth";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = Router();
const orderController = new OrderController();
const authMiddleware = AuthMiddleware.getInstance();
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

// Get all orders (admin only)
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
  orderController.getAllOrders
);

// Get orders for Dispatch module (dispatch:view)
router.get(
  "/dispatch",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.DISPATCH, ACTIONS.VIEW),
  orderController.getDispatchOrders
);

// Get order statistics (admin only)
router.get(
  "/statistics",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
  orderController.getOrderStatistics
);

// Get receipt payload for printing (admin/staff)
router.get(
  "/:id/receipt",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
  orderController.getOrderReceiptPayload
);

// Get receipt payload for the authenticated customer (owner-only)
router.get(
  "/user/:id/receipt",
  authMiddleware.requireAuth,
  orderController.getMyOrderReceiptPayload
);

// Get refund receipt payload (admin/staff)
router.get(
  "/refund/:refundId/receipt",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
  orderController.getRefundReceiptPayload
);

// Get order by ID
router.get("/:id", authMiddleware.requireAuth, orderController.getOrderById);

// Create POS order (admin/tablet only)
router.post(
  "/pos",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.CREATE),
  orderController.createPosOrder
);

// Get user's active order (for merge check)
router.get(
  "/user/active-order",
  authMiddleware.requireAuth,
  orderController.getActiveOrder
);

// Get user's orders
router.get(
  "/user/orders",
  authMiddleware.requireAuth,
  orderController.getUserOrders
);

// Update order status (admin only)
router.patch(
  "/:id/status",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.UPDATE_STATUS),
  orderController.updateOrderStatus
);

// Cancel order
router.patch(
  "/:id/cancel",
  authMiddleware.requireAuth,
  orderController.cancelOrder
);

// Reschedule order (shallow modification: update scheduledDate only)
router.patch(
  "/:id/reschedule",
  authMiddleware.requireAuth,
  orderController.rescheduleOrder
);

// Validate cart items for a branch
router.post(
  "/validate-cart",
  authMiddleware.requireAuth,
  orderController.validateCart
);

// Create Cash on Delivery order
router.post(
  "/create-cod",
  authMiddleware.requireAuth,
  orderController.createCODOrder
);

export default router;
