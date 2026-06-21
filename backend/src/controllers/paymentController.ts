/// <reference path="../types/paypal.d.ts" />
import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../config/stripe";
import DatabaseSingleton from "../config/database";
import { AuthenticatedRequest } from "../types";
import TaxCalculator from "../utils/taxCalculator";
import WebSocketService from "../services/websocketService";
import {
  getNearestSmallerAddonSize,
  getAddonPriceForMealSize,
} from "../utils/sizeMatcher";
// @ts-ignore - PayPal SDK doesn't have TypeScript definitions
import paypal from "@paypal/checkout-server-sdk";
import { PAYPAL_CONFIG, getPayPalBaseUrl } from "../config/paypal";
import PaymentService from "../services/paymentService";
import FiskalyService from "../services/fiskalyService";
import {
  getFiskalyConfigSnapshot,
  shouldFiscalize,
} from "../utils/fiscalization";
import { getMealBasePrice } from "../utils/mealPriceHelper";
import { getAddonBasePrice } from "../utils/addonPriceHelper";
import { calculateOrderTotals } from "../utils/orderCalculator";
import { validateCartItemsForBranch } from "../utils/cartBranchValidation";
import {
  PaymentMethod,
  PaymentProvider,
  PaymentState,
  PaymentStatus,
  Prisma,
  SizeType,
} from "@prisma/client";
import { deliverableQuantityService } from "../services/deliverableQuantityService";
import BusinessDayService from "../services/businessDayService";
import tabletOrderNotificationService from "../services/tabletOrderNotificationService";

// Type definitions for PayPal responses
interface PayPalOrderResult {
  id: string;
  status: string;
  intent?: string;
}

interface PayPalCaptureResult {
  id: string;
  status: string;
  payer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  amount?: {
    currency_code: string;
    value: string;
  };
}

export class PaymentController {
  private db = DatabaseSingleton.getInstance();
  private businessDayService = BusinessDayService.getInstance();

