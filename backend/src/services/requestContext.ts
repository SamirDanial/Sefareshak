import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";

export interface RequestContextData {
  actorUserId?: string;
  actorClerkId?: string;
  actorUserType?: string;
  actorOrgRole?: string;
  organizationId?: string;
  branchId?: string;
  requestMethod?: string;
  requestPath?: string;
  requestIp?: string;
  requestUserAgent?: string;
}

class RequestContextService {
  private static asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

  /**
   * Get the current request context
   */
  public static getContext(): RequestContextData | undefined {
    return this.asyncLocalStorage.getStore();
  }

  public static updateContext(patch: Partial<RequestContextData>): void {
    const store = this.asyncLocalStorage.getStore();
    if (!store) return;
    Object.assign(store, patch);
  }

  /**
   * Express middleware to capture and store request context
   */
  public static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context: RequestContextData = {};

      // Extract actor info from RBAC user if available
      const rbacUser = (req as any).rbacUser;
      if (rbacUser) {
        context.actorUserId = rbacUser.id;
        context.actorClerkId = rbacUser.clerkId;
        context.actorUserType = rbacUser.userType;
        context.actorOrgRole = rbacUser.orgRole;
      }

      // Extract organization scope if available
      const organizationId = (req as any).organizationId;
      if (typeof organizationId === "string" && organizationId.trim()) {
        context.organizationId = organizationId;
      }

      // Extract branch context if available
      const branchId =
        (req as any).requestedBranchId || (req as any).branchId || (req as any).selectedBranchId;
      if (branchId) {
        context.branchId = branchId;
      }

      // Extract request metadata
      context.requestMethod = req.method;
      context.requestPath = req.path;
      context.requestIp = req.ip || req.socket?.remoteAddress;
      context.requestUserAgent = req.get("user-agent");

      // Run the rest of the request within this context
      this.asyncLocalStorage.run(context, () => {
        next();
      });
    };
  }

  /**
   * Manually set context (useful for background jobs or testing)
   */
  public static runWithContext<T>(
    context: RequestContextData,
    callback: () => T
  ): T {
    return this.asyncLocalStorage.run(context, callback);
  }
}

export default RequestContextService;
