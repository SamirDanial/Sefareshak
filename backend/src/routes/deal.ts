import express from "express";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import { dealController } from "../controllers/dealController";

const router = express.Router();
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

// Public routes for customers
router.get("/", dealController.getDeals);
router.get("/:id", dealController.getDealById);

// Reorder deals within a category (must appear before /:id routes)
router.put(
  "/reorder-category",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.DEALS, action: ACTIONS.REORDER_CATEGORY },
  ]),
  dealController.reorderCategoryDeals
);

// Admin CRUD
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.DEALS, action: ACTIONS.CREATE },
  ]),
  dealController.createDeal
);

router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.DEALS, action: ACTIONS.UPDATE },
  ]),
  dealController.updateDeal
);

router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.DEALS, action: ACTIONS.DELETE },
  ]),
  dealController.deleteDeal
);

router.patch(
  "/:id/toggle-status",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.DEALS, action: ACTIONS.TOGGLE_ACTIVE },
  ]),
  dealController.toggleDealStatus
);

export default router;
