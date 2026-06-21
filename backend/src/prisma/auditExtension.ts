import type { Prisma, PrismaClient } from "@prisma/client";
import RequestContextService from "../services/requestContext";

const AUDITED_MODELS = new Set<string>([
  "Organization",
  "Branch",
  "Settings",
  "ReservationSettings",
  "HeroSection",
  "User",
  "Role",
  "Category",
  "Meal",
  "AddOn",
  "Order",
  "Payment",
]);

const getDelegateKey = (model: string): string => {
  // Prisma delegates are camelCase; AddOn is the main irregular one we rely on.
  if (model === "AddOn") return "addOn";
  return model.charAt(0).toLowerCase() + model.slice(1);
};

function mapAction(model: string, operation: string): string | null {
  const m = model.toUpperCase();
  switch (operation) {
    case "create":
      return `${m}_CREATE`;
    case "update":
      return `${m}_UPDATE`;
    case "delete":
      return `${m}_DELETE`;
    case "upsert":
      return `${m}_UPSERT`;
    default:
      return null;
  }
}

function extractScope(
  context: ReturnType<typeof RequestContextService.getContext>,
  payload: any
): { organizationId?: string; branchId?: string } {
  const scope: { organizationId?: string; branchId?: string } = {};

  if (payload?.organizationId) scope.organizationId = payload.organizationId;
  if (payload?.branchId) scope.branchId = payload.branchId;

  if (!scope.organizationId && context?.organizationId) {
    scope.organizationId = context.organizationId;
  }
  if (!scope.branchId && context?.branchId) {
    scope.branchId = context.branchId;
  }

  return scope;
}

/**
 * Returns a Prisma client extended with automatic audit logging.
 *
 * IMPORTANT:
 * - Uses the provided base client to write to `auditLog` to avoid recursion.
 * - Skips auditing when mutating `AuditLog` itself.
 */
export function withAuditExtension(base: PrismaClient): PrismaClient {
  const baseAny = base as any;
  if (typeof baseAny.$extends !== "function") {
    console.warn(
      "⚠️ Audit extension not applied: Prisma runtime does not support $extends()."
    );
    return base;
  }

  return baseAny.$extends({
    query: {
      $allModels: {
        async create({ model, args, query }: any) {
          const result = await query(args);
          await writeAudit(baseAny, model, "create", args, result);
          return result;
        },
        async update({ model, args, query }: any) {
          const result = await query(args);
          await writeAudit(baseAny, model, "update", args, result);
          return result;
        },
        async upsert({ model, args, query }: any) {
          const result = await query(args);
          await writeAudit(baseAny, model, "upsert", args, result);
          return result;
        },
        async delete({ model, args, query }: any) {
          const result = await query(args);
          await writeAudit(baseAny, model, "delete", args, result);
          return result;
        },
      },
    },
  }) as PrismaClient;
}

async function writeAudit(
  prisma: PrismaClient,
  model: string,
  operation: string,
  args: any,
  result: any
): Promise<void> {
  if (!model || model === "AuditLog") return;
  if (!AUDITED_MODELS.has(model)) return;

  const context = RequestContextService.getContext();
  if (!context) return;

  // Never audit on page-refresh traffic / read requests.
  // Refreshes can trigger background sync calls and we don't want noise in audit logs.
  const method = (context.requestMethod || "").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  // Explicitly ignore certain bootstrap endpoints which can be invoked during app initialization.
  const path = context.requestPath || "";
  if (path === "/api/user/register") return;

  // If we don't have an actor, don't write audit logs. This avoids noisy entries
  // with Unknown actor coming from unauthenticated/system-triggered writes.
  if (!context.actorUserId && !context.actorClerkId) return;

  const action = mapAction(model, operation);
  if (!action) return;

  const entityId: string | null =
    result?.id ?? args?.where?.id ?? args?.data?.id ?? null;

  const scope = extractScope(context, result || args?.data || {});

  let before: any = null;
  let after: any = null;

  if (operation === "delete") {
    before = result;
  } else {
    after = result;
  }

  // Best-effort before snapshot for updates/upserts when we have a stable identifier.
  if ((operation === "update" || operation === "upsert") && !before) {
    const id = args?.where?.id;
    if (typeof id === "string" && id) {
      try {
        const delegateKey = getDelegateKey(model);
        const delegate = (prisma as any)[delegateKey];
        if (delegate?.findUnique) {
          before = await delegate.findUnique({ where: { id } });
        }
      } catch {
        // Ignore before snapshot failures
      }
    }
  }

  try {
    await (prisma as any).auditLog.create({
      data: {
        organizationId: scope.organizationId ?? null,
        branchId: scope.branchId ?? null,
        actorUserId: context.actorUserId ?? null,
        actorClerkId: context.actorClerkId ?? null,
        actorUserType: context.actorUserType ?? null,
        actorOrgRole: context.actorOrgRole ?? null,
        action,
        entityType: model,
        entityId,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
        metadata: {
          method: context.requestMethod,
          path: context.requestPath,
          ip: context.requestIp,
          userAgent: context.requestUserAgent,
        } as Prisma.JsonObject,
      },
    });
  } catch (e) {
    console.error("Failed to write audit log (extension):", e);
  }
}
