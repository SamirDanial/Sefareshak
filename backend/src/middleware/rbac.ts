/**
 * RBAC (Role-Based Access Control) Middleware
 * 
 * This middleware provides comprehensive permission checking for all API routes.
 * It validates:
 * 1. User authentication
 * 2. User type (SUPER_ADMIN, BRANCH_ADMIN, EMPLOYEE, WAITER, USER)
 * 3. Custom role permissions
 * 4. Branch-level access (user can only access data from assigned branches)
 * 
 * This ensures that even if someone has a valid token, they cannot
 * access resources or perform actions they're not authorized for.
 */

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import DatabaseSingleton from "../config/database";
import { verifyToken } from "@clerk/clerk-sdk-node";
import RequestContextService from "../services/requestContext";
import {
  Resource,
  Action,
  UserType,
  PermissionSet,
  DEFAULT_PERMISSIONS,
  hasImplicitFullAccess,
  hasPermission,
  mergePermissions,
  USER_TYPES,
  RESOURCES,
} from "../config/permissions";

const ORG_ADMIN_IMPLICIT_RESOURCES: ReadonlySet<Resource> = new Set<Resource>([
  RESOURCES.DASHBOARD,
  RESOURCES.ORDERS,
  RESOURCES.DISPATCH,
  RESOURCES.KITCHEN,
  RESOURCES.BAR,
  RESOURCES.RESERVATIONS,
  RESOURCES.MENU,
  RESOURCES.DEALS,
  RESOURCES.CATEGORIES,
  RESOURCES.MEALS,
  RESOURCES.ADDONS,
  RESOURCES.OPTIONAL_INGREDIENTS,
  RESOURCES.DECLARATIONS,
  RESOURCES.BRANCHES,
  RESOURCES.SETTINGS,
  RESOURCES.DELIVERABLE_QUANTITIES,
  RESOURCES.USERS,
  RESOURCES.ROLES,
  RESOURCES.REPORTS,
  RESOURCES.END_OF_DAY,
  RESOURCES.CLOSED_DAYS,
  RESOURCES.ANALYTICS,
  RESOURCES.ANALYTICS_REVENUE,
  RESOURCES.ANALYTICS_CATEGORY_INSIGHTS,
  RESOURCES.ANALYTICS_RESERVATION,
  RESOURCES.NOTIFICATIONS,
  RESOURCES.HERO_SECTIONS,
  RESOURCES.TABLES,
  RESOURCES.TABLE_STATUS_GRID,
  RESOURCES.ZONES,
]);

const canOrgAdminBypassPermission = (resource: Resource) => {
  return ORG_ADMIN_IMPLICIT_RESOURCES.has(resource);
};

const normalizeOrgRole = (orgRole: unknown): string => {
  if (!orgRole) return "";
  return String(orgRole).trim().toUpperCase();
};

// Extended user interface with RBAC data
export interface RBACUser {
  id: string;
  clerkId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: UserType;
  organizationId?: string | null;
  orgRole?: string | null;
  isActive: boolean;
  assignedBranchIds: string[];
  permissions: PermissionSet;
  roles: Array<{
    id: string;
    name: string;
    branchId: string | null;
    permissions: PermissionSet;
  }>;
}

// Extended request with RBAC user
export interface RBACRequest extends AuthenticatedRequest {
  rbacUser?: RBACUser;
  requestedBranchId?: string; // The branch ID being accessed (from params, query, or body)
}

// Decode JWT payload helper
const decodeJwtPayload = (token: string): any | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
};

