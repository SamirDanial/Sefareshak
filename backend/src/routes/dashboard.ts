import express from "express";
import { dashboardController } from "../controllers/dashboardController";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = express.Router();
const rbac = RBACMiddleware.getInstance();

const requireOrgSelectionForSuperAdmin = (req: any, res: any, next: any) => {
  const rbacUser = req.rbacUser;
  if (rbacUser?.userType === "SUPER_ADMIN" && !req.organizationId) {
    res.status(400).json({
      success: false,
      message: "organizationId is required",
    });
    return;
  }
  next();
};

// Get dashboard statistics
router.get(
  "/stats",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requirePermission(RESOURCES.DASHBOARD, ACTIONS.VIEW),
  dashboardController.getDashboardStats
);

// Get chart data
router.get(
  "/charts",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requirePermission(RESOURCES.DASHBOARD, ACTIONS.VIEW),
  dashboardController.getChartData
);

export default router;
