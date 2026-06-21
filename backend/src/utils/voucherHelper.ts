import { PrismaClient } from "@prisma/client";

/**
 * Calculates the valid voucher deduction for an order based on single/multi-purpose rules.
 */
export function calculateVoucherDeduction(voucher: any, orderCalculation: any): number {
  if (!voucher) return 0;
  
  const voucherBalance = Number(voucher.currentAmount);
  if (isNaN(voucherBalance) || voucherBalance <= 0) return 0;
  
  if (voucher.voucherType === "MULTI_PURPOSE") {
    // Multi-purpose voucher covers everything up to the total order amount
    return Math.min(voucherBalance, Number(orderCalculation.finalTotal));
  }
  
  if (voucher.voucherType === "SINGLE_PURPOSE") {
    // Single-purpose voucher only covers items and addons matching the voucher's vatRate
    const lookupRate = Math.round(Number(voucher.vatRate || 0) * 100) / 100;
    
    let matchingTotal = 0;
    
    // Sum matching items
    if (Array.isArray(orderCalculation.itemBreakdown)) {
      for (const item of orderCalculation.itemBreakdown) {
        const itemRate = Math.round(Number(item.taxPercentage || 0) * 100) / 100;
        if (itemRate === lookupRate) {
          matchingTotal += Number(item.totalPrice || 0);
        }
      }
    }
    
    // Sum matching addons
    if (Array.isArray(orderCalculation.addonBreakdown)) {
      for (const addon of orderCalculation.addonBreakdown) {
        const addonRate = Math.round(Number(addon.taxPercentage || 0) * 100) / 100;
        if (addonRate === lookupRate) {
          matchingTotal += Number(addon.totalPrice || 0);
        }
      }
    }
    
    return Math.min(voucherBalance, matchingTotal);
  }
  
  return 0;
}

/**
 * Validates and redeems a voucher transactionally.
 * Returns the final calculated deduction.
 */
export async function processVoucherRedemption(params: {
  tx: any; // Prisma transaction client
  voucherCode: string;
  orderCalculation: any;
  orderId: string;
}): Promise<{ deduction: number; voucherType: string; taxAlreadyPaid: boolean; remainingBalance: number }> {
  const { tx, voucherCode, orderCalculation, orderId } = params;
  const prisma = tx as any;

  // 1. Fetch and lock voucher
  const voucher = await prisma.voucher.findUnique({
    where: { voucherCode },
  });

  if (!voucher) {
    throw new Error("Voucher not found");
  }

  console.log('[VoucherHelper] Fetched voucher:', {
    voucherCode,
    status: voucher.status,
    currentAmount: voucher.currentAmount,
  });

  // 2. Validate state
  if (voucher.status === "REDEEMED" || Number(voucher.currentAmount) <= 0) {
    throw new Error("Voucher already fully redeemed");
  }

  if (voucher.status === "VOIDED") {
    throw new Error("Voucher has been voided");
  }

  if (new Date(voucher.expiresAt) < new Date()) {
    throw new Error("Voucher has expired");
  }

  // 3. Compute eligible deduction
  const deduction = calculateVoucherDeduction(voucher, orderCalculation);
  if (deduction <= 0) {
    throw new Error("No items in the order match this single-purpose voucher's VAT rate");
  }

  // 4. Calculate new balance & status
  const currentBalance = Number(voucher.currentAmount);
  const newBalance = Math.max(0, currentBalance - deduction);
  const nextStatus = newBalance === 0 ? "REDEEMED" : "PARTIALLY_REDEEMED";

  console.log('[VoucherHelper] Processing redemption:', {
    voucherCode,
    currentBalance,
    deduction,
    newBalance,
    nextStatus,
  });

  // 5. Update voucher
  await prisma.voucher.update({
    where: { id: voucher.id },
    data: {
      currentAmount: newBalance,
      status: nextStatus,
    },
  });

  // 6. Write transaction ledger entry
  await prisma.voucherTransaction.create({
    data: {
      voucherId: voucher.id,
      txType: "REDEMPTION",
      amount: deduction,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      orderId,
    },
  });

  return { 
    deduction, 
    voucherType: voucher.voucherType,
    taxAlreadyPaid: voucher.voucherType === "SINGLE_PURPOSE",
    remainingBalance: newBalance
  };
}
