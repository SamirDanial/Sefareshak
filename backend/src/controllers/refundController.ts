import { Response } from "express";
import {
  AuthenticatedRequest,
  CreateRefundRequest,
  RefundResponse,
} from "../types";
import DatabaseSingleton from "../config/database";
import Stripe from "stripe";
import PaymentService from "../services/paymentService";
import PayPalRefundService from "../services/paypalRefundService";
import { FiskalyService } from "../services/fiskalyService";
import { type OrganizationContextRequest } from "../middleware/organizationContext";
import {
  PaymentProvider,
  PaymentState,
  PaymentStatus,
  PaymentMethod,
} from "@prisma/client";
import { getFiskalyConfigSnapshot, shouldFiscalize } from "../utils/fiscalization";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export class RefundController {
  private db = DatabaseSingleton.getInstance();

  private getPaymentSources(order: any):
    | { provider: "STRIPE"; paymentIntentId: string; amount?: number }[]
    | { provider: "PAYPAL"; captureId: string; currency?: string; amount?: number }[]
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
            currency: h.details.currency ? String(h.details.currency) : undefined,
            amount:
              h.details.amount !== undefined && h.details.amount !== null
                ? Number(h.details.amount)
                : undefined,
          });
        }
      }
    }

    const currentProvider = String(order?.payment?.paymentProvider || "STRIPE").toUpperCase();
    if (currentProvider === "STRIPE" && order.paymentIntentId) {
      sources.push({
        provider: "STRIPE",
        paymentIntentId: String(order.paymentIntentId),
        amount: order.payment?.amount !== undefined && order.payment?.amount !== null
          ? Number(order.payment.amount)
          : undefined,
      });
    }
    if (currentProvider === "PAYPAL" && order.payment?.providerChargeId) {
      sources.push({
        provider: "PAYPAL",
        captureId: String(order.payment.providerChargeId),
        currency: order.currency ? String(order.currency) : undefined,
        amount: order.payment?.amount !== undefined && order.payment?.amount !== null
          ? Number(order.payment.amount)
          : undefined,
      });
    }

    const seen = new Set<string>();
    const unique = sources.filter((s) => {
      const key = s.provider === "STRIPE" ? `S:${s.paymentIntentId}` : `P:${s.captureId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique;
  }

  // Create a refund (full, partial, or item-specific)
  public createRefund = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { orderId, reservationOrderId, refundType, amount, items, reason } =
        req.body as CreateRefundRequest;
      const refundedBy = req.user?.id || "admin";

      // Validate input
      if ((!orderId && !reservationOrderId) || !refundType) {
        res.status(400).json({
          success: false,
          error: "Order or reservation order ID and refund type are required",
        });
        return;
      }

      const prisma = this.db.getPrisma();

      let shouldCreateCorrection = false;
      let organizationIdForFiskaly = "";
      let branchIdForFiskaly = "";
      let originalFiscalTx: { id: string; status: string } | null = null;
      let fiskalyEnvironmentForCorrection: string | null = null;

      const isReservationRefund = Boolean(reservationOrderId);

      // Get the target order (regular or reservation)
      const order = isReservationRefund
        ? await prisma.reservationOrder.findUnique({
            where: { id: reservationOrderId! },
            include: {
              branch: { select: { id: true, organizationId: true } },
              items: true,
              refunds: true,
              payment: true,
              fiscalTransaction: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          })
        : await prisma.order.findUnique({
            where: { id: orderId! },
            include: {
              branch: { select: { id: true, organizationId: true } },
              orderItems: {
                include: {
                  meal: true,
                  orderItemAddOns: true,
                },
              },
              refunds: true,
              payment: true,
              fiscalTransaction: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          });

      if (!order) {
        res.status(404).json({
          success: false,
          error: isReservationRefund
            ? "Reservation order not found"
            : "Order not found",
        });
        return;
      }

      // Fiskaly correction handling:
      // If the order/reservation was already fiscalized (FINISHED fiscalTransaction), then any refund must
      // also be fiscalized as a correction transaction.
      branchIdForFiskaly = String((order as any)?.branchId || (order as any)?.branch?.id || "").trim();
      organizationIdForFiskaly = String((order as any)?.branch?.organizationId || "").trim();
      originalFiscalTx = ((order as any)?.fiscalTransaction as any) || null;
      const isAlreadyFiscalized = String(originalFiscalTx?.status || "").toUpperCase() === "FINISHED";

      const fiskalyConfig = organizationIdForFiskaly
        ? await getFiskalyConfigSnapshot(prisma as any, organizationIdForFiskaly)
        : null;
      fiskalyEnvironmentForCorrection = fiskalyConfig?.environment ? String(fiskalyConfig.environment) : null;

      shouldCreateCorrection =
        Boolean(branchIdForFiskaly && organizationIdForFiskaly) &&
        shouldFiscalize(fiskalyConfig) &&
        isAlreadyFiscalized &&
        Boolean(originalFiscalTx?.id);

      // In LIVE mode, require an active/provisioned POS device header for correction fiscalization.
      if (shouldCreateCorrection && String(fiskalyConfig?.environment || "").toUpperCase() === "LIVE") {
        const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
        const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

        if (!headerDeviceId) {
          res.status(403).json({
            success: false,
            error: "POS device selection is required.",
            code: "POS_DEVICE_REQUIRED" as const,
          });
          return;
        }

        const device = await (prisma as any).posDevice.findFirst({
          where: {
            id: headerDeviceId,
            organizationId: organizationIdForFiskaly,
            branchId: branchIdForFiskaly,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true, fiskalyClientId: true },
        });

        if (!device?.id) {
          res.status(403).json({
            success: false,
            error: "Selected POS device is not available for this branch.",
            code: "POS_DEVICE_REQUIRED" as const,
          });
          return;
        }

        const fiskalyClientId = String((device as any)?.fiskalyClientId || "").trim();
        if (!fiskalyClientId) {
          res.status(409).json({
            success: false,
            error:
              "This tablet is not connected to a Fiskaly POS device yet. Please provision/select a Fiskaly device for this tablet and try again.",
            code: "FISKALY_POS_DEVICE_NOT_PROVISIONED" as const,
          });
          return;
        }
      }

      // If regular order belongs to a closed business day, block direct refunds.
      if (!isReservationRefund) {
        const sessionId = (order as any)?.businessDaySessionId as string | undefined;
        if (sessionId) {
          const session = await (prisma as any).businessDaySession.findUnique({
            where: { id: sessionId },
            select: { status: true },
          });
          if (session?.status === "CLOSED") {
            res.status(400).json({
              success: false,
              error:
                "This order belongs to a closed business day and cannot be refunded directly. Create an adjustment instead.",
              code: "BUSINESS_DAY_CLOSED",
            });
            return;
          }
        }
      }

      // Validate order eligibility for refund
      if (
        order.paymentStatus !== PaymentStatus.PAID &&
        order.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        res.status(400).json({
          success: false,
          error: "Order must be paid to process refund",
        });
        return;
      }

      // Reject item-specific refunds for reservation orders (not supported yet)
      if (isReservationRefund && refundType === "ITEM_SPECIFIC") {
        res.status(400).json({
          success: false,
          error: "Item-specific refunds are not supported for reservations",
        });
        return;
      }

      // Calculate refund amount based on type
      let refundAmount = 0;
      let calculatedItems: Array<{
        orderItemId: string;
        refundAmount: number;
        refundedQuantity?: number;
        reason?: string;
        addons?: Array<{
          addonId: string;
          addOnName: string;
          addOnPrice: number;
          quantity: number;
          refundedQuantity: number;
          taxAmount: number;
        }>;
      }> = [];

      switch (refundType) {
        case "FULL":
          refundAmount = parseFloat(order.totalAmount.toString());
          break;

        case "PARTIAL":
          if (!amount || amount <= 0) {
            res.status(400).json({
              success: false,
              error: "Amount is required for partial refund",
            });
            return;
          }
          refundAmount = amount;
          break;

        case "ITEM_SPECIFIC":
          if (!items || items.length === 0) {
            res.status(400).json({
              success: false,
              error: "Items are required for item-specific refund",
            });
            return;
          }

          // Validate and calculate item refunds
          for (const item of items) {
            const orderItem = (order as any).orderItems.find(
              (oi: any) => oi.id === item.orderItemId
            );
            if (!orderItem) {
              res.status(400).json({
                success: false,
                error: `Order item ${item.orderItemId} not found`,
              });
              return;
            }

            const totalQuantity = Number(orderItem.quantity) || 1;
            const refundedQuantity = Number(item.refundedQuantity ?? totalQuantity);

            if (refundedQuantity > totalQuantity) {
              res.status(400).json({
                success: false,
                error: `Refund quantity for item ${orderItem.meal.name} cannot exceed total quantity (${totalQuantity})`,
              });
              return;
            }

            // Use totalPrice (post-item-discount line total) instead of unitPrice (base price)
            // to ensure refunds reflect what the customer actually paid per unit.
            const totalItemPrice = parseFloat(orderItem.totalPrice.toString());
            const effectiveUnitPrice = totalItemPrice / totalQuantity;

            // Apply order-level discount ratio proportionally across items
            const orderDiscountAmount = parseFloat((order as any).discountAmount?.toString() || "0");
            const orderSubtotal = ((order as any).orderItems as any[])
              .reduce((s: number, oi: any) => s + parseFloat(oi.totalPrice.toString()), 0);
            const discountRatio = orderSubtotal > 0 ? orderDiscountAmount / orderSubtotal : 0;
            const discountedUnitPrice = effectiveUnitPrice * (1 - discountRatio);

            // Build addon metadata for display/tracking only.
            // Do NOT add addon costs to the refund amount — they are already included
            // in orderItem.totalPrice which is what effectiveUnitPrice is derived from.
            const orderItemAddOns = (orderItem as any).orderItemAddOns || [];
            const refundedAddons: any[] = [];

            for (const addon of orderItemAddOns) {
              const addonPrice = parseFloat(addon.addOnPrice.toString());
              const addonQuantity = addon.quantity || 1;
              refundedAddons.push({
                addonId: addon.id,
                addOnName: addon.addOnName,
                addOnPrice: addonPrice,
                quantity: addonQuantity,
                refundedQuantity: Math.ceil((addonQuantity * refundedQuantity) / totalQuantity),
                taxAmount: addon.taxAmount ? parseFloat(addon.taxAmount.toString()) : 0,
              });
            }

            const maxRefundAmount = discountedUnitPrice * totalQuantity;

            // Calculate refund amount based on quantity (addons already in discountedUnitPrice)
            const itemRefundAmount = item.refundAmount ?? (discountedUnitPrice * refundedQuantity);

            if (itemRefundAmount > maxRefundAmount) {
              res.status(400).json({
                success: false,
                error: `Refund amount for item ${orderItem.meal.name} cannot exceed ${maxRefundAmount}`,
              });
              return;
            }

            refundAmount += itemRefundAmount;
            calculatedItems.push({
              orderItemId: item.orderItemId,
              refundAmount: itemRefundAmount,
              refundedQuantity,
              reason: item.reason,
              addons: refundedAddons,
            });
          }
          break;
      }

      // Validate refund amount
      const pendingRefundTotal = order.refunds
        .filter((refund: any) => refund.status === "PENDING")
        .reduce((sum: number, refund: any) => sum + parseFloat(refund.amount.toString()), 0);

      if (pendingRefundTotal > 0) {
        res.status(400).json({
          success: false,
          error: `A refund is already pending for this order (${pendingRefundTotal}). Please wait for it to complete before creating another refund.`,
        });
        return;
      }

      const totalRefunded = order.refunds
        .filter((refund: any) => refund.status === "SUCCEEDED")
        .reduce((sum: number, refund: any) => sum + parseFloat(refund.amount.toString()), 0);

      const maxRefundable =
        parseFloat(order.totalAmount.toString()) - totalRefunded;
      if (refundAmount > maxRefundable) {
        res.status(400).json({
          success: false,
          error: `Refund amount cannot exceed ${maxRefundable}. Already refunded: ${totalRefunded}`,
        });
        return;
      }

      // Process refund based on provider
      let stripeRefundId: string | null = null;
      let paypalRefundId: string | null = null;
      let refundStatus: "SUCCEEDED" | "PENDING" | "FAILED" | "CANCELED" =
        "PENDING";

      const paymentProvider =
        order.payment?.paymentProvider || PaymentProvider.STRIPE;
      const paymentMethod =
        order.paymentMethod || PaymentMethod.ONLINE_PAYMENT;

      // Manual refunds (cash/card-on-delivery) should still be recordable for accounting/tax.
      // In these cases, we do not call any payment provider API.
      if (paymentMethod !== PaymentMethod.ONLINE_PAYMENT) {
        refundStatus = "SUCCEEDED";
      } else {
        const paymentSources = this.getPaymentSources(order as any);
        const isStripe = paymentProvider === PaymentProvider.STRIPE;
        const isPayPal = paymentProvider === PaymentProvider.PAYPAL;

        if (isStripe) {
        const stripeSources = (paymentSources as any[]).filter((s) => s.provider === "STRIPE");
        if (stripeSources.length === 0) {
          res.status(400).json({
            success: false,
            error: "Missing payment intent for Stripe refund",
          });
          return;
        }

        try {
          let remainingCents = Math.round(refundAmount * 100);
          for (const s of stripeSources) {
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
                orderId: (orderId || reservationOrderId || "").toString(),
                refundType: refundType,
                refundedBy: refundedBy,
                type: isReservationRefund ? "reservation" : "order",
              },
            });

            stripeRefundId = stripeRefund.id;
            refundStatus = stripeRefund.status === "succeeded" ? "SUCCEEDED" : "PENDING";
            remainingCents -= centsToRefund;
          }
        } catch (stripeError) {
          console.error("Stripe refund error:", stripeError);
          res.status(500).json({
            success: false,
            error: "Failed to process Stripe refund",
          });
          return;
        }
        } else if (isPayPal) {
        const paypalSources = (paymentSources as any[]).filter((s) => s.provider === "PAYPAL");
        const currency = (order.currency || (order as any).currency || "USD").toString();
        if (paypalSources.length === 0) {
          res.status(400).json({
            success: false,
            error: "Missing PayPal capture ID for refund",
          });
          return;
        }

        try {
          let remaining = refundAmount;
          const refundService = PayPalRefundService.getInstance();
          for (const s of paypalSources) {
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
              currency: currency,
              reason: reason || "requested_by_customer",
              metadata: {
                invoiceId: String(order.orderNumber || (order as any).orderNumber || ""),
                customId: String(orderId || reservationOrderId || ""),
              },
            });

            paypalRefundId = (refundResult as any)?.id || null;
            const initialStatus = refundService.mapRefundStatus((refundResult as any)?.status);
            refundStatus = initialStatus;
            if (paypalRefundId && initialStatus === "PENDING") {
              try {
                const verified = await refundService.getRefund(paypalRefundId);
                refundStatus = refundService.mapRefundStatus((verified as any)?.status);
              } catch (verifyErr) {
                refundStatus = initialStatus;
              }
            }

            if (refundStatus === "FAILED" || refundStatus === "CANCELED") {
              res.status(500).json({
                success: false,
                error: "PayPal refund failed to process",
              });
              return;
            }

            remaining -= amountForThis;
          }
        } catch (paypalError) {
          console.error("PayPal refund error:", paypalError);
          res.status(500).json({
            success: false,
            error: "Failed to process PayPal refund",
          });
          return;
        }
        }
      }

      // Calculate mixed payment refund breakdown
      const voucherPaymentAmount = Number((order as any).voucherPaymentAmount || 0);
      const totalAmount = Number(order.totalAmount || 0);
      const refundRatio = totalAmount > 0 ? refundAmount / totalAmount : 0;
      const voucherRefundAmount = Math.round(voucherPaymentAmount * refundRatio * 100) / 100;
      const cashOnlineRefundAmount = Math.round((refundAmount - voucherRefundAmount) * 100) / 100;

      // Determine cash/online payment method
      const orderPaymentMethod = String(order.paymentMethod || "").toLowerCase();
      let cashOnlinePaymentMethod: string | null = null;
      if (orderPaymentMethod.includes("stripe")) cashOnlinePaymentMethod = "STRIPE";
      else if (orderPaymentMethod.includes("paypal")) cashOnlinePaymentMethod = "PAYPAL";
      else if (orderPaymentMethod.includes("cash") || orderPaymentMethod.includes("delivery")) cashOnlinePaymentMethod = "CASH";
      else if (orderPaymentMethod.includes("card")) cashOnlinePaymentMethod = "CARD";

      // Build metadata with mixed payment breakdown
      const baseMetadata: any = {};
      if (refundType === "ITEM_SPECIFIC" && calculatedItems.length > 0) {
        baseMetadata.items = calculatedItems;
      }

      // Add mixed payment breakdown if voucher was used
      if (voucherPaymentAmount > 0) {
        baseMetadata.voucherRefundAmount = voucherRefundAmount;
        baseMetadata.cashOnlineRefundAmount = cashOnlineRefundAmount;
        if (cashOnlinePaymentMethod) {
          baseMetadata.cashOnlinePaymentMethod = cashOnlinePaymentMethod;
        }
        console.log(`[REFUND METADATA] Mixed payment refund breakdown: voucher=${voucherRefundAmount}, cashOnline=${cashOnlineRefundAmount}, method=${cashOnlinePaymentMethod}`);
      }

      const refund = await prisma.refund.create({
        data: {
          orderId: orderId || null,
          reservationOrderId: reservationOrderId || null,
          refundType: refundType,
          amount: refundAmount,
          reason: reason || null,
          stripeRefundId: stripeRefundId,
          paypalRefundId: paypalRefundId,
          status: refundStatus as any,
          refundedBy: refundedBy,
          refundedAt:
            refundStatus === "SUCCEEDED" ? new Date() : null,
          paymentId: order.paymentId || null,
          metadata: Object.keys(baseMetadata).length > 0 ? baseMetadata : undefined,
        },
      });

      // Reactivate single-purpose vouchers upon successful refund
      if (refundStatus === "SUCCEEDED") {
        try {
          let voucherPaymentAmount = Number((order as any).voucherPaymentAmount || 0);
          let voucherCodes = (order as any).voucherCodes || [];
          const totalAmount = Number(order.totalAmount || 0);

          // If order doesn't have voucher info, try to extract from original fiscal transaction signature
          if (voucherPaymentAmount === 0 && (!voucherCodes || voucherCodes.length === 0)) {
            console.log(`[VOUCHER REACTIVATION] Order doesn't have voucher fields, checking original fiscal transaction`);
            const originalFiscalTx = await (prisma as any).fiscalTransaction.findFirst({
              where: {
                orderId: orderId || order.id,
                status: "FINISHED",
              },
              select: { signaturePayload: true },
            });

            if (originalFiscalTx?.signaturePayload) {
              const meta = originalFiscalTx.signaturePayload.meta || originalFiscalTx.signaturePayload;
              voucherPaymentAmount = Number(meta?.voucherPaymentAmount || meta?.voucher_payment_amount || 0);
              voucherCodes = meta?.voucherCodes || meta?.voucher_codes || [];
              console.log(`[VOUCHER REACTIVATION] Extracted from fiscal signature: voucherPaymentAmount=${voucherPaymentAmount}, voucherCodes=${JSON.stringify(voucherCodes)}`);
            }
          }

          if (voucherPaymentAmount > 0 && voucherCodes.length > 0) {
            // Check if any voucher is single-purpose
            const vouchers = await prisma.voucher.findMany({
              where: { voucherCode: { in: voucherCodes } },
              select: { voucherType: true, voucherCode: true, status: true, currentAmount: true },
            });

            const hasVoucherPayment = vouchers.length > 0;

            if (hasVoucherPayment) {
              const refundRatio = refundAmount / totalAmount;
              const voucherRefundAmount = Math.round(voucherPaymentAmount * refundRatio * 100) / 100;

              console.log(`[VOUCHER REACTIVATION] Processing refund with voucher payment amount: ${voucherPaymentAmount}, refund ratio: ${refundRatio}, voucher refund amount: ${voucherRefundAmount}`);

              // Reactivate vouchers for the refund portion
              for (const voucher of vouchers) {
                  // Check if voucher is expired
                  const voucherDetails = await prisma.voucher.findUnique({
                    where: { voucherCode: voucher.voucherCode },
                    select: { expiresAt: true, status: true, currentAmount: true },
                  });

                  if (voucherDetails && new Date(voucherDetails.expiresAt) < new Date()) {
                    console.log(`[VOUCHER REACTIVATION] Skipping reactivation for voucher ${voucher.voucherCode} - expired`);
                    continue;
                  }

                  // Continue with balance update even if already ACTIVE

                  try {
                    const currentBalance = Number(voucherDetails?.currentAmount || 0);
                    const newBalance = Math.round((currentBalance + voucherRefundAmount) * 100) / 100;

                    console.log(`[VOUCHER REACTIVATION] Processing voucher ${voucher.voucherCode} (type: ${voucher.voucherType}), current balance: ${currentBalance}, refund amount: ${voucherRefundAmount}, new balance: ${newBalance}`);

                    // Update voucher with both status and currentAmount
                    const updatedVoucher = await prisma.voucher.update({
                      where: { voucherCode: voucher.voucherCode },
                      data: {
                        status: "ACTIVE",
                        currentAmount: newBalance,
                      },
                    });

                    console.log(`[VOUCHER REACTIVATION] Updated voucher ${voucher.voucherCode} status to ACTIVE, balance from ${currentBalance} to ${newBalance}`);

                    // Create transaction ledger entry
                    await prisma.voucherTransaction.create({
                      data: {
                        voucherId: updatedVoucher.id,
                        txType: "ISSUANCE",
                        amount: voucherRefundAmount,
                        balanceBefore: currentBalance,
                        balanceAfter: newBalance,
                        orderId: orderId || order.id,
                      },
                    });

                    console.log(`[VOUCHER REACTIVATION] Created transaction ledger entry for voucher ${voucher.voucherCode} with amount ${voucherRefundAmount}`);
                  } catch (error: any) {
                    console.error(`[VOUCHER REACTIVATION] Failed to reactivate voucher ${voucher.voucherCode}:`, error);
                  }
              }
            }
          }
        } catch (voucherErr: any) {
          console.error("[VOUCHER REACTIVATION] Failed to reactivate voucher upon refund:", voucherErr);
          // Don't fail the refund if voucher reactivation fails
        }
      }

      // Update order payment status
      const succeededAmount =
        refundStatus === "SUCCEEDED" ? refundAmount : 0;
      const newTotalRefunded = totalRefunded + succeededAmount;
      const orderTotal = parseFloat(order.totalAmount.toString());

      let newPaymentStatus: PaymentStatus =
        order.paymentStatus as PaymentStatus;
      if (refundStatus === "SUCCEEDED") {
        if (newTotalRefunded >= orderTotal) {
          newPaymentStatus = PaymentStatus.REFUNDED;
        } else {
          newPaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
        }
      }

      // Update Payment table status if linked
      if (order.paymentId && refundStatus === "SUCCEEDED") {
        const paymentService = PaymentService.getInstance();
        await paymentService.updatePaymentStatus(
          order.paymentId,
          newPaymentStatus === "REFUNDED"
            ? PaymentState.REFUNDED
            : PaymentState.PARTIALLY_REFUNDED,
          {
            refundedAt: new Date(),
          }
        );
      }

      if (isReservationRefund) {
        await prisma.reservationOrder.update({
          where: { id: reservationOrderId! },
          data: {
            paymentStatus: newPaymentStatus,
          },
        });
      } else {
        // For Full Refunds or Item-Specific refunds where everything is refunded, update order status to CANCELLED
        const orderStatusUpdate =
          (refundType === "FULL" || refundType === "ITEM_SPECIFIC") && newPaymentStatus === PaymentStatus.REFUNDED
            ? { status: "CANCELLED" as const, paymentStatus: newPaymentStatus }
            : { paymentStatus: newPaymentStatus };

        await prisma.order.update({
          where: { id: orderId! },
          data: orderStatusUpdate,
        });
      }

      // Prepare response
      const refundResponse: RefundResponse = {
        id: refund.id,
        orderId: refund.orderId || undefined,
        reservationOrderId: refund.reservationOrderId || undefined,
        refundType: refund.refundType as any,
        amount: parseFloat(refund.amount.toString()),
        reason: refund.reason || undefined,
        stripeRefundId: refund.stripeRefundId || undefined,
        paypalRefundId: refund.paypalRefundId || undefined,
        status: refund.status as any,
        refundedBy: refund.refundedBy,
        refundedAt: refund.refundedAt || undefined,
        createdAt: refund.createdAt,
        items: ((refund as any).metadata as any)?.items || undefined,
      };

      let fiskalyCorrection: any = null;
      if (shouldCreateCorrection && originalFiscalTx?.id) {
        const rawDeviceId = (req as any)?.headers?.["x-pos-device-id"];
        const headerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : "";

        // Only create a correction once the refund exists (we want refundId in metadata), and only when
        // it wasn't cancelled/failed.
        if (refund.status !== "FAILED" && refund.status !== "CANCELED") {
          try {
            const fiskaly = FiskalyService.getInstance();
            const refundItems = ((refund as any).metadata as any)?.items || undefined;
            fiskalyCorrection = await fiskaly.fiscalizeCorrection({
              organizationId: organizationIdForFiskaly,
              branchId: branchIdForFiskaly,
              deviceId: headerDeviceId || null,
              orderId: isReservationRefund ? null : String(orderId || "") || null,
              reservationOrderId: isReservationRefund
                ? String(reservationOrderId || "") || null
                : null,
              originalFiscalTransactionId: String(originalFiscalTx.id),
              correctionType: refundType === "FULL" ? "CANCELLATION" : "REFUND",
              refundId: refund.id,
              amount: Number(refundAmount),
              currency: String(order.currency || (order as any).currency || "usd"),
              receiptNumber: `${String((order as any).orderNumber || "")}-R${String(refund.id).slice(0, 6)}`,
              meta: {
                refundType,
                reason: reason || null,
                refundedBy,
                paymentMethod: String((order as any)?.paymentMethod || "").trim() || null,
                voucherPaymentAmount: (order as any).voucherPaymentAmount || 0,
                voucherCodes: (order as any).voucherCodes || [],
              },
              refundItems,
            });
          } catch (e: any) {
            fiskalyCorrection = {
              ok: false,
              error:
                e?.fiskalyMessage ||
                e?.response?.data?.error ||
                e?.response?.data?.message ||
                e?.message ||
                "Fiskaly correction fiscalization failed",
              code: e?.code || e?.fiskalyCode || "FISKALY_CORRECTION_FAILED",
            };
          }
        }
      }

      res.status(201).json({
        success: true,
        data: {
          ...refundResponse,
          fiskalyCorrection,
        },
        message: "Refund processed successfully",
      });
    } catch (error) {
      console.error("Create refund error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process refund",
      });
    }
  };

  // Get refunds for an order
  public getOrderRefunds = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { orderId } = req.params;

      const refunds = await this.db.getPrisma().refund.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      });

      const refundResponses: RefundResponse[] = refunds.map((refund: any) => ({
        id: refund.id,
        orderId: refund.orderId,
        refundType: refund.refundType as any,
        amount: parseFloat(refund.amount.toString()),
        reason: refund.reason || undefined,
        stripeRefundId: refund.stripeRefundId || undefined,
        status: refund.status as any,
        refundedBy: refund.refundedBy,
        refundedAt: refund.refundedAt || undefined,
        createdAt: refund.createdAt,
        items: (refund.metadata as any)?.items || undefined,
      }));

      res.status(200).json({
        success: true,
        data: refundResponses,
      });
    } catch (error) {
      console.error("Get order refunds error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch refunds",
      });
    }
  };

  // Get all refunds (admin only)
  public getAllRefunds = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { page = 1, limit = 10, status, refundType } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const where: any = {};
      if (status) where.status = status;
      if (refundType) where.refundType = refundType;

      where.order = { branch: { organizationId } };

      const [refunds, total] = await Promise.all([
        this.db.getPrisma().refund.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            order: {
              include: {
                user: true,
              },
            },
          },
        }),
        this.db.getPrisma().refund.count({ where }),
      ]);

      const refundResponses: RefundResponse[] = refunds.map((refund: any) => ({
        id: refund.id,
        orderId: refund.orderId,
        refundType: refund.refundType as any,
        amount: parseFloat(refund.amount.toString()),
        reason: refund.reason || undefined,
        stripeRefundId: refund.stripeRefundId || undefined,
        status: refund.status as any,
        refundedBy: refund.refundedBy,
        refundedAt: refund.refundedAt || undefined,
        createdAt: refund.createdAt,
      }));

      res.status(200).json({
        success: true,
        data: refundResponses,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Get all refunds error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch refunds",
      });
    }
  };

  // Cancel a pending refund
  public cancelRefund = async (
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> => {
    try {
      const { refundId } = req.params;

      const organizationId = (req as any as OrganizationContextRequest).organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: "organizationId is required" });
        return;
      }

      const refund = await this.db.getPrisma().refund.findUnique({
        where: { id: refundId },
        include: { order: true },
      });

      if (!refund) {
        res.status(404).json({
          success: false,
          error: "Refund not found",
        });
        return;
      }

      const refundOrderId = (refund as any).orderId as string | null | undefined;
      if (!refundOrderId) {
        res.status(404).json({
          success: false,
          error: "Refund not found",
        });
        return;
      }

      const order = await this.db.getPrisma().order.findUnique({
        where: { id: refundOrderId },
        select: { id: true, branch: { select: { organizationId: true } } },
      });

      if (!order?.branch?.organizationId || order.branch.organizationId !== organizationId) {
        res.status(404).json({
          success: false,
          error: "Refund not found",
        });
        return;
      }

      if (refund.status !== "PENDING") {
        res.status(400).json({
          success: false,
          error: "Only pending refunds can be cancelled",
        });
        return;
      }

      // PayPal refunds cannot be cancelled once created
      if (refund.paypalRefundId) {
        res.status(400).json({
          success: false,
          error: "PayPal refunds cannot be cancelled once created; wait for final status",
        });
        return;
      }

      // Cancel Stripe refund if it exists
      if (refund.stripeRefundId) {
        try {
          await stripe.refunds.cancel(refund.stripeRefundId);
        } catch (stripeError) {
          console.error("Stripe refund cancellation error:", stripeError);
          // Continue with database update even if Stripe fails
        }
      }

      // Update refund status
      await this.db.getPrisma().refund.update({
        where: { id: refundId },
        data: {
          status: "CANCELED",
        },
      });

      res.status(200).json({
        success: true,
        message: "Refund cancelled successfully",
      });
    } catch (error) {
      console.error("Cancel refund error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel refund",
      });
    }
  };
}
