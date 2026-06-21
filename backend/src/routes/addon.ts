import express from "express";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import { addonController } from "../controllers/addonController";

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

// Get all addons with pagination and search
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.VIEW),
  addonController.getAddons
);

// Get single addon by ID
router.get(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.VIEW),
  addonController.getAddonById
);

// Create new addon
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.CREATE),
  addonController.createAddon
);

// Update addon
router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.UPDATE),
  addonController.updateAddon
);

// Addon branch price management routes
router.get(
  "/:addonId/branch-prices",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.VIEW),
  addonController.getAddonBranchPrices
);
router.post(
  "/:addonId/branch-prices",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.UPDATE),
  addonController.upsertAddonBranchPrice
);
router.put(
  "/:addonId/branch-prices",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.UPDATE),
  addonController.upsertAddonBranchPrice
);
router.delete(
  "/:addonId/branch-prices/:branchId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.DELETE),
  addonController.deleteAddonBranchPrice
);

// Delete addon
router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.DELETE),
  addonController.deleteAddon
);

// Toggle addon status
router.patch(
  "/:id/toggle-status",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.ADDONS, ACTIONS.TOGGLE_ACTIVE),
  addonController.toggleAddonStatus
);

// SUPER_ADMIN: Move addon to a different organization
router.patch(
  "/:id/organization",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  addonController.setAddonOrganization
);

// SUPER_ADMIN: Copy addons to a different organization (bulk)
router.post(
  "/copy",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  addonController.copyAddonsToOrganization
);

export default router;
