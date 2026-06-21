import { Router } from "express";
import { PaymentController } from "../controllers/paymentController";
import AuthMiddleware from "../middleware/auth";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import DatabaseSingleton from "../config/database";
import { type OrganizationContextRequest } from "../middleware/organizationContext";

const router = Router();
const paymentController = new PaymentController();
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

const requireOrderAccess = async (req: any, res: any, next: any) => {
  try {
    const rbacUser = req.rbacUser;
    if (!rbacUser) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const organizationId = (req as any as OrganizationContextRequest).organizationId;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }

    const orderId = req.params?.orderId as string | undefined;
    if (!orderId) {
      res.status(400).json({ success: false, error: "orderId is required" });
      return;
    }

    const prisma = DatabaseSingleton.getInstance().getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, branch: { select: { organizationId: true } } },
    });

    if (!order?.branchId || !order.branch?.organizationId) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    if (order.branch.organizationId !== organizationId) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    if (rbacUser.userType === "SUPER_ADMIN") {
      req.requestedBranchId = order.branchId;
      next();
      return;
    }

    const orgRole = (rbacUser as any).orgRole as string | null | undefined;
    if (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") {
      req.requestedBranchId = order.branchId;
      next();
      return;
    }

    if (!rbacUser.assignedBranchIds?.includes(order.branchId)) {
      res.status(403).json({
        success: false,
        error: "You don't have access to this branch",
        code: "NO_BRANCH_ACCESS",
      });
      return;
    }

    req.requestedBranchId = order.branchId;
    next();
  } catch (e) {
    console.error("Order access check failed", e);
    res.status(500).json({ success: false, error: "Failed to authorize refund" });
  }
};

// Create payment intent
router.post(
  "/create-payment-intent",
  authMiddleware.requireAuth,
  paymentController.createPaymentIntent
);

// Update payment intent with payment method (for mobile CardField)
router.post(
  "/update-payment-intent",
  authMiddleware.requireAuth,
  paymentController.updatePaymentIntent
);

// Confirm payment and create order
router.post(
  "/confirm-payment",
  authMiddleware.requireAuth,
  paymentController.confirmPayment
);

// Process refund for an order (admin only)
router.post(
  "/refund/:orderId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.REFUND),
  requireOrderAccess,
  paymentController.processRefund
);

// Stripe webhook endpoint (no auth required)
router.post("/webhook", paymentController.handleWebhook);

// PayPal: Create order
router.post(
  "/paypal/create-order",
  authMiddleware.requireAuth,
  paymentController.createPayPalOrder
);

// PayPal: Capture order
router.post(
  "/paypal/capture-order",
  authMiddleware.requireAuth,
  paymentController.capturePayPalOrder
);

// PayPal webhook endpoint (no auth required)
router.post("/paypal/webhook", paymentController.handlePayPalWebhook);

export default router;
