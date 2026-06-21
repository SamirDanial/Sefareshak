import { Router } from "express";
import AuthMiddleware from "../middleware/auth";
import RBACMiddleware from "../middleware/rbac";
import { organizationContext } from "../middleware/organizationContext";
import branchController from "../controllers/branchController";
import branchClickController from "../controllers/branchClickController";
import { extractClientInfo } from "../middleware/clientInfo";
import { RESOURCES, ACTIONS } from "../config/permissions";

const router = Router();
const auth = AuthMiddleware.getInstance();
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

const requireResolvedOrgMatchesParamIdForOrgAdmins = (req: any, res: any, next: any) => {
  const rbacUser = req.rbacUser;
  if (rbacUser?.userType === "SUPER_ADMIN") {
    next();
    return;
  }

  const resolvedOrgId = (req as any).organizationId as string | undefined;
  const paramOrgId = req.params?.id || req.params?.orgId as string | undefined;

  if (!resolvedOrgId || !paramOrgId || String(resolvedOrgId) !== String(paramOrgId)) {
    res.status(403).json({
      success: false,
      error: "You don't have access to this organization",
      code: "ORG_ACCESS_DENIED",
    });
    return;
  }

  next();
};

const requireResolvedOrgMatchesParamIdForSuperAdmin = (req: any, res: any, next: any) => {
  const rbacUser = req.rbacUser;
  if (rbacUser?.userType !== "SUPER_ADMIN") {
    next();
    return;
  }

  const resolvedOrgId = (req as any).organizationId as string | undefined;
  const paramOrgId = req.params?.id || req.params?.orgId as string | undefined;

  if (!resolvedOrgId || !paramOrgId || String(resolvedOrgId) !== String(paramOrgId)) {
    res.status(400).json({
      success: false,
      error: "Selected organization does not match requested organization",
    });
    return;
  }

  next();
};

// Admin routes
router.get(
  "/admin/branches",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW },
    { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
    { resource: RESOURCES.MEALS, action: ACTIONS.VIEW },
    { resource: RESOURCES.CATEGORIES, action: ACTIONS.VIEW },
    { resource: RESOURCES.DEALS, action: ACTIONS.VIEW },
  ]),
  branchController.getBranches
);

router.get(
  "/admin/branches/unassigned-organization",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.getBranchesWithoutOrganization
);

router.get(
  "/admin/branches/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireAnyPermission([
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW_BRANCH_SETTINGS },
    { resource: RESOURCES.BRANCHES, action: ACTIONS.VIEW_BRANCH_RESERVATION_SETTINGS },
  ]),
  rbac.requireBranchAccess("params", "id"),
  branchController.getBranch
);

router.post(
  "/admin/branches",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.BRANCHES, ACTIONS.CREATE),
  branchController.createBranch
);

router.patch(
  "/admin/branches/:id/organization",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.setBranchOrganization
);

router.patch(
  "/admin/branches/:id/branch-type",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.setBranchType
);

router.put(
  "/admin/branches/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  (req, res, next) => {
    const body = (req as any).body || {};
    const hasReservationSettings = Object.keys(body).some((k) =>
      String(k).startsWith("reservation")
    );

    if (hasReservationSettings) {
      return rbac.requirePermission(
        RESOURCES.BRANCHES,
        ACTIONS.UPDATE_BRANCH_RESERVATION_SETTINGS
      )(req as any, res as any, next);
    }

    return rbac.requirePermission(
      RESOURCES.BRANCHES,
      ACTIONS.UPDATE_BRANCH_SETTINGS
    )(req as any, res as any, next);
  },
  rbac.requireBranchAccess("params", "id"),
  branchController.updateBranch
);

router.delete(
  "/admin/branches/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requireSuperAdmin,
  rbac.requireBranchAccess("params", "id"),
  branchController.deleteBranch
);

router.post(
  "/admin/branches/:id/urgent-close",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.BRANCHES, ACTIONS.URGENT_CLOSE_BRANCH),
  rbac.requireBranchAccess("params", "id"),
  branchController.urgentCloseBranch
);

router.post(
  "/admin/branches/:id/reopen",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  rbac.requirePermission(RESOURCES.BRANCHES, ACTIONS.URGENT_CLOSE_BRANCH),
  rbac.requireBranchAccess("params", "id"),
  branchController.reopenBranch
);

