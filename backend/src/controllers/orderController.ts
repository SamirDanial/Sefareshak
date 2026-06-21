import { Request, Response } from "express";
import DatabaseSingleton from "../config/database";
import { PrismaClient } from "@prisma/client";
import { BranchService } from "../services/branchService";
import type { AuthenticatedRequest } from "../types";
import RBACMiddleware, { type RBACRequest } from "../middleware/rbac";
import { type OrganizationContextRequest } from "../middleware/organizationContext";
import { hasImplicitFullAccess } from "../config/permissions";
import {
  getNearestSmallerAddonSize,
  getAddonPriceForMealSize,
} from "../utils/sizeMatcher";
import PaymentService from "../services/paymentService";
import TaxCalculator from "../utils/taxCalculator";
import WebSocketService from "../services/websocketService";
import Stripe from "stripe";
import PayPalRefundService from "../services/paypalRefundService";
import {
  PaymentMethod,
  PaymentProvider,
  PaymentState,
  PaymentStatus,
  SizeType,
} from "@prisma/client";
import { validateOrderTypeTransition } from "../utils/orderValidation";
import { validateCartItemsForBranch } from "../utils/cartBranchValidation";
import { getMealBasePrice } from "../utils/mealPriceHelper";
import { getAddonBasePrice } from "../utils/addonPriceHelper";
import { calculateOrderTotals, applyDiscount, computeItemAdjustments } from "../utils/orderCalculator";
import { deliverableQuantityService } from "../services/deliverableQuantityService";
import BusinessDayService from "../services/businessDayService";
import FiskalyService from "../services/fiskalyService";
import FiscalQueueWorker from "../services/fiscalQueueWorker";
import {
  getFiskalyConfigSnapshot,
  shouldFiscalize,
} from "../utils/fiscalization";
import tabletOrderNotificationService from "../services/tabletOrderNotificationService";
import { createBillSnapshot } from "../utils/billSnapshot";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export class OrderController {
  private businessDayService = BusinessDayService.getInstance();

  // Get receipt payload for the authenticated customer (owner-only)
  public getMyOrderReceiptPayload = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: "orderId is required" });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;

      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              organizationId: true,
              organization: {
                select: {
                  name: true,
                  settings: {
                    select: {
                      businessName: true,
                    },
                  },
                },
              },
              address: true,
              city: true,
              state: true,
              country: true,
              zipCode: true,
              businessAddress: true,
              businessPhone: true,
              currency: true,
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
          orderItems: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  image: true,
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
                    },
                  },
                },
              },
              orderItemAddOns: true,
              orderItemOptionalIngredients: true,
            },
          },
          fiscalTransaction: {
            select: {
              id: true,
              status: true,
              clientTransactionId: true,
              tssTransactionId: true,
              startedAt: true,
              finishedAt: true,
              signaturePayload: true,
            },
          },
        },
      });

      // Return 404 for not-found OR not-owned to avoid leaking existence.
      if (!order || String((order as any).userId || "") !== String(req.user.id)) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      const fiskalyCorrections = (order as any)?.fiscalTransaction?.id
        ? await (db.getPrisma() as any).fiscalTransactionCorrection.findMany({
            where: {
              fiscalTransactionId: String((order as any).fiscalTransaction.id),
            },
            select: {
              id: true,
              type: true,
              status: true,
              refundId: true,
              amount: true,
              currency: true,
              signaturePayload: true,
              errorCode: true,
              errorMessage: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : [];

      res.json({
        success: true,
        data: {
          order,
          fiskaly: (order as any).fiscalTransaction
            ? {
                status: (order as any).fiscalTransaction.status,
                signaturePayload: (order as any).fiscalTransaction.signaturePayload,
              }
            : null,
          fiskalyCorrections,
        },
      });
    } catch (error) {
      console.error("Error fetching customer receipt payload:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch receipt payload" });
    }
  };

  private parseTicketPayload(raw: any): any {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw;
  }

  private async computeFulfillmentReadiness(prisma: any, orderId: string): Promise<{
    requiredKitchen: boolean;
    requiredBar: boolean;
    kitchenReady: boolean;
    barReady: boolean;
    missingDepartments: Array<"KITCHEN" | "BAR">;
  }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        branchId: true,
        orderItems: {
          select: {
            meal: { select: { isDrink: true } },
          },
        },
      },
    });

    const items = Array.isArray((order as any)?.orderItems) ? ((order as any).orderItems as any[]) : [];
    const hasDrinkItems = items.some((it) => Boolean(it?.meal?.isDrink));
    const hasFoodItems = items.some((it) => it?.meal && it?.meal?.isDrink === false);

    const requiredKitchen = hasFoodItems;
    const requiredBar = hasDrinkItems;

    const branchId = String((order as any)?.branchId || "").trim();
    if (!branchId) {
      const missingDepartments: Array<"KITCHEN" | "BAR"> = [];
      if (requiredKitchen) missingDepartments.push("KITCHEN");
      if (requiredBar) missingDepartments.push("BAR");
      return {
        requiredKitchen,
        requiredBar,
        kitchenReady: !requiredKitchen,
        barReady: !requiredBar,
        missingDepartments,
      };

    }

    // Tickets are stored in KitchenTicket table; Bar will reuse it with ticket.items.source='bar_*'
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tickets = await prisma.kitchenTicket.findMany({
      where: {
        branchId,
        createdAt: { gte: since },
      },
      select: { id: true, status: true, items: true },
    });

    const relevantTickets = Array.isArray(tickets)
      ? tickets.filter((t: any) => {
          const payload = this.parseTicketPayload(t?.items);
          return String(payload?.orderId || "").trim() === String(orderId);
        })
      : [];

    const isKitchenTicket = (t: any): boolean => {
      const payload = this.parseTicketPayload(t?.items);
      const source = String(payload?.source || "").trim().toLowerCase();
      return source === "pickup" || source === "delivery" || source === "waiter_submit";
    };
    const isBarTicket = (t: any): boolean => {
      const payload = this.parseTicketPayload(t?.items);
      const source = String(payload?.source || "").trim().toLowerCase();
      return source.startsWith("bar_");
    };

    const kitchenTickets = relevantTickets.filter(isKitchenTicket);
    const barTickets = relevantTickets.filter(isBarTicket);

    const kitchenReady =
      !requiredKitchen ||
      (kitchenTickets.length > 0 &&
        kitchenTickets.every((t: any) => String(t?.status || "").trim().toUpperCase() === "READY"));

    const barReady =
      !requiredBar ||
      (barTickets.length > 0 && barTickets.every((t: any) => String(t?.status || "").trim().toUpperCase() === "READY"));

    const missingDepartments: Array<"KITCHEN" | "BAR"> = [];
    if (!kitchenReady) missingDepartments.push("KITCHEN");
    if (!barReady) missingDepartments.push("BAR");

    return {
      requiredKitchen,
      requiredBar,
      kitchenReady,
      barReady,
      missingDepartments,
    };
  }

  private getEndOfScheduledLocalDay(scheduledDate: Date): Date {
    return new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      23,
      59,
      59,
      999
    );
  }

  private async ensureOrderEditableByBusinessDay(prisma: PrismaClient, orderId: string) {
    const order = await (prisma as any).order.findUnique({
      where: { id: orderId },
      select: {
        businessDaySessionId: true,
        isScheduledOrder: true,
        scheduledDate: true,
        status: true,
        paymentStatus: true,
        postedAt: true,
      },
    });

    const sessionId = (order as any)?.businessDaySessionId as string | null | undefined;
    if (!sessionId) return { ok: true, allowPaymentStatusChange: true } as const;

    const session = await (prisma as any).businessDaySession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (session?.status !== "CLOSED") {
      return { ok: true, allowPaymentStatusChange: true } as const;
    }

    const isScheduled = Boolean((order as any)?.isScheduledOrder);
    if (!isScheduled) {
      return {
        ok: false,
        error:
          "This order belongs to a closed business day and cannot be edited. Create an adjustment instead.",
        code: "BUSINESS_DAY_CLOSED" as const,
      };
    }

    const paymentStatus = String((order as any)?.paymentStatus || "");
    const postedAt = (order as any)?.postedAt as Date | null | undefined;
    const isFiscallyPosted = Boolean(postedAt) && paymentStatus !== "PENDING";

    const status = String((order as any)?.status || "");
    if (status === "DELIVERED" || status === "PICKED_UP" || status === "CANCELLED") {
      return {
        ok: false,
        error: "This scheduled order is finalized and can no longer be changed.",
        code: "SCHEDULED_ORDER_FINALIZED" as const,
      };
    }

    const scheduledDateRaw = (order as any)?.scheduledDate as Date | null | undefined;
    // Removed due date check to allow editing future orders even after due date passes
    // if (scheduledDateRaw && isFiscallyPosted) {
    //   const endOfDay = this.getEndOfScheduledLocalDay(new Date(scheduledDateRaw));
    //   const now = new Date();
    //   if (now.getTime() > endOfDay.getTime()) {
    //     return {
    //       ok: false,
    //       error: "This scheduled order is past its scheduled day and can no longer be changed.",
    //       code: "SCHEDULED_ORDER_PAST_DUE" as const,
    //     };
    //   }
    // }

    // Scheduled orders that were fiscally posted into a closed business day can still be
    // operationally updated (e.g. delivered/picked up/cancelled) until their scheduled day ends.
    // Payment state changes must be handled via adjustments/refunds, not by editing the order.
    if (isFiscallyPosted) {
      return { ok: true, allowPaymentStatusChange: false } as const;
    }

    // If the scheduled order was never fiscally posted (e.g. cash scheduled and still pending),
    // it must remain operable even if its scheduled day has passed.
    return { ok: true, allowPaymentStatusChange: true } as const;
  }
  private getOrderPaymentSources(order: any):
    | { provider: "STRIPE"; paymentIntentId: string; amount?: number }[]
    | { provider: "PAYPAL"; captureId: string; amount?: number }[]
    | [] {
    const sources: any[] = [];

    const history = (order?.history as any[]) || [];
    for (const h of history) {
      if (h?.type === "PAYMENT_CAPTURED" && h?.details) {
        const provider = String(h.details.provider || "").toUpperCase();
        // Infer STRIPE if providerPaymentId looks like a Stripe PI (starts with "pi_") or no explicit provider
        const hasStripeId = h.details.providerPaymentId && 
          (String(h.details.providerPaymentId).startsWith("pi_") || provider === "STRIPE" || !provider);
        
        if (hasStripeId && h.details.providerPaymentId) {
          sources.push({
            provider: "STRIPE",
            paymentIntentId: String(h.details.providerPaymentId),
            amount:
              h.details.amount !== undefined && h.details.amount !== null
                ? Number(h.details.amount)
                : undefined,
          });
        } else if (provider === "PAYPAL" && h.details.providerChargeId) {
          sources.push({
            provider: "PAYPAL",
            captureId: String(h.details.providerChargeId),
            amount:
              h.details.amount !== undefined && h.details.amount !== null
                ? Number(h.details.amount)
                : undefined,
          });
        }
      }
    }

    const currentProvider = String(
      order?.payment?.paymentProvider || PaymentProvider.STRIPE
    ).toUpperCase();
    if (currentProvider === "STRIPE" && order?.paymentIntentId) {
      sources.push({
        provider: "STRIPE",
        paymentIntentId: String(order.paymentIntentId),
        amount:
          order?.payment?.amount !== undefined && order?.payment?.amount !== null
            ? Number(order.payment.amount)
            : undefined,
      });
    }
    if (currentProvider === "PAYPAL" && order?.payment?.providerChargeId) {
      sources.push({
        provider: "PAYPAL",
        captureId: String(order.payment.providerChargeId),
        amount:
          order?.payment?.amount !== undefined && order?.payment?.amount !== null
            ? Number(order.payment.amount)
            : undefined,
      });
    }

    const seen = new Set<string>();
    return sources.filter((s) => {
      const key = s.provider === "STRIPE" ? `S:${s.paymentIntentId}` : `P:${s.captureId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Get all orders (admin only)
  public getAllOrders = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { page = 1, limit = 10, status, paymentStatus, isScheduled, branchId, isPosOrder } = req.query;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(req.rbacUser.userType);

      // For non-superadmin staff, require a branchId and enforce assigned-branch scoping
      const branchIdStr = (branchId as string | undefined) || undefined;
      if (!isSuperAdmin) {
        if (!branchIdStr) {
          res.status(400).json({ success: false, error: "branchId is required" });
          return;
        }
        if (!req.rbacUser.assignedBranchIds.includes(branchIdStr)) {
          res.status(403).json({ success: false, error: "Access denied for this branch" });
          return;
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const where: any = {};

      if (branchIdStr) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchIdStr },
          select: { id: true, organizationId: true },
        });

        if (!branch || branch.organizationId !== organizationId) {
          res.status(404).json({ success: false, error: "Branch not found" });
          return;
        }

        where.branchId = branchIdStr;
      } else if (!isSuperAdmin) {
        // Should be unreachable due to the earlier guard, but be defensive
        where.branchId = "__none__";
      } else {
        where.branch = { organizationId };
      }

      if (status) {
        where.status = status;
      }
      if (paymentStatus) {
        where.paymentStatus = paymentStatus;
      }
      // Filter by scheduled/ASAP orders
      if (isScheduled === "scheduled") {
        where.isScheduledOrder = true;
      } else if (isScheduled === "asap") {
        where.isScheduledOrder = false;
      }
      // Filter by POS/Online orders
      // Normalize to string since query params can be parsed as string or boolean
      const isPosOrderStr = String(isPosOrder);
      if (isPosOrderStr === "true") {
        where.isPosOrder = true;
      } else if (isPosOrderStr === "false") {
        // Online orders: isPosOrder is false OR null (not set)
        where.OR = [
          { isPosOrder: false },
          { isPosOrder: null }
        ];
      }

      const [orders, total] = await Promise.all([
        db.getPrisma().order.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
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
            refunds: {
              select: {
                id: true,
                status: true,
                refundedBy: true,
                refundedAt: true,
                createdAt: true,
                amount: true,
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
        }),
        db.getPrisma().order.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch orders",
      });
    }
  };

  // Get receipt payload (for tablet printing)
  public getOrderReceiptPayload = async (
    req: any,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: "orderId is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;

      const order = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          totalAmount: true,
          currency: true,
          deliveryFee: true,
          taxAmount: true,
          itemTaxAmount: true,
          addonTaxAmount: true,
          deliveryTaxAmount: true,
          takeawayServiceFee: true,
          takeawayServiceTaxAmount: true,
          discountAmount: true,
          discountType: true,
          discountValue: true,
          voucherPaymentAmount: true,
          voucherCodes: true,
          voucherRemainingBalances: true,
          billSnapshot: true,
          createdAt: true,
          updatedAt: true,
          confirmedAt: true,
          preparationTime: true,
          orderType: true,
          isPosOrder: true,
          branchId: true,
          userId: true,
          branch: {
            select: {
              id: true,
              name: true,
              organizationId: true,
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
          orderItems: {
            select: {
              id: true,
              orderId: true,
              mealId: true,
              dealId: true,
              itemType: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              taxAmount: true,
              taxPercentage: true,
              selectedSize: true,
              mealSizeType: true,
              specialInstructions: true,
              itemDiscountType: true,
              itemDiscountValue: true,
              itemDiscountAmount: true,
              itemDiscountScope: true,
              itemSurchargeAmount: true,
              itemSurchargeScope: true,
              meal: {
                select: {
                  id: true,
                  name: true,
                  image: true,
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
                },
              },
              dealChildItems: {
                select: {
                  id: true,
                },
              },
              orderItemAddOns: {
                select: {
                  id: true,
                  orderItemId: true,
                  addon_id: true,
                  addOnName: true,
                  addOnPrice: true,
                  taxAmount: true,
                  taxPercentage: true,
                  addon_type: true,
                  addonSizeType: true,
                  quantity: true,
                  addon_description: true,
                },
              },
            },
          },
          fiscalTransaction: {
            select: {
              id: true,
              status: true,
              clientTransactionId: true,
              tssTransactionId: true,
              startedAt: true,
              finishedAt: true,
              signaturePayload: true,
            },
          },
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
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

  
      // Ensure org scoping for non-super-admins: organizationContext.resolve should have set req.organizationId
      const requestedOrgId = (req as any).organizationId as string | undefined;
      const orderOrgId = (order as any)?.branch?.organizationId as string | null | undefined;
     if (
        requestedOrgId &&
        orderOrgId &&
        String(requestedOrgId) !== String(orderOrgId)
      ) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      const correctionModel = (prisma as any)?.fiscalTransactionCorrection;
      const fiskalyCorrections =
        (order as any)?.fiscalTransaction?.id && correctionModel?.findMany
          ? await correctionModel.findMany({
              where: {
                fiscalTransactionId: String((order as any).fiscalTransaction.id),
              },
              select: {
                id: true,
                type: true,
                status: true,
                refundId: true,
                amount: true,
                currency: true,
                signaturePayload: true,
                errorCode: true,
                errorMessage: true,
                createdAt: true,
              },
              orderBy: { createdAt: "asc" },
            })
          : [];

      res.json({
        success: true,
        data: {
          order,
          fiskaly: (order as any).fiscalTransaction
            ? {
                status: (order as any).fiscalTransaction.status,
                signaturePayload: (order as any).fiscalTransaction.signaturePayload,
              }
            : null,
          fiskalyCorrections,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch receipt payload" });
    }
  };

  // Get refund receipt payload (for tablet printing)
  public getRefundReceiptPayload = async (
    req: any,
    res: Response
  ): Promise<void> => {
    try {
      const { refundId } = req.params;

      if (!refundId) {
        res.status(400).json({ success: false, error: "refundId is required" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;
      const refund = await prisma.refund.findUnique({
        where: { id: refundId },
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
          updatedAt: true,
          orderId: true,
          metadata: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              paymentStatus: true,
              paymentMethod: true,
              totalAmount: true,
              currency: true,
              deliveryFee: true,
              taxAmount: true,
              itemTaxAmount: true,
              addonTaxAmount: true,
              deliveryTaxAmount: true,
              takeawayServiceFee: true,
              takeawayServiceTaxAmount: true,
              discountAmount: true,
              discountType: true,
              discountValue: true,
              voucherPaymentAmount: true,
              voucherCodes: true,
              voucherRemainingBalances: true,
              billSnapshot: true,
              createdAt: true,
              updatedAt: true,
              confirmedAt: true,
              preparationTime: true,
              orderType: true,
              isPosOrder: true,
              branchId: true,
              userId: true,
              branch: {
                select: {
                  id: true,
                  name: true,
                  organizationId: true,
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
              orderItems: {
                select: {
                  id: true,
                  orderId: true,
                  mealId: true,
                  dealId: true,
                  itemType: true,
                  quantity: true,
                  unitPrice: true,
                  totalPrice: true,
                  taxAmount: true,
                  taxPercentage: true,
                  selectedSize: true,
                  mealSizeType: true,
                  specialInstructions: true,
                  itemDiscountType: true,
                  itemDiscountValue: true,
                  itemDiscountAmount: true,
                  itemDiscountScope: true,
                  itemSurchargeAmount: true,
                  itemSurchargeScope: true,
                  meal: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
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
                    },
                  },
                  dealChildItems: {
                    select: {
                      id: true,
                    },
                  },
                  orderItemAddOns: {
                    select: {
                      id: true,
                      orderItemId: true,
                      addon_id: true,
                      addOnName: true,
                      addOnPrice: true,
                      taxAmount: true,
                      taxPercentage: true,
                      addon_type: true,
                      addonSizeType: true,
                      quantity: true,
                      addon_description: true,
                    },
                  },
                },
              },
              fiscalTransaction: {
                select: {
                  id: true,
                  status: true,
                  clientTransactionId: true,
                  tssTransactionId: true,
                  startedAt: true,
                  finishedAt: true,
                  signaturePayload: true,
                },
              },
            },
          },
        },
      });

      if (!refund) {
        res.status(404).json({ success: false, error: "Refund not found" });
        return;
      }

      if (!refund.order) {
        res.status(404).json({ success: false, error: "Associated order not found" });
        return;
      }

      const order = refund.order;

      // Ensure org scoping for non-super-admins
      const requestedOrgId = (req as any).organizationId as string | undefined;
      const orderOrgId = order?.branch?.organizationId as string | null | undefined;
      if (
        requestedOrgId &&
        orderOrgId &&
        String(requestedOrgId) !== String(orderOrgId)
      ) {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }
      const correction = await prisma.fiscalTransactionCorrection.findUnique({
        where: { refundId: refundId },
        select: {
          id: true,
          type: true,
          status: true,
          refundId: true,
          amount: true,
          currency: true,
          signaturePayload: true,
          clientTransactionId: true,
          tssTransactionId: true,
          startedAt: true,
          finishedAt: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          fiscalTransactionId: true,
          fiscalTransaction: {
            select: {
              id: true,
              status: true,
              clientTransactionId: true,
              tssTransactionId: true,
              startedAt: true,
              finishedAt: true,
              signaturePayload: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: {
          refund,
          order,
          fiskalyCorrection: correction
            ? {
                status: correction.status,
                signaturePayload: correction.signaturePayload,
                clientTransactionId: correction.clientTransactionId,
                tssTransactionId: correction.tssTransactionId,
                startedAt: correction.startedAt,
                finishedAt: correction.finishedAt,
              }
            : null,
          originalFiskaly: order.fiscalTransaction
            ? {
                status: order.fiscalTransaction.status,
                signaturePayload: order.fiscalTransaction.signaturePayload,
                clientTransactionId: order.fiscalTransaction.clientTransactionId,
                tssTransactionId: order.fiscalTransaction.tssTransactionId,
                startedAt: order.fiscalTransaction.startedAt,
                finishedAt: order.fiscalTransaction.finishedAt,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Error fetching refund receipt payload:", error);
      res.status(500).json({ success: false, error: "Failed to fetch refund receipt payload" });
    }
  };

  // Get dispatch orders (dispatch module)
  // Similar to getAllOrders, but intended for DISPATCH:view users.
  public getDispatchOrders = async (req: RBACRequest, res: Response): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { page = 1, limit = 10, status, paymentStatus, isScheduled, branchId } = req.query;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(req.rbacUser.userType);
      const branchIdStr = (branchId as string | undefined) || undefined;

      // For non-superadmin staff, require a branchId and enforce assigned-branch scoping.
      if (!isSuperAdmin) {
        if (!branchIdStr) {
          res.status(400).json({ success: false, error: "branchId is required" });
          return;
        }
        if (!req.rbacUser.assignedBranchIds.includes(branchIdStr)) {
          res.status(403).json({ success: false, error: "Access denied for this branch" });
          return;
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const where: any = {};

      if (branchIdStr) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchIdStr },
          select: { id: true, organizationId: true },
        });

        if (!branch || branch.organizationId !== organizationId) {
          res.status(404).json({ success: false, error: "Branch not found" });
          return;
        }

        where.branchId = branchIdStr;
      } else if (!isSuperAdmin) {
        where.branchId = "__none__";
      } else {
        where.branch = { organizationId };
      }

      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (isScheduled === "scheduled") {
        where.isScheduledOrder = true;
      } else if (isScheduled === "asap") {
        where.isScheduledOrder = false;
      }

      const [orders, total] = await Promise.all([
        db.getPrisma().order.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
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
            refunds: {
              select: {
                id: true,
                status: true,
                refundedBy: true,
                refundedAt: true,
                createdAt: true,
                amount: true,
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
        }),
        db.getPrisma().order.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching dispatch orders:", error);
      res.status(500).json({ success: false, error: "Failed to fetch orders" });
    }
  };

  // Get order by ID
  public getOrderById = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();

      const order = await db.getPrisma().order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          totalAmount: true,
          currency: true,
          deliveryFee: true,
          taxAmount: true,
          itemTaxAmount: true,
          addonTaxAmount: true,
          deliveryTaxAmount: true,
          takeawayServiceFee: true,
          takeawayServiceTaxAmount: true,
          discountAmount: true,
          discountType: true,
          discountValue: true,
          voucherPaymentAmount: true,
          voucherCodes: true,
          voucherRemainingBalances: true,
          billSnapshot: true,
          createdAt: true,
          updatedAt: true,
          confirmedAt: true,
          preparationTime: true,
          orderType: true,
          isPosOrder: true,
          branchId: true,
          userId: true,
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
          orderItems: {
            select: {
              id: true,
              orderId: true,
              mealId: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              taxAmount: true,
              taxPercentage: true,
              selectedSize: true,
              mealSizeType: true,
              specialInstructions: true,
              itemDiscountType: true,
              itemDiscountValue: true,
              itemDiscountAmount: true,
              itemDiscountScope: true,
              itemSurchargeAmount: true,
              itemSurchargeScope: true,
              itemType: true,
              dealId: true,
              createdAt: true,
              updatedAt: true,
              meal: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  image: true,
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
                select: {
                  id: true,
                },
              },
              orderItemAddOns: {
                select: {
                  id: true,
                  orderItemId: true,
                  addon_id: true,
                  addon: {
                    select: {
                      id: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
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
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      const editable = await this.ensureOrderEditableByBusinessDay(db.getPrisma() as any, id);
      if (!editable.ok) {
        res.status(400).json({ success: false, error: editable.error, code: editable.code });
        return;
      }

      // If admin is viewing the order, mark notification as seen
      if (req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN") {
        const updatedNotifications = await db
          .getPrisma()
          .notification.updateMany({
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
            notificationId: "", // Not available in updateMany, but orderId is sufficient
            isSeen: true,
            seenAt: new Date(),
          });
        }
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order",
      });
    }
  };

  // Get user's active order (for merge check)
  public getActiveOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      // Find orders that are in states before OUT_FOR_DELIVERY/completed
      // Eligible states: CONFIRMED, PREPARING, READY_FOR_DELIVERY, READY_FOR_PICKUP, PENDING
      const activeOrder = await db.getPrisma().order.findFirst({
        where: {
          userId: req.user?.id,
          status: {
            in: [
              "PENDING",
              "CONFIRMED",
              "PREPARING",
              "READY_FOR_DELIVERY",
              "READY_FOR_PICKUP",
            ],
          },
        },
        include: {
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
          payment: {
            select: {
              paymentProvider: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        data: {
          hasActiveOrder: !!activeOrder,
          activeOrder: activeOrder || null,
        },
      });
    } catch (error) {
      console.error("Error fetching active order:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch active order",
      });
    }
  };

  // Get user's orders
  public getUserOrders = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { page = 1, limit = 10, status } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const where: any = { userId: req.user?.id };

      if (status) {
        where.status = status;
      }

      const [orders, total] = await Promise.all([
        db.getPrisma().order.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            orderType: true,
            totalAmount: true,
            deliveryFee: true,
            takeawayServiceFee: true,
            takeawayServiceTaxPercentage: true,
            takeawayServiceTaxAmount: true,
            taxAmount: true,
            itemTaxAmount: true,
            addonTaxAmount: true,
            deliveryTaxAmount: true,
            currency: true,
            paymentIntentId: true,
            deliveryAddress: true,
            deliveryStreetAddress: true,
            deliveryHouseNumber: true,
            deliveryPostalCode: true,
            deliveryBuilding: true,
            deliveryFloor: true,
            deliveryApartment: true,
            deliveryExtraDetails: true,
            deliveryPhone: true,
            deliveryNotes: true,
            pickupPhone: true,
            pickupNotes: true,
            guestName: true,
            guestEmail: true,
            guestPhone: true,
            createdAt: true,
            updatedAt: true,
            scheduledDate: true,
            isScheduledOrder: true,
            preparationTime: true,
            confirmedAt: true,
            isMerged: true,
            mergedAt: true,
            branchId: true,
            taxInclusive: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
            orderItems: {
              select: {
                id: true,
                itemType: true,
                parentDealItemId: true,
                quantity: true,
                unitPrice: true,
                totalPrice: true,
                selectedSize: true,
                specialInstructions: true,
                taxAmount: true,
                taxPercentage: true,
                meal: {
                  select: {
                    id: true,
                    name: true,
                    basePrice: true,
                    image: true,
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
                  select: {
                    id: true,
                    quantity: true,
                    unitPrice: true,
                    totalPrice: true,
                    taxAmount: true,
                    taxPercentage: true,
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
                orderItemAddOns: true,
                orderItemOptionalIngredients: {
                  select: {
                    id: true,
                    optionalIngredientId: true,
                    isIncluded: true,
                    ingredientName: true,
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
        }),
        db.getPrisma().order.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching user orders:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user orders",
      });
    }
  };

  // Update order status (admin only)
  public updateOrderStatus = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status, paymentStatus } = req.body;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      if (!status && !paymentStatus) {
        res.status(400).json({
          success: false,
          error: "At least one status field is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const updateData: any = {};

      if (status) {
        updateData.status = status;
      }
      if (paymentStatus) {
        updateData.paymentStatus = paymentStatus;
      }

      // Fetch current order to validate transitions
      const currentOrder = await (prisma as any).order.findUnique({
        where: { id },
        select: {
          status: true,
          orderType: true,
          businessDaySessionId: true,
          paymentMethod: true,
          paymentStatus: true,
          postedAt: true,
          branchId: true,
          confirmedAt: true,
          totalAmount: true,
          currency: true,
          orderNumber: true,
          voucherPaymentAmount: true,
          voucherCodes: true,
        },
      });

      if (!currentOrder) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      const branchIdForOrder = (currentOrder as any).branchId as string | null | undefined;
      if (!branchIdForOrder) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      const orderBranch = await (prisma as any).branch.findUnique({
        where: { id: branchIdForOrder },
        select: { id: true, organizationId: true },
      });

      if (!orderBranch || orderBranch.organizationId !== organizationId) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      const fiskalyConfig = await getFiskalyConfigSnapshot(prisma as any, organizationId);
      if (shouldFiscalize(fiskalyConfig)) {
        const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
        const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

        if (!headerDeviceId) {
          res.status(403).json({
            success: false,
            error: "POS device selection is required.",
            code: "POS_DEVICE_REQUIRED" as const,
            data: {
              hasHeader: rawDeviceId !== undefined && rawDeviceId !== null,
            },
          });
          return;
        }

        const device = await (prisma as any).posDevice.findFirst({
          where: {
            id: headerDeviceId,
            organizationId,
            branchId: branchIdForOrder,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        });

        if (!device?.id) {
          res.status(403).json({
            success: false,
            error: "Selected POS device is not available for this branch.",
            code: "POS_DEVICE_REQUIRED" as const,
            data: {
              deviceId: headerDeviceId,
              branchId: branchIdForOrder,
            },
          });
          return;
        }
      }

      // If this request would finalize the order as PAID + (DELIVERED/PICKED_UP),
      // fiskaly fiscalization becomes mandatory (must not be swallowed).
      try {
        const nextStatus = String(status ?? (currentOrder as any).status);
        const nextPaymentStatus = String(paymentStatus ?? (currentOrder as any).paymentStatus);
        const isFulfilled = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
        const isPaid = nextPaymentStatus === "PAID";
        const shouldPost = isPaid && isFulfilled;

        if (shouldPost) {
          const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
          if (shouldFiscalize(config) && String(config?.environment || "").toUpperCase() === "LIVE") {
            const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
            const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";
            if (!headerDeviceId) {
              res.status(403).json({
                success: false,
                error: "POS device selection is required.",
                code: "POS_DEVICE_REQUIRED" as const,
                data: {
                  hasHeader: rawDeviceId !== undefined && rawDeviceId !== null,
                },
              });
              return;
            }

            const device = await (prisma as any).posDevice.findFirst({
              where: {
                id: headerDeviceId,
                organizationId,
                branchId: branchIdForOrder,
                isActive: true,
                isDeleted: false,
              },
              select: { id: true, fiskalyClientId: true },
            });

            const fiskalyClientId = String((device as any)?.fiskalyClientId || "").trim();
            if (!device?.id || !fiskalyClientId) {
              res.status(409).json({
                success: false,
                error:
                  "This tablet is not connected to a Fiskaly POS device yet. Please provision/select a Fiskaly device for this tablet and try again.",
                code: "FISKALY_POS_DEVICE_NOT_PROVISIONED" as const,
              });
              return;
            }

            try {
              const fiskaly = FiskalyService.getInstance();
              await fiskaly.fiscalize({
                organizationId,
                branchId: branchIdForOrder,
                deviceId: device.id,
                orderId: id,
                amount: Number((currentOrder as any).totalAmount),
                currency: String((currentOrder as any).currency || "eur"),
                receiptNumber: String((currentOrder as any).orderNumber || id),
                meta: {
                  paymentMethod: String((currentOrder as any)?.paymentMethod || "").trim() || null,
                  voucherPaymentAmount: Number((currentOrder as any)?.voucherPaymentAmount || 0),
                  voucherCodes: (currentOrder as any)?.voucherCodes || [],
                },
              });
            } catch (err: any) {
              console.warn("[Fiskaly] Immediate fiscalization failed in updateOrderStatus. Enqueueing to background queue...", err);
              // Register outage and enqueue to the background queue
              const queueWorker = FiscalQueueWorker.getInstance();
              await queueWorker.enqueue(id);
            }
          }
        }
      } catch (err: any) {
        console.error("[Fiskaly] Non-blocking exception in updateOrderStatus fiscalization:", err);
      }

      const editable = await this.ensureOrderEditableByBusinessDay(prisma as any, id);
      if (!editable.ok) {
        res.status(400).json({ success: false, error: editable.error, code: editable.code });
        return;
      }

      if (
        paymentStatus &&
        editable.allowPaymentStatusChange === false &&
        String(paymentStatus) !== String((currentOrder as any).paymentStatus)
      ) {
        res.status(400).json({
          success: false,
          error:
            "Payment status for scheduled orders that belong to a closed business day cannot be edited directly. Use a refund/adjustment flow instead.",
          code: "BUSINESS_DAY_CLOSED" as const,
        });
        return;
      }

      const requestedNextStatus = status ? String(status) : null;
      const isFinalizedNow =
        String((currentOrder as any).status) === "DELIVERED" ||
        String((currentOrder as any).status) === "PICKED_UP";

      // Once delivered/picked up, orders are immutable, except for a retroactive cancellation.
      if (isFinalizedNow && requestedNextStatus && requestedNextStatus !== "CANCELLED") {
        res.status(400).json({
          success: false,
          error: "This order is finalized and can no longer be changed.",
          code: "ORDER_FINALIZED" as const,
        });
        return;
      }

      // If cancelling a finalized order that was already fiscalized, create a Fiskaly correction transaction.
      if (requestedNextStatus === "CANCELLED" && isFinalizedNow) {
        try {
          const existingFiscalTx = await (prisma as any).fiscalTransaction.findFirst({
            where: {
              organizationId,
              orderId: id,
              status: "FINISHED",
            },
            select: { id: true, status: true },
          });

          if (existingFiscalTx?.id && shouldFiscalize(fiskalyConfig)) {
            const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
            const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

            const fiskaly = FiskalyService.getInstance();
            await fiskaly.fiscalizeCorrection({
              organizationId,
              branchId: branchIdForOrder,
              deviceId: headerDeviceId || null,
              orderId: id,
              reservationOrderId: null,
              originalFiscalTransactionId: String(existingFiscalTx.id),
              correctionType: "CANCELLATION",
              amount: Number((currentOrder as any).totalAmount || 0),
              currency: String((currentOrder as any).currency || "eur"),
              receiptNumber: `${String((currentOrder as any).orderNumber || id)}-C`,
              meta: {
                cancellationReason: (req.body as any)?.cancellationReason || null,
                voucherPaymentAmount: (currentOrder as any).voucherPaymentAmount || 0,
                voucherCodes: (currentOrder as any).voucherCodes || [],
              },
            });
          }
        } catch (err: any) {
          console.error("[Fiskaly] Cancellation correction fiscalization failed:", err);
          res.status(502).json({
            success: false,
            error: err?.message || "Fiskaly cancellation fiscalization failed",
            code: err?.code || err?.fiskalyCode || ("FISKALY_CORRECTION_FAILED" as const),
          });
          return;
        }
      }

      if (status && !(requestedNextStatus === "CANCELLED" && isFinalizedNow)) {
        const isValid = validateOrderTypeTransition(
          currentOrder.status as any,
          status as any,
          currentOrder.orderType as any
        );
        if (!isValid) {
          res.status(400).json({
            success: false,
            error: "Invalid status transition for this order type",
          });
          return;
        }
      }

      // Anchor preparation-time countdown the first time the order becomes CONFIRMED.
      if (
        status &&
        String(status) === "CONFIRMED" &&
        String((currentOrder as any).status) !== "CONFIRMED" &&
        !(currentOrder as any).confirmedAt
      ) {
        updateData.confirmedAt = new Date();
        // Default preparationTime from branch -> org settings if not provided
        if (
          updateData.preparationTime === undefined ||
          updateData.preparationTime === null ||
          Number(updateData.preparationTime) <= 0
        ) {
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

      const order = await prisma.order.update({
        where: { id },
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
        const nextStatus = String(status ?? currentOrder.status);
        const nextPaymentStatus = String(paymentStatus ?? (currentOrder as any).paymentStatus);
        const branchId = (currentOrder as any).branchId;

        const isFulfilled = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
        const isPaid = nextPaymentStatus === "PAID";
        const shouldPost = isPaid && isFulfilled;

        if (shouldPost && branchId) {
          if (!((currentOrder as any).postedAt)) {
            const businessDayService = BusinessDayService.getInstance();
            const openSession = await businessDayService.getOrCreateOpenSession(branchId);
            await prisma.order.update({
              where: { id },
              data: {
                postedAt: new Date(),
                businessDaySessionId: openSession?.id || null,
              } as any,
            });
          }
        }
      } catch (err) {
        // don't fail status updates due to EOD posting
        console.error("[Fiskaly] EOD posting failed in updateOrderStatus:", err);
      }

      const wsService = WebSocketService.getInstance();

      // Emit order status change notification to the order owner
      if (order.user) {
        wsService.emitOrderStatusChange(order.user.id, order);
      }

      // Emit order update notification to admin room (so all admins see the update)
      try {
        const notification = await db.getPrisma().notification.findFirst({
          where: { orderId: order.id },
          orderBy: { createdAt: "desc" },
        });

        if (notification) {
          wsService.emitOrderUpdate(notification, order, []);
        } else {
          // Create a notification if it doesn't exist
          const newNotification = await db.getPrisma().notification.create({
            data: {
              orderId: order.id,
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
                      deal: {
                        select: {
                          id: true,
                          name: true,
                          image: true,
                        },
                      },
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
          wsService.emitOrderUpdate(newNotification, order, []);
        }
      } catch (error) {
        console.error("Error emitting order update to admin room:", error);
        // Continue even if notification emission fails
      }

      // Send tablet notification for order status update
      if (order.branchId) {
        const branch = await db.getPrisma().branch.findUnique({ where: { id: order.branchId }, select: { organizationId: true } });
        await tabletOrderNotificationService.notifyOrderUpdated(
          {
            orderId: order.id,
            orderNumber: order.orderNumber,
            branchId: order.branchId,
            organizationId: branch?.organizationId || "",
            status: order.status,
            totalAmount: Number(order.totalAmount),
          },
          currentOrder.status || "",
          order.status
        );
      }

      res.json({
        success: true,
        data: order,
        message: "Order status updated successfully",
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update order status",
      });
    }
  };

  // Cancel order
  public cancelOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();
      const { reason, cancelType } = (req.body || {}) as {
        reason?: string;
        cancelType?: string;
      };

      const order = await db.getPrisma().order.findUnique({
        where: { id },
        include: { user: true, payment: true, refunds: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      // Check if user can cancel this order
      const isAdmin = req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN";
      if (order.userId !== req.user?.id && !isAdmin) {
        res.status(403).json({
          success: false,
          error: "You can only cancel your own orders",
        });
        return;
      }

      // Check if order can be cancelled
      if (order.status === "DELIVERED" || order.status === "PICKED_UP" || order.status === "CANCELLED") {
        res.status(400).json({
          success: false,
          error: "Order cannot be cancelled",
        });
        return;
      }

      const isScheduled = Boolean(order.isScheduledOrder && order.scheduledDate);
      const isCancelForModification = cancelType === "MODIFICATION";

      if (isScheduled) {
        const branch = order.branchId
          ? await db.getPrisma().branch.findUnique({ where: { id: order.branchId } })
          : null;
        const globalSettings = await db.getPrisma().settings.findFirst();

        if (!globalSettings) {
          res.status(500).json({
            success: false,
            error: "Settings not configured",
          });
          return;
        }

        const allowCancellation =
          branch?.scheduledOrderAllowCancellation !== null &&
          branch?.scheduledOrderAllowCancellation !== undefined
            ? Boolean(branch.scheduledOrderAllowCancellation)
            : Boolean(globalSettings.scheduledOrderAllowCancellation);
        const cancellationWindowHours =
          branch?.scheduledOrderCancellationWindowHours !== null &&
          branch?.scheduledOrderCancellationWindowHours !== undefined
            ? Number(branch.scheduledOrderCancellationWindowHours)
            : Number(globalSettings.scheduledOrderCancellationWindowHours);

        const allowModification =
          branch?.scheduledOrderAllowModification !== null &&
          branch?.scheduledOrderAllowModification !== undefined
            ? Boolean(branch.scheduledOrderAllowModification)
            : Boolean(globalSettings.scheduledOrderAllowModification);
        const modificationWindowHours =
          branch?.scheduledOrderModificationWindowHours !== null &&
          branch?.scheduledOrderModificationWindowHours !== undefined
            ? Number(branch.scheduledOrderModificationWindowHours)
            : Number(globalSettings.scheduledOrderModificationWindowHours);
        const fullRefundHoursBefore =
          branch?.scheduledOrderFullRefundHoursBefore !== null &&
          branch?.scheduledOrderFullRefundHoursBefore !== undefined
            ? Number(branch.scheduledOrderFullRefundHoursBefore)
            : Number(globalSettings.scheduledOrderFullRefundHoursBefore);
        const partialRefundHoursBefore =
          branch?.scheduledOrderPartialRefundHoursBefore !== null &&
          branch?.scheduledOrderPartialRefundHoursBefore !== undefined
            ? Number(branch.scheduledOrderPartialRefundHoursBefore)
            : Number(globalSettings.scheduledOrderPartialRefundHoursBefore);
        const noRefundHoursBefore =
          branch?.scheduledOrderNoRefundHoursBefore !== null &&
          branch?.scheduledOrderNoRefundHoursBefore !== undefined
            ? Number(branch.scheduledOrderNoRefundHoursBefore)
            : Number(globalSettings.scheduledOrderNoRefundHoursBefore);
        const partialRefundPercentage =
          branch?.scheduledOrderPartialRefundPercentage !== null &&
          branch?.scheduledOrderPartialRefundPercentage !== undefined
            ? Number(branch.scheduledOrderPartialRefundPercentage)
            : Number(globalSettings.scheduledOrderPartialRefundPercentage);
        const reducedRefundPercentage =
          branch?.scheduledOrderReducedRefundPercentage !== null &&
          branch?.scheduledOrderReducedRefundPercentage !== undefined
            ? Number(branch.scheduledOrderReducedRefundPercentage)
            : Number(globalSettings.scheduledOrderReducedRefundPercentage);

        if (isCancelForModification) {
          if (!allowModification) {
            res.status(400).json({
              success: false,
              error: "Scheduled order modification is not allowed",
            });
            return;
          }
        } else {
          if (!allowCancellation) {
            res.status(400).json({
              success: false,
              error: "Scheduled order cancellation is not allowed",
            });
            return;
          }
        }

        const scheduledDate = new Date(order.scheduledDate as any);
        const now = new Date();
        const hoursUntilScheduled =
          (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursUntilScheduled <= 0) {
          res.status(400).json({
            success: false,
            error: "Order cannot be cancelled",
          });
          return;
        }

        const effectiveWindowHours = isCancelForModification
          ? modificationWindowHours
          : cancellationWindowHours;

        if (effectiveWindowHours > 0 && hoursUntilScheduled < effectiveWindowHours) {
          res.status(400).json({
            success: false,
            error: isCancelForModification
              ? `Cannot modify scheduled orders within ${effectiveWindowHours} hours of the scheduled time`
              : `Cannot cancel scheduled orders within ${effectiveWindowHours} hours of the scheduled time`,
          });
          return;
        }

        let refundPercentage = 0;
        if (hoursUntilScheduled >= fullRefundHoursBefore) {
          refundPercentage = 1;
        } else if (hoursUntilScheduled >= partialRefundHoursBefore) {
          refundPercentage = Math.max(
            Math.min(partialRefundPercentage / 100, 1),
            0
          );
        } else if (hoursUntilScheduled >= noRefundHoursBefore) {
          refundPercentage = Math.max(
            Math.min(reducedRefundPercentage / 100, 1),
            0
          );
        } else {
          refundPercentage = 0;
        }

        const shouldAttemptRefund =
          order.paymentMethod === PaymentMethod.ONLINE_PAYMENT &&
          (order.paymentStatus === PaymentStatus.PAID ||
            order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) &&
          refundPercentage > 0;

        let computedPaymentStatus: PaymentStatus = order.paymentStatus as PaymentStatus;

        let refundAmount = 0;
        if (shouldAttemptRefund) {
          const orderTotal = parseFloat(order.totalAmount.toString());
          const alreadyRefunded = (order.refunds || []).reduce((sum, r) => {
            if (r.status === "FAILED" || r.status === "CANCELED") return sum;
            return sum + parseFloat(r.amount.toString());
          }, 0);

          refundAmount = Math.max(
            Math.min(orderTotal * refundPercentage, orderTotal - alreadyRefunded),
            0
          );

          if (refundAmount > 0.01) {
            let stripeRefundId: string | null = null;
            let paypalRefundId: string | null = null;
            let refundStatus: "SUCCEEDED" | "PENDING" | "FAILED" | "CANCELED" =
              "PENDING";

            const provider =
              order.payment?.paymentProvider || PaymentProvider.STRIPE;

            if (provider === PaymentProvider.STRIPE) {
              const sources = this.getOrderPaymentSources(order as any).filter(
                (s: any) => s.provider === "STRIPE"
              ) as any[];
              
              if (sources.length === 0) {
                res.status(400).json({
                  success: false,
                  error: "Missing payment intent for Stripe refund",
                });
                return;
              }

              let remainingCents = Math.round(refundAmount * 100);
              for (const s of sources) {
                if (remainingCents <= 0) break;
                const pi = await stripe.paymentIntents.retrieve(String(s.paymentIntentId));
                const piAmount = typeof pi.amount === "number" ? pi.amount : 0;
                const centsToRefund = Math.min(remainingCents, piAmount);
                if (centsToRefund <= 0) continue;

                const stripeRefund = await stripe.refunds.create({
                  payment_intent: String(s.paymentIntentId),
                  amount: centsToRefund,
                  reason: "requested_by_customer",
                  metadata: {
                    orderId: order.id,
                    cancelType: cancelType || "USER_CANCEL",
                    reason: reason || "scheduled_order_cancellation",
                  },
                });

                stripeRefundId = stripeRefund.id;
                refundStatus =
                  stripeRefund.status === "succeeded"
                    ? "SUCCEEDED"
                    : stripeRefund.status === "failed"
                    ? "FAILED"
                    : stripeRefund.status === "canceled"
                    ? "CANCELED"
                    : "PENDING";

                remainingCents -= centsToRefund;
              }
            } else if (provider === PaymentProvider.PAYPAL) {
              const sources = this.getOrderPaymentSources(order as any).filter(
                (s: any) => s.provider === "PAYPAL"
              ) as any[];
              if (sources.length === 0) {
                res.status(400).json({
                  success: false,
                  error: "Missing PayPal capture ID for refund",
                });
                return;
              }

              const currency = (order.currency || "EUR").toString();
              const refundService = PayPalRefundService.getInstance();
              let remaining = refundAmount;
              for (const s of sources) {
                if (remaining <= 0) break;
                const sourceCap =
                  s.amount !== undefined && s.amount !== null
                    ? Number(s.amount)
                    : remaining;
                const amountForThis = Math.min(remaining, sourceCap);
                if (amountForThis <= 0) continue;

                const refundResult = await refundService.createRefund({
                  captureId: String(s.captureId),
                  amount: amountForThis,
                  currency: currency.toUpperCase(),
                  reason: reason || "requested_by_customer",
                  metadata: {
                    invoiceId: String(order.orderNumber || ""),
                    customId: String(order.id),
                  },
                });

                paypalRefundId = (refundResult as any)?.id || null;
                refundStatus = refundService.mapRefundStatus(
                  (refundResult as any)?.status
                ) as any;

                if (paypalRefundId && refundStatus === "PENDING") {
                  try {
                    const verified = await refundService.getRefund(paypalRefundId);
                    refundStatus = refundService.mapRefundStatus(
                      (verified as any)?.status
                    ) as any;
                  } catch {
                    // keep PENDING
                  }
                }

                remaining -= amountForThis;
              }
            }

            const refundType = refundPercentage >= 1 ? "FULL" : "PARTIAL";
            const refund = await db.getPrisma().refund.create({
              data: {
                orderId: order.id,
                refundType: refundType as any,
                amount: refundAmount,
                reason: reason || (isCancelForModification ? "Order modification" : "Order cancellation"),
                stripeRefundId,
                paypalRefundId,
                status: refundStatus as any,
                refundedBy: req.user?.id || "system",
                refundedAt: refundStatus === "SUCCEEDED" ? new Date() : null,
                paymentId: order.paymentId || null,
              },
            });

            // Reactivate single-purpose vouchers upon successful refund
            if (refundStatus === "SUCCEEDED" && order.voucherCodes && order.voucherCodes.length > 0) {
              try {
                const voucherPaymentAmount = Number(order.voucherPaymentAmount || 0);
                const totalAmount = Number(order.totalAmount || 0);
                
                if (voucherPaymentAmount > 0) {
                  // Check if any voucher is single-purpose
                  const vouchers = await db.getPrisma().voucher.findMany({
                    where: { voucherCode: { in: order.voucherCodes } },
                    select: { voucherType: true, voucherCode: true, status: true, currentAmount: true },
                  });
                  
                  const hasVoucherPayment = vouchers.length > 0;
                  
                  if (hasVoucherPayment) {
                    const refundRatio = refundAmount / totalAmount;
                    const voucherRefundAmount = Math.round(voucherPaymentAmount * refundRatio * 100) / 100;
                    
                    // Reactivate vouchers for the refund portion
                    for (const voucher of vouchers) {
                        // Check if voucher is already ACTIVE or expired
                        if (voucher.status === "ACTIVE") {
                          console.log(`[VOUCHER] Skipping reactivation for voucher ${voucher.voucherCode} - already active`);
                          continue;
                        }
                        
                        // Check if voucher is expired
                        const voucherDetails = await db.getPrisma().voucher.findUnique({
                          where: { voucherCode: voucher.voucherCode },
                          select: { expiresAt: true, status: true },
                        });
                        
                        if (voucherDetails && new Date(voucherDetails.expiresAt) < new Date()) {
                          console.log(`[VOUCHER] Skipping reactivation for voucher ${voucher.voucherCode} - expired`);
                          continue;
                        }
                        
                        // Call the reactivation endpoint logic directly
                        await db.getPrisma().voucher.update({
                          where: { voucherCode: voucher.voucherCode },
                          data: { status: "ACTIVE" },
                        });
                        
                        console.log(`[VOUCHER] Reactivated voucher ${voucher.voucherCode} (type: ${voucher.voucherType}) for refund ${refund.id}`, {
                          orderId: order.id,
                          refundAmount: voucherRefundAmount,
                        });
                    }
                  }
                }
              } catch (voucherErr: any) {
                console.error("[VOUCHER] Failed to reactivate voucher upon refund:", voucherErr);
                // Don't fail the refund if voucher reactivation fails
              }
            }

            // Recompute order paymentStatus based on succeeded refunds (so UI reflects refund state)
            const refreshedForStatus = await db.getPrisma().order.findUnique({
              where: { id: order.id },
              include: { refunds: true },
            });
            if (refreshedForStatus) {
              const succeededRefundedTotal = (refreshedForStatus.refunds || []).reduce(
                (sum, r) => {
                  if (r.status !== "SUCCEEDED") return sum;
                  return sum + parseFloat(r.amount.toString());
                },
                0
              );
              const orderTotal = parseFloat(refreshedForStatus.totalAmount.toString());
              if (succeededRefundedTotal > 0) {
                computedPaymentStatus =
                  succeededRefundedTotal >= orderTotal
                    ? PaymentStatus.REFUNDED
                    : PaymentStatus.PARTIALLY_REFUNDED;
              }
            }

            if (order.paymentId && refundStatus === "SUCCEEDED") {
              const paymentService = PaymentService.getInstance();
              const updatedOrder = await db.getPrisma().order.findUnique({
                where: { id: order.id },
                include: { refunds: true },
              });

              if (updatedOrder) {
                const totalRefundedNow = (updatedOrder.refunds || []).reduce(
                  (sum, r) => {
                    if (r.status === "FAILED" || r.status === "CANCELED") return sum;
                    return sum + parseFloat(r.amount.toString());
                  },
                  0
                );
                const newPaymentStatus =
                  totalRefundedNow >= parseFloat(updatedOrder.totalAmount.toString())
                    ? PaymentStatus.REFUNDED
                    : PaymentStatus.PARTIALLY_REFUNDED;
                await paymentService.updatePaymentStatus(
                  order.paymentId,
                  newPaymentStatus === PaymentStatus.REFUNDED
                    ? PaymentState.REFUNDED
                    : PaymentState.PARTIALLY_REFUNDED,
                  { refundedAt: new Date() }
                );
              }
            }
          }
        }

        const existingHistory = ((order as any).history as any[]) || [];
        const newHistory = [
          ...existingHistory,
          {
            type: isCancelForModification ? "CANCELLED_FOR_MODIFICATION" : "CANCELLED",
            action: isCancelForModification
              ? "Order cancelled for modification"
              : "Order cancelled",
            userId: req.user?.id,
            details: {
              reason: reason || null,
              refundPercentage,
              refundAmount: refundAmount || 0,
            },
            timestamp: new Date().toISOString(),
          },
        ];

        const updatedOrder = await db.getPrisma().order.update({
          where: { id },
          data: {
            status: "CANCELLED",
            paymentStatus:
              order.paymentMethod === PaymentMethod.ONLINE_PAYMENT
                ? computedPaymentStatus
                : PaymentStatus.FAILED,
            history: newHistory as any,
          } as any,
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
                orderItemOptionalIngredients: {
                  include: {
                    optionalIngredient: {
                      select: { id: true, name: true, description: true },
                    },
                  },
                },
              },
            },
            refunds: true,
          },
        });

        try {
          const wsService = WebSocketService.getInstance();

          if (updatedOrder.user?.id) {
            wsService.emitOrderStatusChange(updatedOrder.user.id, updatedOrder);
          }

          const cancellationNotification = await db.getPrisma().notification.create({
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
                  branch: {
                    select: {
                      id: true,
                      name: true,
                      organizationId: true,
                    },
                  },
                  orderItems: {
                    include: {
                      deal: {
                        select: {
                          id: true,
                          name: true,
                          image: true,
                        },
                      },
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

          wsService.emitOrderUpdate(cancellationNotification, updatedOrder, []);
        } catch (error) {
          console.error(
            "Error emitting order cancellation update to admin room:",
            error
          );
        }

        res.json({
          success: true,
          data: updatedOrder,
          message: "Order cancelled successfully",
        });
        return;
      }

      const orderTotal = parseFloat(order.totalAmount.toString());
      const alreadyRefunded = (order.refunds || []).reduce((sum, r) => {
        if (r.status === "FAILED" || r.status === "CANCELED") return sum;
        return sum + parseFloat(r.amount.toString());
      }, 0);

      const refundAmount = Math.max(Math.min(orderTotal - alreadyRefunded, orderTotal), 0);
      const shouldAttemptRefund =
        order.paymentMethod === PaymentMethod.ONLINE_PAYMENT &&
        (order.paymentStatus === PaymentStatus.PAID ||
          order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) &&
        refundAmount > 0.01;

      let computedPaymentStatus: PaymentStatus = order.paymentStatus as PaymentStatus;
      let refundStatusForHistory: "SUCCEEDED" | "PENDING" | "FAILED" | "CANCELED" | null = null;

      if (shouldAttemptRefund) {
        let stripeRefundId: string | null = null;
        let paypalRefundId: string | null = null;
        let refundStatus: "SUCCEEDED" | "PENDING" | "FAILED" | "CANCELED" = "PENDING";

        const provider = order.payment?.paymentProvider || PaymentProvider.STRIPE;

        if (provider === PaymentProvider.STRIPE) {
          const sources = this.getOrderPaymentSources(order as any).filter(
            (s: any) => s.provider === "STRIPE"
          ) as any[];

          if (sources.length === 0) {
            res.status(400).json({
              success: false,
              error: "Missing payment intent for Stripe refund",
            });
            return;
          }

          let remainingCents = Math.round(refundAmount * 100);
          for (const s of sources) {
            if (remainingCents <= 0) break;
            const pi = await stripe.paymentIntents.retrieve(String(s.paymentIntentId));
            const piAmount = typeof pi.amount === "number" ? pi.amount : 0;
            const centsToRefund = Math.min(remainingCents, piAmount);
            if (centsToRefund <= 0) continue;

            const stripeRefund = await stripe.refunds.create({
              payment_intent: String(s.paymentIntentId),
              amount: centsToRefund,
              reason: "requested_by_customer",
              metadata: {
                orderId: order.id,
                cancelType: cancelType || "USER_CANCEL",
                reason: reason || "order_cancellation",
              },
            });

            stripeRefundId = stripeRefund.id;
            refundStatus =
              stripeRefund.status === "succeeded"
                ? "SUCCEEDED"
                : stripeRefund.status === "failed"
                ? "FAILED"
                : stripeRefund.status === "canceled"
                ? "CANCELED"
                : "PENDING";

            remainingCents -= centsToRefund;
          }
        } else if (provider === PaymentProvider.PAYPAL) {
          const sources = this.getOrderPaymentSources(order as any).filter(
            (s: any) => s.provider === "PAYPAL"
          ) as any[];
          if (sources.length === 0) {
            res.status(400).json({
              success: false,
              error: "Missing PayPal capture ID for refund",
            });
            return;
          }

          const currency = (order.currency || "EUR").toString();
          const refundService = PayPalRefundService.getInstance();
          let remaining = refundAmount;
          for (const s of sources) {
            if (remaining <= 0) break;
            const sourceCap =
              s.amount !== undefined && s.amount !== null ? Number(s.amount) : remaining;
            const amountForThis = Math.min(remaining, sourceCap);
            if (amountForThis <= 0) continue;

            const refundResult = await refundService.createRefund({
              captureId: String(s.captureId),
              amount: amountForThis,
              currency: currency.toUpperCase(),
              reason: reason || "requested_by_customer",
              metadata: {
                invoiceId: String(order.orderNumber || ""),
                customId: String(order.id),
              },
            });

            paypalRefundId = (refundResult as any)?.id || null;
            refundStatus = refundService.mapRefundStatus(
              (refundResult as any)?.status
            ) as any;

            if (paypalRefundId && refundStatus === "PENDING") {
              try {
                const verified = await refundService.getRefund(paypalRefundId);
                refundStatus = refundService.mapRefundStatus(
                  (verified as any)?.status
                ) as any;
              } catch {
                // keep PENDING
              }
            }

            remaining -= amountForThis;
          }
        }

        refundStatusForHistory = refundStatus;

        await db.getPrisma().refund.create({
          data: {
            orderId: order.id,
            refundType: "FULL" as any,
            amount: refundAmount,
            reason: reason || "Order cancellation",
            stripeRefundId,
            paypalRefundId,
            status: refundStatus as any,
            refundedBy: req.user?.id || "system",
            refundedAt: refundStatus === "SUCCEEDED" ? new Date() : null,
            paymentId: order.paymentId || null,
          },
        });

        const refreshedForStatus = await db.getPrisma().order.findUnique({
          where: { id: order.id },
          include: { refunds: true },
        });
        if (refreshedForStatus) {
          const succeededRefundedTotal = (refreshedForStatus.refunds || []).reduce(
            (sum, r) => {
              if (r.status !== "SUCCEEDED") return sum;
              return sum + parseFloat(r.amount.toString());
            },
            0
          );
          if (succeededRefundedTotal > 0) {
            computedPaymentStatus =
              succeededRefundedTotal >= orderTotal
                ? PaymentStatus.REFUNDED
                : PaymentStatus.PARTIALLY_REFUNDED;
          }
        }

        if (order.paymentId && computedPaymentStatus !== (order.paymentStatus as any)) {
          const paymentService = PaymentService.getInstance();
          await paymentService.updatePaymentStatus(
            order.paymentId,
            computedPaymentStatus === PaymentStatus.REFUNDED
              ? PaymentState.REFUNDED
              : PaymentState.PARTIALLY_REFUNDED,
            { refundedAt: new Date() }
          );
        }
      }

      const existingHistory = ((order as any).history as any[]) || [];
      const newHistory = [
        ...existingHistory,
        {
          type: "CANCELLED",
          action: "Order cancelled",
          userId: req.user?.id,
          details: {
            reason: reason || null,
            refundPercentage: shouldAttemptRefund ? 1 : 0,
            refundAmount: shouldAttemptRefund ? refundAmount : 0,
            refundStatus: refundStatusForHistory,
          },
          timestamp: new Date().toISOString(),
        },
      ];

      const updatedOrder = await db.getPrisma().order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          paymentStatus:
            order.paymentMethod === PaymentMethod.ONLINE_PAYMENT
              ? computedPaymentStatus
              : PaymentStatus.FAILED,
          history: newHistory as any,
        } as any,
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
              orderItemOptionalIngredients: {
                include: {
                  optionalIngredient: {
                    select: { id: true, name: true, description: true },
                  },
                },
              },
            },
          },
          refunds: true,
        },
      });

      try {
        const wsService = WebSocketService.getInstance();

        if (updatedOrder.user?.id) {
          wsService.emitOrderStatusChange(updatedOrder.user.id, updatedOrder);
        }

        const cancellationNotification = await db.getPrisma().notification.create({
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
                branch: {
                  select: {
                    id: true,
                    name: true,
                    organizationId: true,
                  },
                },
                orderItems: {
                  include: {
                    deal: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                      },
                    },
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

        wsService.emitOrderUpdate(cancellationNotification, updatedOrder, []);
      } catch (error) {
        console.error("Error emitting order cancellation update to admin room:", error);
      }

      res.json({
        success: true,
        data: updatedOrder,
        message: "Order cancelled successfully",
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel order",
      });
    }
  };

  // Reschedule order (shallow modification: update scheduledDate only)
  public rescheduleOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { scheduledDate, reason } = (req.body || {}) as {
        scheduledDate?: string | null;
        reason?: string;
      };

      if (scheduledDate === undefined) {
        res.status(400).json({
          success: false,
          error: "scheduledDate is required",
        });
        return;
      }

      const isAsap = scheduledDate === null;
      const newScheduledDate = !isAsap ? new Date(String(scheduledDate)) : null;
      if (!isAsap && (!newScheduledDate || isNaN(newScheduledDate.getTime()))) {
        res.status(400).json({
          success: false,
          error: "scheduledDate is invalid",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const order = await db.getPrisma().order.findUnique({
        where: { id },
        include: { user: true, branch: true },
      });

      if (!order) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      const editable = await this.ensureOrderEditableByBusinessDay(db.getPrisma() as any, id);
      if (!editable.ok) {
        res.status(400).json({ success: false, error: editable.error, code: editable.code });
        return;
      }

      // Check if user can reschedule this order
      const isAdminUser = req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN";
      if (order.userId !== req.user?.id && !isAdminUser) {
        res.status(403).json({
          success: false,
          error: "You can only reschedule your own orders",
        });
        return;
      }

      // Only scheduled orders are eligible
      if (!order.isScheduledOrder || !order.scheduledDate) {
        res.status(400).json({
          success: false,
          error: "Only scheduled orders can be rescheduled",
        });
        return;
      }

      if (order.status === "DELIVERED" || order.status === "CANCELLED") {
        res.status(400).json({
          success: false,
          error: "Order cannot be rescheduled",
        });
        return;
      }

      const globalSettings = await db.getPrisma().settings.findFirst();
      if (!globalSettings) {
        res.status(500).json({
          success: false,
          error: "Settings not configured",
        });
        return;
      }

      const branch = order.branchId
        ? await db.getPrisma().branch.findUnique({ where: { id: order.branchId } })
        : null;

      const allowShallowModification =
        branch?.scheduledOrderAllowShallowModification !== null &&
        branch?.scheduledOrderAllowShallowModification !== undefined
          ? Boolean(branch.scheduledOrderAllowShallowModification)
          : Boolean((globalSettings as any).scheduledOrderAllowShallowModification);

      if (!allowShallowModification) {
        res.status(400).json({
          success: false,
          error: "Scheduled order rescheduling is not allowed",
        });
        return;
      }

      // Use the existing modification window setting for shallow reschedule as well
      const modificationWindowHours =
        branch?.scheduledOrderModificationWindowHours !== null &&
        branch?.scheduledOrderModificationWindowHours !== undefined
          ? Number(branch.scheduledOrderModificationWindowHours)
          : Number(globalSettings.scheduledOrderModificationWindowHours);

      const now = new Date();
      const currentScheduledDate = new Date(order.scheduledDate as any);
      const hoursUntilCurrentScheduled =
        (currentScheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilCurrentScheduled <= 0) {
        res.status(400).json({
          success: false,
          error: "Order cannot be rescheduled",
        });
        return;
      }

      if (modificationWindowHours > 0 && hoursUntilCurrentScheduled < modificationWindowHours) {
        res.status(400).json({
          success: false,
          error: `Cannot reschedule scheduled orders within ${modificationWindowHours} hours of the scheduled time`,
        });
        return;
      }

      if (!isAsap && newScheduledDate && newScheduledDate.getTime() <= now.getTime()) {
        res.status(400).json({
          success: false,
          error: "New scheduledDate must be in the future",
        });
        return;
      }

      const existingHistory = ((order as any).history as any[]) || [];
      const newHistory = [
        ...existingHistory,
        {
          type: "RESCHEDULED",
          action: "Order rescheduled",
          userId: req.user?.id,
          details: {
            from: (order.scheduledDate as any) || null,
            to: isAsap ? null : (newScheduledDate as Date).toISOString(),
            reason: reason || null,
          },
          timestamp: new Date().toISOString(),
        },
      ];

      const updatedOrder = await db.getPrisma().order.update({
        where: { id: order.id },
        data: {
          scheduledDate: isAsap ? null : (newScheduledDate as any),
          isScheduledOrder: isAsap ? false : true,
          history: newHistory as any,
        } as any,
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
              orderItemOptionalIngredients: {
                include: {
                  optionalIngredient: {
                    select: { id: true, name: true, description: true },
                  },
                },
              },
            },
          },
        },
      });

      // Send tablet notification for order reschedule
      if (updatedOrder.branchId) {
        const branch = await db.getPrisma().branch.findUnique({ where: { id: updatedOrder.branchId }, select: { organizationId: true } });
        await tabletOrderNotificationService.notifyOrderUpdated(
          {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.orderNumber,
            branchId: updatedOrder.branchId,
            organizationId: branch?.organizationId || "",
            status: updatedOrder.status,
            totalAmount: Number(updatedOrder.totalAmount),
          },
          "RESCHEDULED",
          updatedOrder.status
        );
      }

      res.json({
        success: true,
        data: updatedOrder,
        message: "Order rescheduled successfully",
      });
    } catch (error) {
      console.error("Error rescheduling order:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reschedule order",
      });
    }
  };

  // Validate cart items availability for a branch
  public validateCart = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { cartItems, branchId } = req.body;

      if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        res.status(400).json({
          success: false,
          error: "Cart items are required",
        });
        return;
      }

      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
      });

      if (!branch || !branch.isActive) {
        res.status(400).json({
          success: false,
          error: "Invalid or inactive branch",
        });
        return;
      }

      if ((branch as any).isUrgentlyClosed) {
        res.status(400).json({
          success: false,
          error: (branch as any).urgentCloseMessage || "This branch is temporarily closed due to an emergency.",
        });
        return;
      }

      if ((branch as any).organizationId) {
        const org: any = await db.getPrisma().organization.findUnique({
          where: { id: (branch as any).organizationId },
          select: { id: true, isActive: true } as any,
        });

        if (!org || !org.isActive) {
          res.status(400).json({
            success: false,
            error: "Organization is deactivated",
          });
          return;
        }
      }

      const unavailableItems: { mealId: string; mealName: string; reason: string }[] = [];

      for (const item of cartItems) {
        const mealId = item.mealId || item.id;
        if (!mealId) continue;

        const meal = await db.getPrisma().meal.findUnique({
          where: { id: mealId },
          select: {
            id: true,
            name: true,
            excludedBranches: true,
            isActive: true,
            category: {
              select: {
                excludedBranches: true,
              },
            },
          },
        });

        if (!meal || !meal.isActive) {
          unavailableItems.push({
            mealId,
            mealName: meal?.name || "Unknown meal",
            reason: !meal ? "Meal not found" : "Meal is not active",
          });
          continue;
        }

        if (meal.excludedBranches?.includes(branchId)) {
          unavailableItems.push({
            mealId,
            mealName: meal.name,
            reason: "Meal excluded from this branch",
          });
          continue;
        }

        // Also respect category exclusions for the branch
        if (meal.category?.excludedBranches?.includes(branchId)) {
          unavailableItems.push({
            mealId,
            mealName: meal.name,
            reason: "Category excluded from this branch",
          });
        }
      }

      console.debug("[OrderController] validateCart", {
        branchId,
        unavailableCount: unavailableItems.length,
      });

      res.json({
        success: true,
        data: {
          valid: unavailableItems.length === 0,
          unavailableItems,
        },
      });
    } catch (error) {
      console.error("Error validating cart:", error);
      res.status(500).json({
        success: false,
        error: "Failed to validate cart",
      });
    }
  };

  // Get order statistics (admin only)
  public getOrderStatistics = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { startDate, endDate, branchId } = req.query;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(req.rbacUser.userType);
      const branchIdStr = (branchId as string | undefined) || undefined;
      if (!isSuperAdmin) {
        if (!branchIdStr) {
          res.status(400).json({ success: false, error: "branchId is required" });
          return;
        }
        if (!req.rbacUser.assignedBranchIds.includes(branchIdStr)) {
          res.status(403).json({ success: false, error: "Access denied for this branch" });
          return;
        }
      }

      const where: any = {};
      if (branchIdStr) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchIdStr },
          select: { id: true, organizationId: true },
        });

        if (!branch || branch.organizationId !== organizationId) {
          res.status(404).json({ success: false, error: "Branch not found" });
          return;
        }

        where.branchId = branchIdStr;
      } else if (!isSuperAdmin) {
        where.branchId = "__none__";
      } else {
        where.branch = { organizationId };
      }
      if (startDate && endDate) {
        where.createdAt = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        };
      }

      const [
        totalOrders,
        totalRevenue,
        ordersByStatus,
        ordersByPaymentStatus,
        recentOrders,
      ] = await Promise.all([
        db.getPrisma().order.count({ where }),
        db.getPrisma().order.aggregate({
          where: { ...where, paymentStatus: "PAID" },
          _sum: { totalAmount: true },
        }),
        db.getPrisma().order.groupBy({
          by: ["status"],
          where,
          _count: { status: true },
        }),
        db.getPrisma().order.groupBy({
          by: ["paymentStatus"],
          where,
          _count: { paymentStatus: true },
        }),
        db.getPrisma().order.findMany({
          where,
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          totalOrders,
          totalRevenue: totalRevenue._sum.totalAmount || 0,
          ordersByStatus,
          ordersByPaymentStatus,
          recentOrders,
        },
      });
    } catch (error) {
      console.error("Error fetching order statistics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order statistics",
      });
    }
  };

  // Create Cash on Delivery order
  public createCODOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        orderType = "DELIVERY",
        deliveryAddress,
        deliveryStreetAddress,
        deliveryHouseNumber,
        deliveryPostalCode,
        deliveryBuilding,
        deliveryFloor,
        deliveryApartment,
        deliveryExtraDetails,
        deliveryPhone,
        deliveryNotes,
        pickupPhone,
        pickupNotes,
        subtotal,
        deliveryFee,
        tax,
        totalAmount,
        deliveryDistanceKm,
        cartItems,
        mergeWithOrderId,
        branchId,
        scheduledDate: scheduledDateStr, // ISO string or null for ASAP
        replacesOrderId,
        appliedVoucherCode,
      } = req.body;

      if (!cartItems || cartItems.length === 0) {
        res.status(400).json({
          success: false,
          error: "Cart items are required",
        });
        return;
      }

      // Validate required fields based on order type
      if (orderType === "PICKUP") {
        if (!pickupPhone) {
          res.status(400).json({
            success: false,
            error: "Pickup phone is required",
          });
          return;
        }
      } else {
        if (!deliveryAddress || !deliveryPhone) {
          res.status(400).json({
            success: false,
            error: "Delivery address and phone are required",
          });
          return;
        }
      }

      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Validate branch
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: branchId },
        select: {
          id: true,
          isActive: true,
          isUrgentlyClosed: true,
          urgentCloseMessage: true,
          organizationId: true,
          currency: true,
          pickupEnabled: true,
          deliveryEnabled: true,
          taxInclusive: true,
          orderPreparationTime: true,
        },
      });
      if (!branch || !branch.isActive) {
        res.status(400).json({
          success: false,
          error: "Invalid or inactive branch",
        });
        return;
      }

      if (branch.isUrgentlyClosed) {
        res.status(400).json({
          success: false,
          error: branch.urgentCloseMessage || "This branch is temporarily closed due to an emergency.",
        });
        return;
      }

      if ((branch as any).organizationId) {
        const org: any = await db.getPrisma().organization.findUnique({
          where: { id: (branch as any).organizationId },
          select: { id: true, isActive: true } as any,
        });

        if (!org || !org.isActive) {
          res.status(400).json({
            success: false,
            error: "Organization is deactivated",
          });
          return;
        }
      }

      // Enforce service availability (branch override with global fallback)
      const globalSettingsForServices = await db.getPrisma().settings.findFirst({
        select: {
          pickupEnabled: true,
          deliveryEnabled: true,
        } as any,
      });
      if (!globalSettingsForServices) {
        res.status(500).json({
          success: false,
          error: "Settings not configured",
        });
        return;
      }

      const effectivePickupEnabled =
        (branch as any).pickupEnabled !== null && (branch as any).pickupEnabled !== undefined
          ? Boolean((branch as any).pickupEnabled)
          : Boolean((globalSettingsForServices as any).pickupEnabled);
      const effectiveDeliveryEnabled =
        (branch as any).deliveryEnabled !== null && (branch as any).deliveryEnabled !== undefined
          ? Boolean((branch as any).deliveryEnabled)
          : Boolean((globalSettingsForServices as any).deliveryEnabled);

      if (orderType === "PICKUP" && !effectivePickupEnabled) {
        res.status(400).json({
          success: false,
          error: "Pickup is currently disabled for this branch",
        });
        return;
      }
      if (orderType !== "PICKUP" && !effectiveDeliveryEnabled) {
        res.status(400).json({
          success: false,
          error: "Delivery is currently disabled for this branch",
        });
        return;
      }

      // Parse and validate scheduled date
      let scheduledDate: Date | null = null;
      let isScheduledOrder = false;

      if (scheduledDateStr) {
        scheduledDate = new Date(scheduledDateStr);
        if (isNaN(scheduledDate.getTime())) {
          res.status(400).json({
            success: false,
            error: "Invalid scheduled date format",
          });
          return;
        }

        // Get global settings for future order validation
        const globalSettings = await db.getPrisma().settings.findFirst();
        if (!globalSettings) {
          res.status(500).json({
            success: false,
            error: "Settings not configured",
          });
          return;
        }

        // Validate scheduled date against future order settings
        const { getEffectiveFutureOrderSettings, validateScheduledDate } = await import(
          "../utils/branchConfigHelper"
        );
        const futureOrderSettings = getEffectiveFutureOrderSettings(branch as any, globalSettings);
        const validation = validateScheduledDate(
          scheduledDate,
          orderType as "PICKUP" | "DELIVERY",
          futureOrderSettings
        );

        if (!validation.valid) {
          res.status(400).json({
            success: false,
            error: validation.error,
          });
          return;
        }

        // If a scheduled date is provided, this is a scheduled order
        // (regardless of whether it's today or a future date)
        isScheduledOrder = true;
      }

      if (scheduledDate) {
        const globalSettingsForCapacity = await db.getPrisma().settings.findFirst({
          select: {
            scheduledOrderTimeSlotInterval: true,
            scheduledOrderMaxOrdersPerSlot: true,
          },
        });

        if (globalSettingsForCapacity) {
          const intervalMinutes =
            (branch as any).scheduledOrderTimeSlotInterval ??
            globalSettingsForCapacity.scheduledOrderTimeSlotInterval ??
            30;
          const maxOrdersPerSlot =
            (branch as any).scheduledOrderMaxOrdersPerSlot !== null &&
            (branch as any).scheduledOrderMaxOrdersPerSlot !== undefined
              ? (branch as any).scheduledOrderMaxOrdersPerSlot
              : (globalSettingsForCapacity as any).scheduledOrderMaxOrdersPerSlot ?? null;

          if (maxOrdersPerSlot !== null) {
            const minutes = scheduledDate.getHours() * 60 + scheduledDate.getMinutes();
            const floored = Math.floor(minutes / intervalMinutes) * intervalMinutes;
            const slotStart = new Date(scheduledDate);
            slotStart.setHours(0, 0, 0, 0);
            slotStart.setMinutes(floored);
            const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60 * 1000);

            const count = await db.getPrisma().order.count({
              where: {
                branchId,
                orderType,
                scheduledDate: {
                  not: null,
                  gte: slotStart,
                  lt: slotEnd,
                },
                status: {
                  not: "CANCELLED",
                },
              },
            });

            if (count >= maxOrdersPerSlot) {
              res.status(400).json({
                success: false,
                error:
                  "This time slot has reached the maximum number of scheduled orders. Please choose another slot.",
              });
              return;
            }
          }
        }
      }

      // Check serving hours
      const servingHoursSettings = await db.getPrisma().settings.findFirst({
        select: {
          allowOrdersOutsideHours: true,
          mondayIsOff: true,
          mondayOpen: true,
          mondayClose: true,
          tuesdayIsOff: true,
          tuesdayOpen: true,
          tuesdayClose: true,
          wednesdayIsOff: true,
          wednesdayOpen: true,
          wednesdayClose: true,
          thursdayIsOff: true,
          thursdayOpen: true,
          thursdayClose: true,
          fridayIsOff: true,
          fridayOpen: true,
          fridayClose: true,
          saturdayIsOff: true,
          saturdayOpen: true,
          saturdayClose: true,
          sundayIsOff: true,
          sundayOpen: true,
          sundayClose: true,
        },
      });

      if (servingHoursSettings) {
        const { checkServingHours } = await import("../utils/deliveryHours");
        const hours = {
          monday: {
            isOff: servingHoursSettings.mondayIsOff,
            open: servingHoursSettings.mondayOpen || undefined,
            close: servingHoursSettings.mondayClose || undefined,
          },
          tuesday: {
            isOff: servingHoursSettings.tuesdayIsOff,
            open: servingHoursSettings.tuesdayOpen || undefined,
            close: servingHoursSettings.tuesdayClose || undefined,
          },
          wednesday: {
            isOff: servingHoursSettings.wednesdayIsOff,
            open: servingHoursSettings.wednesdayOpen || undefined,
            close: servingHoursSettings.wednesdayClose || undefined,
          },
          thursday: {
            isOff: servingHoursSettings.thursdayIsOff,
            open: servingHoursSettings.thursdayOpen || undefined,
            close: servingHoursSettings.thursdayClose || undefined,
          },
          friday: {
            isOff: servingHoursSettings.fridayIsOff,
            open: servingHoursSettings.fridayOpen || undefined,
            close: servingHoursSettings.fridayClose || undefined,
          },
          saturday: {
            isOff: servingHoursSettings.saturdayIsOff,
            open: servingHoursSettings.saturdayOpen || undefined,
            close: servingHoursSettings.saturdayClose || undefined,
          },
          sunday: {
            isOff: servingHoursSettings.sundayIsOff,
            open: servingHoursSettings.sundayOpen || undefined,
            close: servingHoursSettings.sundayClose || undefined,
          },
        };

        const status = checkServingHours(hours, new Date());
        if (!status.isOpen && !servingHoursSettings.allowOrdersOutsideHours) {
          res.status(400).json({
            success: false,
            error: status.message || "We're currently closed. Please check our serving hours.",
            servingHoursStatus: {
              isOpen: false,
              isOff: status.isOff,
              message: status.message,
              nextOpenTime: status.nextOpenTime,
              currentDayHours: status.currentDayHours,
            },
          });
          return;
        }
      }

      const unavailableItems = await validateCartItemsForBranch({
        prisma: db.getPrisma(),
        branchId,
        cartItems,
      });
      if (unavailableItems.length > 0) {
        console.error(
          `Order rejected: items not available for branch ${branchId}`,
          { unavailableItems }
        );
        res.status(400).json({
          success: false,
          error: "One or more selected items are not available in this branch",
          data: { unavailableItems },
        });
        return;
      }

      const effectiveDeliveryFee = orderType === "PICKUP" ? 0 : deliveryFee || 0;

      // When merging, we'll use the existing order's delivery fee for order storage
      let mergePreservedDeliveryFee: number | null = null;

      // If merging, validate the existing order
      let existingOrder = null;
      if (mergeWithOrderId) {
        existingOrder = await db.getPrisma().order.findUnique({
          where: { id: mergeWithOrderId },
          include: {
            orderItems: {
              include: {
                orderItemAddOns: true,
              },
            },
          },
        });

        if (!existingOrder) {
          res.status(404).json({
            success: false,
            error: "Order to merge not found",
          });
          return;
        }

        if (existingOrder.userId !== req.user?.id) {
          res.status(403).json({
            success: false,
            error: "You can only merge your own orders",
          });
          return;
        }

      if (existingOrder.orderType && existingOrder.orderType !== orderType) {
        res.status(400).json({
          success: false,
          error: "Cannot merge pickup and delivery orders together",
        });
        return;
      }

        if (
          ![
            "PENDING",
            "CONFIRMED",
            "PREPARING",
            "READY_FOR_DELIVERY",
            "READY_FOR_PICKUP",
          ].includes(existingOrder.status)
        ) {
          res.status(400).json({
            success: false,
            error:
              "Order cannot be merged - it's already out for delivery or completed",
          });
          return;
        }

        // Validate scheduled order merge rules
        const globalSettings = await db.getPrisma().settings.findFirst();
        if (globalSettings) {
          const { getEffectiveScheduledOrderMergeSettings, validateScheduledOrderMerge } = await import(
            "../utils/branchConfigHelper"
          );
          const mergeSettings = getEffectiveScheduledOrderMergeSettings(branch as any, globalSettings);
          const scheduledMergeValidation = validateScheduledOrderMerge(
            {
              scheduledDate: existingOrder.scheduledDate,
              isScheduledOrder: existingOrder.isScheduledOrder,
            },
            scheduledDate,
            mergeSettings
          );

          if (!scheduledMergeValidation.valid) {
            res.status(400).json({
              success: false,
              error: scheduledMergeValidation.error,
            });
            return;
          }
        }

        // Preserve the existing order's delivery fee for the merged order
        mergePreservedDeliveryFee = existingOrder.deliveryFee 
          ? Number(existingOrder.deliveryFee) 
          : 0;
      }

      // Generate unique order number (only if creating new order)
      const orderNumber = mergeWithOrderId
        ? existingOrder!.orderNumber
        : `COD-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)
            .toUpperCase()}`;

      // Validate that all meal IDs exist
      const mealIds = cartItems
        .filter((item: any) => !(item?.dealId || item?.itemType === "DEAL" || item?.itemType === "VOUCHER"))
        .map((item: any) => item.mealId || item.id);
      if (mealIds.length > 0) {
        const existingMeals = await db.getPrisma().meal.findMany({
          where: { id: { in: mealIds } },
          select: { id: true },
        });

        if (existingMeals.length !== mealIds.length) {
          res.status(400).json({
            success: false,
            error: "Some meal items are not available",
          });
          return;
        }
      }

      const dealIds = cartItems
        .filter((item: any) => item?.dealId || item?.itemType === "DEAL")
        .map((item: any) => item.dealId)
        .filter(Boolean);
      if (dealIds.length > 0) {
        const existingDeals = await (db.getPrisma() as any).deal.findMany({
          where: { id: { in: dealIds }, isActive: true },
          select: { id: true },
        });
        if (existingDeals.length !== dealIds.length) {
          res.status(400).json({
            success: false,
            error: "Some deal items are not available",
          });
          return;
        }
      }

      // Get user information
      const user = await db.getPrisma().user.findUnique({
        where: { id: req.user?.id },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });

      // If merging, combine existing order items with new cart items
      let allCartItems = [...cartItems];
      let newItemsForNotification: any[] = [];
      if (mergeWithOrderId && existingOrder) {
        // Fetch names for new items (meals + deals)
        const newMealIds = cartItems
          .filter((item: any) => !(item?.dealId || item?.itemType === "DEAL"))
          .map((item: any) => item.mealId || item.id)
          .filter(Boolean);
        const newDealIds = cartItems
          .filter((item: any) => item?.dealId || item?.itemType === "DEAL")
          .map((item: any) => item.dealId)
          .filter(Boolean);

        const [newMeals, newDeals] = await Promise.all([
          newMealIds.length > 0
            ? db.getPrisma().meal.findMany({
                where: { id: { in: newMealIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          newDealIds.length > 0
            ? (db.getPrisma() as any).deal.findMany({
                where: { id: { in: newDealIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
        ]);

        // Track which items are new (for notification)
        newItemsForNotification = cartItems.map((item: any) => {
          if (item?.dealId || item?.itemType === "DEAL") {
            const deal = (newDeals as any[]).find((d) => d.id === item.dealId);
            return {
              dealId: item.dealId,
              itemType: "DEAL",
              name: deal?.name || item.name || "Unknown Deal",
              quantity: item.quantity,
              addOns: (item.addOns || []).map((addon: any) => addon.name || addon.id),
            };
          }

          const mealId = item.mealId || item.id;
          const meal = (newMeals as any[]).find((m) => m.id === mealId);
          return {
            mealId,
            itemType: "MEAL",
            name: meal?.name || item.name || "Unknown Meal",
            quantity: item.quantity,
            size: item.size || item.sizeName || undefined,
            addOns: (item.addOns || []).map((addon: any) => addon.name || addon.id),
          };
        });

        // Convert existing order items to cart item format
        // Note: orderItemAddOn.quantity is stored as total quantity across the meal quantity
        // (addon qty per meal * meal qty). Our calculators expect addon quantity per meal.
        const existingItems = existingOrder.orderItems
          .filter((oi: any) => oi.itemType === "MEAL" || oi.itemType === "DEAL")
          .map((oi: any) => {
            if (oi.itemType === "DEAL") {
              return {
                itemType: "DEAL",
                dealId: oi.dealId,
                id: oi.dealId,
                quantity: oi.quantity,
                basePrice: parseFloat(oi.unitPrice?.toString?.() || "0"),
                specialInstructions: oi.specialInstructions || undefined,
                addOns: (oi.orderItemAddOns || []).map((addon: any) => {
                  const parentQty = oi.quantity ? Number(oi.quantity) : 1;
                  const totalAddonQty = addon.quantity ? Number(addon.quantity) : 0;
                  const perParentQty = parentQty > 0 ? totalAddonQty / parentQty : totalAddonQty;
                  return {
                    id: addon.addon_id,
                    name: addon.addOnName,
                    price: parseFloat(addon.addOnPrice?.toString?.() || "0"),
                    quantity: perParentQty,
                    type: addon.addon_type,
                  };
                }),
              };
            }

            return {
              itemType: "MEAL",
              mealId: oi.mealId,
              id: oi.mealId,
              quantity: oi.quantity,
              basePrice: parseFloat(oi.unitPrice.toString()),
              size: oi.selectedSize || undefined,
              sizeName: oi.selectedSize || undefined,
              sizePrice: 0, // Size price already included in unitPrice
              specialInstructions: oi.specialInstructions || undefined,
              addOns: (oi.orderItemAddOns || []).map((addon: any) => {
                const mealQty = oi.quantity ? Number(oi.quantity) : 1;
                const totalAddonQty = addon.quantity ? Number(addon.quantity) : 0;
                const perMealQty = mealQty > 0 ? totalAddonQty / mealQty : totalAddonQty;
                return {
                  id: addon.addon_id,
                  name: addon.addOnName,
                  price: parseFloat(addon.addOnPrice.toString()),
                  quantity: perMealQty,
                  type: addon.addon_type,
                };
              }),
            };
          });

        allCartItems = [...existingItems, ...cartItems];
      }

      // Resolve meal size types for all items once to avoid repeated lookups
      const uniqueMealIds = Array.from(
        new Set(
          allCartItems
            .filter((item: any) => !(item?.dealId || item?.itemType === "DEAL" || item?.itemType === "VOUCHER"))
            .map((item: any) => item.mealId || item.id)
        )
      );
      const mealsWithSizes = await db.getPrisma().meal.findMany({
        where: { id: { in: uniqueMealIds } },
        select: {
          id: true,
          mealSizes: { select: { name: true, sizeType: true, price: true } },
        },
      });
      const mealSizeTypeMap = new Map<
        string,
        { name: string; sizeType: SizeType; price: number }[]
      >(
        mealsWithSizes.map((m) => [
          m.id,
          m.mealSizes.map((s) => ({
            name: s.name,
            sizeType: s.sizeType as SizeType,
            price: Number(s.price || 0),
          })),
        ])
      );

      allCartItems = allCartItems.map((item: any) => {
        if (item?.dealId || item?.itemType === "DEAL") {
          return {
            ...item,
            mealSizeType: item.mealSizeType || (SizeType.M as SizeType),
            mealSizePrice: item.mealSizePrice || 0,
          };
        }
        if (item?.itemType === "VOUCHER") {
          return {
            ...item,
            mealSizeType: SizeType.M,
            mealSizePrice: 0,
          };
        }
        const mealId = item.mealId || item.id;
        const sizes = mealSizeTypeMap.get(mealId) || [];
        const matchedSize = sizes.find((s) => s.name === item.size);
        const mealSizeType = matchedSize?.sizeType || (SizeType.M as SizeType);
        const mealSizePrice = matchedSize ? matchedSize.price : 0;
        return {
          ...item,
          mealSizeType,
          mealSizePrice,
        };
      });

      // Validate deliverable weight for today (orders + reservations)
      const today = new Date();
      const weightValidation = await deliverableQuantityService.validateOrderWeight(
        allCartItems
          .filter((item: any) => !(item?.dealId || item?.itemType === "DEAL" || item?.itemType === "VOUCHER"))
          .map((item: any) => ({
            mealId: item.mealId || item.id,
            mealSizeType: item.mealSizeType as SizeType,
            quantity: item.quantity,
          })),
        branchId,
        today
      );
      if (!weightValidation.ok) {
        res.status(400).json({
          success: false,
          error:
            weightValidation.failures.join("; ") ||
            "Insufficient deliverable quantity for one or more items.",
        });
        return;
      }

      // Calculate all order totals from scratch using branch-specific prices and taxes
      // When merging, use the preserved delivery fee from the original order
      const deliveryFeeForCalculation = mergeWithOrderId && mergePreservedDeliveryFee !== null
        ? mergePreservedDeliveryFee
        : effectiveDeliveryFee;
      
      const orderCalculation = await calculateOrderTotals(
        allCartItems,
        branchId,
        deliveryFeeForCalculation,
        orderType as "DELIVERY" | "PICKUP"
      );

      // Validate minimum order amount for scheduled orders (skip when merging)
      if (scheduledDate && isScheduledOrder && !mergeWithOrderId) {
        const globalSettingsForMinAmount = await db.getPrisma().settings.findFirst({
          select: { scheduledOrderMinimumAmount: true },
        });
        const effectiveMinAmount =
          (branch as any)?.scheduledOrderMinimumAmount !== null &&
          (branch as any)?.scheduledOrderMinimumAmount !== undefined
            ? Number((branch as any).scheduledOrderMinimumAmount)
            : Number(globalSettingsForMinAmount?.scheduledOrderMinimumAmount ?? 0);

        if (effectiveMinAmount > 0 && orderCalculation.finalTotal < effectiveMinAmount) {
          res.status(400).json({
            success: false,
            error: `Minimum order amount for scheduled orders is ${effectiveMinAmount}. Your order total is ${orderCalculation.finalTotal}.`,
          });
          return;
        }
      }

      const globalSettingsForOrderStatus = await db.getPrisma().settings.findFirst({
        select: { scheduledOrderAutoConfirm: true },
      });
      const effectiveScheduledOrderAutoConfirm =
        (branch as any)?.scheduledOrderAutoConfirm !== null &&
        (branch as any)?.scheduledOrderAutoConfirm !== undefined
          ? Boolean((branch as any).scheduledOrderAutoConfirm)
          : Boolean((globalSettingsForOrderStatus as any)?.scheduledOrderAutoConfirm ?? true);
      const initialStatus =
        scheduledDate && isScheduledOrder && !effectiveScheduledOrderAutoConfirm
          ? ("PENDING" as const)
          : ("CONFIRMED" as const);

      let defaultPreparationTime: number | null = null;
      if (initialStatus === "CONFIRMED") {
        const prepFromBranch = (branch as any)?.orderPreparationTime;
        if (prepFromBranch !== null && prepFromBranch !== undefined && Number(prepFromBranch) > 0) {
          defaultPreparationTime = Number(prepFromBranch);
        } else {
          const prepFromSettings = await db.getPrisma().settings.findFirst({
            where: { organizationId: (branch as any)?.organizationId } as any,
            select: { orderPreparationTime: true },
          });
          if (
            prepFromSettings?.orderPreparationTime !== null &&
            prepFromSettings?.orderPreparationTime !== undefined &&
            Number(prepFromSettings.orderPreparationTime) > 0
          ) {
            defaultPreparationTime = Number(prepFromSettings.orderPreparationTime);
          }
        }
      }

      // Get tax calculator and settings for order item creation
      const taxCalculator = new TaxCalculator();
      const settings = await db.getPrisma().settings.findFirst({
        select: { taxInclusive: true },
      });
      const branchTaxInclusive = branchId
        ? await db.getPrisma().branch.findUnique({
            where: { id: branchId },
            select: { taxInclusive: true },
          })
        : null;
      const taxInclusive =
        branchTaxInclusive?.taxInclusive !== null &&
        branchTaxInclusive?.taxInclusive !== undefined
          ? Boolean(branchTaxInclusive.taxInclusive)
          : Boolean(settings?.taxInclusive || false);

      let order;
      if (mergeWithOrderId && existingOrder) {
        // Delete existing order items and addons
        await db.getPrisma().orderItemAddOn.deleteMany({
          where: {
            orderItem: {
              orderId: existingOrder.id,
            },
          },
        });
        await db.getPrisma().orderItem.deleteMany({
          where: { orderId: existingOrder.id },
        });

        // Update the order
        order = await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: ({
            isMerged: true,
            mergedAt: new Date(),
            orderType: orderType as any,
            branchId: branchId || existingOrder.branchId,
            taxInclusive,
            totalAmount: orderCalculation.finalTotal,
            deliveryFee: orderCalculation.deliveryFee,
            takeawayServiceFee: orderType === "PICKUP" ? orderCalculation.takeawayServiceFee : null,
            takeawayServiceTaxPercentage:
              orderType === "PICKUP"
                ? orderCalculation.takeawayServiceTaxPercentage
                : 0,
            takeawayServiceTaxAmount:
              orderType === "PICKUP" ? orderCalculation.takeawayServiceTaxAmount : 0,
            taxAmount: orderCalculation.totalTaxAmount,
            itemTaxAmount: orderCalculation.itemTaxAmount,
            addonTaxAmount: orderCalculation.addonTaxAmount,
            deliveryTaxAmount: orderCalculation.deliveryTaxAmount,
            deliveryDistanceKm:
              orderType === "PICKUP" ? null : (deliveryDistanceKm !== null && deliveryDistanceKm !== undefined
                ? Number(deliveryDistanceKm)
                : (existingOrder as any).deliveryDistanceKm ?? null),
            deliveryAddress: orderType === "PICKUP" ? null : deliveryAddress,
            deliveryStreetAddress:
              orderType === "PICKUP" ? null : deliveryStreetAddress || null,
            deliveryHouseNumber:
              orderType === "PICKUP" ? null : deliveryHouseNumber || null,
            deliveryPostalCode:
              orderType === "PICKUP" ? null : deliveryPostalCode || null,
            deliveryBuilding:
              orderType === "PICKUP" ? null : deliveryBuilding || null,
            deliveryFloor: orderType === "PICKUP" ? null : deliveryFloor || null,
            deliveryApartment:
              orderType === "PICKUP" ? null : deliveryApartment || null,
            deliveryExtraDetails:
              orderType === "PICKUP" ? null : deliveryExtraDetails || null,
            deliveryPhone: orderType === "PICKUP" ? null : deliveryPhone,
            deliveryNotes:
              orderType === "PICKUP"
                ? (deliveryNotes || existingOrder.deliveryNotes || null)
                : deliveryNotes || existingOrder.deliveryNotes || null,
            pickupPhone: orderType === "PICKUP" ? pickupPhone || null : null,
            pickupNotes:
              orderType === "PICKUP"
                ? pickupNotes || null
                : existingOrder.pickupNotes || null,
            orderItems: {
              create: await Promise.all(
                allCartItems.map(async (item: any) => {
                  if (item?.itemType === "VOUCHER") {
                    const taxPercentage = Number(item.vatRate || 0);
                    let taxPerUnit = 0;
                    const finalMealPrice = item.price || 0;
                    if (taxPercentage > 0) {
                      if (taxInclusive) {
                        taxPerUnit = (finalMealPrice * taxPercentage) / (100 + taxPercentage);
                      } else {
                        taxPerUnit = (finalMealPrice * taxPercentage) / 100;
                      }
                    }
                    const taxAmount = taxPerUnit * item.quantity;
                    return {
                      itemType: "MEAL",
                      mealId: null,
                      quantity: item.quantity,
                      unitPrice: finalMealPrice,
                      totalPrice: finalMealPrice * item.quantity,
                      taxAmount: Math.round(taxAmount * 100) / 100,
                      taxPercentage: taxPercentage,
                      selectedSize: null,
                      mealSizeType: "M",
                      specialInstructions: item.specialInstructions || "Gutschein Verkauf: Code-Details auf dem Beleg",
                    };
                  }
                  if (item?.dealId || item?.itemType === "DEAL") {
                    const prismaAny = db.getPrisma() as any;
                    const dealId = item.dealId;
                    const dealQty = Number(item.quantity || 1);
                    const deal = await prismaAny.deal.findUnique({
                      where: { id: dealId },
                      include: {
                        components: {
                          include: {
                            branchPrices: branchId
                              ? {
                                  where: { branchId: branchId as string },
                                  select: { price: true, taxPercentage: true },
                                }
                              : false,
                          },
                        },
                      },
                    });

                    const components = Array.isArray(deal?.components) ? deal.components : [];

                    const baseUnitPrice = components.reduce((sum: number, c: any) => {
                      const override =
                        Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                          ? c.branchPrices[0]
                          : null;
                      const unitPrice = override ? Number(override.price) : Number(c.price);
                      const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
                      const qty = Number.isFinite(q) && q > 0 ? q : 1;
                      return sum + unitPrice * qty;
                    }, 0);

                    const addonsTotal = await Promise.all(
                      (item.addOns || []).map(async (addOn: any) => {
                        const addonBasePrice = await getAddonBasePrice(addOn.id, branchId);
                        const addOnQuantity = addOn.quantity || 1;
                        return addonBasePrice * addOnQuantity;
                      })
                    );
                    const totalAddonsPrice = addonsTotal.reduce((sum, price) => sum + price, 0);

                    // Deal item tax = sum(component taxes) for the whole deal line (addons have their own tax rows)
                    const componentTaxAmount = components.reduce((sum: number, c: any) => {
                      const override =
                        Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                          ? c.branchPrices[0]
                          : null;
                      const unitPrice = override ? Number(override.price) : Number(c.price);
                      const taxPct =
                        override && override.taxPercentage !== null && override.taxPercentage !== undefined
                          ? Number(override.taxPercentage)
                          : Number(c.taxPercentage);
                      const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
                      const qty = Number.isFinite(q) && q > 0 ? q : 1;

                      const taxPerUnit = taxInclusive
                        ? (unitPrice * taxPct) / (100 + taxPct)
                        : (unitPrice * taxPct) / 100;
                      return sum + taxPerUnit * qty;
                    }, 0);

                    const lineTaxAmount = componentTaxAmount * dealQty;

                    return {
                      itemType: "DEAL",
                      dealId,
                      quantity: dealQty,
                      unitPrice: baseUnitPrice,
                      totalPrice: (baseUnitPrice + totalAddonsPrice) * dealQty,
                      taxAmount: Math.round(lineTaxAmount * 100) / 100,
                      taxPercentage: 0,
                      specialInstructions: item.specialInstructions,
                    };
                  }

                  const taxPercentage =
                    await taxCalculator.getMealTaxPercentage(
                      item.mealId || item.id,
                      item.size,
                      branchId // branchId for branch-specific tax rates
                    );

                  // Get branch-specific meal base price
                  const mealBasePrice = await getMealBasePrice(
                    item.mealId || item.id,
                    branchId
                  );

                  // Use resolved meal size type and price (default M)
                  const mealSizeType =
                    (item.mealSizeType as "S" | "M" | "L" | "XL" | null) || "M";
                  const finalMealPrice = mealBasePrice + Number(item.mealSizePrice || 0);

                  // Get branch-specific addon prices
                  const addonsTotal = await Promise.all(
                    (item.addOns || []).map(async (addOn: any) => {
                      const addonBasePrice = await getAddonBasePrice(addOn.id, branchId);
                      const addOnQuantity = addOn.quantity || 1;
                      return addonBasePrice * addOnQuantity;
                    })
                  );
                  const totalAddonsPrice = addonsTotal.reduce((sum, price) => sum + price, 0);

                  const mealPriceTotal = finalMealPrice * item.quantity;
                  const totalPrice = mealPriceTotal + totalAddonsPrice * item.quantity;

                  let taxPerUnit = 0;
                  if (taxInclusive) {
                    taxPerUnit =
                      (finalMealPrice * taxPercentage) / (100 + taxPercentage);
                  } else {
                    taxPerUnit = (finalMealPrice * taxPercentage) / 100;
                  }
                  const taxAmount = taxPerUnit * item.quantity;

                  return {
                    itemType: "MEAL",
                    mealId: item.mealId || item.id,
                    quantity: item.quantity,
                    unitPrice: finalMealPrice,
                    totalPrice,
                    taxAmount: Math.round(taxAmount * 100) / 100,
                    taxPercentage: taxPercentage,
                    selectedSize: item.size,
                    mealSizeType,
                    specialInstructions: item.specialInstructions,
                  };
                })
              ),
            },
          } as any),
          include: {
            user: true,
            orderItems: {
              include: {
                meal: true,
              },
            },
          },
        });
        
      } else {
        let voucherDeduction = 0;
        let voucher = null;
        let isSinglePurposeVoucher = false;
        if (appliedVoucherCode && typeof appliedVoucherCode === "string" && appliedVoucherCode.trim().length > 0) {
          const code = appliedVoucherCode.trim();
          voucher = await db.getPrisma().voucher.findUnique({
            where: { voucherCode: code },
          });
          if (!voucher) {
            res.status(404).json({ success: false, error: "Voucher not found" });
            return;
          }
          if (voucher.status === "REDEEMED" || Number(voucher.currentAmount) <= 0) {
            res.status(400).json({ success: false, error: "Voucher already fully redeemed" });
            return;
          }
          if (voucher.status === "VOIDED") {
            res.status(400).json({ success: false, error: "Voucher has been voided" });
            return;
          }
          if (new Date(voucher.expiresAt) < new Date()) {
            res.status(400).json({ success: false, error: "Voucher has expired" });
            return;
          }
          isSinglePurposeVoucher = voucher.voucherType === "SINGLE_PURPOSE";
          const { calculateVoucherDeduction } = await import("../utils/voucherHelper");
          voucherDeduction = calculateVoucherDeduction(voucher, orderCalculation);
          if (voucherDeduction <= 0) {
            res.status(400).json({ success: false, error: "No items in the order match this single-purpose voucher's VAT rate" });
            return;
          }
        }

        // For single-purpose vouchers covering full order, set tax to 0 (tax already paid at issuance)
        let finalOrderCalculation = orderCalculation;
        if (isSinglePurposeVoucher && voucherDeduction >= orderCalculation.finalTotal) {
          finalOrderCalculation = {
            ...orderCalculation,
            totalTaxAmount: 0,
            itemTaxAmount: 0,
            addonTaxAmount: 0,
            deliveryTaxAmount: 0,
            takeawayServiceTaxAmount: 0,
            finalTotal: orderCalculation.subtotal + orderCalculation.deliveryFee + orderCalculation.takeawayServiceFee,
          };
        }

        // Create new COD order
        const shouldAttachToBusinessDay = !(isScheduledOrder && scheduledDate);
        const openSession = shouldAttachToBusinessDay
          ? await this.businessDayService.getOrCreateOpenSession(branchId)
          : null;
        order = await db.getPrisma().$transaction(async (tx: any) => {
          const createdOrder = await tx.order.create({
          data: ({
            orderType: orderType as any,
            orderNumber,
            userId: req.user?.id,
            branchId,
            businessDaySessionId: openSession?.id || null,
            taxInclusive,
            totalAmount: finalOrderCalculation.finalTotal,
            currency: String((branch as any)?.currency || "EUR").toUpperCase(),
            deliveryFee: finalOrderCalculation.deliveryFee,
            takeawayServiceFee: orderType === "PICKUP" ? finalOrderCalculation.takeawayServiceFee : null,
            takeawayServiceTaxPercentage:
              orderType === "PICKUP"
                ? finalOrderCalculation.takeawayServiceTaxPercentage
                : 0,
            takeawayServiceTaxAmount:
              orderType === "PICKUP" ? finalOrderCalculation.takeawayServiceTaxAmount : 0,
            taxAmount: finalOrderCalculation.totalTaxAmount,
            itemTaxAmount: finalOrderCalculation.itemTaxAmount,
            addonTaxAmount: finalOrderCalculation.addonTaxAmount,
            deliveryTaxAmount: finalOrderCalculation.deliveryTaxAmount,
            deliveryDistanceKm:
              orderType === "PICKUP" ? null : (deliveryDistanceKm !== null && deliveryDistanceKm !== undefined
                ? Number(deliveryDistanceKm)
                : null),
            status: initialStatus,
            confirmedAt: initialStatus === "CONFIRMED" ? new Date() : null,
            preparationTime: initialStatus === "CONFIRMED" ? defaultPreparationTime : null,
            paymentStatus: (voucherDeduction >= finalOrderCalculation.finalTotal) ? "PAID" : "PENDING",
            paymentMethod: "CASH_ON_DELIVERY",
            voucherPaymentAmount: voucherDeduction,
            voucherCodes: appliedVoucherCode ? [appliedVoucherCode] : [],
            deliveryAddress: orderType === "PICKUP" ? null : deliveryAddress,
            deliveryStreetAddress:
              orderType === "PICKUP" ? null : deliveryStreetAddress || null,
            deliveryHouseNumber:
              orderType === "PICKUP" ? null : deliveryHouseNumber || null,
            deliveryPostalCode:
              orderType === "PICKUP" ? null : deliveryPostalCode || null,
            deliveryBuilding:
              orderType === "PICKUP" ? null : deliveryBuilding || null,
            deliveryFloor: orderType === "PICKUP" ? null : deliveryFloor || null,
            deliveryApartment:
              orderType === "PICKUP" ? null : deliveryApartment || null,
            deliveryExtraDetails:
              orderType === "PICKUP" ? null : deliveryExtraDetails || null,
            deliveryPhone: orderType === "PICKUP" ? null : deliveryPhone,
            deliveryNotes: orderType === "PICKUP" ? null : deliveryNotes,
            pickupPhone: orderType === "PICKUP" ? pickupPhone || null : null,
            pickupNotes: orderType === "PICKUP" ? pickupNotes || null : null,
            guestName: user ? `${user.firstName} ${user.lastName}` : null,
            guestEmail: user?.email || null,
            guestPhone: user?.phone || null,
            scheduledDate: scheduledDate,
            isScheduledOrder: isScheduledOrder,
            ...(replacesOrderId ? ({ replacesOrderId } as any) : {}),
            orderItems: {
              create: await Promise.all(
                allCartItems.map(async (item: any) => {
                  if (item?.itemType === "VOUCHER") {
                    const taxPercentage = Number(item.vatRate || 0);
                    let taxPerUnit = 0;
                    const finalMealPrice = item.price || 0;
                    if (taxPercentage > 0) {
                      if (taxInclusive) {
                        taxPerUnit = (finalMealPrice * taxPercentage) / (100 + taxPercentage);
                      } else {
                        taxPerUnit = (finalMealPrice * taxPercentage) / 100;
                      }
                    }
                    const taxAmount = taxPerUnit * item.quantity;
                    return {
                      itemType: "MEAL",
                      mealId: null,
                      quantity: item.quantity,
                      unitPrice: finalMealPrice,
                      totalPrice: finalMealPrice * item.quantity,
                      taxAmount: Math.round(taxAmount * 100) / 100,
                      taxPercentage: taxPercentage,
                      selectedSize: null,
                      mealSizeType: "M",
                      specialInstructions: item.specialInstructions || "Gutschein Verkauf: Code-Details auf dem Beleg",
                    };
                  }
                  if (item?.dealId || item?.itemType === "DEAL") {
                    const prismaAny = db.getPrisma() as any;
                    const dealId = item.dealId;
                    const dealQty = Number(item.quantity || 1);
                    const deal = await prismaAny.deal.findUnique({
                      where: { id: dealId },
                      include: {
                        components: {
                          include: {
                            branchPrices: branchId
                              ? {
                                  where: { branchId: branchId as string },
                                  select: { price: true, taxPercentage: true },
                                }
                              : false,
                          },
                        },
                      },
                    });

                    const components = Array.isArray(deal?.components) ? deal.components : [];

                    const baseUnitPrice = components.reduce((sum: number, c: any) => {
                      const override =
                        Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                          ? c.branchPrices[0]
                          : null;
                      const unitPrice = override ? Number(override.price) : Number(c.price);
                      const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
                      const qty = Number.isFinite(q) && q > 0 ? q : 1;
                      return sum + unitPrice * qty;
                    }, 0);

                    const addonsTotal = await Promise.all(
                      (item.addOns || []).map(async (addOn: any) => {
                        const addonBasePrice = await getAddonBasePrice(addOn.id, branchId);
                        const addOnQuantity = addOn.quantity || 1;
                        return addonBasePrice * addOnQuantity;
                      })
                    );
                    const totalAddonsPrice = addonsTotal.reduce((sum, price) => sum + price, 0);

                    const componentTaxAmount = components.reduce((sum: number, c: any) => {
                      const override =
                        Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                          ? c.branchPrices[0]
                          : null;
                      const unitPrice = override ? Number(override.price) : Number(c.price);
                      const taxPct =
                        override && override.taxPercentage !== null && override.taxPercentage !== undefined
                          ? Number(override.taxPercentage)
                          : Number(c.taxPercentage);
                      const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
                      const qty = Number.isFinite(q) && q > 0 ? q : 1;

                      const taxPerUnit = taxInclusive
                        ? (unitPrice * taxPct) / (100 + taxPct)
                        : (unitPrice * taxPct) / 100;
                      return sum + taxPerUnit * qty;
                    }, 0);

                    const lineTaxAmount = componentTaxAmount * dealQty;

                    return {
                      itemType: "DEAL",
                      dealId,
                      quantity: dealQty,
                      unitPrice: baseUnitPrice,
                      totalPrice: (baseUnitPrice + totalAddonsPrice) * dealQty,
                      taxAmount: Math.round(lineTaxAmount * 100) / 100,
                      taxPercentage: 0,
                      specialInstructions: item.specialInstructions,
                    };
                  }

                  const taxPercentage =
                    await taxCalculator.getMealTaxPercentage(
                      item.mealId || item.id,
                      item.size,
                      branchId // branchId for branch-specific tax rates
                    );
                  
                  // Get branch-specific meal base price
                  const mealBasePrice = await getMealBasePrice(
                    item.mealId || item.id,
                    branchId
                  );

                  // Use resolved meal size type and price (default M)
                  const mealSizeType =
                    (item.mealSizeType as "S" | "M" | "L" | "XL" | null) || "M";
                  const finalMealPrice = mealBasePrice + Number(item.mealSizePrice || 0);

                  // Get branch-specific addon prices
                  const addonsTotal = await Promise.all(
                    (item.addOns || []).map(async (addOn: any) => {
                      const addonBasePrice = await getAddonBasePrice(addOn.id, branchId);
                      const addOnQuantity = addOn.quantity || 1;
                      return addonBasePrice * addOnQuantity;
                    })
                  );
                  const totalAddonsPrice = addonsTotal.reduce((sum, price) => sum + price, 0);
                  
                  const mealPriceTotal = finalMealPrice * item.quantity;
                  const totalPrice =
                    mealPriceTotal + totalAddonsPrice * item.quantity;

                  let taxPerUnit = 0;
                  if (taxInclusive) {
                    taxPerUnit =
                      (finalMealPrice * taxPercentage) / (100 + taxPercentage);
                  } else {
                    taxPerUnit = (finalMealPrice * taxPercentage) / 100;
                  }
                  const taxAmount = taxPerUnit * item.quantity;

                  return {
                    itemType: "MEAL",
                    mealId: item.mealId || item.id,
                    quantity: item.quantity,
                    unitPrice: finalMealPrice,
                    totalPrice,
                    taxAmount: Math.round(taxAmount * 100) / 100,
                    taxPercentage: taxPercentage,
                    selectedSize: item.size,
                    mealSizeType,
                    specialInstructions: item.specialInstructions,
                  };
                })
              ),
            },
          } as any),
          include: {
            user: true,
            orderItems: {
              include: {
                meal: true,
              },
            },
          },
        });

        if (appliedVoucherCode && voucherDeduction > 0) {
          const { processVoucherRedemption } = await import("../utils/voucherHelper");
          console.log('[OrderController] About to redeem voucher:', {
            orderId: createdOrder.id,
            voucherCode: appliedVoucherCode,
            preRedemptionDeduction: voucherDeduction,
          });
          const redemptionResult = await processVoucherRedemption({
            tx,
            voucherCode: appliedVoucherCode,
            orderCalculation: finalOrderCalculation,
            orderId: createdOrder.id,
          });
          console.log('[OrderController] Voucher redemption result:', {
            orderId: createdOrder.id,
            voucherCode: appliedVoucherCode,
            deduction: redemptionResult.deduction,
            remainingBalance: redemptionResult.remainingBalance,
          });
          // Store remaining balance snapshot
          console.log('[OrderController] Storing voucherRemainingBalances:', {
            orderId: createdOrder.id,
            voucherCode: appliedVoucherCode,
            remainingBalance: redemptionResult.remainingBalance,
          });
          await tx.order.update({
            where: { id: createdOrder.id },
            data: {
              voucherRemainingBalances: {
                [appliedVoucherCode]: redemptionResult.remainingBalance
              }
            }
          });
        }

        return createdOrder;
      });

        // Add history linkage between cancelled-for-modification order and replacement
        if (replacesOrderId) {
          try {
            const oldOrder = await (db.getPrisma().order.findUnique as any)({
              where: { id: replacesOrderId },
              select: { id: true, history: true },
            });
            const oldHistory = ((oldOrder as any)?.history as any[]) || [];
            const newOldHistory = [
              ...oldHistory,
              {
                type: "REPLACED_BY",
                action: "Order replaced by a new order",
                userId: req.user?.id,
                details: { replacementOrderId: order.id },
                timestamp: new Date().toISOString(),
              },
            ];

            await db.getPrisma().order.update({
              where: { id: replacesOrderId },
              data: { history: newOldHistory as any } as any,
            });

            const newHistory = (((order as any).history as any[]) || []).concat([
              {
                type: "CREATED_AS_REPLACEMENT",
                action: "Order created as a replacement for a cancelled order",
                userId: req.user?.id,
                details: { replacedOrderId: replacesOrderId },
                timestamp: new Date().toISOString(),
              },
            ]);
            await db.getPrisma().order.update({
              where: { id: order.id },
              data: { history: newHistory as any } as any,
            });
          } catch {
            // ignore history failures
          }
        }
      }

      // Expand deal cart items into deal-component OrderItem rows (for mixed tax/VAT)
      try {
        const prismaAny = db.getPrisma() as any;
        const dealCartEntries = allCartItems
          .filter((it: any) => it?.dealId || it?.itemType === "DEAL");

        if (dealCartEntries.length > 0) {
          const dealIdsToFetch = Array.from(
            new Set(dealCartEntries.map((it: any) => it.dealId).filter(Boolean))
          );

          const deals = await prismaAny.deal.findMany({
            where: { id: { in: dealIdsToFetch } },
            include: {
              components: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                include: {
                  branchPrices: branchId
                    ? {
                        where: { branchId: branchId as string },
                        select: {
                          id: true,
                          branchId: true,
                          price: true,
                          taxPercentage: true,
                        },
                      }
                    : false,
                },
              },
            },
          });

          const dealById = new Map<string, any>(deals.map((d: any) => [d.id, d]));

          // Re-fetch the just-created DEAL parent rows keyed by dealId.
          // Index-based matching (order.orderItems[idx]) is unreliable because
          // the DB may return rows in a different order than allCartItems.
          const freshDealItems = await prismaAny.orderItem.findMany({
            where: { orderId: (order as any).id, itemType: "DEAL" },
            select: { id: true, dealId: true },
            orderBy: { createdAt: "asc" },
          });

          // Build a queue per dealId so multiple cart lines of the same deal
          // each get their own distinct parent row id (consumed one at a time).
          const dealItemQueueByDealId = new Map<string, string[]>();
          for (const oi of freshDealItems) {
            const key = String(oi.dealId);
            if (!dealItemQueueByDealId.has(key)) dealItemQueueByDealId.set(key, []);
            dealItemQueueByDealId.get(key)!.push(String(oi.id));
          }

          for (const it of dealCartEntries) {
            const queue = dealItemQueueByDealId.get(String(it.dealId));
            const parentOrderItemId = queue?.shift();
            if (!parentOrderItemId) {
              console.warn(`[OrderController] No DEAL parent row found for dealId=${it.dealId} — skipping DEAL_COMPONENT creation`);
              continue;
            }

            const deal = dealById.get(it.dealId);
            if (!deal) continue;

            const qty = Number(it.quantity || 1);
            const childCreates: any[] = [];

            for (const c of deal.components || []) {
              const componentQtyRaw = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
              const componentQty = Number.isFinite(componentQtyRaw) && componentQtyRaw > 0 ? componentQtyRaw : 1;
              const lineQty = qty * componentQty;
              const override =
                Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                  ? c.branchPrices[0]
                  : null;
              const unitPrice = override ? Number(override.price) : Number(c.price);
              const taxPct =
                override && override.taxPercentage !== null && override.taxPercentage !== undefined
                  ? Number(override.taxPercentage)
                  : Number(c.taxPercentage);

              const taxPerUnit = taxInclusive
                ? (unitPrice * taxPct) / (100 + taxPct)
                : (unitPrice * taxPct) / 100;
              const taxAmount = taxPerUnit * lineQty;

              childCreates.push({
                orderId: (order as any).id,
                itemType: "DEAL_COMPONENT",
                dealId: it.dealId,
                dealComponentId: c.id,
                parentDealItemId: parentOrderItemId,
                quantity: lineQty,
                unitPrice,
                totalPrice: unitPrice * lineQty,
                taxPercentage: taxPct,
                taxAmount: Math.round(taxAmount * 100) / 100,
              });
            }

            if (childCreates.length > 0) {
              await prismaAny.orderItem.createMany({ data: childCreates });
            }
          }
        }
      } catch (e) {
        console.error("[OrderController] Failed to create deal component order items:", e);
      }

      // Create add-ons for each order item with tax information
      for (let i = 0; i < allCartItems.length; i++) {
        const item = allCartItems[i];
        if (item?.dealId || item?.itemType === "DEAL") {
          // Deal-level addons are stored on the parent DEAL order item; skip component lines
        }
        if (item.addOns && item.addOns.length > 0) {
          // Use index-based matching since orderItems are created in the same order as allCartItems
          const orderItem = (order as any).orderItems[i];
          if (orderItem) {
            // Get meal size type for this order item
            const mealSizeType = orderItem.mealSizeType || "M";

            await db.getPrisma().orderItemAddOn.createMany({
              data: await Promise.all(
                item.addOns.map(async (addOn: any) => {
                  // Fetch addon with sizes to get the correct price based on meal size
                  const addonData = await db.getPrisma().addOn.findUnique({
                    where: { id: addOn.id },
                    include: { addonSizes: true },
                  });

                  // Get the correct addon size and price based on meal size
                  let addonSizeType: "S" | "M" | "L" | "XL" | null = null;
                  let addonPrice = addOn.price; // Fallback to price from cart

                  // Get branch-specific base price if available
                  let branchBasePrice: number | null = null;
                  if (branchId) {
                    const { getAddonBasePrice } = await import("../utils/addonPriceHelper");
                    branchBasePrice = await getAddonBasePrice(addOn.id, branchId);
                  }

                  if (addonData && addonData.addonSizes.length > 0) {
                    const availableSizes = addonData.addonSizes.map(
                      (s) => s.sizeType
                    ) as Array<"S" | "M" | "L" | "XL">;
                    
                    // First, check if sizeType is provided in the cart item (from React frontend)
                    // Validate it against available sizes
                    if (addOn.sizeType && availableSizes.includes(addOn.sizeType)) {
                      addonSizeType = addOn.sizeType;
                    } else {
                      // Fall back to calculating from meal size type
                      addonSizeType = getNearestSmallerAddonSize(
                        mealSizeType,
                        availableSizes
                      );
                    }

                    if (addonSizeType) {
                      const matchedSize = addonData.addonSizes.find(
                        (s) => s.sizeType === addonSizeType
                      );
                      if (matchedSize) {
                        const originalSizePrice = Number(matchedSize.price);
                        // Get original base price for calculating size differential
                        const originalBasePrice = addonData.price !== null ? Number(addonData.price) : 0;
                        
                        // If branch-specific base price exists, adjust the size price
                        // Formula: adjustedPrice = branchBasePrice + (originalSizePrice - originalBasePrice)
                        // This preserves the size differential while applying the branch-specific base
                        if (branchBasePrice !== null && branchBasePrice > 0) {
                          const sizePriceAdjustment = originalSizePrice - originalBasePrice;
                          addonPrice = branchBasePrice + sizePriceAdjustment;
                        } else {
                          addonPrice = originalSizePrice;
                        }
                      }
                    }
                  } else {
                    // No sizes configured, use branch-specific base price if available
                    if (branchBasePrice !== null && branchBasePrice > 0) {
                      addonPrice = branchBasePrice;
                    }
                    // Default to M
                    addonSizeType = "M";
                  }

                  const addonTaxPercentage =
                    await taxCalculator.getAddonTaxPercentage(
                      addOn.id,
                      branchId // branchId for branch-specific tax rates
                    );
                  // Get addon quantity - properly extract from cart item (for type safety)
                  const addonQuantityPerItem = (addOn.quantity !== undefined && addOn.quantity !== null) 
                    ? Number(addOn.quantity) 
                    : 1;
                  const itemQuantity = item.quantity;
                  // Total quantity = addon quantity per meal item × number of meal items
                  const totalAddonQuantity = addonQuantityPerItem * itemQuantity;

                  let addonTaxAmount = 0;
                  const taxPerAddon = taxInclusive
                    ? (addonPrice * addonTaxPercentage) /
                      (100 + addonTaxPercentage)
                    : (addonPrice * addonTaxPercentage) / 100;
                  addonTaxAmount = taxPerAddon * addonQuantityPerItem * itemQuantity;

                  return {
                    orderItemId: orderItem.id,
                    addon_id: addonData ? addOn.id : null, // Only set addon_id if addon exists in DB
                    addOnName: addOn.name,
                    addOnPrice: addonPrice,
                    taxAmount: Math.round(addonTaxAmount * 100) / 100,
                    taxPercentage: addonTaxPercentage,
                    addon_type: addOn.type || "BOOLEAN",
                    addonSizeType,
                    quantity: totalAddonQuantity, // Store total quantity (per item × meal quantity)
                    addon_description: addOn.description || null,
                  };
                })
              ),
            });
          }
        }
      }

      // Create optional ingredients for each order item
      for (let i = 0; i < allCartItems.length; i++) {
        const item = allCartItems[i];
        if (item?.dealId || item?.itemType === "DEAL") {
          // Deal-level optional ingredients are stored on the parent DEAL order item; skip component lines
        }
        if (item.optionalIngredients && item.optionalIngredients.length > 0) {
          // Use index-based matching since orderItems are created in the same order as allCartItems
          const orderItem = (order as any).orderItems[i];
          if (orderItem) {
            await db.getPrisma().orderItemOptionalIngredient.createMany({
              data: item.optionalIngredients.map((ingredient: any) => ({
                orderItemId: orderItem.id,
                optionalIngredientId: ingredient.id,
                isIncluded: ingredient.isIncluded ?? true,
                ingredientName: ingredient.name,
              })),
            });
          }
        }
      }

      // Create or update notification for order update (if merging) or new order
      let notificationWithOrder;
      if (mergeWithOrderId && existingOrder) {
        // Find existing notification for this order
        const existingNotification = await db
          .getPrisma()
          .notification.findFirst({
            where: { orderId: order.id },
          });

        if (existingNotification) {
          // Update existing notification
          const updatedNotification = await db.getPrisma().notification.update({
            where: { id: existingNotification.id },
            data: {
              isSeen: false, // Reset seen flag
              isOrderUpdate: true, // Mark as order update
              seenAt: null, // Clear seen timestamp
            },
          });

          // Fetch notification with full order details for WebSocket emission
          notificationWithOrder = await db.getPrisma().notification.findUnique({
            where: { id: updatedNotification.id },
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
                      deal: {
                        select: {
                          id: true,
                          name: true,
                          image: true,
                        },
                      },
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
        } else {
          // Create new notification if none exists (shouldn't happen, but safety check)
          const notification = await db.getPrisma().notification.create({
            data: {
              orderId: order.id,
              isSeen: false,
              isOrderUpdate: true,
            },
          });

          notificationWithOrder = await db.getPrisma().notification.findUnique({
            where: { id: notification.id },
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
                      deal: {
                        select: {
                          id: true,
                          name: true,
                          image: true,
                        },
                      },
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
        }
      } else {
        // Create new notification for new order
        const notification = await db.getPrisma().notification.create({
          data: {
            orderId: order.id,
            isSeen: false,
            isOrderUpdate: false,
          },
        });

        // Fetch notification with full order details for WebSocket emission
        notificationWithOrder = await db.getPrisma().notification.findUnique({
          where: { id: notification.id },
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
                    deal: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                      },
                    },
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
      }

      // Create Payment record for COD
      const paymentService = PaymentService.getInstance();
      await paymentService.createPayment({
        orderId: order.id,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentProvider: PaymentProvider.NONE,
        providerPaymentId: null,
        providerChargeId: null,
        amount: orderCalculation.finalTotal,
        currency: String((order as any)?.currency || "EUR").toUpperCase(),
        status: PaymentState.PENDING,
        metadata: { paymentMethod: "cod" },
      });

      // Emit WebSocket event
      const wsService = WebSocketService.getInstance();
      if (mergeWithOrderId) {
        // Emit order update event for admin with merge information
        wsService.emitOrderUpdate(
          notificationWithOrder,
          order,
          newItemsForNotification
        );
      } else {
        // Emit new order event
        wsService.emitNewOrder(notificationWithOrder, order);
      }

      // Safety: cancel pickup/delivery orders if limits are exceeded after this order
      const mealIdsForOrder = Array.from(
        new Set(allCartItems.map((item: any) => item.mealId || item.id))
      );
      const todayForCancellation = new Date();
      for (const mId of mealIdsForOrder) {
        await deliverableQuantityService.cancelPickupDeliveryOrdersIfExceeded(
          branchId,
          mId,
          todayForCancellation
        );
      }

      // Send tablet notification for new COD order (only if not merging)
      if (!mergeWithOrderId && order.branchId) {
        const branch = await db.getPrisma().branch.findUnique({ where: { id: order.branchId }, select: { organizationId: true } });
        await tabletOrderNotificationService.notifyOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
          organizationId: branch?.organizationId || "",
          status: order.status,
          totalAmount: Number(order.totalAmount),
          orderType: order.orderType,
          customerName: user?.firstName + " " + user?.lastName,
        });
      }

      res.json({
        success: true,
        data: {
          order,
          orderNumber: order.orderNumber,
          merged: !!mergeWithOrderId,
        },
      });
    } catch (error) {
      console.error("Error creating COD order:", error);
      const message =
        error && typeof error === "object" && "message" in (error as any)
          ? String((error as any).message)
          : "Failed to create order";
      res.status(500).json({
        success: false,
        error: message || "Failed to create order",
      });
    }
  };

  public createPosOrder = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const {
        id,
        orderNumber: clientOrderNumber,
        createdAt: clientCreatedAt,
        branchId,
        cartItems,
        guestName,
        guestEmail,
        guestPhone,
        paymentMethod,
        paymentStatus,
        serviceMode,
        tableId,
        tableNumber,
        ticketName,
        notes,
        sendToKitchen = true,
        discountType,
        discountValue,
        appliedVoucher,
      } = (req.body || {}) as any;

      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({ success: false, error: "Branch ID is required" });
        return;
      }

      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        res.status(400).json({ success: false, error: "Cart items are required" });
        return;
      }

      const normalizedServiceMode =
        String(serviceMode || "COUNTER_TAKEAWAY").trim().toUpperCase() === "DINE_IN"
          ? "DINE_IN"
          : "COUNTER_TAKEAWAY";

      const requestedPaymentMethod = String(paymentMethod || "CASH").trim().toUpperCase();
      const normalizedPaymentMethod = (() => {
        // POS orders are always PICKUP, so use PICKUP payment methods
        if (requestedPaymentMethod === "CARD" || requestedPaymentMethod === "CARD_ON_DELIVERY") {
          return PaymentMethod.CARD_ON_PICKUP;
        }
        return PaymentMethod.CASH_ON_PICKUP;
      })();

      const normalizedPaymentStatus =
        String(paymentStatus || "PENDING").trim().toUpperCase() === "PAID"
          ? PaymentStatus.PAID
          : PaymentStatus.PENDING;

      const db = DatabaseSingleton.getInstance();
      const prisma: any = db.getPrisma();

      if (id && typeof id === "string") {
        const existingOrder = await prisma.order.findUnique({
          where: { id },
          include: {
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
                deal: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
              },
            },
          },
        });
        if (existingOrder) {
          res.json({
            success: true,
            data: {
              order: existingOrder,
              orderNumber: existingOrder.orderNumber,
            },
          });
          return;
        }
      }

      const branch = await prisma.branch.findFirst({
        where: {
          id: branchId,
          organizationId,
          isActive: true,
        },
      });

      if (!branch) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      const unavailableItems = await validateCartItemsForBranch({
        prisma,
        branchId,
        cartItems,
      });
      if (unavailableItems.length > 0) {
        res.status(400).json({
          success: false,
          error: "One or more selected items are not available in this branch",
          data: { unavailableItems },
        });
        return;
      }

      const taxCalculator = new TaxCalculator();
      const settings = await prisma.settings.findFirst({
        where: { organizationId } as any,
        select: { taxInclusive: true, orderPreparationTime: true },
      });
      const taxInclusive =
        (branch as any)?.taxInclusive !== null && (branch as any)?.taxInclusive !== undefined
          ? Boolean((branch as any).taxInclusive)
          : Boolean((settings as any)?.taxInclusive || false);

      const orderCalculation = await calculateOrderTotals(
        cartItems,
        branchId,
        0,
        "PICKUP"
      );

      // Pre-compute per-item adjustments and derive post-adjustment subtotal.
      // Order-level discount is applied AFTER item-level adjustments have settled.
      const itemAdjustmentResults = await Promise.all(
        cartItems.map(async (item: any) => {
          if (item?.dealId || item?.itemType === "DEAL") {
            const dealId = String(item.dealId);
            const dealQty = Number(item.quantity || 1);
            const dealForAdj = await (prisma as any).deal.findUnique({
              where: { id: dealId },
              include: {
                components: {
                  include: branchId
                    ? { branchPrices: { where: { branchId: branchId as string }, select: { price: true } } }
                    : undefined,
                },
              },
            });
            const comps = Array.isArray(dealForAdj?.components) ? dealForAdj.components : [];
            const dealUnitPrice = comps.reduce((s: number, c: any) => {
              const ov = Array.isArray(c.branchPrices) && c.branchPrices.length > 0 ? c.branchPrices[0] : null;
              const up = ov ? Number(ov.price) : Number(c.price);
              const q = Number(c.quantity) > 0 ? Number(c.quantity) : 1;
              return s + up * q;
            }, 0);
            const addonsAdj = await Promise.all(
              (item.addOns || []).map(async (ao: any) => {
                const p = await getAddonBasePrice(ao.id, branchId);
                return p * Number(ao.quantity || 1);
              })
            );
            const addonsSum = addonsAdj.reduce((s: number, p: number) => s + p, 0);
            return computeItemAdjustments(
              dealUnitPrice + addonsSum,
              dealQty,
              item.itemDiscountType || null,
              item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
              item.itemDiscountScope || "PER_LINE",
              item.itemSurchargeAmount != null ? Number(item.itemSurchargeAmount) : null,
              item.itemSurchargeScope || "PER_LINE"
            );
          }
          if (item?.itemType === "VOUCHER" || String(item?.mealId || "").startsWith("VOUCHER_") || String(item?.id || "").startsWith("VOUCHER_")) {
            const voucherVal = Number(item.price || 0);
            return computeItemAdjustments(
              voucherVal,
              Number(item.quantity || 1),
              item.itemDiscountType || null,
              item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
              item.itemDiscountScope || "PER_LINE",
              item.itemSurchargeAmount != null ? Number(item.itemSurchargeAmount) : null,
              item.itemSurchargeScope || "PER_LINE"
            );
          }
          const mealBP = await getMealBasePrice(item.mealId || item.id, branchId);
          const mealFP = mealBP + Number(item.mealSizePrice || 0);
          const addonsSum = (item.addOns || []).reduce((s: number, ao: any) => {
            return s + Number(ao.price ?? 0) * Number(ao.quantity || 1);
          }, 0);
          return computeItemAdjustments(
            mealFP + addonsSum,
            Number(item.quantity || 1),
            item.itemDiscountType || null,
            item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
            item.itemDiscountScope || "PER_LINE",
            item.itemSurchargeAmount != null ? Number(item.itemSurchargeAmount) : null,
            item.itemSurchargeScope || "PER_LINE"
          );
        })
      );

      // Post-adjustment subtotal: sum of all adjusted totalPrices
      const adjustedSubtotal = Math.round(
        itemAdjustmentResults.reduce((s, r) => s + r.totalPrice, 0) * 100
      ) / 100;

      const normalizedDiscountType =
        discountType === "FIXED" || discountType === "PERCENTAGE" ? discountType : null;
      const { discountAmount, discountedSubtotal } = applyDiscount(
        adjustedSubtotal,
        normalizedDiscountType,
        discountValue
      );

      // Tax is proportional to subtotal; scale all tax amounts by the discount ratio.
      const discountRatio = orderCalculation.subtotal > 0
        ? discountedSubtotal / orderCalculation.subtotal
        : 1;
      const discountedItemTaxAmount = Math.round(orderCalculation.itemTaxAmount * discountRatio * 100) / 100;
      const discountedAddonTaxAmount = Math.round(orderCalculation.addonTaxAmount * discountRatio * 100) / 100;
      const discountedTotalTaxAmount = Math.round(orderCalculation.totalTaxAmount * discountRatio * 100) / 100;
      const adjustedFinalTotal = Math.max(
        Math.round(
          (taxInclusive
            ? discountedSubtotal
                + orderCalculation.takeawayServiceFee
            : discountedSubtotal
                + discountedItemTaxAmount
                + discountedAddonTaxAmount
                + orderCalculation.takeawayServiceFee
                + orderCalculation.takeawayServiceTaxAmount
          ) * 100
        ) / 100,
        0
      );

      let defaultPreparationTime: number | null = null;
      const prepFromBranch = (branch as any)?.orderPreparationTime;
      if (prepFromBranch !== null && prepFromBranch !== undefined && Number(prepFromBranch) > 0) {
        defaultPreparationTime = Number(prepFromBranch);
      } else if (
        (settings as any)?.orderPreparationTime !== null &&
        (settings as any)?.orderPreparationTime !== undefined &&
        Number((settings as any).orderPreparationTime) > 0
      ) {
        defaultPreparationTime = Number((settings as any).orderPreparationTime);
      }

      const openSession = await this.businessDayService.getOrCreateOpenSession(branchId);
      const cashierUserId = String((req as any)?.rbacUser?.id || "").trim() || null;
      const orderNumber = clientOrderNumber || `POS-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const initialStatus = sendToKitchen ? ("CONFIRMED" as const) : ("PENDING" as const);

      const isCompletedTakeaway = normalizedServiceMode !== "DINE_IN" && normalizedPaymentStatus === PaymentStatus.PAID;
      const isOfflineSync = Boolean(id && clientOrderNumber?.startsWith("OFFLINE-"));
      const status = (isCompletedTakeaway || isOfflineSync) ? ("PICKED_UP" as const) : initialStatus;

      // Handle voucher payment and tax adjustment for single-purpose vouchers
      let voucherPaymentAmount = appliedVoucher?.amount ? Number(appliedVoucher.amount) : 0;
      let voucherCodes = appliedVoucher?.voucherCode ? [appliedVoucher.voucherCode] : [];
      let finalTaxAmount = discountedTotalTaxAmount;
      let finalItemTaxAmount = discountedItemTaxAmount;
      let finalAddonTaxAmount = discountedAddonTaxAmount;
      let finalTotalAmount = adjustedFinalTotal;

      if (appliedVoucher?.voucherCode && voucherPaymentAmount > 0) {
        const voucher = await prisma.voucher.findUnique({
          where: { voucherCode: appliedVoucher.voucherCode },
        });
        if (voucher && voucher.voucherType === "SINGLE_PURPOSE" && voucherPaymentAmount >= adjustedFinalTotal) {
          // Single-purpose voucher covering full order - set tax to 0 (tax already paid at issuance)
          finalTaxAmount = 0;
          finalItemTaxAmount = 0;
          finalAddonTaxAmount = 0;
          finalTotalAmount = discountedSubtotal + orderCalculation.takeawayServiceFee;
        }
      }

      const order = await prisma.order.create({
        data: {
          id: id || undefined,
          createdAt: clientCreatedAt ? new Date(clientCreatedAt) : undefined,
          orderType: "PICKUP",
          isPosOrder: true,
          orderNumber,
          userId: null,
          branchId,
          businessDaySessionId: openSession?.id || null,
          taxInclusive,
          totalAmount: finalTotalAmount,
          currency: String((branch as any)?.currency || "USD").toUpperCase(),
          deliveryFee: 0,
          takeawayServiceFee: orderCalculation.takeawayServiceFee,
          takeawayServiceTaxPercentage: orderCalculation.takeawayServiceTaxPercentage,
          takeawayServiceTaxAmount: orderCalculation.takeawayServiceTaxAmount,
          taxAmount: finalTaxAmount,
          itemTaxAmount: finalItemTaxAmount,
          addonTaxAmount: finalAddonTaxAmount,
          discountType: normalizedDiscountType,
          discountValue: normalizedDiscountType ? (Number(discountValue) || 0) : null,
          discountAmount,
          voucherPaymentAmount,
          voucherCodes,
          deliveryTaxAmount: 0,
          status,
          confirmedAt: (status === "CONFIRMED" || status === "PICKED_UP") ? new Date() : null,
          preparationTime: (status === "CONFIRMED" || status === "PICKED_UP") ? defaultPreparationTime : null,
          paymentStatus: normalizedPaymentStatus,
          paymentMethod: normalizedPaymentMethod,
          pickupPhone: guestPhone ? String(guestPhone) : null,
          pickupNotes: notes ? String(notes) : null,
          guestName: guestName ? String(guestName) : null,
          guestEmail: guestEmail ? String(guestEmail) : null,
          guestPhone: guestPhone ? String(guestPhone) : null,
          history: [
            {
              type: "POS_CREATED",
              action: "Order created from tablet POS",
              userId: cashierUserId,
              timestamp: new Date().toISOString(),
              details: {
                channel: "POS",
                serviceMode: normalizedServiceMode,
                tableId: tableId ? String(tableId) : null,
                tableNumber: tableNumber ? String(tableNumber) : null,
                ticketName: ticketName ? String(ticketName) : null,
                notes: notes ? String(notes) : null,
              },
            },
          ] as any,
          orderItems: {
            create: await Promise.all(
              cartItems.map(async (item: any) => {
                if (item?.itemType === "VOUCHER") {
                  const taxPercentage = Number(item.vatRate || 0);
                  let taxPerUnit = 0;
                  const finalMealPrice = item.price || 0;
                  if (taxPercentage > 0) {
                    if (taxInclusive) {
                      taxPerUnit = (finalMealPrice * taxPercentage) / (100 + taxPercentage);
                    } else {
                      taxPerUnit = (finalMealPrice * taxPercentage) / 100;
                    }
                  }
                  const taxAmount = taxPerUnit * item.quantity;
                  return {
                    itemType: "VOUCHER",
                    mealId: null,
                    quantity: item.quantity,
                    unitPrice: finalMealPrice,
                    totalPrice: finalMealPrice * item.quantity,
                    taxAmount: Math.round(taxAmount * 100) / 100,
                    taxPercentage: taxPercentage,
                    selectedSize: null,
                    mealSizeType: "M",
                    specialInstructions: item.specialInstructions || item.name || "Gutschein Verkauf: Code-Details auf dem Beleg",
                  };
                }
                if (item?.dealId || item?.itemType === "DEAL") {
                  const dealId = item.dealId;
                  const dealQty = Number(item.quantity || 1);
                  const deal = await prisma.deal.findUnique({
                    where: { id: dealId },
                    include: {
                      components: {
                        include: {
                          branchPrices: branchId
                            ? {
                                where: { branchId: branchId as string },
                                select: { price: true, taxPercentage: true },
                              }
                            : false,
                        },
                      },
                    },
                  });

                  const components = Array.isArray(deal?.components) ? deal.components : [];
                  const baseUnitPrice = components.reduce((sum: number, c: any) => {
                    const override =
                      Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                        ? c.branchPrices[0]
                        : null;
                    const unitPrice = override ? Number(override.price) : Number(c.price);
                    const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
                    const qty = Number.isFinite(q) && q > 0 ? q : 1;
                    return sum + unitPrice * qty;
                  }, 0);

                  const addonsTotal = await Promise.all(
                    (item.addOns || []).map(async (addOn: any) => {
                      const addonBasePrice = await getAddonBasePrice(addOn.id, branchId);
                      return addonBasePrice * Number(addOn.quantity || 1);
                    })
                  );
                  const totalAddonsPrice = addonsTotal.reduce((sum, price) => sum + price, 0);

                  const componentTaxAmount = components.reduce((sum: number, c: any) => {
                    const override =
                      Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                        ? c.branchPrices[0]
                        : null;
                    const unitPrice = override ? Number(override.price) : Number(c.price);
                    const taxPct =
                      override && override.taxPercentage !== null && override.taxPercentage !== undefined
                        ? Number(override.taxPercentage)
                        : Number(c.taxPercentage);
                    const q = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
                    const qty = Number.isFinite(q) && q > 0 ? q : 1;
                    const taxPerUnit = taxInclusive
                      ? (unitPrice * taxPct) / (100 + taxPct)
                      : (unitPrice * taxPct) / 100;
                    return sum + taxPerUnit * qty;
                  }, 0);

                  const dealBaseForAdjustments = baseUnitPrice + totalAddonsPrice;
                  const dealAdj = computeItemAdjustments(
                    dealBaseForAdjustments,
                    dealQty,
                    item.itemDiscountType || null,
                    item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
                    item.itemDiscountScope || "PER_LINE",
                    item.itemSurchargeAmount != null ? Number(item.itemSurchargeAmount) : null,
                    item.itemSurchargeScope || "PER_LINE"
                  );

                  return {
                    itemType: "DEAL",
                    dealId,
                    quantity: dealQty,
                    unitPrice: baseUnitPrice,
                    totalPrice: dealAdj.totalPrice,
                    taxAmount: Math.round(componentTaxAmount * dealQty * 100) / 100,
                    taxPercentage: 0,
                    specialInstructions: item.specialInstructions,
                    itemDiscountType: item.itemDiscountType || null,
                    itemDiscountValue: item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
                    itemDiscountAmount: dealAdj.itemDiscountAmount,
                    itemDiscountScope: item.itemDiscountScope === "PER_UNIT" ? "PER_UNIT" : "PER_LINE",
                    itemSurchargeAmount: dealAdj.itemSurchargeAmount,
                    itemSurchargeScope: item.itemSurchargeScope === "PER_UNIT" ? "PER_UNIT" : "PER_LINE",
                  };
                }

                const taxPercentage = await taxCalculator.getMealTaxPercentage(
                  item.mealId || item.id,
                  item.size,
                  branchId
                );
                const mealBasePrice = await getMealBasePrice(item.mealId || item.id, branchId);
                const mealSizeType =
                  (item.mealSizeType as "S" | "M" | "L" | "XL" | null) || "M";
                const finalMealPrice = mealBasePrice + Number(item.mealSizePrice || 0);

                const totalAddonsPrice = (item.addOns || []).reduce((sum: number, addOn: any) => {
                  return sum + Number(addOn.price ?? 0) * Number(addOn.quantity || 1);
                }, 0);
                const mealBaseForAdjustments = finalMealPrice + totalAddonsPrice;
                const itemQty = Number(item.quantity || 1);
                const adj = computeItemAdjustments(
                  mealBaseForAdjustments,
                  itemQty,
                  item.itemDiscountType || null,
                  item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
                  item.itemDiscountScope || "PER_LINE",
                  item.itemSurchargeAmount != null ? Number(item.itemSurchargeAmount) : null,
                  item.itemSurchargeScope || "PER_LINE"
                );
                const taxPerUnit = taxInclusive
                  ? (finalMealPrice * taxPercentage) / (100 + taxPercentage)
                  : (finalMealPrice * taxPercentage) / 100;

                return {
                  itemType: "MEAL",
                  mealId: item.mealId || item.id,
                  quantity: itemQty,
                  unitPrice: finalMealPrice,
                  totalPrice: adj.totalPrice,
                  taxAmount: Math.round(taxPerUnit * itemQty * 100) / 100,
                  taxPercentage,
                  selectedSize: item.size,
                  mealSizeType,
                  specialInstructions: item.specialInstructions,
                  itemDiscountType: item.itemDiscountType || null,
                  itemDiscountValue: item.itemDiscountValue != null ? Number(item.itemDiscountValue) : null,
                  itemDiscountAmount: adj.itemDiscountAmount,
                  itemDiscountScope: item.itemDiscountScope === "PER_UNIT" ? "PER_UNIT" : "PER_LINE",
                  itemSurchargeAmount: adj.itemSurchargeAmount,
                  itemSurchargeScope: item.itemSurchargeScope === "PER_UNIT" ? "PER_UNIT" : "PER_LINE",
                };
              })
            ),
          },
        } as any,
        include: {
          user: true,
          orderItems: {
            include: {
              meal: true,
            },
          },
        },
      });

      for (let i = 0; i < cartItems.length; i++) {
        const item = cartItems[i];
        const orderItem = (order as any)?.orderItems?.[i];
        if (!orderItem) continue;

        if (item.addOns && item.addOns.length > 0) {
          const mealSizeType = orderItem.mealSizeType || "M";
          await prisma.orderItemAddOn.createMany({
            data: await Promise.all(
              item.addOns.map(async (addOn: any) => {
                const addonData = await prisma.addOn.findUnique({
                  where: { id: addOn.id },
                  include: { addonSizes: true },
                });
                let addonSizeType: "S" | "M" | "L" | "XL" | null = null;
                let addonPrice = addOn.price;
                const branchBasePrice = await getAddonBasePrice(addOn.id, branchId);

                if (addonData && addonData.addonSizes.length > 0) {
                  const availableSizes = addonData.addonSizes.map((s: any) => s.sizeType) as Array<
                    "S" | "M" | "L" | "XL"
                  >;
                  addonSizeType =
                    addOn.sizeType && availableSizes.includes(addOn.sizeType)
                      ? addOn.sizeType
                      : getNearestSmallerAddonSize(mealSizeType, availableSizes);
                  if (addonSizeType) {
                    const matchedSize = addonData.addonSizes.find((s: any) => s.sizeType === addonSizeType);
                    if (matchedSize) {
                      const originalSizePrice = Number(matchedSize.price);
                      const originalBasePrice = addonData.price !== null ? Number(addonData.price) : 0;
                      addonPrice = branchBasePrice + (originalSizePrice - originalBasePrice);
                    }
                  }
                } else {
                  addonSizeType = "M";
                  addonPrice = branchBasePrice;
                }

                const addonTaxPercentage = await taxCalculator.getAddonTaxPercentage(addOn.id, branchId);
                const addonQuantityPerItem =
                  addOn.quantity !== undefined && addOn.quantity !== null ? Number(addOn.quantity) : 1;
                const totalAddonQuantity = addonQuantityPerItem * Number(item.quantity || 1);
                const taxPerAddon = taxInclusive
                  ? (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage)
                  : (addonPrice * addonTaxPercentage) / 100;

                return {
                  orderItemId: orderItem.id,
                  addon_id: addonData ? addOn.id : null,
                  addOnName: addOn.name,
                  addOnPrice: addonPrice,
                  taxAmount: Math.round(taxPerAddon * totalAddonQuantity * 100) / 100,
                  taxPercentage: addonTaxPercentage,
                  addon_type: addOn.type || "BOOLEAN",
                  addonSizeType,
                  quantity: totalAddonQuantity,
                  addon_description: addOn.description || null,
                };
              })
            ),
          });
        }

        if (item.optionalIngredients && item.optionalIngredients.length > 0) {
          await prisma.orderItemOptionalIngredient.createMany({
            data: item.optionalIngredients.map((ingredient: any) => ({
              orderItemId: orderItem.id,
              optionalIngredientId: ingredient.id,
              isIncluded: ingredient.isIncluded ?? true,
              ingredientName: ingredient.name,
            })),
          });
        }
      }

      // Expand DEAL cart items into DEAL_COMPONENT OrderItem rows (for mixed tax/VAT DSFinV-K compliance)
      try {
        const prismaAny = prisma as any;
        const dealCartEntries = cartItems.filter((it: any) => it?.dealId || it?.itemType === "DEAL");

        if (dealCartEntries.length > 0) {
          const dealIdsToFetch = Array.from(new Set(dealCartEntries.map((it: any) => it.dealId).filter(Boolean)));

          const deals = await prismaAny.deal.findMany({
            where: { id: { in: dealIdsToFetch } },
            include: {
              components: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                include: {
                  branchPrices: branchId
                    ? { where: { branchId: branchId as string }, select: { id: true, branchId: true, price: true, taxPercentage: true } }
                    : false,
                },
              },
            },
          });

          const dealById = new Map<string, any>(deals.map((d: any) => [d.id, d]));

          // Re-fetch just-created DEAL parent rows keyed by dealId.
          // Index-based matching is unreliable; use a per-dealId queue instead.
          const freshDealItems = await prismaAny.orderItem.findMany({
            where: { orderId: order.id, itemType: "DEAL" },
            select: { id: true, dealId: true },
            orderBy: { createdAt: "asc" },
          });

          const dealItemQueueByDealId = new Map<string, string[]>();
          for (const oi of freshDealItems) {
            const key = String(oi.dealId);
            if (!dealItemQueueByDealId.has(key)) dealItemQueueByDealId.set(key, []);
            dealItemQueueByDealId.get(key)!.push(String(oi.id));
          }

          for (const it of dealCartEntries) {
            const queue = dealItemQueueByDealId.get(String((it as any).dealId));
            const parentOrderItemId = queue?.shift();
            if (!parentOrderItemId) {
              console.warn(`[POS OrderController] No DEAL parent row found for dealId=${(it as any).dealId} — skipping DEAL_COMPONENT creation`);
              continue;
            }

            const deal = dealById.get((it as any).dealId);
            if (!deal) continue;

            const qty = Number((it as any).quantity || 1);
            const childCreates: any[] = [];

            for (const c of deal.components || []) {
              const componentQtyRaw = c.quantity != null ? Number(c.quantity) : 1;
              const componentQty = Number.isFinite(componentQtyRaw) && componentQtyRaw > 0 ? componentQtyRaw : 1;
              const lineQty = qty * componentQty;
              const override = Array.isArray(c.branchPrices) && c.branchPrices.length > 0 ? c.branchPrices[0] : null;
              const unitPrice = override ? Number(override.price) : Number(c.price);
              const taxPct = override && override.taxPercentage != null ? Number(override.taxPercentage) : Number(c.taxPercentage);

              const totalPrice = Math.round(unitPrice * lineQty * 100) / 100;
              const taxAmount = taxInclusive
                ? Math.round((totalPrice * taxPct / (100 + taxPct)) * 100) / 100
                : Math.round(((totalPrice * taxPct) / 100) * 100) / 100;

              childCreates.push({
                orderId: order.id,
                itemType: "DEAL_COMPONENT",
                dealId: (it as any).dealId,
                dealComponentId: c.id,
                parentDealItemId: parentOrderItemId,
                quantity: lineQty,
                unitPrice,
                totalPrice,
                taxPercentage: taxPct,
                taxAmount,
              });
            }

            if (childCreates.length > 0) {
              await prismaAny.orderItem.createMany({ data: childCreates });
            }
          }
        }
      } catch (e) {
        console.error("[POS OrderController] Failed to create deal component order items:", e);
      }

      // Process voucher redemption if voucher was applied
      if (voucherPaymentAmount > 0 && voucherCodes.length > 0) {
        try {
          const { processVoucherRedemption } = await import("../utils/voucherHelper");
          const redemptionResult = await processVoucherRedemption({
            tx: prisma,
            voucherCode: voucherCodes[0],
            orderCalculation: {
              finalTotal: finalTotalAmount,
              subtotal: discountedSubtotal,
              itemTaxAmount: finalItemTaxAmount,
              addonTaxAmount: finalAddonTaxAmount,
              totalTaxAmount: finalTaxAmount,
              itemBreakdown: orderCalculation.itemBreakdown,
              addonBreakdown: orderCalculation.addonBreakdown,
            },
            orderId: order.id,
          });
          // Store remaining balance snapshot
          console.log('[OrderController] Storing voucherRemainingBalances (POS):', {
            orderId: order.id,
            voucherCode: voucherCodes[0],
            remainingBalance: redemptionResult.remainingBalance,
          });
          await prisma.order.update({
            where: { id: order.id },
            data: {
              voucherRemainingBalances: {
                [voucherCodes[0]]: redemptionResult.remainingBalance
              }
            }
          });
        } catch (voucherErr) {
          console.error("[POS OrderController] Voucher redemption failed:", voucherErr);
        }
      }

      const paymentService = PaymentService.getInstance();
      await paymentService.createPayment({
        orderId: order.id,
        paymentMethod: normalizedPaymentMethod,
        paymentProvider: PaymentProvider.NONE,
        providerPaymentId: null,
        providerChargeId: null,
        amount: adjustedFinalTotal,
        currency: String((branch as any)?.currency || "USD").toUpperCase(),
        status: normalizedPaymentStatus === PaymentStatus.PAID ? PaymentState.COMPLETED : PaymentState.PENDING,
        metadata: {
          source: "tablet_pos",
          serviceMode: normalizedServiceMode,
          tableId: tableId ? String(tableId) : null,
          tableNumber: tableNumber ? String(tableNumber) : null,
        },
      });

      const notification = await prisma.notification.create({
        data: {
          orderId: order.id,
          isSeen: false,
          isOrderUpdate: false,
        },
      });

      const notificationWithOrder = await prisma.notification.findUnique({
        where: { id: notification.id },
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
                  deal: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
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

      const wsService = WebSocketService.getInstance();
      wsService.emitNewOrder(notificationWithOrder, order);

      // If Fiskaly is enabled and this order is PAID + PICKED_UP, automatically enqueue it for background fiscalization
      try {
        const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
        if (shouldFiscalize(config) && order.status === "PICKED_UP" && order.paymentStatus === "PAID") {
          console.log(`[POS OrderController] Enqueueing paid and finalized order ${order.id} for background fiscal signing.`);
          const queueWorker = FiscalQueueWorker.getInstance();
          await queueWorker.enqueue(order.id);
        }
      } catch (fiskalyErr) {
        console.error("[POS OrderController] Non-blocking Fiskaly enqueue failure:", fiskalyErr);
      }

      // Send tablet notification for new POS order
      if (order.branchId) {
        const branch = await db.getPrisma().branch.findUnique({ where: { id: order.branchId }, select: { organizationId: true } });
        await tabletOrderNotificationService.notifyOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
          organizationId: branch?.organizationId || "",
          status: order.status,
          totalAmount: Number(order.totalAmount),
          orderType: order.orderType,
          customerName: guestName || "",
        });
      }

      // Create immutable bill snapshot
      try {
        const orderWithItems = await prisma.order.findUnique({
          where: { id: order.id },
          include: {
            orderItems: true,
          },
        });
        if (orderWithItems) {
          const billSnapshot = createBillSnapshot(orderWithItems);
          await prisma.order.update({
            where: { id: order.id },
            data: { billSnapshot: billSnapshot as any },
          });
        }
      } catch (snapshotErr) {
        console.error("[POS OrderController] Failed to create bill snapshot:", snapshotErr);
      }

      res.json({
        success: true,
        data: {
          order,
          orderNumber: order.orderNumber,
        },
      });
    } catch (error) {
      const { id, orderNumber: clientOrderNumber } = (req.body || {}) as any;
      const organizationId = (req as any).organizationId;
      // Check for Prisma unique constraint failure (P2002) on ID or orderNumber to gracefully handle sync race conditions or retry events
      if (error && (error as any).code === "P2002" && (id || clientOrderNumber)) {
        try {
          console.log(`[POS OrderController] Unique constraint violation caught for ID: ${id || "N/A"} or orderNumber: ${clientOrderNumber || "N/A"}. Attempting recovery...`);
          const db = DatabaseSingleton.getInstance();
          const prisma: any = db.getPrisma();
          const existingOrder = await prisma.order.findFirst({
            where: {
              OR: [
                id ? { id } : null,
                clientOrderNumber ? { orderNumber: clientOrderNumber } : null,
              ].filter(Boolean) as any[],
            },
            include: {
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
                  deal: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                },
              },
            },
          });
          if (existingOrder) {
            console.log(`[POS OrderController] Gracefully resolved unique constraint race for order ID: ${id || "N/A"}, orderNumber: ${clientOrderNumber || "N/A"}`);
            
            // Re-trigger background fiscal signing if needed
            try {
              const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
              if (shouldFiscalize(config) && existingOrder.status === "PICKED_UP" && existingOrder.paymentStatus === "PAID") {
                const queueWorker = FiscalQueueWorker.getInstance();
                await queueWorker.enqueue(existingOrder.id);
              }
            } catch (fiskalyErr) {
              console.error("[POS OrderController] Non-blocking Fiskaly enqueue failure during recovery:", fiskalyErr);
            }

            res.json({
              success: true,
              data: {
                order: existingOrder,
                orderNumber: existingOrder.orderNumber,
              },
            });
            return;
          }
        } catch (recoveryError) {
          console.error("[POS OrderController] Graceful recovery check failed:", recoveryError);
        }
      }

      console.error("Error creating POS order:", error);
      const message =
        error && typeof error === "object" && "message" in (error as any)
          ? String((error as any).message)
          : "Failed to create POS order";
      res.status(500).json({
        success: false,
        error: message || "Failed to create POS order",
      });
    }
  };
}
