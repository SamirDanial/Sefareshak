/**
 * Role Management Routes
 * API endpoints for managing roles, user-role assignments, and permissions
 */

import { Router } from "express";
import RoleController from "../controllers/roleController";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = Router();
const roleController = RoleController.getInstance();
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

// ==================== ROLE CRUD ROUTES ====================

// GET /api/roles - Get all roles
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.ROLES, ACTIONS.VIEW),
  roleController.getAllRoles
);

// GET /api/roles/:id - Get role by ID
router.get(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.ROLES, ACTIONS.VIEW),
  roleController.getRoleById
);

// POST /api/roles - Create a new role
router.post(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.ROLES, ACTIONS.CREATE),
  roleController.createRole
);

// PUT /api/roles/:id - Update a role
router.put(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.ROLES, ACTIONS.UPDATE),
  roleController.updateRole
);

// DELETE /api/roles/:id - Delete a role
router.delete(
  "/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.ROLES, ACTIONS.DELETE),
  roleController.deleteRole
);

export default router;
