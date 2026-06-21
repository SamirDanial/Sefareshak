import { Response, NextFunction } from "express";
import { AuthenticatedRequest, UserType } from "../types";
import DatabaseSingleton from "../config/database";
import { verifyToken } from "@clerk/clerk-sdk-node";
import RequestContextService from "../services/requestContext";

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

const getIssuerCandidates = (): string[] => {
  const raw = process.env.CLERK_ISSUER_URL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

class AuthMiddleware {
  private static instance: AuthMiddleware;

  private constructor() {}

  public static getInstance(): AuthMiddleware {
    if (!AuthMiddleware.instance) {
      AuthMiddleware.instance = new AuthMiddleware();
    }
    return AuthMiddleware.instance;
  }

  // Middleware to require authentication
  public requireAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // If Clerk middleware didn't populate req.auth, try manual verification
      if (!req.auth?.userId) {
        const authHeader = req.headers.authorization;

        // Development-only bypass when Clerk isn't configured or token isn't present.
        // This keeps local/dev environments usable while production stays strict.
        const issuers = getIssuerCandidates();
        if (process.env.NODE_ENV !== "production" && (!authHeader || issuers.length === 0)) {
          const db = DatabaseSingleton.getInstance();
          let devUser = await db.getPrisma().user.findUnique({ where: { clerkId: "dev" } });
          if (!devUser) {
            devUser = await db.getPrisma().user.create({
              data: {
                clerkId: "dev",
                email: "dev@local",
                userType: "SUPER_ADMIN",
                isActive: true,
              },
            });
          }

          req.auth = { userId: "dev", sessionId: "dev" };
          req.user = devUser as any;

          RequestContextService.updateContext({
            actorUserId: (devUser as any).id,
            actorClerkId: (devUser as any).clerkId,
            actorUserType: (devUser as any).userType as UserType,
            actorOrgRole: (devUser as any).orgRole ?? null,
            organizationId: (devUser as any).organizationId ?? null,
          });
          next();
          return;
        }

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
          });
          return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        try {
          const issuers = getIssuerCandidates();
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

          // Set req.auth manually
          req.auth = {
            userId: payload.sub,
            sessionId: payload.sid,
          };
        } catch (verifyError) {
          const decoded = decodeJwtPayload(token);
          const decodedIss = decoded?.iss;
          console.error(
            "Auth middleware - Token verification failed:",
            {
              error: verifyError,
              decodedIss,
              configuredIssuers: getIssuerCandidates(),
            }
          );
          res.status(401).json({
            success: false,
            error: "Invalid token",
          });
          return;
        }
      }

      if (!req.auth?.userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      // Fetch user from database
      const db = DatabaseSingleton.getInstance();
      const user = await db.getPrisma().user.findUnique({
        where: { clerkId: req.auth.userId },
      });

      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: "User not found or inactive",
        });
        return;
      }

      // Attach user to request
      req.user = user;

      RequestContextService.updateContext({
        actorUserId: user.id,
        actorClerkId: (user as any).clerkId ?? null,
        actorUserType: user.userType,
        actorOrgRole: (user as any).orgRole ?? null,
        organizationId: (user as any).organizationId ?? null,
      });
      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      res.status(500).json({
        success: false,
        error: "Authentication error",
      });
    }
  };

  // Middleware to require admin role
  public requireAdmin = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First check if user is authenticated
      await this.requireAuth(req, res, () => {});

      if (!req.user) {
        return; // Error already handled by requireAuth
      }

      const adminTypes = ["SUPER_ADMIN", "BRANCH_ADMIN"];
      const orgAdminRoles = ["ORG_OWNER", "ORG_ADMIN"];
      const isAdminType = adminTypes.includes(req.user.userType);
      const isOrgAdmin = orgAdminRoles.includes((req.user as any).orgRole || "");
      if (!isAdminType && !isOrgAdmin) {
        res.status(403).json({
          success: false,
          error: "Admin access required",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Admin middleware error:", error);
      res.status(500).json({
        success: false,
        error: "Authorization error",
      });
    }
  };

  // Middleware to optionally authenticate (for guest users)
  public optionalAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.auth?.userId) {
        // User is authenticated, fetch user data
        const db = DatabaseSingleton.getInstance();
        const user = await db.getPrisma().user.findUnique({
          where: { clerkId: req.auth.userId },
        });

        if (user && user.isActive) {
          req.user = user;

          RequestContextService.updateContext({
            actorUserId: user.id,
            actorClerkId: (user as any).clerkId ?? null,
            actorUserType: user.userType,
            actorOrgRole: (user as any).orgRole ?? null,
            organizationId: (user as any).organizationId ?? null,
          });
        }
      }

      next();
    } catch (error) {
      console.error("Optional auth middleware error:", error);
      // Don't fail the request for optional auth errors
      next();
    }
  };

  // Middleware to check if user can access resource
  public requireOwnershipOrAdmin = (resourceUserIdField: string = "userId") => {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            success: false,
            error: "Authentication required",
          });
          return;
        }

        // Admin can access everything
        const adminTypes = ["SUPER_ADMIN", "BRANCH_ADMIN"];
        if (adminTypes.includes(req.user.userType)) {
          next();
          return;
        }

        // Check if user owns the resource
        const resourceUserId =
          req.params[resourceUserIdField] || req.body[resourceUserIdField];

        if (resourceUserId !== req.user.id) {
          res.status(403).json({
            success: false,
            error: "Access denied",
          });
          return;
        }

        next();
      } catch (error) {
        console.error("Ownership middleware error:", error);
        res.status(500).json({
          success: false,
          error: "Authorization error",
        });
      }
    };
  };
}

export default AuthMiddleware;
