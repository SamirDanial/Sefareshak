/**
 * Role Management Service
 * Handles CRUD operations for roles and user-role assignments
 */

import DatabaseSingleton from "../config/database";
import {
  PermissionSet,
  SYSTEM_ROLES,
  validatePermissions,
  UserType,
} from "../config/permissions";
import RBACMiddleware from "../middleware/rbac";

interface CreateRoleInput {
  organizationId?: string | null;
  name: string;
  description?: string;
  permissions: PermissionSet;
  isSystem?: boolean;
}

interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: PermissionSet;
  isActive?: boolean;
}

interface AssignRoleInput {
  userId: string;
  roleId: string;
  branchId?: string | null;
}

interface AssignBranchInput {
  userId: string;
  branchId: string;
  organizationId?: string;
}

class RoleService {
  private static instance: RoleService;
  private db = DatabaseSingleton.getInstance();

  private constructor() {}

  public static getInstance(): RoleService {
    if (!RoleService.instance) {
      RoleService.instance = new RoleService();
    }
    return RoleService.instance;
  }

  /**
   * Initialize system roles (call on app startup)
   */
  async initializeSystemRoles(): Promise<void> {
    return;
  }

  // ==================== ROLE CRUD ====================

  /**
   * Create a new role
   */
  async createRole(input: CreateRoleInput): Promise<any> {
    const { organizationId = null, name, description, permissions, isSystem = false } = input;

    // Validate permissions
    const validation = validatePermissions(permissions);
    if (!validation.valid) {
      throw new Error(`Invalid permissions: ${validation.errors.join(", ")}`);
    }

    const prisma = this.db.getPrisma();

    // Check if role name already exists
    const existing = await prisma.role.findFirst({
      where: { organizationId, name },
    });

    if (existing) {
      throw new Error(`Role with name "${name}" already exists`);
    }

    const role = await prisma.role.create({
      data: {
        organizationId,
        name,
        description,
        permissions: permissions as any,
        isSystem,
        isActive: true,
      },
    });

    return role;
  }

  /**
   * Get all roles
   */
  async getAllRoles(options?: {
    includeInactive?: boolean;
    organizationId?: string | null;
    includeSystem?: boolean;
  }): Promise<any[]> {
    const prisma = this.db.getPrisma();

    const includeInactive = options?.includeInactive === true;
    const organizationId = options?.organizationId;
    const includeSystem = options?.includeSystem === true;

    const where: any = {};
    if (!includeInactive) {
      where.isActive = true;
    }

    if (organizationId !== undefined) {
      if (includeSystem) {
        where.OR = [{ organizationId }, { organizationId: null }];
      } else {
        where.organizationId = organizationId;
      }
    }

    const roles = await prisma.role.findMany({
      where,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    });

    return roles;
  }

  /**
   * Get role by ID
   */
  async getRoleById(id: string, options?: { organizationId?: string | null; allowSystem?: boolean }): Promise<any> {
    const prisma = this.db.getPrisma();

    const organizationId = options?.organizationId;
    const allowSystem = options?.allowSystem === true;

    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                userType: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    if (organizationId && role.organizationId !== organizationId) {
      throw new Error("Role does not belong to this organization");
    }

    if (organizationId !== undefined) {
      const matchesOrg = role.organizationId === organizationId;
      const isSystem = role.organizationId === null;
      if (!matchesOrg && !(allowSystem && isSystem)) {
        throw new Error("Role not found");
      }
    }

    return role;
  }

  /**
   * Update a role
   */
  async updateRole(
    id: string,
    input: UpdateRoleInput,
    options?: { organizationId?: string | null; allowSystem?: boolean }
  ): Promise<any> {
    const prisma = this.db.getPrisma();

    const organizationId = options?.organizationId;
    const allowSystem = options?.allowSystem === true;

    const existing = await prisma.role.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Role not found");
    }

    if (organizationId !== undefined) {
      const matchesOrg = existing.organizationId === organizationId;
      const isSystemRole = existing.organizationId === null;
      if (!matchesOrg && !(allowSystem && isSystemRole)) {
        throw new Error("Role not found");
      }
    }

    if (existing.organizationId === null) {
      throw new Error("Cannot modify system roles");
    }

    // Prevent modifying system roles name
    if (existing.isSystem && input.name && input.name !== existing.name) {
      throw new Error("Cannot rename system roles");
    }

    // Validate permissions if provided
    if (input.permissions) {
      const validation = validatePermissions(input.permissions);
      if (!validation.valid) {
        throw new Error(`Invalid permissions: ${validation.errors.join(", ")}`);
      }
    }

