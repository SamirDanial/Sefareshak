import { Router, Request, Response } from "express";
import AuthMiddleware from "../middleware/auth";
import ClerkSingleton from "../config/clerk";
import UserController from "../controllers/userController";
import { SettingsController } from "../controllers/settingsController";
import { TermsAndPolicyController } from "../controllers/termsAndPolicyController";
import express from "express";
import DatabaseSingleton from "../config/database";
import branchController from "../controllers/branchController";
import { declarationController } from "../controllers/declarationController";
import { getAddonPriceAndTax } from "../utils/addonPriceHelper";
import { deliverableQuantityController } from "../controllers/deliverableQuantityController";
import { verifyDeliveryLinkToken } from "../utils/deliveryLink";
import WebSocketService from "../services/websocketService";
import type { AuthenticatedRequest } from "../types";

class UserRoutes {
  private static instance: UserRoutes;
  private router: Router;
  private authMiddleware: AuthMiddleware;
  private userController: UserController;
  private termsAndPolicyController: TermsAndPolicyController;

  private constructor() {
    this.router = express.Router();

    this.authMiddleware = AuthMiddleware.getInstance();
    this.userController = UserController.getInstance();
    this.termsAndPolicyController = new TermsAndPolicyController();
    this.initializeRoutes();
  }

  private getPublicDeclarations = async (req: Request, res: Response): Promise<void> => {
    try {
      const { branchId, type } = req.query;
      const db = DatabaseSingleton.getInstance();

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const whereClause: any = {
        organizationId,
        shownInFilter: true,
      };

      if (typeof type === "string" && type.trim()) {
        whereClause.type = type.trim();
      }

      if (typeof branchId === "string" && branchId.trim()) {
        whereClause.NOT = {
          excludedBranches: {
            has: branchId.trim(),
          },
        };
      }

      const declarations = await db.getPrisma().declaration.findMany({
        where: whereClause,
        orderBy: {
          name: "asc",
        },
      });

      res.json({
        success: true,
        data: declarations,
      });
    } catch (error) {
      console.error("Error fetching public declarations:", error);
      res.status(500).json({ success: false, error: "Failed to fetch declarations" });
    }
  };

