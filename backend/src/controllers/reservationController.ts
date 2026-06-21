import { Request, Response } from "express";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";
import { RBACRequest } from "../middleware/rbac";
import { hasImplicitFullAccess } from "../config/permissions";
import { AuditLogService } from "../services/auditLogService";
import RBACMiddleware from "../middleware/rbac";
import ReservationService from "../services/reservationService";
import { OrderController } from "./orderController";
import TaxCalculator from "../utils/taxCalculator";
import { getMealBasePrice } from "../utils/mealPriceHelper";
import { getAddonBasePrice } from "../utils/addonPriceHelper";
import WebSocketService from "../services/websocketService";
import Stripe from "stripe";
import PaymentService from "../services/paymentService";
import {
  Prisma,
  PaymentMethod,
  PaymentProvider,
  PaymentState,
  SizeType,
} from "@prisma/client";
import { deliverableQuantityService } from "../services/deliverableQuantityService";

export class ReservationController {
  private reservationService: ReservationService;
  private orderController: OrderController;
  private rbac: RBACMiddleware;
  private stripe: Stripe;

  constructor() {
    this.reservationService = ReservationService.getInstance();
    this.orderController = new OrderController();
    this.rbac = RBACMiddleware.getInstance();
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-10-29.clover",
    });
  }

  // Get reservation settings
  public getSettings = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const branchId = req.query.branchId as string | undefined;
      const organizationId = (req as any).organizationId as string | undefined;
      
      // Validate branch is active if branchId provided
      if (branchId) {
        const db = DatabaseSingleton.getInstance();
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId },
          select: {
            isActive: true,
            organizationId: true,
            organization: { select: { isActive: true } as any } as any,
          } as any,
        });
        if (
          !branch ||
          !branch.isActive ||
          ((branch as any).organizationId && (branch as any).organization?.isActive === false)
        ) {
          res.status(400).json({
            success: false,
            error: "Invalid or inactive branch",
          });
          return;
        }
      }
      
      const settings = await this.reservationService.getSettings(branchId, organizationId);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error("Error fetching reservation settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reservation settings",
      });
    }
  };

  // Update reservation settings (admin only)
  public updateSettings = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma() as any;
      const organizationId = (req as any).organizationId as string | undefined;
      const existing = organizationId
        ? await prisma.reservationSettings.findUnique({ where: { organizationId } })
        : await prisma.reservationSettings.findFirst();

      const settings = await this.reservationService.updateSettings(req.body, organizationId);

      await AuditLogService.writeSafe({
        action: "RESERVATION_SETTINGS_UPDATE",
        entityType: "ReservationSettings",
        entityId: (settings as any)?.id || null,
        scope: { organizationId: (settings as any)?.organizationId || null },
        actor: AuditLogService.getActorFromRequest(req as any),
        before: existing,
        after: settings,
        metadata: AuditLogService.getRequestMetadata(req as any),
      });

      res.json({
        success: true,
        data: settings,
      });
    } catch (error: any) {
      console.error("Error updating reservation settings:", error);
      const errorMessage = error?.message || "Failed to update reservation settings";
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };

  // Get all reservations (with filters)
  public getAllReservations = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        type,
        date,
        fromDate,
        toDate,
        branchId,
        zoneId,
      } = req.query;

      if (!req.rbacUser) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(req.rbacUser.userType);

      const branchIdStr = (branchId as string | undefined) || undefined;
      if (!isSuperAdmin) {
        // Staff views are branch-scoped (employee should see branch reservations, not only their own customer bookings)
        if (!branchIdStr) {
          res.status(400).json({ success: false, error: "branchId is required" });
          return;
        }

        const orgRole = (req.rbacUser as any).orgRole as string | null | undefined;
        const isOrgAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

        if (isOrgAdmin) {
          const orgId = (req.rbacUser as any).organizationId as string | null | undefined;
          if (!orgId) {
            res.status(403).json({ success: false, error: "Access denied" });
            return;
          }
          const db = DatabaseSingleton.getInstance();
          const branch = await db.getPrisma().branch.findUnique({
            where: { id: branchIdStr },
            select: { id: true, organizationId: true },
          });
          if (!branch || branch.organizationId !== orgId) {
            res.status(403).json({ success: false, error: "Access denied for this branch" });
            return;
          }
        } else {
          if (!req.rbacUser.assignedBranchIds.includes(branchIdStr)) {
            res.status(403).json({ success: false, error: "Access denied for this branch" });
            return;
          }
        }
      }

      const userId = undefined;

      const hasExplicitDateFilter = Boolean(date || fromDate || toDate);
      const shouldDefaultToToday = Boolean(branchIdStr && !hasExplicitDateFilter);
      const today = shouldDefaultToToday ? new Date() : null;

      const result = await this.reservationService.getReservations({
        page: Number(page),
        limit: Number(limit),
        status: status as string,
        type: type as string,
        date: date ? new Date(date as string) : undefined,
        fromDate: fromDate
          ? new Date(fromDate as string)
          : shouldDefaultToToday
            ? (today as Date)
            : undefined,
        toDate: toDate
          ? new Date(toDate as string)
          : shouldDefaultToToday
            ? (today as Date)
            : undefined,
        userId,
        branchId: branchIdStr,
        zoneId: zoneId as string | undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching reservations:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reservations",
      });
    }
  };

  // Get user's reservations
  public getUserReservations = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const {
        page = 1,
        limit = 10,
        status,
        type,
        branchId,
      } = req.query;

      const result = await this.reservationService.getReservations({
        page: Number(page),
        limit: Number(limit),
        status: status as string,
        type: type as string,
        userId: req.user.id,
        branchId: branchId as string | undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error fetching user reservations:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reservations",
      });
    }
  };

  // Get reservation by ID
  public getReservationById = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const reservation = await this.reservationService.getReservationById(id);

      if (!reservation) {
        res.status(404).json({
          success: false,
          error: "Reservation not found",
        });
        return;
      }

      // Access rules:
      // - SUPER_ADMIN: always
      // - Staff with RESERVATIONS:VIEW: can access reservations in assigned branches
      // - Customers: can access their own reservations
      const rbacReq = req as any as RBACRequest;
      const rbacUser = rbacReq.rbacUser;

      if (rbacUser) {
        // SUPER_ADMIN has implicit full access
        const isSuperAdmin = hasImplicitFullAccess(rbacUser.userType);
        if (!isSuperAdmin) {
          const canAccess = await this.rbac.canAccessResource(rbacUser, "reservation", id);
          if (!canAccess) {
            res.status(403).json({
              success: false,
              error: "Access denied",
            });
            return;
          }
        }
      } else {
        // Fallback legacy behavior if RBAC wasn't used
        const isAdminUser =
          req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN";
        if (!isAdminUser && reservation.userId !== req.user?.id) {
          res.status(403).json({
            success: false,
            error: "Access denied",
          });
          return;
        }
      }

      res.json({
        success: true,
        data: reservation,
      });
    } catch (error) {
      console.error("Error fetching reservation:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reservation",
      });
    }
  };

  // Check availability
  public checkAvailability = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { date, time, numberOfGuests, branchId } = req.query;

      if (!date || !time || !numberOfGuests) {
        res.status(400).json({
          success: false,
          error: "Date, time, and numberOfGuests are required",
        });
        return;
      }

      // Validate branch is active if branchId provided
      if (branchId) {
        const db = DatabaseSingleton.getInstance();
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId as string },
          select: { isActive: true },
        });
        if (!branch || !branch.isActive) {
          res.status(400).json({
            success: false,
            error: "Invalid or inactive branch",
          });
          return;
        }
      }

      const dateObj = new Date(date as string);
      const result = await this.reservationService.checkAvailability(
        dateObj,
        time as string,
        Number(numberOfGuests),
        branchId as string | undefined
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error checking availability:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check availability",
      });
    }
  };

  // Get available time slots
  public getAvailableTimeSlots = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { date, numberOfGuests, branchId } = req.query;

      if (!date || !numberOfGuests) {
        res.status(400).json({
          success: false,
          error: "Date and numberOfGuests are required",
        });
        return;
      }

      // Validate branch is active if branchId provided
      if (branchId) {
        const db = DatabaseSingleton.getInstance();
        const branch = await db.getPrisma().branch.findUnique({
          where: { id: branchId as string },
          select: { isActive: true },
        });
        if (!branch || !branch.isActive) {
          res.status(400).json({
            success: false,
            error: "Invalid or inactive branch",
          });
          return;
        }
      }

      // Parse date string and ensure it's in local timezone
      // Date strings like "2024-01-15" are parsed as UTC midnight, so we need to adjust
      const dateStr = date as string;
      const [year, month, day] = dateStr.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day); // month is 0-indexed
      
      const slots = await this.reservationService.getAvailableTimeSlots(
        dateObj,
        Number(numberOfGuests),
        branchId as string | undefined
      );

      // Get settings for debugging
      const settings = await this.reservationService.getSettings(branchId as string | undefined);
      const dayOfWeek = dateObj.getDay();
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = dayNames[dayOfWeek];
      
      // Get operating hours for debugging
      const hoursField = `${dayName.toLowerCase()}Open`;
      const closeField = `${dayName.toLowerCase()}Close`;
      const openTime = settings[hoursField] || null;
      const closeTime = settings[closeField] || null;

      res.json({
        success: true,
        data: { 
          timeSlots: slots,
          debug: {
            date: dateStr,
            dayOfWeek: dayName,
            operatingHours: {
              open: openTime,
              close: closeTime,
            },
            settings: {
              isEnabled: settings.isEnabled,
              minAdvanceBookingHours: settings.minAdvanceBookingHours,
              maxAdvanceBookingDays: settings.maxAdvanceBookingDays,
              allowSameDayBooking: settings.allowSameDayBooking,
              timeSlotInterval: settings.timeSlotInterval,
            },
          },
        },
      });
    } catch (error) {
      console.error("Error fetching time slots:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch time slots",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Create simple reservation
  public createSimpleReservation = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        reservationDate,
        time,
        numberOfGuests,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        preferredZone,
        tableIds,
        branchId,
        zoneId,
      } = req.body;

      // Validate required fields
      if (
        !reservationDate ||
        !time ||
        !numberOfGuests ||
        !customerName ||
        !customerEmail ||
        !customerPhone
      ) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
        return;
      }

      // Parse date and time
      const [hours, minutes] = time.split(":").map(Number);
      const dateTime = new Date(reservationDate);
      dateTime.setHours(hours, minutes, 0, 0);

      // Validate branchId if provided
      if (branchId) {
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
      }

      // Check availability
      const availability = await this.reservationService.checkAvailability(
        dateTime,
        time,
        numberOfGuests,
        branchId
      );

      if (!availability.available) {
        res.status(400).json({
          success: false,
          error: availability.reason || "Time slot not available",
        });
        return;
      }

      const reservation = await this.reservationService.createSimpleReservation({
        userId: req.user?.id,
        branchId: branchId || null,
        reservationDate: dateTime,
        numberOfGuests,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        preferredZone,
        tableIds: Array.isArray(tableIds) ? tableIds : undefined,
        zoneId: zoneId || undefined,
      });

      // Create notification for new reservation
      try {
        const db = DatabaseSingleton.getInstance();
        const notification = await db.getPrisma().notification.create({
          data: {
            reservationId: reservation.id,
            type: "RESERVATION",
            isSeen: false,
            isOrderUpdate: false,
          },
        });

        // Fetch notification with full reservation details for WebSocket emission
        const notificationWithReservation = await db.getPrisma().notification.findUnique({
          where: { id: notification.id },
          include: {
            reservation: {
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
              },
            },
          },
        });

        // Emit WebSocket event
        const wsService = WebSocketService.getInstance();
        if (notificationWithReservation) {
          wsService.emitNewReservation(notificationWithReservation, reservation);
        }
      } catch (error) {
        console.error("Error creating reservation notification:", error);
        // Continue even if notification creation fails
      }

      res.status(201).json({
        success: true,
        data: reservation,
      });
    } catch (error) {
      console.error("Error creating reservation:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create reservation",
      });
    }
  };

  // Create pre-order reservation
  public createPreOrderReservation = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        reservationDate,
        time,
        numberOfGuests,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        preferredZone,
        orderItems,
        paymentIntentId, // Stripe payment intent ID
        paypalOrderId, // PayPal order ID
        branchId,
        zoneId,
        tableIds,
      } = req.body;

      // Validate required fields
      if (
        !reservationDate ||
        !time ||
        !numberOfGuests ||
        !customerName ||
        !customerEmail ||
        !customerPhone ||
        !orderItems ||
        !Array.isArray(orderItems) ||
        orderItems.length === 0
      ) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
        return;
      }

      // Determine payment method and ID
      const isPayPal = !!paypalOrderId;
      const rawPaymentId = (paypalOrderId || paymentIntentId || "").trim();
      const paymentId = rawPaymentId.length > 0 ? rawPaymentId : null;

      // Parse date and time
      const [hours, minutes] = time.split(":").map(Number);
      const dateTime = new Date(reservationDate);
      dateTime.setHours(hours, minutes, 0, 0);

      // Validate branchId if provided
      if (branchId) {
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
      }

      // Check availability
      const availability = await this.reservationService.checkAvailability(
        dateTime,
        time,
        numberOfGuests,
        branchId
      );

      if (!availability.available) {
        res.status(400).json({
          success: false,
          error: availability.reason || "Time slot not available",
        });
        return;
      }

      // Check settings for pre-order
      const settings = await this.reservationService.getSettings(branchId);
      if (!settings.enablePreOrder) {
        res.status(400).json({
          success: false,
          error: "Pre-order reservations are disabled",
        });
        return;
      }

      // Calculate order total using TaxCalculator
      const db = DatabaseSingleton.getInstance();
      const taxCalculator = new TaxCalculator();
      
      // Get main settings for tax calculation
      const mainSettings = await db.getPrisma().settings.findFirst();
      const branchForTax = branchId
        ? await db.getPrisma().branch.findUnique({
            where: { id: branchId },
            select: { taxInclusive: true },
          })
        : null;

      const taxInclusive =
        branchForTax?.taxInclusive !== null && branchForTax?.taxInclusive !== undefined
          ? Boolean(branchForTax.taxInclusive)
          : Boolean(mainSettings?.taxInclusive || false);
      
      // Get all meals for tax calculation
      const mealIds = orderItems.map((item: any) => item.mealId);
      const meals = await db.getPrisma().meal.findMany({
        where: { id: { in: mealIds } },
        include: {
          mealSizes: true,
          category: true,
        },
      });

      // Validate deliverable quantity for the reservation date (if branch provided)
      if (branchId) {
        const weightValidation = await deliverableQuantityService.validateOrderWeight(
          orderItems.map((item: any) => {
            const meal = meals.find((m) => m.id === item.mealId);
            const fallbackSize =
              meal?.mealSizes?.find((s) => s.sizeType === item.mealSizeType) ||
              meal?.mealSizes?.[0];
            return {
              mealId: item.mealId,
              mealSizeType: item.mealSizeType || fallbackSize?.sizeType || SizeType.M,
              quantity: item.quantity,
            };
          }),
          branchId,
          dateTime
        );
        if (!weightValidation.ok) {
          res.status(400).json({
            success: false,
            error:
              weightValidation.failures.join("; ") ||
              "Insufficient deliverable quantity for one or more items on the selected date.",
          });
          return;
        }
      }
      // Get addons for trusted pricing/tax (fallback to request price if missing)
      const addonIds = orderItems.flatMap((item: any) =>
        Array.isArray(item.addons)
          ? item.addons.map((addon: any) => addon.addonId).filter(Boolean)
          : []
      );
      const addonsFromDb =
        addonIds.length > 0
          ? await db.getPrisma().addOn.findMany({
              where: { id: { in: addonIds } },
            })
          : [];

      let totalAmount = 0;
      let itemTaxAmount = 0;
      let addonTaxAmount = 0;

      // Calculate totals
      for (const item of orderItems) {
        const meal = meals.find((m) => m.id === item.mealId);
        if (!meal) {
          continue;
        }

        const mealSize = meal.mealSizes.find(
          (s) => s.sizeType === item.mealSizeType
        );

        const branchBasePrice = await getMealBasePrice(
          item.mealId,
          branchId || undefined
        );

        if (!mealSize) {
          console.error(`[ReservationController] ❌ Meal size not found for mealId: ${item.mealId}, mealName: ${meal.name}, requested sizeType: ${item.mealSizeType}. Available sizes:`, meal.mealSizes.map(s => ({ name: s.name, sizeType: s.sizeType, price: Number(s.price) })));
          console.error(`[ReservationController] ⚠️  Falling back to branch/base price only: ${Number(branchBasePrice)}`);
        } else {
        }

        // IMPORTANT: mealSize.price is the ADDITIONAL price for the size, not the total
        // Total price = meal.basePrice + mealSize.price (just like frontend does)
        const unitPrice = mealSize
          ? Number(branchBasePrice) + Number(mealSize.price)
          : Number(branchBasePrice);
        const itemTotal = unitPrice * item.quantity;
        totalAmount += itemTotal;


        // Calculate tax for item
        const taxPercentage = await taxCalculator.getMealTaxPercentage(
          item.mealId,
          mealSize?.name,
          branchId || undefined
        );
        let itemTax = 0;
        if (taxInclusive) {
          itemTax = (Number(unitPrice) * taxPercentage) / (100 + taxPercentage);
        } else {
          itemTax = (Number(unitPrice) * taxPercentage) / 100;
        }
        itemTaxAmount += itemTax * item.quantity;

        // Calculate tax for addons
        if (item.addons && Array.isArray(item.addons)) {
          for (const addonItem of item.addons) {
            const addonData = addonsFromDb.find(
              (addon) => addon.id === addonItem.addonId
            );
            const addonPrice =
              addonData && branchId
                ? await getAddonBasePrice(addonItem.addonId, branchId)
                : addonData
                ? Number(addonData.price)
                : Number(addonItem.price || 0);
            const addonQuantity = addonItem.quantity || 1;
            // IMPORTANT: Multiply by item.quantity because addons are per meal item
            // Example: 4 burgers × 1 egg each = 4 eggs total
            const addonTotal = addonPrice * addonQuantity * item.quantity;
            totalAmount += addonTotal;

            const addonTaxPercentage = await taxCalculator.getAddonTaxPercentage(
              addonItem.addonId,
              branchId || undefined
            );
            let addonTax = 0;
            if (taxInclusive) {
              addonTax = (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage);
            } else {
              addonTax = (addonPrice * addonTaxPercentage) / 100;
            }
            const addonTaxForAll = addonTax * addonQuantity * item.quantity;
            addonTaxAmount += addonTaxForAll;
            
          }
        }
      }

      const roundedItemTaxAmount = Math.round(itemTaxAmount * 100) / 100;
      const roundedAddonTaxAmount = Math.round(addonTaxAmount * 100) / 100;
      const taxAmount =
        Math.round((roundedItemTaxAmount + roundedAddonTaxAmount) * 100) / 100;
      // If tax is inclusive, the totalAmount already includes tax, so finalTotal = totalAmount
      // If tax is not inclusive, we need to add tax on top: finalTotal = totalAmount + taxAmount
      const roundedTotalAmount = Math.round(totalAmount * 100) / 100;
      const finalTotal = taxInclusive
        ? roundedTotalAmount
        : Math.round((roundedTotalAmount + taxAmount) * 100) / 100;

      // Deposit & allowed payment methods
      const defaultAllowed: any[] = ["ONLINE_CARD", "PAYPAL", "NONE"];
      const depositPercentage =
        (settings as any)?.depositPercentage ?? 100;
      const allowedPaymentMethods =
        (settings as any)?.allowedPaymentMethods && Array.isArray((settings as any).allowedPaymentMethods)
          ? (settings as any).allowedPaymentMethods
          : defaultAllowed;

      const normalizedAllowed =
        allowedPaymentMethods && allowedPaymentMethods.length > 0 ? allowedPaymentMethods : defaultAllowed;

      const clampedDeposit = Math.max(0, Math.min(100, Number(depositPercentage ?? 100)));
      const payableAmountRaw = (finalTotal * clampedDeposit) / 100;
      const payableAmount = Math.max(0, Math.round(payableAmountRaw * 100) / 100);
      if (process.env.DEBUG_RESERVATION_CALC === "true") {
        console.debug("[ReservationController] Reservation calc", {
          totalAmount,
          roundedTotalAmount,
          itemTaxAmount: roundedItemTaxAmount,
          addonTaxAmount: roundedAddonTaxAmount,
          taxAmount,
          finalTotal,
          depositPercentage: clampedDeposit,
          payableAmount,
        });
      }

      const requestedMethod = paypalOrderId
        ? "PAYPAL"
        : paymentIntentId
        ? "ONLINE_CARD"
        : "NONE";

      if (!normalizedAllowed.includes(requestedMethod)) {
        res.status(400).json({
          success: false,
          error: "Selected payment method is not allowed for this reservation",
        });
        return;
      }

      if (payableAmount > 0 && requestedMethod === "NONE") {
        res.status(400).json({
          success: false,
          error: "Payment is required for the configured deposit",
        });
        return;
      }

      if (payableAmount > 0 && !paymentId) {
        res.status(400).json({
          success: false,
          error: "Payment ID is required for the configured deposit",
        });
        return;
      }


      // Check minimum order amount
      if (settings.preOrderMinAmount && finalTotal < Number(settings.preOrderMinAmount)) {
        res.status(400).json({
          success: false,
          error: `Minimum order amount is ${settings.preOrderMinAmount}. Your order total is ${finalTotal.toFixed(2)}.`,
        });
        return;
      }

      // Get currency from settings
      const currency = mainSettings?.currency || "USD";
      const currencyLower = currency.toLowerCase();
      
      // Create reservation order (separate from regular Order table)
      const reservationOrderNumber = `RES-ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Use Stripe's actual amount when available to avoid drift with frontend
      let paidAmount = payableAmount;
      if (!isPayPal && paymentId) {
        try {
          const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: "2025-10-29.clover",
          });
          const intent = await stripeClient.paymentIntents.retrieve(paymentId);
          const actualPaid =
            (intent.amount_received ?? intent.amount ?? 0) / 100;
          const roundedActualPaid = Math.round(actualPaid * 100) / 100;
          if (Math.abs(roundedActualPaid - payableAmount) > 0.01) {
            console.warn(
              `[ReservationController] Stripe paid amount (${roundedActualPaid}) differs from calculated deposit (${payableAmount}). Using Stripe amount.`
            );
          }
          paidAmount = roundedActualPaid;
        } catch (stripeErr) {
          console.warn(
            "[ReservationController] Unable to reconcile Stripe paid amount, falling back to calculated payableAmount",
            stripeErr
          );
        }
      }
      
      const existingReservationOrder = paymentId
        ? await db.getPrisma().reservationOrder.findFirst({
            where: {
              OR: [{ paymentIntentId: paymentId }, { paymentId }],
            },
            include: {
              items: {
                include: {
                  addons: true,
                  optionalIngredients: true,
                },
              },
            },
          })
        : null;

      if (existingReservationOrder?.reservationId) {
        const existingReservation = await db.getPrisma().reservation.findUnique({
          where: { id: existingReservationOrder.reservationId },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            table: {
              include: {
                zoneRelation: true,
              },
            },
            tables: {
              include: {
                table: {
                  include: {
                    zoneRelation: true,
                  },
                },
              },
            },
            zone: true,
            reservationOrder: {
              include: {
                items: {
                  include: {
                    meal: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (existingReservation) {
          res.status(200).json({
            success: true,
            data: existingReservation,
          });
          return;
        }
      }

      const reservationOrder = existingReservationOrder
        ? existingReservationOrder
        : await db.getPrisma().reservationOrder.create({
            data: ({
              orderNumber: reservationOrderNumber,
              branchId: branchId || null,
              totalAmount: finalTotal,
              currency: currencyLower,
              taxAmount,
              itemTaxAmount: roundedItemTaxAmount,
              addonTaxAmount: roundedAddonTaxAmount,
              paymentMethod:
                requestedMethod === "ONLINE_CARD" || requestedMethod === "PAYPAL"
                  ? "ONLINE_PAYMENT"
                  : "CASH_ON_DELIVERY",
              paymentStatus: payableAmount === 0 ? "PENDING" : "PAID",
              paymentIntentId: paymentId || null, // Store payment ID (Stripe or PayPal)
              paidAmount,
              depositPercentage: new Prisma.Decimal(clampedDeposit),
              customerName,
              customerEmail,
              customerPhone,
              status: "PENDING",
              history: [
                {
                  type: "ORDER_CREATED",
                  action: "Reservation order created",
                  userId: req.user?.id,
                  timestamp: new Date().toISOString(),
                  details: {
                    orderNumber: reservationOrderNumber,
                    totalAmount: finalTotal,
                    itemCount: orderItems.length,
                    paymentIntentId: paymentId,
                    paymentMethod: requestedMethod.toLowerCase(),
                    depositPercentage: clampedDeposit,
                    paidAmount,
                  },
                },
              ],
              items: {
                create: await Promise.all(
                  orderItems.map(async (item) => {
                    const meal = meals.find((m) => m.id === item.mealId);
                    if (!meal) throw new Error(`Meal not found: ${item.mealId}`);

                    const mealSize = meal.mealSizes.find(
                      (s) => s.sizeType === item.mealSizeType
                    );
                    // IMPORTANT: mealSize.price is the ADDITIONAL price, total = basePrice + sizePrice
                    const branchBasePrice = await getMealBasePrice(
                      item.mealId,
                      branchId || undefined
                    );
                    const unitPrice = mealSize
                      ? Number(branchBasePrice) + Number(mealSize.price)
                      : Number(branchBasePrice);
                    const totalPrice = unitPrice * item.quantity;

                    // Calculate tax for this item
                    const itemTaxPct = await taxCalculator.getMealTaxPercentage(
                      item.mealId,
                      mealSize?.name,
                      branchId || undefined // branch-specific tax when available
                    );
                    const basePrice = unitPrice;
                    const itemTax = taxInclusive
                      ? (basePrice * itemTaxPct) / (100 + itemTaxPct)
                      : (basePrice * itemTaxPct) / 100;
                    const itemTaxAmountForOrderItem = itemTax * item.quantity;

                    return {
                      mealId: item.mealId,
                      quantity: item.quantity,
                      unitPrice: unitPrice,
                      totalPrice,
                      selectedSize: mealSize?.name,
                      mealSizeType: item.mealSizeType,
                      specialInstructions: item.specialInstructions,
                      taxAmount: itemTaxAmountForOrderItem,
                      taxPercentage: itemTaxPct,
                      addons: {
                        create: await Promise.all(
                          (item.addons || []).map(async (addonItem: any) => {
                            // Fetch addon from database to get the name if not provided
                            let addonName = addonItem.name || "";
                            if (!addonName && addonItem.addonId) {
                              const addonData = await db.getPrisma().addOn.findUnique({
                                where: { id: addonItem.addonId },
                                select: { name: true },
                              });
                              addonName = addonData?.name || "";
                            }
                            
                            const addonTaxPct = await taxCalculator.getAddonTaxPercentage(
                              addonItem.addonId,
                              branchId || undefined
                            );
                            const addonBasePrice = Number(addonItem.price || 0);
                            const addonQuantity = addonItem.quantity || 1;
                            const addonTax = taxInclusive
                              ? (addonBasePrice * addonTaxPct) / (100 + addonTaxPct)
                              : (addonBasePrice * addonTaxPct) / 100;
                            // IMPORTANT: Multiply by item.quantity because addons are per meal item
                            // Example: 4 burgers × 1 egg each = 4 eggs total, so tax is also × 4
                            const addonTaxAmountForOrderItem =
                              addonTax * addonQuantity * item.quantity;

                            return {
                              addon_id: addonItem.addonId,
                              addOnName: addonName || "Unknown Addon",
                              addOnPrice: addonBasePrice,
                              addon_type: addonItem.type || "BOOLEAN",
                              addonSizeType: addonItem.sizeType,
                              quantity: addonQuantity * item.quantity, // Store total quantity (per item × item quantity)
                              taxAmount: addonTaxAmountForOrderItem,
                              taxPercentage: addonTaxPct,
                            };
                          })
                        ),
                      },
                      optionalIngredients: {
                        create:
                          item.optionalIngredients?.map((ing: any) => ({
                            optionalIngredientId: ing.id,
                            isIncluded: ing.isIncluded !== false,
                            ingredientName: ing.name,
                          })) || [],
                      },
                    };
                  })
                ),
              },
            } as any),
            include: {
              items: {
                include: {
                  addons: true,
                  optionalIngredients: true,
                },
              },
            },
          });

      // Create or link Payment record (only if a deposit/payment was made)
      if (payableAmount > 0 && paymentId) {
        const paymentService = PaymentService.getInstance();
        const paymentCurrency = currency.toUpperCase();
        let paymentRecord = await paymentService.getPaymentByProviderId(paymentId);

        if (!paymentRecord) {
          paymentRecord = await paymentService.createPayment({
            reservationOrderId: reservationOrder.id,
            paymentMethod: PaymentMethod.ONLINE_PAYMENT,
            paymentProvider: isPayPal ? PaymentProvider.PAYPAL : PaymentProvider.STRIPE,
            providerPaymentId: paymentId,
            providerChargeId: paymentId,
            amount: paidAmount,
            currency: paymentCurrency,
            status: PaymentState.COMPLETED,
            metadata: {
              reservationOrderNumber,
              paymentMethod: isPayPal ? "paypal" : "stripe",
              depositPercentage: clampedDeposit,
              paidAmount,
            },
          });
        } else if (!paymentRecord.reservationOrderId) {
          await paymentService.linkPaymentToReservationOrder(
            paymentRecord.id,
            reservationOrder.id
          );
        }
      }


      const reservation = await this.reservationService.createPreOrderReservation({
        userId: req.user?.id,
        branchId: branchId || null,
        reservationDate: dateTime,
        numberOfGuests,
        customerName,
        customerEmail,
        customerPhone,
        specialRequests,
        preferredZone,
        reservationOrderId: reservationOrder.id,
        paymentIntentId: paymentId, // Use paymentId for both Stripe and PayPal
        tableIds: Array.isArray(tableIds) ? tableIds : undefined,
        zoneId: zoneId || undefined,
      });

      // Update reservation order to link back to reservation (idempotent)
      if (!reservationOrder.reservationId) {
        try {
          await db.getPrisma().reservationOrder.update({
            where: { id: reservationOrder.id },
            data: { reservationId: reservation.id },
          });
        } catch (err: any) {
          if (
            err?.code !== "P2002" ||
            !Array.isArray(err?.meta?.target) ||
            !err.meta.target.includes("reservationId")
          ) {
            throw err;
          }
        }
      }

      // Add initial payment entry to history (only if a payment occurred)
      if (payableAmount > 0 && paymentId) {
        await this.reservationService.addHistoryEntry(reservationOrder.id, {
          type: "PAYMENT_PROCESSED",
          action: `Initial payment processed: ${payableAmount.toFixed(2)} ${currency.toUpperCase()}`,
          userId: req.user?.id,
          details: {
            paymentIntentId: paymentId,
            paymentMethod: requestedMethod.toLowerCase(),
            amount: payableAmount,
            currency: currency.toUpperCase(),
            orderNumber: reservationOrderNumber,
            depositPercentage: clampedDeposit,
          },
        });
      }

      // Add history entry for reservation linking
      await this.reservationService.addHistoryEntry(reservationOrder.id, {
        type: "RESERVATION_LINKED",
        action: "Reservation linked to order",
        userId: req.user?.id,
        details: {
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
        },
      });

      // Create notification for new reservation
      try {
        const db = DatabaseSingleton.getInstance();
        const notification = await db.getPrisma().notification.create({
          data: {
            reservationId: reservation.id,
            type: "RESERVATION",
            isSeen: false,
            isOrderUpdate: false,
          },
        });

        // Fetch notification with full reservation details for WebSocket emission
        const notificationWithReservation = await db.getPrisma().notification.findUnique({
          where: { id: notification.id },
          include: {
            reservation: {
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
              },
            },
          },
        });

        // Emit WebSocket event
        const wsService = WebSocketService.getInstance();
        if (notificationWithReservation) {
          wsService.emitNewReservation(notificationWithReservation, reservation);
        }
      } catch (error) {
        console.error("Error creating reservation notification:", error);
        // Continue even if notification creation fails
      }

      res.status(201).json({
        success: true,
        data: reservation,
      });
    } catch (error) {
      console.error("Error creating pre-order reservation:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create pre-order reservation",
      });
    }
  };

  // Update reservation status (admin only)
  public updateReservationStatus = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          error: "Status is required",
        });
        return;
      }

      const reservation = await this.reservationService.updateReservationStatus(
        id,
        status,
        req.user?.id
      );

      res.json({
        success: true,
        data: reservation,
      });
    } catch (error: any) {
      console.error("Error updating reservation status:", error);
      const message = error?.message || "Failed to update reservation status";
      const isBadRequest =
        message.includes("Cannot update") ||
        message.includes("Cannot modify") ||
        message.includes("Status is required") ||
        message.includes("not found");
      res.status(isBadRequest ? 400 : 500).json({
        success: false,
        error: message,
      });
    }
  };

  // Modify reservation (user can update time, date, number of guests, and pre-order items)
  public modifyReservation = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        reservationDate,
        time,
        numberOfGuests,
        orderItems, // For PRE_ORDER reservations
        paymentIntentId, // For new items payment when modifying (Stripe)
        paypalOrderId, // For new items payment when modifying (PayPal)
        branchId, // Block branch changes during modification
        zoneId, // Zone selection
        tableIds, // Table selection (array of table IDs)
      } = req.body;

      // Determine payment method and ID
      const isPayPal = !!paypalOrderId;
      const paymentId = paypalOrderId || paymentIntentId;

      // Get the reservation
      const db = DatabaseSingleton.getInstance();
      const reservation = await db.getPrisma().reservation.findUnique({
        where: { id },
        include: {
          reservationOrder: {
            include: {
              items: {
                include: {
                  addons: true,
                  optionalIngredients: true,
                },
              },
              payment: true,
            },
          },
        },
      });

      if (!reservation) {
        res.status(404).json({
          success: false,
          error: "Reservation not found",
        });
        return;
      }

      // Check if user owns this reservation
      const isAdminAccess = req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN";
      if (reservation.userId !== req.user?.id && !isAdminAccess) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to modify this reservation",
        });
        return;
      }

      // Enforce original payment provider when modification requires a payment ID
      if (reservation.reservationOrder?.payment && paymentId) {
        const originalProvider = reservation.reservationOrder.payment.paymentProvider;
        const requestedProvider = isPayPal
          ? PaymentProvider.PAYPAL
          : PaymentProvider.STRIPE;

        if (originalProvider !== requestedProvider) {
          res.status(400).json({
            success: false,
            error:
              originalProvider === PaymentProvider.PAYPAL
                ? "Payment method mismatch. This reservation was originally paid with PayPal. Please use PayPal for modifications."
                : "Payment method mismatch. This reservation was originally paid with Stripe. Please use card payment for modifications.",
          });
          return;
        }
      }

      // Enforce branch lock: always use original reservation branch for pricing/tax/deposit
      const branchIdForPricing = reservation.branchId || undefined;
      console.debug("[ReservationController] modifyReservation branch lock", {
        reservationId: id,
        branchId: branchIdForPricing ?? "global",
        incomingBranchId: branchId ?? null,
      });

      // Check modification window
      const settings = await this.reservationService.getSettings(branchIdForPricing);
      const modificationWindowHours = settings.modificationWindowHours || 24;
      const now = new Date();
      const hoursUntilReservation =
        (reservation.reservationDate.getTime() - now.getTime()) /
        (1000 * 60 * 60);

      if (hoursUntilReservation < modificationWindowHours) {
        res.status(400).json({
          success: false,
          error: `Reservations can only be modified at least ${modificationWindowHours} hours before the reservation time`,
        });
        return;
      }

      // Check if reservation can be modified (not completed, cancelled, or no-show)
      if (
        reservation.status === "COMPLETED" ||
        reservation.status === "CANCELLED" ||
        reservation.status === "NO_SHOW"
      ) {
        res.status(400).json({
          success: false,
          error: "Cannot modify a reservation that is completed, cancelled, or marked as no-show",
        });
        return;
      }

      // Prevent branch changes during modification
      if (branchId && branchId !== reservation.branchId) {
        res.status(400).json({
          success: false,
          error: "Branch cannot be changed when modifying a reservation. The reservation must remain with the original branch.",
        });
        return;
      }
      // Reject attempts to supply a different branchId for pricing/tax
      if (branchId && branchId !== branchIdForPricing) {
        res.status(400).json({
          success: false,
          error: "Invalid branch context for modification",
        });
        return;
      }

      // Modify the reservation
      const modifiedReservation = await this.reservationService.modifyReservation(
        id,
        {
          reservationDate: reservationDate && time
            ? (() => {
                const [hours, minutes] = time.split(":").map(Number);
                const dateTime = new Date(reservationDate);
                dateTime.setHours(hours, minutes, 0, 0);
                return dateTime;
              })()
            : undefined,
          numberOfGuests,
          orderItems: reservation.type === "PRE_ORDER" ? orderItems : undefined,
          paymentIntentId: reservation.type === "PRE_ORDER" && paymentId ? paymentId : undefined, // Use paymentId for both Stripe and PayPal
          userId: req.user?.id,
          zoneId,
          tableIds,
        }
      );

      res.json({
        success: true,
        data: modifiedReservation,
      });
    } catch (error: any) {
      console.error("Error modifying reservation:", error);
      // Use 400 for validation errors (like excluded items), 500 for server errors
      const statusCode = error.message?.includes("not available") || 
                        error.message?.includes("Cannot proceed with payment") ||
                        error.message?.includes("Branch cannot be changed")
                        ? 400 
                        : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || "Failed to modify reservation",
      });
    }
  };

  // Assign table(s) to reservation (admin only, medium tier)
  // Supports both single table (tableId) and multiple tables (tableIds array)
  // Also supports capacity override with optional note
  public assignTable = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { tableId, tableIds, overrideCapacity, overrideNote } = req.body;

      // Support both single tableId (legacy) and array of tableIds
      const tableIdsToAssign = tableIds || (tableId ? [tableId] : []);

      if (!tableIdsToAssign || tableIdsToAssign.length === 0) {
        res.status(400).json({
          success: false,
          error: "At least one table ID is required",
        });
        return;
      }

      const reservation = await this.reservationService.assignTable(
        id, 
        tableIdsToAssign,
        overrideCapacity,
        overrideNote
      );

      res.json({
        success: true,
        data: reservation,
      });
    } catch (error: any) {
      console.error("Error assigning table:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to assign table",
      });
    }
  };

  // Cancel reservation
  public cancelReservation = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const reservation = await this.reservationService.getReservationById(id);

      if (!reservation) {
        res.status(404).json({
          success: false,
          error: "Reservation not found",
        });
        return;
      }

      // Check if user has access (owner or admin)
      const isAdminUser = req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN";
      if (
        !isAdminUser &&
        reservation.userId !== req.user?.id
      ) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      // Note: Cancellation is always allowed, but refund policy is handled in the service
      // The service will determine refund amount based on hours until reservation:
      // - Full refund if >= fullRefundHoursBefore
      // - Partial refund if >= partialRefundHoursBefore
      // - Reduced partial refund if >= noRefundHoursBefore
      // - No refund if < noRefundHoursBefore

      const cancelledReservation = await this.reservationService.cancelReservation(
        id,
        reason,
        req.user?.id
      );

      res.json({
        success: true,
        data: cancelledReservation,
      });
    } catch (error) {
      console.error("Error cancelling reservation:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel reservation",
      });
    }
  };

  // Get linked order for reservation
  public getReservationOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const reservation = await this.reservationService.getReservationById(id);

      if (!reservation) {
        res.status(404).json({
          success: false,
          error: "Reservation not found",
        });
        return;
      }

      // Check if user has access
      const isAdminUser = req.user?.userType === "SUPER_ADMIN" || req.user?.userType === "BRANCH_ADMIN";
      if (
        !isAdminUser &&
        reservation.userId !== req.user?.id
      ) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      if (!reservation.orderId) {
        res.status(404).json({
          success: false,
          error: "No order linked to this reservation",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();
      const order = await db.getPrisma().order.findUnique({
        where: { id: reservation.orderId },
        include: {
          orderItems: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
              orderItemAddOns: true,
              orderItemOptionalIngredients: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      console.error("Error fetching reservation order:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order",
      });
    }
  };

  // Complete payment for reservation (admin only)
  public completeReservationPayment = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const reservation = await this.reservationService.completeReservationPayment(
        id,
        req.user?.id
      );

      res.json({
        success: true,
        data: reservation,
      });
    } catch (error: any) {
      console.error("Error completing reservation payment:", error);
      const message = error?.message || "Failed to complete payment";
      const isBadRequest =
        message.includes("Cannot update") ||
        message.includes("Cannot modify") ||
        message.includes("already completed") ||
        message.includes("not found");
      res.status(isBadRequest ? 400 : 500).json({
        success: false,
        error: message,
      });
    }
  };

  // Get reservation analytics
  public getReservationAnalytics = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { period = "last_30_days", branchId } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const rbacUser = (req as any).rbacUser as
        | {
            userType?: string;
            orgRole?: string | null;
            assignedBranchIds?: string[];
          }
        | undefined;
      const organizationId = (req as any).organizationId as string | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      const allowedBranchIds =
        !isOrgAdmin && rbacUser?.userType !== "SUPER_ADMIN" && Array.isArray(rbacUser?.assignedBranchIds)
          ? rbacUser.assignedBranchIds
          : null;

      if (!organizationId && rbacUser?.userType !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "today":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "this_week":
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          startDate = startOfWeek;
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_7_days":
          startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_30_days":
          startDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_3_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_6_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_year":
          startDate = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
      }

      // Build where clause
      const whereClause: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      // Add branch filter if provided
      if (branchId) {
        const branchIdStr = branchId as string;
        if (allowedBranchIds && !allowedBranchIds.includes(branchIdStr)) {
          res.status(403).json({ success: false, error: "Access denied for this branch" });
          return;
        }

        if (organizationId) {
          const branch = await prisma.branch.findFirst({
            where: { id: branchIdStr, organizationId },
            select: { id: true },
          });
          if (!branch) {
            res.status(403).json({ success: false, error: "Access denied for this branch" });
            return;
          }
        }

        whereClause.branchId = branchIdStr;
      } else {
        if (organizationId) {
          whereClause.branch = { organizationId };
        }

        if (allowedBranchIds) {
          if (allowedBranchIds.length === 0) {
            res.status(403).json({ success: false, error: "No branch access assigned" });
            return;
          }
          whereClause.branchId =
            allowedBranchIds.length === 1 ? allowedBranchIds[0] : { in: allowedBranchIds };
        }
      }

      // Get all reservations created in the date range (for analytics, we want reservations created in the period, not scheduled)
      const reservations = await prisma.reservation.findMany({
        where: whereClause,
        include: {
          reservationOrder: {
            include: {
              items: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      // Calculate summary statistics
      const totalReservations = reservations.length;
      const totalGuests = reservations.reduce(
        (sum, r) => sum + r.numberOfGuests,
        0
      );
      const avgGuestsPerReservation =
        totalReservations > 0 ? totalGuests / totalReservations : 0;

      // Status breakdown
      const statusBreakdown: { [key: string]: number } = {};
      reservations.forEach((r) => {
        statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1;
      });

      // Type breakdown
      const typeBreakdown: { [key: string]: number } = {};
      reservations.forEach((r) => {
        typeBreakdown[r.type] = (typeBreakdown[r.type] || 0) + 1;
      });

      // Revenue from pre-orders - use paidAmount instead of totalAmount for revenue
      // Exclude CANCELLED and NO_SHOW reservations from revenue calculation
      const revenueEligibleStatuses = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED"];
      const preOrderReservations = reservations.filter(
        (r) => r.type === "PRE_ORDER" && r.reservationOrder && revenueEligibleStatuses.includes(r.status)
      );
      const totalRevenue = preOrderReservations.reduce(
        (sum, r) => sum + Number(r.reservationOrder?.paidAmount || 0),
        0
      );

      const totalTaxAmount = preOrderReservations.reduce(
        (sum, r) => sum + Number(r.reservationOrder?.taxAmount || 0),
        0
      );

      const totalRemainingAmount = preOrderReservations.reduce((sum, r) => {
        const totalAmount = Number(r.reservationOrder?.totalAmount || 0);
        const paidAmount = Number(r.reservationOrder?.paidAmount || 0);
        return sum + Math.max(totalAmount - paidAmount, 0);
      }, 0);

      // Payment breakdown from Payment table for reservation orders
      const paymentBreakdownRaw = await prisma.payment.groupBy({
        by: ["paymentProvider", "paymentMethod", "status"],
        where: {
          reservationOrderId: { not: null },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(branchId
            ? {
                reservationOrder: {
                  is: {
                    reservation: {
                      is: {
                        branchId: branchId as string,
                      },
                    },
                  },
                },
              }
            : {}),
        },
        _sum: { amount: true },
        _count: { id: true },
      });

      const paymentMethodBreakdown = paymentBreakdownRaw.map((p) => {
        const count =
          typeof p._count === "object" && p._count !== null
            ? p._count.id ?? 0
            : 0;
        const revenue =
          typeof p._sum === "object" && p._sum !== null
            ? Number(p._sum.amount || 0)
            : 0;
        return {
          provider: p.paymentProvider,
          method: p.paymentMethod,
          status: p.status,
          count,
          revenue,
        };
      });

      // Cancellation and no-show rates
      const cancelledCount = statusBreakdown["CANCELLED"] || 0;
      const noShowCount = statusBreakdown["NO_SHOW"] || 0;
      const completedCount = statusBreakdown["COMPLETED"] || 0;
      const confirmedCount = statusBreakdown["CONFIRMED"] || 0;
      const pendingCount = statusBreakdown["PENDING"] || 0;
      const seatedCount = statusBreakdown["SEATED"] || 0;

      const cancellationRate =
        totalReservations > 0
          ? (cancelledCount / totalReservations) * 100
          : 0;
      const noShowRate =
        totalReservations > 0 ? (noShowCount / totalReservations) * 100 : 0;
      const completionRate =
        totalReservations > 0
          ? (completedCount / totalReservations) * 100
          : 0;

      // Reservations over time (grouped by creation date for analytics)
      const reservationsOverTime: {
        [key: string]: {
          count: number;
          guests: number;
          revenue: number;
          date: Date;
        };
      } = {};

      reservations.forEach((r) => {
        const dateKey = r.createdAt.toISOString().split("T")[0];
        if (!reservationsOverTime[dateKey]) {
          reservationsOverTime[dateKey] = {
            count: 0,
            guests: 0,
            revenue: 0,
            date: new Date(r.createdAt),
          };
        }
        reservationsOverTime[dateKey].count += 1;
        reservationsOverTime[dateKey].guests += r.numberOfGuests;
        // Only count revenue for reservations that are not cancelled or no-show
        if (r.reservationOrder && revenueEligibleStatuses.includes(r.status)) {
          // Use paidAmount for revenue analytics
          reservationsOverTime[dateKey].revenue += Number(
            r.reservationOrder.paidAmount || 0
          );
        }
      });

      // Sort and format reservations over time
      const reservationsOverTimeArray = Object.values(reservationsOverTime)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((item) => ({
          label: item.date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          count: item.count,
          guests: item.guests,
          revenue: item.revenue,
        }));

      // Peak hours analysis (by reservation scheduled time)
      const hourBreakdown: { [key: number]: number } = {};
      reservations.forEach((r) => {
        // Use reservation scheduled time (reservationDate contains both date and time)
        const reservationDateTime = new Date(r.reservationDate);
        const hour = reservationDateTime.getHours();
        hourBreakdown[hour] = (hourBreakdown[hour] || 0) + 1;
      });

      const peakHours = Object.entries(hourBreakdown)
        .map(([hour, count]) => ({
          hour: parseInt(hour),
          count,
          label: `${hour}:00`,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Day of week breakdown (by creation day for analytics)
      const dayOfWeekBreakdown: { [key: number]: number } = {};
      reservations.forEach((r) => {
        const dayOfWeek = new Date(r.createdAt).getDay();
        dayOfWeekBreakdown[dayOfWeek] = (dayOfWeekBreakdown[dayOfWeek] || 0) + 1;
      });

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayOfWeekData = Array.from({ length: 7 }, (_, i) => ({
        day: i,
        label: dayNames[i],
        count: dayOfWeekBreakdown[i] || 0,
      }));

      // Guest size distribution (grouped by guest size, branch, and reservation type)
      const guestSizeBreakdown: { [key: string]: { size: number; count: number; branchName: string; type: string } } = {};
      reservations.forEach((r) => {
        const branchName = r.branch?.name || "No Branch";
        const reservationType = r.type === "PRE_ORDER" ? "Pre-order" : "Simple";
        const key = `${r.numberOfGuests}_${r.branchId || "no-branch"}_${r.type}`;
        if (!guestSizeBreakdown[key]) {
          guestSizeBreakdown[key] = {
            size: r.numberOfGuests,
            count: 0,
            branchName,
            type: reservationType,
          };
        }
        guestSizeBreakdown[key].count += 1;
      });

      const guestSizeData = Object.values(guestSizeBreakdown)
        .map((item) => {
          // Calculate total guests: size × count
          const totalGuests = item.size * item.count;
          return {
            size: item.size,
            count: item.count,
            totalGuests: totalGuests,
            label: `${item.size} ${item.size === 1 ? "guest" : "guests"} (${item.branchName}) - ${item.type}`,
            type: item.type,
          };
        })
        .sort((a, b) => {
          // Sort by size first, then by type (Simple before Pre-order), then by branch name
          if (a.size !== b.size) {
            return a.size - b.size;
          }
          if (a.type !== b.type) {
            return a.type.localeCompare(b.type);
          }
          return a.label.localeCompare(b.label);
        });

      // Get reservation refunds for partial refund audit
      const reservationRefunds = await prisma.refund.findMany({
        where: {
          reservationOrderId: { not: null },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(branchId
            ? {
                reservationOrder: {
                  reservation: {
                    branchId: branchId as string,
                  },
                },
              }
            : {}),
        },
        include: {
          reservationOrder: {
            select: {
              id: true,
              totalAmount: true,
              paidAmount: true,
              reservation: {
                select: {
                  id: true,
                  customerName: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      // Calculate partial refund audit data for reservations
      const reservationRefundMap = new Map<string, {
        reservationOrderId: string;
        customerName: string;
        reservationStatus: string;
        originalAmount: number;
        totalRefunded: number;
        remainingRevenue: number;
        refundCount: number;
        isFullyRefunded: boolean;
      }>();

      reservationRefunds.forEach((refund) => {
        if (!refund.reservationOrder) return;
        const orderId = refund.reservationOrder.id;
        const originalAmount = Number(refund.reservationOrder.paidAmount || refund.reservationOrder.totalAmount || 0);
        const refundAmount = Number(refund.amount);

        if (!reservationRefundMap.has(orderId)) {
          reservationRefundMap.set(orderId, {
            reservationOrderId: orderId,
            customerName: refund.reservationOrder.reservation?.customerName || "Unknown",
            reservationStatus: refund.reservationOrder.reservation?.status || "UNKNOWN",
            originalAmount,
            totalRefunded: 0,
            remainingRevenue: originalAmount,
            refundCount: 0,
            isFullyRefunded: false,
          });
        }

        const orderData = reservationRefundMap.get(orderId)!;
        orderData.totalRefunded += refundAmount;
        orderData.remainingRevenue = orderData.originalAmount - orderData.totalRefunded;
        orderData.refundCount += 1;
        orderData.isFullyRefunded = orderData.remainingRevenue < 0.01;
      });

      const reservationRefundAudit = Array.from(reservationRefundMap.values());
      const totalRefundedAmount = reservationRefundAudit.reduce((sum, r) => sum + r.totalRefunded, 0);
      const totalRemainingFromRefunded = reservationRefundAudit.reduce((sum, r) => sum + Math.max(0, r.remainingRevenue), 0);

      res.json({
        success: true,
        data: {
          summary: {
            totalReservations,
            totalGuests,
            avgGuestsPerReservation: Math.round(avgGuestsPerReservation * 10) / 10,
            totalRevenue,
            totalTaxAmount,
            totalRemainingAmount,
            cancellationRate: Math.round(cancellationRate * 10) / 10,
            noShowRate: Math.round(noShowRate * 10) / 10,
            completionRate: Math.round(completionRate * 10) / 10,
            // Refund audit summary
            totalRefundedAmount,
            totalRemainingFromRefunded,
            refundedReservationsCount: reservationRefundAudit.length,
          },
          paymentMethodBreakdown,
          statusBreakdown: Object.entries(statusBreakdown).map(([status, count]) => ({
            status,
            count,
            percentage: totalReservations > 0
              ? Math.round((count / totalReservations) * 100 * 10) / 10
              : 0,
          })),
          typeBreakdown: Object.entries(typeBreakdown).map(([type, count]) => ({
            type,
            count,
            percentage: totalReservations > 0
              ? Math.round((count / totalReservations) * 100 * 10) / 10
              : 0,
          })),
          reservationsOverTime: reservationsOverTimeArray,
          peakHours,
          dayOfWeekBreakdown: dayOfWeekData,
          guestSizeDistribution: guestSizeData,
          statusCounts: {
            pending: pendingCount,
            confirmed: confirmedCount,
            seated: seatedCount,
            completed: completedCount,
            cancelled: cancelledCount,
            noShow: noShowCount,
          },
          // Partial refund audit data for reservations
          refundAudit: reservationRefundAudit.slice(0, 50).map(r => ({
            reservationOrderId: r.reservationOrderId,
            customerName: r.customerName,
            reservationStatus: r.reservationStatus,
            originalAmount: r.originalAmount,
            totalRefunded: r.totalRefunded,
            remainingRevenue: Math.max(0, r.remainingRevenue),
            refundCount: r.refundCount,
            isFullyRefunded: r.isFullyRefunded,
            refundPercentage: r.originalAmount > 0
              ? Math.round((r.totalRefunded / r.originalAmount) * 100)
              : 0,
          })),
        },
      });
    } catch (error) {
      console.error("Error fetching reservation analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reservation analytics",
      });
    }
  };

  // Get branch reservations chart
  public getBranchReservationsChart = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { period = "last_30_days" } = req.query;
      const db = DatabaseSingleton.getInstance();
      const prisma = db.getPrisma();
      const rbacUser = (req as any).rbacUser as
        | {
            userType?: string;
            orgRole?: string | null;
            assignedBranchIds?: string[];
          }
        | undefined;
      const organizationId = (req as any).organizationId as string | undefined;
      const isOrgAdmin = rbacUser?.orgRole === "ORG_OWNER" || rbacUser?.orgRole === "ORG_ADMIN";
      const allowedBranchIds =
        !isOrgAdmin && rbacUser?.userType !== "SUPER_ADMIN" && Array.isArray(rbacUser?.assignedBranchIds)
          ? rbacUser.assignedBranchIds
          : null;

      if (!organizationId && rbacUser?.userType !== "SUPER_ADMIN") {
        res.status(403).json({ success: false, error: "Access denied" });
        return;
      }

      // Calculate date range based on period (same logic as getReservationAnalytics)
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "today":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "this_week":
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          startDate = startOfWeek;
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "this_month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_7_days":
          startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_30_days":
          startDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_3_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_6_months":
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        case "last_year":
          startDate = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0
          );
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
          );
      }

      // Get reservations with branch information
      const reservations = await prisma.reservation.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
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
        [key: string]: { name: string; count: number };
      } = {};

      reservations.forEach((reservation) => {
        if (reservation.branch) {
          const branchId = reservation.branch.id;
          if (!branchStats[branchId]) {
            branchStats[branchId] = {
              name: reservation.branch.name,
              count: 0,
            };
          }
          branchStats[branchId].count += 1;
        }
      });

      const labels = Object.values(branchStats).map((b) => b.name);
      const data = Object.values(branchStats).map((b) => b.count);

      if (labels.length === 0) {
        res.json({
          success: true,
          data: {
            labels: ["No Data"],
            datasets: [
              {
                label: "Reservations",
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
              label: "Reservations",
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
      console.error("Error fetching branch reservations chart:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch branch reservations chart",
      });
    }
  };

  // Get reservation history
  public getReservationHistory = async (
    req: RBACRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const db = DatabaseSingleton.getInstance();

      if (!req.rbacUser) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const isSuperAdmin = hasImplicitFullAccess(req.rbacUser.userType);
      if (!isSuperAdmin) {
        const canAccess = await this.rbac.canAccessResource(req.rbacUser, "reservation", id);
        if (!canAccess) {
          res.status(403).json({
            success: false,
            error: "Access denied",
          });
          return;
        }
      }

      // Get the reservation with all related data
      const reservation = await db.getPrisma().reservation.findUnique({
        where: { id },
        include: {
          reservationOrder: {
            select: {
              id: true,
              history: true,
            },
          },
          tables: {
            include: {
              table: {
                select: {
                  id: true,
                  tableNumber: true,
                  capacity: true,
                  zone: true,
                },
              },
            },
          },
          table: {
            select: {
              id: true,
              tableNumber: true,
              capacity: true,
              zone: true,
            },
          },
        },
      });

      if (!reservation) {
        res.status(404).json({
          success: false,
          error: "Reservation not found",
        });
        return;
      }

      // Build history from reservation events
      const history: Array<{
        type: string;
        action: string;
        timestamp: string;
        details?: any;
      }> = [];

      // 1. Reservation created
      if (reservation.createdAt) {
        history.push({
          type: "RESERVATION_CREATED",
          action: "Reservation created",
          timestamp: reservation.createdAt.toISOString(),
          details: {
            reservationNumber: reservation.reservationNumber,
            type: reservation.type,
            numberOfGuests: reservation.numberOfGuests,
            reservationDate: reservation.reservationDate.toISOString(),
          },
        });
      }

      // 2. Reservation confirmed
      if (reservation.confirmedAt) {
        history.push({
          type: "RESERVATION_CONFIRMED",
          action: "Reservation confirmed",
          timestamp: reservation.confirmedAt.toISOString(),
        });
      }

      // 3. Table assigned (legacy single table)
      if (reservation.table && reservation.confirmedAt) {
        history.push({
          type: "TABLE_ASSIGNED",
          action: `Table ${reservation.table.tableNumber} assigned`,
          timestamp: reservation.confirmedAt.toISOString(),
          details: {
            tableNumber: reservation.table.tableNumber,
            capacity: reservation.table.capacity,
            zone: reservation.table.zone,
          },
        });
      }

      // 4. Tables assigned (multiple tables)
      if (reservation.tables && reservation.tables.length > 0) {
        const tableAssignments = reservation.tables.map((rt) => ({
          tableNumber: rt.table.tableNumber,
          capacity: rt.table.capacity,
          zone: rt.table.zone,
        }));

        // Use the earliest table assignment time or confirmedAt
        const assignmentTime = reservation.confirmedAt || reservation.createdAt;
        history.push({
          type: "TABLES_ASSIGNED",
          action: `Tables ${tableAssignments.map((t) => t.tableNumber).join(", ")} assigned`,
          timestamp: assignmentTime.toISOString(),
          details: {
            tables: tableAssignments,
          },
        });
      }

      // 5. Customer seated
      if (reservation.seatedAt) {
        history.push({
          type: "CUSTOMER_SEATED",
          action: "Customer seated",
          timestamp: reservation.seatedAt.toISOString(),
        });
      }

      // 6. Reservation completed
      if (reservation.completedAt) {
        history.push({
          type: "RESERVATION_COMPLETED",
          action: "Reservation completed",
          timestamp: reservation.completedAt.toISOString(),
        });
      }

      // 7. Reservation cancelled
      if (reservation.cancelledAt) {
        history.push({
          type: "RESERVATION_CANCELLED",
          action: "Reservation cancelled",
          timestamp: reservation.cancelledAt.toISOString(),
          details: {
            reason: reservation.cancellationReason,
            cancelledBy: reservation.cancelledBy,
          },
        });
      }

      // 8. No-show marked
      if (reservation.noShow) {
        history.push({
          type: "NO_SHOW",
          action: "Marked as no-show",
          timestamp: reservation.updatedAt.toISOString(),
        });
      }

      // 9. Add reservation order history if exists
      if (reservation.reservationOrder?.history) {
        const orderHistory = reservation.reservationOrder.history as any[];
        if (Array.isArray(orderHistory)) {
          orderHistory.forEach((entry) => {
            history.push({
              type: entry.type || "ORDER_EVENT",
              action: entry.action || "Order event",
              timestamp: entry.timestamp || new Date().toISOString(),
              details: entry.details,
            });
          });
        }
      }

      // Sort history by timestamp (oldest first)
      history.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error("Error fetching reservation history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reservation history",
      });
    }
  };
}

