/**
 * Role Management Controller
 * Handles HTTP requests for role and permission management
 */

import { Response } from "express";
import RoleService from "../services/roleService";
import DatabaseSingleton from "../config/database";
import type { RBACRequest } from "../middleware/rbac";
import RBACMiddleware from "../middleware/rbac";
import type { OrganizationContextRequest } from "../middleware/organizationContext";
import { AuditLogService } from "../services/auditLogService";
import {
  RESOURCES,
  ACTIONS,
  RESOURCE_ACTIONS,
  hasPermission,
  UserType,
} from "../config/permissions";

import { hasImplicitFullAccess } from "../config/permissions";

class RoleController {
  private static instance: RoleController;
  private roleService = RoleService.getInstance();
  private rbac = RBACMiddleware.getInstance();

  private constructor() {}

  public static getInstance(): RoleController {
    if (!RoleController.instance) {
      RoleController.instance = new RoleController();
    }
    return RoleController.instance;
  }

  // ==================== ROLE ENDPOINTS ====================

  /**
   * GET /api/roles
   * Get all roles
   */
  getAllRoles = async (req: OrganizationContextRequest, res: Response): Promise<void> => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const orgId = req.organizationId;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: "Organization context is required",
        });
        return;
      }

      const includeSystem = req.rbacUser?.userType === "SUPER_ADMIN";
      const roles = await this.roleService.getAllRoles({
        includeInactive,
        organizationId: orgId,
        includeSystem,
      });

      res.json({
        success: true,
        data: roles,
      });
    } catch (error: any) {
      console.error("Get roles error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get roles",
      });
    }
  };

  // ==================== ORG MEMBERSHIP MANAGEMENT ====================

  /**
   * PATCH /api/staff/:userId/org-role
   * Update user's orgRole within the resolved organization
   */
  updateUserOrgRole = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { orgRole } = req.body as { orgRole?: string | null };

      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const actorOrgRole = (req.rbacUser as any).orgRole as string | null | undefined;
      const isSuperAdmin = req.rbacUser.userType === "SUPER_ADMIN";

      if (!isSuperAdmin && actorOrgRole !== "ORG_OWNER" && actorOrgRole !== "ORG_ADMIN") {
        res.status(403).json({ success: false, error: "Only ORG_OWNER or ORG_ADMIN can change organization roles" });
        return;
      }

      if (req.rbacUser.id === userId) {
        res.status(400).json({ success: false, error: "You cannot change your own organization role" });
        return;
      }

      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true, orgRole: true },
      });
      if (!target || target.organizationId !== organizationId) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      const validOrgRoles = ["ORG_OWNER", "ORG_ADMIN", "ORG_STAFF"];
      const nextOrgRole = orgRole === null || orgRole === undefined || orgRole === "" ? null : String(orgRole);

      if (nextOrgRole !== null && !validOrgRoles.includes(nextOrgRole)) {
        res.status(400).json({
          success: false,
          error: `Invalid orgRole. Must be one of: ${validOrgRoles.join(", ")}`,
        });
        return;
      }

      // ORG_ADMIN can only toggle between ORG_ADMIN and ORG_STAFF (never ORG_OWNER)
      if (!isSuperAdmin && actorOrgRole === "ORG_ADMIN") {
        if (nextOrgRole === "ORG_OWNER") {
          res.status(403).json({ success: false, error: "ORG_ADMIN cannot assign ORG_OWNER" });
          return;
        }
        if (nextOrgRole !== "ORG_ADMIN" && nextOrgRole !== "ORG_STAFF") {
          res.status(403).json({ success: false, error: "ORG_ADMIN can only assign ORG_ADMIN or ORG_STAFF" });
          return;
        }
      }

      const before = { ...target };

      await this.roleService.updateUserOrgRole(userId, nextOrgRole, organizationId);
      this.rbac.clearUserCache();

      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true, orgRole: true },
      });

      await AuditLogService.writeSafe({
        action: "STAFF_ORG_ROLE_UPDATE",
        entityType: "User",
        entityId: userId,
        scope: { organizationId },
        actor: AuditLogService.getActorFromRequest(req as any),
        before,
        after,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        message: "User organization role updated successfully",
      });
    } catch (error: any) {
      console.error("Update user orgRole error:", error);
      const status = error.message === "User not found" ? 404 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to update user organization role",
      });
    }
  };

  /**
   * DELETE /api/staff/:userId/org-membership
   * Remove user from the resolved organization
   */
  removeUserFromOrganization = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const actorOrgRole = (req.rbacUser as any).orgRole as string | null | undefined;
      const isSuperAdmin = req.rbacUser.userType === "SUPER_ADMIN";

      if (!isSuperAdmin && actorOrgRole !== "ORG_OWNER") {
        res.status(403).json({ success: false, error: "Only ORG_OWNER can remove users from the organization" });
        return;
      }

      if (req.rbacUser.id === userId) {
        res.status(400).json({ success: false, error: "You cannot remove yourself from the organization" });
        return;
      }

      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true, orgRole: true },
      });
      if (!target || target.organizationId !== organizationId) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      if (!isSuperAdmin && actorOrgRole === "ORG_OWNER" && target.orgRole === "ORG_OWNER") {
        res.status(403).json({ success: false, error: "You don't have permission to remove ORG_OWNER" });
        return;
      }

      await this.roleService.removeUserFromOrganization(userId, organizationId);
      this.rbac.clearUserCache();

      res.json({
        success: true,
        message: "User removed from organization successfully",
      });
    } catch (error: any) {
      console.error("Remove user from org error:", error);
      const status = error.message === "User not found" ? 404 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to remove user from organization",
      });
    }
  };

  /**
   * GET /api/roles/:id
   * Get role by ID
   */
  getRoleById = async (req: OrganizationContextRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const orgId = req.organizationId;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: "Organization context is required",
        });
        return;
      }

      const allowSystem = req.rbacUser?.userType === "SUPER_ADMIN";
      const role = await this.roleService.getRoleById(id, {
        organizationId: orgId,
        allowSystem,
      });

      res.json({
        success: true,
        data: role,
      });
    } catch (error: any) {
      console.error("Get role error:", error);
      const status = error.message === "Role not found" ? 404 : 500;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to get role",
      });
    }
  };

  /**
   * POST /api/roles
   * Create a new role
   */
  createRole = async (req: OrganizationContextRequest, res: Response): Promise<void> => {
    try {
      const { name, description, permissions } = req.body;

      const orgId = req.organizationId;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: "Organization context is required",
        });
        return;
      }

      if (!name || !permissions) {
        res.status(400).json({
          success: false,
          error: "Name and permissions are required",
        });
        return;
      }

      const role = await this.roleService.createRole({
        organizationId: orgId,
        name,
        description,
        permissions,
      });

      this.rbac.clearUserCache();

      res.status(201).json({
        success: true,
        data: role,
        message: "Role created successfully",
      });
    } catch (error: any) {
      console.error("Create role error:", error);
      const status = error.message.includes("already exists") ? 409 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to create role",
      });
    }
  };

  /**
   * PUT /api/roles/:id
   * Update a role
   */
  updateRole = async (req: OrganizationContextRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, description, permissions, isActive } = req.body;

      const orgId = req.organizationId;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: "Organization context is required",
        });
        return;
      }

      const role = await this.roleService.updateRole(
        id,
        {
          name,
          description,
          permissions,
          isActive,
        },
        {
          organizationId: orgId,
          allowSystem: req.rbacUser?.userType === "SUPER_ADMIN",
        }
      );

      this.rbac.clearUserCache();

      res.json({
        success: true,
        data: role,
        message: "Role updated successfully",
      });
    } catch (error: any) {
      console.error("Update role error:", error);
      const status = error.message === "Role not found" ? 404 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to update role",
      });
    }
  };

  /**
   * DELETE /api/roles/:id
   * Delete a role
   */
  deleteRole = async (req: OrganizationContextRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const orgId = req.organizationId;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: "Organization context is required",
        });
        return;
      }

      await this.roleService.deleteRole(id, {
        organizationId: orgId,
        allowSystem: req.rbacUser?.userType === "SUPER_ADMIN",
      });

      this.rbac.clearUserCache();

      res.json({
        success: true,
        message: "Role deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete role error:", error);
      const status = error.message === "Role not found" ? 404 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to delete role",
      });
    }
  };

  // ==================== USER-ROLE ASSIGNMENT ENDPOINTS ====================

  /**
   * GET /api/users/:userId/roles
   * Get all roles assigned to a user
   */
  getUserRoles = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;
      const roles = await this.roleService.getUserRoles(userId, organizationId);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error: any) {
      console.error("Get user roles error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get user roles",
      });
    }
  };

  /**
   * POST /api/users/:userId/roles
   * Assign a role to a user
   */
  assignRoleToUser = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { roleId, branchId } = req.body;

      if (!roleId) {
        res.status(400).json({
          success: false,
          error: "roleId is required",
        });
        return;
      }

      const actorOrgRole = (req.rbacUser as any)?.orgRole as string | null | undefined;
      const organizationId = (req as any).organizationId as string | undefined;
      if (actorOrgRole === "ORG_ADMIN" && organizationId) {
        const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, organizationId: true, orgRole: true },
        });
        if (!target || target.organizationId !== organizationId) {
          res.status(404).json({ success: false, error: "User not found" });
          return;
        }
        if (target.orgRole === "ORG_OWNER") {
          res.status(403).json({ success: false, error: "You don't have permission to modify ORG_OWNER" });
          return;
        }
      }
      const before = {
        userId,
        roleId,
        branchId: branchId || null,
      };
      const assignment = await this.roleService.assignRoleToUser({
        userId,
        roleId,
        branchId,
        organizationId,
      });

      this.rbac.clearUserCache();

      await AuditLogService.writeSafe({
        action: "STAFF_ROLE_ASSIGN",
        entityType: "UserRoleAssignment",
        entityId: (assignment as any)?.id || null,
        scope: { organizationId: organizationId || null, branchId: branchId || null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before,
        after: assignment,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.status(201).json({
        success: true,
        data: assignment,
        message: "Role assigned successfully",
      });
    } catch (error: any) {
      console.error("Assign role error:", error);
      const status = error.message.includes("not found") ? 404 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to assign role",
      });
    }
  };

  /**
   * DELETE /api/users/:userId/roles/:roleId
   * Remove a role from a user
   */
  removeRoleFromUser = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId, roleId } = req.params;
      const { branchId } = req.query;

      const organizationId = (req as any).organizationId as string | undefined;
      const actorOrgRole = (req.rbacUser as any)?.orgRole as string | null | undefined;
      if (actorOrgRole === "ORG_ADMIN" && organizationId) {
        const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, organizationId: true, orgRole: true },
        });
        if (!target || target.organizationId !== organizationId) {
          res.status(404).json({ success: false, error: "User not found" });
          return;
        }
        if (target.orgRole === "ORG_OWNER") {
          res.status(403).json({ success: false, error: "You don't have permission to modify ORG_OWNER" });
          return;
        }
      }
      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
      const existingAssignment = await prisma.userRoleAssignment.findFirst({
        where: {
          userId,
          roleId,
          branchId: branchId ? String(branchId) : null,
        },
      });

      await this.roleService.removeRoleFromUser(userId, roleId, branchId as string, organizationId);

      this.rbac.clearUserCache();

      await AuditLogService.writeSafe({
        action: "STAFF_ROLE_REMOVE",
        entityType: "UserRoleAssignment",
        entityId: existingAssignment?.id || null,
        scope: { organizationId: organizationId || null, branchId: branchId ? String(branchId) : null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existingAssignment,
        after: null,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        message: "Role removed successfully",
      });
    } catch (error: any) {
      console.error("Remove role error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to remove role",
      });
    }
  };

  /**
   * PUT /api/users/:userId/roles
   * Replace all role assignments for a user
   */
  setUserRoles = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { assignments } = req.body;

      if (!Array.isArray(assignments)) {
        res.status(400).json({
          success: false,
          error: "assignments must be an array",
        });
        return;
      }

      const organizationId = (req as any).organizationId as string | undefined;
      const actorOrgRole = (req.rbacUser as any)?.orgRole as string | null | undefined;
      if (actorOrgRole === "ORG_ADMIN" && organizationId) {
        const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, organizationId: true, orgRole: true },
        });
        if (!target || target.organizationId !== organizationId) {
          res.status(404).json({ success: false, error: "User not found" });
          return;
        }
        if (target.orgRole === "ORG_OWNER") {
          res.status(403).json({ success: false, error: "You don't have permission to modify ORG_OWNER" });
          return;
        }
      }
      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
      const beforeAssignments = await prisma.userRoleAssignment.findMany({
        where: { userId },
      });

      await this.roleService.setUserRoles(userId, assignments, organizationId);

      this.rbac.clearUserCache();

      const afterAssignments = await prisma.userRoleAssignment.findMany({
        where: { userId },
      });

      await AuditLogService.writeSafe({
        action: "STAFF_ROLES_SET",
        entityType: "User",
        entityId: userId,
        scope: { organizationId: organizationId || null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: beforeAssignments,
        after: afterAssignments,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        message: "User roles updated successfully",
      });
    } catch (error: any) {
      console.error("Set user roles error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to update user roles",
      });
    }
  };

  // ==================== USER-BRANCH ASSIGNMENT ENDPOINTS ====================

  /**
   * GET /api/users/:userId/branches
   * Get all branches assigned to a user
   */
  getUserBranches = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const organizationId = (req as any).organizationId as string | undefined;
      const branches = await this.roleService.getUserBranches(userId, organizationId);

      res.json({
        success: true,
        data: branches,
      });
    } catch (error: any) {
      console.error("Get user branches error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get user branches",
      });
    }
  };

  /**
   * POST /api/users/:userId/branches
   * Assign a branch to a user
   */
  assignBranchToUser = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { branchId } = req.body;

      if (!branchId) {
        res.status(400).json({
          success: false,
          error: "branchId is required",
        });
        return;
      }

      const organizationId = (req as any).organizationId as string | undefined;

      const assignment = await this.roleService.assignBranchToUser({
        userId,
        branchId,
        organizationId,
      });

      res.status(201).json({
        success: true,
        data: assignment,
        message: "Branch assigned successfully",
      });
    } catch (error: any) {
      console.error("Assign branch error:", error);
      const status = error.message.includes("not found") ? 404 : 400;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to assign branch",
      });
    }
  };

  /**
   * DELETE /api/users/:userId/branches/:branchId
   * Remove a branch from a user
   */
  removeBranchFromUser = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId, branchId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;
      await this.roleService.removeBranchFromUser(userId, branchId, organizationId);

      res.json({
        success: true,
        message: "Branch removed successfully",
      });
    } catch (error: any) {
      console.error("Remove branch error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to remove branch",
      });
    }
  };

  /**
   * PUT /api/users/:userId/branches
   * Replace all branch assignments for a user
   */
  setUserBranches = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { branchIds } = req.body;

      if (!Array.isArray(branchIds)) {
        res.status(400).json({
          success: false,
          error: "branchIds must be an array",
        });
        return;
      }

      const organizationId = (req as any).organizationId as string | undefined;
      await this.roleService.setUserBranches(userId, branchIds, organizationId);

      res.json({
        success: true,
        message: "User branches updated successfully",
      });
    } catch (error: any) {
      console.error("Set user branches error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to update user branches",
      });
    }
  };

  // ==================== USER TYPE ENDPOINTS ====================

  /**
   * PUT /api/users/:userId/type
   * Update user type
   */
  updateUserType = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { userType } = req.body;

      if (!userType) {
        res.status(400).json({
          success: false,
          error: "userType is required",
        });
        return;
      }

      const validTypes: UserType[] = ["BRANCH_ADMIN", "EMPLOYEE"];
      if (!validTypes.includes(userType)) {
        res.status(400).json({
          success: false,
          error: `Invalid userType. Must be one of: ${validTypes.join(", ")}`,
        });
        return;
      }

      const organizationId = (req as any).organizationId as string | undefined;

      if (!organizationId) {
        res.status(400).json({
          success: false,
          error: "organizationId is required",
        });
        return;
      }

      const actorOrgRole = (req.rbacUser as any)?.orgRole as string | null | undefined;
      if (actorOrgRole !== "ORG_OWNER" && actorOrgRole !== "ORG_ADMIN") {
        res.status(403).json({
          success: false,
          error: "Only ORG_OWNER or ORG_ADMIN can update user type",
        });
        return;
      }

      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true, orgRole: true },
      });

      if (!target || target.organizationId !== organizationId) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      if (target.orgRole !== "ORG_STAFF") {
        res.status(403).json({
          success: false,
          error: "User type can only be updated for ORG_STAFF",
        });
        return;
      }

      const user = await this.roleService.updateUserType(userId, userType, organizationId);

      res.json({
        success: true,
        data: user,
        message: "User type updated successfully",
      });
    } catch (error: any) {
      console.error("Update user type error:", error);
      const status = error.message === "User not found" ? 404 : 500;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to update user type",
      });
    }
  };

  // ==================== STAFF MANAGEMENT ENDPOINTS ====================

  /**
   * GET /api/staff/hire/search?email=...
   * Search a hire candidate by exact email
   */
  searchHireCandidate = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const email = String((req.query as any)?.email || "").trim();
      if (!email) {
        res.status(400).json({ success: false, error: "email is required" });
        return;
      }

      const user = await this.roleService.findHireCandidateByEmail(email);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      console.error("Search hire candidate error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to search user",
      });
    }
  };

  /**
   * POST /api/staff/hire
   * Hire user into resolved org as ORG_STAFF
   */
  hireStaff = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const { userId } = req.body as { userId?: string };
      if (!userId) {
        res.status(400).json({ success: false, error: "userId is required" });
        return;
      }

      const hired = await this.roleService.hireUserToOrganizationAsStaff(String(userId), organizationId);
      this.rbac.clearUserCache();

      await AuditLogService.writeSafe({
        action: "STAFF_HIRED",
        entityType: "User",
        entityId: String(userId),
        scope: { organizationId },
        actor: AuditLogService.getActorFromRequest(req as any),
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        data: hired,
        message: "User hired successfully",
      });
    } catch (error: any) {
      console.error("Hire staff error:", error);
      const msg = error?.message || "Failed to hire user";
      const status = msg === "User not found" ? 404 : 400;
      res.status(status).json({
        success: false,
        error: msg,
      });
    }
  };

  /**
   * GET /api/staff
   * Get all staff users
   */
  getStaffUsers = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { branchId, userType, includeInactive, assignedOnly } = req.query;

      const organizationId = (req as any).organizationId as string | undefined;
      if (!organizationId) {
        res.status(400).json({
          success: false,
          error: "organizationId is required",
        });
        return;
      }

      const rbacUser = req.rbacUser;
      const orgRole = String((rbacUser as any)?.orgRole || "")
        .trim()
        .toUpperCase();
      const isSuperAdmin = rbacUser?.userType === "SUPER_ADMIN";
      const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
      const isBranchAdmin = rbacUser?.userType === "BRANCH_ADMIN";

      // Optional branch filter: must belong to the resolved org
      const filterBranchId = branchId as string | undefined;
      if (filterBranchId) {
        const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
        const branch = await prisma.branch.findUnique({
          where: { id: filterBranchId },
          select: { id: true, organizationId: true },
        });
        if (!branch || branch.organizationId !== organizationId) {
          res.status(403).json({
            success: false,
            error: "You don't have access to this branch",
          });
          return;
        }

        // BRANCH_ADMIN may only query their assigned branches
        if (
          isBranchAdmin &&
          !isSuperAdmin &&
          !isOrgAdmin &&
          !rbacUser?.assignedBranchIds?.includes(filterBranchId)
        ) {
          res.status(403).json({
            success: false,
            error: "You don't have access to this branch",
          });
          return;
        }
      }

      // If a BRANCH_ADMIN doesn't pass a branchId, restrict list to their assigned branches
      const branchIdsFilter =
        isBranchAdmin && !isSuperAdmin && !isOrgAdmin
          ? rbacUser?.assignedBranchIds || []
          : undefined;

      const users = await this.roleService.getStaffUsers({
        organizationId,
        branchId: filterBranchId,
        branchIds: branchIdsFilter,
        userType: userType as UserType | undefined,
        includeInactive: includeInactive === "true",
        assignedOnly: assignedOnly === "true",
      });

      res.json({
        success: true,
        data: users,
      });
    } catch (error: any) {
      console.error("Get staff users error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get staff users",
      });
    }
  };

  /**
   * GET /api/staff/:userId
   * Get staff user with full RBAC details
   */
  getStaffUser = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const organizationId = (req as any).organizationId as string | undefined;
      const user = await this.roleService.getUserWithRBAC(userId, organizationId);

      res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      console.error("Get staff user error:", error);
      const status = error.message === "User not found" ? 404 : 500;
      res.status(status).json({
        success: false,
        error: error.message || "Failed to get staff user",
      });
    }
  };

  // ==================== PERMISSION CHECK ENDPOINTS ====================

  /**
   * GET /api/permissions/resources
   * Get all available resources and their actions
   */
  getResources = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          resources: RESOURCES,
          actions: ACTIONS,
          resourceActions: RESOURCE_ACTIONS,
        },
      });
    } catch (error: any) {
      console.error("Get resources error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get resources",
      });
    }
  };

  /**
   * GET /api/permissions/me
   * Get current user's permissions
   */
  getMyPermissions = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      if (!req.rbacUser) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const { rbacUser } = req;

      let organizationEntitlements: any = null;
      try {
        const organizationId = (rbacUser as any)?.organizationId as string | null | undefined;
        if (organizationId) {
          const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
          const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
              id: true,
              reservationsAllowed: true,
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
              paypalAllowed: true,
            },
          });
          if (org) {
            organizationEntitlements = {
              id: org.id,
              reservationsAllowed: Boolean(org.reservationsAllowed),
              onlinePaymentsAllowed: Boolean(org.onlinePaymentsAllowed),
              cardPaymentsAllowed: Boolean(org.cardPaymentsAllowed),
              paypalAllowed: Boolean(org.paypalAllowed),
            };
          }
        }
      } catch {
        organizationEntitlements = null;
      }

      res.json({
        success: true,
        data: {
          userId: rbacUser.id,
          userType: rbacUser.userType,
          orgRole: rbacUser.orgRole ?? null,
          organizationId: rbacUser.organizationId ?? null,
          organizationEntitlements,
          hasFullAccess: hasImplicitFullAccess(rbacUser.userType),
          assignedBranchIds: rbacUser.assignedBranchIds,
          permissions: rbacUser.permissions,
          roles: rbacUser.roles.map((r) => ({
            id: r.id,
            name: r.name,
            branchId: r.branchId,
          })),
        },
      });
    } catch (error: any) {
      console.error("Get my permissions error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get permissions",
      });
    }
  };

  /**
   * POST /api/permissions/check
   * Check if current user has a specific permission
   */
  checkPermission = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      if (!req.rbacUser) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const { resource, action, branchId } = req.body;

      if (!resource || !action) {
        res.status(400).json({
          success: false,
          error: "resource and action are required",
        });
        return;
      }

      const { rbacUser } = req;

      // Check if super admin
      if (hasImplicitFullAccess(rbacUser.userType)) {
        res.json({
          success: true,
          data: {
            allowed: true,
            reason: "Super admin has full access",
          },
        });
        return;
      }

      // Check permission
      const allowed = hasPermission(rbacUser.permissions, resource, action);

      // If branch specified, also check branch access
      let branchAllowed = true;
      if (branchId && allowed) {
        branchAllowed = rbacUser.assignedBranchIds.includes(branchId);
      }

      res.json({
        success: true,
        data: {
          allowed: allowed && branchAllowed,
          reason: !allowed
            ? "Permission not granted"
            : !branchAllowed
            ? "No access to this branch"
            : undefined,
        },
      });
    } catch (error: any) {
      console.error("Check permission error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check permission",
      });
    }
  };
}

export default RoleController;