  // Create payment intent
  public createPaymentIntent = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        amount,
        currency = "usd",
        metadata = {},
        paymentMethodType,
        branchId,
      } = req.body;

      if (!amount || amount <= 0) {
        console.error("ERROR: Invalid amount:", amount);
        res.status(400).json({
          success: false,
          error: "Amount is required and must be greater than 0",
        });
        return;
      }

      // Convert amount to cents (Stripe expects amounts in cents)
      const amountInCents = Math.round(amount * 100);

      const branchIdFromMetadata = (metadata as any)?.branchId as string | undefined;
      const requestedBranchId =
        typeof branchId === "string" && branchId.trim().length > 0
          ? branchId.trim()
          : typeof branchIdFromMetadata === "string" && branchIdFromMetadata.trim().length > 0
          ? branchIdFromMetadata.trim()
          : undefined;

      if (requestedBranchId) {
        const db = DatabaseSingleton.getInstance();
        const branch: any = await db.getPrisma().branch.findUnique({
          where: { id: requestedBranchId },
          select: { id: true, isActive: true, organizationId: true } as any,
        });

        if (!branch || !branch.isActive) {
          res.status(400).json({
            success: false,
            error: "Invalid or inactive branch",
          });
          return;
        }

        if (branch.organizationId) {
          const org: any = await db.getPrisma().organization.findUnique({
            where: { id: branch.organizationId },
            select: {
              id: true,
              isActive: true,
              freeVersion: true,
              onlinePaymentsAllowed: true,
              cardPaymentsAllowed: true,
            } as any,
          });

          if (!org || !org.isActive) {
            res.status(400).json({
              success: false,
              error: "Organization is deactivated",
            });
            return;
          }

          if (org.freeVersion === true) {
            res.status(400).json({
              success: false,
              error: "Payments are not allowed in free version",
            });
            return;
          }

          if (org.onlinePaymentsAllowed === false) {
            res.status(400).json({
              success: false,
              error: "Online payments are not allowed for this organization",
            });
            return;
          }

          if (org.cardPaymentsAllowed === false) {
            res.status(400).json({
              success: false,
              error: "Card payments are not allowed for this organization",
            });
            return;
          }
        }
      }

      // For mobile app CardField, use payment_method_types: ["card"]
      // For web payment sheet, use automatic_payment_methods
      const paymentIntentConfig: any = {
        amount: amountInCents,
        currency,
        metadata: {
          userId: req.user?.id || "anonymous",
          ...metadata,
        },
      };

      // If paymentMethodType is "card" (from mobile app), use payment_method_types
      // Otherwise, use automatic_payment_methods for web payment sheets
      if (paymentMethodType === "card") {
        paymentIntentConfig.payment_method_types = ["card"];

      } else {
        paymentIntentConfig.automatic_payment_methods = {
          enabled: true,
        };
      }


      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentConfig
      );


      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        },
      });
    } catch (error: any) {
      console.error("ERROR: Failed to create payment intent:", {
        message: error.message,
        stack: error.stack,
        type: error.type,
        code: error.code,
      });
      res.status(500).json({
        success: false,
        error: "Failed to create payment intent",
      });
    }
  };

  // Update payment intent with payment method and confirm (for mobile CardField)
  public updatePaymentIntent = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { paymentIntentId, paymentMethodId } = req.body;


      if (!paymentIntentId || !paymentMethodId) {
        console.error("ERROR: Missing required fields");
        res.status(400).json({
          success: false,
          error: "Payment intent ID and payment method ID are required",
        });
        return;
      }

      const existingPaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      const updatedPaymentIntent = await stripe.paymentIntents.update(
        paymentIntentId,
        {
          payment_method: paymentMethodId,
        }
      );

      const confirmedPaymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId
      );

      if (confirmedPaymentIntent.status !== "succeeded") {
        console.warn("WARNING: Payment intent status is not 'succeeded':", {
          status: confirmedPaymentIntent.status,
          lastPaymentError: confirmedPaymentIntent.last_payment_error,
        });
      }

      res.json({
        success: true,
        data: {
          paymentIntentId: confirmedPaymentIntent.id,
          status: confirmedPaymentIntent.status,
          clientSecret: confirmedPaymentIntent.client_secret,
        },
      });
    } catch (error: any) {
      console.error("ERROR: Failed to update/confirm payment intent:", {
        message: error.message,
        type: error.type,
        code: error.code,
        decline_code: error.decline_code,
        payment_intent: error.payment_intent,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to update and confirm payment intent",
      });
    }
  };

  // Confirm payment and create order
  public confirmPayment = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { paymentIntentId, orderData, cartItems, mergeWithOrderId } =
        req.body;

      if (!paymentIntentId) {
        res.status(400).json({
          success: false,
          error: "Payment intent ID is required",
        });
        return;
      }

      if (!cartItems || cartItems.length === 0) {
        res.status(400).json({
          success: false,
          error: "Cart items are required",
        });
        return;
      }

      if (!orderData?.branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      // Retrieve payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      if (paymentIntent.status !== "succeeded") {
        res.status(400).json({
          success: false,
          error: "Payment not completed",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Determine order type and validate required fields
      const orderType =
        orderData?.orderType && orderData.orderType === "PICKUP"
          ? "PICKUP"
          : "DELIVERY";

      const replacesOrderId = (orderData as any)?.replacesOrderId as string | undefined;

      if (orderType === "PICKUP") {
        if (!orderData?.pickupPhone) {
          res.status(400).json({
            success: false,
            error: "Pickup phone is required",
          });
          return;
        }
      } else {
        if (!orderData?.deliveryAddress || !orderData?.deliveryPhone) {
          res.status(400).json({
            success: false,
            error: "Delivery address and phone are required",
          });
          return;
        }
      }

      // Validate branch
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: orderData.branchId },
      });
      if (!branch || !branch.isActive) {
        res.status(400).json({
          success: false,
          error: "Invalid or inactive branch",
        });
        return;
      }

      if ((branch as any).organizationId) {
        const org: any = await db.getPrisma().organization.findUnique({
          where: { id: (branch as any).organizationId },
          select: {
            id: true,
            isActive: true,
            freeVersion: true,
            onlinePaymentsAllowed: true,
            cardPaymentsAllowed: true,
          } as any,
        });

        if (!org || !org.isActive) {
          res.status(400).json({
            success: false,
            error: "Organization is deactivated",
          });
          return;
        }

        if (org.freeVersion === true) {
          res.status(400).json({
            success: false,
            error: "Payments are not allowed in free version",
          });
          return;
        }

        if (org.onlinePaymentsAllowed === false) {
          res.status(400).json({
            success: false,
            error: "Online payments are not allowed for this organization",
          });
          return;
        }

        if (org.cardPaymentsAllowed === false) {
          res.status(400).json({
            success: false,
            error: "Card payments are not allowed for this organization",
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

      const unavailableItems = await validateCartItemsForBranch({
        prisma: db.getPrisma(),
        branchId: orderData.branchId,
        cartItems,
      });
      if (unavailableItems.length > 0) {
        console.error(
          `Payment confirmation rejected: items not available for branch ${orderData.branchId}`,
          { unavailableItems }
        );
        res.status(400).json({
          success: false,
          error: "One or more selected items are not available in this branch",
          data: { unavailableItems },
        });
        return;
      }

      // Parse and validate scheduled date
      let scheduledDate: Date | null = null;
      let isScheduledOrder = false;

      if (orderData?.scheduledDate) {
        scheduledDate = new Date(orderData.scheduledDate);
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
        const futureOrderSettings = getEffectiveFutureOrderSettings(branch, globalSettings);
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

      const globalSettingsForOrderStatus = await db.getPrisma().settings.findFirst({
        select: { scheduledOrderAutoConfirm: true },
      });
      const effectiveScheduledOrderAutoConfirm =
        (branch as any)?.scheduledOrderAutoConfirm !== null &&
        (branch as any)?.scheduledOrderAutoConfirm !== undefined
          ? Boolean((branch as any).scheduledOrderAutoConfirm)
          : Boolean((globalSettingsForOrderStatus as any)?.scheduledOrderAutoConfirm ?? true);
      const initialOrderStatus =
        scheduledDate && isScheduledOrder && !effectiveScheduledOrderAutoConfirm
          ? ("PENDING" as const)
          : ("CONFIRMED" as const);

      let defaultPreparationTime: number | null = null;
      if (initialOrderStatus === "CONFIRMED") {
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
            (globalSettingsForCapacity as any).scheduledOrderTimeSlotInterval ??
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
                branchId: orderData.branchId,
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

      // Validate deliverable weight for today's date
      const uniqueMealIds = Array.from(
        new Set<string>(
          cartItems
            .map((item: any) => (item.mealId || item.id) as string | undefined)
            .filter((id: string | undefined): id is string => Boolean(id))
        )
      );
      const mealsWithSizes = (await db.getPrisma().meal.findMany({
        where: { id: { in: uniqueMealIds as string[] } },
        select: {
          id: true,
          mealSizes: { select: { name: true, sizeType: true } },
        },
      })) as {
        id: string;
        mealSizes: { name: string; sizeType: SizeType }[];
      }[];
      const sizeMap = new Map<
        string,
        { name: string; sizeType: SizeType | null }[]
      >(
        mealsWithSizes.map((m) => [
          m.id,
          m.mealSizes.map((s) => ({
            name: s.name,
            sizeType: s.sizeType as SizeType,
          })),
        ])
      );
      const today = new Date();
      const weightValidation = await deliverableQuantityService.validateOrderWeight(
        cartItems.map((item: any) => {
          const mealId = item.mealId || item.id;
          const matched = (sizeMap.get(mealId) || []).find(
            (s) => s.name === item.size
          );
          return {
            mealId,
            mealSizeType: matched?.sizeType || SizeType.M,
            quantity: item.quantity,
          };
        }),
        orderData.branchId,
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

      const effectiveDeliveryFee =
        orderType === "PICKUP" ? 0 : orderData?.deliveryFee || 0;

      // When merging, we'll use the existing order's delivery fee for order storage
      // but use 0 for payment calculation (user already paid delivery)
      let mergePreservedDeliveryFee: number | null = null;

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
        const globalSettingsForMerge = await db.getPrisma().settings.findFirst();
        if (globalSettingsForMerge) {
          const { getEffectiveScheduledOrderMergeSettings, validateScheduledOrderMerge } = await import(
            "../utils/branchConfigHelper"
          );
          const mergeSettings = getEffectiveScheduledOrderMergeSettings(branch, globalSettingsForMerge);
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
        : `ORD-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)
            .toUpperCase()}`;

      // Validate that all meal IDs exist before creating the order
      const mealIds = cartItems
        .filter((item: any) => !(item?.dealId || item?.itemType === "DEAL"))
        .map((item: any) => item.mealId || item.id);
      const existingMeals = await db.getPrisma().meal.findMany({
        where: { id: { in: mealIds } },
        select: { id: true },
      });

      const existingMealIds = existingMeals.map((meal) => meal.id);
      const invalidMealIds = mealIds.filter(
        (id: string) => !existingMealIds.includes(id)
      );

      if (invalidMealIds.length > 0) {
        console.error("Invalid meal IDs found:", invalidMealIds);
        res.status(400).json({
          success: false,
          error: "Some items in your cart are no longer available",
        });
        return;
      }

      // Get user information for guest fields
      const user = await db.getPrisma().user.findUnique({
        where: { id: req.user?.id },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });

      // If merging, combine existing order items with new cart items
      let allCartItems = [...cartItems];
      let newItemsForNotification: any[] = [];
      if (mergeWithOrderId && existingOrder) {
        // Fetch meal names for new items
        const newMealIds = cartItems.map((item: any) => item.mealId || item.id);
        const newMeals = await db.getPrisma().meal.findMany({
          where: { id: { in: newMealIds } },
          select: { id: true, name: true },
        });

        // Track which items are new with meal names
        newItemsForNotification = cartItems.map((item: any) => {
          const meal = newMeals.find((m) => m.id === (item.mealId || item.id));
          return {
            mealId: item.mealId || item.id,
            name: meal?.name || item.name || "Unknown Meal",
            quantity: item.quantity,
            size: item.size || item.sizeName || undefined,
            addOns: (item.addOns || []).map(
              (addon: any) => addon.name || addon.id
            ),
          };
        });

        // Convert existing order items to cart item format
        // Note: orderItemAddOn.quantity is stored as total quantity across the meal quantity
        // (addon qty per meal * meal qty). Our calculators expect addon quantity per meal.
        const existingItems = existingOrder.orderItems.map((oi) => ({
          mealId: oi.mealId,
          id: oi.mealId,
          quantity: oi.quantity,
          basePrice: parseFloat(oi.unitPrice.toString()),
          size: oi.selectedSize || undefined,
          sizeName: oi.selectedSize || undefined,
          sizePrice: 0,
          specialInstructions: oi.specialInstructions || undefined,
          addOns: oi.orderItemAddOns.map((addon) => {
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
        }));
        allCartItems = [...existingItems, ...cartItems];
      }

      // Calculate all order totals from scratch using branch-specific prices and taxes
      // When merging, use the preserved delivery fee from the original order
      const deliveryFeeForCalculation = mergeWithOrderId && mergePreservedDeliveryFee !== null
        ? mergePreservedDeliveryFee
        : effectiveDeliveryFee;
      
      const orderCalculation = await calculateOrderTotals(
        allCartItems,
        orderData?.branchId,
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

      // Get tax calculator and settings for order item creation
      const taxCalculator = new TaxCalculator();
      const settings = await db.getPrisma().settings.findFirst({
        select: { taxInclusive: true },
      });
      const branchTaxInclusive = orderData?.branchId
        ? await db.getPrisma().branch.findUnique({
            where: { id: orderData.branchId },
            select: { taxInclusive: true },
          })
        : null;
      const taxInclusive =
        branchTaxInclusive?.taxInclusive !== null &&
        branchTaxInclusive?.taxInclusive !== undefined
          ? Boolean(branchTaxInclusive.taxInclusive)
          : Boolean(settings?.taxInclusive || false);


      // If merging, update existing order; otherwise create new
      let order;
      if (mergeWithOrderId && existingOrder) {
        const existingPaymentForHistory = await db.getPrisma().payment.findUnique({
          where: { orderId: existingOrder.id },
        });

        const existingHistory = ((existingOrder as any).history as any[]) || [];
        const paymentHistoryToAppend: any[] = [];

        if (existingPaymentForHistory?.providerPaymentId || existingOrder.paymentIntentId) {
          // Determine provider: use payment record's provider, or infer STRIPE from paymentIntentId
          const inferredProvider = existingPaymentForHistory?.paymentProvider
            || (existingOrder.paymentIntentId ? "STRIPE" : undefined);

          paymentHistoryToAppend.push({
            type: "PAYMENT_CAPTURED",
            action: "Previous payment captured",
            userId: req.user?.id,
            details: {
              provider: inferredProvider,
              providerPaymentId:
                existingPaymentForHistory?.providerPaymentId || existingOrder.paymentIntentId || undefined,
              providerChargeId: existingPaymentForHistory?.providerChargeId || undefined,
              amount: existingPaymentForHistory?.amount
                ? Number(existingPaymentForHistory.amount)
                : (existingOrder.totalAmount ? Number(existingOrder.totalAmount) : undefined),
              currency: existingPaymentForHistory?.currency || existingOrder.currency || undefined,
              paymentId: existingOrder.paymentId || undefined,
            },
            timestamp: new Date().toISOString(),
          });
        }

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

        // Update the order (use ONLINE_PAYMENT method since new order is paid)
        order = await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: ({
            isMerged: true,
            mergedAt: new Date(),
            orderType: orderType as any,
            branchId: orderData.branchId || existingOrder.branchId,
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
              orderType === "PICKUP"
                ? null
                : ((orderData as any)?.deliveryDistanceKm !== null &&
                    (orderData as any)?.deliveryDistanceKm !== undefined
                    ? Number((orderData as any).deliveryDistanceKm)
                    : (existingOrder as any).deliveryDistanceKm ?? null),
            status: initialOrderStatus,
            confirmedAt:
              initialOrderStatus === "CONFIRMED" && !(existingOrder as any).confirmedAt
                ? new Date()
                : (existingOrder as any).confirmedAt ?? null,
            preparationTime:
              initialOrderStatus === "CONFIRMED" && !((existingOrder as any).preparationTime)
                ? defaultPreparationTime
                : ((existingOrder as any).preparationTime ?? null),
            paymentIntentId: paymentIntent.id,
            paymentStatus: "PAID",
            paymentMethod: "ONLINE_PAYMENT",
            postedAt: (existingOrder as any).postedAt || null,
            scheduledDate: scheduledDate,
            isScheduledOrder: isScheduledOrder,
            history: (existingHistory.concat(paymentHistoryToAppend) as any),
            deliveryAddress:
              orderType === "PICKUP" ? null : orderData?.deliveryAddress,
            deliveryStreetAddress:
              orderType === "PICKUP" ? null : (orderData as any)?.deliveryStreetAddress || null,
            deliveryHouseNumber:
              orderType === "PICKUP" ? null : (orderData as any)?.deliveryHouseNumber || null,
            deliveryPostalCode:
              orderType === "PICKUP" ? null : (orderData as any)?.deliveryPostalCode || null,
            deliveryBuilding:
              orderType === "PICKUP" ? null : orderData?.deliveryBuilding || null,
            deliveryFloor:
              orderType === "PICKUP" ? null : orderData?.deliveryFloor || null,
            deliveryApartment:
              orderType === "PICKUP" ? null : orderData?.deliveryApartment || null,
            deliveryExtraDetails:
              orderType === "PICKUP"
                ? null
                : orderData?.deliveryExtraDetails || null,
            deliveryPhone: orderType === "PICKUP" ? null : orderData?.deliveryPhone,
            deliveryNotes:
              orderType === "PICKUP"
                ? existingOrder.deliveryNotes || null
                : orderData?.deliveryNotes || existingOrder.deliveryNotes || null,
            pickupPhone: orderType === "PICKUP" ? orderData?.pickupPhone || null : null,
            pickupNotes:
              orderType === "PICKUP"
                ? orderData?.pickupNotes || null
                : existingOrder.pickupNotes || null,
            orderItems: {
              create: await Promise.all(
                allCartItems.map(async (item: any) => {
                  if (item?.dealId || item?.itemType === "DEAL") {
                    const prismaAny = db.getPrisma() as any;
                    const dealId = String(item.dealId);
                    const dealQty = Number(item.quantity || 1);
                    const deal = await prismaAny.deal.findUnique({
                      where: { id: dealId },
                      include: {
                        components: {
                          include: {
                            branchPrices: orderData?.branchId
                              ? {
                                  where: { branchId: orderData.branchId as string },
                                  select: { price: true, taxPercentage: true },
                                }
                              : false,
                          },
                          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
                        const addonBasePrice = await getAddonBasePrice(addOn.id, orderData?.branchId);
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
                      orderData?.branchId // branchId for branch-specific tax rates
                    );
                  
                  // Get branch-specific meal base price
                  const mealBasePrice = await getMealBasePrice(
                    item.mealId || item.id,
                    orderData?.branchId
                  );

                  // Get meal size type from size name and calculate final meal price
                  let mealSizeType: "S" | "M" | "L" | "XL" | null = null;
                  let finalMealPrice = mealBasePrice;
                  
                  if (item.size) {
                    const meal = await db.getPrisma().meal.findUnique({
                      where: { id: item.mealId || item.id },
                      include: { mealSizes: true },
                    });
                    if (meal) {
                      const mealSize = meal.mealSizes.find(
                        (s) => s.name === item.size
                      );
                      if (mealSize) {
                        mealSizeType = mealSize.sizeType as "S" | "M" | "L" | "XL";
                        // Size price is additional to base price
                        finalMealPrice = mealBasePrice + Number(mealSize.price || 0);
                      }
                    }
                  }
                  // Default to M if no size selected
                  if (!mealSizeType) {
                    mealSizeType = "M";
                  }

                  // Get branch-specific addon prices
                  const addonsTotal = await Promise.all(
                    (item.addOns || []).map(async (addOn: any) => {
                      const addonBasePrice = await getAddonBasePrice(addOn.id, orderData?.branchId);
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
          } catch (e) {
            // Don't fail payment flow on history issues
          }
        }
        
      } else {
        const appliedVoucherCode = orderData?.appliedVoucherCode;
        let voucherDeduction = 0;
        let voucher = null;
        let isSinglePurposeVoucher = false;
        if (appliedVoucherCode && typeof appliedVoucherCode === "string" && appliedVoucherCode.trim().length > 0) {
          const code = appliedVoucherCode.trim();
          voucher = await db.getPrisma().voucher.findUnique({
            where: { voucherCode: code },
          });
          if (voucher && voucher.status !== "REDEEMED" && Number(voucher.currentAmount) > 0 && voucher.status !== "VOIDED" && new Date(voucher.expiresAt) >= new Date()) {
            isSinglePurposeVoucher = voucher.voucherType === "SINGLE_PURPOSE";
            const { calculateVoucherDeduction } = await import("../utils/voucherHelper");
            voucherDeduction = calculateVoucherDeduction(voucher, orderCalculation);
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

        // Create new order
        const openSession = await this.businessDayService.getOrCreateOpenSession(
          orderData?.branchId
        );
        order = await db.getPrisma().$transaction(async (tx: any) => {
          const createdOrder = await tx.order.create({
          data: ({
            orderType: orderType as any,
            orderNumber,
            userId: req.user?.id,
            branchId: orderData?.branchId,
            businessDaySessionId: openSession?.id,
            postedAt: new Date(),
            taxInclusive,
            totalAmount: finalOrderCalculation.finalTotal,
            currency: paymentIntent.currency.toUpperCase(),
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
              orderType === "PICKUP"
                ? null
                : ((orderData as any)?.deliveryDistanceKm !== null &&
                    (orderData as any)?.deliveryDistanceKm !== undefined
                    ? Number((orderData as any).deliveryDistanceKm)
                    : null),
            status: initialOrderStatus,
            confirmedAt: initialOrderStatus === "CONFIRMED" ? new Date() : null,
            preparationTime: initialOrderStatus === "CONFIRMED" ? defaultPreparationTime : null,
            paymentIntentId: paymentIntent.id,
            paymentStatus: "PAID",
            paymentMethod: "ONLINE_PAYMENT",
            voucherPaymentAmount: voucherDeduction,
            voucherCodes: appliedVoucherCode ? [appliedVoucherCode] : [],
            deliveryAddress:
              orderType === "PICKUP" ? null : orderData?.deliveryAddress,
            deliveryStreetAddress:
              orderType === "PICKUP" ? null : (orderData as any)?.deliveryStreetAddress || null,
            deliveryHouseNumber:
              orderType === "PICKUP" ? null : (orderData as any)?.deliveryHouseNumber || null,
            deliveryPostalCode:
              orderType === "PICKUP" ? null : (orderData as any)?.deliveryPostalCode || null,
            deliveryBuilding:
              orderType === "PICKUP" ? null : orderData?.deliveryBuilding || null,
            deliveryFloor:
              orderType === "PICKUP" ? null : orderData?.deliveryFloor || null,
            deliveryApartment:
              orderType === "PICKUP" ? null : orderData?.deliveryApartment || null,
            deliveryExtraDetails:
              orderType === "PICKUP"
                ? null
                : orderData?.deliveryExtraDetails || null,
            deliveryPhone: orderType === "PICKUP" ? null : orderData?.deliveryPhone,
            deliveryNotes: orderType === "PICKUP" ? orderData?.pickupNotes || null : orderData?.deliveryNotes,
            pickupPhone: orderType === "PICKUP" ? orderData?.pickupPhone || null : null,
            pickupNotes: orderType === "PICKUP" ? orderData?.pickupNotes || null : null,
            guestName:
              orderData?.guestName ||
              (user ? `${user.firstName} ${user.lastName}` : null),
            guestEmail: orderData?.guestEmail || user?.email || null,
            guestPhone: orderData?.guestPhone || user?.phone || null,
            scheduledDate: scheduledDate,
            isScheduledOrder: isScheduledOrder,
            ...(replacesOrderId ? ({ replacesOrderId } as any) : {}),
            orderItems: {
              create: await Promise.all(
                cartItems.map(async (item: any) => {
                  if (item?.dealId || item?.itemType === "DEAL") {
                    const prismaAny = db.getPrisma() as any;
                    const dealId = String(item.dealId);
                    const dealQty = Number(item.quantity || 1);
                    const deal = await prismaAny.deal.findUnique({
                      where: { id: dealId },
                      include: {
                        components: {
                          include: {
                            branchPrices: orderData?.branchId
                              ? {
                                  where: { branchId: orderData.branchId as string },
                                  select: { price: true, taxPercentage: true },
                                }
                              : false,
                          },
                          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
                        const addonBasePrice = await getAddonBasePrice(addOn.id, orderData?.branchId);
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
                      orderData?.branchId // branchId for branch-specific tax rates
                    );
                  const basePrice = item.basePrice;

                  // Get meal size type from size name
                  let mealSizeType: "S" | "M" | "L" | "XL" | null = null;
                  if (item.size) {
                    const meal = await db.getPrisma().meal.findUnique({
                      where: { id: item.mealId || item.id },
                      include: { mealSizes: true },
                    });
                    if (meal) {
                      const mealSize = meal.mealSizes.find(
                        (s) => s.name === item.size
                      );
                      if (mealSize) {
                        mealSizeType = mealSize.sizeType as "S" | "M" | "L" | "XL";
                      }
                    }
                  }
                  // Default to M if no size selected
                  if (!mealSizeType) {
                    mealSizeType = "M";
                  }

                  const addonsTotal = (item.addOns || []).reduce(
                    (sum: number, addOn: any) => {
                      const addOnQuantity = addOn.quantity || 1;
                      return sum + addOn.price * addOnQuantity;
                    },
                    0
                  );
                  const mealPriceTotal = basePrice * item.quantity;
                  const totalPrice =
                    mealPriceTotal + addonsTotal * item.quantity;

                  let taxPerUnit = 0;
                  if (taxInclusive) {
                    taxPerUnit =
                      (basePrice * taxPercentage) / (100 + taxPercentage);
                  } else {
                    taxPerUnit = (basePrice * taxPercentage) / 100;
                  }
                  const taxAmount = taxPerUnit * item.quantity;

                  return {
                    mealId: item.mealId || item.id,
                    quantity: item.quantity,
                    unitPrice: basePrice,
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
          try {
            const { processVoucherRedemption } = await import("../utils/voucherHelper");
            const redemptionResult = await processVoucherRedemption({
              tx,
              voucherCode: appliedVoucherCode,
              orderCalculation: finalOrderCalculation,
              orderId: createdOrder.id,
            });
            // Store remaining balance snapshot
            console.log('[PaymentController] Storing voucherRemainingBalances (Stripe):', {
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
          } catch (voucherErr: any) {
            console.error("[VOUCHER] Redemption failed for Stripe order", createdOrder.id, voucherErr);
            try {
              const oldHistory = (createdOrder as any).history || [];
              const updatedHistory = [
                ...oldHistory,
                {
                  type: "VOUCHER_REDEMPTION_FAILED",
                  action: "Voucher redemption failed",
                  userId: req.user?.id || "SYSTEM",
                  details: { error: voucherErr?.message || String(voucherErr), voucherCode: appliedVoucherCode },
                  timestamp: new Date().toISOString(),
                }
              ];
              await tx.order.update({
                where: { id: createdOrder.id },
                data: { history: updatedHistory },
              });
            } catch (hErr) {
              console.error("Failed to append history block for voucher failure", hErr);
            }
          }
        }

        return createdOrder;
      });
        
      }

      // Create add-ons for each order item with tax information
      for (let i = 0; i < allCartItems.length; i++) {
        const item = allCartItems[i];
        if (item.addOns && item.addOns.length > 0) {
          // Use index-based matching since orderItems are created in the same order as allCartItems
          const orderItem = order.orderItems[i];
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
                  if (orderData?.branchId) {
                    const { getAddonBasePrice } = await import("../utils/addonPriceHelper");
                    branchBasePrice = await getAddonBasePrice(addOn.id, orderData.branchId);
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
                      orderData?.branchId // branchId for branch-specific tax rates
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
        if (item.optionalIngredients && item.optionalIngredients.length > 0) {
          // Use index-based matching since orderItems are created in the same order as allCartItems
          const orderItem = order.orderItems[i];
          if (orderItem) {
            const unique = new Map<string, any>();
            for (const ingredient of item.optionalIngredients as any[]) {
              const optionalIngredientId = String((ingredient as any)?.id || "").trim();
              if (!optionalIngredientId) continue;
              unique.set(optionalIngredientId, ingredient);
            }

            await db.getPrisma().orderItemOptionalIngredient.createMany({
              data: Array.from(unique.values()).map((ingredient: any) => ({
                orderItemId: orderItem.id,
                optionalIngredientId: ingredient.id,
                isIncluded: ingredient.isIncluded ?? true,
                ingredientName: ingredient.name,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      // Expand deal items into DEAL_COMPONENT child order items (Stripe online payment)
      const dealCartEntriesStripe = allCartItems
        .map((it: any, idx: number) => ({ it, idx }))
        .filter(({ it }: any) => it?.dealId || it?.itemType === "DEAL");
      if (dealCartEntriesStripe.length > 0) {
        const prismaAny = db.getPrisma() as any;
        const dealIdsToFetch = Array.from(
          new Set(dealCartEntriesStripe.map(({ it }: any) => it.dealId).filter(Boolean))
        );
        const deals = await prismaAny.deal.findMany({
          where: { id: { in: dealIdsToFetch } },
          include: {
            components: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: {
                branchPrices: orderData?.branchId
                  ? {
                      where: { branchId: orderData.branchId as string },
                      select: { id: true, branchId: true, price: true, taxPercentage: true },
                    }
                  : false,
              },
            },
          },
        });
        const dealById = new Map<string, any>(deals.map((d: any) => [d.id, d]));
        for (const { it, idx } of dealCartEntriesStripe) {
          const parentOrderItem = (order as any)?.orderItems?.[idx];
          if (!parentOrderItem?.id) continue;
          const deal = dealById.get(it.dealId);
          if (!deal) continue;
          const dealQty = Number(it.quantity || 1);
          const childCreates: any[] = [];
          for (const c of deal.components || []) {
            const override =
              Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                ? c.branchPrices[0]
                : null;
            const unitPrice = override ? Number(override.price) : Number(c.price);
            const taxPct =
              override && override.taxPercentage !== null && override.taxPercentage !== undefined
                ? Number(override.taxPercentage)
                : Number(c.taxPercentage);
            const compQty = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
            const finalCompQty = Number.isFinite(compQty) && compQty > 0 ? compQty : 1;
            const lineQty = finalCompQty * dealQty;
            const taxPerUnit = taxInclusive
              ? (unitPrice * taxPct) / (100 + taxPct)
              : (unitPrice * taxPct) / 100;
            const taxAmount = taxPerUnit * lineQty;
            childCreates.push({
              orderId: (order as any).id,
              itemType: "DEAL_COMPONENT",
              dealId: it.dealId,
              dealComponentId: c.id,
              parentDealItemId: parentOrderItem.id,
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

      // Create or link Payment record (Stripe)
      const paymentService = PaymentService.getInstance();
      const paymentAmount = paymentIntent.amount / 100;
      const paymentCurrency = paymentIntent.currency.toUpperCase();
      const providerChargeId =
        (paymentIntent.latest_charge as string | null) || null;

      let paymentRecord = await paymentService.getPaymentByProviderId(
        paymentIntent.id
      );

      if (!paymentRecord) {
        // When merging, check if the order already has a payment record
        if (mergeWithOrderId && existingOrder) {
          const existingPayment = await db.getPrisma().payment.findUnique({
            where: { orderId: order.id },
          });
          
          if (existingPayment) {
            // Update existing payment with new amount and provider info
            paymentRecord = await db.getPrisma().payment.update({
              where: { id: existingPayment.id },
              data: {
                amount: paymentAmount,
                providerPaymentId: paymentIntent.id,
                providerChargeId,
                currency: paymentCurrency,
                fees:
                  paymentIntent.application_fee_amount !== null &&
                  paymentIntent.application_fee_amount !== undefined
                    ? paymentIntent.application_fee_amount / 100
                    : null,
                status: PaymentState.COMPLETED,
                metadata: paymentIntent.metadata || undefined,
              },
            });
          } else {
            // No existing payment, create new one
            paymentRecord = await paymentService.createPayment({
              orderId: order.id,
              paymentMethod: PaymentMethod.ONLINE_PAYMENT,
              paymentProvider: PaymentProvider.STRIPE,
              providerPaymentId: paymentIntent.id,
              providerChargeId,
              amount: paymentAmount,
              currency: paymentCurrency,
              fees:
                paymentIntent.application_fee_amount !== null &&
                paymentIntent.application_fee_amount !== undefined
                  ? paymentIntent.application_fee_amount / 100
                  : null,
              netAmount: null,
              status: PaymentState.COMPLETED,
              metadata: paymentIntent.metadata || undefined,
            });
          }
        } else {
          // Not merging, create new payment
          paymentRecord = await paymentService.createPayment({
            orderId: order.id,
            paymentMethod: PaymentMethod.ONLINE_PAYMENT,
            paymentProvider: PaymentProvider.STRIPE,
            providerPaymentId: paymentIntent.id,
            providerChargeId,
            amount: paymentAmount,
            currency: paymentCurrency,
            fees:
              paymentIntent.application_fee_amount !== null &&
              paymentIntent.application_fee_amount !== undefined
                ? paymentIntent.application_fee_amount / 100
                : null,
            netAmount: null,
            status: PaymentState.COMPLETED,
            metadata: paymentIntent.metadata || undefined,
          });
        }
      } else if (!paymentRecord.orderId) {
        await paymentService.linkPaymentToOrder(paymentRecord.id, order.id);
      }

      // Fiscalization (Germany / Fiskaly): block posting until fiscalization succeeds.
      // If Fiskaly isn't enabled, we keep existing behavior (post immediately for online payments).
      if (order?.id) {
        const prismaAny = db.getPrisma() as any;
        const orderForFiscal = await prismaAny.order.findUnique({
          where: { id: order.id },
          select: {
            id: true,
            branchId: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            postedAt: true,
            totalAmount: true,
            currency: true,
            orderNumber: true,
            voucherPaymentAmount: true,
            voucherCodes: true,
            branch: { select: { organizationId: true } },
          },
        });

        const organizationId = orderForFiscal?.branch?.organizationId as
          | string
          | null
          | undefined;

        if (organizationId && orderForFiscal?.branchId) {
          const config = await getFiskalyConfigSnapshot(prismaAny, organizationId);

          // Align behavior with the requirement:
          // only fiscalize/post once the order is fulfilled (delivered/picked up) AND paid.
          const nextStatus = String(orderForFiscal?.status || "");
          const nextPaymentStatus = String(orderForFiscal?.paymentStatus || "");
          const isFulfilled = nextStatus === "DELIVERED" || nextStatus === "PICKED_UP";
          const isPaid = nextPaymentStatus === "PAID";
          const shouldPost = isPaid && isFulfilled;

          if (shouldPost) {
            if (shouldFiscalize(config)) {
              const fiskaly = FiskalyService.getInstance();
              const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
              const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";
              let deviceId: string | null = null;
              if (headerDeviceId) {
                const device = await prismaAny.posDevice.findFirst({
                  where: { id: headerDeviceId, organizationId, branchId: orderForFiscal.branchId },
                  select: { id: true },
                });
                if (device?.id) deviceId = device.id;
              }

              await fiskaly.fiscalize({
                organizationId,
                branchId: orderForFiscal.branchId,
                deviceId,
                orderId: orderForFiscal.id,
                amount: Number(orderForFiscal.totalAmount),
                currency: String(orderForFiscal.currency || "usd"),
                receiptNumber: String(
                  (orderForFiscal as any).orderNumber || orderForFiscal.id
                ),
                meta: {
                  paymentMethod: String((orderForFiscal as any)?.paymentMethod || "").trim() || null,
                  voucherPaymentAmount: Number((orderForFiscal as any)?.voucherPaymentAmount || 0),
                  voucherCodes: (orderForFiscal as any)?.voucherCodes || [],
                },
              });
            }

            if (!orderForFiscal.postedAt) {
              const businessDayService = BusinessDayService.getInstance();
              const openSession = await businessDayService.getOrCreateOpenSession(
                orderForFiscal.branchId
              );

              await prismaAny.order.update({
                where: { id: orderForFiscal.id },
                data: {
                  postedAt: new Date(),
                  businessDaySessionId: openSession?.id || null,
                } as any,
              });
            }
          }
        }
      }

      // Create optional ingredients for each order item
      for (let i = 0; i < allCartItems.length; i++) {
        const item = allCartItems[i];
        if (item.optionalIngredients && item.optionalIngredients.length > 0) {
          // Use index-based matching since orderItems are created in the same order as allCartItems
          const orderItem = order.orderItems[i];
          if (orderItem) {
            const unique = new Map<string, any>();
            for (const ingredient of item.optionalIngredients as any[]) {
              const optionalIngredientId = String((ingredient as any)?.id || "").trim();
              if (!optionalIngredientId) continue;
              unique.set(optionalIngredientId, ingredient);
            }

            await db.getPrisma().orderItemOptionalIngredient.createMany({
              data: Array.from(unique.values()).map((ingredient: any) => ({
                orderItemId: orderItem.id,
                optionalIngredientId: ingredient.id,
                isIncluded: ingredient.isIncluded ?? true,
                ingredientName: ingredient.name,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      // Emit WebSocket event
      const notification = await db.getPrisma().notification.create({
        data: {
          type: "ORDER",
          orderId: order.id,
          isSeen: false,
          isOrderUpdate: !!mergeWithOrderId,
        },
      });

      const wsService = WebSocketService.getInstance();
      if (mergeWithOrderId) {
        // Emit order update event for admin with merge information
        wsService.emitOrderUpdate(
          notification,
          order,
          newItemsForNotification
        );
      } else {
        // Emit new order event
        wsService.emitNewOrder(notification, order);
      }

      // Safety: cancel pickup/delivery orders if limits are exceeded after this order
      const mealsInOrder = Array.from(
        new Set<string>(
          cartItems
            .map((item: any) => (item.mealId || item.id) as string | undefined)
            .filter((id: string | undefined): id is string => Boolean(id))
        )
      );
      const todayForCancellation = new Date();
      for (const mId of mealsInOrder) {
        await deliverableQuantityService.cancelPickupDeliveryOrdersIfExceeded(
          orderData.branchId,
          mId,
          todayForCancellation
        );
      }

      // Send tablet notification for new order (only if not merging)
      if (!mergeWithOrderId) {
        await tabletOrderNotificationService.notifyOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
          organizationId: orderData.branchId ? (await db.getPrisma().branch.findUnique({ where: { id: orderData.branchId }, select: { organizationId: true } }))?.organizationId || "" : "",
          status: order.status,
          totalAmount: Number(order.totalAmount),
          orderType: orderData.orderType,
          customerName: orderData.customerName,
        });
      }

      res.json({
        success: true,
        data: order,
        message: mergeWithOrderId
          ? "Payment confirmed and order updated successfully"
          : "Payment confirmed and order created successfully",
        merged: !!mergeWithOrderId,
      });
    } catch (error) {
      console.error("Error confirming payment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to confirm payment",
      });
    }
  };

  // Handle Stripe webhooks
  public handleWebhook = async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error("Webhook secret not configured");
      res.status(400).send("Webhook secret not configured");
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).send(`Webhook Error: ${err}`);
      return;
    }

    try {
      switch (event.type) {
        case "payment_intent.succeeded":
          await this.handlePaymentIntentSucceeded(
            event.data.object as Stripe.PaymentIntent
          );
          break;
        case "payment_intent.payment_failed":
          await this.handlePaymentIntentFailed(
            event.data.object as Stripe.PaymentIntent
          );
          break;
        case "payment_intent.canceled":
          await this.handlePaymentIntentCanceled(
            event.data.object as Stripe.PaymentIntent
          );
          break;
        case "payment_intent.requires_action":
          await this.handlePaymentIntentRequiresAction(
            event.data.object as Stripe.PaymentIntent
          );
          break;
        case "charge.succeeded":
          await this.handleChargeSucceeded(event.data.object as Stripe.Charge);
          break;
        case "charge.failed":
          await this.handleChargeFailed(event.data.object as Stripe.Charge);
          break;
        case "charge.refunded":
          await this.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;
        case "refund.created":
          await this.handleRefundCreated(event.data.object as Stripe.Refund);
          break;
        case "refund.updated":
          await this.handleRefundUpdated(event.data.object as Stripe.Refund);
          break;
        case "charge.dispute.created":
          await this.handleChargeDisputeCreated(
            event.data.object as Stripe.Dispute
          );
          break;
        default:
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Error handling webhook:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  };

  private handlePaymentIntentSucceeded = async (
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      // Update order status if it exists
      const existingOrder = await (db.getPrisma() as any).order.findFirst({
        where: { paymentIntentId: paymentIntent.id },
        select: {
          id: true,
          branchId: true,
          postedAt: true,
          totalAmount: true,
          currency: true,
          orderNumber: true,
          branch: { select: { organizationId: true } },
        },
      });

      if (existingOrder) {
        const prismaAny = db.getPrisma() as any;
        const organizationId = (existingOrder as any)?.branch?.organizationId as
          | string
          | null
          | undefined;

        // Always ensure the order is marked paid.
        await prismaAny.order.update({
          where: { id: existingOrder.id },
          data: {
            status: "CONFIRMED",
            paymentStatus: "PAID",
            updatedAt: new Date(),
          } as any,
        });

        // If Fiskaly is enabled, fiscalize before posting.
        if (organizationId && existingOrder.branchId) {
          const config = await getFiskalyConfigSnapshot(prismaAny, organizationId);

          if (shouldFiscalize(config)) {
            const fiskaly = FiskalyService.getInstance();
            await fiskaly.fiscalizeTestMode({
              organizationId,
              branchId: existingOrder.branchId,
              orderId: existingOrder.id,
              amount: Number((existingOrder as any).totalAmount),
              currency: String((existingOrder as any).currency || "usd"),
              receiptNumber: String(
                (existingOrder as any).orderNumber || existingOrder.id
              ),
            });
          }
        }

        // Post (EOD) only after fiscalization succeeded.
        if (!existingOrder.postedAt && existingOrder.branchId) {
          const businessDayService = BusinessDayService.getInstance();
          const openSession = await businessDayService.getOrCreateOpenSession(
            existingOrder.branchId
          );

          await prismaAny.order.update({
            where: { id: existingOrder.id },
            data: {
              postedAt: new Date(),
              businessDaySessionId: openSession?.id || null,
            } as any,
          });
        }
      }

      // Update reservation order if this payment intent belongs to a reservation deposit
      const existingReservationOrder = await db.getPrisma().reservationOrder.findFirst({
        where: { paymentIntentId: paymentIntent.id },
        include: { payment: true },
      });

      if (existingReservationOrder) {
        const amountReceived =
          (paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100;
        const roundedAmount = Math.round(amountReceived * 100) / 100;
        await db.getPrisma().reservationOrder.update({
          where: { id: existingReservationOrder.id },
          data: {
            paymentStatus: "PAID",
            paidAmount: roundedAmount,
            currency: (paymentIntent.currency || existingReservationOrder.currency).toLowerCase(),
          },
        });

        // Keep payment record in sync when available
        if (existingReservationOrder.payment) {
          await db.getPrisma().payment.update({
            where: { id: existingReservationOrder.payment.id },
            data: {
              amount: roundedAmount,
              currency: paymentIntent.currency
                ? paymentIntent.currency.toUpperCase()
                : existingReservationOrder.payment.currency,
              status: PaymentState.COMPLETED,
              completedAt: new Date(),
            },
          });
        }
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  private handlePaymentIntentFailed = async (
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      // Update order status if it exists
      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: paymentIntent.id },
      });

      if (existingOrder) {
        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            status: "CANCELLED",
            paymentStatus: "FAILED",
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  private handlePaymentIntentCanceled = async (
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: paymentIntent.id },
      });

      if (existingOrder) {
        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            status: "CANCELLED",
            paymentStatus: "FAILED",
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  private handlePaymentIntentRequiresAction = async (
    paymentIntent: Stripe.PaymentIntent
  ): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: paymentIntent.id },
      });

      if (existingOrder) {
        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            status: "PENDING",
            paymentStatus: "PENDING",
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  private handleChargeSucceeded = async (
    charge: Stripe.Charge
  ): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: charge.payment_intent as string },
      });

      if (existingOrder) {
        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            status: "CONFIRMED",
            paymentStatus: "PAID",
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  private handleChargeFailed = async (charge: Stripe.Charge): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: charge.payment_intent as string },
      });

      if (existingOrder) {
        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            status: "CANCELLED",
            paymentStatus: "FAILED",
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  private handleChargeDisputeCreated = async (
    dispute: Stripe.Dispute
  ): Promise<void> => {
    const db = DatabaseSingleton.getInstance();

    try {
      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: dispute.payment_intent as string },
      });

      if (existingOrder) {
        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            status: "CANCELLED",
            paymentStatus: "FAILED",
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  // Handle charge refunded webhook
  private handleChargeRefunded = async (
    charge: Stripe.Charge
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: charge.payment_intent as string },
        include: { refunds: true },
      });

      if (existingOrder) {
        // Prefer Stripe's authoritative refunded amount to avoid timing issues (refund rows may not exist yet)
        const orderTotal = parseFloat(existingOrder.totalAmount.toString());
        const refundedFromStripe =
          typeof (charge as any).amount_refunded === "number"
            ? ((charge as any).amount_refunded as number) / 100
            : null;

        const refundedFromDb = existingOrder.refunds
          .filter((r) => r.status === "SUCCEEDED")
          .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

        const totalRefunded = refundedFromStripe !== null ? refundedFromStripe : refundedFromDb;

        let paymentStatus: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" = "PAID";
        if (totalRefunded >= orderTotal) paymentStatus = "REFUNDED";
        else if (totalRefunded > 0) paymentStatus = "PARTIALLY_REFUNDED";

        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            paymentStatus: paymentStatus,
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error handling charge refunded webhook:", error);
    }
  };

  // Handle refund created webhook
  private handleRefundCreated = async (
    refund: Stripe.Refund
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: refund.payment_intent as string },
        include: { refunds: true },
      });

      if (existingOrder) {
        const mappedStatus: "SUCCEEDED" | "FAILED" | "PENDING" | "CANCELED" =
          refund.status === "succeeded"
            ? "SUCCEEDED"
            : refund.status === "failed"
            ? "FAILED"
            : refund.status === "canceled"
            ? "CANCELED"
            : "PENDING";

        // Update or create refund record
        await db.getPrisma().refund.upsert({
          where: { stripeRefundId: refund.id },
          update: {
            status: mappedStatus,
            refundedAt: mappedStatus === "SUCCEEDED" ? new Date() : null,
          },
          create: {
            orderId: existingOrder.id,
            refundType: "PARTIAL", // Default type, will be updated by our API
            amount: refund.amount / 100, // Convert from cents
            stripeRefundId: refund.id,
            status: mappedStatus,
            refundedBy: "stripe_webhook",
            refundedAt: mappedStatus === "SUCCEEDED" ? new Date() : null,
          },
        });

        // Recompute refunded totals from DB (succeeded-only) to avoid double counting
        const refreshed = await db.getPrisma().order.findUnique({
          where: { id: existingOrder.id },
          include: { refunds: true },
        });

        if (refreshed) {
          const totalRefunded = (refreshed.refunds || [])
            .filter((r) => r.status === "SUCCEEDED")
            .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

          const orderTotal = parseFloat(refreshed.totalAmount.toString());

          let paymentStatus: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" = "PAID";
          if (totalRefunded >= orderTotal) paymentStatus = "REFUNDED";
          else if (totalRefunded > 0) paymentStatus = "PARTIALLY_REFUNDED";

          await db.getPrisma().order.update({
            where: { id: refreshed.id },
            data: {
              paymentStatus: paymentStatus,
              updatedAt: new Date(),
            },
          });
        }
      }
    } catch (error) {
      console.error("Error handling refund created webhook:", error);
    }
  };

  // Handle refund updated webhook
  private handleRefundUpdated = async (
    refund: Stripe.Refund
  ): Promise<void> => {
    try {
      const db = DatabaseSingleton.getInstance();

      const existingOrder = await db.getPrisma().order.findFirst({
        where: { paymentIntentId: refund.payment_intent as string },
        include: { refunds: true },
      });

      if (existingOrder) {
        // Update refund record
        await db.getPrisma().refund.updateMany({
          where: { stripeRefundId: refund.id },
          data: {
            status:
              refund.status === "succeeded"
                ? "SUCCEEDED"
                : refund.status === "failed"
                ? "FAILED"
                : refund.status === "canceled"
                ? "CANCELED"
                : "PENDING",
            refundedAt: refund.status === "succeeded" ? new Date() : null,
          },
        });

        // Recompute refunded totals from DB (succeeded-only)
        const refreshed = await db.getPrisma().order.findUnique({
          where: { id: existingOrder.id },
          include: { refunds: true },
        });

        if (!refreshed) return;

        const totalRefunded = (refreshed.refunds || [])
          .filter((r) => r.status === "SUCCEEDED")
          .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

        const orderTotal = parseFloat(refreshed.totalAmount.toString());

        let paymentStatus: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" = "PAID";
        if (totalRefunded >= orderTotal) paymentStatus = "REFUNDED";
        else if (totalRefunded > 0) paymentStatus = "PARTIALLY_REFUNDED";

        await db.getPrisma().order.update({
          where: { id: existingOrder.id },
          data: {
            paymentStatus: paymentStatus,
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error("Error handling refund updated webhook:", error);
    }
  };

  // Process refund for an order
  public processRefund = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { orderId } = req.params;
      const { reason = "requested_by_customer" } = req.body;

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
          status: true,
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          error: "Order not found",
        });
        return;
      }

      // Check if order can be refunded
      if (order.paymentStatus !== "PAID") {
        res.status(400).json({
          success: false,
          error: "Order payment status must be PAID to process refund",
        });
        return;
      }

      if (!order.paymentIntentId) {
        res.status(400).json({
          success: false,
          error: "No payment intent found for this order",
        });
        return;
      }

      // Get the payment intent from Stripe to check if it's refundable
      const paymentIntent = await stripe.paymentIntents.retrieve(
        order.paymentIntentId
      );

      if (paymentIntent.status !== "succeeded") {
        res.status(400).json({
          success: false,
          error: "Payment intent is not in succeeded status",
        });
        return;
      }

      // Check if already refunded
      const existingRefunds = await stripe.refunds.list({
        payment_intent: order.paymentIntentId,
      });

      if (existingRefunds.data.length > 0) {
        res.status(400).json({
          success: false,
          error: "Order has already been refunded",
        });
        return;
      }

      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        reason: reason as "duplicate" | "fraudulent" | "requested_by_customer",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          refundedBy: req.user?.id || "admin",
        },
      });

      // Update order status in database
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: "REFUNDED",
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          refundId: refund.id,
          amount: refund.amount,
          status: refund.status,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        message: "Refund processed successfully",
      });
    } catch (error) {
      console.error("Error processing refund:", error);

      // Handle specific Stripe errors
      if (error instanceof Stripe.errors.StripeError) {
        res.status(400).json({
          success: false,
          error: `Stripe error: ${error.message}`,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to process refund",
      });
    }
  };

  // PayPal: Create order
  public createPayPalOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const {
        amount,
        currency = "USD",
        metadata = {},
        branchId,
      } = req.body;

      if (!amount || amount <= 0) {
        console.error("ERROR: Invalid amount:", amount);
        res.status(400).json({
          success: false,
          error: "Amount is required and must be greater than 0",
        });
        return;
      }

      if (!PAYPAL_CONFIG.clientId || !PAYPAL_CONFIG.clientSecret) {
        console.error("ERROR: PayPal credentials not configured");
        res.status(500).json({
          success: false,
          error: "PayPal is not configured",
        });
        return;
      }

      const branchIdFromMetadata = (metadata as any)?.branchId as string | undefined;
      const requestedBranchId =
        typeof branchId === "string" && branchId.trim().length > 0
          ? branchId.trim()
          : typeof branchIdFromMetadata === "string" && branchIdFromMetadata.trim().length > 0
          ? branchIdFromMetadata.trim()
          : undefined;

      if (requestedBranchId) {
        const db = DatabaseSingleton.getInstance();
        const branch: any = await db.getPrisma().branch.findUnique({
          where: { id: requestedBranchId },
          select: { id: true, isActive: true, organizationId: true } as any,
        });

        if (!branch || !branch.isActive) {
          res.status(400).json({
            success: false,
            error: "Invalid or inactive branch",
          });
          return;
        }

        if (branch.organizationId) {
          const org: any = await db.getPrisma().organization.findUnique({
            where: { id: branch.organizationId },
            select: {
              id: true,
              isActive: true,
              freeVersion: true,
              onlinePaymentsAllowed: true,
              paypalAllowed: true,
            } as any,
          });

          if (!org || !org.isActive) {
            res.status(400).json({
              success: false,
              error: "Organization is deactivated",
            });
            return;
          }

          if (org.freeVersion === true) {
            res.status(400).json({
              success: false,
              error: "Payments are not allowed in free version",
            });
            return;
          }

          if (org.onlinePaymentsAllowed === false) {
            res.status(400).json({
              success: false,
              error: "Online payments are not allowed for this organization",
            });
            return;
          }

          if (org.paypalAllowed === false) {
            res.status(400).json({
              success: false,
              error: "PayPal payments are not allowed for this organization",
            });
            return;
          }
        }
      }

      // Initialize PayPal environment
      const environment =
        PAYPAL_CONFIG.mode === "live"
          ? new paypal.core.LiveEnvironment(
              PAYPAL_CONFIG.clientId,
              PAYPAL_CONFIG.clientSecret
            )
          : new paypal.core.SandboxEnvironment(
              PAYPAL_CONFIG.clientId,
              PAYPAL_CONFIG.clientSecret
            );
      const client = new paypal.core.PayPalHttpClient(environment);

      // Create PayPal order request
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency.toUpperCase(),
              value: amount.toFixed(2),
            },
            description: `Order payment - ${metadata.orderNumber || "N/A"}`,
            custom_id: metadata.orderNumber || `order-${Date.now()}`,
          },
        ],
        application_context: {
          brand_name: metadata.businessName || "Restaurant Order",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          // Do NOT include return_url or cancel_url - this forces inline checkout (popup/modal)
        },
      });

      const order = await client.execute(request);
      const orderResult = order.result as PayPalOrderResult;

      res.json({
        success: true,
        data: {
          orderId: orderResult.id,
          status: orderResult.status,
        },
      });
    } catch (error: any) {
      console.error("ERROR: Failed to create PayPal order:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Failed to create PayPal order",
      });
    }
  };

  // PayPal: Capture order
  public capturePayPalOrder = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { orderId, orderData, cartItems, mergeWithOrderId } = req.body;

      if (!orderId) {
        res.status(400).json({
          success: false,
          error: "PayPal order ID is required",
        });
        return;
      }

      if (!cartItems || cartItems.length === 0) {
        res.status(400).json({
          success: false,
          error: "Cart items are required",
        });
        return;
      }

      if (!orderData?.branchId) {
        res.status(400).json({
          success: false,
          error: "Branch ID is required",
        });
        return;
      }

      if (!PAYPAL_CONFIG.clientId || !PAYPAL_CONFIG.clientSecret) {
        console.error("ERROR: PayPal credentials not configured");
        res.status(500).json({
          success: false,
          error: "PayPal is not configured",
        });
        return;
      }

      // Initialize PayPal environment
      const environment =
        PAYPAL_CONFIG.mode === "live"
          ? new paypal.core.LiveEnvironment(
              PAYPAL_CONFIG.clientId,
              PAYPAL_CONFIG.clientSecret
            )
          : new paypal.core.SandboxEnvironment(
              PAYPAL_CONFIG.clientId,
              PAYPAL_CONFIG.clientSecret
            );
      const client = new paypal.core.PayPalHttpClient(environment);

      // Capture PayPal order
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.requestBody({});

      const capture = await client.execute(request);
      const captureResult = capture.result as PayPalCaptureResult;


      if (captureResult.status !== "COMPLETED") {
        res.status(400).json({
          success: false,
          error: "PayPal payment not completed",
        });
        return;
      }

      const db = DatabaseSingleton.getInstance();

      // Determine order type and validate required fields
      const orderType =
        orderData?.orderType && orderData.orderType === "PICKUP"
          ? "PICKUP"
          : "DELIVERY";

      if (orderType === "PICKUP") {
        if (!orderData?.pickupPhone) {
          res.status(400).json({
            success: false,
            error: "Pickup phone is required",
          });
          return;
        }
      } else {
        if (!orderData?.deliveryAddress || !orderData?.deliveryPhone) {
          res.status(400).json({
            success: false,
            error: "Delivery address and phone are required",
          });
          return;
        }
      }

      // Validate branch
      const branch = await db.getPrisma().branch.findUnique({
        where: { id: orderData.branchId },
      });
      if (!branch || !branch.isActive) {
        res.status(400).json({
          success: false,
          error: "Invalid or inactive branch",
        });
        return;
      }

      if ((branch as any).organizationId) {
        const org: any = await db.getPrisma().organization.findUnique({
          where: { id: (branch as any).organizationId },
          select: {
            id: true,
            isActive: true,
            freeVersion: true,
            onlinePaymentsAllowed: true,
            paypalAllowed: true,
          } as any,
        });

        if (!org || !org.isActive) {
          res.status(400).json({
            success: false,
            error: "Organization is deactivated",
          });
          return;
        }

        if (org.freeVersion === true) {
          res.status(400).json({
            success: false,
            error: "Payments are not allowed in free version",
          });
          return;
        }

        if (org.onlinePaymentsAllowed === false) {
          res.status(400).json({
            success: false,
            error: "Online payments are not allowed for this organization",
          });
          return;
        }

        if (org.paypalAllowed === false) {
          res.status(400).json({
            success: false,
            error: "PayPal payments are not allowed for this organization",
          });
          return;
        }
      }

      // Enforce service availability (branch override with global fallback)
      const globalSettingsForServicesPayPal = await db.getPrisma().settings.findFirst({
        select: {
          pickupEnabled: true,
          deliveryEnabled: true,
        } as any,
      });
      if (!globalSettingsForServicesPayPal) {
        res.status(500).json({
          success: false,
          error: "Settings not configured",
        });
        return;
      }

      const effectivePickupEnabledPayPal =
        (branch as any).pickupEnabled !== null && (branch as any).pickupEnabled !== undefined
          ? Boolean((branch as any).pickupEnabled)
          : Boolean((globalSettingsForServicesPayPal as any).pickupEnabled);
      const effectiveDeliveryEnabledPayPal =
        (branch as any).deliveryEnabled !== null && (branch as any).deliveryEnabled !== undefined
          ? Boolean((branch as any).deliveryEnabled)
          : Boolean((globalSettingsForServicesPayPal as any).deliveryEnabled);

      if (orderType === "PICKUP" && !effectivePickupEnabledPayPal) {
        res.status(400).json({
          success: false,
          error: "Pickup is currently disabled for this branch",
        });
        return;
      }
      if (orderType !== "PICKUP" && !effectiveDeliveryEnabledPayPal) {
        res.status(400).json({
          success: false,
          error: "Delivery is currently disabled for this branch",
        });
        return;
      }

      // Parse and validate scheduled date for PayPal orders
      let scheduledDatePayPal: Date | null = null;
      let isScheduledOrderPayPal = false;

      if (orderData?.scheduledDate) {
        scheduledDatePayPal = new Date(orderData.scheduledDate);
        if (isNaN(scheduledDatePayPal.getTime())) {
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
        const futureOrderSettings = getEffectiveFutureOrderSettings(branch, globalSettings);
        const validation = validateScheduledDate(
          scheduledDatePayPal,
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

        // Check if order is actually for a future date
        // If a scheduled date is provided, this is a scheduled order
        // (regardless of whether it's today or a future date)
        isScheduledOrderPayPal = true;
      }

      const globalSettingsForOrderStatus = await db.getPrisma().settings.findFirst({
        select: { scheduledOrderAutoConfirm: true },
      });
      const effectiveScheduledOrderAutoConfirm =
        (branch as any)?.scheduledOrderAutoConfirm !== null &&
        (branch as any)?.scheduledOrderAutoConfirm !== undefined
          ? Boolean((branch as any).scheduledOrderAutoConfirm)
          : Boolean((globalSettingsForOrderStatus as any)?.scheduledOrderAutoConfirm ?? true);
      const initialOrderStatus =
        scheduledDatePayPal && isScheduledOrderPayPal && !effectiveScheduledOrderAutoConfirm
          ? ("PENDING" as const)
          : ("CONFIRMED" as const);

      let defaultPreparationTimePayPal: number | null = null;
      if (initialOrderStatus === "CONFIRMED") {
        const prepFromBranch = (branch as any)?.orderPreparationTime;
        if (prepFromBranch !== null && prepFromBranch !== undefined && Number(prepFromBranch) > 0) {
          defaultPreparationTimePayPal = Number(prepFromBranch);
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
            defaultPreparationTimePayPal = Number(prepFromSettings.orderPreparationTime);
          }
        }
      }

      if (scheduledDatePayPal) {
        const globalSettingsForCapacityPayPal = await db.getPrisma().settings.findFirst({
          select: {
            scheduledOrderTimeSlotInterval: true,
            scheduledOrderMaxOrdersPerSlot: true,
          },
        });

        if (globalSettingsForCapacityPayPal) {
          const intervalMinutes =
            (branch as any).scheduledOrderTimeSlotInterval ??
            (globalSettingsForCapacityPayPal as any).scheduledOrderTimeSlotInterval ??
            30;
          const maxOrdersPerSlot =
            (branch as any).scheduledOrderMaxOrdersPerSlot !== null &&
            (branch as any).scheduledOrderMaxOrdersPerSlot !== undefined
              ? (branch as any).scheduledOrderMaxOrdersPerSlot
              : (globalSettingsForCapacityPayPal as any).scheduledOrderMaxOrdersPerSlot ?? null;

          if (maxOrdersPerSlot !== null) {
            const minutes =
              scheduledDatePayPal.getHours() * 60 + scheduledDatePayPal.getMinutes();
            const floored = Math.floor(minutes / intervalMinutes) * intervalMinutes;
            const slotStart = new Date(scheduledDatePayPal);
            slotStart.setHours(0, 0, 0, 0);
            slotStart.setMinutes(floored);
            const slotEnd = new Date(slotStart.getTime() + intervalMinutes * 60 * 1000);

            const count = await db.getPrisma().order.count({
              where: {
                branchId: orderData.branchId,
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

      // Validate deliverable weight for today (concurrency check - another user may have ordered)
      const uniqueMealIdsPayPal = [...new Set(cartItems.map((item: any) => item.mealId || item.id))] as string[];
      const mealsWithSizesPayPal = await db.getPrisma().meal.findMany({
        where: { id: { in: uniqueMealIdsPayPal } },
        include: { mealSizes: true },
      });
      const sizeMapPayPal = new Map(
        mealsWithSizesPayPal.map((m) => [m.id, m.mealSizes])
      );
      const todayPayPal = new Date();
      const weightValidationPayPal = await deliverableQuantityService.validateOrderWeight(
        cartItems.map((item: any) => {
          const mealId = item.mealId || item.id;
          const matched = (sizeMapPayPal.get(mealId) || []).find(
            (s) => s.name === item.size
          );
          return {
            mealId,
            mealSizeType: matched?.sizeType || SizeType.M,
            quantity: item.quantity,
          };
        }),
        orderData.branchId,
        todayPayPal
      );
      if (!weightValidationPayPal.ok) {
        // PayPal payment was already captured, but we can't fulfill the order
        // In production, you would want to refund the PayPal order here
        res.status(400).json({
          success: false,
          error:
            weightValidationPayPal.failures.join("; ") ||
            "Insufficient deliverable quantity for one or more items. Your payment was captured but the order cannot be fulfilled.",
        });
        return;
      }

      // Check serving hours
      const servingHoursSettings = await db.getPrisma().settings.findFirst();
      if (servingHoursSettings) {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const currentTime = now.toTimeString().slice(0, 5);

        // Check if orders outside hours are allowed
        if (!servingHoursSettings.allowOrdersOutsideHours) {
          // Add serving hours validation logic here if needed
        }
      }

      // When merging, we'll use the existing order's delivery fee for order storage
      let mergePreservedDeliveryFeePayPal: number | null = null;

      // Validate scheduled order merge rules for PayPal orders
      if (mergeWithOrderId) {
        const existingOrderPayPal = await db.getPrisma().order.findUnique({
          where: { id: mergeWithOrderId },
        });

        if (existingOrderPayPal) {
          // Preserve the existing order's delivery fee for the merged order
          mergePreservedDeliveryFeePayPal = existingOrderPayPal.deliveryFee 
            ? Number(existingOrderPayPal.deliveryFee) 
            : 0;

          const globalSettingsForMergePayPal = await db.getPrisma().settings.findFirst();
          if (globalSettingsForMergePayPal) {
            const { getEffectiveScheduledOrderMergeSettings, validateScheduledOrderMerge } = await import(
              "../utils/branchConfigHelper"
            );
            const mergeSettingsPayPal = getEffectiveScheduledOrderMergeSettings(branch, globalSettingsForMergePayPal);
            const scheduledMergeValidationPayPal = validateScheduledOrderMerge(
              {
                scheduledDate: existingOrderPayPal.scheduledDate,
                isScheduledOrder: existingOrderPayPal.isScheduledOrder,
              },
              scheduledDatePayPal,
              mergeSettingsPayPal
            );

            if (!scheduledMergeValidationPayPal.valid) {
              // Note: PayPal payment was already captured - in production, you would refund here
              res.status(400).json({
                success: false,
                error: scheduledMergeValidationPayPal.error,
              });
              return;
            }
          }
        }
      }

      // Calculate order totals
      const taxCalculator = new TaxCalculator();

      const effectiveDeliveryFee =
        orderType === "PICKUP" ? 0 : orderData.deliveryFee || 0;
      
      // When merging, use the preserved delivery fee from the original order
      const deliveryFeeForCalculationPayPal = mergeWithOrderId && mergePreservedDeliveryFeePayPal !== null
        ? mergePreservedDeliveryFeePayPal
        : effectiveDeliveryFee;

      // Convert cart items to format expected by TaxCalculator
      // Use prices from cart items directly (they already have branch-specific prices calculated)
      // If cart items don't have basePrice, then recalculate using branch-specific prices
      const formattedCartItems = await Promise.all(
        cartItems.map(async (item: any) => {
          // Use basePrice from cart item if available (already includes meal base + size price)
          // Otherwise, recalculate using branch-specific prices
          let finalMealPrice = item.basePrice;
          if (!finalMealPrice) {
            const mealBasePrice = await getMealBasePrice(
              item.mealId || item.id,
              orderData.branchId
            );
            
            // Handle meal size price if applicable
            finalMealPrice = mealBasePrice;
            if (item.selectedSize || item.size) {
              const meal = await db.getPrisma().meal.findUnique({
                where: { id: item.mealId || item.id },
                include: { mealSizes: true },
              });
              if (meal) {
                const mealSize = meal.mealSizes.find(
                  (s) => s.name === (item.selectedSize || item.size)
                );
                if (mealSize) {
                  // Size price is additional to base price
                  finalMealPrice = mealBasePrice + Number(mealSize.price || 0);
                }
              }
            }
          }
          
          // Use addon prices from cart items if available (already branch-specific)
          // Otherwise, recalculate using branch-specific prices
          const addOns = await Promise.all(
            (item.selectedAddons || item.addOns || []).map(async (addon: any) => {
              // Use price from cart item if available, otherwise recalculate
              const addonPrice = addon.price || await getAddonBasePrice(addon.id, orderData.branchId);
              return {
                id: addon.id,
                price: addonPrice,
                quantity: addon.quantity || 1,
                addon_type: addon.type || "OPTIONAL",
              };
            })
          );
          
          return {
            mealId: item.mealId || item.id,
            quantity: item.quantity,
            basePrice: finalMealPrice,
            size: item.selectedSize || item.size,
            addOns,
          };
        })
      );

      // Calculate all order totals from scratch using branch-specific prices and taxes
      const orderCalculation = await calculateOrderTotals(
        cartItems,
        orderData.branchId,
        deliveryFeeForCalculationPayPal,
        orderType as "DELIVERY" | "PICKUP"
      );

      // Validate minimum order amount for scheduled orders (skip when merging)
      if (scheduledDatePayPal && isScheduledOrderPayPal && !mergeWithOrderId) {
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

      // Get user information for guest fields
      const user = await db.getPrisma().user.findUnique({
        where: { id: req.user?.id || "" },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });

      // Create order in database
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      const replacesOrderId = (orderData as any)?.replacesOrderId as string | undefined;

      const replacedOrder = replacesOrderId
        ? await db.getPrisma().order.findUnique({
            where: { id: replacesOrderId },
            select: { id: true, postedAt: true, businessDaySessionId: true },
          })
        : null;

      const appliedVoucherCode = orderData?.appliedVoucherCode;
      let voucherDeduction = 0;
      let voucher = null;
      if (appliedVoucherCode && typeof appliedVoucherCode === "string" && appliedVoucherCode.trim().length > 0) {
        const code = appliedVoucherCode.trim();
        voucher = await db.getPrisma().voucher.findUnique({
          where: { voucherCode: code },
        });
        if (voucher && voucher.status !== "REDEEMED" && Number(voucher.currentAmount) > 0 && voucher.status !== "VOIDED" && new Date(voucher.expiresAt) >= new Date()) {
          const { calculateVoucherDeduction } = await import("../utils/voucherHelper");
          voucherDeduction = calculateVoucherDeduction(voucher, orderCalculation);
        }
      }

      const openSession = await this.businessDayService.getOrCreateOpenSession(
        orderData.branchId
      );
      const order = await db.getPrisma().$transaction(async (tx: any) => {
        const createdOrder = await tx.order.create({
        data: ({
          orderType: orderType as any,
          orderNumber,
          userId: req.user?.id || null,
          branchId: orderData.branchId,
          businessDaySessionId: replacedOrder?.businessDaySessionId || openSession?.id,
          postedAt: replacedOrder?.postedAt || new Date(),
          isMerged: !!mergeWithOrderId,
          mergedAt: mergeWithOrderId ? new Date() : null,
          totalAmount: orderCalculation.finalTotal,
          currency: "USD",
          deliveryFee: orderCalculation.deliveryFee,
          takeawayServiceFee: orderType === "PICKUP" ? orderCalculation.takeawayServiceFee : null,
          taxAmount: orderCalculation.totalTaxAmount,
          itemTaxAmount: orderCalculation.itemTaxAmount,
          addonTaxAmount: orderCalculation.addonTaxAmount,
          deliveryTaxAmount: orderCalculation.deliveryTaxAmount,
          deliveryDistanceKm:
            orderType === "PICKUP"
              ? null
              : ((orderData as any)?.deliveryDistanceKm !== null &&
                  (orderData as any)?.deliveryDistanceKm !== undefined
                  ? Number((orderData as any).deliveryDistanceKm)
                  : null),
          status: initialOrderStatus,
          confirmedAt: initialOrderStatus === "CONFIRMED" ? new Date() : null,
          preparationTime: initialOrderStatus === "CONFIRMED" ? defaultPreparationTimePayPal : null,
          paymentIntentId: captureResult.id,
          paymentStatus: "PAID",
          paymentMethod: "ONLINE_PAYMENT",
          voucherPaymentAmount: voucherDeduction,
          voucherCodes: appliedVoucherCode ? [appliedVoucherCode] : [],
          ...(replacesOrderId ? ({ replacesOrderId } as any) : {}),
          deliveryAddress:
            orderType === "PICKUP" ? null : orderData.deliveryAddress,
          deliveryStreetAddress:
            orderType === "PICKUP" ? null : (orderData as any)?.deliveryStreetAddress || null,
          deliveryHouseNumber:
            orderType === "PICKUP" ? null : (orderData as any)?.deliveryHouseNumber || null,
          deliveryPostalCode:
            orderType === "PICKUP" ? null : (orderData as any)?.deliveryPostalCode || null,
          deliveryBuilding:
            orderType === "PICKUP" ? null : orderData.deliveryBuilding || null,
          deliveryFloor:
            orderType === "PICKUP" ? null : orderData.deliveryFloor || null,
          deliveryApartment:
            orderType === "PICKUP" ? null : orderData.deliveryApartment || null,
          deliveryExtraDetails:
            orderType === "PICKUP" ? null : orderData.deliveryExtraDetails || null,
          deliveryPhone: orderType === "PICKUP" ? null : orderData.deliveryPhone,
          deliveryNotes:
            orderType === "PICKUP" ? null : orderData.deliveryNotes || null,
          pickupPhone: orderType === "PICKUP" ? orderData.pickupPhone || null : null,
          pickupNotes:
            orderType === "PICKUP" ? orderData.pickupNotes || null : null,
          guestName:
            orderData.guestName ||
            (user ? `${user.firstName} ${user.lastName}` : null),
          guestEmail: orderData.guestEmail || user?.email || null,
          guestPhone: orderData.guestPhone || user?.phone || null,
          scheduledDate: scheduledDatePayPal,
          isScheduledOrder: isScheduledOrderPayPal,
          orderItems: {
            create: await Promise.all(
              formattedCartItems.map(async (item: any) => {
                // Handle DEAL items for PayPal
                if (item?.dealId || item?.itemType === "DEAL") {
                  const prismaAny = db.getPrisma() as any;
                  const dealId = String(item.dealId);
                  const dealQty = Number(item.quantity || 1);
                  const deal = await prismaAny.deal.findUnique({
                    where: { id: dealId },
                    include: {
                      components: {
                        include: {
                          branchPrices: orderData.branchId
                            ? {
                                where: { branchId: orderData.branchId as string },
                                select: { price: true, taxPercentage: true },
                              }
                            : false,
                        },
                        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
                      const addonBasePrice = await getAddonBasePrice(addOn.id, orderData.branchId);
                      const addOnQuantity = addOn.quantity || 1;
                      return addonBasePrice * addOnQuantity;
                    })
                  );
                  const totalAddonsPrice = addonsTotal.reduce((sum, price) => sum + price, 0);

                  // Get settings to check taxInclusive
                  const settingsForDeal = await db.getPrisma().settings.findFirst();
                  const taxInclusiveDeal = settingsForDeal?.taxInclusive || false;

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

                    const taxPerUnit = taxInclusiveDeal
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
                    item.mealId,
                    item.size,
                    orderData.branchId
                  );
                
                // Get branch-specific meal base price
                const mealBasePrice = await getMealBasePrice(
                  item.mealId,
                  orderData.branchId
                );

                // Get meal size type from size name and calculate final meal price
                let mealSizeType: "S" | "M" | "L" | "XL" | null = null;
                let finalMealPrice = mealBasePrice;
                
                if (item.size) {
                  const meal = await db.getPrisma().meal.findUnique({
                    where: { id: item.mealId },
                    include: { mealSizes: true },
                  });
                  if (meal) {
                    const mealSize = meal.mealSizes.find(
                      (s) => s.name === item.size
                    );
                    if (mealSize) {
                      mealSizeType = mealSize.sizeType as "S" | "M" | "L" | "XL";
                      // Size price is additional to base price
                      finalMealPrice = mealBasePrice + Number(mealSize.price || 0);
                    }
                  }
                }
                // Default to M if no size selected
                if (!mealSizeType) {
                  mealSizeType = "M";
                }

                // Get branch-specific addon prices
                const addonsData = await Promise.all(
                  (item.addOns || []).map(async (addOn: any) => {
                    const addonBasePrice = await getAddonBasePrice(addOn.id, orderData.branchId);
                    const addOnQuantity = addOn.quantity || 1;
                    return {
                      id: addOn.id,
                      price: addonBasePrice,
                      quantity: addOnQuantity,
                      type: addOn.addon_type || "OPTIONAL",
                    };
                  })
                );
                
                const addonsTotal = addonsData.reduce(
                  (sum: number, addOn: any) => {
                    return sum + addOn.price * addOn.quantity;
                  },
                  0
                );

                const totalPrice = (finalMealPrice + addonsTotal) * item.quantity;

                // Get settings to check taxInclusive
                const settings = await db.getPrisma().settings.findFirst();
                const taxInclusive = settings?.taxInclusive || false;

                let taxPerUnit = 0;
                if (taxInclusive) {
                  taxPerUnit =
                    (finalMealPrice * taxPercentage) / (100 + taxPercentage);
                } else {
                  taxPerUnit = (finalMealPrice * taxPercentage) / 100;
                }
                const taxAmount = taxPerUnit * item.quantity;

                return {
                  mealId: item.mealId,
                  quantity: item.quantity,
                  unitPrice: finalMealPrice,
                  totalPrice,
                  taxAmount: Math.round(taxAmount * 100) / 100,
                  taxPercentage: taxPercentage,
                  selectedSize: item.size,
                  mealSizeType,
                  specialInstructions: null,
                };
              })
            ),
          },
        }) as any,
      });

      if (appliedVoucherCode && voucherDeduction > 0) {
        try {
          const { processVoucherRedemption } = await import("../utils/voucherHelper");
          const redemptionResult = await processVoucherRedemption({
            tx,
            voucherCode: appliedVoucherCode,
            orderCalculation,
            orderId: createdOrder.id,
          });
          // Store remaining balance snapshot
          console.log('[PaymentController] Storing voucherRemainingBalances (PayPal):', {
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
        } catch (voucherErr: any) {
          console.error("[VOUCHER] Redemption failed for PayPal order", createdOrder.id, voucherErr);
          try {
            const oldHistory = (createdOrder as any).history || [];
            const updatedHistory = [
              ...oldHistory,
              {
                type: "VOUCHER_REDEMPTION_FAILED",
                action: "Voucher redemption failed",
                userId: req.user?.id || "SYSTEM",
                details: { error: voucherErr?.message || String(voucherErr), voucherCode: appliedVoucherCode },
                timestamp: new Date().toISOString(),
              }
            ];
            await tx.order.update({
              where: { id: createdOrder.id },
              data: { history: updatedHistory },
            });
          } catch (hErr) {
            console.error("Failed to append history block for PayPal voucher failure", hErr);
          }
        }
      }

      return createdOrder;
    });

      if (replacedOrder?.id) {
        try {
          await db.getPrisma().order.update({
            where: { id: replacedOrder.id },
            data: { status: "CANCELLED" },
          });
        } catch {
          // ignore replacement cleanup failures
        }
      }

      const orderWithIncludes = await db.getPrisma().order.findUnique({
        where: { id: order.id },
        include: {
          user: true,
          orderItems: {
            include: {
              meal: true,
            },
          },
          branch: true,
        },
      });

      // Expand deal items into DEAL_COMPONENT child order items (PayPal)
      const dealCartEntriesPayPal = formattedCartItems
        .map((it: any, idx: number) => ({ it, idx }))
        .filter(({ it }: any) => it?.dealId || it?.itemType === "DEAL");
      if (dealCartEntriesPayPal.length > 0) {
        const prismaAny = db.getPrisma() as any;
        const dealIdsToFetch = Array.from(
          new Set(dealCartEntriesPayPal.map(({ it }: any) => it.dealId).filter(Boolean))
        );
        const deals = await prismaAny.deal.findMany({
          where: { id: { in: dealIdsToFetch } },
          include: {
            components: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: {
                branchPrices: orderData.branchId
                  ? {
                      where: { branchId: orderData.branchId as string },
                      select: { id: true, branchId: true, price: true, taxPercentage: true },
                    }
                  : false,
              },
            },
          },
        });
        const dealById = new Map<string, any>(deals.map((d: any) => [d.id, d]));

        // Get settings to check taxInclusive
        const settingsForDealExpansion = await db.getPrisma().settings.findFirst();
        const taxInclusiveForDealExpansion = settingsForDealExpansion?.taxInclusive || false;

        for (const { it, idx } of dealCartEntriesPayPal) {
          const parentOrderItem = (order as any)?.orderItems?.[idx];
          if (!parentOrderItem?.id) continue;
          const deal = dealById.get(it.dealId);
          if (!deal) continue;
          const dealQty = Number(it.quantity || 1);
          const childCreates: any[] = [];
          for (const c of deal.components || []) {
            const override =
              Array.isArray(c.branchPrices) && c.branchPrices.length > 0
                ? c.branchPrices[0]
                : null;
            const unitPrice = override ? Number(override.price) : Number(c.price);
            const taxPct =
              override && override.taxPercentage !== null && override.taxPercentage !== undefined
                ? Number(override.taxPercentage)
                : Number(c.taxPercentage);
            const compQty = c.quantity !== undefined && c.quantity !== null ? Number(c.quantity) : 1;
            const finalCompQty = Number.isFinite(compQty) && compQty > 0 ? compQty : 1;
            const lineQty = finalCompQty * dealQty;
            const taxPerUnit = taxInclusiveForDealExpansion
              ? (unitPrice * taxPct) / (100 + taxPct)
              : (unitPrice * taxPct) / 100;
            const taxAmount = taxPerUnit * lineQty;
            childCreates.push({
              orderId: (order as any).id,
              itemType: "DEAL_COMPONENT",
              dealId: it.dealId,
              dealComponentId: c.id,
              parentDealItemId: parentOrderItem.id,
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

      // Create add-ons for each order item with tax information
      for (let i = 0; i < formattedCartItems.length; i++) {
        const item = formattedCartItems[i];
        if (item.addOns && item.addOns.length > 0) {
          // Use index-based matching since orderItems are created in the same order as formattedCartItems
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
                  
                  // Get branch-specific base price
                  const branchBasePrice = await getAddonBasePrice(addOn.id, orderData.branchId);
                  let addonPrice = branchBasePrice; // Start with branch-specific base price

                  if (addonData && addonData.addonSizes.length > 0) {
                    const availableSizes = addonData.addonSizes.map(
                      (s) => s.sizeType
                    ) as Array<"S" | "M" | "L" | "XL">;
                    
                    // First, check if sizeType is provided in the cart item
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
                        const originalBasePrice = addonData.price !== null ? Number(addonData.price) : 0;
                        
                        // If branch-specific base price exists, adjust the size price
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
                    addonSizeType = "M";
                  }

                  const addonTaxPercentage =
                    await taxCalculator.getAddonTaxPercentage(
                      addOn.id,
                      orderData.branchId
                    );
                  
                  const addonQuantityPerItem = addOn.quantity || 1;
                  const itemQuantity = item.quantity;
                  const totalAddonQuantity = addonQuantityPerItem * itemQuantity;

                  // Get settings to check taxInclusive
                  const settings = await db.getPrisma().settings.findFirst();
                  const taxInclusive = settings?.taxInclusive || false;

                  let addonTaxAmount = 0;
                  const taxPerAddon = taxInclusive
                    ? (addonPrice * addonTaxPercentage) / (100 + addonTaxPercentage)
                    : (addonPrice * addonTaxPercentage) / 100;
                  addonTaxAmount = taxPerAddon * addonQuantityPerItem * itemQuantity;

                  return {
                    orderItemId: orderItem.id,
                    addon_id: addonData ? addOn.id : null, // Only set addon_id if addon exists in DB
                    addOnName: addOn.name || addonData?.name || "Addon",
                    addOnPrice: addonPrice,
                    taxAmount: Math.round(addonTaxAmount * 100) / 100,
                    taxPercentage: addonTaxPercentage,
                    addon_type: addOn.addon_type || addOn.type || "OPTIONAL",
                    addonSizeType,
                    quantity: totalAddonQuantity,
                    addon_description: addonData?.description || null,
                  };
                })
              ),
            });
          }
        }
      }

      // Handle merge order if needed
      if (mergeWithOrderId) {
        const existingOrder = await db.getPrisma().order.findUnique({
          where: { id: mergeWithOrderId },
        });

        if (existingOrder) {
          await db.getPrisma().order.update({
            where: { id: mergeWithOrderId },
            data: {
              status: "CANCELLED",
            },
          });
        }
      }

      // Create or link Payment record (PayPal)
      const paymentService = PaymentService.getInstance();
      const providerChargeId =
        (captureResult as any)?.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
        (captureResult as any)?.id ||
        orderId ||
        null;

      let paymentRecord = await paymentService.getPaymentByProviderId(orderId);
      if (!paymentRecord) {
        paymentRecord = await paymentService.createPayment({
          orderId: order.id,
          paymentMethod: PaymentMethod.ONLINE_PAYMENT,
          paymentProvider: PaymentProvider.PAYPAL,
          providerPaymentId: orderId,
          providerChargeId,
          amount: orderCalculation.finalTotal,
          currency: "USD",
          status: PaymentState.COMPLETED,
          metadata: (captureResult as unknown as Prisma.InputJsonValue) || undefined,
        });
      } else if (!paymentRecord.orderId) {
        await paymentService.linkPaymentToOrder(paymentRecord.id, order.id);
      }

      // Send WebSocket notification
      try {
        // Create notification for new order
        const notification = await db.getPrisma().notification.create({
          data: {
            type: "ORDER",
            orderId: order.id,
            isSeen: false,
            isOrderUpdate: false,
          },
        });

        WebSocketService.getInstance().emitNewOrder(notification, order);
      } catch (wsError) {
        console.error("WebSocket notification error:", wsError);
      }

      // Send tablet notification for new order (only if not merging)
      if (!mergeWithOrderId) {
        await tabletOrderNotificationService.notifyOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          branchId: order.branchId,
          organizationId: orderData.branchId ? (await db.getPrisma().branch.findUnique({ where: { id: orderData.branchId }, select: { organizationId: true } }))?.organizationId || "" : "",
          status: order.status,
          totalAmount: Number(order.totalAmount),
          orderType: orderData.orderType,
          customerName: orderData.customerName,
        });
      }

      res.json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentIntentId: captureResult.id,
        },
      });
    } catch (error: any) {
      console.error("ERROR: Failed to capture PayPal order:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Failed to capture PayPal order",
      });
    }
  };

  // PayPal: Webhook handler
  public handlePayPalWebhook = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const webhookEvent = req.body;

      // Handle different webhook event types
      if (webhookEvent.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        // noop: main flow already handles capture; keep for future reconciliation
      } else if (
        webhookEvent.event_type === "PAYMENT.CAPTURE.REFUNDED" ||
        webhookEvent.event_type === "PAYMENT.CAPTURE.REFUND.COMPLETED" ||
        webhookEvent.event_type === "PAYMENT.CAPTURE.REFUND.DENIED"
      ) {
        const refundResource = webhookEvent.resource || {};
        const captureId =
          refundResource.capture_id ||
          refundResource.id ||
          refundResource.supplementary_data?.related_ids?.capture_id;
        const refundId = refundResource.id || refundResource.refund_id;

        if (!captureId) {
          console.error("PayPal webhook missing capture ID");
          res.status(400).json({ error: "Missing capture ID" });
          return;
        }

        const prisma = DatabaseSingleton.getInstance().getPrisma();
        const payment = await prisma.payment.findFirst({
          where: { providerChargeId: captureId },
          include: {
            order: { include: { refunds: true } },
            reservationOrder: { include: { refunds: true } },
          },
        });

        const refundAmountRaw =
          refundResource.amount?.value ||
          refundResource.seller_payable_breakdown?.gross_amount?.value ||
          "0";
        const refundAmount = parseFloat(refundAmountRaw) || 0;

        const refundStatus = (() => {
          const status = (refundResource.status || "").toUpperCase();
          if (status === "COMPLETED" || status === "SUCCEEDED") return "SUCCEEDED";
          if (status === "PENDING") return "PENDING";
          if (status === "DENIED" || status === "FAILED") return "FAILED";
          if (status === "CANCELLED" || status === "CANCELED") return "CANCELED";
          return "PENDING";
        })();

        if (payment) {
          const targetOrder = payment.order || payment.reservationOrder;
          if (targetOrder) {
            // Upsert refund record
            await prisma.refund.upsert({
              where: { paypalRefundId: refundId || captureId },
              update: {
                status: refundStatus as any,
                refundedAt:
                  refundStatus === "SUCCEEDED" ? new Date() : null,
              },
              create: {
                orderId: payment.orderId,
                reservationOrderId: payment.reservationOrderId,
                refundType: "PARTIAL",
                amount: refundAmount,
                reason: "paypal_webhook",
                paypalRefundId: refundId || captureId,
                status: refundStatus as any,
                refundedBy: "paypal_webhook",
                refundedAt:
                  refundStatus === "SUCCEEDED" ? new Date() : null,
                paymentId: payment.id,
              },
            });

            // Recalculate total refunded
            const existingRefunds = targetOrder.refunds || [];
            const alreadyRefunded = existingRefunds.reduce((sum: number, r: any) => {
              return sum + parseFloat(r.amount.toString());
            }, 0);
            const totalRefunded = alreadyRefunded + refundAmount;
            const orderTotal = parseFloat(targetOrder.totalAmount.toString());

            const paymentStatus: PaymentStatus =
              totalRefunded >= orderTotal
                ? PaymentStatus.REFUNDED
                : PaymentStatus.PARTIALLY_REFUNDED;

            if (payment.orderId) {
              await prisma.order.update({
                where: { id: payment.orderId },
                data: { paymentStatus },
              });
            } else if (payment.reservationOrderId) {
              await prisma.reservationOrder.update({
                where: { id: payment.reservationOrderId },
                data: { paymentStatus },
              });
            }

            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status:
                  paymentStatus === PaymentStatus.REFUNDED
                    ? PaymentState.REFUNDED
                    : PaymentState.PARTIALLY_REFUNDED,
                refundedAt:
                  refundStatus === "SUCCEEDED" ? new Date() : payment.refundedAt,
              },
            });
          }
        } else {
          console.warn("PayPal refund webhook: payment not found for capture", captureId);
        }
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("ERROR: Failed to handle PayPal webhook:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: "Failed to handle webhook",
      });
    }
  };
}