router.get(
  "/admin/organizations",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.getOrganizations
);

router.post(
  "/admin/organizations",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.createOrganization
);

router.get(
  "/admin/organizations/:id",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.getOrganizationById
);

router.put(
  "/admin/organizations/:id",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.updateOrganization
);

router.get(
  "/admin/organizations/:id/settings",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.getOrganizationSettings
);

router.put(
  "/admin/organizations/:id/settings",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.upsertOrganizationSettings
);

router.get(
  "/admin/organizations/:id/pos-devices",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.listOrganizationPosDevices
);

router.post(
  "/admin/organizations/:id/pos-devices",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.createOrganizationPosDevice
);

router.put(
  "/admin/organizations/:id/pos-devices/:deviceId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.updateOrganizationPosDevice
);

router.delete(
  "/admin/organizations/:id/pos-devices/:deviceId",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.deleteOrganizationPosDevice
);

router.post(
  "/admin/organizations/:id/pos-devices/:deviceId/provision-fiskaly-client",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.provisionPosDeviceFiskalyClient
);

router.put(
  "/admin/organizations/:id/fiskaly/toggle",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.toggleFiskalyForOrganization
);

router.post(
  "/admin/organizations/:id/fiskaly/disable-permanent",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.disableFiskalyTssPermanently
);

router.post(
  "/admin/organizations/:id/fiskaly/decommission",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.decommissionFiskalyForOrganization
);

router.post(
  "/admin/organizations/:id/fiskaly/recommission",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.recommissionFiskalyForOrganization
);

router.get(
  "/admin/organizations/:id/fiskaly/verify",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.verifyFiskalyStatus
);

router.post(
  "/admin/organizations/:id/fiskaly/rotate",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.rotateFiskalyForOrganization
);

router.post(
  "/admin/organizations/:id/fiskaly/tax-info",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.updateFiskalyTaxInfo
);

router.get(
  "/admin/organizations/:id/fiskaly/tax-info",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.verifyFiskalyTaxInfo
);

router.get(
  "/admin/organizations/:id/reservation-settings",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.getOrganizationReservationSettings
);

router.put(
  "/admin/organizations/:id/reservation-settings",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  branchController.upsertOrganizationReservationSettings
);

router.get(
  "/admin/branch-types",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.getBranchTypes
);

router.post(
  "/admin/branch-types",
  rbac.authenticate,
  rbac.requireSuperAdmin,
  branchController.createBranchType
);

// Public routes
router.get("/user/branches/main", branchController.getMainBranch);
router.get("/user/branches", branchController.getActiveBranches);
router.get("/user/branches/my", rbac.authenticate, branchController.getMyBranches);
router.get("/user/branches/delivery-check", branchController.checkDeliveryAvailability);

// Branch Likes routes (requires authentication)
router.post("/user/branches/:id/like", rbac.authenticate, branchController.likeBranch);
router.post("/user/branches/:id/unlike", rbac.authenticate, branchController.unlikeBranch);
router.get("/user/branches/liked", rbac.authenticate, branchController.getLikedBranches);

// Branch click tracking routes (public with optional authentication)
router.post(
  "/user/branches/:id/click",
  auth.optionalAuth,
  extractClientInfo,
  branchClickController.recordBranchClick
);

router.get(
  "/user/branches/:id/click-stats",
  auth.optionalAuth,
  branchClickController.getBranchClickStats
);

router.get(
  "/user/branches/:id/clicks",
  auth.optionalAuth,
  branchClickController.getBranchClicks
);

// Admin branch click statistics
router.get(
  "/admin/organizations/:orgId/click-stats",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.BRANCHES, ACTIONS.VIEW),
  branchClickController.getOrganizationClickStats
);

// Admin organization branch likes listing
router.get(
  "/admin/organizations/:id/branch-likes",
  rbac.authenticate,
  requireOrgSelectionForSuperAdmin,
  organizationContext.resolve,
  requireResolvedOrgMatchesParamIdForSuperAdmin,
  requireResolvedOrgMatchesParamIdForOrgAdmins,
  rbac.requireSuperAdminOrOrgAdmin,
  rbac.requirePermission(RESOURCES.BRANCHES, ACTIONS.VIEW),
  branchController.getOrganizationBranchLikes
);

export default router;

