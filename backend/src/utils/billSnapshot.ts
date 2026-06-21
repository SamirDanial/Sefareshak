/**
 * Creates an immutable bill snapshot from order data
 * This snapshot is stored in the billSnapshot field and never changes
 */
export interface BillSnapshot {
  status: string;
  cancellationReason?: string;
  totalAmount: string;
  taxAmount: string;
  deliveryFee: string;
  itemTaxAmount: string;
  addonTaxAmount: string;
  deliveryTaxAmount: string;
  takeawayServiceFee?: string;
  takeawayServiceTaxAmount?: string;
  paymentMethod: string;
  paymentStatus: string;
  orderType: string;
  currency: string;
  orderItems: any[];
  discounts: {
    type?: string;
    value?: number;
    amount?: number;
  } | null;
  voucherPaymentAmount?: string;
  voucherCodes?: string[];
  fiscalTransaction?: {
    transactionNumber?: string;
    signatureCounter?: number;
    signaturePayload?: any;
  };
  billCreatedAt: string;
}

export function createBillSnapshot(
  order: any,
  fiscalTransaction?: any
): BillSnapshot {
  // Fix payment method for pickup orders
  const paymentMethod = order.orderType === 'PICKUP' && order.paymentMethod === 'CASH_ON_DELIVERY'
    ? 'CASH_ON_PICKUP'
    : order.paymentMethod;

  // Fix item types for vouchers based on specialInstructions
  const orderItems = (order.orderItems || []).map((item: any) => {
    const isVoucher = item.specialInstructions &&
      (item.specialInstructions.includes('CODE:') || item.specialInstructions.includes('TYPE:') || item.specialInstructions.includes('VAT:'));
    return {
      ...item,
      itemType: isVoucher ? 'VOUCHER' : item.itemType,
    };
  });

  const snapshot: BillSnapshot = {
    cancellationReason: order.cancellationReason,
    status: order.status,
    totalAmount: order.totalAmount?.toString() || '0',
    taxAmount: order.taxAmount?.toString() || '0',
    deliveryFee: order.deliveryFee?.toString() || '0',
    itemTaxAmount: order.itemTaxAmount?.toString() || '0',
    addonTaxAmount: order.addonTaxAmount?.toString() || '0',
    deliveryTaxAmount: order.deliveryTaxAmount?.toString() || '0',
    takeawayServiceFee: order.takeawayServiceFee?.toString(),
    takeawayServiceTaxAmount: order.takeawayServiceTaxAmount?.toString(),
    paymentMethod,
    paymentStatus: order.paymentStatus,
    orderType: order.orderType,
    currency: order.currency || 'usd',
    orderItems,
    discounts: order.discountType
      ? {
          type: order.discountType,
          value: order.discountValue ? Number(order.discountValue) : undefined,
          amount: order.discountAmount ? Number(order.discountAmount) : undefined,
        }
      : null,
    voucherPaymentAmount: order.voucherPaymentAmount?.toString(),
    voucherCodes: order.voucherCodes,
    fiscalTransaction: fiscalTransaction
      ? {
          transactionNumber: fiscalTransaction.transactionNumber,
          signatureCounter: fiscalTransaction.signatureCounter,
          signaturePayload: fiscalTransaction.signaturePayload,
        }
      : undefined,
    billCreatedAt: new Date().toISOString(),
  };

  return snapshot;
}
