import express from "express";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";
import { declarationController } from "../controllers/declarationController";

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

// Get all declarations with pagination and search
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.DECLARATIONS, ACTIONS.VIEW),
  declarationController.getDeclarations
);

// Get all declarations (simplified, for dropdowns)
router.get(
  "/all",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
    { resource: RESOURCES.DECLARATIONS, action: ACTIONS.VIEW },
  ]),
  declarationController.getAllDeclarations
);

// Get single declaration by ID
router.get(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.DECLARATIONS, ACTIONS.VIEW),
  declarationController.getDeclarationById
);

// Create new declaration
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.DECLARATIONS, ACTIONS.CREATE),
  declarationController.createDeclaration
);

// Update declaration
router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.DECLARATIONS, ACTIONS.UPDATE),
  declarationController.updateDeclaration
);

// Delete declaration
router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.DECLARATIONS, ACTIONS.DELETE),
  declarationController.deleteDeclaration
);

// SUPER_ADMIN: Move declaration to a different organization
router.patch(
  "/:id/organization",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  declarationController.setDeclarationOrganization
);

// SUPER_ADMIN: Copy declarations to a different organization (bulk)
router.post(
  "/copy",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  declarationController.copyDeclarationsToOrganization
);

export default router;
