import { Request } from "express";
import DatabaseSingleton from "../config/database";

export type AuditActor = {
  userId?: string | null;
  clerkId?: string | null;
  userType?: string | null;
  orgRole?: string | null;
};

export type AuditScope = {
  organizationId?: string | null;
  branchId?: string | null;
};

export type AuditWriteInput = {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  scope?: AuditScope;
  actor?: AuditActor;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export class AuditLogService {
  public static getActorFromRequest(req: Request): AuditActor {
    const rbacUser: any = (req as any).rbacUser;
    return {
      userId: rbacUser?.id ?? null,
      clerkId: rbacUser?.clerkId ?? null,
      userType: rbacUser?.userType ?? null,
      orgRole: rbacUser?.orgRole ?? null,
    };
  }

  public static getRequestMetadata(req: Request): Record<string, unknown> {
    return {
      method: req.method,
      path: req.originalUrl,
      ip: (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    };
  }

  public static async write(input: AuditWriteInput): Promise<void> {
    const prisma = DatabaseSingleton.getInstance().getPrisma() as any;

    const scope = input.scope || {};
    const actor = input.actor || {};

    await prisma.auditLog.create({
      data: {
        organizationId: scope.organizationId ?? null,
        branchId: scope.branchId ?? null,

        actorUserId: actor.userId ?? null,
        actorClerkId: actor.clerkId ?? null,
        actorUserType: actor.userType ?? null,
        actorOrgRole: actor.orgRole ?? null,

        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,

        before: input.before === undefined ? null : (input.before as any),
        after: input.after === undefined ? null : (input.after as any),
        metadata: input.metadata === undefined ? null : (input.metadata as any),
      },
    });
  }

  public static async writeSafe(input: AuditWriteInput): Promise<void> {
    try {
      await AuditLogService.write(input);
    } catch (e) {
      console.error("[AuditLog] Failed to write audit log:", e);
    }
  }
}
