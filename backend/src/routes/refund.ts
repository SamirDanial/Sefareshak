import { Router, Response, NextFunction } from "express";
import { RefundController } from "../controllers/refundController";
import AuthMiddleware from "../middleware/auth";
import DatabaseSingleton from "../config/database";
import RBACMiddleware, { type RBACRequest } from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS, hasImplicitFullAccess } from "../config/permissions";

const router = Router();
const refundController = new RefundController();
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

const requireOrderBranchAccess = async (
  req: RBACRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.rbacUser) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    if (hasImplicitFullAccess(req.rbacUser.userType)) {
      next();
      return;
    }

    const actorOrgRole = (req.rbacUser as any)?.orgRole as string | null | undefined;
    const isOrgAdmin = actorOrgRole === "ORG_OWNER" || actorOrgRole === "ORG_ADMIN";
    const resolvedOrganizationId = (req as any)?.organizationId as
      | string
      | null
      | undefined;

    const orderIdFromBody = (req.body as any)?.orderId as string | undefined;
    const orderIdFromParams = (req.params as any)?.orderId as string | undefined;
    const orderId = orderIdFromBody || orderIdFromParams;

    // If this is a reservation refund (reservationOrderId), we currently leave it admin-only.
    const reservationOrderId = (req.body as any)?.reservationOrderId as string | undefined;
    if (!orderId || reservationOrderId) {
      next();
      return;
    }

    const prisma = DatabaseSingleton.getInstance().getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, branch: { select: { organizationId: true } } },
    });

    if (!order) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    const branchId = order.branchId;
    if (!branchId) {
      // If an order has no branchId, treat it as not accessible for staff.
      res.status(403).json({ success: false, error: "Branch access is required" });
      return;
    }

    // Org owners/admins can refund any order within the currently selected organization.
    if (isOrgAdmin) {
      if (!resolvedOrganizationId) {
        res.status(400).json({
          success: false,
          error: "Organization selection is required",
        });
        return;
      }

      const orderOrganizationId = (order as any)?.branch?.organizationId as
        | string
        | null
        | undefined;
      if (orderOrganizationId && String(orderOrganizationId) !== String(resolvedOrganizationId)) {
        res.status(403).json({
          success: false,
          error: "You don't have access to this organization",
          code: "NO_ORG_ACCESS",
        });
        return;
      }

      req.requestedBranchId = branchId;
      next();
      return;
    }

    if (!req.rbacUser.assignedBranchIds.includes(branchId)) {
      res.status(403).json({
        success: false,
        error: "You don't have access to this branch",
        code: "NO_BRANCH_ACCESS",
      });
      return;
    }

    req.requestedBranchId = branchId;
    next();
  } catch (e) {
    console.error("Refund branch access check failed", e);
    res.status(500).json({ success: false, error: "Failed to authorize refund" });
  }
};

// Create refund (admin only)
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.REFUND),
  requireOrderBranchAccess,
  refundController.createRefund
);

// Get refunds for a specific order
router.get(
  "/order/:orderId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
  requireOrderBranchAccess,
  refundController.getOrderRefunds
);

// Get all refunds (admin only)
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
  refundController.getAllRefunds
);

// Cancel a refund (admin only)
router.patch(
  "/:refundId/cancel",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.REFUND),
  refundController.cancelRefund
);

export default router;