    const role = await prisma.role.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.permissions && { permissions: input.permissions as any }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    // Clear RBAC cache for all users with this role
    RBACMiddleware.getInstance().clearUserCache();

    return role;
  }

  /**
   * Delete a role
   */
  async deleteRole(id: string, options?: { organizationId?: string | null; allowSystem?: boolean }): Promise<void> {
    const prisma = this.db.getPrisma();

    const organizationId = options?.organizationId;
    const allowSystem = options?.allowSystem === true;

    const existing = await prisma.role.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error("Role not found");
    }

    if (organizationId !== undefined) {
      const matchesOrg = existing.organizationId === organizationId;
      const isSystemRole = existing.organizationId === null;
      if (!matchesOrg && !(allowSystem && isSystemRole)) {
        throw new Error("Role not found");
      }
    }

    if (existing.organizationId === null && !allowSystem) {
      throw new Error("Cannot delete system roles");
    }

    // Delete role (cascade will remove user assignments)
    await prisma.role.delete({
      where: { id },
    });

    // Clear RBAC cache
    RBACMiddleware.getInstance().clearUserCache();
  }

  // ==================== USER-ROLE ASSIGNMENTS ====================

  /**
   * Assign a role to a user
   */
  async assignRoleToUser(input: AssignRoleInput & { organizationId?: string }): Promise<any> {
    const { userId, roleId, branchId, organizationId } = input;
    const prisma = this.db.getPrisma();

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    // Verify role exists
    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    // If branch specified, verify it exists
    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      });

      if (!branch) {
        throw new Error("Branch not found");
      }
    }

    // Check if assignment already exists
    const existing = await prisma.userRoleAssignment.findFirst({
      where: {
        userId,
        roleId,
        branchId: branchId || null,
      },
    });

    if (existing) {
      throw new Error("Role already assigned to user");
    }

    const assignment = await prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId,
        branchId: branchId || null,
      },
      include: {
        role: true,
        branch: true,
      },
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);

    return assignment;
  }

  /**
   * Remove a role from a user
   */
  async removeRoleFromUser(
    userId: string,
    roleId: string,
    branchId?: string | null,
    organizationId?: string
  ): Promise<void> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    if (organizationId) {
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, organizationId: true },
      });
      if (!role || role.organizationId !== organizationId) {
        throw new Error("Role does not belong to this organization");
      }
    }

    await prisma.userRoleAssignment.deleteMany({
      where: {
        userId,
        roleId,
        branchId: branchId === undefined ? undefined : branchId || null,
      },
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: string, organizationId?: string): Promise<any[]> {
    const prisma = this.db.getPrisma();

    if (organizationId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true },
      });
      if (!user) {
        throw new Error("User not found");
      }
      if (user.organizationId !== organizationId) {
        throw new Error("User does not belong to this organization");
      }
    }

    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId,
        ...(organizationId
          ? {
              role: {
                organizationId,
              },
            }
          : {}),
      },
      include: {
        role: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return assignments;
  }

  /**
   * Replace all role assignments for a user
   */
  async setUserRoles(
    userId: string,
    assignments: Array<{ roleId: string; branchId?: string | null }>,
    organizationId?: string
  ): Promise<void> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    if (organizationId) {
      const roleIds = assignments.map((a) => a.roleId);
      if (roleIds.length > 0) {
        const roles = await prisma.role.findMany({
          where: {
            id: { in: roleIds },
          },
          select: { id: true, organizationId: true },
        });

        const rolesById = new Map(roles.map((r) => [r.id, r] as const));
        for (const roleId of roleIds) {
          const role = rolesById.get(roleId);
          if (!role) {
            throw new Error("Role not found");
          }
          if (role.organizationId !== organizationId) {
            throw new Error("Role does not belong to this organization");
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      // Remove all existing assignments
      await tx.userRoleAssignment.deleteMany({
        where: { userId },
      });

      // Create new assignments
      for (const { roleId, branchId } of assignments) {
        await tx.userRoleAssignment.create({
          data: {
            userId,
            roleId,
            branchId: branchId || null,
          },
        });
      }
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);
  }

  // ==================== USER-BRANCH ASSIGNMENTS ====================

  /**
   * Assign a branch to a user
   */
  async assignBranchToUser(input: AssignBranchInput): Promise<any> {
    const { userId, branchId, organizationId } = input;
    const prisma = this.db.getPrisma();

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new Error("Branch not found");
    }

    if (organizationId && branch.organizationId !== organizationId) {
      throw new Error("Branch does not belong to this organization");
    }

    // Check if assignment already exists
    const existing = await prisma.userBranch.findFirst({
      where: { userId, branchId },
    });

    if (existing) {
      throw new Error("Branch already assigned to user");
    }

    const assignment = await prisma.userBranch.create({
      data: {
        userId,
        branchId,
      },
      include: {
        branch: true,
      },
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);

    return assignment;
  }

  /**
   * Remove a branch from a user
   */
  async removeBranchFromUser(userId: string, branchId: string, organizationId?: string): Promise<void> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    if (organizationId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, organizationId: true },
      });

      if (!branch || branch.organizationId !== organizationId) {
        throw new Error("Branch does not belong to this organization");
      }
    }

    await prisma.userBranch.deleteMany({
      where: { userId, branchId },
    });

    // Also remove any branch-specific role assignments
    await prisma.userRoleAssignment.deleteMany({
      where: { userId, branchId },
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);
  }

  /**
   * Get all branches assigned to a user
   */
  async getUserBranches(userId: string, organizationId?: string): Promise<any[]> {
    const prisma = this.db.getPrisma();

    const assignments = await prisma.userBranch.findMany({
      where: {
        userId,
        ...(organizationId
          ? {
              branch: {
                organizationId,
              },
            }
          : {}),
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            city: true,
            state: true,
            organizationId: true,
          },
        },
      },
    });

    return assignments.map((a) => a.branch);
  }

  /**
   * Replace all branch assignments for a user
   */
  async setUserBranches(userId: string, branchIds: string[], organizationId?: string): Promise<void> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    if (organizationId && branchIds.length > 0) {
      const branches = await prisma.branch.findMany({
        where: {
          id: { in: branchIds },
          organizationId,
        },
        select: { id: true },
      });

      if (branches.length !== branchIds.length) {
        throw new Error("One or more branches do not belong to this organization");
      }
    }

    await prisma.$transaction(async (tx) => {
      // Get current branches
      const currentBranches = await tx.userBranch.findMany({
        where: { userId },
        select: { branchId: true },
      });
      const currentBranchIds = currentBranches.map((b) => b.branchId);

      // Find branches to remove
      const branchesToRemove = currentBranchIds.filter((id) => !branchIds.includes(id));

      // Remove old assignments
      await tx.userBranch.deleteMany({
        where: { userId },
      });

      // Remove role assignments for removed branches
      if (branchesToRemove.length > 0) {
        await tx.userRoleAssignment.deleteMany({
          where: {
            userId,
            branchId: { in: branchesToRemove },
          },
        });
      }

      // Create new assignments
      for (const branchId of branchIds) {
        await tx.userBranch.create({
          data: { userId, branchId },
        });
      }
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);
  }

  // ==================== USER TYPE MANAGEMENT ====================

  /**
   * Update user type
   */
  async updateUserType(userId: string, userType: UserType, organizationId?: string): Promise<any> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (organizationId && user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { userType },
    });

    // Clear user cache
    RBACMiddleware.getInstance().clearUserCache(user.clerkId);

    return updated;
  }

  // ==================== ORG MEMBERSHIP MANAGEMENT ====================

  async updateUserOrgRole(userId: string, orgRole: string | null, organizationId: string): Promise<void> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
        orgRole: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    const validOrgRoles = ["ORG_OWNER", "ORG_ADMIN", "ORG_STAFF"];
    const nextOrgRole = orgRole ? String(orgRole) : "ORG_STAFF";
    if (!validOrgRoles.includes(nextOrgRole)) {
      throw new Error(`Invalid orgRole. Must be one of: ${validOrgRoles.join(", ")}`);
    }

    // Prevent removing the last ORG_OWNER from the organization
    if (user.orgRole === "ORG_OWNER" && nextOrgRole !== "ORG_OWNER") {
      const ownerCount = await prisma.user.count({
        where: {
          organizationId,
          orgRole: "ORG_OWNER",
          id: { not: userId },
        },
      });
      if (ownerCount === 0) {
        throw new Error(
          "Cannot remove the last ORG_OWNER from an organization. Assign another ORG_OWNER first."
        );
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        orgRole: nextOrgRole as any,
      },
    });

    RBACMiddleware.getInstance().clearUserCache(user.clerkId);
  }

  async findHireCandidateByEmail(email: string): Promise<any | null> {
    const prisma = this.db.getPrisma();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) return null;

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        userType: true,
        isActive: true,
        organizationId: true,
        orgRole: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    return user;
  }

  async hireUserToOrganizationAsStaff(userId: string, organizationId: string): Promise<any> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
        orgRole: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.organizationId && user.organizationId !== organizationId) {
      throw new Error("User already belongs to another organization");
    }

    if (user.organizationId === organizationId && user.orgRole) {
      throw new Error("User is already in this organization");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        organizationId,
        orgRole: "ORG_STAFF" as any,
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        userType: true,
        isActive: true,
        organizationId: true,
        orgRole: true,
      },
    });

    RBACMiddleware.getInstance().clearUserCache(user.clerkId);

    return updated;
  }

  async removeUserFromOrganization(userId: string, organizationId: string): Promise<void> {
    const prisma = this.db.getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        organizationId: true,
        orgRole: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.organizationId !== organizationId) {
      throw new Error("User does not belong to this organization");
    }

    if (user.orgRole === "ORG_OWNER") {
      const ownerCount = await prisma.user.count({
        where: {
          organizationId,
          orgRole: "ORG_OWNER",
          id: { not: userId },
        },
      });
      if (ownerCount === 0) {
        throw new Error(
          "Cannot remove the last ORG_OWNER from an organization. Assign another ORG_OWNER first."
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: null,
          orgRole: null,
        },
      });

      // Clear branch + role assignments to prevent cross-org leakage
      await tx.userBranch.deleteMany({ where: { userId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId } });
    });

    RBACMiddleware.getInstance().clearUserCache(user.clerkId);
  }

  // ==================== STAFF MANAGEMENT ====================

  /**
   * Get all staff users (non-USER types)
   */
  async getStaffUsers(options?: {
    organizationId?: string;
    branchId?: string;
    branchIds?: string[];
    userType?: UserType;
    includeInactive?: boolean;
    assignedOnly?: boolean;
  }): Promise<any[]> {
    const prisma = this.db.getPrisma();

    const where: any = {};

    // Historically, the staff endpoint excluded USER. However, we also allow
    // assigning org membership (organizationId + orgRole) to a USER, and those
    // users should appear in org staff management.
    if (options?.userType) {
      where.userType = options.userType;
    } else {
      where.OR = [
        { userType: { not: "USER" } },
        { userType: "USER", orgRole: { not: null } },
      ];
    }

    if (options?.organizationId) {
      where.organizationId = options.organizationId;
    }

    if (!options?.includeInactive) {
      where.isActive = true;
    }

    if (options?.assignedOnly) {
      where.assignedBranches = {
        some: {
          branch: {
            organizationId: options?.organizationId,
          },
        },
      };
    }

    if (options?.branchId) {
      where.assignedBranches = {
        some: { branchId: options.branchId },
      };
    } else if (options?.branchIds && options.branchIds.length > 0) {
      where.assignedBranches = {
        some: { branchId: { in: options.branchIds } },
      };
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        assignedBranches: {
          include: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true,
                organizationId: true,
              },
            },
          },
        },
        userRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ userType: "asc" }, { firstName: "asc" }],
    });

    if (!options?.organizationId) return users;

    // Attach per-org assigned branch count
    return users.map((u: any) => {
      const assignedBranchesCount = (u.assignedBranches || []).filter(
        (ab: any) => ab?.branch?.organizationId === options.organizationId
      ).length;
      return {
        ...u,
        assignedBranchesCount,
      };
    });
  }

  /**
   * Create a new staff user
   */
  async createStaffUser(input: {
    email: string;
    clerkId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    userType: UserType;
    branchIds?: string[];
    roleAssignments?: Array<{ roleId: string; branchId?: string | null }>;
  }): Promise<any> {
    const prisma = this.db.getPrisma();

    // Verify email is unique
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new Error("User with this email already exists");
    }

    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          clerkId: input.clerkId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          userType: input.userType,
          isActive: true,
        },
      });

      // Assign branches
      if (input.branchIds && input.branchIds.length > 0) {
        for (const branchId of input.branchIds) {
          await tx.userBranch.create({
            data: {
              userId: newUser.id,
              branchId,
            },
          });
        }
      }

      // Assign roles
      if (input.roleAssignments && input.roleAssignments.length > 0) {
        for (const { roleId, branchId } of input.roleAssignments) {
          await tx.userRoleAssignment.create({
            data: {
              userId: newUser.id,
              roleId,
              branchId: branchId || null,
            },
          });
        }
      }

      return newUser;
    });

    return user;
  }

  /**
   * Get user with full RBAC details
   */
  async getUserWithRBAC(userId: string, organizationId?: string): Promise<any> {
    const prisma = this.db.getPrisma();

    if (organizationId) {
      const userOrg = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, organizationId: true },
      });

      if (!userOrg) {
        throw new Error("User not found");
      }

      if (userOrg.organizationId !== organizationId) {
        throw new Error("User does not belong to this organization");
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        assignedBranches: {
          include: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true,
                isActive: true,
              },
            },
          },
        },
        userRoles: {
          include: {
            role: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }
}

export default RoleService;