// Get issuer candidates from env
const getIssuerCandidates = (): string[] => {
  const raw = process.env.CLERK_ISSUER_URL;
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

class RBACMiddleware {
  private static instance: RBACMiddleware;
  private userCache: Map<string, { user: RBACUser; timestamp: number }> = new Map();
  private CACHE_TTL = 60000; // 1 minute cache

  private constructor() {}

  public static getInstance(): RBACMiddleware {
    if (!RBACMiddleware.instance) {
      RBACMiddleware.instance = new RBACMiddleware();
    }
    return RBACMiddleware.instance;
  }

  /**
   * Clear user cache (call when user permissions change)
   */
  public clearUserCache(userId?: string): void {
    if (userId) {
      this.userCache.delete(userId);
    } else {
      this.userCache.clear();
    }
  }

  /**
   * Fetch user with all RBAC data (branches, roles, permissions)
   */
  private async fetchRBACUser(clerkId: string): Promise<RBACUser | null> {
    // Check cache first
    const cached = this.userCache.get(clerkId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.user;
    }

    const db = DatabaseSingleton.getInstance();
    
    const user = await db.getPrisma().user.findUnique({
      where: { clerkId },
      include: {
        assignedBranches: {
          select: { branchId: true }
        },
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) return null;

    // Build the RBAC user object
    const assignedBranchIds = user.assignedBranches.map(ab => ab.branchId);
    
    // Get permissions from all assigned roles
    const roles = user.userRoles.map(ur => ({
      id: ur.role.id,
      name: ur.role.name,
      branchId: ur.branchId,
      permissions: ur.role.permissions as PermissionSet,
    }));

    // Calculate effective permissions
    // 1. Start with default permissions for user type
    // 2. Merge with all assigned role permissions
    const defaultPerms = DEFAULT_PERMISSIONS[user.userType as UserType] || {};
    const rolePerms = roles.map(r => r.permissions);
    const effectivePermissions = mergePermissions(defaultPerms, ...rolePerms);

    const rbacUser: RBACUser = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      userType: user.userType as UserType,
      organizationId: (user as any).organizationId ?? null,
      orgRole: (user as any).orgRole ?? null,
      isActive: user.isActive,
      assignedBranchIds,
      permissions: effectivePermissions,
      roles,
    };

    // Cache the user
    this.userCache.set(clerkId, { user: rbacUser, timestamp: Date.now() });

    return rbacUser;
  }

  /**
   * Authenticate user and load RBAC data
   */
  public authenticate = async (
    req: RBACRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // If auth not already populated, verify token manually
      if (!req.auth?.userId) {
        const authHeader = req.headers.authorization;
        const issuers = getIssuerCandidates();

        // Dev bypass (non-production without Clerk)
        if (process.env.NODE_ENV !== "production" && (!authHeader || issuers.length === 0)) {
          // Fetch or create dev user
          const db = DatabaseSingleton.getInstance();
          let devUser = await db.getPrisma().user.findUnique({
            where: { clerkId: "dev" }
          });
          
          if (!devUser) {
            devUser = await db.getPrisma().user.create({
              data: {
                clerkId: "dev",
                email: "dev@local",
                userType: "SUPER_ADMIN",
                isActive: true,
              }
            });
          }

          req.auth = { userId: "dev", sessionId: "dev" };
          req.rbacUser = {
            id: devUser.id,
            clerkId: "dev",
            email: "dev@local",
            firstName: null,
            lastName: null,
            phone: null,
            userType: "SUPER_ADMIN",
            isActive: true,
            assignedBranchIds: [],
            permissions: {},
            roles: [],
          };
          RequestContextService.updateContext({
            actorUserId: req.rbacUser.id,
            actorClerkId: req.rbacUser.clerkId,
            actorUserType: req.rbacUser.userType,
            actorOrgRole: (req.rbacUser as any).orgRole ?? null,
            organizationId: (req.rbacUser as any).organizationId ?? null,
          });
          next();
          return;
        }

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const token = authHeader.substring(7);

        try {
          if (issuers.length === 0) {
            throw new Error("CLERK_ISSUER_URL not configured");
          }

          let payload: any | null = null;
          let lastError: unknown = null;
          
          for (const issuer of issuers) {
            try {
              payload = await verifyToken(token, { issuer });
              break;
            } catch (e) {
              lastError = e;
            }
          }

          if (!payload) {
            throw lastError ?? new Error("Token verification failed");
          }

          req.auth = {
            userId: payload.sub,
            sessionId: payload.sid,
          };
        } catch (verifyError) {
          const decoded = decodeJwtPayload(token);
          console.error("RBAC - Token verification failed:", {
            error: verifyError,
            decodedIss: decoded?.iss,
            configuredIssuers: issuers,
          });
          res.status(401).json({
            success: false,
            error: "Invalid token",
            code: "INVALID_TOKEN",
          });
          return;
        }
      }

      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      // Fetch user with RBAC data
      const rbacUser = await this.fetchRBACUser(req.auth.userId);

      if (!rbacUser) {
        res.status(401).json({
          success: false,
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
        return;
      }

      if (!rbacUser.isActive) {
        res.status(403).json({
          success: false,
          error: "Account is deactivated",
          code: "ACCOUNT_DEACTIVATED",
        });
        return;
      }

      req.rbacUser = rbacUser;

      RequestContextService.updateContext({
        actorUserId: rbacUser.id,
        actorClerkId: rbacUser.clerkId,
        actorUserType: rbacUser.userType,
        actorOrgRole: (rbacUser as any).orgRole ?? null,
        organizationId: (rbacUser as any).organizationId ?? null,
      });
      
      // Also set legacy req.user for backward compatibility
      (req as any).user = {
        id: rbacUser.id,
        clerkId: rbacUser.clerkId,
        email: rbacUser.email,
        firstName: rbacUser.firstName,
        lastName: rbacUser.lastName,
        phone: rbacUser.phone,
        role: rbacUser.userType === "SUPER_ADMIN" || rbacUser.userType === "BRANCH_ADMIN" ? "ADMIN" : "USER",
        isActive: rbacUser.isActive,
      };

      next();
    } catch (error) {
      console.error("RBAC authenticate error:", error);
      res.status(500).json({
        success: false,
        error: "Authentication error",
        code: "AUTH_ERROR",
      });
    }
  };

  /**
   * Check if user has a specific permission
   * Use after authenticate middleware
   */
  public requirePermission = (resource: Resource, action: Action) => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const { rbacUser } = req;

        // SUPER_ADMIN has all permissions
        if (hasImplicitFullAccess(rbacUser.userType)) {
          next();
          return;
        }

        // ORG_OWNER / ORG_ADMIN have full access within their org
        const orgRole = normalizeOrgRole((rbacUser as any).orgRole);
        if ((orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") && canOrgAdminBypassPermission(resource)) {
          next();
          return;
        }

        // Check user's effective permissions
        if (hasPermission(rbacUser.permissions, resource, action)) {
          next();
          return;
        }

        // Permission denied
        console.warn(`Permission denied: User ${rbacUser.id} (${rbacUser.userType}) attempted ${action} on ${resource}`);
        
        res.status(403).json({
          success: false,
          error: `You don't have permission to ${action} ${resource}`,
          code: "PERMISSION_DENIED",
          details: {
            resource,
            action,
            userType: rbacUser.userType,
          },
        });
      } catch (error) {
        console.error("RBAC permission check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Check if user has ANY of the specified permissions
   */
  public requireAnyPermission = (permissions: Array<{ resource: Resource; action: Action }>) => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const { rbacUser } = req;

        // SUPER_ADMIN has all permissions
        if (hasImplicitFullAccess(rbacUser.userType)) {
          next();
          return;
        }

        // ORG_OWNER / ORG_ADMIN have full access within their org
        const orgRole = normalizeOrgRole((rbacUser as any).orgRole);
        if (
          (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") &&
          permissions.every(({ resource }) => canOrgAdminBypassPermission(resource))
        ) {
          next();
          return;
        }

        // Check if user has any of the required permissions
        const hasAny = permissions.some(({ resource, action }) =>
          hasPermission(rbacUser.permissions, resource, action)
        );

        if (hasAny) {
          next();
          return;
        }

        console.warn("RBAC requireAnyPermission denied", {
          path: req.originalUrl,
          method: req.method,
          userId: rbacUser.id,
          userType: rbacUser.userType,
          orgRoleRaw: (rbacUser as any).orgRole ?? null,
          orgRoleNormalized: normalizeOrgRole((rbacUser as any).orgRole) || null,
          requiredAny: permissions,
        });

        res.status(403).json({
          success: false,
          error: "You don't have permission for this action",
          code: "PERMISSION_DENIED",
          details: {
            userType: rbacUser.userType,
            orgRole: (rbacUser as any).orgRole ?? null,
            requiredAny: permissions,
          },
        });
      } catch (error) {
        console.error("RBAC permission check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Check if user has ALL of the specified permissions
   */
  public requireAllPermissions = (permissions: Array<{ resource: Resource; action: Action }>) => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const { rbacUser } = req;

        // SUPER_ADMIN has all permissions
        if (hasImplicitFullAccess(rbacUser.userType)) {
          next();
          return;
        }

        // ORG_OWNER / ORG_ADMIN have full access within their org
        const orgRole = normalizeOrgRole((rbacUser as any).orgRole);
        if (
          (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") &&
          permissions.every(({ resource }) => canOrgAdminBypassPermission(resource))
        ) {
          next();
          return;
        }

        // Check if user has all required permissions
        const missingPermissions = permissions.filter(
          ({ resource, action }) => !hasPermission(rbacUser.permissions, resource, action)
        );

        if (missingPermissions.length === 0) {
          next();
          return;
        }

        res.status(403).json({
          success: false,
          error: "You don't have all required permissions",
          code: "PERMISSION_DENIED",
          details: {
            missing: missingPermissions,
            userType: rbacUser.userType,
            orgRole: (rbacUser as any).orgRole ?? null,
          },
        });
      } catch (error) {
        console.error("RBAC permission check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Check if user has access to a specific branch
   * Extracts branch ID from request params, query, or body
   */
  public requireBranchAccess = (branchIdSource: "params" | "query" | "body" = "params", paramName: string = "branchId") => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const { rbacUser } = req;

        // Get branch ID from request (if present)
        let branchId: string | undefined;
        switch (branchIdSource) {
          case "params":
            branchId = req.params[paramName];
            break;
          case "query":
            branchId = req.query[paramName] as string;
            break;
          case "body":
            branchId = (req.body as any)?.[paramName];
            break;
        }

        // SUPER_ADMIN has access to all branches
        if (hasImplicitFullAccess(rbacUser.userType)) {
          // Still store requested branch ID for downstream middleware (e.g. requireBranchHasOrganization)
          if (branchId) {
            req.requestedBranchId = branchId;
            RequestContextService.updateContext({ branchId });
          }
          next();
          return;
        }

        // ORG_OWNER / ORG_ADMIN have access to all branches in their org
        let orgRole = normalizeOrgRole((rbacUser as any).orgRole);

        // Defensive: ensure orgRole is not missing/stale due to caching.
        // This endpoint is security-sensitive and is frequently hit when switching branches.
        if (orgRole !== "ORG_OWNER" && orgRole !== "ORG_ADMIN") {
          try {
            const prisma = DatabaseSingleton.getInstance().getPrisma() as any;
            const fresh = await prisma.user.findUnique({
              where: { id: rbacUser.id },
              select: { orgRole: true, organizationId: true },
            });
            if (fresh) {
              (rbacUser as any).orgRole = (fresh as any).orgRole ?? (rbacUser as any).orgRole ?? null;
              (rbacUser as any).organizationId =
                (fresh as any).organizationId ?? (rbacUser as any).organizationId ?? null;
              orgRole = normalizeOrgRole((rbacUser as any).orgRole);
            }
          } catch {
            // ignore and fall back to cached RBAC data
          }
        }

        if (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") {
          if (branchId) {
            req.requestedBranchId = branchId;
            RequestContextService.updateContext({ branchId });
          }
          next();
          return;
        }

        if (!branchId) {
          // No branch specified, allow if user has any branch access
          if (rbacUser.assignedBranchIds.length > 0) {
            next();
            return;
          }
          res.status(403).json({
            success: false,
            error: "No branch access assigned",
            code: "NO_BRANCH_ACCESS",
          });
          return;
        }

        // Store requested branch ID for downstream middleware
        req.requestedBranchId = branchId;
        RequestContextService.updateContext({ branchId });

        // Check if user has access to this branch
        if (!rbacUser.assignedBranchIds.includes(branchId)) {
          console.warn(`Branch access denied: User ${rbacUser.id} attempted to access branch ${branchId}`);
          console.warn("RBAC requireBranchAccess denied", {
            path: req.originalUrl,
            method: req.method,
            userId: rbacUser.id,
            userType: rbacUser.userType,
            orgRoleRaw: (rbacUser as any).orgRole ?? null,
            orgRoleNormalized: normalizeOrgRole((rbacUser as any).orgRole) || null,
            requestedBranch: branchId,
            assignedBranchIdsCount: Array.isArray(rbacUser.assignedBranchIds) ? rbacUser.assignedBranchIds.length : 0,
          });
          res.status(403).json({
            success: false,
            error: "You don't have access to this branch",
            code: "BRANCH_ACCESS_DENIED",
            details: {
              requestedBranch: branchId,
              userType: rbacUser.userType,
              orgRole: (rbacUser as any).orgRole ?? null,
              assignedBranchIdsCount: Array.isArray(rbacUser.assignedBranchIds) ? rbacUser.assignedBranchIds.length : 0,
            },
          });
          return;
        }

        next();
      } catch (error) {
        console.error("RBAC branch access check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Enforce that the requested branch is assigned to an Organization.
   * Use this AFTER requireBranchAccess has populated req.requestedBranchId.
   *
   * This is used as a strict guard during the multi-tenant migration period:
   * branches without organizationId are considered "unassigned" and should not
   * be allowed to perform business-critical operations.
   */
  public requireBranchHasOrganization = () => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const branchId = req.requestedBranchId;
        if (!branchId) {
          res.status(400).json({
            success: false,
            error: "branchId is required",
            code: "BRANCH_ID_REQUIRED",
          });
          return;
        }

        const db = DatabaseSingleton.getInstance();
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId },
          select: { id: true, organizationId: true },
        });

        if (!branch) {
          res.status(404).json({
            success: false,
            error: "Branch not found",
            code: "BRANCH_NOT_FOUND",
          });
          return;
        }

        if (!branch.organizationId) {
          res.status(409).json({
            success: false,
            error: "This location must be assigned to an organization before it can be used",
            code: "BRANCH_ORGANIZATION_REQUIRED",
            details: { branchId: branch.id },
          });
          return;
        }

        next();
      } catch (error) {
        console.error("RBAC requireBranchHasOrganization error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Combined middleware: authenticate + require permission + optional branch access
   */
  public authorize = (
    resource: Resource,
    action: Action,
    options?: {
      requireBranch?: boolean;
      branchIdSource?: "params" | "query" | "body";
      branchIdParam?: string;
    }
  ) => {
    const middlewares = [
      this.authenticate,
      this.requirePermission(resource, action),
    ];

    if (options?.requireBranch) {
      middlewares.push(
        this.requireBranchAccess(
          options.branchIdSource || "params",
          options.branchIdParam || "branchId"
        )
      );
    }

    return middlewares;
  };

  /**
   * Require specific user types
   */
  public requireUserType = (...allowedTypes: UserType[]) => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        if (!allowedTypes.includes(req.rbacUser.userType)) {
          res.status(403).json({
            success: false,
            error: "Your user type does not have access to this resource",
            code: "USER_TYPE_DENIED",
            details: {
              currentType: req.rbacUser.userType,
              allowedTypes,
            },
          });
          return;
        }

        next();
      } catch (error) {
        console.error("RBAC user type check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Require SUPER_ADMIN only
   */
  public requireSuperAdmin = async (
    req: RBACRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    return this.requireUserType(USER_TYPES.SUPER_ADMIN as UserType)(req, res, next);
  };

  /**
   * Require organization admin-level role (ORG_OWNER or ORG_ADMIN)
   * Note: this is org-scoped and depends on organizationContext.resolve being executed.
   */
  public requireOrgAdmin = async (
    req: RBACRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.rbacUser) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      const orgRole = normalizeOrgRole((req.rbacUser as any).orgRole);
      if (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") {
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: "Organization admin access required",
        code: "ORG_ADMIN_REQUIRED",
      });
    } catch (error) {
      console.error("RBAC org admin check error:", error);
      res.status(500).json({
        success: false,
        error: "Authorization error",
        code: "AUTH_ERROR",
      });
    }
  };

  /**
   * Require SUPER_ADMIN or org admin (ORG_OWNER/ORG_ADMIN)
   */
  public requireSuperAdminOrOrgAdmin = async (
    req: RBACRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (req.rbacUser && hasImplicitFullAccess(req.rbacUser.userType)) {
      next();
      return;
    }
    return this.requireOrgAdmin(req, res, next);
  };

  /**
   * Require admin-level access (SUPER_ADMIN or BRANCH_ADMIN)
   */
  public requireAdmin = async (
    req: RBACRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    return this.requireUserType(
      USER_TYPES.SUPER_ADMIN as UserType,
      USER_TYPES.BRANCH_ADMIN as UserType
    )(req, res, next);
  };

  /**
   * Filter data based on user's branch access
   * Returns a Prisma where clause for branch filtering
   */
  public getBranchFilter(rbacUser: RBACUser): { branchId?: string | { in: string[] } } {
    // SUPER_ADMIN sees all
    if (hasImplicitFullAccess(rbacUser.userType)) {
      return {};
    }

    // ORG_OWNER / ORG_ADMIN see all branches (org scoping is handled elsewhere)
    const orgRole = (rbacUser as any).orgRole as string | null | undefined;
    if (orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN") {
      return {};
    }

    // Other users see only their assigned branches
    if (rbacUser.assignedBranchIds.length === 0) {
      // No branches assigned - return impossible filter
      return { branchId: "__none__" };
    }

    if (rbacUser.assignedBranchIds.length === 1) {
      return { branchId: rbacUser.assignedBranchIds[0] };
    }

    return { branchId: { in: rbacUser.assignedBranchIds } };
  }

  /**
   * Check if user can access a specific resource by ID
   * Useful for checking ownership or branch access for a specific item
   */
  public async canAccessResource(
    rbacUser: RBACUser,
    resourceType: "order" | "reservation" | "branch" | "user",
    resourceId: string
  ): Promise<boolean> {
    // SUPER_ADMIN can access everything
    if (hasImplicitFullAccess(rbacUser.userType)) {
      return true;
    }

    const orgRole = (rbacUser as any).orgRole as string | null | undefined;
    const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

    const db = DatabaseSingleton.getInstance();

    switch (resourceType) {
      case "order": {
        const order = await db.getPrisma().order.findUnique({
          where: { id: resourceId },
          select: { branchId: true, userId: true, branch: { select: { organizationId: true } } },
        });
        if (!order) return false;
        if (isOrgAdmin) {
          const orgId = (rbacUser as any).organizationId as string | null | undefined;
          if (!orgId) return false;
          return Boolean(order.branch?.organizationId && order.branch.organizationId === orgId);
        }
        // Check branch access or ownership
        return (
          (order.branchId && rbacUser.assignedBranchIds.includes(order.branchId)) ||
          order.userId === rbacUser.id
        );
      }

      case "reservation": {
        const reservation = await db.getPrisma().reservation.findUnique({
          where: { id: resourceId },
          select: { branchId: true, userId: true, branch: { select: { organizationId: true } } },
        });
        if (!reservation) return false;
        if (isOrgAdmin) {
          const orgId = (rbacUser as any).organizationId as string | null | undefined;
          if (!orgId) return false;
          return Boolean(reservation.branch?.organizationId && reservation.branch.organizationId === orgId);
        }
        return (
          (reservation.branchId && rbacUser.assignedBranchIds.includes(reservation.branchId)) ||
          reservation.userId === rbacUser.id
        );
      }

      case "branch": {
        return rbacUser.assignedBranchIds.includes(resourceId);
      }

      case "user": {
        // For user management, check if target user is in same branches
        const targetUser = await db.getPrisma().user.findUnique({
          where: { id: resourceId },
          include: { assignedBranches: { select: { branchId: true } } },
        });
        if (!targetUser) return false;
        const targetBranches = targetUser.assignedBranches.map(ab => ab.branchId);
        return targetBranches.some(b => rbacUser.assignedBranchIds.includes(b));
      }

      default:
        return false;
    }
  }

  /**
   * Require organization owner or admin access for a specific organization
   * Checks if user is super admin OR belongs to the organization as owner/admin
   */
  public requireOrganizationOwnerOrAdmin = (organizationIdParam: string = "organizationId") => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const { rbacUser } = req;

        // SUPER_ADMIN has access to all organizations
        if (hasImplicitFullAccess(rbacUser.userType)) {
          next();
          return;
        }

        // Get organization ID from request params
        const organizationId = req.params[organizationIdParam];
        if (!organizationId) {
          res.status(400).json({
            success: false,
            error: "Organization ID is required",
            code: "ORGANIZATION_ID_REQUIRED",
          });
          return;
        }

        // Check if user belongs to this organization
        const userOrgId = (rbacUser as any).organizationId;
        if (userOrgId !== organizationId) {
          res.status(403).json({
            success: false,
            error: "You don't have access to this organization",
            code: "ORGANIZATION_ACCESS_DENIED",
          });
          return;
        }

        // Check if user has owner or admin role
        const orgRole = normalizeOrgRole((rbacUser as any).orgRole);
        if (orgRole !== "ORG_OWNER" && orgRole !== "ORG_ADMIN") {
          res.status(403).json({
            success: false,
            error: "Organization owner or admin access required",
            code: "ORG_OWNER_OR_ADMIN_REQUIRED",
          });
          return;
        }

        next();
      } catch (error) {
        console.error("RBAC organization owner/admin check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };

  /**
   * Generic method to check specific organization permission
   * Checks if user is super admin OR belongs to organization with specific permission
   */
  public requireOrganizationPermission = (resource: Resource, action: Action, organizationIdParam: string = "organizationId") => {
    return async (req: RBACRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.rbacUser) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
            code: "AUTH_REQUIRED",
          });
          return;
        }

        const { rbacUser } = req;

        // SUPER_ADMIN has all permissions
        if (hasImplicitFullAccess(rbacUser.userType)) {
          next();
          return;
        }

        // Get organization ID from request params
        const organizationId = req.params[organizationIdParam];
        if (!organizationId) {
          res.status(400).json({
            success: false,
            error: "Organization ID is required",
            code: "ORGANIZATION_ID_REQUIRED",
          });
          return;
        }

        // Check if user belongs to this organization
        const userOrgId = (rbacUser as any).organizationId;
        if (userOrgId !== organizationId) {
          res.status(403).json({
            success: false,
            error: "You don't have access to this organization",
            code: "ORGANIZATION_ACCESS_DENIED",
          });
          return;
        }

        // Check if user has the specific permission
        if (!hasPermission(rbacUser.permissions, resource, action)) {
          res.status(403).json({
            success: false,
            error: `You don't have permission to ${action} ${resource}`,
            code: "PERMISSION_DENIED",
            details: {
              resource,
              action,
            },
          });
          return;
        }

        next();
      } catch (error) {
        console.error("RBAC organization permission check error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
          code: "AUTH_ERROR",
        });
      }
    };
  };
}

export default RBACMiddleware;
