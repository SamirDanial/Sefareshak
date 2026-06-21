import express from "express";
import AuthMiddleware from "../middleware/auth";
import { categoryInsightsController } from "../controllers/categoryInsightsController";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = express.Router();
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

// Get all available categories
router.get(
  "/categories",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requireAnyPermission([
    { resource: RESOURCES.ANALYTICS_CATEGORY_INSIGHTS, action: ACTIONS.VIEW },
    { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
  ]),
  categoryInsightsController.getCategories
);

// Get insights for a specific category
router.get(
  "/insights",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requireAnyPermission([
    { resource: RESOURCES.ANALYTICS_CATEGORY_INSIGHTS, action: ACTIONS.VIEW },
    { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
  ]),
  categoryInsightsController.getCategoryInsights
);

// Get branch revenue chart for a category
router.get(
  "/branch-revenue-chart",
  rbac.authenticate,
  organizationContext.resolve,
  requireOrgSelectionForSuperAdmin,
  rbac.requireAnyPermission([
    { resource: RESOURCES.ANALYTICS_CATEGORY_INSIGHTS, action: ACTIONS.VIEW },
    { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
  ]),
  categoryInsightsController.getBranchRevenueChart
);

export default router;
