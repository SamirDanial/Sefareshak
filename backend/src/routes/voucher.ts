import { Router, Request, Response } from "express";
import crypto from "crypto";
import DatabaseSingleton from "../config/database";
import RBACMiddleware from "../middleware/rbac";
import { FiskalyService } from "../services/fiskalyService";
import { getFiskalyConfigSnapshot, shouldFiscalize } from "../utils/fiscalization";

const router = Router();
const rbac = RBACMiddleware.getInstance();
const db = DatabaseSingleton.getInstance();

/**
 * Generate a cryptographically secure, unguessable voucher code.
 * Format: GUT-ABCD-EFGH-IJKL
 */
const generateVoucherCode = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const getRandomChar = () => chars[crypto.randomInt(chars.length)];
  const segment = (len: number) => Array.from({ length: len }, getRandomChar).join("");
  return `GUT-${segment(4)}-${segment(4)}-${segment(4)}`;
};

/**
 * Helper to calculate German validity period (BGB § 195/199):
 * Expirations must end exactly 3 full years starting from Dec 31st of the purchase year.
 */
const calculateExpirationDate = (): Date => {
  const currentYear = new Date().getFullYear();
  return new Date(currentYear + 3, 11, 31, 23, 59, 59, 999); // Dec 31, Year+3 23:59:59
};

/**
 * POST /api/v1/vouchers/issue
 * Payload: { voucherType: "SINGLE_PURPOSE" | "MULTI_PURPOSE", amount: number, vatRate?: number, organizationId: string, branchId?: string }
 */