  private resolveOrganizationIdForPublicMenu = async (
    req: Request,
    prisma: any
  ): Promise<string | null> => {
    const bypassLocationFilter = (req.query as any)?.bypassLocationFilter === "true";
    const headerVal = req.headers["x-organization-id"];
    
    // When bypassLocationFilter is true, force use of branch's organization and ignore header
    if (bypassLocationFilter) {
      const branchId = (req.query as any)?.branchId;
      if (typeof branchId === "string" && branchId.trim()) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId.trim() },
          select: {
            organizationId: true,
            organization: { 
              select: { 
                isActive: true,
                isValidated: true,
                validationExpiresAt: true,
                gracePeriodEndsAt: true,
              } as any 
            } as any,
          } as any,
        });
        
        if (
          (branch as any)?.organizationId &&
          (branch as any)?.organization?.isActive !== false
        ) {
          const org = (branch as any).organization;
          const now = new Date();
          const isValid = org?.isValidated && 
            org?.validationExpiresAt && 
            (now <= org.validationExpiresAt || 
             (org.gracePeriodEndsAt && now <= org.gracePeriodEndsAt));
          
          if (isValid) {
            return (branch as any).organizationId;
          }
        }
      }
      return null;
    }
    
    // Normal flow: check header first
    if (typeof headerVal === "string" && headerVal.trim()) {
      const org = await prisma.organization.findUnique({
        where: { id: headerVal.trim() },
        select: { 
          id: true, 
          isActive: true,
          isValidated: true,
          validationExpiresAt: true,
          gracePeriodEndsAt: true,
        } as any,
      });
      
      // Check if organization is active AND validated (including grace period)
      if (!org || (org as any).isActive === false) return null;
      
      const now = new Date();
      const isValid = (org as any).isValidated && 
        (org as any).validationExpiresAt && 
        (now <= (org as any).validationExpiresAt || 
         ((org as any).gracePeriodEndsAt && now <= (org as any).gracePeriodEndsAt));
      
      if (!isValid) return null;
      return org.id || null;
    }

    // Fall back to branchId
    const branchId = (req.query as any)?.branchId;
    if (typeof branchId === "string" && branchId.trim()) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId.trim() },
        select: {
          organizationId: true,
          organization: { 
            select: { 
              isActive: true,
              isValidated: true,
              validationExpiresAt: true,
              gracePeriodEndsAt: true,
            } as any 
          } as any,
        } as any,
      });
      
      if (
        (branch as any)?.organizationId &&
        (branch as any)?.organization?.isActive !== false
      ) {
        // Check validation status
        const org = (branch as any).organization;
        const now = new Date();
        const isValid = org?.isValidated && 
          org?.validationExpiresAt && 
          (now <= org.validationExpiresAt || 
           (org.gracePeriodEndsAt && now <= org.gracePeriodEndsAt));
        
        if (isValid) {
          return (branch as any).organizationId;
        }
      }
    }

    return null;
  };

  public static getInstance(): UserRoutes {
    if (!UserRoutes.instance) {
      UserRoutes.instance = new UserRoutes();
    }
    return UserRoutes.instance;
  }

  private initializeRoutes(): void {
    // Public routes (no authentication required)
    this.router.get("/categories", this.getCategories);
    this.router.get("/deal-categories", this.getDealCategories);
    this.router.get("/deal-categories/:id", this.getDealCategory);
    this.router.get("/categories/:id", this.getCategory);
    this.router.get("/meals", this.getMeals);
    this.router.get("/meals/:id", this.getMeal);
    this.router.get("/addons/:id", this.getAddon);
    this.router.get("/deals", this.getDeals);
    this.router.get("/deals/:id", this.getDeal);
    this.router.get("/declarations/all", this.getPublicDeclarations);
    this.router.get("/delivery/:orderId", this.getPublicDeliveryDetails);
    this.router.get("/order/:orderId", this.getPublicOrderDetails);
    // Public settings endpoint for meal customization (only returns allowExcludeOptionalIngredients)
    this.router.get("/settings/public", this.getPublicSettings);
    // Public endpoint to get delivery serving hours
    this.router.get("/settings/serving-hours", this.getServingHours);
    // Public endpoint to get active branches (for branch switcher)
    this.router.get("/branches", branchController.getActiveBranches);
    // Public endpoint to check delivery availability (for checkout)
    this.router.get("/branches/delivery-check", branchController.checkDeliveryAvailability);

    // Public endpoint to get scheduled-order slot usage for a date (for checkout)
    this.router.get("/orders/scheduled-slot-usage", this.getScheduledOrderSlotUsage);

    // Public deliverable quantity endpoints (for cart validation)
    this.router.get(
      "/deliverable-quantities/available/:branchId/:mealId",
      deliverableQuantityController.getPublicAvailableWeight
    );
    this.router.post(
      "/deliverable-quantities/validate-cart",
      deliverableQuantityController.validateCart
    );

    // User registration route (for Clerk webhooks)
    this.router.post("/register", this.userController.createOrUpdateUser);

    // Protected routes (authentication required)
    this.router.use(this.authMiddleware.requireAuth);

    // User profile routes
    this.router.get("/profile", this.userController.getUserProfile);
    this.router.get("/signature-status", this.getUserSignatureStatus);
    this.router.put("/profile", this.userController.updateUserProfile);
    this.router.delete("/profile", this.userController.deleteUser);

    // Address routes
    this.router.get("/addresses", this.getUserAddresses);
    this.router.post("/addresses", this.addAddress);
    this.router.put("/addresses/:id", this.updateAddress);
    this.router.delete("/addresses/:id", this.deleteAddress);

    // Order routes
    this.router.get("/orders", this.getUserOrders);
    this.router.post("/orders", this.createOrder);
    this.router.get("/orders/:id", this.getUserOrder);
    this.router.put("/orders/:id/cancel", this.cancelOrder);

    // Settings route (read-only for authenticated users)
    this.router.get("/settings", this.getSettings);

    // Terms and Policies routes (authenticated users)
    this.router.get("/terms-and-policies/required", this.termsAndPolicyController.getRequiredPoliciesForUser);
    this.router.get("/terms-and-policies/consents", this.termsAndPolicyController.getUserConsents);
    this.router.post("/terms-and-policies/consent", this.termsAndPolicyController.recordUserConsent);
  }

  private getPublicDeliveryDetails = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { orderId } = req.params as any;
      const token = (req.query.token as string | undefined) || "";

      if (!orderId || typeof orderId !== "string") {
        res.status(400).json({ success: false, error: "orderId is required" });
        return;
      }
      if (!token || typeof token !== "string") {
        res.status(401).json({ success: false, error: "token is required" });
        return;
      }

      if (!verifyDeliveryLinkToken(orderId, token)) {
        res.status(401).json({ success: false, error: "Invalid token" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          orderType: true,
          deliveryAddress: true,
          deliveryBuilding: true,
          deliveryFloor: true,
          deliveryApartment: true,
          deliveryExtraDetails: true,
          deliveryPhone: true,
          deliveryNotes: true,
          guestName: true,
          guestPhone: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      if (order.orderType !== "DELIVERY") {
        res.status(400).json({ success: false, error: "Order is not a delivery order" });
        return;
      }

      const customerName = (() => {
        if (order.user) {
          const full = `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim();
          return full || order.user.email || null;
        }
        return order.guestName || null;
      })();

      const phone = order.deliveryPhone || order.user?.phone || order.guestPhone || null;

      res.json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderType: "DELIVERY",
          customerName,
          phone,
          notes: order.deliveryNotes || null,
          address: {
            line: order.deliveryAddress || null,
            building: order.deliveryBuilding || null,
            floor: order.deliveryFloor || null,
            apartment: order.deliveryApartment || null,
            extra: order.deliveryExtraDetails || null,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching public delivery details:", error);
      res.status(500).json({ success: false, error: "Failed to fetch delivery details" });
    }
  };

  private getPublicOrderDetails = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { orderId } = req.params as any;
      const token = (req.query.token as string | undefined) || "";

      if (!orderId || typeof orderId !== "string") {
        res.status(400).json({ success: false, error: "orderId is required" });
        return;
      }
      if (!token || typeof token !== "string") {
        res.status(401).json({ success: false, error: "token is required" });
        return;
      }

      if (!verifyDeliveryLinkToken(orderId, token)) {
        res.status(401).json({ success: false, error: "Invalid token" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          orderType: true,
          branchId: true,
          taxInclusive: true,
          status: true,
          isMerged: true,
          mergedAt: true,
          preparationTime: true,
          confirmedAt: true,
          paymentStatus: true,
          paymentMethod: true,
          currency: true,
          totalAmount: true,
          taxAmount: true,
          deliveryFee: true,
          deliveryTaxAmount: true,
          itemTaxAmount: true,
          addonTaxAmount: true,
          takeawayServiceFee: true,
          takeawayServiceTaxAmount: true,
          createdAt: true,
          updatedAt: true,
          userId: true,

          pickupPhone: true,
          pickupNotes: true,
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

          guestName: true,
          guestEmail: true,
          guestPhone: true,
          user: {
            select: {
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
              organization: {
                select: {
                  id: true,
                  name: true,
                  settings: {
                    select: {
                      businessName: true,
                      businessLogo: true,
                    },
                  },
                },
              },
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
              orderItemAddOns: {
                select: {
                  id: true,
                  addOnName: true,
                  addOnPrice: true,
                  quantity: true,
                  taxAmount: true,
                  taxPercentage: true,
                },
              },
              orderItemOptionalIngredients: {
                select: {
                  id: true,
                  ingredientName: true,
                  isIncluded: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({ success: false, error: "Order not found" });
        return;
      }

      const parseTicketPayload = (raw: any): any => {
        if (!raw) return {};
        if (typeof raw === "string") {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        }
        return raw;
      };

      const computeReadiness = async () => {
        const items = Array.isArray((order as any).orderItems) ? ((order as any).orderItems as any[]) : [];
        const hasDrinkItems = items.some((it) => Boolean(it?.meal?.isDrink));
        const hasFoodItems = items.some((it) => it?.meal && it?.meal?.isDrink === false);

        const requiredKitchen = hasFoodItems;
        const requiredBar = hasDrinkItems;

        const branchId = String((order as any)?.branchId || "").trim();
        if (!branchId) {
          return {
            hasDrinkItems,
            hasFoodItems,
            requiredKitchen,
            requiredBar,
            kitchenReady: !requiredKitchen,
            barReady: !requiredBar,
            missingDepartments: ([
              ...(requiredKitchen ? (["KITCHEN"] as const) : []),
              ...(requiredBar ? (["BAR"] as const) : []),
            ] as Array<"KITCHEN" | "BAR">),
          };
        }

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const tickets = await (prisma as any).kitchenTicket.findMany({
          where: {
            branchId,
            createdAt: { gte: since },
          },
        });

        const relevant = Array.isArray(tickets)
          ? tickets.filter((t: any) => {
              const payload = parseTicketPayload(t?.items);
              return String(payload?.orderId || "").trim() === String(orderId);
            })
          : [];

        const isKitchenTicket = (t: any): boolean => {
          const payload = parseTicketPayload(t?.items);
          const source = String(payload?.source || "").trim().toLowerCase();
          return source === "pickup" || source === "delivery" || source === "waiter_submit" || source === "reservation" || source === "walk_in";
        };
        const isBarTicket = (t: any): boolean => {
          const payload = parseTicketPayload(t?.items);
          const source = String(payload?.source || "").trim().toLowerCase();
          return source.startsWith("bar_");
        };

        const kitchenTickets = relevant.filter(isKitchenTicket);
        const barTickets = relevant.filter(isBarTicket);

        const kitchenReady =
          !requiredKitchen ||
          (kitchenTickets.length > 0 && kitchenTickets.every((t: any) => String(t?.status || "").trim().toUpperCase() === "READY"));
        const barReady =
          !requiredBar ||
          (barTickets.length > 0 && barTickets.every((t: any) => String(t?.status || "").trim().toUpperCase() === "READY"));

        const missingDepartments: Array<"KITCHEN" | "BAR"> = [];
        if (!kitchenReady) missingDepartments.push("KITCHEN");
        if (!barReady) missingDepartments.push("BAR");

        return {
          hasDrinkItems,
          hasFoodItems,
          requiredKitchen,
          requiredBar,
          kitchenReady,
          barReady,
          missingDepartments,
        };
      };

      res.json({ success: true, data: order });
    } catch (error) {
      console.error("Error fetching public order details:", error);
      res.status(500).json({ success: false, error: "Failed to fetch order details" });
    }
  };

  private getUserSignatureStatus = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const user = await db.getPrisma().user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          hasAcceptedRequiredPolicies: true,
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
        data: {
          hasAcceptedRequiredPolicies: user.hasAcceptedRequiredPolicies,
        },
      });
    } catch (error) {
      console.error("Error fetching user signature status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch signature status",
      });
    }
  };

  private getScheduledOrderSlotUsage = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { date, branchId, orderType } = req.query as any;

      if (!date || typeof date !== "string") {
        res.status(400).json({ success: false, error: "date is required (YYYY-MM-DD)" });
        return;
      }
      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({ success: false, error: "branchId is required" });
        return;
      }
      if (orderType !== "PICKUP" && orderType !== "DELIVERY") {
        res.status(400).json({ success: false, error: "orderType must be PICKUP or DELIVERY" });
        return;
      }

      const [y, m, d] = date.split("-").map((v) => parseInt(v, 10));
      if (!y || !m || !d) {
        res.status(400).json({ success: false, error: "Invalid date format (YYYY-MM-DD)" });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const [settings, branch] = await Promise.all([
        prisma.settings.findFirst({
          select: {
            scheduledOrderTimeSlotInterval: true,
            scheduledOrderMaxOrdersPerSlot: true,
          },
        }),
        prisma.branch.findUnique({
          where: { id: branchId },
          select: {
            id: true,
            isActive: true,
            organizationId: true,
            organization: { select: { isActive: true } as any } as any,
            scheduledOrderTimeSlotInterval: true,
            scheduledOrderMaxOrdersPerSlot: true,
          },
        }),
      ]);

      if (!settings) {
        res.status(500).json({ success: false, error: "Settings not configured" });
        return;
      }
      if (
        !branch ||
        !branch.isActive ||
        ((branch as any).organizationId && (branch as any).organization?.isActive === false)
      ) {
        res.status(404).json({ success: false, error: "Branch not found" });
        return;
      }

      const intervalMinutes =
        branch.scheduledOrderTimeSlotInterval ?? settings.scheduledOrderTimeSlotInterval ?? 30;
      const maxOrdersPerSlot =
        branch.scheduledOrderMaxOrdersPerSlot !== null &&
        branch.scheduledOrderMaxOrdersPerSlot !== undefined
          ? branch.scheduledOrderMaxOrdersPerSlot
          : settings.scheduledOrderMaxOrdersPerSlot ?? null;

      const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
      const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          branchId,
          orderType,
          scheduledDate: {
            not: null,
            gte: dayStart,
            lte: dayEnd,
          },
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          scheduledDate: true,
        },
      });

      const slots: Record<string, number> = {};
      const bucket = (dt: Date, interval: number) => {
        const minutes = dt.getHours() * 60 + dt.getMinutes();
        const floored = Math.floor(minutes / interval) * interval;
        const hh = Math.floor(floored / 60)
          .toString()
          .padStart(2, "0");
        const mm = (floored % 60).toString().padStart(2, "0");
        return `${hh}:${mm}`;
      };

      for (const o of orders) {
        if (!o.scheduledDate) continue;
        const key = bucket(new Date(o.scheduledDate as any), intervalMinutes);
        slots[key] = (slots[key] || 0) + 1;
      }

      res.json({
        success: true,
        data: {
          date,
          orderType,
          branchId,
          intervalMinutes,
          maxOrdersPerSlot,
          slots,
        },
      });
    } catch (error) {
      console.error("Error fetching scheduled slot usage:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch scheduled slot usage",
      });
    }
  };

  private getCategories = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { featured, branchId, bypassLocationFilter } = req.query;

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const whereClause: any = { isActive: true, organizationId };
      // If featured=true, only return featured categories (for home page)
      if (featured === "true") {
        whereClause.isFeatured = true;
      }

      // Filter by excludedBranches if branchId is provided
      // When bypassLocationFilter is true, skip location-based filtering and use the provided branchId directly
      if (branchId && typeof branchId === "string") {
        whereClause.NOT = {
          excludedBranches: {
            has: branchId,
          },
        };
      }

      // Exclude deal categories (categories that have deals) from ordinary categories
      // Deal categories are shown separately in the Deal Categories section
      whereClause.deals = {
        none: {},
      };

      const categories = await db.getPrisma().category.findMany({
        where: whereClause,
        orderBy:
          featured === "true"
            ? [
                { featuredOrder: "asc" },
                { name: "asc" },
              ]
            : [
                { listOrder: "asc" },
                { name: "asc" },
              ],
        include: {
          _count: {
            select: {
              meals: true,
              deals: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch categories",
      });
    }
  };

  private getDealCategories = async (req: Request, res: Response): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const { featured, branchId } = req.query;

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const whereClause: any = { isActive: true, organizationId };
      if (featured === "true") {
        whereClause.isFeatured = true;
      }

      // Exclude categories directly excluded from branch
      if (branchId && typeof branchId === "string") {
        whereClause.NOT = {
          excludedBranches: {
            has: branchId,
          },
        };
      }

      // Only include categories that have at least one active deal.
      // If branchId is provided, ensure the category has at least one deal available for that branch.
      if (branchId && typeof branchId === "string") {
        whereClause.deals = {
          some: {
            isActive: true,
            NOT: {
              excludedBranches: {
                has: branchId,
              },
            },
          },
        };
      } else {
        whereClause.deals = {
          some: {
            isActive: true,
          },
        };
      }

      const categories = await db.getPrisma().category.findMany({
        where: whereClause,
        orderBy:
          featured === "true"
            ? [{ featuredOrder: "asc" }, { name: "asc" }]
            : [{ listOrder: "asc" }, { name: "asc" }],
        include: {
          _count: {
            select: {
              meals: true,
              deals: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Error fetching deal categories:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch deal categories",
      });
    }
  };

  private getDealCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const db = DatabaseSingleton.getInstance();

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const categoryWhere: any = { id, isActive: true, organizationId };
      if (branchId && typeof branchId === "string") {
        categoryWhere.NOT = {
          excludedBranches: {
            has: branchId,
          },
        };
      }

      const dealsWhere: any = { isActive: true, organizationId };
      if (branchId && typeof branchId === "string") {
        dealsWhere.NOT = {
          excludedBranches: {
            has: branchId,
          },
        };
      }

      const category: any = await (db.getPrisma() as any).category.findFirst({
        where: categoryWhere,
        include: {
          deals: {
            where: dealsWhere,
            include: {
              components: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                include:
                  branchId && typeof branchId === "string"
                    ? {
                        branchPrices: {
                          where: { branchId: branchId as string },
                          select: {
                            id: true,
                            branchId: true,
                            price: true,
                            taxPercentage: true,
                          },
                        },
                      }
                    : undefined,
              },
              dealAddOns: {
                include: {
                  addOn: {
                    include: {
                      addonSizes: true,
                      addonBranchPrices:
                        branchId && typeof branchId === "string"
                          ? {
                              where: { branchId: branchId as string },
                              select: {
                                id: true,
                                branchId: true,
                                basePrice: true,
                                taxPercentage: true,
                              },
                            }
                          : false,
                    },
                  },
                },
              },
              dealDeclarations: {
                include: {
                  declaration: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      description: true,
                      icon: true,
                    },
                  },
                },
              },
              dealOptionalIngredients: {
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
            orderBy: [{ listOrder: "asc" as const }, { name: "asc" as const }],
          },
        },
      });

      if (!category) {
        res.status(404).json({ success: false, error: "Category not found" });
        return;
      }

      const dealsWithEffectivePrices = await Promise.all(
        ((category as any).deals || []).map(async (deal: any) => {
          const dealData: any = { ...deal };

          if (branchId && typeof branchId === "string" && Array.isArray(dealData.components)) {
            dealData.components = dealData.components.map((c: any) => {
              const row: any = { ...c };
              const override =
                Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                  ? c.branchPrices[0]
                  : null;

              row.effectivePrice = override ? Number(override.price) : Number(c.price);
              row.effectiveTaxPercentage =
                override && override.taxPercentage !== null && override.taxPercentage !== undefined
                  ? Number(override.taxPercentage)
                  : Number(c.taxPercentage);

              if (row.branchPrices) delete row.branchPrices;
              return row;
            });
          }

          return dealData;
        })
      );

      res.json({
        success: true,
        data: {
          ...category,
          deals: dealsWithEffectivePrices,
        },
      });
    } catch (error) {
      console.error("Error fetching deal category:", error);
      res.status(500).json({ success: false, error: "Failed to fetch deal category" });
    }
  };

  private getCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const db = DatabaseSingleton.getInstance();

      const category: any = await (db.getPrisma() as any).category.findUnique({
        where: { id },
        include: {
          meals: {
            where: { isActive: true },
            include: {
              mealSizes: true,
              branchAvailabilities: branchId && typeof branchId === "string"
                ? {
                    where: { branchId: branchId as string },
                    include: {
                      windows: true,
                    },
                  }
                : {
                    include: {
                      windows: true,
                    },
                  },
              mealAddOns: {
                include: {
                  addOn: {
                    include: {
                      addonSizes: true,
                      addonBranchPrices: branchId && typeof branchId === "string" 
                        ? {
                            where: { branchId: branchId as string },
                            select: {
                              id: true,
                              branchId: true,
                              basePrice: true,
                              taxPercentage: true,
                            },
                          }
                        : false,
                    },
                  },
                },
              },
              mealDeclarations: {
                include: {
                  declaration: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      description: true,
                      icon: true,
                    },
                  },
                },
              },
              branchPrices: branchId && typeof branchId === "string" 
                ? {
                    where: { branchId: branchId as string },
                    select: {
                      id: true,
                      branchId: true,
                      basePrice: true,
                      taxPercentage: true,
                    },
                  }
                : false,
            },
            orderBy: [
              { listOrder: "asc" as const },
              { name: "asc" as const },
            ],
          },
          deals: {
            where: { isActive: true },
            include: {
              components: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                include:
                  branchId && typeof branchId === "string"
                    ? {
                        branchPrices: {
                          where: { branchId: branchId as string },
                          select: {
                            id: true,
                            branchId: true,
                            price: true,
                            taxPercentage: true,
                          },
                        },
                      }
                    : undefined,
              },
              dealAddOns: {
                include: {
                  addOn: {
                    include: {
                      addonSizes: true,
                      addonBranchPrices:
                        branchId && typeof branchId === "string"
                          ? {
                              where: { branchId: branchId as string },
                              select: {
                                id: true,
                                branchId: true,
                                basePrice: true,
                                taxPercentage: true,
                              },
                            }
                          : false,
                    },
                  },
                },
              },
              dealDeclarations: {
                include: {
                  declaration: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      description: true,
                      icon: true,
                    },
                  },
                },
              },
              dealOptionalIngredients: {
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
            orderBy: [
              { listOrder: "asc" as const },
              { name: "asc" as const },
            ],
          },
        },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      // Calculate effective prices for each meal if branchId is provided
      const mealsWithEffectivePrices = await Promise.all(
        (category.meals || []).map(async (meal: any) => {
          const mealData: any = { ...meal };
          
          if (branchId && typeof branchId === "string" && meal.branchPrices && Array.isArray(meal.branchPrices) && meal.branchPrices.length > 0) {
            // Use branch-specific price
            const branchPrice = meal.branchPrices[0];
            mealData.effectiveBasePrice = Number(branchPrice.basePrice);
            mealData.effectiveTaxPercentage = branchPrice.taxPercentage !== null ? Number(branchPrice.taxPercentage) : null;
          } else {
            // Use default base price
            mealData.effectiveBasePrice = Number(meal.basePrice);
            mealData.effectiveTaxPercentage = meal.taxPercentage !== null ? Number(meal.taxPercentage) : null;
          }
          
          // Remove branchPrices from response (we've already extracted the needed info)
          if (mealData.branchPrices) {
            delete mealData.branchPrices;
          }

          // Calculate effective prices for addons if branchId is provided
          if (branchId && typeof branchId === "string" && mealData.mealAddOns) {
            mealData.mealAddOns = await Promise.all(
              mealData.mealAddOns.map(async (mealAddOn: any) => {
                if (mealAddOn.addOn) {
                  const { basePrice, taxPercentage } = await getAddonPriceAndTax(
                    mealAddOn.addOn.id,
                    branchId
                  );
                  return {
                    ...mealAddOn,
                    addOn: {
                      ...mealAddOn.addOn,
                      effectiveBasePrice: basePrice,
                      effectiveTaxPercentage: taxPercentage,
                      // Remove addonBranchPrices from response (we've already extracted the needed info)
                      addonBranchPrices: undefined,
                    },
                  };
                }
                return mealAddOn;
              })
            );
          } else if (mealData.mealAddOns) {
            // No branchId, use default addon prices
            mealData.mealAddOns = mealData.mealAddOns.map((mealAddOn: any) => {
              if (mealAddOn.addOn) {
                return {
                  ...mealAddOn,
                  addOn: {
                    ...mealAddOn.addOn,
                    effectiveBasePrice: mealAddOn.addOn.price !== null ? Number(mealAddOn.addOn.price) : 0,
                    effectiveTaxPercentage: mealAddOn.addOn.taxPercentage !== null ? Number(mealAddOn.addOn.taxPercentage) : null,
                  },
                };
              }
              return mealAddOn;
            });
          }
          
          return mealData;
        })
      );

      const dealsWithEffectivePrices = await Promise.all(
        ((category as any).deals || []).map(async (deal: any) => {
          const dealData: any = { ...deal };
          if (branchId && typeof branchId === "string" && Array.isArray(dealData.components)) {
            dealData.components = dealData.components.map((c: any) => {
              const row: any = { ...c };
              const override =
                Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                  ? c.branchPrices[0]
                  : null;
              row.effectivePrice = override ? Number(override.price) : Number(c.price);
              row.effectiveTaxPercentage =
                override && override.taxPercentage !== null && override.taxPercentage !== undefined
                  ? Number(override.taxPercentage)
                  : Number(c.taxPercentage);
              if (row.branchPrices) delete row.branchPrices;
              return row;
            });
          }
          return dealData;
        })
      );

      res.json({
        success: true,
        data: {
          ...category,
          meals: mealsWithEffectivePrices,
          deals: dealsWithEffectivePrices,
        },
      });
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch category",
      });
    }
  };

  private getDeals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { categoryId, search, featured, branchId } = req.query;
      const db = DatabaseSingleton.getInstance();

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const whereClause: any = { 
        isActive: true, 
        organizationId,
        category: {
          isActive: true
        }
      };

      if (categoryId) {
        const category = await (db.getPrisma() as any).category.findUnique({
          where: { id: categoryId as string },
          select: { id: true, organizationId: true },
        });
        if (!category || (category as any).organizationId !== organizationId) {
          res.json({ success: true, data: [] });
          return;
        }

        whereClause.categoryId = categoryId as string;
      }

      if (featured === "true") {
        whereClause.isFeatured = true;
      }

      if (branchId && typeof branchId === "string") {
        whereClause.AND = [
          {
            NOT: {
              excludedBranches: {
                has: branchId,
              },
            },
          },
          {
            category: {
              NOT: {
                excludedBranches: {
                  has: branchId,
                },
              },
            },
          },
        ];
      }

      if (search) {
        whereClause.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const orderBy: any[] = [];
      if (featured === "true") {
        orderBy.push({ featuredOrder: "asc" as const });
      } else {
        orderBy.push({ listOrder: "asc" as const });
      }
      orderBy.push({ name: "asc" as const });

      const deals = await (db.getPrisma() as any).deal.findMany({
        where: whereClause,
        include: {
          category: true,
          components: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include:
              branchId && typeof branchId === "string"
                ? {
                    branchPrices: {
                      where: { branchId: branchId as string },
                      select: {
                        id: true,
                        branchId: true,
                        price: true,
                        taxPercentage: true,
                      },
                    },
                  }
                : undefined,
          },
          dealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                  addonBranchPrices:
                    branchId && typeof branchId === "string"
                      ? {
                          where: { branchId: branchId as string },
                          select: {
                            id: true,
                            branchId: true,
                            basePrice: true,
                            taxPercentage: true,
                          },
                        }
                      : false,
                },
              },
            },
          },
          dealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          dealOptionalIngredients: {
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
        orderBy,
      });

      const dealsWithEffectivePrices = await Promise.all(
        (deals || []).map(async (deal: any) => {
          const dealData: any = { ...deal };

          if (branchId && typeof branchId === "string" && Array.isArray(dealData.components)) {
            dealData.components = dealData.components.map((c: any) => {
              const row: any = { ...c };
              const override =
                Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                  ? c.branchPrices[0]
                  : null;

              row.effectivePrice = override ? Number(override.price) : Number(c.price);
              row.effectiveTaxPercentage =
                override && override.taxPercentage !== null && override.taxPercentage !== undefined
                  ? Number(override.taxPercentage)
                  : Number(c.taxPercentage);

              if (row.branchPrices) delete row.branchPrices;
              return row;
            });
          }

          return dealData;
        })
      );

      res.json({
        success: true,
        data: dealsWithEffectivePrices,
      });
    } catch (error) {
      console.error("Error fetching deals:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch deals",
      });
    }
  };

  private getDeal = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const db = DatabaseSingleton.getInstance();

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const whereClause: any = { id, isActive: true, organizationId };

      if (branchId && typeof branchId === "string") {
        whereClause.AND = [
          {
            NOT: {
              excludedBranches: {
                has: branchId,
              },
            },
          },
          {
            category: {
              NOT: {
                excludedBranches: {
                  has: branchId,
                },
              },
            },
          },
        ];
      }

      const deal: any = await (db.getPrisma() as any).deal.findFirst({
        where: whereClause,
        include: {
          category: true,
          components: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include:
              branchId && typeof branchId === "string"
                ? {
                    branchPrices: {
                      where: { branchId: branchId as string },
                      select: {
                        id: true,
                        branchId: true,
                        price: true,
                        taxPercentage: true,
                      },
                    },
                  }
                : undefined,
          },
          dealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                  addonBranchPrices:
                    branchId && typeof branchId === "string"
                      ? {
                          where: { branchId: branchId as string },
                          select: {
                            id: true,
                            branchId: true,
                            basePrice: true,
                            taxPercentage: true,
                          },
                        }
                      : false,
                },
              },
            },
          },
          dealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          dealOptionalIngredients: {
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
      });

      if (!deal) {
        res.status(404).json({ success: false, error: "Deal not found" });
        return;
      }

      const dealData: any = { ...deal };
      if (branchId && typeof branchId === "string" && Array.isArray(dealData.components)) {
        dealData.components = dealData.components.map((c: any) => {
          const row: any = { ...c };
          const override =
            Array.isArray(c.branchPrices) && c.branchPrices.length > 0
              ? c.branchPrices[0]
              : null;

          row.effectivePrice = override ? Number(override.price) : Number(c.price);
          row.effectiveTaxPercentage =
            override && override.taxPercentage !== null && override.taxPercentage !== undefined
              ? Number(override.taxPercentage)
              : Number(c.taxPercentage);

          if (row.branchPrices) delete row.branchPrices;
          return row;
        });
      }

      res.json({
        success: true,
        data: dealData,
      });
    } catch (error) {
      console.error("Error fetching deal:", error);
      res.status(500).json({ success: false, error: "Failed to fetch deal" });
    }
  };

  private getMeals = async (req: Request, res: Response): Promise<void> => {
    try {
      const { categoryId, search, featured, branchId, bypassLocationFilter } = req.query;
      const db = DatabaseSingleton.getInstance();

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, db.getPrisma());
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const whereClause: any = { 
        isActive: true, 
        organizationId,
        category: {
          isActive: true
        }
      };

      if (categoryId) {
        const category = await (db.getPrisma() as any).category.findUnique({
          where: { id: categoryId as string },
          select: { id: true, organizationId: true },
        });
        if (!category || (category as any).organizationId !== organizationId) {
          res.json({ success: true, data: [] });
          return;
        }

        whereClause.categoryId = categoryId as string;
      }

      if (featured === "true") {
        whereClause.isFeatured = true;
      }

      // Filter by excludedBranches if branchId is provided
      // When bypassLocationFilter is true, skip location-based filtering and use the provided branchId directly
      if (branchId && typeof branchId === "string") {
        // Filter meals where:
        // 1. branchId is NOT in meal.excludedBranches, AND
        // 2. branchId is NOT in meal.category.excludedBranches
        whereClause.AND = [
          {
            NOT: {
          excludedBranches: {
            has: branchId,
          },
            },
          },
          {
            category: {
              NOT: {
          excludedBranches: {
            has: branchId,
                },
              },
            },
          },
        ];
      }

      if (search) {
        whereClause.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const orderBy: any[] = [];

      if (featured === "true") {
        orderBy.push({ featuredOrder: "asc" as const });
      } else {
        orderBy.push({ listOrder: "asc" as const });
      }

      orderBy.push({ name: "asc" as const });

      const meals = await db.getPrisma().meal.findMany({
        where: whereClause,
        include: {
          category: true,
          mealSizes: true,
          branchAvailabilities: branchId && typeof branchId === "string"
            ? {
                where: { branchId: branchId as string },
                include: {
                  windows: true,
                },
              }
            : {
                include: {
                  windows: true,
                },
              },
          mealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                  addonBranchPrices: branchId && typeof branchId === "string" 
                    ? {
                        where: { branchId: branchId as string },
                        select: {
                          id: true,
                          branchId: true,
                          basePrice: true,
                          taxPercentage: true,
                        },
                      }
                    : false,
                },
              },
            },
          },
          mealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          branchPrices: branchId && typeof branchId === "string" 
            ? {
                where: { branchId: branchId as string },
                select: {
                  id: true,
                  branchId: true,
                  basePrice: true,
                  taxPercentage: true,
                },
              }
            : false,
        },
        orderBy,
      });

      // Calculate effective prices for each meal if branchId is provided
      const mealsWithEffectivePrices = await Promise.all(
        meals.map(async (meal) => {
          const mealData: any = { ...meal };
          
          if (branchId && typeof branchId === "string" && meal.branchPrices && Array.isArray(meal.branchPrices) && meal.branchPrices.length > 0) {
            // Use branch-specific price
            const branchPrice = meal.branchPrices[0];
            mealData.effectiveBasePrice = Number(branchPrice.basePrice);
            mealData.effectiveTaxPercentage = branchPrice.taxPercentage !== null ? Number(branchPrice.taxPercentage) : null;
          } else {
            // Use default base price
            mealData.effectiveBasePrice = Number(meal.basePrice);
            mealData.effectiveTaxPercentage = meal.taxPercentage !== null ? Number(meal.taxPercentage) : null;
          }
          
          // Remove branchPrices from response (we've already extracted the needed info)
          if (mealData.branchPrices) {
            delete mealData.branchPrices;
          }

          // Calculate effective prices for addons if branchId is provided
          if (branchId && typeof branchId === "string" && mealData.mealAddOns) {
            mealData.mealAddOns = await Promise.all(
              mealData.mealAddOns.map(async (mealAddOn: any) => {
                if (mealAddOn.addOn) {
                  const { basePrice, taxPercentage } = await getAddonPriceAndTax(
                    mealAddOn.addOn.id,
                    branchId
                  );
                  return {
                    ...mealAddOn,
                    addOn: {
                      ...mealAddOn.addOn,
                      effectiveBasePrice: basePrice,
                      effectiveTaxPercentage: taxPercentage,
                      // Remove addonBranchPrices from response (we've already extracted the needed info)
                      addonBranchPrices: undefined,
                    },
                  };
                }
                return mealAddOn;
              })
            );
          } else if (mealData.mealAddOns) {
            // No branchId, use default addon prices
            mealData.mealAddOns = mealData.mealAddOns.map((mealAddOn: any) => {
              if (mealAddOn.addOn) {
                return {
                  ...mealAddOn,
                  addOn: {
                    ...mealAddOn.addOn,
                    effectiveBasePrice: mealAddOn.addOn.price !== null ? Number(mealAddOn.addOn.price) : 0,
                    effectiveTaxPercentage: mealAddOn.addOn.taxPercentage !== null ? Number(mealAddOn.addOn.taxPercentage) : null,
                  },
                };
              }
              return mealAddOn;
            });
          }
          
          return mealData;
        })
      );

      res.json({
        success: true,
        data: mealsWithEffectivePrices,
      });
    } catch (error) {
      console.error("Error fetching meals:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch meals",
      });
    }
  };

  private getMeal = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const db = DatabaseSingleton.getInstance();

      const meal = await db.getPrisma().meal.findUnique({
        where: { id },
        include: {
          category: true,
          mealSizes: true,
          branchAvailabilities: branchId && typeof branchId === "string"
            ? {
                where: { branchId: branchId as string },
                include: {
                  windows: true,
                },
              }
            : {
                include: {
                  windows: true,
                },
              },
          mealAddOns: {
            include: {
              addOn: {
                include: {
                  addonSizes: true,
                  addonBranchPrices: branchId && typeof branchId === "string" 
                    ? {
                        where: { branchId: branchId as string },
                        select: {
                          id: true,
                          branchId: true,
                          basePrice: true,
                          taxPercentage: true,
                        },
                      }
                    : false,
                },
              },
            },
          },
          mealDeclarations: {
            include: {
              declaration: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  icon: true,
                },
              },
            },
          },
          mealOptionalIngredients: {
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
          branchPrices: branchId && typeof branchId === "string" 
            ? {
                where: { branchId: branchId as string },
                select: {
                  id: true,
                  branchId: true,
                  basePrice: true,
                  taxPercentage: true,
                },
              }
            : false,
        },
      });

      if (!meal || !meal.isActive) {
        res.status(404).json({
          success: false,
          error: "Meal not found",
        });
        return;
      }

      // Calculate effective price if branchId is provided
      const mealData: any = { ...meal };
      if (branchId && typeof branchId === "string" && meal.branchPrices && Array.isArray(meal.branchPrices) && meal.branchPrices.length > 0) {
        // Use branch-specific price
        const branchPrice = meal.branchPrices[0];
        mealData.effectiveBasePrice = Number(branchPrice.basePrice);
        mealData.effectiveTaxPercentage = branchPrice.taxPercentage !== null ? Number(branchPrice.taxPercentage) : null;
      } else {
        // Use default base price
        mealData.effectiveBasePrice = Number(meal.basePrice);
        mealData.effectiveTaxPercentage = meal.taxPercentage !== null ? Number(meal.taxPercentage) : null;
      }
      
      // Remove branchPrices from response (we've already extracted the needed info)
      if (mealData.branchPrices) {
        delete mealData.branchPrices;
      }

      // Calculate effective prices for addons if branchId is provided
      if (branchId && typeof branchId === "string" && mealData.mealAddOns) {
        mealData.mealAddOns = await Promise.all(
          mealData.mealAddOns.map(async (mealAddOn: any) => {
            if (mealAddOn.addOn) {
              const { basePrice, taxPercentage } = await getAddonPriceAndTax(
                mealAddOn.addOn.id,
                branchId
              );
              return {
                ...mealAddOn,
                addOn: {
                  ...mealAddOn.addOn,
                  effectiveBasePrice: basePrice,
                  effectiveTaxPercentage: taxPercentage,
                  // Remove addonBranchPrices from response (we've already extracted the needed info)
                  addonBranchPrices: undefined,
                },
              };
            }
            return mealAddOn;
          })
        );
      } else if (mealData.mealAddOns) {
        // No branchId, use default addon prices
        mealData.mealAddOns = mealData.mealAddOns.map((mealAddOn: any) => {
          if (mealAddOn.addOn) {
            return {
              ...mealAddOn,
              addOn: {
                ...mealAddOn.addOn,
                effectiveBasePrice: mealAddOn.addOn.price !== null ? Number(mealAddOn.addOn.price) : 0,
                effectiveTaxPercentage: mealAddOn.addOn.taxPercentage !== null ? Number(mealAddOn.addOn.taxPercentage) : null,
              },
            };
          }
          return mealAddOn;
        });
      }

      res.json({
        success: true,
        data: mealData,
      });
    } catch (error) {
      console.error("Error fetching meal:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch meal",
      });
    }
  };

  private getAddon = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { branchId } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();

      const organizationId = await this.resolveOrganizationIdForPublicMenu(req, prisma);
      if (!organizationId) {
        res.status(400).json({
          success: false,
          error: "organizationId is required",
        });
        return;
      }

      const whereClause: any = {
        id,
        organizationId,
        isActive: true,
      };

      if (branchId && typeof branchId === "string" && branchId.trim()) {
        whereClause.NOT = {
          excludedBranches: {
            has: branchId.trim(),
          },
        };
      }

      const addon = await prisma.addOn.findFirst({
        where: whereClause,
        include: {
          addonCategories: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          addonSizes: true,
          addonBranchPrices:
            branchId && typeof branchId === "string" && branchId.trim()
              ? {
                  where: { branchId: branchId.trim() },
                  select: {
                    id: true,
                    branchId: true,
                    basePrice: true,
                    taxPercentage: true,
                  },
                }
              : false,
          _count: {
            select: {
              mealAddOns: true,
            },
          },
        },
      });

      if (!addon) {
        res.status(404).json({
          success: false,
          error: "Addon not found",
        });
        return;
      }

      const addonData: any = { ...addon };

      if (branchId && typeof branchId === "string" && branchId.trim()) {
        const { basePrice, taxPercentage } = await getAddonPriceAndTax(
          addon.id,
          branchId.trim()
        );
        addonData.effectiveBasePrice = basePrice;
        addonData.effectiveTaxPercentage = taxPercentage;

        if (addonData.addonBranchPrices) {
          delete addonData.addonBranchPrices;
        }
      } else {
        addonData.effectiveBasePrice = addon.price !== null ? Number(addon.price) : 0;
        addonData.effectiveTaxPercentage =
          addon.taxPercentage !== null ? Number(addon.taxPercentage) : null;
      }

      res.json({
        success: true,
        data: addonData,
      });
    } catch (error) {
      console.error("Error fetching addon:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch addon",
      });
    }
  };

  // Protected handlers

  private getUserAddresses = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const addresses = await db.getPrisma().userAddress.findMany({
        where: { userId: req.user?.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });

      res.json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      console.error("Error fetching user addresses:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch addresses",
      });
    }
  };

  private addAddress = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { label, street, city, state, zipCode, isDefault } = req.body;

      if (!label || !street || !city || !state || !zipCode) {
        res.status(400).json({
          success: false,
          error: "All address fields are required",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // If setting as default, unset other defaults
      if (isDefault) {
        await db.getPrisma().userAddress.updateMany({
          where: { userId: req.user?.id },
          data: { isDefault: false },
        });
      }

      const address = await db.getPrisma().userAddress.create({
        data: {
          userId: req.user?.id!,
          label,
          street,
          city,
          state,
          zipCode,
          isDefault: isDefault || false,
        },
      });

      res.json({
        success: true,
        data: address,
        message: "Address added successfully",
      });
    } catch (error) {
      console.error("Error adding address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to add address",
      });
    }
  };

  private updateAddress = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { label, street, city, state, zipCode, isDefault } = req.body;

      const db = DatabaseSingleton.getInstance();

      // Check if address belongs to user
      const existingAddress = await db.getPrisma().userAddress.findFirst({
        where: { id, userId: req.user?.id },
      });

      if (!existingAddress) {
        res.status(404).json({
          success: false,
          error: "Address not found",
        });
        return;
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await db.getPrisma().userAddress.updateMany({
          where: { userId: req.user?.id },
          data: { isDefault: false },
        });
      }

      const address = await db.getPrisma().userAddress.update({
        where: { id },
        data: {
          label,
          street,
          city,
          state,
          zipCode,
          isDefault: isDefault || false,
        },
      });

      res.json({
        success: true,
        data: address,
        message: "Address updated successfully",
      });
    } catch (error) {
      console.error("Error updating address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update address",
      });
    }
  };

  private deleteAddress = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();

      // Check if address belongs to user
      const existingAddress = await db.getPrisma().userAddress.findFirst({
        where: { id, userId: req.user?.id },
      });

      if (!existingAddress) {
        res.status(404).json({
          success: false,
          error: "Address not found",
        });
        return;
      }

      await db.getPrisma().userAddress.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete address",
      });
    }
  };

  private getUserOrders = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    res.json({
      success: true,
      data: { message: "Get user orders - TODO: Implement" },
    });
  };

  private createOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    res.json({
      success: true,
      data: { message: "Create order - TODO: Implement" },
    });
  };

  private getUserOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    res.json({
      success: true,
      data: { message: `Get user order ${req.params.id} - TODO: Implement` },
    });
  };

  private cancelOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    res.json({
      success: true,
      data: { message: `Cancel order ${req.params.id} - TODO: Implement` },
    });
  };

  // Get settings (read-only for authenticated users)
  private getSettings = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    await SettingsController.getSettings(req, res);
  };

  // Public settings endpoint - returns allowExcludeOptionalIngredients, appStatus, and currency
  private getPublicSettings = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const settings = await db.getPrisma().settings.findFirst({
        select: {
          allowExcludeOptionalIngredients: true,
          appStatus: true,
          currency: true,
        },
      });

      // Default values if no settings exist
      const result = {
        allowExcludeOptionalIngredients:
          settings?.allowExcludeOptionalIngredients ?? true,
        appStatus: settings?.appStatus ?? "LIVE",
        currency: settings?.currency ?? "USD",
      };

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching public settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch settings",
        data: {
          allowExcludeOptionalIngredients: true, // Default to allowing exclusion on error
          appStatus: "LIVE",
          currency: "USD",
        },
      });
    }
  };

  // Public endpoint to get delivery serving hours
  // Accepts optional branchId query parameter to get hours from branch instead of settings
  private getServingHours = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const branchId = req.query.branchId as string | undefined;
      
      // Helper function to convert periods JSON to array, with fallback to single open/close
      const getDayHours = (
        isOff: boolean,
        open: string | null | undefined,
        close: string | null | undefined,
        periods: any
      ) => {
        const result: any = { isOff };
        
        // Use periods if available and valid
        if (periods && Array.isArray(periods) && periods.length > 0) {
          result.periods = periods;
        } else if (open && close) {
          // Fallback to single period for backward compatibility
          result.open = open;
          result.close = close;
        }
        
        return result;
      };

      // If branchId is provided, fetch from branch, otherwise fetch from settings
      if (branchId) {
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId },
          select: {
            isActive: true,
            organizationId: true,
            organization: { select: { isActive: true } as any } as any,
            allowOrdersOutsideHours: true,
            mondayIsOff: true,
            mondayOpen: true,
            mondayClose: true,
            mondayPeriods: true,
            tuesdayIsOff: true,
            tuesdayOpen: true,
            tuesdayClose: true,
            tuesdayPeriods: true,
            wednesdayIsOff: true,
            wednesdayOpen: true,
            wednesdayClose: true,
            wednesdayPeriods: true,
            thursdayIsOff: true,
            thursdayOpen: true,
            thursdayClose: true,
            thursdayPeriods: true,
            fridayIsOff: true,
            fridayOpen: true,
            fridayClose: true,
            fridayPeriods: true,
            saturdayIsOff: true,
            saturdayOpen: true,
            saturdayClose: true,
            saturdayPeriods: true,
            sundayIsOff: true,
            sundayOpen: true,
            sundayClose: true,
            sundayPeriods: true,
          },
        });

        if (
          !branch ||
          (branch as any).isActive === false ||
          ((branch as any).organizationId && (branch as any).organization?.isActive === false)
        ) {
          res.status(404).json({
            success: false,
            error: "Branch not found",
          });
          return;
        }

        // If branch has null values, fall back to settings
        const hasBranchHours = 
          branch.mondayIsOff !== null ||
          branch.mondayOpen !== null ||
          branch.mondayPeriods !== null ||
          branch.tuesdayIsOff !== null ||
          branch.tuesdayOpen !== null ||
          branch.tuesdayPeriods !== null;

        if (!hasBranchHours) {
          // Fall back to settings
      const settings = await db.getPrisma().settings.findFirst({
        select: {
          allowOrdersOutsideHours: true,
          mondayIsOff: true,
          mondayOpen: true,
          mondayClose: true,
          mondayPeriods: true,
          tuesdayIsOff: true,
          tuesdayOpen: true,
          tuesdayClose: true,
          tuesdayPeriods: true,
          wednesdayIsOff: true,
          wednesdayOpen: true,
          wednesdayClose: true,
          wednesdayPeriods: true,
          thursdayIsOff: true,
          thursdayOpen: true,
          thursdayClose: true,
          thursdayPeriods: true,
          fridayIsOff: true,
          fridayOpen: true,
          fridayClose: true,
          fridayPeriods: true,
          saturdayIsOff: true,
          saturdayOpen: true,
          saturdayClose: true,
          saturdayPeriods: true,
          sundayIsOff: true,
          sundayOpen: true,
          sundayClose: true,
          sundayPeriods: true,
        },
      });

      if (!settings) {
        res.json({
          success: true,
          data: {
            hours: {
              monday: { isOff: false },
              tuesday: { isOff: false },
              wednesday: { isOff: false },
              thursday: { isOff: false },
              friday: { isOff: false },
              saturday: { isOff: false },
              sunday: { isOff: false },
            },
            currentStatus: {
              isOpen: true,
              isOff: false,
            },
          },
        });
        return;
      }

          const hours = {
            monday: getDayHours(
              settings.mondayIsOff,
              settings.mondayOpen,
              settings.mondayClose,
              settings.mondayPeriods
            ),
            tuesday: getDayHours(
              settings.tuesdayIsOff,
              settings.tuesdayOpen,
              settings.tuesdayClose,
              settings.tuesdayPeriods
            ),
            wednesday: getDayHours(
              settings.wednesdayIsOff,
              settings.wednesdayOpen,
              settings.wednesdayClose,
              settings.wednesdayPeriods
            ),
            thursday: getDayHours(
              settings.thursdayIsOff,
              settings.thursdayOpen,
              settings.thursdayClose,
              settings.thursdayPeriods
            ),
            friday: getDayHours(
              settings.fridayIsOff,
              settings.fridayOpen,
              settings.fridayClose,
              settings.fridayPeriods
            ),
            saturday: getDayHours(
              settings.saturdayIsOff,
              settings.saturdayOpen,
              settings.saturdayClose,
              settings.saturdayPeriods
            ),
            sunday: getDayHours(
              settings.sundayIsOff,
              settings.sundayOpen,
              settings.sundayClose,
              settings.sundayPeriods
            ),
          };

          const { checkServingHours } = await import("../utils/deliveryHours");
          const now = new Date();
          const status = checkServingHours(hours, now);

          res.json({
            success: true,
            data: {
              hours,
              allowOrdersOutsideHours: settings?.allowOrdersOutsideHours || false,
              currentStatus: {
                isOpen: status.isOpen,
                isOff: status.isOff,
                message: status.message,
                nextOpenTime: status.nextOpenTime,
                currentDayHours: status.currentDayHours,
                hoursUntilOpen: status.hoursUntilOpen,
                minutesUntilOpen: status.minutesUntilOpen,
                nextOpenDay: status.nextOpenDay,
                nextOpenTimeString: status.nextOpenTimeString,
              },
            },
          });
          return;
        }

        // Use branch hours (with fallback to settings for null values)
        const settings = await db.getPrisma().settings.findFirst({
          select: {
            allowOrdersOutsideHours: true,
            mondayIsOff: true,
            mondayOpen: true,
            mondayClose: true,
            mondayPeriods: true,
            tuesdayIsOff: true,
            tuesdayOpen: true,
            tuesdayClose: true,
            tuesdayPeriods: true,
            wednesdayIsOff: true,
            wednesdayOpen: true,
            wednesdayClose: true,
            wednesdayPeriods: true,
            thursdayIsOff: true,
            thursdayOpen: true,
            thursdayClose: true,
            thursdayPeriods: true,
            fridayIsOff: true,
            fridayOpen: true,
            fridayClose: true,
            fridayPeriods: true,
            saturdayIsOff: true,
            saturdayOpen: true,
            saturdayClose: true,
            saturdayPeriods: true,
            sundayIsOff: true,
            sundayOpen: true,
            sundayClose: true,
            sundayPeriods: true,
          },
        });

        const hours = {
          monday: getDayHours(
            branch.mondayIsOff ?? settings?.mondayIsOff ?? false,
            branch.mondayOpen ?? settings?.mondayOpen ?? null,
            branch.mondayClose ?? settings?.mondayClose ?? null,
            branch.mondayPeriods ?? settings?.mondayPeriods ?? null
          ),
          tuesday: getDayHours(
            branch.tuesdayIsOff ?? settings?.tuesdayIsOff ?? false,
            branch.tuesdayOpen ?? settings?.tuesdayOpen ?? null,
            branch.tuesdayClose ?? settings?.tuesdayClose ?? null,
            branch.tuesdayPeriods ?? settings?.tuesdayPeriods ?? null
          ),
          wednesday: getDayHours(
            branch.wednesdayIsOff ?? settings?.wednesdayIsOff ?? false,
            branch.wednesdayOpen ?? settings?.wednesdayOpen ?? null,
            branch.wednesdayClose ?? settings?.wednesdayClose ?? null,
            branch.wednesdayPeriods ?? settings?.wednesdayPeriods ?? null
          ),
          thursday: getDayHours(
            branch.thursdayIsOff ?? settings?.thursdayIsOff ?? false,
            branch.thursdayOpen ?? settings?.thursdayOpen ?? null,
            branch.thursdayClose ?? settings?.thursdayClose ?? null,
            branch.thursdayPeriods ?? settings?.thursdayPeriods ?? null
          ),
          friday: getDayHours(
            branch.fridayIsOff ?? settings?.fridayIsOff ?? false,
            branch.fridayOpen ?? settings?.fridayOpen ?? null,
            branch.fridayClose ?? settings?.fridayClose ?? null,
            branch.fridayPeriods ?? settings?.fridayPeriods ?? null
          ),
          saturday: getDayHours(
            branch.saturdayIsOff ?? settings?.saturdayIsOff ?? false,
            branch.saturdayOpen ?? settings?.saturdayOpen ?? null,
            branch.saturdayClose ?? settings?.saturdayClose ?? null,
            branch.saturdayPeriods ?? settings?.saturdayPeriods ?? null
          ),
          sunday: getDayHours(
            branch.sundayIsOff ?? settings?.sundayIsOff ?? false,
            branch.sundayOpen ?? settings?.sundayOpen ?? null,
            branch.sundayClose ?? settings?.sundayClose ?? null,
            branch.sundayPeriods ?? settings?.sundayPeriods ?? null
          ),
        };

        const { checkServingHours } = await import("../utils/deliveryHours");
        const now = new Date();
        const status = checkServingHours(hours, now);

        res.json({
          success: true,
          data: {
            hours,
            allowOrdersOutsideHours: branch.allowOrdersOutsideHours ?? settings?.allowOrdersOutsideHours ?? false,
            currentStatus: {
              isOpen: status.isOpen,
              isOff: status.isOff,
              message: status.message,
              nextOpenTime: status.nextOpenTime,
              currentDayHours: status.currentDayHours,
              hoursUntilOpen: status.hoursUntilOpen,
              minutesUntilOpen: status.minutesUntilOpen,
              nextOpenDay: status.nextOpenDay,
              nextOpenTimeString: status.nextOpenTimeString,
            },
          },
        });
        return;
      }

      // Default: fetch from settings
      const settings = await db.getPrisma().settings.findFirst({
        select: {
          allowOrdersOutsideHours: true,
          mondayIsOff: true,
          mondayOpen: true,
          mondayClose: true,
          mondayPeriods: true,
          tuesdayIsOff: true,
          tuesdayOpen: true,
          tuesdayClose: true,
          tuesdayPeriods: true,
          wednesdayIsOff: true,
          wednesdayOpen: true,
          wednesdayClose: true,
          wednesdayPeriods: true,
          thursdayIsOff: true,
          thursdayOpen: true,
          thursdayClose: true,
          thursdayPeriods: true,
          fridayIsOff: true,
          fridayOpen: true,
          fridayClose: true,
          fridayPeriods: true,
          saturdayIsOff: true,
          saturdayOpen: true,
          saturdayClose: true,
          saturdayPeriods: true,
          sundayIsOff: true,
          sundayOpen: true,
          sundayClose: true,
          sundayPeriods: true,
        },
      });

      if (!settings) {
        res.json({
          success: true,
          data: {
            hours: {
              monday: { isOff: false },
              tuesday: { isOff: false },
              wednesday: { isOff: false },
              thursday: { isOff: false },
              friday: { isOff: false },
              saturday: { isOff: false },
              sunday: { isOff: false },
            },
            currentStatus: {
              isOpen: true,
              isOff: false,
            },
          },
        });
        return;
      }

      const hours = {
        monday: getDayHours(
          settings.mondayIsOff,
          settings.mondayOpen,
          settings.mondayClose,
          settings.mondayPeriods
        ),
        tuesday: getDayHours(
          settings.tuesdayIsOff,
          settings.tuesdayOpen,
          settings.tuesdayClose,
          settings.tuesdayPeriods
        ),
        wednesday: getDayHours(
          settings.wednesdayIsOff,
          settings.wednesdayOpen,
          settings.wednesdayClose,
          settings.wednesdayPeriods
        ),
        thursday: getDayHours(
          settings.thursdayIsOff,
          settings.thursdayOpen,
          settings.thursdayClose,
          settings.thursdayPeriods
        ),
        friday: getDayHours(
          settings.fridayIsOff,
          settings.fridayOpen,
          settings.fridayClose,
          settings.fridayPeriods
        ),
        saturday: getDayHours(
          settings.saturdayIsOff,
          settings.saturdayOpen,
          settings.saturdayClose,
          settings.saturdayPeriods
        ),
        sunday: getDayHours(
          settings.sundayIsOff,
          settings.sundayOpen,
          settings.sundayClose,
          settings.sundayPeriods
        ),
      };

      // Import the utility function
      const { checkServingHours } = await import("../utils/deliveryHours");
      const now = new Date();
      const status = checkServingHours(hours, now);

      res.json({
        success: true,
        data: {
          hours,
          allowOrdersOutsideHours: settings?.allowOrdersOutsideHours || false,
          currentStatus: {
            isOpen: status.isOpen,
            isOff: status.isOff,
            message: status.message,
            nextOpenTime: status.nextOpenTime,
            currentDayHours: status.currentDayHours,
            hoursUntilOpen: status.hoursUntilOpen,
            minutesUntilOpen: status.minutesUntilOpen,
            nextOpenDay: status.nextOpenDay,
            nextOpenTimeString: status.nextOpenTimeString,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching serving hours:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch serving hours",
      });
    }
  };

  public getRouter(): Router {
    return this.router;
  }
}

export default UserRoutes;
