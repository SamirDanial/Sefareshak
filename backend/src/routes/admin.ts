import { Router, Request, Response } from "express";
import { PrismaClient, type AppStatus } from "@prisma/client";
import AuthMiddleware from "../middleware/auth";
import DatabaseSingleton from "../config/database";
import type { AuthenticatedRequest } from "../types";
import { getEffectiveFutureOrderSettings } from "../utils/branchConfigHelper";
import RBACMiddleware, { type RBACRequest } from "../middleware/rbac";
import { validateOrderTypeTransition } from "../utils/orderValidation";
import { getMealBasePrice } from "../utils/mealPriceHelper";
import { getAddonBasePrice } from "../utils/addonPriceHelper";
import { calculateOrderTotals } from "../utils/orderCalculator";
import { deliverableQuantityService } from "../services/deliverableQuantityService";
import { createDeliveryLinkToken } from "../utils/deliveryLink";
import { SettingsController } from "../controllers/settingsController";
import { deliverableQuantityController } from "../controllers/deliverableQuantityController";
import { mealController } from "../controllers/mealController";
import {
  startOfYear,
  endOfYear,
  endOfMonth,
  format,
  eachMonthOfInterval,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
} from "date-fns";
import WebSocketService from "../services/websocketService";
import FiskalyService from "../services/fiskalyService";
import {
  getFiskalyConfigSnapshot,
  shouldFiscalize,
} from "../utils/fiscalization";
import { RESOURCES, ACTIONS, hasImplicitFullAccess } from "../config/permissions";
import BusinessDayService from "../services/businessDayService";
import { organizationContext } from "../middleware/organizationContext";
import { AuditLogService } from "../services/auditLogService";

const APP_STATUS_VALUES: AppStatus[] = [
  "LIVE",
  "COMING_SOON",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
];

const normalizeAppStatus = (
  value: unknown
): AppStatus | undefined => {
  if (typeof value !== "string") return undefined;
  return APP_STATUS_VALUES.includes(value as AppStatus)
    ? (value as AppStatus)
    : undefined;
};

class AdminRoutes {
  private static instance: AdminRoutes;
  private router: Router;
  private authMiddleware: AuthMiddleware;
  private rbac: RBACMiddleware;
  private prisma: PrismaClient;
  private businessDayService: BusinessDayService;

  private constructor() {
    this.router = Router();
    this.authMiddleware = AuthMiddleware.getInstance();
    this.rbac = RBACMiddleware.getInstance();
    this.prisma = new PrismaClient();
    this.businessDayService = BusinessDayService.getInstance();
    this.initializeRoutes();
  }