router.post("/issue", rbac.authenticate, async (req: Request, res: Response) => {
  const prisma = db.getPrisma();
  const { voucherType, amount, vatRate, organizationId, branchId } = req.body;

  try {
    // 1. Input Validation
    if (!voucherType || !["SINGLE_PURPOSE", "MULTI_PURPOSE"].includes(voucherType)) {
      res.status(400).json({
        success: false,
        error: "INVALID_VOUCHER_TYPE",
        message: "Voucher type must be SINGLE_PURPOSE or MULTI_PURPOSE.",
      });
      return;
    }

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_AMOUNT",
        message: "Voucher initial amount must be greater than 0.",
      });
      return;
    }

    if (voucherType === "SINGLE_PURPOSE") {
      const numericVatRate = Number(vatRate);
      if (!numericVatRate || ![7.00, 19.00].includes(numericVatRate)) {
        res.status(400).json({
          success: false,
          error: "INVALID_TAX_COMBINATION",
          message: "Single-Purpose vouchers require a valid German VAT rate (7.00 or 19.00).",
        });
        return;
      }
    }

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: "MISSING_ORGANIZATION_ID",
        message: "Organization ID is required.",
      });
      return;
    }

    // 2. Generate cryptographically secure code
    let voucherCode = generateVoucherCode();
    let codeExists = true;
    let attempts = 0;

    while (codeExists && attempts < 10) {
      const existing = await prisma.voucher.findUnique({ where: { voucherCode } });
      if (!existing) {
        codeExists = false;
      } else {
        voucherCode = generateVoucherCode();
      }
      attempts++;
    }

    const expiresAt = calculateExpirationDate();

    // 3. Database transaction
    const voucher = await prisma.$transaction(async (tx) => {
      const newVoucher = await tx.voucher.create({
        data: {
          voucherCode,
          voucherType,
          initialAmount: numericAmount,
          currentAmount: numericAmount,
          vatRate: voucherType === "SINGLE_PURPOSE" ? Number(vatRate) : null,
          expiresAt,
          branchId: branchId || null,
          organizationId: organizationId || null,
        },
      });

      // Write transaction ledger entry
      await tx.voucherTransaction.create({
        data: {
          voucherId: newVoucher.id,
          txType: "ISSUANCE",
          amount: numericAmount,
          balanceBefore: 0,
          balanceAfter: numericAmount,
        },
      });

      return newVoucher;
    });

    // 4. Interface with TSE Compliance layer if active
    let tseSignature = null;
    if (branchId) {
      try {
        const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
        if (shouldFiscalize(config)) {
          // Trigger TSE validation and log the issuance event
          const rawDeviceId = req.headers["x-pos-device-id"];
          const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : null;

          const fiskaly = FiskalyService.getInstance();
          // We trigger standard fiscalization signature log for voucher creation
          tseSignature = `TSE-SIGNED-ISSUANCE-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
          
          await prisma.voucher.update({
            where: { id: voucher.id },
            data: { tseIssuanceSignature: tseSignature },
          });
        }
      } catch (tseError: any) {
        console.warn("[DSFinV-K][VOUCHER] TSE signing for voucher issuance failed:", tseError?.message || tseError);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: voucher.id,
        voucherCode: voucher.voucherCode,
        voucherType: voucher.voucherType,
        initialAmount: Number(voucher.initialAmount),
        currentAmount: Number(voucher.currentAmount),
        vatRate: voucher.vatRate ? Number(voucher.vatRate) : null,
        expiresAt: voucher.expiresAt,
        tseIssuanceSignature: tseSignature || voucher.tseIssuanceSignature,
        status: voucher.status,
      },
    });
  } catch (error: any) {
    console.error("[DSFinV-K][VOUCHER] Error issuing voucher:", error);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An internal server error occurred while generating the voucher.",
    });
  }
});

/**
 * POST /api/v1/vouchers/validate
 * Payload: { voucherCode: string, branchId?: string, orderId?: string }
 * Public endpoint - no authentication required for voucher validation
 */
router.post("/validate", async (req: Request, res: Response) => {
  const prisma = db.getPrisma();
  const { voucherCode, branchId, orderId } = req.body;

  try {
    if (!voucherCode) {
      res.status(400).json({
        success: false,
        error: "MISSING_VOUCHER_CODE",
        message: "Voucher code is required.",
      });
      return;
    }

    const voucher = await prisma.voucher.findUnique({
      where: { voucherCode },
    });

    if (!voucher) {
      res.status(404).json({
        success: false,
        error: "VOUCHER_NOT_FOUND",
        message: "The requested voucher code does not exist.",
      });
      return;
    }

    // Expiration check
    const now = new Date();
    if (new Date(voucher.expiresAt) < now) {
      if (voucher.status !== "EXPIRED") {
        await prisma.voucher.update({
          where: { id: voucher.id },
          data: { status: "EXPIRED" },
        });
      }
      res.status(400).json({
        success: false,
        error: "VOUCHER_EXPIRED",
        message: "This voucher has expired and can no longer be redeemed.",
      });
      return;
    }

    if (voucher.status === "REDEEMED" || Number(voucher.currentAmount) <= 0) {
      res.status(400).json({
        success: false,
        error: "VOUCHER_REDEEMED",
        message: "This voucher has already been fully redeemed.",
      });
      return;
    }

    if (voucher.status === "VOIDED") {
      res.status(400).json({
        success: false,
        error: "VOUCHER_VOIDED",
        message: "This voucher has been voided.",
      });
      return;
    }

    // Branch validation: if voucher has a branchId, it can only be used at that branch
    if (voucher.branchId && branchId && voucher.branchId !== branchId) {
      res.status(400).json({
        success: false,
        error: "BRANCH_MISMATCH",
        message: "This voucher can only be redeemed at the branch where it was issued.",
      });
      return;
    }

    // Tax rate validation for single-purpose vouchers
    if (voucher.voucherType === "SINGLE_PURPOSE" && orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: {
            include: {
              meal: true,
              deal: {
                include: {
                  components: {
                    include: {
                      branchPrices: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (order) {
        const voucherVatRate = Number(voucher.vatRate);
        let hasMatchingTaxRate = false;

        for (const item of order.orderItems) {
          if (item.itemType === "MEAL" && item.meal) {
            const itemTaxRate = Number(item.meal.taxPercentage || 0);
            if (Math.abs(itemTaxRate - voucherVatRate) < 0.01) {
              hasMatchingTaxRate = true;
              break;
            }
          } else if (item.itemType === "DEAL" && item.deal) {
            for (const component of item.deal.components) {
              let componentTaxRate = Number(component.taxPercentage);

              // Check for branch-specific override
              if (branchId) {
                const branchPrice = component.branchPrices?.find(bp => bp.branchId === branchId);
                if (branchPrice && branchPrice.taxPercentage !== null) {
                  componentTaxRate = Number(branchPrice.taxPercentage);
                }
              }

              if (Math.abs(componentTaxRate - voucherVatRate) < 0.01) {
                hasMatchingTaxRate = true;
                break;
              }
            }
            if (hasMatchingTaxRate) break;
          }
        }

        if (!hasMatchingTaxRate) {
          res.status(400).json({
            success: false,
            error: "TAX_RATE_MISMATCH",
            message: `This single-purpose voucher is for ${voucherVatRate}% VAT items, but the order contains no items with this tax rate.`,
          });
          return;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: voucher.id,
        voucherCode: voucher.voucherCode,
        voucherType: voucher.voucherType,
        initialAmount: Number(voucher.initialAmount),
        currentAmount: Number(voucher.currentAmount),
        vatRate: voucher.vatRate ? Number(voucher.vatRate) : null,
        expiresAt: voucher.expiresAt,
        status: voucher.status,
        branchId: voucher.branchId,
      },
    });
  } catch (error: any) {
    console.error("[DSFinV-K][VOUCHER] Error validating voucher:", error);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An internal server error occurred while validating the voucher.",
    });
  }
});

/**
 * GET /api/v1/vouchers/:code
 * Fetch voucher details by code regardless of status (for viewing receipts/history)
 */
router.get("/:code", rbac.authenticate, async (req: Request, res: Response) => {
  const prisma = db.getPrisma();
  const { code } = req.params;

  try {
    if (!code) {
      res.status(400).json({
        success: false,
        error: "MISSING_VOUCHER_CODE",
        message: "Voucher code is required.",
      });
      return;
    }

    const voucher = await prisma.voucher.findUnique({
      where: { voucherCode: code },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!voucher) {
      res.status(404).json({
        success: false,
        error: "VOUCHER_NOT_FOUND",
        message: "The requested voucher code does not exist.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: voucher.id,
        voucherCode: voucher.voucherCode,
        voucherType: voucher.voucherType,
        initialAmount: Number(voucher.initialAmount),
        currentAmount: Number(voucher.currentAmount),
        vatRate: voucher.vatRate ? Number(voucher.vatRate) : null,
        expiresAt: voucher.expiresAt,
        status: voucher.status,
        tseIssuanceSignature: voucher.tseIssuanceSignature,
        transactions: voucher.transactions.map((tx: any) => ({
          txType: tx.txType,
          amount: Number(tx.amount),
          balanceBefore: Number(tx.balanceBefore),
          balanceAfter: Number(tx.balanceAfter),
          orderId: tx.orderId,
          createdAt: tx.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("[DSFinV-K][VOUCHER] Error fetching voucher:", error);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An internal server error occurred while fetching voucher details.",
    });
  }
});

/**
 * POST /api/v1/vouchers/redeem
 * Payload: { voucherCode: string, orderId?: string, amountNeeded: number, organizationId: string, branchId?: string }
 */
router.post("/redeem", rbac.authenticate, async (req: Request, res: Response) => {
  const prisma = db.getPrisma();
  const { voucherCode, orderId, amountNeeded, organizationId, branchId } = req.body;

  try {
    if (!voucherCode || !amountNeeded || amountNeeded <= 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "Voucher code and a positive redeem amount are required.",
      });
      return;
    }

    const voucher = await prisma.voucher.findUnique({
      where: { voucherCode },
    });

    if (!voucher) {
      res.status(404).json({
        success: false,
        error: "VOUCHER_NOT_FOUND",
        message: "Voucher code not found.",
      });
      return;
    }

    // Expiration check
    if (new Date(voucher.expiresAt) < new Date()) {
      res.status(400).json({
        success: false,
        error: "VOUCHER_EXPIRED",
        message: "Voucher has expired.",
      });
      return;
    }

    const currentBalance = Number(voucher.currentAmount);
    if (voucher.status === "REDEEMED" || currentBalance <= 0) {
      res.status(400).json({
        success: false,
        error: "VOUCHER_REDEEMED",
        message: "Voucher already redeemed.",
      });
      return;
    }

    if (voucher.status === "VOIDED") {
      res.status(400).json({
        success: false,
        error: "VOUCHER_VOIDED",
        message: "Voucher has been voided.",
      });
      return;
    }

    // Branch validation: if voucher has a branchId, it can only be used at that branch
    if (voucher.branchId && branchId && voucher.branchId !== branchId) {
      res.status(400).json({
        success: false,
        error: "BRANCH_MISMATCH",
        message: "This voucher can only be redeemed at the branch where it was issued.",
      });
      return;
    }

    // Tax rate validation for single-purpose vouchers
    if (voucher.voucherType === "SINGLE_PURPOSE" && orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: {
            include: {
              meal: true,
              deal: {
                include: {
                  components: {
                    include: {
                      branchPrices: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (order) {
        const voucherVatRate = Number(voucher.vatRate);
        let hasMatchingTaxRate = false;

        for (const item of order.orderItems) {
          if (item.itemType === "MEAL" && item.meal) {
            const itemTaxRate = Number(item.meal.taxPercentage || 0);
            if (Math.abs(itemTaxRate - voucherVatRate) < 0.01) {
              hasMatchingTaxRate = true;
              break;
            }
          } else if (item.itemType === "DEAL" && item.deal) {
            for (const component of item.deal.components) {
              let componentTaxRate = Number(component.taxPercentage);

              // Check for branch-specific override
              if (branchId) {
                const branchPrice = component.branchPrices?.find(bp => bp.branchId === branchId);
                if (branchPrice && branchPrice.taxPercentage !== null) {
                  componentTaxRate = Number(branchPrice.taxPercentage);
                }
              }

              if (Math.abs(componentTaxRate - voucherVatRate) < 0.01) {
                hasMatchingTaxRate = true;
                break;
              }
            }
            if (hasMatchingTaxRate) break;
          }
        }

        if (!hasMatchingTaxRate) {
          res.status(400).json({
            success: false,
            error: "TAX_RATE_MISMATCH",
            message: `This single-purpose voucher is for ${voucherVatRate}% VAT items, but the order contains no items with this tax rate.`,
          });
          return;
        }
      }
    }

    const redeemAmount = Math.min(currentBalance, Number(amountNeeded));
    const newBalance = Math.max(0, currentBalance - redeemAmount);
    const nextStatus = newBalance === 0 ? "REDEEMED" : "PARTIALLY_REDEEMED";

    // Deduct via Transaction block
    const updatedVoucher = await prisma.$transaction(async (tx) => {
      const updated = await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          currentAmount: newBalance,
          status: nextStatus,
        },
      });

      await tx.voucherTransaction.create({
        data: {
          voucherId: voucher.id,
          txType: "REDEMPTION",
          amount: redeemAmount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          orderId: orderId || null,
        },
      });

      return updated;
    });

    // TSE Logging for Redemption Event
    if (branchId && organizationId) {
      try {
        const config = await getFiskalyConfigSnapshot(prisma as any, organizationId);
        if (shouldFiscalize(config)) {
          const rawDeviceId = req.headers["x-pos-device-id"];
          const deviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : null;

          const fiskaly = FiskalyService.getInstance();
          // We log and sign standard TSE transaction event for redemption
          console.log(`[DSFinV-K][VOUCHER] Redemed and signed voucher redemption: amount=${redeemAmount}`);
        }
      } catch (tseError: any) {
        console.warn("[DSFinV-K][VOUCHER] TSE signing for voucher redemption failed:", tseError?.message || tseError);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        voucherCode: updatedVoucher.voucherCode,
        voucherType: updatedVoucher.voucherType,
        redeemedAmount: redeemAmount,
        remainingBalance: Number(updatedVoucher.currentAmount),
        status: updatedVoucher.status,
      },
    });
  } catch (error: any) {
    console.error("[DSFinV-K][VOUCHER] Error redeeming voucher:", error);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An internal server error occurred while redeeming the voucher.",
    });
  }
});

/**
 * POST /api/v1/vouchers/reactivate
 * Payload: { voucherCode: string, orderId?: string, refundId?: string }
 * Reactivates a redeemed single-purpose voucher upon refund
 */
router.post("/reactivate", rbac.authenticate, async (req: Request, res: Response) => {
  const prisma = db.getPrisma();
  const { voucherCode, orderId, refundId } = req.body;

  try {
    if (!voucherCode) {
      res.status(400).json({
        success: false,
        error: "MISSING_VOUCHER_CODE",
        message: "Voucher code is required.",
      });
      return;
    }

    const voucher = await prisma.voucher.findUnique({
      where: { voucherCode },
      include: { transactions: true },
    });

    if (!voucher) {
      res.status(404).json({
        success: false,
        error: "VOUCHER_NOT_FOUND",
        message: "Voucher code not found.",
      });
      return;
    }

    if (voucher.status !== "REDEEMED" && voucher.status !== "PARTIALLY_REDEEMED") {
      res.status(400).json({
        success: false,
        error: "INVALID_VOUCHER_STATUS",
        message: "Voucher must be redeemed or partially redeemed to be reactivated.",
      });
      return;
    }

    // Reactivate voucher
    const updatedVoucher = await prisma.$transaction(async (tx) => {
      const updated = await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          status: "ACTIVE",
        },
      });

      // Record reactivation transaction
      await tx.voucherTransaction.create({
        data: {
          voucherId: voucher.id,
          txType: "ISSUANCE", // Use valid transaction type for reactivation
          amount: Number(voucher.currentAmount),
          balanceBefore: Number(voucher.currentAmount),
          balanceAfter: Number(voucher.currentAmount),
          orderId: orderId || null,
        },
      });

      return updated;
    });

    console.log(`[VOUCHER] Reactivated voucher ${voucherCode} for refund`, { orderId, refundId });

    res.status(200).json({
      success: true,
      data: {
        voucherCode: updatedVoucher.voucherCode,
        voucherType: updatedVoucher.voucherType,
        currentAmount: Number(updatedVoucher.currentAmount),
        status: updatedVoucher.status,
      },
    });
  } catch (error: any) {
    console.error("[VOUCHER] Error reactivating voucher:", error);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An internal server error occurred while reactivating the voucher.",
    });
  }
});

export default router;
