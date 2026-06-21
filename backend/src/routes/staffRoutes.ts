/**
 * Staff Management Routes
 * API endpoints for managing staff users, their branches, and roles
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
  const hasOrg = (typeof headerVal === "string" && headerVal.trim()) || (typeof queryVal === "string" && queryVal.trim());

  if (!hasOrg) {
    res.status(400).json({
      success: false,
      error: "Organization selection is required",
    });
    return;
  }

  next();
};

// ==================== STAFF USER ROUTES ====================

// GET /api/staff - Get all staff users
router.get(
  "/",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.USERS, ACTIONS.VIEW),
  roleController.getStaffUsers
);

// ==================== HIRE STAFF ROUTES ====================

// GET /api/staff/hire/search?email=... - Search a user by exact email for hiring
router.get(
  "/hire/search",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.searchHireCandidate
);

// POST /api/staff/hire - Hire an existing user into the resolved org as ORG_STAFF
router.post(
  "/hire",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.hireStaff
);

// GET /api/staff/:userId - Get staff user with RBAC details
router.get(
  "/:userId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.getStaffUser
);

// PUT /api/staff/:userId/type - Update user type
router.put(
  "/:userId/type",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.updateUserType
);

// PATCH /api/staff/:userId/org-role - Update user's orgRole within the resolved org
router.patch(
  "/:userId/org-role",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.updateUserOrgRole
);

// DELETE /api/staff/:userId/org-membership - Remove user from the resolved org
router.delete(
  "/:userId/org-membership",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.removeUserFromOrganization
);

// ==================== USER-ROLE ASSIGNMENT ROUTES ====================

// GET /api/staff/:userId/roles - Get user's roles
router.get(
  "/:userId/roles",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.getUserRoles
);

// POST /api/staff/:userId/roles - Assign role to user
router.post(
  "/:userId/roles",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.assignRoleToUser
);

// PUT /api/staff/:userId/roles - Replace all user roles
router.put(
  "/:userId/roles",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.setUserRoles
);

// DELETE /api/staff/:userId/roles/:roleId - Remove role from user
router.delete(
  "/:userId/roles/:roleId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.removeRoleFromUser
);

// ==================== USER-BRANCH ASSIGNMENT ROUTES ====================

// GET /api/staff/:userId/branches - Get user's branches
router.get(
  "/:userId/branches",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.getUserBranches
);

// POST /api/staff/:userId/branches - Assign branch to user
router.post(
  "/:userId/branches",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.assignBranchToUser
);

// PUT /api/staff/:userId/branches - Replace all user branches
router.put(
  "/:userId/branches",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.setUserBranches
);

// DELETE /api/staff/:userId/branches/:branchId - Remove branch from user
router.delete(
  "/:userId/branches/:branchId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  roleController.removeBranchFromUser
);

export default router;