  private getKitchenTickets = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const branchId = String(req.query.branchId || "").trim();
      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }

      const dateRaw = String(req.query.date || "").trim();
      const startRaw = String(req.query.startDate || "").trim();
      const endRaw = String(req.query.endDate || "").trim();

      const parseDay = (s: string) => {
        if (!s) return null;
        const d = new Date(`${s}T00:00:00.000Z`);
        return isNaN(d.getTime()) ? null : d;
      };

      const start = parseDay(startRaw || dateRaw);
      const end = parseDay(endRaw || dateRaw);
      const startAt = start ? start : new Date(0);
      const endAt = end ? new Date(end.getTime() + 24 * 60 * 60 * 1000) : new Date();

      const tickets = await (this.prisma as any).kitchenTicket.findMany({
        where: {
          branchId,
          createdAt: {
            gte: startAt,
            lt: endAt,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ success: true, data: tickets });
    } catch (e) {
      console.error("getKitchenTickets error:", e);
      res.status(500).json({ success: false, error: "Failed to fetch kitchen tickets" });
    }
  };

  private createKitchenTicket = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const branchId = String((req.body as any)?.branchId || "").trim();
      const reservationIdRaw = String((req.body as any)?.reservationId || "").trim();
      const items = (req.body as any)?.items;

      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }
      if (!items) {
        res.status(400).json({ success: false, error: "items is required" });
        return;
      }

      const createdByUserId = (req as any)?.rbacUser?.id || null;

      const ticket = await (this.prisma as any).kitchenTicket.create({
        data: {
          branchId,
          reservationId: reservationIdRaw ? reservationIdRaw : null,
          items,
          createdByUserId,
          status: "NEW" as any,
        },
      });

      try {
        const ws = WebSocketService.getInstance();
        ws.emitKitchenTicketCreated(ticket);
      } catch (emitErr) {
        console.error("Failed to emit kitchen-ticket-created:", emitErr);
      }

      res.status(201).json({ success: true, data: ticket });
    } catch (e) {
      console.error("createKitchenTicket error:", e);
      res.status(500).json({ success: false, error: "Failed to create kitchen ticket" });
    }
  };

  private updateKitchenTicketStatus = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id || "").trim();
      const statusRaw = String((req.body as any)?.status || "").trim().toUpperCase();

      if (!id) {
        res.status(400).json({ success: false, error: "id is required" });
        return;
      }
      const allowed = new Set(["NEW", "PREPARING", "READY", "CANCELLED"]);
      if (!allowed.has(statusRaw)) {
        res.status(400).json({ success: false, error: "Invalid status" });
        return;
      }

      const existing = await (this.prisma as any).kitchenTicket.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ success: false, error: "Kitchen ticket not found" });
        return;
      }

      // Branch access enforcement for non-implicit users
      const rbacUser = (req as any).rbacUser;
      if (rbacUser && !hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(existing.branchId)) {
          res.status(403).json({ success: false, error: "Access denied for this branch" });
          return;
        }
      }

      const ticket = await (this.prisma as any).kitchenTicket.update({
        where: { id },
        data: {
          status: statusRaw as any,
        },
      });

      // If this kitchen ticket is linked to an order (pickup/delivery KDS), keep order status in sync.
      // The Order remains the source of truth; KitchenTicket status represents kitchen progress.
      // NOTE: At this stage, linkage is stored inside ticket.items payload (orderId).
      // A future schema improvement can add a proper orderId column on KitchenTicket.
      try {
        const rawItems = (ticket as any)?.items;
        const payload =
          typeof rawItems === "string"
            ? (() => {
                try {
                  return JSON.parse(rawItems);
                } catch {
                  return {};
                }
              })()
            : rawItems || {};

        const orderId = String(payload?.orderId || "").trim();
        const source = String(payload?.source || "").trim().toLowerCase();
        const isOrderTicket = !!orderId && (source === "pickup" || source === "delivery");

        if (isOrderTicket) {
          const nextOrderStatus = (() => {
            if (statusRaw === "PREPARING") return "PREPARING";
            if (statusRaw === "READY") {
              return source === "pickup" ? "READY_FOR_PICKUP" : "READY_FOR_DELIVERY";
            }
            if (statusRaw === "CANCELLED") return "CANCELLED";
            // NEW does not change the order status (Option 2).
            return null;
          })();

          if (nextOrderStatus) {
            const order = await (this.prisma as any).order.findUnique({
              where: { id: orderId },
              select: { id: true, userId: true },
            });

            if (order) {
              const updatedOrder = await (this.prisma as any).order.update({
                where: { id: orderId },
                data: { status: nextOrderStatus as any },
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      phone: true,
                    },
                  },
                  orderItems: {
                    include: {
                      meal: {
                        select: {
                          id: true,
                          name: true,
                          basePrice: true,
                          image: true,
                        },
                      },
                      orderItemAddOns: true,
                    },
                  },
                },
              });

              try {
                const ws = WebSocketService.getInstance();
                if ((updatedOrder as any)?.user?.id) {
                  ws.emitOrderStatusChange((updatedOrder as any).user.id, updatedOrder);
                } else if (order?.userId) {
                  ws.emitOrderStatusChange(order.userId, updatedOrder);
                }

                // Emit order-updated to admin-room
                const db = DatabaseSingleton.getInstance();
                const prisma = db.getPrisma();
                const notification = await prisma.notification.findFirst({
                  where: { orderId: updatedOrder.id },
                  orderBy: { createdAt: "desc" },
                });
                if (notification) {
                  ws.emitOrderUpdate(notification, updatedOrder, []);
                } else {
                  const newNotification = await prisma.notification.create({
                    data: {
                      orderId: updatedOrder.id,
                      isSeen: false,
                      isOrderUpdate: true,
                    },
                    include: {
                      order: {
                        include: {
                          user: {
                            select: {
                              id: true,
                              firstName: true,
                              lastName: true,
                              email: true,
                              phone: true,
                            },
                          },
                          orderItems: {
                            include: {
                              deal: { select: { id: true, name: true, image: true } },
                              meal: { select: { id: true, name: true, basePrice: true, image: true, isDrink: true } },
                            },
                          },
                        },
                      },
                    },
                  });
                  ws.emitOrderUpdate(newNotification, updatedOrder, []);
                }
              } catch (emitErr) {
                console.error("Failed to emit order updates after kitchen ticket status change:", emitErr);
              }
            }
          }
        }
      } catch (syncErr) {
        console.error("Failed to sync order status from kitchen ticket:", syncErr);
      }

      try {
        const ws = WebSocketService.getInstance();
        ws.emitKitchenTicketUpdated(ticket);
      } catch (emitErr) {
        console.error("Failed to emit kitchen-ticket-updated:", emitErr);
      }

      res.json({ success: true, data: ticket });
    } catch (e) {
      console.error("updateKitchenTicketStatus error:", e);
      res.status(500).json({ success: false, error: "Failed to update kitchen ticket status" });
    }
  };

  private isOrgAdminOrOwner = (rbacUser: any): boolean => {
    const raw = rbacUser?.orgRole;
    if (!raw) return false;
    const normalized = String(raw).trim().toUpperCase();
    return normalized === "ORG_OWNER" || normalized === "ORG_ADMIN";
  };

  public static getInstance(): AdminRoutes {
    if (!AdminRoutes.instance) {
      AdminRoutes.instance = new AdminRoutes();
    }
    return AdminRoutes.instance;
  }

  public getRouter(): Router {
    return this.router;
  }

  private initializeRoutes(): void {
    // Analytics routes should be permission-based (not admin-only)
    const analyticsRouter = Router();
    const requireOrgSelectionForSuperAdmin = (
      req: any,
      res: any,
      next: any
    ) => {
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

    analyticsRouter.use(
      this.rbac.authenticate,
      organizationContext.resolve,
      requireOrgSelectionForSuperAdmin,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.ANALYTICS_REVENUE, action: ACTIONS.VIEW },
        { resource: RESOURCES.ANALYTICS, action: ACTIONS.VIEW },
      ])
    );
    analyticsRouter.get("/", this.getAnalytics);
    analyticsRouter.get("/revenue", this.getRevenueAnalytics);
    analyticsRouter.get("/revenue-detailed", this.getDetailedRevenueAnalytics);
    analyticsRouter.get("/refunds", this.getRefundAnalytics);
    analyticsRouter.get("/refunds/branch-chart", this.getBranchRefundsChart);
    analyticsRouter.get("/revenue/branch-chart", this.getBranchRevenueChart);
    analyticsRouter.get("/orders", this.getOrderAnalytics);
    this.router.use("/analytics", analyticsRouter);

    // Meal branch price routes should be permission-based (not admin-only)
    const mealBranchPriceRouter = Router();
    const requireOrgSelectionForSuperAdminForMeals = (
      req: any,
      res: any,
      next: any
    ) => {
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
    mealBranchPriceRouter.get(
      "/:mealId/branch-prices",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
        { resource: RESOURCES.MEALS, action: ACTIONS.VIEW },
      ]),
      mealController.getMealBranchPrices
    );
    mealBranchPriceRouter.post(
      "/:mealId/branch-prices",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
        { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
      ]),
      mealController.upsertMealBranchPrice
    );
    mealBranchPriceRouter.put(
      "/:mealId/branch-prices",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
        { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
      ]),
      mealController.upsertMealBranchPrice
    );
    mealBranchPriceRouter.delete(
      "/:mealId/branch-prices/:branchId",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.DELETE },
        { resource: RESOURCES.MEALS, action: ACTIONS.DELETE },
      ]),
      mealController.deleteMealBranchPrice
    );

    // Meal branch availability routes (permission-based)
    mealBranchPriceRouter.get(
      "/:mealId/branch-availability",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.VIEW },
        { resource: RESOURCES.MEALS, action: ACTIONS.VIEW },
      ]),
      (mealController as any).getMealBranchAvailability
    );
    mealBranchPriceRouter.put(
      "/:mealId/branch-availability",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
        { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
      ]),
      (mealController as any).upsertMealBranchAvailability
    );
    mealBranchPriceRouter.post(
      "/:mealId/branch-availability",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.UPDATE },
        { resource: RESOURCES.MEALS, action: ACTIONS.UPDATE },
      ]),
      (mealController as any).upsertMealBranchAvailability
    );
    mealBranchPriceRouter.delete(
      "/:mealId/branch-availability/:branchId",
      this.rbac.authenticate,
      requireOrgSelectionForSuperAdminForMeals,
      organizationContext.resolve,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.MENU, action: ACTIONS.DELETE },
        { resource: RESOURCES.MEALS, action: ACTIONS.DELETE },
      ]),
      (mealController as any).deleteMealBranchAvailability
    );
    this.router.use("/meals", mealBranchPriceRouter);

    // Order management routes should be permission-based (not admin-only)
    // This allows staff members with ORDERS permissions to access these endpoints.
    this.router.get(
      "/orders/dispatch",
      this.rbac.authenticate,
      organizationContext.resolve,
      this.rbac.requirePermission(RESOURCES.DISPATCH, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("query", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.getOrders
    );
    this.router.get(
      "/orders",
      this.rbac.authenticate,
      organizationContext.resolve,
      this.rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("query", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.getOrders
    );
    this.router.get(
      "/orders/:id",
      this.rbac.authenticate,
      organizationContext.resolve,
      this.rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.VIEW),
      this.getOrder
    );
    this.router.put(
      "/orders/:id",
      this.rbac.authenticate,
      organizationContext.resolve,
      (req: Request, res: Response, next) => {
        const status = (req.body as any)?.status;
        if (status === "CANCELLED") {
          return this.rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.CANCEL)(req as any, res, next);
        }
        return this.rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.UPDATE)(req as any, res, next);
      },
      this.updateOrder
    );
    this.router.delete(
      "/orders/:id",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.ORDERS, ACTIONS.DELETE),
      this.deleteOrder
    );

    // Kitchen tickets (Reservation KDS) - permission-based
    this.router.get(
      "/kitchen-tickets",
      this.rbac.authenticate,
      organizationContext.resolve,
      this.rbac.requirePermission(RESOURCES.KITCHEN, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("query", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.getKitchenTickets
    );
    this.router.post(
      "/kitchen-tickets",
      this.rbac.authenticate,
      organizationContext.resolve,
      this.rbac.requirePermission(RESOURCES.KITCHEN, ACTIONS.EDIT),
      this.rbac.requireBranchAccess("body", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.createKitchenTicket
    );
    this.router.patch(
      "/kitchen-tickets/:id/status",
      this.rbac.authenticate,
      organizationContext.resolve,
      this.rbac.requirePermission(RESOURCES.KITCHEN, ACTIONS.UPDATE_STATUS),
      this.updateKitchenTicketStatus
    );

    // Business day (End of Day) routes
    this.router.get(
      "/business-day/current",
      this.rbac.authenticate,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
        { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
      ]),
      this.rbac.requireBranchAccess("query", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.getCurrentBusinessDay
    );
    this.router.post(
      "/business-day/validate-close",
      this.rbac.authenticate,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
        { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
      ]),
      this.rbac.requireBranchAccess("body", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.validateBusinessDayClose
    );
    this.router.post(
      "/business-day/close",
      this.rbac.authenticate,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.END_OF_DAY, action: ACTIONS.CLOSE_DAY },
        { resource: RESOURCES.REPORTS, action: ACTIONS.EXPORT },
      ]),
      this.rbac.requireBranchAccess("body", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.closeBusinessDay
    );
    this.router.get(
      "/business-day/:sessionId/report",
      this.rbac.authenticate,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
        { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
        { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
      ]),
      this.getBusinessDayReport
    );

    this.router.get(
      "/business-day/:sessionId/dsfinvk-cash-point-closing",
      this.rbac.authenticate,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
        { resource: RESOURCES.END_OF_DAY, action: ACTIONS.VIEW },
        { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
      ]),
      this.getDsfinvkCashPointClosing
    );

    this.router.get(
      "/business-day/closed",
      this.rbac.authenticate,
      this.rbac.requireAnyPermission([
        { resource: RESOURCES.CLOSED_DAYS, action: ACTIONS.VIEW },
        { resource: RESOURCES.REPORTS, action: ACTIONS.VIEW },
      ]),
      this.rbac.requireBranchAccess("query", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      this.listClosedBusinessDays
    );

    // Deliverable quantity management should be permission-based (not admin-only)
    // This allows staff members with SETTINGS:manage to access these endpoints for their assigned branches.
    this.router.get(
      "/deliverable-quantities/branches/:branchId/meals",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("params", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.getMealsForBranch
    );
    this.router.get(
      "/deliverable-quantities/branches/:branchId/meals/:mealId/sizes",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("params", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.getMealSizes
    );
    this.router.post(
      "/deliverable-quantities/size-weights",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.MANAGE),
      this.rbac.requireBranchAccess("body", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.upsertSizeWeight
    );
    this.router.put(
      "/deliverable-quantities/size-weights/:id",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.MANAGE),
      async (req: Request, res: Response, next) => {
        try {
          const id = req.params.id;
          const db = DatabaseSingleton.getInstance();

          const weight = await db.getPrisma().mealSizeWeight.findUnique({
            where: { id },
            select: { branchId: true },
          });

          if (!weight?.branchId) {
            res.status(404).json({ success: false, error: "Size weight not found" });
            return;
          }

          const rbacUser = (req as any).rbacUser;
          if (!rbacUser) {
            res.status(401).json({ success: false, error: "Authentication required" });
            return;
          }

          if (!hasImplicitFullAccess(rbacUser.userType)) {
            if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(weight.branchId)) {
              res.status(403).json({ success: false, error: "Access denied for this branch" });
              return;
            }
          }

          (req as any).requestedBranchId = weight.branchId;
          next();
        } catch (e) {
          console.error("Deliverable size-weight branch check error:", e);
          res.status(500).json({ success: false, error: "Authorization error" });
        }
      },
      deliverableQuantityController.upsertSizeWeight
    );
    this.router.delete(
      "/deliverable-quantities/size-weights/:id",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.MANAGE),
      async (req: Request, res: Response, next) => {
        try {
          const id = req.params.id;
          const db = DatabaseSingleton.getInstance();

          const weight = await db.getPrisma().mealSizeWeight.findUnique({
            where: { id },
            select: { branchId: true },
          });

          if (!weight?.branchId) {
            res.status(404).json({ success: false, error: "Size weight not found" });
            return;
          }

          const rbacUser = (req as any).rbacUser;
          if (!rbacUser) {
            res.status(401).json({ success: false, error: "Authentication required" });
            return;
          }

          if (!hasImplicitFullAccess(rbacUser.userType)) {
            if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(weight.branchId)) {
              res.status(403).json({ success: false, error: "Access denied for this branch" });
              return;
            }
          }

          (req as any).requestedBranchId = weight.branchId;
          next();
        } catch (e) {
          console.error("Deliverable size-weight branch check error:", e);
          res.status(500).json({ success: false, error: "Authorization error" });
        }
      },
      deliverableQuantityController.deleteSizeWeight
    );
    // Daily deliverable (no date - applies every day)
    this.router.get(
      "/deliverable-quantities/daily/:branchId/:mealId",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("params", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.getDailyDeliverable
    );
    this.router.post(
      "/deliverable-quantities/daily",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.MANAGE),
      this.rbac.requireBranchAccess("body", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.upsertDailyDeliverable
    );
    this.router.delete(
      "/deliverable-quantities/daily/:branchId/:mealId",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.MANAGE),
      this.rbac.requireBranchAccess("params", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.deleteDailyDeliverable
    );
    // Available weight for today
    this.router.get(
      "/deliverable-quantities/available/:branchId/:mealId",
      this.rbac.authenticate,
      this.rbac.requirePermission(RESOURCES.DELIVERABLE_QUANTITIES, ACTIONS.VIEW),
      this.rbac.requireBranchAccess("params", "branchId"),
      this.rbac.requireBranchHasOrganization(),
      deliverableQuantityController.getAvailableWeight
    );

    // Apply admin authentication to all other admin routes
    this.router.use(this.authMiddleware.requireAdmin);

    this.router.get(
      "/audit-logs",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.getAuditLogs
    );

    // Admin dashboard
    this.router.get(
      "/dashboard",
      (req: AuthenticatedRequest, res: Response) => {
        res.json({
          success: true,
          data: {
            message: "Admin dashboard",
            user: req.user,
            stats: {
              totalOrders: 0,
              totalUsers: 0,
              totalRevenue: 0,
              pendingOrders: 0,
            },
          },
        });
      }
    );

    // User management routes
    this.router.get(
      "/users",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.getUsers
    );
    this.router.get(
      "/users/:id",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.getUser
    );
    this.router.put(
      "/users/:id",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.updateUser
    );
    this.router.delete(
      "/users/:id",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.deleteUser
    );
    this.router.patch(
      "/users/:id/toggle-status",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.toggleUserStatus
    );
    this.router.patch(
      "/users/:id/organization",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.setUserOrganization
    );

    // Category management routes
    this.router.get("/categories", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.getCategories);
    this.router.post("/categories", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.createCategory);
    this.router.put("/categories/:id", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.updateCategory);
    this.router.delete("/categories/:id", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.deleteCategory);

    // Meal management routes
    this.router.get("/meals", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.getMeals);
    this.router.post("/meals", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.createMeal);
    this.router.put("/meals/:id", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.updateMeal);
    this.router.delete("/meals/:id", this.rbac.authenticate, this.rbac.requireSuperAdmin, this.deleteMeal);

    // Settings routes
    this.setupSettingsRoutes();

    // Organization validation routes (Super Admin only)
    this.router.get(
      "/organizations-list/validation",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.getOrganizationsWithValidation
    );

    this.router.get(
      "/organizations/:organizationId/validation-details",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.getOrganizationValidation
    );

    this.router.post(
      "/organizations/:organizationId/validation-create",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.createValidation
    );

    this.router.patch(
      "/organizations/:organizationId/validation/:validationId",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.updateValidation
    );

    this.router.patch(
      "/organizations/:organizationId/validation/:validationId/unvalidate",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.unvalidateValidation
    );

    this.router.patch(
      "/organizations/:organizationId/validation/:validationId/reactivate",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      this.reactivateValidation
    );

    // Public endpoint for checking organization validity (customer-facing)
    this.router.get(
      "/public/organizations/:organizationId/validity",
      this.checkOrganizationValidity
    );
  }

  private getAuditLogs = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const pageRaw = req.query.page as string | undefined;
      const limitRaw = req.query.limit as string | undefined;

      const page = Math.max(Number(pageRaw || 1) || 1, 1);
      const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
      const skip = (page - 1) * limit;

      const organizationId = (req.query.organizationId as string | undefined) || undefined;
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

      const [items, totalCount] = await Promise.all([
        (this.prisma as any).auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        (this.prisma as any).auditLog.count({ where }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalCount / limit));

      res.json({
        success: true,
        data: {
          items,
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
      console.error("Get audit logs error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch audit logs" });
    }
  };

  // User management handlers
  private getUsers = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || "";
      const sortBy = (req.query.sortBy as string) || "createdAt";
      const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";
      const userType = (req.query.userType as string) || "";
      const role = (req.query.role as string) || "";

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      if (search) {
        const searchTrimmed = search.trim();
        const searchTerms = searchTrimmed
          .split(/\s+/)
          .filter((term) => term.length > 0);

        if (searchTerms.length > 1) {
          // Multiple words - check for full name combinations
          // e.g., "Samir Danial" should match firstName="Samir" AND lastName="Danial"
          const firstName = searchTerms[0];
          const lastName = searchTerms.slice(1).join(" ");

          where.OR = [
            // First word as firstName, rest as lastName
            {
              AND: [
                { firstName: { contains: firstName, mode: "insensitive" } },
                { lastName: { contains: lastName, mode: "insensitive" } },
              ],
            },
            // Reverse: first word as lastName, rest as firstName
            {
              AND: [
                { lastName: { contains: firstName, mode: "insensitive" } },
                { firstName: { contains: lastName, mode: "insensitive" } },
              ],
            },
            // Also check if search term matches concatenated full name
            {
              AND: [
                {
                  firstName: { contains: searchTerms[0], mode: "insensitive" },
                },
                {
                  lastName: {
                    contains: searchTerms[searchTerms.length - 1],
                    mode: "insensitive",
                  },
                },
              ],
            },
            // Fallback: search in individual fields
            { firstName: { contains: searchTrimmed, mode: "insensitive" } },
            { lastName: { contains: searchTrimmed, mode: "insensitive" } },
            { email: { contains: searchTrimmed, mode: "insensitive" } },
          ];
        } else {
          // Single word - search in all fields
          where.OR = [
            { firstName: { contains: searchTrimmed, mode: "insensitive" } },
            { lastName: { contains: searchTrimmed, mode: "insensitive" } },
            { email: { contains: searchTrimmed, mode: "insensitive" } },
          ];
        }
      }

      // Backward compatibility: support legacy `role` filter (ADMIN/USER)
      // New canonical filter is `userType`
      if (userType) {
        where.userType = userType;
      } else if (role) {
        if (role === "ADMIN") {
          where.userType = { in: ["SUPER_ADMIN", "BRANCH_ADMIN"] };
        } else if (role === "USER") {
          where.userType = "USER";
        }
      }

      // Build orderBy clause
      // Handle "name" sorting by sorting by firstName, then lastName
      let orderBy: any = {};
      if (sortBy === "name") {
        orderBy = [
          { firstName: sortOrder },
          { lastName: sortOrder },
        ];
      } else {
        // Validate sortBy field exists in User model
        const validSortFields = ["email", "createdAt", "updatedAt", "userType", "firstName", "lastName"];
        if (validSortFields.includes(sortBy)) {
          orderBy[sortBy] = sortOrder;
        } else {
          // Default to createdAt if invalid field
          orderBy.createdAt = sortOrder;
        }
      }

      // Get users with pagination
      const [users, totalCount] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            organization: {
              select: { id: true, name: true },
            },
            orders: {
              select: {
                id: true,
                status: true,
                totalAmount: true,
                createdAt: true,
              },
            },
            _count: {
              select: {
                orders: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        success: true,
        data: {
          users,
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
      console.error("Get users error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users",
      });
    }
  };

  private setUserOrganization = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const userId = req.params.id;
      const { organizationId, orgRole } = req.body as {
        organizationId?: string | null;
        orgRole?: string | null;
      };

      // Validate org if provided
      let nextOrganizationId: string | null = null;
      if (organizationId === null || organizationId === undefined || organizationId === "") {
        nextOrganizationId = null;
      } else if (typeof organizationId === "string") {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!org) {
          res.status(400).json({
            success: false,
            error: "Invalid organizationId",
          });
          return;
        }
        nextOrganizationId = org.id;
      } else {
        res.status(400).json({
          success: false,
          error: "organizationId must be a string or null",
        });
        return;
      }

      const validOrgRoles = ["ORG_OWNER", "ORG_ADMIN", "ORG_STAFF"];
      const nextOrgRoleRaw: string | null =
        orgRole === null || orgRole === undefined || orgRole === "" ? null : String(orgRole);

      if (!nextOrganizationId && nextOrgRoleRaw) {
        res.status(400).json({
          success: false,
          error: "orgRole cannot be set when organizationId is null",
        });
        return;
      }

      const nextOrgRole: string | null =
        nextOrganizationId && !nextOrgRoleRaw
          ? "ORG_STAFF"
          : nextOrgRoleRaw && validOrgRoles.includes(nextOrgRoleRaw)
          ? nextOrgRoleRaw
          : nextOrgRoleRaw
          ? "__invalid__"
          : null;

      if (nextOrgRole === "__invalid__") {
        res.status(400).json({
          success: false,
          error: `Invalid orgRole. Must be one of: ${validOrgRoles.join(", ")}`,
        });
        return;
      }

      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, clerkId: true, organizationId: true, orgRole: true },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      const orgChanged = String(existing.organizationId || "") !== String(nextOrganizationId || "");

      // Prevent removing the last ORG_OWNER from an organization
      if (
        existing.organizationId &&
        existing.orgRole === "ORG_OWNER" &&
        (orgChanged || nextOrgRole !== "ORG_OWNER")
      ) {
        const ownerCount = await prisma.user.count({
          where: {
            organizationId: existing.organizationId,
            orgRole: "ORG_OWNER",
            id: { not: userId },
          },
        });
        if (ownerCount === 0) {
          res.status(400).json({
            success: false,
            error: "Cannot remove the last ORG_OWNER from an organization. Assign another ORG_OWNER first.",
          });
          return;
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            organizationId: nextOrganizationId,
            orgRole: nextOrganizationId ? (nextOrgRole as any) : null,
            ...(nextOrganizationId
              ? {}
              : {
                  // When removing org membership, force the user back to ordinary USER.
                  // This keeps behavior consistent across all clients.
                  userType: "USER" as any,
                }),
          },
        });

        if (orgChanged || !nextOrganizationId) {
          // Clear branch + role assignments to prevent cross-org leakage
          await tx.userBranch.deleteMany({ where: { userId } });
          await tx.userRoleAssignment.deleteMany({ where: { userId } });
        }
      });

      this.rbac.clearUserCache(existing.clerkId);

      res.json({
        success: true,
        message: "User organization updated successfully",
      });
    } catch (error) {
      console.error("Set user organization error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user organization",
      });
    }
  };

  private listClosedBusinessDays = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const branchId = (req.query.branchId as string | undefined) || undefined;
      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }

      const pageRaw = req.query.page as string | undefined;
      const limitRaw = req.query.limit as string | undefined;
      const page = Math.max(Number(pageRaw || 1) || 1, 1);
      const limit = Math.min(Math.max(Number(limitRaw || 10) || 10, 1), 200);

      const takeRaw = req.query.take as string | undefined;
      const skipRaw = req.query.skip as string | undefined;

      const hasPageLimit = Boolean(pageRaw || limitRaw);

      const take = hasPageLimit
        ? limit
        : Math.min(Math.max(Number(takeRaw || 30) || 30, 1), 200);
      const skip = hasPageLimit
        ? (page - 1) * limit
        : Math.max(Number(skipRaw || 0) || 0, 0);

      if (!hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(branchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;

      const where = { branchId, status: "CLOSED" };
      const [sessions, totalCount] = await Promise.all([
        prisma.businessDaySession.findMany({
          where,
          orderBy: { endedAt: "desc" },
          take,
          skip,
          select: {
            id: true,
            branchId: true,
            sequenceNumber: true,
            status: true,
            startedAt: true,
            endedAt: true,
            closedByUserId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.businessDaySession.count({ where }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalCount / take));
      const effectivePage = hasPageLimit ? page : Math.floor(skip / take) + 1;

      res.json({
        success: true,
        data: {
          sessions,
          pagination: {
            currentPage: effectivePage,
            totalPages,
            totalCount,
            hasNext: effectivePage < totalPages,
            hasPrev: effectivePage > 1,
          },
        },
      });
    } catch (error) {
      console.error("List closed business days error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch closed business days" });
    }
  };

  private getUser = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const userId = req.params.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          orders: {
            select: {
              id: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 10,
          },
          addresses: true,
          _count: {
            select: {
              orders: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user",
      });
    }
  };

  private updateUser = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const userId = req.params.id;
      const { userType, role, isActive } = req.body;

      // Backward compatibility: accept legacy `role` (ADMIN/USER)
      // Canonical field is `userType`
      const mappedUserType: string | undefined =
        typeof userType === "string"
          ? userType
          : typeof role === "string"
          ? role === "ADMIN"
            ? "BRANCH_ADMIN"
            : role === "USER"
            ? "USER"
            : undefined
          : undefined;

      if (mappedUserType) {
        const validUserTypes = [
          "SUPER_ADMIN",
          "BRANCH_ADMIN",
          "EMPLOYEE",
          "WAITER",
          "USER",
        ];
        if (!validUserTypes.includes(mappedUserType)) {
          res.status(400).json({
            success: false,
            error: "Invalid userType",
          });
          return;
        }
      }

      // Prevent SUPER_ADMIN from demoting themselves
      if (mappedUserType && mappedUserType !== "SUPER_ADMIN" && req.user) {
        const targetUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { clerkId: true, userType: true },
        });
        if (targetUser && targetUser.userType === "SUPER_ADMIN" && targetUser.clerkId === req.user.clerkId) {
          res.status(400).json({
            success: false,
            error: "You cannot remove your own SUPER_ADMIN role",
          });
          return;
        }
      }

      const updateData: any = {};
      if (mappedUserType !== undefined) updateData.userType = mappedUserType;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          _count: {
            select: {
              orders: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: updatedUser,
        message: "User updated successfully",
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user",
      });
    }
  };

  private toggleUserStatus = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const userId = req.params.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
      });

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { isActive: !user.isActive },
      });

      res.json({
        success: true,
        data: updatedUser,
        message: updatedUser.isActive ? "User activated" : "User deactivated",
      });
    } catch (error) {
      console.error("Toggle user status error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to toggle user status",
      });
    }
  };

  private deleteUser = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const userId = req.params.id;

      // Soft delete - set isActive to false
      await prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: "User deactivated successfully",
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete user",
      });
    }
  };

  // Category management handlers
  private getCategories = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: "Get all categories - TODO: Implement" },
    });
  };

  private createCategory = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: "Create category - TODO: Implement" },
    });
  };

  private updateCategory = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: `Update category ${req.params.id} - TODO: Implement` },
    });
  };

  private deleteCategory = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: `Delete category ${req.params.id} - TODO: Implement` },
    });
  };

  // Meal management handlers
  private getMeals = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: "Get all meals - TODO: Implement" },
    });
  };

  private createMeal = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: "Create meal - TODO: Implement" },
    });
  };

  private updateMeal = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: `Update meal ${req.params.id} - TODO: Implement` },
    });
  };

  private deleteMeal = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    const organizationId = (req as any).organizationId as string | undefined;
    if (!organizationId) {
      res.status(400).json({ success: false, error: "organizationId is required" });
      return;
    }
    res.json({
      success: true,
      data: { message: `Delete meal ${req.params.id} - TODO: Implement` },
    });
  };

  // Order management handlers
  private getOrders = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const organizationId = (req as any).organizationId as string | undefined;
      const actorOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
      const isOrgAdmin = actorOrgRole === "ORG_OWNER" || actorOrgRole === "ORG_ADMIN";

      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || "";
      const sortBy = (req.query.sortBy as string) || "createdAt";
      const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";
      const status = (req.query.status as string) || "";
      const paymentStatus = (req.query.paymentStatus as string) || "";
      const paymentMethod = (req.query.paymentMethod as string) || "";
      const branchId = (req.query.branchId as string) || "";
      const orderType = (req.query.orderType as string) || "";
      const highlightOrder = (req.query.highlightOrder as string) || "";
      const isScheduled = (req.query.isScheduled as string) || "";
      const scheduledScope = (req.query.scheduledScope as string) || "";
      const businessDayStatus = (req.query.businessDayStatus as string) || "";
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const isPosOrder = (req.query.isPosOrder as string) || "";

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      // Build a separate base where clause used for queue counts
      // (we will apply isScheduled variations + scheduled-window rules below)
      const baseWhereForCounts: any = {};

      // If highlightOrder is provided, show ONLY that order
      if (highlightOrder) {
        if (!isSuperAdmin) {
          const target = await prisma.order.findUnique({
            where: { id: highlightOrder },
            select: { branchId: true, branch: { select: { organizationId: true } } },
          });
          if (!target) {
            res.status(404).json({ success: false, error: "Order not found" });
            return;
          }

          if (isOrgAdmin) {
            if (!organizationId) {
              res.status(400).json({ success: false, error: "organizationId is required" });
              return;
            }
            if (!target.branchId || !target.branch?.organizationId || target.branch.organizationId !== organizationId) {
              res.status(403).json({ success: false, error: "You don't have access to this organization" });
              return;
            }
          } else {
            if (!target.branchId || !rbacUser.assignedBranchIds.includes(target.branchId)) {
              res.status(403).json({ success: false, error: "You don't have access to this branch" });
              return;
            }
          }
        }
        where.id = highlightOrder;
        baseWhereForCounts.id = highlightOrder;
      } else {
        // Normal filtering logic
        if (search) {
          where.OR = [
            { orderNumber: { contains: search, mode: "insensitive" } },
            { guestName: { contains: search, mode: "insensitive" } },
            { guestEmail: { contains: search, mode: "insensitive" } },
            { deliveryPhone: { contains: search, mode: "insensitive" } },
            { user: { firstName: { contains: search, mode: "insensitive" } } },
            { user: { lastName: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { branch: { name: { contains: search, mode: "insensitive" } } },
          ];
          baseWhereForCounts.OR = where.OR;
        }

        if (status) {
          where.status = status;
          baseWhereForCounts.status = status;
        }

        if (paymentStatus) {
          where.paymentStatus = paymentStatus;
          baseWhereForCounts.paymentStatus = paymentStatus;
        }

        if (paymentMethod) {
          where.paymentMethod = paymentMethod;
          baseWhereForCounts.paymentMethod = paymentMethod;
        }

        if (orderType) {
          where.orderType = orderType;
          baseWhereForCounts.orderType = orderType;
        }

        if (branchId && branchId.trim() !== "") {
          if (!isSuperAdmin) {
            if (isOrgAdmin) {
              if (!organizationId) {
                res.status(400).json({ success: false, error: "organizationId is required" });
                return;
              }
              const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: { id: true, organizationId: true },
              });
              if (!branch || branch.organizationId !== organizationId) {
                res.status(403).json({ success: false, error: "You don't have access to this branch" });
                return;
              }
            } else if (!rbacUser.assignedBranchIds.includes(branchId)) {
              res.status(403).json({ success: false, error: "You don't have access to this branch" });
              return;
            }
          }
          where.branchId = branchId;
          baseWhereForCounts.branchId = branchId;
        } else if (!isSuperAdmin) {
          if (isOrgAdmin) {
            if (!organizationId) {
              res.status(400).json({ success: false, error: "organizationId is required" });
              return;
            }
            where.branch = { organizationId };
            baseWhereForCounts.branch = { organizationId };
          } else {
            if (!Array.isArray(rbacUser.assignedBranchIds) || rbacUser.assignedBranchIds.length === 0) {
              where.branchId = "__none__";
              baseWhereForCounts.branchId = "__none__";
            } else if (rbacUser.assignedBranchIds.length === 1) {
              where.branchId = rbacUser.assignedBranchIds[0];
              baseWhereForCounts.branchId = rbacUser.assignedBranchIds[0];
            } else {
              where.branchId = { in: rbacUser.assignedBranchIds };
              baseWhereForCounts.branchId = { in: rbacUser.assignedBranchIds };
            }
          }
        }

        // Filter by scheduled/ASAP orders
        if (isScheduled === "scheduled") {
          where.isScheduledOrder = true;
        } else if (isScheduled === "asap") {
          where.isScheduledOrder = false;
        }

        // Filter by POS/Online orders
        if (isPosOrder === "true") {
          where.isPosOrder = true;
          baseWhereForCounts.isPosOrder = true;
        } else if (isPosOrder === "false") {
          where.isPosOrder = false;
          baseWhereForCounts.isPosOrder = false;
        }

        // Filter by business day session status
        if (businessDayStatus === "OPEN" || businessDayStatus === "CLOSED") {
          where.businessDaySession = { status: businessDayStatus };
          baseWhereForCounts.businessDaySession = { status: businessDayStatus };
        }
      }
      

      const applyDateRangeFilter = (targetField: "createdAt" | "scheduledDate") => {
        if (startDate && endDate) {
          // Parse the date string (YYYY-MM-DD)
          const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
          const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

          // Create start of day in UTC (00:00:00.000)
          const start = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));

          // Create end of day in UTC (23:59:59.999)
          const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));

          where[targetField] = {
            gte: start,
            lte: end,
          };

          baseWhereForCounts[targetField] = {
            gte: start,
            lte: end,
          };
          return;
        }

        if (startDate) {
          const [year, month, day] = startDate.split("-").map(Number);
          const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
          where[targetField] = {
            gte: start,
          };

          baseWhereForCounts[targetField] = {
            gte: start,
          };
          return;
        }

        if (endDate) {
          const [year, month, day] = endDate.split("-").map(Number);
          const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
          where[targetField] = {
            lte: end,
          };

          baseWhereForCounts[targetField] = {
            lte: end,
          };
        }
      };

      // Date filtering
      // - ASAP: filter by createdAt within the selected date range
      // - Scheduled: filter by scheduledDate within the selected date range
      if (isScheduled === "scheduled") {
        applyDateRangeFilter("scheduledDate");

        // Exclude past scheduled orders by default.
        // Desktop can opt into "upcoming" mode to explicitly show scheduledDate >= now.
        const now = new Date();
        const wantsUpcoming = String(scheduledScope || "").trim().toLowerCase() === "upcoming";
        if (wantsUpcoming) {
          where.scheduledDate = {
            ...(where.scheduledDate || {}),
            gte: now,
          };
        } else {
          const nowIso = now.toISOString();
          // Only add the constraint if the existing filter doesn't already bound from the future.
          const existingGte = (where.scheduledDate as any)?.gte;
          const hasExistingGte = existingGte instanceof Date || typeof existingGte === "string";
          if (!hasExistingGte) {
            where.scheduledDate = {
              ...(where.scheduledDate || {}),
              gte: new Date(nowIso),
            };
          }
        }

        // Scheduled orders should have a scheduledDate; be defensive.
        where.scheduledDate = {
          ...(where.scheduledDate || {}),
          not: null,
        };
      } else {
        applyDateRangeFilter("createdAt");
      }

      // Queue counts
      // - ASAP: uses existing filters (including createdAt + businessDayStatus)
      // - Scheduled: ignores createdAt + businessDayStatus; uses scheduledDate window based on effective future order settings
      const computeQueueCounts = async () => {
        const baseBranchId = baseWhereForCounts.branchId;

        // Compute effective future-order window if we have a concrete branchId
        // (For multi-branch superadmin queries without an explicit branch, scheduled count will still be computed, but without a branch-specific window.)
        let scheduledEnd: Date | null = null;
        let allowScheduledCount = true;

        const globalSettings = await prisma.settings.findFirst();
        if (!globalSettings) {
          allowScheduledCount = false;
        }

        if (allowScheduledCount && typeof baseBranchId === "string" && baseBranchId && baseBranchId !== "__none__") {
          const branch = await prisma.branch.findUnique({ where: { id: baseBranchId } });
          if (!branch) {
            allowScheduledCount = false;
          } else if (globalSettings) {
            const futureSettings = getEffectiveFutureOrderSettings(branch, globalSettings);
            if (!futureSettings.futureOrdersEnabled) {
              allowScheduledCount = false;
            } else {
              const maxDays =
                orderType === "PICKUP"
                  ? futureSettings.futurePickupOrderDays
                  : orderType === "DELIVERY"
                    ? futureSettings.futureDeliveryOrderDays
                    : Math.max(futureSettings.futurePickupOrderDays, futureSettings.futureDeliveryOrderDays);

              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const end = new Date(todayStart);
              end.setDate(end.getDate() + Math.max(0, Number(maxDays || 0)));
              end.setHours(23, 59, 59, 999);
              scheduledEnd = end;
            }
          }
        }

        const asapWhere: any = {
          ...baseWhereForCounts,
          isScheduledOrder: false,
        };

        const scheduledWhere: any = {
          ...baseWhereForCounts,
          isScheduledOrder: true,
        };

        // Scheduled queue should not be filtered by business-day status or createdAt.
        delete scheduledWhere.businessDaySession;
        delete scheduledWhere.createdAt;

        if (!allowScheduledCount) {
          return { asap: await prisma.order.count({ where: asapWhere }), scheduled: 0 };
        }

        if (scheduledEnd) {
          // Include scheduled orders without a scheduledDate defensively
          scheduledWhere.OR = [
            ...(scheduledWhere.OR || []),
            { scheduledDate: { lte: scheduledEnd } },
            { scheduledDate: null },
          ];
        }

        const [asap, scheduled] = await Promise.all([
          prisma.order.count({ where: asapWhere }),
          prisma.order.count({ where: scheduledWhere }),
        ]);

        return { asap, scheduled };
      };

      // Build orderBy clause
      const orderBy: any = {};
      orderBy[sortBy] = sortOrder;

      // Get orders with pagination
      const [orders, totalCount, queueCounts] = await Promise.all([
        prisma.order.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
            businessDaySession: {
              select: {
                id: true,
                status: true,
                startedAt: true,
                endedAt: true,
              },
            },
            orderItems: {
              include: {
                meal: {
                  select: {
                    id: true,
                    name: true,
                    basePrice: true,
                    image: true,
                    isDrink: true,
                  },
                },
                deal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
                dealComponent: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    taxPercentage: true,
                    quantity: true,
                  },
                },
                dealChildItems: {
                  include: {
                    dealComponent: {
                      select: {
                        id: true,
                        name: true,
                        price: true,
                        taxPercentage: true,
                        quantity: true,
                      },
                    },
                  },
                },
                orderItemAddOns: {
                  include: {
                    addon: {
                      select: {
                        id: true,
                        image: true,
                      },
                    },
                  },
                },
                orderItemOptionalIngredients: {
                  include: {
                    optionalIngredient: {
                      select: {
                        id: true,
                        name: true,
                        description: true,
                      },
                    },
                  },
                },
              },
            },
            refunds: {
              select: {
                id: true,
                amount: true,
                status: true,
              },
            },
            _count: {
              select: {
                orderItems: true,
              },
            },
          },
        }),
        prisma.order.count({ where }),
        computeQueueCounts(),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      const ordersWithDeliveryTokens = orders.map((o: any) => ({
        ...o,
        deliveryLinkToken: createDeliveryLinkToken(o.id),
      }));

      res.json({
        success: true,
        data: {
          orders: ordersWithDeliveryTokens,
          queueCounts,
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
      console.error("Get orders error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch orders",
      });
    }
  };

  private getOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const orderId = req.params.id;

      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const actorOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
      const isOrgAdmin = actorOrgRole === "ORG_OWNER" || actorOrgRole === "ORG_ADMIN";
      const resolvedOrganizationId = (req as any)?.organizationId as
        | string
        | null
        | undefined;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          orderType: true,
          totalAmount: true,
          deliveryFee: true,
          taxAmount: true,
          createdAt: true,
          updatedAt: true,
          deliveryNotes: true,
          pickupPhone: true,
          pickupNotes: true,
          isScheduledOrder: true,
          scheduledDate: true,
          preparationTime: true,
          confirmedAt: true,
          isMerged: true,
          mergedAt: true,
          userId: true,
          branchId: true,
          deliveryTaxAmount: true,
          taxInclusive: true,
          itemTaxAmount: true,
          addonTaxAmount: true,
          takeawayServiceFee: true,
          takeawayServiceTaxAmount: true,
          takeawayServiceTaxPercentage: true,
          isPosOrder: true,
          cancellationReason: true,
          history: true,
          discountType: true,
          discountValue: true,
          discountAmount: true,
          voucherPaymentAmount: true,
          voucherCodes: true,
          refunds: {
            select: {
              id: true,
              refundType: true,
              amount: true,
              reason: true,
              status: true,
              stripeRefundId: true,
              paypalRefundId: true,
              refundedBy: true,
              refundedAt: true,
              createdAt: true,
              metadata: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              organizationId: true,
            },
          },
          businessDaySession: {
            select: {
              id: true,
              status: true,
              startedAt: true,
              endedAt: true,
            },
          },
          orderItems: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  image: true,
                  isDrink: true,
                  description: true,
                },
              },
              deal: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
              dealComponent: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  taxPercentage: true,
                  quantity: true,
                },
              },
              dealChildItems: {
                include: {
                  dealComponent: {
                    select: {
                      id: true,
                      name: true,
                      price: true,
                      taxPercentage: true,
                      quantity: true,
                    },
                  },
                },
              },
              orderItemAddOns: {
                include: {
                  addon: {
                    select: {
                      id: true,
                      image: true,
                    },
                  },
                },
              },
              orderItemOptionalIngredients: {
                include: {
                  optionalIngredient: {
                    select: {
                      id: true,
                      name: true,
                      description: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      if (!isSuperAdmin) {
        const orderBranchId = (order as any)?.branchId || order?.branch?.id;

        // Org admins/owners can view any order within the currently selected organization.
        // For all other roles, keep branch-level enforcement.
        if (isOrgAdmin) {
          const orderOrganizationId = (order as any)?.branch?.organizationId;
          if (
            resolvedOrganizationId &&
            orderOrganizationId &&
            String(orderOrganizationId) !== String(resolvedOrganizationId)
          ) {
            res
              .status(403)
              .json({ success: false, error: "You don't have access to this organization" });
            return;
          }
        } else {
          if (!orderBranchId || !rbacUser.assignedBranchIds.includes(orderBranchId)) {
            res
              .status(403)
              .json({ success: false, error: "You don't have access to this branch" });
            return;
          }
        }
      }

      // Mark notification as seen when admin views order details
      const updatedNotifications = await prisma.notification.updateMany({
        where: {
          orderId: order.id,
          isSeen: false,
        },
        data: {
          isSeen: true,
          seenAt: new Date(),
        },
      });

      // Emit WebSocket event to notify all admins in real-time
      if (updatedNotifications.count > 0) {
        const wsService = WebSocketService.getInstance();
        wsService.emitNotificationSeen({
          orderId: order.id,
          notificationId: "", // Not available in updateMany
          isSeen: true,
          seenAt: new Date(),
        });
      }

      res.json({
        success: true,
        data: {
          ...(order as any),
          deliveryLinkToken: createDeliveryLinkToken(order.id),
        },
      });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order",
      });
    }
  };

  private updateOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const orderId = req.params.id;

      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const actorOrgRole = (rbacUser as any)?.orgRole as string | null | undefined;
      const isOrgAdmin = actorOrgRole === "ORG_OWNER" || actorOrgRole === "ORG_ADMIN";
      const resolvedOrganizationId = (req as any)?.organizationId as
        | string
        | null
        | undefined;
      const { status, paymentStatus, deliveryNotes, preparationTime, cancellationReason } = req.body;

      // Validate status if provided
      const validStatuses = [
        "PENDING",
        "CONFIRMED",
        "PREPARING",
        "READY_FOR_DELIVERY",
        "READY_FOR_PICKUP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "PICKED_UP",
        "CANCELLED",
      ];
      if (status && !validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          error: "Invalid status",
        });
        return;
      }

      // Validate payment status if provided
      const validPaymentStatuses = [
        "PENDING",
        "PAID",
        "FAILED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ];
      if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
        res.status(400).json({
          success: false,
          error: "Invalid payment status",
        });
        return;
      }

      // Get current order to check if we need to process refund
      const currentOrder = await (prisma as any).order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          branchId: true,
          branch: {
            select: {
              organizationId: true,
            },
          },
          businessDaySessionId: true,
          postedAt: true,
          isScheduledOrder: true,
          scheduledDate: true,
          paymentStatus: true,
          paymentIntentId: true,
          paymentMethod: true,
          status: true,
          orderType: true,
          confirmedAt: true,
          history: true,
          totalAmount: true,
          currency: true,
          orderNumber: true,
        },
      });

      if (!currentOrder) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      const orderOrganizationId = (currentOrder as any)?.branch?.organizationId as
        | string
        | null
        | undefined;

      if ((status !== undefined || paymentStatus !== undefined) && orderOrganizationId && (currentOrder as any)?.branchId) {
        const fiskalyConfig = await getFiskalyConfigSnapshot(prisma as any, orderOrganizationId);
        if (shouldFiscalize(fiskalyConfig)) {
          const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
          const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

          if (!headerDeviceId) {
            res.status(403).json({
              success: false,
              error: "POS device selection is required.",
              code: "POS_DEVICE_REQUIRED" as const,
              data: {
                reason: "MISSING_HEADER" as const,
              },
            });
            return;
          }

          const orderBranchId = String((currentOrder as any).branchId || "").trim();

          // First, locate the device within the org to provide a meaningful error if branch mismatch/inactive/deleted.
          const deviceInOrg = await (prisma as any).posDevice.findFirst({
            where: {
              id: headerDeviceId,
              organizationId: orderOrganizationId,
            },
            select: { id: true, branchId: true, isActive: true, isDeleted: true },
          });

          if (!deviceInOrg?.id) {
            res.status(403).json({
              success: false,
              error: "Selected POS device was not found for this organization.",
              code: "POS_DEVICE_REQUIRED" as const,
              data: {
                reason: "DEVICE_NOT_IN_ORG" as const,
                deviceId: headerDeviceId,
                organizationId: orderOrganizationId,
                requiredBranchId: orderBranchId,
              },
            });
            return;
          }

          if (deviceInOrg.isDeleted || deviceInOrg.isActive === false) {
            res.status(403).json({
              success: false,
              error: "Selected POS device is inactive. Please select an active device.",
              code: "POS_DEVICE_REQUIRED" as const,
              data: {
                reason: "DEVICE_INACTIVE" as const,
                deviceId: headerDeviceId,
                deviceBranchId: String(deviceInOrg.branchId || "").trim() || null,
                requiredBranchId: orderBranchId,
              },
            });
            return;
          }

          const deviceBranchId = String(deviceInOrg.branchId || "").trim();
          if (orderBranchId && deviceBranchId && deviceBranchId !== orderBranchId) {
            res.status(403).json({
              success: false,
              error: "Selected POS device is not available for this branch.",
              code: "POS_DEVICE_REQUIRED" as const,
              data: {
                reason: "DEVICE_BRANCH_MISMATCH" as const,
                deviceId: headerDeviceId,
                deviceBranchId,
                requiredBranchId: orderBranchId,
              },
            });
            return;
          }
        }
      }

      if (!isSuperAdmin) {
        // Org admins/owners can update any order within the currently selected organization.
        // For all other roles, keep branch-level enforcement.
        if (isOrgAdmin) {
          if (!resolvedOrganizationId) {
            res.status(400).json({ success: false, error: "organizationId is required" });
            return;
          }
          if (
            orderOrganizationId &&
            String(orderOrganizationId) !== String(resolvedOrganizationId)
          ) {
            res
              .status(403)
              .json({ success: false, error: "You don't have access to this organization" });
            return;
          }
        } else {
          if (!currentOrder.branchId || !rbacUser.assignedBranchIds.includes(currentOrder.branchId)) {
            res
              .status(403)
              .json({ success: false, error: "You don't have access to this branch" });
            return;
          }
        }
      }

      const getEndOfScheduledLocalDay = (scheduledDate: Date): Date => {
        return new Date(
          scheduledDate.getFullYear(),
          scheduledDate.getMonth(),
          scheduledDate.getDate(),
          23,
          59,
          59,
          999
        );
      };

      // If this order belongs to a closed business day, block direct edits.
      if ((currentOrder as any).businessDaySessionId) {
        const session = await (prisma as any).businessDaySession.findUnique({
          where: { id: (currentOrder as any).businessDaySessionId },
          select: { status: true },
        });

        if (session?.status === "CLOSED") {
          const isScheduled = Boolean((currentOrder as any).isScheduledOrder);
          if (!isScheduled) {
            res.status(400).json({
              success: false,
              error: "This order belongs to a closed business day and cannot be edited. Create an adjustment instead.",
              code: "BUSINESS_DAY_CLOSED",
            });
            return;
          }

          const isFiscallyPosted = Boolean((currentOrder as any).postedAt) &&
            String((currentOrder as any).paymentStatus) !== "PENDING";

          const currentStatus = String((currentOrder as any).status);
          if (currentStatus === "DELIVERED" || currentStatus === "PICKED_UP" || currentStatus === "CANCELLED") {
            res.status(400).json({
              success: false,
              error: "This scheduled order is finalized and can no longer be changed.",
              code: "SCHEDULED_ORDER_FINALIZED",
            });
            return;
          }

          const scheduledDateRaw = (currentOrder as any).scheduledDate as Date | null | undefined;
          if (scheduledDateRaw && isFiscallyPosted) {
            const endOfDay = getEndOfScheduledLocalDay(new Date(scheduledDateRaw));
            if (new Date().getTime() > endOfDay.getTime()) {
              res.status(400).json({
                success: false,
                error: "This scheduled order is past its scheduled day and can no longer be changed.",
                code: "SCHEDULED_ORDER_PAST_DUE",
              });
              return;
            }
          }

          if (isFiscallyPosted) {
            if (
              paymentStatus !== undefined &&
              String(paymentStatus) !== String((currentOrder as any).paymentStatus)
            ) {
              res.status(400).json({
                success: false,
                error:
                  "Payment status for scheduled orders that belong to a closed business day cannot be edited directly. Use a refund/adjustment flow instead.",
                code: "BUSINESS_DAY_CLOSED",
              });
              return;
            }
          }

          // Otherwise allow operational updates (status/deliveryNotes) for scheduled orders.
        }
      }

      if (status) {
        const isValid = validateOrderTypeTransition(
          currentOrder.status as any,
          status as any,
          (currentOrder.orderType as any) || "DELIVERY"
        );
        if (!isValid) {
          res.status(400).json({
            success: false,
            error: "Invalid status transition for this order type",
          });
          return;
        }
      }

      // If payment status is being changed to REFUNDED, process refund
      if (
        paymentStatus === "REFUNDED" &&
        currentOrder.paymentStatus === "PAID"
      ) {
        // Only process refund for online payments with payment intent
        if (
          currentOrder.paymentMethod === "ONLINE_PAYMENT" &&
          currentOrder.paymentIntentId
        ) {
          try {
            // Call the refund API internally
            const refundResponse = await this.processRefundInternal(
              orderId,
              req.user?.id || "admin"
            );
            if (!refundResponse.success) {
              res.status(400).json({
                success: false,
                error: `Refund failed: ${refundResponse.error}`,
              });
              return;
            }
          } catch (refundError) {
            console.error("Refund processing error:", refundError);
            res.status(500).json({
              success: false,
              error: "Failed to process refund",
            });
            return;
          }
        }
      }

      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
      if (deliveryNotes !== undefined) updateData.deliveryNotes = deliveryNotes;
      if (preparationTime !== undefined) updateData.preparationTime = preparationTime;

      // Anchor preparation-time countdown the first time the order becomes CONFIRMED.
      if (
        status !== undefined &&
        String(status) === "CONFIRMED" &&
        String((currentOrder as any).status) !== "CONFIRMED" &&
        !(currentOrder as any).confirmedAt
      ) {
        updateData.confirmedAt = new Date();
        // Default preparationTime from branch -> org settings if not provided
        if (preparationTime === undefined || preparationTime === null || Number(preparationTime) <= 0) {
          const branch = await (prisma as any).branch.findUnique({
            where: { id: (currentOrder as any).branchId },
            select: { orderPreparationTime: true, organizationId: true },
          });
          let prepTime = branch?.orderPreparationTime;
          if (prepTime === null || prepTime === undefined) {
            const settings = await (prisma as any).settings.findFirst({
              where: { organizationId: branch?.organizationId },
              select: { orderPreparationTime: true },
            });
            prepTime = settings?.orderPreparationTime;
          }
          if (prepTime !== null && prepTime !== undefined && Number(prepTime) > 0) {
            updateData.preparationTime = Number(prepTime);
          }
        }
      }

      // If status is being changed to CANCELLED, require cancellation reason and add to history
      if (status === "CANCELLED" && String(currentOrder.status) !== "CANCELLED") {
        if (!cancellationReason || cancellationReason.trim() === "") {
          res.status(400).json({
            success: false,
            error: "Cancellation reason is required",
            code: "CANCELLATION_REASON_REQUIRED",
          });
          return;
        }
        // Store cancellation reason in dedicated field
        updateData.cancellationReason = cancellationReason.trim();
        
        // Append cancellation reason to order history
        const existingHistory = (currentOrder as any).history || [];
        updateData.history = [
          ...existingHistory,
          {
            type: "CANCELLED",
            action: "Order cancelled",
            userId: rbacUser.id,
            details: { reason: cancellationReason },
            timestamp: new Date().toISOString(),
          },
        ];
      }

      // If this order was already fiscalized (FINISHED fiscal transaction exists),
      // cancelling it must create a Fiskaly correction transaction.
      if (status === "CANCELLED" && String((currentOrder as any).status) !== "CANCELLED") {
        const orderOrganizationIdForFiskaly = String(orderOrganizationId || "").trim();
        const orderBranchIdForFiskaly = String((currentOrder as any).branchId || "").trim();

        if (orderOrganizationIdForFiskaly && orderBranchIdForFiskaly) {
          const fiskalyConfig = await getFiskalyConfigSnapshot(
            prisma as any,
            orderOrganizationIdForFiskaly
          );

          if (shouldFiscalize(fiskalyConfig)) {
            const existingFiscalTx = await (prisma as any).fiscalTransaction.findFirst({
              where: {
                organizationId: orderOrganizationIdForFiskaly,
                orderId,
                status: "FINISHED",
              },
              select: { id: true },
            });

            if (existingFiscalTx?.id) {
              try {
                const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
                const headerDeviceId =
                  typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

                const fiskaly = FiskalyService.getInstance();
                await fiskaly.fiscalizeCorrection({
                  organizationId: orderOrganizationIdForFiskaly,
                  branchId: orderBranchIdForFiskaly,
                  deviceId: headerDeviceId || null,
                  orderId,
                  reservationOrderId: null,
                  originalFiscalTransactionId: String(existingFiscalTx.id),
                  correctionType: "CANCELLATION",
                  amount: Number((currentOrder as any).totalAmount || 0),
                  currency: String((currentOrder as any).currency || "usd"),
                  receiptNumber: `${String((currentOrder as any).orderNumber || orderId)}-C`,
                  meta: {
                    cancellationReason: String(cancellationReason || "").trim() || null,
                    paymentMethod: String((currentOrder as any)?.paymentMethod || "").trim() || null,
                  },
                });
              } catch (err: any) {
                console.error(
                  "[Fiskaly] Cancellation correction fiscalization failed in admin updateOrder:",
                  err
                );
                res.status(502).json({
                  success: false,
                  error: err?.message || "Fiskaly cancellation fiscalization failed",
                  code:
                    err?.code ||
                    err?.fiskalyCode ||
                    ("FISKALY_CORRECTION_FAILED" as const),
                });
                return;
              }
            }
          }
        }
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          orderItems: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  image: true,
                },
              },
              orderItemAddOns: true,
            },
          },
        },
      });

      // Germany-style EOD posting:
      // - Post only when the order is fulfilled (delivered/picked up) AND paid.
      try {
        const nextStatus = String(status ?? (currentOrder as any).status);
        const nextPaymentStatus = String(paymentStatus ?? (currentOrder as any).paymentStatus);
        const pm = String((currentOrder as any).paymentMethod);
        const branchId = (currentOrder as any).branchId;

        const isFulfilled = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
        const isPaid = nextPaymentStatus === "PAID";
        const shouldPost = isPaid && isFulfilled;

        if (shouldPost && branchId) {
          const branch = await (prisma as any).branch.findUnique({
            where: { id: branchId },
            select: { organizationId: true },
          });

          const organizationId = branch?.organizationId as string | null | undefined;
          if (organizationId) {
            const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
            if (shouldFiscalize(config)) {
              const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
              const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";
              let deviceId: string | null = null;
              if (headerDeviceId) {
                const device = await (prisma as any).posDevice.findFirst({
                  where: { id: headerDeviceId, organizationId, branchId },
                  select: { id: true },
                });
                if (device?.id) deviceId = device.id;
              }

              const fiskaly = FiskalyService.getInstance();
              const totalAmount = (currentOrder as any).totalAmount;
              await fiskaly.fiscalize({
                organizationId,
                branchId,
                deviceId,
                orderId: orderId,
                amount: totalAmount ? Number(totalAmount) : 0,
                currency: String((currentOrder as any).currency || "usd"),
                receiptNumber: String((currentOrder as any).orderNumber || orderId),
                meta: {
                  paymentMethod: String((currentOrder as any)?.paymentMethod || "").trim() || null,
                },
              });
            }
          }

          if (!(currentOrder as any).postedAt) {
            const businessDayService = BusinessDayService.getInstance();
            const openSession = await businessDayService.getOrCreateOpenSession(branchId);
            await (prisma as any).order.update({
              where: { id: orderId },
              data: {
                postedAt: new Date(),
                businessDaySessionId: openSession?.id || null,
              } as any,
            });
          }
        }
      } catch (err) {
        // don't fail admin updates due to EOD posting
        console.error("[Fiskaly] EOD posting failed in admin order update:", err);
      }

      const wsService = WebSocketService.getInstance();

      // Emit order status change notification to the order owner
      if (
        (status !== undefined || paymentStatus !== undefined) &&
        updatedOrder.user
      ) {
        wsService.emitOrderStatusChange(updatedOrder.user.id, updatedOrder);
      }

      // Emit order update notification to admin room (so all admins see the update)
      // Fetch or create a notification for this order update
      try {
        const notification = await prisma.notification.findFirst({
          where: { orderId: updatedOrder.id },
          orderBy: { createdAt: "desc" },
        });

        if (notification) {
          // Emit order-updated event to admin room
          wsService.emitOrderUpdate(
            notification,
            updatedOrder,
            [] // No new items for status updates
          );
        } else {
          // Create a notification if it doesn't exist
          const newNotification = await prisma.notification.create({
            data: {
              orderId: updatedOrder.id,
              isSeen: false,
              isOrderUpdate: true,
            },
            include: {
              order: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      phone: true,
                    },
                  },
                  orderItems: {
                    include: {
                      meal: {
                        select: {
                          id: true,
                          name: true,
                          basePrice: true,
                          image: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          wsService.emitOrderUpdate(newNotification, updatedOrder, []);
        }
      } catch (error) {
        console.error("Error emitting order update to admin room:", error);
        // Continue even if notification emission fails
      }

      res.json({
        success: true,
        data: updatedOrder,
        message: "Order updated successfully",
      });
    } catch (error) {
      console.error("Update order error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update order",
      });
    }
  };

  private deleteOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const orderId = req.params.id;

      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);

      if (!isSuperAdmin) {
        const target = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } });
        if (!target) {
          res.status(404).json({ success: false, error: "Order not found" });
          return;
        }
        if (!target.branchId || !rbacUser.assignedBranchIds.includes(target.branchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      // Check if order exists
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      // Only allow deletion of pending or cancelled orders
      if (!["PENDING", "CANCELLED"].includes(order.status)) {
        res.status(400).json({
          success: false,
          error: "Cannot delete orders that are not pending or cancelled",
        });
        return;
      }

      // Delete the order (cascade will handle order items and addons)
      await prisma.order.delete({
        where: { id: orderId },
      });

      res.json({
        success: true,
        message: "Order deleted successfully",
      });
    } catch (error) {
      console.error("Delete order error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete order",
      });
    }
  };

  private getCurrentBusinessDay = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const branchId = (req.query.branchId as string | undefined) || undefined;
      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }

      if (!hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(branchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      const payload = await this.businessDayService.getCurrentSessionWithCounts(branchId);
      res.json({
        success: true,
        data: {
          ...(payload as any)?.session,
          counts: (payload as any)?.counts,
        },
      });
    } catch (error) {
      console.error("Get current business day error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch business day" });
    }
  };

  private validateBusinessDayClose = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const branchId = (req.body as any)?.branchId as string | undefined;
      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }

      if (!hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(branchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      try {
        const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
        const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : null;
        const result = await this.businessDayService.validateClose(branchId, { deviceId: deviceId || null });
        res.json({ success: true, data: result });
      } catch (e: any) {
        if (e?.code === "POS_DEVICE_REQUIRED") {
          res.status(403).json({
            success: false,
            error: e?.message || "POS device selection is required.",
            code: "POS_DEVICE_REQUIRED",
            data: e?.data || null,
          });
          return;
        }
        if (e?.code === "FISKALY_POS_DEVICE_NOT_PROVISIONED") {
          res.status(409).json({
            success: false,
            error: e?.message || "POS device is not provisioned for Fiskaly.",
            code: "FISKALY_POS_DEVICE_NOT_PROVISIONED",
            data: e?.data || null,
          });
          return;
        }
        throw e;
      }
    } catch (error) {
      console.error("Validate business day close error:", error);
      res.status(500).json({ success: false, error: "Failed to validate business day close" });
    }
  };

  private closeBusinessDay = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const branchId = (req.body as any)?.branchId as string | undefined;
      if (!branchId) {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }

      if (!hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(branchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      try {
        const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
        const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : null;
        const result = await this.businessDayService.closeDay(branchId, rbacUser.id, {
          deviceId: deviceId || null,
        });
        res.json({ success: true, data: result });
      } catch (e: any) {
        if (e?.code === "POS_DEVICE_REQUIRED") {
          res.status(403).json({
            success: false,
            error: e?.message || "POS device selection is required.",
            code: "POS_DEVICE_REQUIRED",
            data: e?.data || null,
          });
          return;
        }
        if (e?.code === "FISKALY_POS_DEVICE_NOT_PROVISIONED") {
          res.status(409).json({
            success: false,
            error: e?.message || "POS device is not provisioned for Fiskaly.",
            code: "FISKALY_POS_DEVICE_NOT_PROVISIONED",
            data: e?.data || null,
          });
          return;
        }
        if (e?.code === "BUSINESS_DAY_BLOCKED") {
          res.status(400).json({
            success: false,
            error: "Cannot close business day: orders are not cleared",
            code: "BUSINESS_DAY_BLOCKED",
            data: { blockingOrders: e.blockingOrders || [] },
          });
          return;
        }
        if (e?.code === "BUSINESS_DAY_FISKALY_BLOCKED") {
          res.status(400).json({
            success: false,
            error: "Cannot close business day: Fiskaly fiscalization is incomplete",
            code: "BUSINESS_DAY_FISKALY_BLOCKED",
            data: { blockingOrders: e.blockingOrders || [] },
          });
          return;
        }
        if (e?.code === "BUSINESS_DAY_DSFINVK_BLOCKED") {
          const dsfinvkError = e.dsfinvk?.error || "Unknown error";
          const dsfinvkData = e.dsfinvk?.data || null;
          
          // Extract transaction IDs if available in error details
          let transactionIds: string[] = [];
          if (typeof dsfinvkError === "string" && dsfinvkError.includes("Transaction not found in SIGN DE")) {
            const uuidMatch = dsfinvkError.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi);
            if (uuidMatch) {
              transactionIds = uuidMatch;
            }
          }

          res.status(400).json({
            success: false,
            error: "Unable to close business day. The fiscalization system (DSFinV-K) is temporarily unavailable or some transactions could not be verified. Please wait a moment and try again.",
            code: "BUSINESS_DAY_DSFINVK_BLOCKED",
            data: {
              userMessage: "Some transactions could not be verified with the fiscalization system. This is usually temporary. Please try again in a few minutes.",
              technicalDetails: {
                error: dsfinvkError,
                transactionIds: transactionIds.length > 0 ? transactionIds : undefined,
                dsfinvkData: dsfinvkData,
              },
              recommendation: "If the problem persists, please contact support with the technical details below.",
            },
          });
          return;
        }
        throw e;
      }
    } catch (error) {
      console.error("Close business day error:", error);
      res.status(500).json({ success: false, error: "Failed to close business day" });
    }
  };

  private getBusinessDayReport = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const sessionId = req.params.sessionId;
      if (!sessionId) {
        res.status(400).json({ success: false, error: "sessionId is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;

      const session = await prisma.businessDaySession.findUnique({
        where: { id: sessionId },
        select: { id: true, branchId: true },
      });

      if (!session) {
        res.status(404).json({ success: false, error: "Business day session not found" });
        return;
      }

      if (!hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (!Array.isArray(rbacUser.assignedBranchIds) || !rbacUser.assignedBranchIds.includes(session.branchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      const report = await this.businessDayService.getSessionReport(sessionId);
      res.json({ success: true, data: report });
    } catch (error) {
      console.error("Get business day report error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch business day report" });
    }
  };

  private getDsfinvkCashPointClosing = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const rbacUser = (req as any).rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const sessionId = req.params.sessionId;
      if (!sessionId) {
        res.status(400).json({ success: false, error: "sessionId is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;

      const session = await prisma.businessDaySession.findUnique({
        where: { id: sessionId },
        select: { id: true, branchId: true },
      });

      if (!session) {
        res.status(404).json({ success: false, error: "Business day session not found" });
        return;
      }

      if (!hasImplicitFullAccess(rbacUser.userType) && !this.isOrgAdminOrOwner(rbacUser)) {
        if (
          !Array.isArray(rbacUser.assignedBranchIds) ||
          !rbacUser.assignedBranchIds.includes(session.branchId)
        ) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      const details = await this.businessDayService.getDsfinvkCashPointClosingDetails(sessionId);
      res.json({ success: true, data: details });
    } catch (error: any) {
      const code = String(error?.code || "").trim();
      if (code === "DSFINVK_CLOSING_ID_MISSING") {
        res.status(404).json({
          success: false,
          error: String(error?.message || "DSFinV-K closing id missing"),
        });
        return;
      }
      if (code === "BUSINESS_DAY_SESSION_NOT_FOUND") {
        res.status(404).json({
          success: false,
          error: String(error?.message || "Business day session not found"),
        });
        return;
      }
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch DSFinV-K cash point closing" });
    }
  };

  // Internal method to process refund
  private processRefundInternal = async (
    orderId: string,
    refundedBy: string
  ) => {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      // Get the order with payment information
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          paymentIntentId: true,
          paymentStatus: true,
        },
      });

      if (!order || !order.paymentIntentId) {
        return { success: false, error: "Order or payment intent not found" };
      }

      // Check if already refunded
      const existingRefunds = await stripe.refunds.list({
        payment_intent: order.paymentIntentId,
      });

      if (existingRefunds.data.length > 0) {
        return { success: false, error: "Order has already been refunded" };
      }

      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          refundedBy: refundedBy,
        },
      });

      return { success: true, refundId: refund.id };
    } catch (error) {
      console.error("Internal refund processing error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Refund processing failed",
      };
    }
  };

  // Analytics handlers
  private getAnalytics = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    res.json({
      success: true,
      data: { message: "Get analytics - TODO: Implement" },
    });
  };

  private getRevenueAnalytics = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { startDate, endDate, paymentMethod, orderStatus, branchId } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = req.rbacUser;
      if (!rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
      const actorOrgRole = (rbacUser as any).orgRole as string | null | undefined;
      const isOrgAdmin = actorOrgRole === "ORG_OWNER" || actorOrgRole === "ORG_ADMIN";
      const organizationId = (req as any).organizationId as string | undefined;

      const requestedBranchId = (branchId as string | undefined) || undefined;

      // SUPER_ADMIN + ORG admins must be org-scoped
      if ((isSuperAdmin || isOrgAdmin) && !organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      // Validate requested branch belongs to org (when org-scoped)
      if (organizationId && requestedBranchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: requestedBranchId },
          select: { id: true, organizationId: true },
        });
        if (!branch || branch.organizationId !== organizationId) {
          res.status(403).json({ success: false, error: "Access denied for this branch" });
          return;
        }
      }

      let allowedBranchIds: string[] | null = null;
      if (isOrgAdmin && organizationId) {
        const branches = await prisma.branch.findMany({
          where: { organizationId },
          select: { id: true },
        });
        allowedBranchIds = branches.map((b) => b.id);
      } else if (isSuperAdmin && organizationId) {
        const branches = await prisma.branch.findMany({
          where: { organizationId },
          select: { id: true },
        });
        allowedBranchIds = branches.map((b) => b.id);
      } else if (!isSuperAdmin) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          res.status(403).json({ success: false, error: "No branch access assigned" });
          return;
        }
        if (requestedBranchId && !allowedBranchIds.includes(requestedBranchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      // Build date filter from startDate and endDate
      let dateFilter: any = {};

      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          },
        };
      } else {
        // Default to current month if no dates provided
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
        dateFilter = {
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        };
      }

      // Build additional filters (exclude cancelled orders from revenue)
      let additionalFilters: any = {
        paymentStatus: "PAID",
        status: {
          not: "CANCELLED",
        },
      };

      if (paymentMethod) {
        additionalFilters.paymentMethod = paymentMethod;
      }

      if (orderStatus) {
        // If specific order status is requested, override the default filter
        additionalFilters.status = orderStatus;
      }

      if (requestedBranchId) {
        additionalFilters.branchId = requestedBranchId;
      } else if (allowedBranchIds) {
        additionalFilters.branchId =
          allowedBranchIds.length === 1
            ? allowedBranchIds[0]
            : { in: allowedBranchIds };
      }

      // Get revenue data
      const orders = await prisma.order.findMany({
        where: {
          ...dateFilter,
          ...additionalFilters,
        },
        include: {
          refunds: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      // Calculate total revenue (gross revenue - all paid orders without subtracting refunds)
      const totalRevenue = orders.reduce((sum, order) => {
        return sum + parseFloat(order.totalAmount.toString());
      }, 0);

      // Calculate total refunds
      const totalRefunds = orders.reduce((sum, order) => {
        return (
          sum +
          order.refunds.reduce(
            (refundSum, refund) =>
              refundSum + parseFloat(refund.amount.toString()),
            0
          )
        );
      }, 0);

      // Calculate total taxes (money collected for government)
      const totalTaxes = orders.reduce((sum, order) => {
        return sum + parseFloat(order.taxAmount.toString());
      }, 0);

      // Calculate net revenue (gross revenue minus refunds and taxes)
      const netRevenue = totalRevenue - totalRefunds - totalTaxes;

      // Get monthly revenue data for charts
      const monthlyData = new Map<
        string,
        { revenue: number; refunds: number; orders: number }
      >();

      orders.forEach((order) => {
        const monthKey = order.createdAt.toISOString().substring(0, 7); // YYYY-MM
        const refundedAmount = order.refunds.reduce(
          (sum, refund) => sum + parseFloat(refund.amount.toString()),
          0
        );

        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, { revenue: 0, refunds: 0, orders: 0 });
        }

        const monthData = monthlyData.get(monthKey)!;
        // Revenue in chart should show gross revenue (without subtracting refunds)
        monthData.revenue += parseFloat(order.totalAmount.toString());
        monthData.refunds += refundedAmount;
        monthData.orders += 1;
      });

      // Convert to array for chart data
      const chartData = Array.from(monthlyData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          revenue: data.revenue,
          refunds: data.refunds,
          orders: data.orders,
        }));

      // Build where clause for breakdowns (exclude cancelled orders)
      const breakdownWhere: any = {
        ...dateFilter,
        paymentStatus: "PAID",
        status: {
          not: "CANCELLED",
        },
      };
      if (branchId) {
        breakdownWhere.branchId = branchId as string;
      } else if (allowedBranchIds) {
        breakdownWhere.branchId =
          allowedBranchIds.length === 1
            ? allowedBranchIds[0]
            : { in: allowedBranchIds };
      }

      // Payment breakdown from Payment table (orders only)
      const paymentBreakdown = await prisma.payment.groupBy({
        by: ["paymentMethod", "paymentProvider", "status"],
        where: {
          ...dateFilter,
          orderId: { not: null },
          ...(branchId
            ? {
                order: {
                  branchId: branchId as string,
                },
              }
            : allowedBranchIds
              ? {
                  order: {
                    branchId:
                      allowedBranchIds.length === 1
                        ? allowedBranchIds[0]
                        : { in: allowedBranchIds },
                  },
                }
              : {}),
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      });

      // Legacy payment method breakdown from orders table (kept for fallback)
      const paymentMethodData = await prisma.order.groupBy({
        by: ["paymentMethod"],
        where: breakdownWhere,
        _sum: {
          totalAmount: true,
        },
        _count: {
          id: true,
        },
      });

      // Get order status breakdown
      const orderStatusData = await prisma.order.groupBy({
        by: ["status"],
        where: breakdownWhere,
        _sum: {
          totalAmount: true,
        },
        _count: {
          id: true,
        },
      });

      res.json({
        success: true,
        data: {
          summary: {
            totalRevenue,
            totalRefunds,
            totalTaxes,
            netRevenue,
            totalOrders: orders.length,
          },
          chartData,
          paymentMethodBreakdown: paymentBreakdown.map((item) => ({
            method: item.paymentMethod,
            provider: item.paymentProvider,
            status: item.status,
            revenue: Number(item._sum.amount || 0),
            payments: item._count.id,
          })),
          paymentMethodBreakdownLegacy: paymentMethodData.map((item) => ({
            method: item.paymentMethod,
            revenue: parseFloat(item._sum.totalAmount?.toString() || "0"),
            orders: item._count.id,
          })),
          orderStatusBreakdown: orderStatusData.map((item) => ({
            status: item.status,
            revenue: parseFloat(item._sum.totalAmount?.toString() || "0"),
            orders: item._count.id,
          })),
        },
      });
    } catch (error) {
      console.error("Revenue analytics error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch revenue analytics",
      });
    }
  };

  private getDetailedRevenueAnalytics = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { startDate, endDate, paymentMethod, orderStatus, periodType, branchId } =
        req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = req.rbacUser;
      const organizationId = (req as any).organizationId as string | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";

      let allowedBranchIds: string[] | null = null;
      if (rbacUser && !isOrgAdmin && !hasImplicitFullAccess(rbacUser.userType)) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          res.status(403).json({ success: false, error: "No branch access assigned" });
          return;
        }
        const requestedBranchId = branchId as string | undefined;
        if (requestedBranchId && !allowedBranchIds.includes(requestedBranchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      if (branchId && organizationId) {
        const branch = await prisma.branch.findFirst({
          where: { id: branchId as string, organizationId },
          select: { id: true },
        });
        if (!branch) {
          res.status(400).json({ success: false, error: "Invalid branchId for this organization" });
          return;
        }
      }

      // Build date filter from startDate and endDate
      let dateFilter: any = {};
      let periodStart: Date;
      let periodEnd: Date;

      if (startDate && endDate) {
        periodStart = new Date(startDate as string);
        periodEnd = new Date(endDate as string);
        periodEnd.setHours(23, 59, 59, 999);

        // Validate that start date is before or equal to end date
        if (periodStart > periodEnd) {
          // Swap dates if they're in wrong order
          [periodStart, periodEnd] = [periodEnd, periodStart];
          periodStart.setHours(0, 0, 0, 0);
          periodEnd.setHours(23, 59, 59, 999);
        }

        dateFilter = {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        };
      } else {
        // Default to current month if no dates provided
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );

        dateFilter = {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        };
      }

      // Build additional filters - revenue analytics should only consider PAID orders
      let additionalFilters: any = {
        paymentStatus: "PAID",
      };

      if (paymentMethod) {
        additionalFilters.paymentMethod = paymentMethod;
      }

      if (orderStatus) {
        additionalFilters.status = orderStatus;
      }

      if (branchId) {
        additionalFilters.branchId = branchId as string;
      } else if (allowedBranchIds) {
        additionalFilters.branchId =
          allowedBranchIds.length === 1
            ? allowedBranchIds[0]
            : { in: allowedBranchIds };
      }

      // Get PAID orders in the date range
      const orders = await prisma.order.findMany({
        where: {
          ...dateFilter,
          ...additionalFilters,
          ...(organizationId
            ? {
                branch: {
                  organizationId,
                },
              }
            : {}),
        },
        include: {
          refunds: true,
          orderItems: {
            include: {
              meal: true,
              orderItemAddOns: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      // Calculate detailed revenue breakdown
      let totalRevenue = 0;
      let totalRefunds = 0;
      let totalTaxes = 0;
      let paidOrdersRevenue = 0;
      let pendingOrdersRevenue = 0;
      let cancelledOrdersRevenue = 0;

      const orderBreakdown = {
        total: orders.length,
        paid: 0,
        pending: 0,
        cancelled: 0,
        failed: 0,
      };

      orders.forEach((order) => {
        const orderAmount = parseFloat(order.totalAmount.toString());
        const refundedAmount = order.refunds.reduce(
          (sum, refund) => sum + parseFloat(refund.amount.toString()),
          0
        );
        const taxAmount = parseFloat(order.taxAmount.toString());

        totalRevenue += orderAmount;
        totalRefunds += refundedAmount;
        totalTaxes += taxAmount;

        // Categorize by payment status
        switch (order.paymentStatus) {
          case "PAID":
            paidOrdersRevenue += orderAmount;
            orderBreakdown.paid++;
            break;
          case "PENDING":
            pendingOrdersRevenue += orderAmount;
            orderBreakdown.pending++;
            break;
          case "FAILED":
            orderBreakdown.failed++;
            break;
          case "REFUNDED":
          case "PARTIALLY_REFUNDED":
            cancelledOrdersRevenue += orderAmount;
            orderBreakdown.cancelled++;
            break;
        }
      });

      const netRevenue = totalRevenue - totalRefunds - totalTaxes;

      // Group data based on periodType
      const periodTypeParam = (periodType as string) || "monthly";
      const groupedData = new Map<
        string,
        { revenue: number; refunds: number; orders: number }
      >();

      orders.forEach((order) => {
        const orderDate = new Date(order.createdAt);
        const refundedAmount = order.refunds.reduce(
          (sum, refund) => sum + parseFloat(refund.amount.toString()),
          0
        );

        let key: string;
        if (periodTypeParam === "daily" || periodTypeParam === "custom") {
          key = format(orderDate, "yyyy-MM-dd");
        } else if (periodTypeParam === "weekly") {
          // For weekly, group all data in the selected week into a single key
          // Use the week start date (Monday) as the key
          const weekStart = startOfWeek(orderDate, { weekStartsOn: 1 }); // Monday
          key = format(weekStart, "yyyy-MM-dd");
        } else if (periodTypeParam === "yearly") {
          key = format(orderDate, "yyyy");
        } else {
          // monthly
          key = format(orderDate, "yyyy-MM");
        }

        if (!groupedData.has(key)) {
          groupedData.set(key, { revenue: 0, refunds: 0, orders: 0 });
        }

        const periodData = groupedData.get(key)!;
        periodData.revenue +=
          parseFloat(order.totalAmount.toString()) - refundedAmount;
        periodData.refunds += refundedAmount;
        periodData.orders += 1;
      });

      // Generate chart data based on period type
      let chartData: Array<{
        month: string;
        revenue: number;
        refunds: number;
        orders: number;
      }> = [];

      if (periodTypeParam === "daily" || periodTypeParam === "custom") {
        const daysInRange = eachDayOfInterval({
          start: startOfDay(periodStart),
          end: endOfDay(periodEnd),
        });

        chartData = daysInRange.map((dayDate) => {
          const dayKey = format(dayDate, "yyyy-MM-dd");
          const dayData = groupedData.get(dayKey) || {
            revenue: 0,
            refunds: 0,
            orders: 0,
          };

          return {
            month: dayKey,
            revenue: dayData.revenue,
            refunds: dayData.refunds,
            orders: dayData.orders,
          };
        });
      } else if (periodTypeParam === "weekly") {
        // For weekly, return a single data point for the selected week
        // Use the week start date (Monday) as the key
        const weekStart = startOfWeek(periodStart, { weekStartsOn: 1 }); // Monday
        const weekKey = format(weekStart, "yyyy-MM-dd");
        const weekData = groupedData.get(weekKey) || {
          revenue: 0,
          refunds: 0,
          orders: 0,
        };

        chartData = [
          {
            month: weekKey,
            revenue: weekData.revenue,
            refunds: weekData.refunds,
            orders: weekData.orders,
          },
        ];
      } else if (periodTypeParam === "yearly") {
        const yearsInRange = eachYearOfInterval({
          start: startOfYear(periodStart),
          end: endOfYear(periodEnd),
        });

        chartData = yearsInRange.map((yearDate) => {
          const yearKey = format(yearDate, "yyyy");
          const yearData = groupedData.get(yearKey) || {
            revenue: 0,
            refunds: 0,
            orders: 0,
          };

          return {
            month: yearKey,
            revenue: yearData.revenue,
            refunds: yearData.refunds,
            orders: yearData.orders,
          };
        });
      } else {
        // monthly
        const monthsInRange = eachMonthOfInterval({
          start: startOfMonth(periodStart),
          end: endOfMonth(periodEnd),
        });

        chartData = monthsInRange.map((monthDate) => {
          const monthKey = format(monthDate, "yyyy-MM");
          const monthData = groupedData.get(monthKey) || {
            revenue: 0,
            refunds: 0,
            orders: 0,
          };

          return {
            month: monthKey,
            revenue: monthData.revenue,
            refunds: monthData.refunds,
            orders: monthData.orders,
          };
        });
      }

      // Get payment method breakdown
      const paymentMethodData = await prisma.order.groupBy({
        by: ["paymentMethod"],
        where: {
          ...dateFilter,
          ...additionalFilters,
        },
        _sum: {
          totalAmount: true,
        },
        _count: {
          id: true,
        },
      });

      // Get order status breakdown
      const orderStatusData = await prisma.order.groupBy({
        by: ["status"],
        where: {
          ...dateFilter,
          ...additionalFilters,
        },
        _sum: {
          totalAmount: true,
        },
        _count: {
          id: true,
        },
      });

      // Calculate month-over-month changes
      const currentMonthData = chartData[chartData.length - 1] || {
        revenue: 0,
        refunds: 0,
        orders: 0,
      };
      const previousMonthData = chartData[chartData.length - 2] || {
        revenue: 0,
        refunds: 0,
        orders: 0,
      };

      const calculatePercentageChange = (
        current: number,
        previous: number
      ): number => {
        if (previous === 0) {
          return current > 0 ? 100 : 0;
        }
        return ((current - previous) / previous) * 100;
      };

      const monthOverMonthChanges = {
        revenueChange: calculatePercentageChange(
          currentMonthData.revenue,
          previousMonthData.revenue
        ),
        refundsChange: calculatePercentageChange(
          currentMonthData.refunds,
          previousMonthData.refunds
        ),
        ordersChange: calculatePercentageChange(
          currentMonthData.orders,
          previousMonthData.orders
        ),
        netRevenueChange: calculatePercentageChange(
          currentMonthData.revenue - currentMonthData.refunds,
          previousMonthData.revenue - previousMonthData.refunds
        ),
      };

      res.json({
        success: true,
        data: {
          summary: {
            totalRevenue,
            totalRefunds,
            totalTaxes,
            netRevenue,
            totalOrders: orders.length,
            paidOrdersRevenue,
            pendingOrdersRevenue,
            cancelledOrdersRevenue,
            orderBreakdown,
            monthOverMonthChanges,
          },
          chartData,
          paymentMethodBreakdown: paymentMethodData.map((item) => ({
            method: item.paymentMethod,
            revenue: parseFloat(item._sum.totalAmount?.toString() || "0"),
            orders: item._count.id,
          })),
          orderStatusBreakdown: orderStatusData.map((item) => ({
            status: item.status,
            revenue: parseFloat(item._sum.totalAmount?.toString() || "0"),
            orders: item._count.id,
          })),
          rawOrders: orders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            totalAmount: parseFloat(order.totalAmount.toString()),
            paymentStatus: order.paymentStatus,
            status: order.status,
            createdAt: order.createdAt,
            refunds: order.refunds.map((refund) => ({
              amount: parseFloat(refund.amount.toString()),
              status: refund.status,
            })),
          })),
        },
      });
    } catch (error) {
      console.error("Detailed revenue analytics error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch detailed revenue analytics",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  private getRefundAnalytics = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { startDate, endDate, paymentMethod, orderStatus, periodType, branchId } =
        req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = req.rbacUser;
      const organizationId = (req as any).organizationId as string | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      let allowedBranchIds: string[] | null = null;
      if (rbacUser && !isOrgAdmin && !hasImplicitFullAccess(rbacUser.userType)) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          res.status(403).json({ success: false, error: "No branch access assigned" });
          return;
        }
        const requestedBranchId = branchId as string | undefined;
        if (requestedBranchId && !allowedBranchIds.includes(requestedBranchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      if (branchId && organizationId) {
        const branch = await prisma.branch.findFirst({
          where: { id: branchId as string, organizationId },
          select: { id: true },
        });
        if (!branch) {
          res.status(400).json({ success: false, error: "Invalid branchId for this organization" });
          return;
        }
      }

      // Build date filter from startDate and endDate
      let dateFilter: any = {};
      let periodStart: Date;
      let periodEnd: Date;

      if (startDate && endDate) {
        periodStart = new Date(startDate as string);
        periodEnd = new Date(endDate as string);
        periodEnd.setHours(23, 59, 59, 999);

        dateFilter = {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        };
      } else {
        // Default to current month if no dates provided
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
        dateFilter = {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        };
      }

      // Build refunds where clause - refunds are filtered by order date and branch
      const refundsWhere: any = {
        order: {
          ...dateFilter,
          ...(organizationId
            ? {
                branch: {
                  organizationId,
                },
              }
            : {}),
        },
      };
      if (branchId) {
        refundsWhere.order.branchId = branchId as string;
      } else if (allowedBranchIds) {
        refundsWhere.order.branchId =
          allowedBranchIds.length === 1
            ? allowedBranchIds[0]
            : { in: allowedBranchIds };
      }

      // Get refunds data
      const refunds = await prisma.refund.findMany({
        where: refundsWhere,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              paymentMethod: true,
              createdAt: true,
              branchId: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Calculate summary statistics
      const totalRefundAmount = refunds.reduce(
        (sum, refund) => sum + parseFloat(refund.amount.toString()),
        0
      );

      const totalRefundsCount = refunds.length;

      // Get refunds by status
      const refundsByStatus = await prisma.refund.groupBy({
        by: ["status"],
        where: refundsWhere,
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      });

      // Get refunds by type
      const refundsByType = await prisma.refund.groupBy({
        by: ["refundType"],
        where: refundsWhere,
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      });

      // Group refunds data based on periodType
      const periodTypeParam = (periodType as string) || "monthly";
      const groupedRefundData = new Map<
        string,
        { amount: number; count: number }
      >();

      refunds.forEach((refund) => {
        const refundDate = new Date(refund.createdAt);

        let key: string;
        if (periodTypeParam === "daily" || periodTypeParam === "custom") {
          key = format(refundDate, "yyyy-MM-dd");
        } else if (periodTypeParam === "weekly") {
          // For weekly, group all data in the selected week into a single key
          // Use the week start date (Monday) as the key
          const weekStart = startOfWeek(refundDate, { weekStartsOn: 1 }); // Monday
          key = format(weekStart, "yyyy-MM-dd");
        } else if (periodTypeParam === "yearly") {
          key = format(refundDate, "yyyy");
        } else {
          // monthly
          key = format(refundDate, "yyyy-MM");
        }

        if (!groupedRefundData.has(key)) {
          groupedRefundData.set(key, { amount: 0, count: 0 });
        }

        const periodData = groupedRefundData.get(key)!;
        periodData.amount += parseFloat(refund.amount.toString());
        periodData.count += 1;
      });

      // Generate chart data based on period type
      let chartData: Array<{
        month: string;
        amount: number;
        count: number;
      }> = [];

      if (periodTypeParam === "daily" || periodTypeParam === "custom") {
        const daysInRange = eachDayOfInterval({
          start: startOfDay(periodStart),
          end: endOfDay(periodEnd),
        });

        chartData = daysInRange.map((dayDate) => {
          const dayKey = format(dayDate, "yyyy-MM-dd");
          const dayData = groupedRefundData.get(dayKey) || {
            amount: 0,
            count: 0,
          };

          return {
            month: dayKey,
            amount: dayData.amount,
            count: dayData.count,
          };
        });
      } else if (periodTypeParam === "weekly") {
        // For weekly, return a single data point for the selected week
        // Use the week start date (Monday) as the key
        const weekStart = startOfWeek(periodStart, { weekStartsOn: 1 }); // Monday
        const weekKey = format(weekStart, "yyyy-MM-dd");
        const weekData = groupedRefundData.get(weekKey) || {
          amount: 0,
          count: 0,
        };

        chartData = [
          {
            month: weekKey,
            amount: weekData.amount,
            count: weekData.count,
          },
        ];
      } else if (periodTypeParam === "yearly") {
        const yearsInRange = eachYearOfInterval({
          start: startOfYear(periodStart),
          end: endOfYear(periodEnd),
        });

        chartData = yearsInRange.map((yearDate) => {
          const yearKey = format(yearDate, "yyyy");
          const yearData = groupedRefundData.get(yearKey) || {
            amount: 0,
            count: 0,
          };

          return {
            month: yearKey,
            amount: yearData.amount,
            count: yearData.count,
          };
        });
      } else {
        // monthly
        const monthsInRange = eachMonthOfInterval({
          start: startOfMonth(periodStart),
          end: endOfMonth(periodEnd),
        });

        chartData = monthsInRange.map((monthDate) => {
          const monthKey = format(monthDate, "yyyy-MM");
          const monthData = groupedRefundData.get(monthKey) || {
            amount: 0,
            count: 0,
          };

          return {
            month: monthKey,
            amount: monthData.amount,
            count: monthData.count,
          };
        });
      }

      // Get refunds by payment method (from associated orders)
      const refundsByPaymentMethod = new Map<
        string,
        { amount: number; count: number }
      >();

      refunds.forEach((refund) => {
        if (!refund.order) return;
        const method = refund.order.paymentMethod;
        if (!refundsByPaymentMethod.has(method)) {
          refundsByPaymentMethod.set(method, { amount: 0, count: 0 });
        }

        const methodData = refundsByPaymentMethod.get(method)!;
        methodData.amount += parseFloat(refund.amount.toString());
        methodData.count += 1;
      });

      // Get recent refunds for detailed view with audit information
      const recentRefunds = refunds
        .filter((refund) => refund.order)
        .slice(0, 50)
        .map((refund) => ({
          id: refund.id,
          orderNumber: refund.order!.orderNumber,
          amount: parseFloat(refund.amount.toString()),
          refundType: refund.refundType,
          status: refund.status,
          reason: refund.reason,
          refundedBy: refund.refundedBy,
          createdAt: refund.createdAt,
          refundedAt: refund.refundedAt,
          // Audit information
          originalOrderAmount: parseFloat(refund.order!.totalAmount.toString()),
        }));

      // Calculate partial refund audit data - group refunds by order to show remaining revenue
      const orderRefundMap = new Map<string, {
        orderId: string;
        orderNumber: string;
        originalAmount: number;
        totalRefunded: number;
        remainingRevenue: number;
        refundCount: number;
        isFullyRefunded: boolean;
      }>();

      refunds.forEach((refund) => {
        if (!refund.order) return;
        const orderId = refund.order.id;
        const originalAmount = parseFloat(refund.order.totalAmount.toString());
        const refundAmount = parseFloat(refund.amount.toString());

        if (!orderRefundMap.has(orderId)) {
          orderRefundMap.set(orderId, {
            orderId,
            orderNumber: refund.order.orderNumber,
            originalAmount,
            totalRefunded: 0,
            remainingRevenue: originalAmount,
            refundCount: 0,
            isFullyRefunded: false,
          });
        }

        const orderData = orderRefundMap.get(orderId)!;
        orderData.totalRefunded += refundAmount;
        orderData.remainingRevenue = orderData.originalAmount - orderData.totalRefunded;
        orderData.refundCount += 1;
        // Consider fully refunded if remaining is less than 1 cent
        orderData.isFullyRefunded = orderData.remainingRevenue < 0.01;
      });

      // Audit summary for partial refunds
      const partialRefundAudit = Array.from(orderRefundMap.values());
      const fullyRefundedOrders = partialRefundAudit.filter(o => o.isFullyRefunded);
      const partiallyRefundedOrders = partialRefundAudit.filter(o => !o.isFullyRefunded);
      
      const totalOriginalAmount = partialRefundAudit.reduce((sum, o) => sum + o.originalAmount, 0);
      const totalRemainingRevenue = partialRefundAudit.reduce((sum, o) => sum + Math.max(0, o.remainingRevenue), 0);

      res.json({
        success: true,
        data: {
          summary: {
            totalRefundAmount,
            totalRefundsCount,
            averageRefundAmount:
              totalRefundsCount > 0 ? totalRefundAmount / totalRefundsCount : 0,
            // Audit summary
            totalOriginalAmount,
            totalRemainingRevenue,
            fullyRefundedOrdersCount: fullyRefundedOrders.length,
            partiallyRefundedOrdersCount: partiallyRefundedOrders.length,
            totalAffectedOrders: partialRefundAudit.length,
          },
          chartData,
          refundsByStatus: refundsByStatus.map((item) => ({
            status: item.status,
            amount: parseFloat(item._sum.amount?.toString() || "0"),
            count: item._count.id,
          })),
          refundsByType: refundsByType.map((item) => ({
            type: item.refundType,
            amount: parseFloat(item._sum.amount?.toString() || "0"),
            count: item._count.id,
          })),
          refundsByPaymentMethod: Array.from(
            refundsByPaymentMethod.entries()
          ).map(([method, data]) => ({
            method,
            amount: data.amount,
            count: data.count,
          })),
          recentRefunds,
          // Partial refund audit data for detailed tracking
          partialRefundAudit: partialRefundAudit.slice(0, 100).map(o => ({
            orderId: o.orderId,
            orderNumber: o.orderNumber,
            originalAmount: o.originalAmount,
            totalRefunded: o.totalRefunded,
            remainingRevenue: Math.max(0, o.remainingRevenue),
            refundCount: o.refundCount,
            isFullyRefunded: o.isFullyRefunded,
            refundPercentage: o.originalAmount > 0 
              ? Math.round((o.totalRefunded / o.originalAmount) * 100) 
              : 0,
          })),
        },
      });
    } catch (error) {
      console.error("Refund analytics error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch refund analytics",
      });
    }
  };

  private getBranchRevenueChart = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = req.rbacUser;
      const organizationId = (req as any).organizationId as string | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      let allowedBranchIds: string[] | null = null;
      if (rbacUser && !isOrgAdmin && !hasImplicitFullAccess(rbacUser.userType)) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          res.status(403).json({ success: false, error: "No branch access assigned" });
          return;
        }
      }

      // Build date filter
      let dateFilter: any = {};
      let periodStart: Date;
      let periodEnd: Date;

      if (startDate && endDate) {
        periodStart = new Date(startDate as string);
        periodEnd = new Date(endDate as string);
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        // Default to current month
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
      }

      dateFilter = {
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      };

      // Get orders with branch information
      const orders = await prisma.order.findMany({
        where: {
          ...dateFilter,
          branchId: {
            not: null,
          },
          ...(organizationId
            ? {
                branch: {
                  organizationId,
                },
              }
            : {}),
          ...(allowedBranchIds
            ? {
                branchId:
                  allowedBranchIds.length === 1
                    ? allowedBranchIds[0]
                    : { in: allowedBranchIds },
              }
            : {}),
        },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Group by branch
      const branchStats: {
        [key: string]: { name: string; revenue: number };
      } = {};

      orders.forEach((order) => {
        if (order.branch) {
          const branchId = order.branch.id;
          if (!branchStats[branchId]) {
            branchStats[branchId] = {
              name: order.branch.name,
              revenue: 0,
            };
          }
          branchStats[branchId].revenue += Number(order.totalAmount);
        }
      });

      const labels = Object.values(branchStats).map((b) => b.name);
      const data = Object.values(branchStats).map((b) => b.revenue);

      if (labels.length === 0) {
        res.json({
          success: true,
          data: {
            labels: ["No Data"],
            datasets: [
              {
                label: "Revenue",
                data: [1],
                backgroundColor: ["rgba(156, 163, 175, 0.5)"],
                borderColor: ["rgb(156, 163, 175)"],
                borderWidth: 2,
                hoverOffset: 4,
              },
            ],
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          labels,
          datasets: [
            {
              label: "Revenue",
              data,
              backgroundColor: [
                "rgba(236, 72, 153, 0.8)", // Pink
                "rgba(34, 197, 94, 0.8)", // Green
                "rgba(59, 130, 246, 0.8)", // Blue
                "rgba(245, 158, 11, 0.8)", // Yellow
                "rgba(139, 69, 19, 0.8)", // Brown
                "rgba(168, 85, 247, 0.8)", // Purple
                "rgba(239, 68, 68, 0.8)", // Red
                "rgba(16, 185, 129, 0.8)", // Emerald
              ],
              borderColor: [
                "rgb(236, 72, 153)",
                "rgb(34, 197, 94)",
                "rgb(59, 130, 246)",
                "rgb(245, 158, 11)",
                "rgb(139, 69, 19)",
                "rgb(168, 85, 247)",
                "rgb(239, 68, 68)",
                "rgb(16, 185, 129)",
              ],
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        },
      });
    } catch (error) {
      console.error("Branch revenue chart error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch branch revenue chart",
      });
    }
  };

  private getBranchRefundsChart = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = req.rbacUser;
      const organizationId = (req as any).organizationId as string | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      let allowedBranchIds: string[] | null = null;
      if (rbacUser && !isOrgAdmin && !hasImplicitFullAccess(rbacUser.userType)) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          res.status(403).json({ success: false, error: "No branch access assigned" });
          return;
        }
      }

      // Build date filter
      let dateFilter: any = {};
      let periodStart: Date;
      let periodEnd: Date;

      if (startDate && endDate) {
        periodStart = new Date(startDate as string);
        periodEnd = new Date(endDate as string);
        periodEnd.setHours(23, 59, 59, 999);
      } else {
        // Default to current month
        const now = new Date();
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
      }

      dateFilter = {
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      };

      // Get refunds with branch information
      const refunds = await prisma.refund.findMany({
        where: {
          order: {
            ...dateFilter,
            branchId: {
              not: null,
            },
            ...(organizationId
              ? {
                  branch: {
                    organizationId,
                  },
                }
              : {}),
            ...(allowedBranchIds
              ? {
                  branchId:
                    allowedBranchIds.length === 1
                      ? allowedBranchIds[0]
                      : { in: allowedBranchIds },
                }
              : {}),
          },
        },
        include: {
          order: {
            include: {
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

      // Group by branch
      const branchStats: {
        [key: string]: { name: string; refunds: number };
      } = {};

      refunds.forEach((refund) => {
        if (refund.order?.branch) {
          const branchId = refund.order.branch.id;
          if (!branchStats[branchId]) {
            branchStats[branchId] = {
              name: refund.order.branch.name,
              refunds: 0,
            };
          }
          branchStats[branchId].refunds += parseFloat(refund.amount.toString());
        }
      });

      const labels = Object.values(branchStats).map((b) => b.name);
      const data = Object.values(branchStats).map((b) => b.refunds);

      if (labels.length === 0) {
        res.json({
          success: true,
          data: {
            labels: ["No Data"],
            datasets: [
              {
                label: "Refunds",
                data: [1],
                backgroundColor: ["rgba(156, 163, 175, 0.5)"],
                borderColor: ["rgb(156, 163, 175)"],
                borderWidth: 2,
                hoverOffset: 4,
              },
            ],
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          labels,
          datasets: [
            {
              label: "Refunds",
              data,
              backgroundColor: [
                "rgba(236, 72, 153, 0.8)", // Pink
                "rgba(34, 197, 94, 0.8)", // Green
                "rgba(59, 130, 246, 0.8)", // Blue
                "rgba(245, 158, 11, 0.8)", // Yellow
                "rgba(139, 69, 19, 0.8)", // Brown
                "rgba(168, 85, 247, 0.8)", // Purple
                "rgba(239, 68, 68, 0.8)", // Red
                "rgba(16, 185, 129, 0.8)", // Emerald
              ],
              borderColor: [
                "rgb(236, 72, 153)",
                "rgb(34, 197, 94)",
                "rgb(59, 130, 246)",
                "rgb(245, 158, 11)",
                "rgb(139, 69, 19)",
                "rgb(168, 85, 247)",
                "rgb(239, 68, 68)",
                "rgb(16, 185, 129)",
              ],
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        },
      });
    } catch (error) {
      console.error("Branch refunds chart error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch branch refunds chart",
      });
    }
  };

  private getOrderAnalytics = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { period = "this_month", startDate, endDate, branchId } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const rbacUser = req.rbacUser;
      let allowedBranchIds: string[] | null = null;
      if (rbacUser && !hasImplicitFullAccess(rbacUser.userType)) {
        allowedBranchIds = rbacUser.assignedBranchIds || [];
        if (allowedBranchIds.length === 0) {
          res.status(403).json({ success: false, error: "No branch access assigned" });
          return;
        }
        const requestedBranchId = branchId as string | undefined;
        if (requestedBranchId && !allowedBranchIds.includes(requestedBranchId)) {
          res.status(403).json({ success: false, error: "You don't have access to this branch" });
          return;
        }
      }

      // Calculate date range based on period (same logic as revenue analytics)
      let dateFilter: any = {};
      const now = new Date();

      switch (period) {
        case "today":
          const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          dateFilter = {
            createdAt: {
              gte: today,
            },
          };
          break;
        case "this_week":
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          dateFilter = {
            createdAt: {
              gte: startOfWeek,
            },
          };
          break;
        case "this_month":
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter = {
            createdAt: {
              gte: startOfMonth,
            },
          };
          break;
        case "last_7_days":
          const sevenDaysAgo = new Date(
            now.getTime() - 7 * 24 * 60 * 60 * 1000
          );
          dateFilter = {
            createdAt: {
              gte: sevenDaysAgo,
            },
          };
          break;
        case "last_30_days":
          const thirtyDaysAgo = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          );
          dateFilter = {
            createdAt: {
              gte: thirtyDaysAgo,
            },
          };
          break;
        case "last_6_months":
          const sixMonthsAgo = new Date(
            now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000
          );
          dateFilter = {
            createdAt: {
              gte: sixMonthsAgo,
            },
          };
          break;
        case "last_year":
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          dateFilter = {
            createdAt: {
              gte: oneYearAgo,
            },
          };
          break;
        case "custom":
          if (startDate && endDate) {
            dateFilter = {
              createdAt: {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string),
              },
            };
          }
          break;
      }

      // Apply branch scoping
      if (branchId) {
        dateFilter.branchId = branchId as string;
      } else if (allowedBranchIds) {
        dateFilter.branchId =
          allowedBranchIds.length === 1
            ? allowedBranchIds[0]
            : { in: allowedBranchIds };
      }

      // Get orders data
      const orders = await prisma.order.findMany({
        where: dateFilter,
        include: {
          orderItems: {
            include: {
              meal: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Calculate summary statistics
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce(
        (sum, order) => sum + parseFloat(order.totalAmount.toString()),
        0
      );

      // Get orders by status
      const ordersByStatus = await prisma.order.groupBy({
        by: ["status"],
        where: dateFilter,
        _count: {
          id: true,
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Get orders by payment method
      const ordersByPaymentMethod = await prisma.order.groupBy({
        by: ["paymentMethod"],
        where: dateFilter,
        _count: {
          id: true,
        },
        _sum: {
          totalAmount: true,
        },
      });

      // Get monthly orders data for charts
      const monthlyOrderData = new Map<
        string,
        { count: number; revenue: number }
      >();

      orders.forEach((order) => {
        const monthKey = order.createdAt.toISOString().substring(0, 7); // YYYY-MM

        if (!monthlyOrderData.has(monthKey)) {
          monthlyOrderData.set(monthKey, { count: 0, revenue: 0 });
        }

        const monthData = monthlyOrderData.get(monthKey)!;
        monthData.count += 1;
        monthData.revenue += parseFloat(order.totalAmount.toString());
      });

      // Convert to array for chart data
      const chartData = Array.from(monthlyOrderData.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          count: data.count,
          revenue: data.revenue,
        }));

      res.json({
        success: true,
        data: {
          summary: {
            totalOrders,
            totalRevenue,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          },
          chartData,
          ordersByStatus: ordersByStatus.map((item) => ({
            status: item.status,
            count: item._count.id,
            revenue: parseFloat(item._sum.totalAmount?.toString() || "0"),
          })),
          ordersByPaymentMethod: ordersByPaymentMethod.map((item) => ({
            method: item.paymentMethod,
            count: item._count.id,
            revenue: parseFloat(item._sum.totalAmount?.toString() || "0"),
          })),
        },
      });
    } catch (error) {
      console.error("Order analytics error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order analytics",
      });
    }
  };

  // Settings routes
  private setupSettingsRoutes(): void {
    // Get settings
    this.router.get(
      "/settings",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      (req, res) => this.getSettings(req, res)
    );

    // One-time legacy migration: assign an existing Settings record to an organization
    this.router.put(
      "/settings/:id/assign-organization",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      (req, res) => SettingsController.assignSettingsToOrganization(req, res)
    );

    // Update settings
    this.router.put(
      "/settings",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      (req, res) => this.updateSettings(req, res)
    );

    // Reset settings to defaults
    this.router.post(
      "/settings/reset",
      this.rbac.authenticate,
      this.rbac.requireSuperAdmin,
      (req, res) => this.resetSettings(req, res)
    );
  }

  private getSettings = async (req: Request, res: Response) => {
    try {
      let settings = await (this.prisma as any).settings.findFirst({
        where: { organizationId: null },
      });
      if (!settings) {
        settings = await (this.prisma as any).settings.findFirst();
      }

      // If no settings exist, create default settings
      if (!settings) {
        settings = await this.prisma.settings.create({
          data: {
            organizationId: null,
            businessName: "Restaurant Name",
            businessEmail: "contact@restaurant.com",
            businessPhone: "+1234567890",
            businessAddress: "123 Main Street, City, State",
            taxPercentage: 8.5,
            serviceTaxPercentage: 0.0,
            deliveryTaxPercentage: 8.5,
            deliveryFee: 3.99,
            taxInclusive: false,
            enableMinimumOrder: false,
            minimumOrderAmount: 15.0,
            currency: "USD",
            orderPreparationTime: 30,
            maxOrderQuantity: 10,
            deliveryRadius: 5.0,
            deliveryTimeEstimate: 45,
            enableFreeDelivery: false,
            freeDeliveryThreshold: 50.0,
            acceptCash: true,
            acceptCard: true,
            acceptOnlinePayment: true,
            acceptPayPal: false,
          },
        });
      }

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch settings",
      });
    }
  };

  private updateSettings = async (req: Request, res: Response) => {
    try {
      
      const body = req.body as any;
      const {
        // Business Information
        businessName,
        businessEmail,
        businessPhone,
        businessAddress,
        businessLogo,
        country,
        state,
        city,
        addressLineOne,
        latitude,
        longitude,

        // Financial Settings
        taxPercentage,
        serviceTaxPercentage,
        deliveryTaxPercentage,
        deliveryFee,
        enableMinimumOrder,
        minimumOrderAmount,
        currency,
        taxInclusive,

        // Order Settings
        orderPreparationTime,
        maxOrderQuantity,
        allowExcludeOptionalIngredients,
        orderMergeTimeframeMinutes,
        pickupEnabled,
        deliveryEnabled,

        // Delivery Settings
        deliveryRadius,
        deliveryRatePerKilometer,
        useDynamicDeliveryFee,
        useTieredDeliveryFee,
        initialDeliveryRange,
        initialDeliveryPrice,
        extendedDeliveryThreshold,
        extendedDeliveryRate,
        deliveryTimeEstimate,
        enableFreeDelivery,
        freeDeliveryThreshold,

        // Payment Settings
        acceptCash,
        acceptCard,
        acceptOnlinePayment,
        acceptPayPal,
        pickupAcceptCash,
        pickupAcceptCard,
        pickupAcceptOnlinePayment,
        pickupAcceptPayPal,
        pickupTakeawayServiceFee,

        // Application Status
        appStatus,
        
        // Main Branch Configuration
        mainBranchId,

        // Social Media & Contact
        facebookUrl,
        instagramUrl,
        twitterUrl,
        websiteUrl,

        // Delivery Serving Hours
        allowOrdersOutsideHours,
        mondayIsOff,
        mondayOpen,
        mondayClose,
        tuesdayIsOff,
        tuesdayOpen,
        tuesdayClose,
        wednesdayIsOff,
        wednesdayOpen,
        wednesdayClose,
        thursdayIsOff,
        thursdayOpen,
        thursdayClose,
        fridayIsOff,
        fridayOpen,
        fridayClose,
        saturdayIsOff,
        saturdayOpen,
        saturdayClose,
        saturdayPeriods,
        sundayIsOff,
        sundayOpen,
        sundayClose,
        sundayPeriods,
        mondayPeriods,
        tuesdayPeriods,
        wednesdayPeriods,
        thursdayPeriods,
        fridayPeriods,

        // Future Order Scheduling (master)
        futureOrdersEnabled,

        // Future Order Settings
        enableFuturePickupOrders,
        futurePickupOrderDays,
        enableFutureDeliveryOrders,
        futureDeliveryOrderDays,
        
        // Scheduled Order Merge Settings
        allowScheduledOrderMerge,
        scheduledOrderMergeCutoffHours,

        // Scheduled Order Management Settings (Cancellation/Refund)
        scheduledOrderAllowCancellation,
        scheduledOrderCancellationWindowHours,
        scheduledOrderFullRefundHoursBefore,
        scheduledOrderPartialRefundHoursBefore,
        scheduledOrderNoRefundHoursBefore,
        scheduledOrderPartialRefundPercentage,
        scheduledOrderReducedRefundPercentage,
        scheduledOrderAllowModification,
        scheduledOrderModificationWindowHours,
        scheduledOrderAllowShallowModification,
        scheduledOrderAutoConfirm,
        scheduledOrderMinimumAmount,

        // Scheduled Order Time Slot / Capacity
        scheduledOrderTimeSlotInterval,
        scheduledOrderMaxOrdersPerSlot,
      } = body;
      
      const normalizedAppStatus = normalizeAppStatus(appStatus);

      // Check if settings exist
      const existingSettings = await this.prisma.settings.findFirst();

      // Build update data object, only including fields that are explicitly provided
      const updateData: any = {};

      // Business Information
      if (businessName !== undefined) updateData.businessName = businessName;
      if (businessEmail !== undefined) updateData.businessEmail = businessEmail;
      if (businessPhone !== undefined) updateData.businessPhone = businessPhone;
      if (businessAddress !== undefined)
        updateData.businessAddress = businessAddress;
      if (businessLogo !== undefined) updateData.businessLogo = businessLogo;

      // Address Information
      if (country !== undefined) updateData.country = country || null;
      if (state !== undefined) updateData.state = state || null;
      if (city !== undefined) updateData.city = city || null;
      if (addressLineOne !== undefined)
        updateData.addressLineOne = addressLineOne || null;
      if (latitude !== undefined) {
        const latValue =
          latitude !== null && latitude !== ""
            ? parseFloat(String(latitude))
            : null;
        updateData.latitude =
          latValue !== null && !isNaN(latValue) ? latValue : null;
      }
      if (longitude !== undefined) {
        const lngValue =
          longitude !== null && longitude !== ""
            ? parseFloat(String(longitude))
            : null;
        updateData.longitude =
          lngValue !== null && !isNaN(lngValue) ? lngValue : null;
      }

      // Main Branch Configuration
      if (mainBranchId !== undefined) {
        // Convert empty string, "none", or falsy values to null
        if (mainBranchId === null || mainBranchId === "" || mainBranchId === "none") {
          updateData.mainBranchId = null;
        } else if (typeof mainBranchId === "string" && mainBranchId.trim() !== "") {
          updateData.mainBranchId = mainBranchId.trim();
        } else {
          updateData.mainBranchId = null;
        }
      }

      // Future Order Scheduling (master)
      if (futureOrdersEnabled !== undefined) {
        updateData.futureOrdersEnabled = Boolean(futureOrdersEnabled);
      }

      // Service availability
      if (pickupEnabled !== undefined) {
        updateData.pickupEnabled = Boolean(pickupEnabled);
      }
      if (deliveryEnabled !== undefined) {
        updateData.deliveryEnabled = Boolean(deliveryEnabled);
      }

      let settings;
      if (existingSettings) {
        // Update existing settings
        settings = await this.prisma.settings.update({
          where: { id: existingSettings.id },
          data: {
            ...updateData,
            ...(taxPercentage !== undefined && {
              taxPercentage: parseFloat(String(taxPercentage)),
            }),
            ...(serviceTaxPercentage !== undefined && {
              serviceTaxPercentage: parseFloat(String(serviceTaxPercentage)),
            }),
            ...(deliveryTaxPercentage !== undefined && {
              deliveryTaxPercentage: parseFloat(String(deliveryTaxPercentage)),
            }),
            ...(deliveryFee !== undefined && {
              deliveryFee: parseFloat(String(deliveryFee)),
            }),
            ...(taxInclusive !== undefined && { taxInclusive }),
            ...(enableMinimumOrder !== undefined && { enableMinimumOrder }),
            ...(minimumOrderAmount !== undefined && {
              minimumOrderAmount: parseFloat(String(minimumOrderAmount)),
            }),
            ...(currency !== undefined && { currency }),
            ...(orderPreparationTime !== undefined && {
              orderPreparationTime: parseInt(String(orderPreparationTime)),
            }),
            ...(maxOrderQuantity !== undefined && {
              maxOrderQuantity: parseInt(String(maxOrderQuantity)),
            }),
            ...(allowExcludeOptionalIngredients !== undefined && {
              allowExcludeOptionalIngredients,
            }),
            ...(orderMergeTimeframeMinutes !== undefined && {
              orderMergeTimeframeMinutes: parseInt(String(orderMergeTimeframeMinutes)),
            }),
            ...(deliveryRadius !== undefined && {
              deliveryRadius: parseFloat(String(deliveryRadius)),
            }),
            ...(deliveryRatePerKilometer !== undefined && {
              deliveryRatePerKilometer: parseFloat(
                String(deliveryRatePerKilometer)
              ),
            }),
            ...(useDynamicDeliveryFee !== undefined && {
              useDynamicDeliveryFee,
            }),
            ...(useTieredDeliveryFee !== undefined && {
              useTieredDeliveryFee,
            }),
            ...(initialDeliveryRange !== undefined && {
              initialDeliveryRange: parseFloat(String(initialDeliveryRange)),
            }),
            ...(initialDeliveryPrice !== undefined && {
              initialDeliveryPrice: parseFloat(String(initialDeliveryPrice)),
            }),
            ...(extendedDeliveryThreshold !== undefined && {
              extendedDeliveryThreshold:
                extendedDeliveryThreshold !== null &&
                extendedDeliveryThreshold !== "" &&
                parseFloat(String(extendedDeliveryThreshold)) > 0
                  ? parseFloat(String(extendedDeliveryThreshold))
                  : null,
            }),
            ...(extendedDeliveryRate !== undefined && {
              extendedDeliveryRate:
                extendedDeliveryRate !== null &&
                extendedDeliveryRate !== "" &&
                parseFloat(String(extendedDeliveryRate)) > 0
                  ? parseFloat(String(extendedDeliveryRate))
                  : null,
            }),
            ...(deliveryTimeEstimate !== undefined && {
              deliveryTimeEstimate: parseInt(String(deliveryTimeEstimate)),
            }),
            ...(enableFreeDelivery !== undefined && { enableFreeDelivery }),
            ...(freeDeliveryThreshold !== undefined && {
              freeDeliveryThreshold: parseFloat(String(freeDeliveryThreshold)),
            }),
            ...(acceptCash !== undefined && { acceptCash: Boolean(acceptCash) }),
            ...(acceptCard !== undefined && { acceptCard: Boolean(acceptCard) }),
            ...(acceptOnlinePayment !== undefined && { acceptOnlinePayment: Boolean(acceptOnlinePayment) }),
            ...(acceptPayPal !== undefined && (() => {
              const payPalValue = Boolean(acceptPayPal);
              return { acceptPayPal: payPalValue };
            })()),
            // Pickup Payment Settings
            ...(pickupAcceptCash !== undefined && {
              pickupAcceptCash: Boolean(pickupAcceptCash),
            }),
            ...(pickupAcceptCard !== undefined && {
              pickupAcceptCard: Boolean(pickupAcceptCard),
            }),
            ...(pickupAcceptOnlinePayment !== undefined && {
              pickupAcceptOnlinePayment: Boolean(pickupAcceptOnlinePayment),
            }),
            ...(pickupAcceptPayPal !== undefined && {
              pickupAcceptPayPal: Boolean(pickupAcceptPayPal),
            }),
            ...(pickupTakeawayServiceFee !== undefined && {
              pickupTakeawayServiceFee: parseFloat(String(pickupTakeawayServiceFee)),
            }),
            ...(normalizedAppStatus !== undefined && {
              appStatus: normalizedAppStatus,
            }),
            ...(facebookUrl !== undefined && { facebookUrl }),
            ...(instagramUrl !== undefined && { instagramUrl }),
            ...(twitterUrl !== undefined && { twitterUrl }),
            ...(websiteUrl !== undefined && { websiteUrl }),
            // Delivery Serving Hours
            ...(allowOrdersOutsideHours !== undefined && { allowOrdersOutsideHours }),
            ...(mondayIsOff !== undefined && { mondayIsOff }),
            ...(mondayOpen !== undefined && { mondayOpen: mondayOpen || null }),
            ...(mondayClose !== undefined && { mondayClose: mondayClose || null }),
            ...(mondayPeriods !== undefined && { mondayPeriods: mondayPeriods || null }),
            ...(tuesdayIsOff !== undefined && { tuesdayIsOff }),
            ...(tuesdayOpen !== undefined && { tuesdayOpen: tuesdayOpen || null }),
            ...(tuesdayClose !== undefined && { tuesdayClose: tuesdayClose || null }),
            ...(tuesdayPeriods !== undefined && { tuesdayPeriods: tuesdayPeriods || null }),
            ...(wednesdayIsOff !== undefined && { wednesdayIsOff }),
            ...(wednesdayOpen !== undefined && { wednesdayOpen: wednesdayOpen || null }),
            ...(wednesdayClose !== undefined && { wednesdayClose: wednesdayClose || null }),
            ...(wednesdayPeriods !== undefined && { wednesdayPeriods: wednesdayPeriods || null }),
            ...(thursdayIsOff !== undefined && { thursdayIsOff }),
            ...(thursdayOpen !== undefined && { thursdayOpen: thursdayOpen || null }),
            ...(thursdayClose !== undefined && { thursdayClose: thursdayClose || null }),
            ...(thursdayPeriods !== undefined && { thursdayPeriods: thursdayPeriods || null }),
            ...(fridayIsOff !== undefined && { fridayIsOff }),
            ...(fridayOpen !== undefined && { fridayOpen: fridayOpen || null }),
            ...(fridayClose !== undefined && { fridayClose: fridayClose || null }),
            ...(fridayPeriods !== undefined && { fridayPeriods: fridayPeriods || null }),
            ...(saturdayIsOff !== undefined && { saturdayIsOff }),
            ...(saturdayOpen !== undefined && { saturdayOpen: saturdayOpen || null }),
            ...(saturdayClose !== undefined && { saturdayClose: saturdayClose || null }),
            ...(saturdayPeriods !== undefined && { saturdayPeriods: saturdayPeriods || null }),
            ...(sundayIsOff !== undefined && { sundayIsOff }),
            ...(sundayOpen !== undefined && { sundayOpen: sundayOpen || null }),
            ...(sundayClose !== undefined && { sundayClose: sundayClose || null }),
            ...(sundayPeriods !== undefined && { sundayPeriods: sundayPeriods || null }),
            // Future Order Settings
            ...(enableFuturePickupOrders !== undefined && {
              enableFuturePickupOrders: Boolean(enableFuturePickupOrders),
            }),
            ...(futurePickupOrderDays !== undefined && {
              futurePickupOrderDays: parseInt(String(futurePickupOrderDays)),
            }),
            ...(enableFutureDeliveryOrders !== undefined && {
              enableFutureDeliveryOrders: Boolean(enableFutureDeliveryOrders),
            }),
            ...(futureDeliveryOrderDays !== undefined && {
              futureDeliveryOrderDays: parseInt(String(futureDeliveryOrderDays)),
            }),
            // Scheduled Order Merge Settings
            ...(allowScheduledOrderMerge !== undefined && {
              allowScheduledOrderMerge: Boolean(allowScheduledOrderMerge),
            }),
            ...(scheduledOrderMergeCutoffHours !== undefined && {
              scheduledOrderMergeCutoffHours: parseInt(String(scheduledOrderMergeCutoffHours)),
            }),

            // Scheduled Order Management Settings (Cancellation/Modification/Refund)
            ...(scheduledOrderAllowCancellation !== undefined && {
              scheduledOrderAllowCancellation: Boolean(scheduledOrderAllowCancellation),
            }),
            ...(scheduledOrderCancellationWindowHours !== undefined && {
              scheduledOrderCancellationWindowHours: parseInt(
                String(scheduledOrderCancellationWindowHours)
              ),
            }),
            ...(scheduledOrderFullRefundHoursBefore !== undefined && {
              scheduledOrderFullRefundHoursBefore: parseInt(
                String(scheduledOrderFullRefundHoursBefore)
              ),
            }),
            ...(scheduledOrderPartialRefundHoursBefore !== undefined && {
              scheduledOrderPartialRefundHoursBefore: parseInt(
                String(scheduledOrderPartialRefundHoursBefore)
              ),
            }),
            ...(scheduledOrderNoRefundHoursBefore !== undefined && {
              scheduledOrderNoRefundHoursBefore: parseInt(
                String(scheduledOrderNoRefundHoursBefore)
              ),
            }),
            ...(scheduledOrderPartialRefundPercentage !== undefined && {
              scheduledOrderPartialRefundPercentage: parseInt(
                String(scheduledOrderPartialRefundPercentage)
              ),
            }),
            ...(scheduledOrderReducedRefundPercentage !== undefined && {
              scheduledOrderReducedRefundPercentage: parseInt(
                String(scheduledOrderReducedRefundPercentage)
              ),
            }),
            ...(scheduledOrderAllowModification !== undefined && {
              scheduledOrderAllowModification: Boolean(scheduledOrderAllowModification),
            }),
            ...(scheduledOrderModificationWindowHours !== undefined && {
              scheduledOrderModificationWindowHours: parseInt(
                String(scheduledOrderModificationWindowHours)
              ),
            }),
            ...(scheduledOrderAllowShallowModification !== undefined && {
              scheduledOrderAllowShallowModification: Boolean(
                scheduledOrderAllowShallowModification
              ),
            }),
            ...(scheduledOrderAutoConfirm !== undefined && {
              scheduledOrderAutoConfirm: Boolean(scheduledOrderAutoConfirm),
            }),
            ...(scheduledOrderMinimumAmount !== undefined && {
              scheduledOrderMinimumAmount:
                scheduledOrderMinimumAmount === null || scheduledOrderMinimumAmount === ""
                  ? null
                  : parseFloat(String(scheduledOrderMinimumAmount)),
            }),

            // Scheduled Order Time Slot / Capacity
            ...(scheduledOrderTimeSlotInterval !== undefined && {
              scheduledOrderTimeSlotInterval: parseInt(String(scheduledOrderTimeSlotInterval)),
            }),
            ...(scheduledOrderMaxOrdersPerSlot !== undefined && {
              scheduledOrderMaxOrdersPerSlot:
                scheduledOrderMaxOrdersPerSlot === null ||
                scheduledOrderMaxOrdersPerSlot === ""
                  ? null
                  : parseInt(String(scheduledOrderMaxOrdersPerSlot)),
            }),
          },
        });
        
      } else {
        // Create new settings
        settings = await this.prisma.settings.create({
          data: {
            ...updateData,
            businessName: businessName || "Restaurant Name",
            businessEmail: businessEmail || "contact@restaurant.com",
            businessPhone: businessPhone || "+1234567890",
            businessAddress: businessAddress || "123 Main Street, City, State",
            taxPercentage: taxPercentage
              ? parseFloat(String(taxPercentage))
              : 0.0,
            serviceTaxPercentage: serviceTaxPercentage
              ? parseFloat(String(serviceTaxPercentage))
              : 0.0,
            deliveryTaxPercentage: deliveryTaxPercentage
              ? parseFloat(deliveryTaxPercentage)
              : 0.0,
            deliveryFee: deliveryFee ? parseFloat(deliveryFee) : 0.0,
            taxInclusive: taxInclusive !== undefined ? taxInclusive : false,
            enableMinimumOrder:
              enableMinimumOrder !== undefined ? enableMinimumOrder : false,
            minimumOrderAmount: minimumOrderAmount
              ? parseFloat(minimumOrderAmount)
              : 0.0,
            currency: currency || "USD",
            orderPreparationTime: orderPreparationTime
              ? parseInt(orderPreparationTime)
              : 30,
            maxOrderQuantity: maxOrderQuantity
              ? parseInt(maxOrderQuantity)
              : 10,
            allowExcludeOptionalIngredients:
              allowExcludeOptionalIngredients !== undefined
                ? allowExcludeOptionalIngredients
                : true,
            orderMergeTimeframeMinutes:
              orderMergeTimeframeMinutes !== undefined
                ? parseInt(String(orderMergeTimeframeMinutes))
                : 10,
            pickupEnabled:
              pickupEnabled !== undefined ? Boolean(pickupEnabled) : true,
            deliveryEnabled:
              deliveryEnabled !== undefined ? Boolean(deliveryEnabled) : true,
            deliveryRadius: deliveryRadius ? parseFloat(deliveryRadius) : 5.0,
            deliveryRatePerKilometer: deliveryRatePerKilometer
              ? parseFloat(deliveryRatePerKilometer)
              : 0.0,
            useDynamicDeliveryFee:
              useDynamicDeliveryFee !== undefined
                ? useDynamicDeliveryFee
                : false,
            useTieredDeliveryFee:
              useTieredDeliveryFee !== undefined ? useTieredDeliveryFee : false,
            initialDeliveryRange: initialDeliveryRange
              ? parseFloat(String(initialDeliveryRange))
              : 3.0,
            initialDeliveryPrice: initialDeliveryPrice
              ? parseFloat(String(initialDeliveryPrice))
              : 2.0,
            extendedDeliveryThreshold:
              extendedDeliveryThreshold !== null &&
              extendedDeliveryThreshold !== "" &&
              parseFloat(String(extendedDeliveryThreshold)) > 0
                ? parseFloat(String(extendedDeliveryThreshold))
                : null,
            extendedDeliveryRate:
              extendedDeliveryRate !== null &&
              extendedDeliveryRate !== "" &&
              parseFloat(String(extendedDeliveryRate)) > 0
                ? parseFloat(String(extendedDeliveryRate))
                : null,
            deliveryTimeEstimate: deliveryTimeEstimate
              ? parseInt(deliveryTimeEstimate)
              : 45,
            enableFreeDelivery:
              enableFreeDelivery !== undefined ? enableFreeDelivery : false,
            freeDeliveryThreshold: freeDeliveryThreshold
              ? parseFloat(freeDeliveryThreshold)
              : 50.0,
            acceptCash: acceptCash !== undefined ? acceptCash : true,
            acceptCard: acceptCard !== undefined ? acceptCard : true,
            acceptOnlinePayment:
              acceptOnlinePayment !== undefined ? acceptOnlinePayment : true,
            acceptPayPal: acceptPayPal !== undefined ? acceptPayPal : false,
            allowOrdersOutsideHours: allowOrdersOutsideHours !== undefined ? allowOrdersOutsideHours : false,
            mondayIsOff: mondayIsOff !== undefined ? mondayIsOff : false,
            mondayOpen: mondayOpen || null,
            mondayClose: mondayClose || null,
            mondayPeriods: mondayPeriods || null,
            tuesdayIsOff: tuesdayIsOff !== undefined ? tuesdayIsOff : false,
            tuesdayOpen: tuesdayOpen || null,
            tuesdayClose: tuesdayClose || null,
            tuesdayPeriods: tuesdayPeriods || null,
            wednesdayIsOff: wednesdayIsOff !== undefined ? wednesdayIsOff : false,
            wednesdayOpen: wednesdayOpen || null,
            wednesdayClose: wednesdayClose || null,
            wednesdayPeriods: wednesdayPeriods || null,
            thursdayIsOff: thursdayIsOff !== undefined ? thursdayIsOff : false,
            thursdayOpen: thursdayOpen || null,
            thursdayClose: thursdayClose || null,
            thursdayPeriods: thursdayPeriods || null,
            fridayIsOff: fridayIsOff !== undefined ? fridayIsOff : false,
            fridayOpen: fridayOpen || null,
            fridayClose: fridayClose || null,
            fridayPeriods: fridayPeriods || null,
            saturdayIsOff: saturdayIsOff !== undefined ? saturdayIsOff : false,
            saturdayOpen: saturdayOpen || null,
            saturdayClose: saturdayClose || null,
            saturdayPeriods: saturdayPeriods || null,
            sundayIsOff: sundayIsOff !== undefined ? sundayIsOff : false,
            sundayOpen: sundayOpen || null,
            sundayClose: sundayClose || null,
            sundayPeriods: sundayPeriods || null,
            // Future Order Settings
            futureOrdersEnabled: futureOrdersEnabled !== undefined ? Boolean(futureOrdersEnabled) : false,
            enableFuturePickupOrders: enableFuturePickupOrders !== undefined ? Boolean(enableFuturePickupOrders) : false,
            futurePickupOrderDays: futurePickupOrderDays !== undefined ? parseInt(String(futurePickupOrderDays)) : 0,
            enableFutureDeliveryOrders: enableFutureDeliveryOrders !== undefined ? Boolean(enableFutureDeliveryOrders) : false,
            futureDeliveryOrderDays: futureDeliveryOrderDays !== undefined ? parseInt(String(futureDeliveryOrderDays)) : 0,
            // Scheduled Order Merge Settings
            allowScheduledOrderMerge: allowScheduledOrderMerge !== undefined ? Boolean(allowScheduledOrderMerge) : false,
            scheduledOrderMergeCutoffHours: scheduledOrderMergeCutoffHours !== undefined ? parseInt(String(scheduledOrderMergeCutoffHours)) : 2,

            // Scheduled Order Management Settings (Cancellation/Modification/Refund)
            scheduledOrderAllowCancellation:
              scheduledOrderAllowCancellation !== undefined
                ? Boolean(scheduledOrderAllowCancellation)
                : false,
            scheduledOrderCancellationWindowHours:
              scheduledOrderCancellationWindowHours !== undefined
                ? parseInt(String(scheduledOrderCancellationWindowHours))
                : 0,
            scheduledOrderFullRefundHoursBefore:
              scheduledOrderFullRefundHoursBefore !== undefined
                ? parseInt(String(scheduledOrderFullRefundHoursBefore))
                : 24,
            scheduledOrderPartialRefundHoursBefore:
              scheduledOrderPartialRefundHoursBefore !== undefined
                ? parseInt(String(scheduledOrderPartialRefundHoursBefore))
                : 12,
            scheduledOrderNoRefundHoursBefore:
              scheduledOrderNoRefundHoursBefore !== undefined
                ? parseInt(String(scheduledOrderNoRefundHoursBefore))
                : 2,
            scheduledOrderPartialRefundPercentage:
              scheduledOrderPartialRefundPercentage !== undefined
                ? parseInt(String(scheduledOrderPartialRefundPercentage))
                : 50,
            scheduledOrderReducedRefundPercentage:
              scheduledOrderReducedRefundPercentage !== undefined
                ? parseInt(String(scheduledOrderReducedRefundPercentage))
                : 25,
            scheduledOrderAllowModification:
              scheduledOrderAllowModification !== undefined
                ? Boolean(scheduledOrderAllowModification)
                : false,
            scheduledOrderModificationWindowHours:
              scheduledOrderModificationWindowHours !== undefined
                ? parseInt(String(scheduledOrderModificationWindowHours))
                : 0,
            scheduledOrderAllowShallowModification:
              scheduledOrderAllowShallowModification !== undefined
                ? Boolean(scheduledOrderAllowShallowModification)
                : false,

            scheduledOrderAutoConfirm:
              scheduledOrderAutoConfirm !== undefined
                ? Boolean(scheduledOrderAutoConfirm)
                : true,

            scheduledOrderMinimumAmount:
              scheduledOrderMinimumAmount !== undefined &&
              scheduledOrderMinimumAmount !== null &&
              scheduledOrderMinimumAmount !== ""
                ? parseFloat(String(scheduledOrderMinimumAmount))
                : 0,

            // Scheduled Order Time Slot / Capacity
            scheduledOrderTimeSlotInterval:
              scheduledOrderTimeSlotInterval !== undefined
                ? parseInt(String(scheduledOrderTimeSlotInterval))
                : 30,
            scheduledOrderMaxOrdersPerSlot:
              scheduledOrderMaxOrdersPerSlot === null ||
              scheduledOrderMaxOrdersPerSlot === "" ||
              scheduledOrderMaxOrdersPerSlot === undefined
                ? null
                : parseInt(String(scheduledOrderMaxOrdersPerSlot)),
          },
        });
      }

      await AuditLogService.writeSafe({
        action: "SETTINGS_UPDATE",
        entityType: "Settings",
        entityId: settings?.id || null,
        scope: { organizationId: null, branchId: null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existingSettings,
        after: settings,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        data: settings,
        message: "Settings updated successfully",
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update settings",
      });
    }
  };

  private resetSettings = async (req: Request, res: Response) => {
    try {
      const existingSettings = await this.prisma.settings.findFirst();

      const defaultSettings = {
        businessName: "Restaurant Name",
        businessEmail: "contact@restaurant.com",
        businessPhone: "+1234567890",
        businessAddress: "123 Main Street, City, State",
        taxPercentage: 8.5,
        serviceTaxPercentage: 0.0,
        deliveryTaxPercentage: 8.5,
        deliveryFee: 3.99,
        taxInclusive: false,
        enableMinimumOrder: false,
        minimumOrderAmount: 15.0,
        currency: "USD",
        orderPreparationTime: 30,
        maxOrderQuantity: 10,
        allowExcludeOptionalIngredients: true,
        deliveryRadius: 5.0,
        deliveryTimeEstimate: 45,
        enableFreeDelivery: false,
        freeDeliveryThreshold: 50.0,
        acceptCash: true,
        acceptCard: true,
        acceptOnlinePayment: true,
        acceptPayPal: false,
        appStatus: "LIVE" as AppStatus,
        // Future Order Scheduling (master)
        futureOrdersEnabled: false,
        // Future Order Settings
        enableFuturePickupOrders: false,
        futurePickupOrderDays: 0,
        enableFutureDeliveryOrders: false,
        futureDeliveryOrderDays: 0,
        // Scheduled Order Merge Settings
        allowScheduledOrderMerge: false,
        scheduledOrderMergeCutoffHours: 2,

        // Scheduled Order Management Settings (Cancellation/Modification/Refund)
        scheduledOrderAllowCancellation: false,
        scheduledOrderCancellationWindowHours: 0,
        scheduledOrderFullRefundHoursBefore: 24,
        scheduledOrderPartialRefundHoursBefore: 12,
        scheduledOrderNoRefundHoursBefore: 2,
        scheduledOrderPartialRefundPercentage: 50,
        scheduledOrderReducedRefundPercentage: 25,
        scheduledOrderAllowModification: false,
        scheduledOrderModificationWindowHours: 0,
        scheduledOrderAllowShallowModification: false,
        scheduledOrderAutoConfirm: true,
        scheduledOrderMinimumAmount: 0,
      };

      let settings;
      if (existingSettings) {
        settings = await this.prisma.settings.update({
          where: { id: existingSettings.id },
          data: defaultSettings,
        });
      } else {
        settings = await this.prisma.settings.create({
          data: defaultSettings,
        });
      }

      res.json({
        success: true,
        data: settings,
        message: "Settings reset to defaults successfully",
      });
    } catch (error) {
      console.error("Error resetting settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reset settings",
      });
    }
  };

  // ==================== ORGANIZATION VALIDATION METHODS ====================

  // Get all organizations with validation status
  private getOrganizationsWithValidation = async (req: RBACRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, search, status } = req.query;
      
      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const where: any = {};

      // Apply search filter - search works across all statuses
      if (search && typeof search === "string") {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { organizationNumber: { contains: search, mode: "insensitive" } },
        ];
      }

      // Note: Status filtering is handled at the JavaScript level (below)
      // to properly handle "expired" and "grace_period" logic based on dates

      const organizationsRaw = await this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          organizationNumber: true,
          isActive: true,
          isValidated: true,
          validatedAt: true,
          validatedBy: true,
          validationExpiresAt: true,
          validationNotes: true,
          gracePeriodEndsAt: true,
          maxActiveBranches: true,
          freeVersion: true,
          reservationsAllowed: true,
          onlinePaymentsAllowed: true,
          cardPaymentsAllowed: true,
          paypalAllowed: true,
          vouchersAllowed: true,
          createdAt: true,
          updatedAt: true,
          validations: {
            orderBy: { validatedAt: "desc" },
            take: 5,
          },
          validationPayments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          _count: {
            select: {
              branches: true,
              validations: true,
              validationPayments: true,
            },
          },
        },
      });

      const now = new Date();
      const organizationsFiltered = organizationsRaw.filter((org) => {
        // When searching, return all matching organizations regardless of status
        if (search && typeof search === "string") return true;

        // Otherwise apply status filtering
        if (!status || typeof status !== "string" || status === "all") return true;
        if (status === "inactive") return org.isActive === false;
        if (status === "unvalidated") return org.isValidated === false;

        const latestValidation = org.validations && org.validations.length > 0 ? org.validations[0] : null;
        const expiresAt = latestValidation?.expiresAt
          ? new Date(latestValidation.expiresAt)
          : org.validationExpiresAt
            ? new Date(org.validationExpiresAt)
            : null;
        const gracePeriodEndsAt = latestValidation?.gracePeriodEndsAt
          ? new Date(latestValidation.gracePeriodEndsAt)
          : org.gracePeriodEndsAt
            ? new Date(org.gracePeriodEndsAt)
            : null;

        // If we don't have an expiresAt we can't classify into these buckets
        if (!expiresAt) return false;

        const isCurrentlyValid = now <= expiresAt;
        const isInGracePeriod = !isCurrentlyValid && !!gracePeriodEndsAt && now <= gracePeriodEndsAt;
        const isExpired = !isCurrentlyValid && !isInGracePeriod;

        if (status === "validated") return org.isValidated === true && isCurrentlyValid;
        if (status === "grace_period") return org.isValidated === true && isInGracePeriod;
        if (status === "expired") return org.isValidated === true && isExpired;

        return true;
      });

      const total = organizationsFiltered.length;
      const organizations = organizationsFiltered.slice(skip, skip + take);

      res.json({
        success: true,
        data: organizations,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error("Error fetching organizations with validation:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch organizations",
      });
    }
  };

  // Get organization validation details
  private getOrganizationValidation = async (req: RBACRequest, res: Response): Promise<Response> => {
    try {
      const { organizationId } = req.params;

      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          validations: {
            orderBy: { validatedAt: "desc" },
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
          validationPayments: {
            orderBy: { createdAt: "desc" },
          },
          branches: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          error: "Organization not found",
        });
      }

      return res.json({
        success: true,
        data: organization,
      });
    } catch (error: any) {
      console.error("Error fetching organization validation:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch organization validation",
      });
    }
  };

  // Create or update organization validation
  private createValidation = async (req: RBACRequest, res: Response): Promise<Response> => {
    try {
      const { organizationId } = req.params;
      const { expiresAt, amount, currency = "USD", paymentMethod, paymentStatus, notes } = req.body;
      const userId = req.rbacUser?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          error: "Organization not found",
        });
      }

      // Parse and validate expiration date
      const expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid expiration date format",
        });
      }

      // Calculate grace period end date (7 days after expiration)
      const gracePeriodEndsAt = new Date(expirationDate);
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 7);

      // Create validation record
      const validation = await this.prisma.organizationValidation.create({
        data: {
          organizationId,
          validatedBy: userId,
          expiresAt: expirationDate,
          gracePeriodEndsAt,
          notes,
        },
      });

      // Create payment record if amount provided
      let payment = null;
      if (amount && amount > 0) {
        // Convert payment method to uppercase enum value
        const paymentMethodEnum = (paymentMethod || "cash").toUpperCase();
        
        const paymentData: any = {
          organizationId,
          validationId: validation.id,
          amount,
          currency,
          paymentMethod: paymentMethodEnum,
          validFrom: new Date(),
          validUntil: expirationDate,
          notes: `Payment for validation until ${expirationDate.toISOString().split('T')[0]}`,
        };

        // Add payment status if provided
        if (paymentStatus) {
          paymentData.paymentStatus = paymentStatus.toUpperCase();
          // Set paidAt date when status is PAID
          if (paymentStatus.toUpperCase() === "PAID") {
            paymentData.paidAt = new Date();
          }
        } else {
          // Default to PENDING if not specified
          paymentData.paymentStatus = "PENDING";
        }

        payment = await this.prisma.validationPayment.create({
          data: paymentData,
        });
      }

      // Update organization validation status
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          isValidated: true,
          validatedAt: new Date(),
          validatedBy: userId,
          validationExpiresAt: expirationDate,
          validationNotes: notes,
          gracePeriodEndsAt,
        },
      });

      // Log the action
      await AuditLogService.write({
        action: "VALIDATE_ORGANIZATION",
        entityType: "Organization",
        entityId: organizationId,
        scope: { organizationId },
        actor: { userId },
        before: { isValidated: organization.isValidated },
        after: { isValidated: true, validationExpiresAt: expirationDate },
        metadata: {
          validationId: validation.id,
          expiresAt: expirationDate,
          amount,
          paymentId: payment?.id,
        },
      });

      return res.json({
        success: true,
        data: {
          validation,
          payment,
        },
        message: "Organization validated successfully",
      });
    } catch (error: any) {
      console.error("Error creating validation:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to create validation",
      });
    }
  };

  // Update validation
  private updateValidation = async (req: RBACRequest, res: Response): Promise<Response> => {
    try {
      const { organizationId, validationId } = req.params;
      const { expiresAt, amount, currency = "USD", paymentMethod, paymentStatus, notes } = req.body;
      const userId = req.rbacUser?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          error: "Organization not found",
        });
      }

      // Find existing validation
      const existingValidation = await this.prisma.organizationValidation.findUnique({
        where: { id: validationId },
      });

      if (!existingValidation) {
        return res.status(404).json({
          success: false,
          error: "Validation not found",
        });
      }

      // Verify validation belongs to the specified organization
      if (existingValidation.organizationId !== organizationId) {
        return res.status(400).json({
          success: false,
          error: "Validation does not belong to the specified organization",
        });
      }

      // Parse and validate expiration date
      const expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid expiration date format",
        });
      }

      // Calculate grace period end date (7 days after expiration)
      const gracePeriodEndsAt = new Date(expirationDate);
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 7);

      // Store old values for audit
      const oldValues = {
        expiresAt: existingValidation.expiresAt,
        gracePeriodEndsAt: existingValidation.gracePeriodEndsAt,
        notes: existingValidation.notes,
      };

      // Update validation
      const validation = await this.prisma.organizationValidation.update({
        where: { id: validationId },
        data: {
          expiresAt: expirationDate,
          gracePeriodEndsAt,
          notes: notes || null,
        },
      });

      // Update or create payment record if amount provided
      let payment = null;
      if (amount && amount > 0) {
        // Check if payment record already exists
        const existingPayment = await this.prisma.validationPayment.findFirst({
          where: {
            organizationId,
            validationId: validation.id,
          },
        });

        const paymentData: any = {
          amount,
          currency,
          paymentMethod: (paymentMethod || "cash").toUpperCase(),
          validFrom: new Date(),
          validUntil: expirationDate,
          notes: `Updated payment for validation until ${expirationDate.toISOString().split('T')[0]}`,
        };

        // Add payment status if provided
        if (paymentStatus) {
          paymentData.paymentStatus = paymentStatus.toUpperCase();
          // Set paidAt date when status is changed to PAID
          if (paymentStatus.toUpperCase() === "PAID" && existingPayment?.paymentStatus !== "PAID") {
            paymentData.paidAt = new Date();
          }
        }

        if (existingPayment) {
          // Update existing payment
          payment = await this.prisma.validationPayment.update({
            where: { id: existingPayment.id },
            data: paymentData,
          });
        } else {
          // Create new payment record
          payment = await this.prisma.validationPayment.create({
            data: {
              organizationId,
              validationId: validation.id,
              ...paymentData,
              notes: `Payment for validation until ${expirationDate.toISOString().split('T')[0]}`,
            },
          });
        }
      }

      // Write audit log
      await AuditLogService.write({
        action: "UPDATE_VALIDATION",
        entityType: "OrganizationValidation",
        entityId: validation.id,
        scope: { organizationId },
        actor: { userId },
        before: oldValues,
        after: {
          expiresAt: validation.expiresAt,
          gracePeriodEndsAt: validation.gracePeriodEndsAt,
          notes: validation.notes,
        },
      });

      return res.json({
        success: true,
        data: {
          validation,
          payment,
        },
        message: "Validation updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating validation:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update validation",
      });
    }
  };

  // Unvalidate validation (temporary - for non-payment scenarios)
  private unvalidateValidation = async (req: RBACRequest, res: Response): Promise<Response> => {
    try {
      const { organizationId, validationId } = req.params;
      const userId = req.rbacUser?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      // Find existing validation
      const existingValidation = await this.prisma.organizationValidation.findUnique({
        where: { id: validationId },
      });

      if (!existingValidation) {
        return res.status(404).json({
          success: false,
          error: "Validation not found",
        });
      }

      // Verify validation belongs to the specified organization
      if (existingValidation.organizationId !== organizationId) {
        return res.status(400).json({
          success: false,
          error: "Validation does not belong to the specified organization",
        });
      }

      // Store old values for audit
      const oldValues = {
        isValidated: existingValidation.isActive,
        unvalidatedAt: existingValidation.unvalidatedAt,
      };

      // Temporarily unvalidate the validation (set isActive to false, but keep the record)
      const validation = await this.prisma.organizationValidation.update({
        where: { id: validationId },
        data: {
          isActive: false,
          unvalidatedAt: new Date(),
          unvalidatedBy: userId,
        },
      });

      // Update organization validation status to unvalidated
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          isValidated: false,
          validatedAt: null,
          validatedBy: null,
        },
      });

      // Write audit log
      await AuditLogService.write({
        action: "UNVALIDATE_ORGANIZATION",
        entityType: "OrganizationValidation",
        entityId: validation.id,
        scope: { organizationId },
        actor: { userId },
        before: oldValues,
        after: {
          isValidated: false,
          unvalidatedAt: validation.unvalidatedAt,
        },
      });

      return res.json({
        success: true,
        data: validation,
        message: "Organization temporarily unvalidated. Validation can be re-activated when payment is received.",
      });
    } catch (error: any) {
      console.error("Error unvalidating validation:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to unvalidate validation",
      });
    }
  };

  // Reactivate validation (restore temporarily unvalidated validation)
  private reactivateValidation = async (req: RBACRequest, res: Response): Promise<Response> => {
    try {
      const { organizationId, validationId } = req.params;
      const userId = req.rbacUser?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      // Find existing validation
      const existingValidation = await this.prisma.organizationValidation.findUnique({
        where: { id: validationId },
      });

      if (!existingValidation) {
        return res.status(404).json({
          success: false,
          error: "Validation not found",
        });
      }

      // Verify validation belongs to the specified organization
      if (existingValidation.organizationId !== organizationId) {
        return res.status(400).json({
          success: false,
          error: "Validation does not belong to the specified organization",
        });
      }

      // Check if validation was temporarily unvalidated
      if (existingValidation.isActive !== false || !existingValidation.unvalidatedAt) {
        return res.status(400).json({
          success: false,
          error: "Validation was not temporarily unvalidated",
        });
      }

      // Store old values for audit
      const oldValues = {
        isActive: existingValidation.isActive,
        unvalidatedAt: existingValidation.unvalidatedAt,
      };

      // Reactivate the validation
      const validation = await this.prisma.organizationValidation.update({
        where: { id: validationId },
        data: {
          isActive: true,
          unvalidatedAt: null,
          unvalidatedBy: null,
        },
      });

      // Update organization validation status back to validated
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          isValidated: true,
          validatedAt: existingValidation.validatedAt,
          validatedBy: existingValidation.validatedBy,
        },
      });

      // Write audit log
      await AuditLogService.write({
        action: "REACTIVATE_VALIDATION",
        entityType: "OrganizationValidation",
        entityId: validation.id,
        scope: { organizationId },
        actor: { userId },
        before: oldValues,
        after: {
          isActive: true,
          unvalidatedAt: null,
        },
      });

      return res.json({
        success: true,
        data: validation,
        message: "Validation reactivated successfully. Organization services have been restored.",
      });
    } catch (error: any) {
      console.error("Error reactivating validation:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to reactivate validation",
      });
    }
  };

  // Check if organization is currently valid (for customer-facing queries)
  private checkOrganizationValidity = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { organizationId } = req.params;
      const now = new Date();

      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          isValidated: true,
          validationExpiresAt: true,
          gracePeriodEndsAt: true,
        },
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          error: "Organization not found",
        });
      }

      let isValid = false;
      let status: "valid" | "expired" | "grace_period" | "unvalidated" = "unvalidated";

      if (organization.isValidated && organization.validationExpiresAt) {
        if (now <= organization.validationExpiresAt) {
          isValid = true;
          status = "valid";
        } else if (organization.gracePeriodEndsAt && now <= organization.gracePeriodEndsAt) {
          isValid = true; // Still valid during grace period
          status = "grace_period";
        } else {
          status = "expired";
        }
      }

      return res.json({
        success: true,
        data: {
          isValid,
          status,
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          validationDetails: {
            isValidated: organization.isValidated,
            validationExpiresAt: organization.validationExpiresAt,
            gracePeriodEndsAt: organization.gracePeriodEndsAt,
          },
        },
      });
    } catch (error: any) {
      console.error("Error checking organization validity:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to check organization validity",
      });
    }
  };
}

export default AdminRoutes;
