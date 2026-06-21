import express from "express";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import { optionalIngredientController } from "../controllers/optionalIngredientController";

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

// Get all optional ingredients with pagination and search
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.VIEW },
  ]),
  optionalIngredientController.getOptionalIngredients
);

// Get all optional ingredients (simplified, for dropdowns)
router.get(
  "/all",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.VIEW },
  ]),
  optionalIngredientController.getAllOptionalIngredients
);

// Get single optional ingredient by ID
router.get(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
    { resource: RESOURCES.OPTIONAL_INGREDIENTS, action: ACTIONS.VIEW },
  ]),
  optionalIngredientController.getOptionalIngredientById
);

// Create new optional ingredient
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.OPTIONAL_INGREDIENTS, ACTIONS.CREATE),
  optionalIngredientController.createOptionalIngredient
);

// Update optional ingredient
router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.OPTIONAL_INGREDIENTS, ACTIONS.UPDATE),
  optionalIngredientController.updateOptionalIngredient
);

// Delete optional ingredient
router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.OPTIONAL_INGREDIENTS, ACTIONS.DELETE),
  optionalIngredientController.deleteOptionalIngredient
);

// SUPER_ADMIN: Move optional ingredient to a different organization
router.patch(
  "/:id/organization",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  optionalIngredientController.setOptionalIngredientOrganization
);

// SUPER_ADMIN: Copy optional ingredients to a different organization (bulk)
router.post(
  "/copy",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  optionalIngredientController.copyOptionalIngredientsToOrganization
);

export default router;
