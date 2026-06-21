import { Router, Response } from "express";
import DatabaseSingleton from "../config/database";
import RBACMiddleware, { type RBACRequest } from "../middleware/rbac";
import { organizationContext, type OrganizationContextRequest } from "../middleware/organizationContext";

const router = Router();
const rbac = RBACMiddleware.getInstance();

router.get(
  "/",
  rbac.authenticate,
  organizationContext.resolve,
  rbac.requireSuperAdminOrOrgAdmin,
  async (req: OrganizationContextRequest, res: Response): Promise<void> => {
    try {
      const rbacUser = (req as any as RBACRequest).rbacUser;
      const isSuperAdmin = rbacUser?.userType === "SUPER_ADMIN";

      const organizationId = req.organizationId;
      if (!isSuperAdmin && !organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const pageRaw = req.query.page as string | undefined;
      const limitRaw = req.query.limit as string | undefined;

      const page = Math.max(Number(pageRaw || 1) || 1, 1);
      const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
      const skip = (page - 1) * limit;

      const branchId = (req.query.branchId as string | undefined) || undefined;
      const action = (req.query.action as string | undefined) || undefined;

      const createdAfter = (req.query.createdAfter as string | undefined) || undefined;
      const createdBefore = (req.query.createdBefore as string | undefined) || undefined;

      const where: any = {};
      if (organizationId) where.organizationId = organizationId;
      if (branchId) where.branchId = branchId;
      if (action) where.action = action;

      if (createdAfter || createdBefore) {
        where.createdAt = {
          ...(createdAfter ? { gte: new Date(createdAfter) } : {}),
          ...(createdBefore ? { lte: new Date(createdBefore) } : {}),
        };
      }

      const prisma = DatabaseSingleton.getInstance().getPrisma() as any;

      const [items, totalCount] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      const actorUserIds = Array.from(
        new Set(
          (items || [])
            .map((i: any) => i?.actorUserId)
            .filter((v: any): v is string => typeof v === "string" && v.trim().length > 0)
        )
      ).filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

      const actorClerkIds = Array.from(
        new Set(
          (items || [])
            .map((i: any) => i?.actorClerkId)
            .filter((v: any): v is string => typeof v === "string" && v.trim().length > 0)
        )
      ).filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

      const branchIds = Array.from(
        new Set(
          (items || [])
            .map((i: any) => i?.branchId)
            .filter((v: any): v is string => typeof v === "string" && v.trim().length > 0)
        )
      ).filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

      const entityPairs = (items || [])
        .map((i: any) => ({ entityType: i?.entityType, entityId: i?.entityId }))
        .filter(
          (p: any) =>
            typeof p?.entityType === "string" &&
            p.entityType &&
            typeof p?.entityId === "string" &&
            p.entityId
        );

      const entityIdsByType = entityPairs.reduce((acc: Record<string, Set<string>>, p: any) => {
        if (!acc[p.entityType]) acc[p.entityType] = new Set();
        acc[p.entityType].add(p.entityId);
        return acc;
      }, {});

      const [usersById, usersByClerkId, branchesById, categoriesById, mealsById, addOnsById, ordersById] =
        await Promise.all([
          actorUserIds.length
            ? prisma.user.findMany({
                where: { id: { in: actorUserIds } },
                select: { id: true, email: true, firstName: true, lastName: true, clerkId: true },
              })
            : Promise.resolve([]),
          actorClerkIds.length
            ? prisma.user.findMany({
                where: { clerkId: { in: actorClerkIds } },
                select: { id: true, email: true, firstName: true, lastName: true, clerkId: true },
              })
            : Promise.resolve([]),
          branchIds.length
            ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
            : Promise.resolve([]),
          entityIdsByType.Category && entityIdsByType.Category.size
            ? prisma.category.findMany({
                where: { id: { in: Array.from(entityIdsByType.Category) } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          entityIdsByType.Meal && entityIdsByType.Meal.size
            ? prisma.meal.findMany({
                where: { id: { in: Array.from(entityIdsByType.Meal) } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          entityIdsByType.AddOn && entityIdsByType.AddOn.size
            ? prisma.addOn.findMany({
                where: { id: { in: Array.from(entityIdsByType.AddOn) } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          entityIdsByType.Order && entityIdsByType.Order.size
            ? prisma.order.findMany({
                where: { id: { in: Array.from(entityIdsByType.Order) } },
                select: { id: true, orderNumber: true, guestName: true },
              })
            : Promise.resolve([]),
        ]);

      const userByIdMap = new Map<string, any>((usersById || []).map((u: any) => [u.id, u]));
      const userByClerkIdMap = new Map<string, any>((usersByClerkId || []).map((u: any) => [u.clerkId, u]));
      const branchByIdMap = new Map<string, any>((branchesById || []).map((b: any) => [b.id, b]));
      const categoryByIdMap = new Map<string, any>((categoriesById || []).map((c: any) => [c.id, c]));
      const mealByIdMap = new Map<string, any>((mealsById || []).map((m: any) => [m.id, m]));
      const addOnByIdMap = new Map<string, any>((addOnsById || []).map((a: any) => [a.id, a]));
      const orderByIdMap = new Map<string, any>((ordersById || []).map((o: any) => [o.id, o]));

      const formatUserDisplay = (u: any): string => {
        if (!u) return "";
        const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
        if (fullName) return `${fullName}${u.email ? ` <${u.email}>` : ""}`;
        if (u.email) return u.email;
        return u.id || "";
      };

      const enrichedItems = (items || []).map((i: any) => {
        const user =
          (i.actorUserId && userByIdMap.get(i.actorUserId)) ||
          (i.actorClerkId && userByClerkIdMap.get(i.actorClerkId)) ||
          null;

        const branch = i.branchId ? branchByIdMap.get(i.branchId) : null;

        let entityDisplay: string | null = null;
        if (i.entityType === "Branch") {
          const entityBranch = i.entityId ? branchByIdMap.get(i.entityId) : null;
          if (entityBranch?.name) entityDisplay = entityBranch.name;
        }
        if (!entityDisplay && i.entityType === "Category") {
          const c = i.entityId ? categoryByIdMap.get(i.entityId) : null;
          if (c?.name) entityDisplay = c.name;
        }
        if (!entityDisplay && i.entityType === "Meal") {
          const m = i.entityId ? mealByIdMap.get(i.entityId) : null;
          if (m?.name) entityDisplay = m.name;
        }
        if (!entityDisplay && i.entityType === "AddOn") {
          const a = i.entityId ? addOnByIdMap.get(i.entityId) : null;
          if (a?.name) entityDisplay = a.name;
        }
        if (!entityDisplay && i.entityType === "Order") {
          const o = i.entityId ? orderByIdMap.get(i.entityId) : null;
          if (o?.orderNumber) {
            entityDisplay = `#${o.orderNumber}${o.guestName ? ` (${o.guestName})` : ""}`;
          }
        }

        const actorDisplay = formatUserDisplay(user);

        return {
          ...i,
          actorDisplay: actorDisplay || null,
          branchName: branch?.name || null,
          entityDisplay,
        };
      });

      const totalPages = Math.max(1, Math.ceil(totalCount / limit));

      res.json({
        success: true,
        data: {
          items: enrichedItems,
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get org audit logs error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch audit logs" });
    }
  }
);

export default router;
