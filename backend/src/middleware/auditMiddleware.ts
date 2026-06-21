import { Prisma } from "@prisma/client";
import DatabaseSingleton from "../config/database";
import RequestContextService from "../services/requestContext";

/**
 * Models that should be audited
 */
const AUDITED_MODELS = new Set([
  "Organization",
  "Branch",
  "Settings",
  "ReservationSettings",
  "HeroSection",
  "User",
  "UserRoleAssignment",
  "Role",
  "Category",
  "Meal",
  "Addon",
  "Order",
  "Payment",
]);

/**
 * Map Prisma action to audit action string
 */
function mapPrismaActionToAuditAction(
  model: string,
  action: string
): string | null {
  const modelUpper = model.toUpperCase();
  
  switch (action) {
    case "create":
      return `${modelUpper}_CREATE`;
    case "update":
      return `${modelUpper}_UPDATE`;
    case "delete":
      return `${modelUpper}_DELETE`;
    case "upsert":
      return `${modelUpper}_UPSERT`;
    default:
      return null;
  }
}

/**
 * Extract organization/branch IDs from the model data
 */
function extractScope(model: string, data: any): { organizationId?: string; branchId?: string } {
  const scope: { organizationId?: string; branchId?: string } = {};

  if (data?.organizationId) {
    scope.organizationId = data.organizationId;
  }
  if (data?.branchId) {
    scope.branchId = data.branchId;
  }

  // For models that don't have direct org/branch fields, try to infer from context
  if (!scope.organizationId && !scope.branchId) {
    const context = RequestContextService.getContext();
    if (context?.organizationId) {
      scope.organizationId = context.organizationId;
    }
    if (context?.branchId) {
      scope.branchId = context.branchId;
    }
  }

  return scope;
}

/**
 * Initialize Prisma middleware for automatic audit logging
 */
export function initializeAuditMiddleware() {
  const db = DatabaseSingleton.getInstance();
  const prisma = db.getPrisma();

  const prismaAny = prisma as any;
  if (typeof prismaAny.$use !== "function") {
    console.warn(
      "⚠️ Audit middleware not initialized: Prisma runtime does not support $use()."
    );
    return;
  }

  prismaAny.$use(async (params: any, next: any) => {
    // Execute the query first
    const result = await next(params);

    // Only audit specific models and actions
    if (!AUDITED_MODELS.has(params.model || "")) {
      return result;
    }

    const action = params.action;
    if (!["create", "update", "delete", "upsert"].includes(action)) {
      return result;
    }

    // Get request context
    const context = RequestContextService.getContext();
    if (!context) {
      // No request context available (e.g., background job, seed script)
      return result;
    }

    try {
      const auditAction = mapPrismaActionToAuditAction(params.model!, action);
      if (!auditAction) {
        return result;
      }

      // Extract entity ID from result or params
      let entityId: string | null = null;
      if (result?.id) {
        entityId = result.id;
      } else if (params.args?.where?.id) {
        entityId = params.args.where.id;
      }

      // Extract scope (org/branch)
      const scope = extractScope(params.model!, result || params.args?.data || {});

      // Prepare before/after data
      let before: any = null;
      let after: any = null;

      if (action === "create" || action === "upsert") {
        after = result;
      } else if (action === "update") {
        // For updates, we don't have the "before" state in middleware
        // The result is the "after" state
        after = result;
        // Note: To get "before" state, we'd need to fetch it before the update
        // For now, we'll just log the after state
      } else if (action === "delete") {
        // For deletes, the result might be the deleted record
        before = result;
      }

      // Write audit log asynchronously (don't block the response)
      setImmediate(async () => {
        try {
          await (prisma as any).auditLog.create({
            data: {
              organizationId: scope.organizationId || null,
              branchId: scope.branchId || null,
              actorUserId: context.actorUserId || null,
              actorClerkId: context.actorClerkId || null,
              actorUserType: context.actorUserType || null,
              actorOrgRole: context.actorOrgRole || null,
              action: auditAction,
              entityType: params.model,
              entityId: entityId,
              before: before ? JSON.parse(JSON.stringify(before)) : null,
              after: after ? JSON.parse(JSON.stringify(after)) : null,
              metadata: {
                method: context.requestMethod,
                path: context.requestPath,
                ip: context.requestIp,
                userAgent: context.requestUserAgent,
              },
            },
          });
        } catch (error) {
          console.error("Failed to write audit log:", error);
        }
      });
    } catch (error) {
      console.error("Error in audit middleware:", error);
    }

    return result;
  });

  console.log("✅ Audit middleware initialized");
}
