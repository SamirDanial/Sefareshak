import DatabaseSingleton from "../config/database";
import { RefundStatus } from "@prisma/client";

export class BusinessDayReportService {
  private static instance: BusinessDayReportService;
  private db = DatabaseSingleton.getInstance();

  private static readonly REPORT_VERSION = 15;

  private constructor() {}

  public static getInstance(): BusinessDayReportService {
    if (!BusinessDayReportService.instance) {
      BusinessDayReportService.instance = new BusinessDayReportService();
    }
    return BusinessDayReportService.instance;
  }

  public getReportVersion(): number {
    return BusinessDayReportService.REPORT_VERSION;
  }

  public async computeReportData(sessionId: string, prismaOverride?: any) {
    const prisma = (prismaOverride || (this.db.getPrisma() as any)) as any;

    const session = await prisma.businessDaySession.findUnique({
      where: { id: sessionId },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            zipCode: true,
            city: true,
            businessPhone: true,
            businessAddress: true,
            taxInclusive: true,
            deliveryTaxPercentage: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error("Business day session not found");
    }

    const settings = await prisma.settings.findFirst({
      select: { taxInclusive: true },
    });

    const taxInclusive =
      session?.branch?.taxInclusive !== null &&
      session?.branch?.taxInclusive !== undefined
        ? Boolean(session.branch.taxInclusive)
        : Boolean(settings?.taxInclusive || false);

    const timeWindow = {
      gte: session.startedAt,
      lt: session.endedAt || undefined,
    };

    const orders = await prisma.order.findMany({
      where: {
        branchId: session.branchId,
        replacementOrders: { none: {} },
        OR: [
          { postedAt: timeWindow },
          { postedAt: null, createdAt: timeWindow },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        orderType: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        postedAt: true,
        createdAt: true,
        taxInclusive: true,
        deliveryDistanceKm: true,
        takeawayServiceFee: true,
        takeawayServiceTaxPercentage: true,
        takeawayServiceTaxAmount: true,
        payment: {
          select: {
            paymentProvider: true,
            paymentMethod: true,
            metadata: true,
            webhookData: true,
          },
        },
        totalAmount: true,
        deliveryFee: true,
        taxAmount: true,
        itemTaxAmount: true,
        addonTaxAmount: true,
        deliveryTaxAmount: true,
        currency: true,
        orderItems: {
          select: {
            id: true,
            itemType: true,
            selectedSize: true,
            unitPrice: true,
            quantity: true,
            totalPrice: true,
            taxAmount: true,
            taxPercentage: true,
            parentDealItemId: true,
            meal: {
              select: {
                isDrink: true,
                name: true,
              },
            },
            deal: {
              select: {
                name: true,
              },
            },
            dealComponent: {
              select: {
                name: true,
              },
            },
            orderItemAddOns: {
              select: {
                addOnName: true,
                addOnPrice: true,
                taxAmount: true,
                taxPercentage: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    const reservationOrders = await prisma.reservationOrder.findMany({
      where: {
        branchId: session.branchId,
        OR: [
          { postedAt: timeWindow },
          { postedAt: null, createdAt: timeWindow },
        ],
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        postedAt: true,
        totalAmount: true,
        taxAmount: true,
        itemTaxAmount: true,
        addonTaxAmount: true,
        currency: true,
        payment: {
          select: {
            paymentProvider: true,
            paymentMethod: true,
            metadata: true,
            webhookData: true,
          },
        },
        items: {
          select: {
            unitPrice: true,
            quantity: true,
            totalPrice: true,
            taxAmount: true,
            taxPercentage: true,
            meal: {
              select: {
                isDrink: true,
              },
            },
            addons: {
              select: {
                addOnPrice: true,
                taxAmount: true,
                taxPercentage: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    const normalizedReservationOrders = (reservationOrders || []).map((ro: any) => ({
      id: ro.id,
      orderType: "PICKUP",
      status: ro.status,
      paymentStatus: ro.paymentStatus,
      paymentMethod: ro.paymentMethod,
      postedAt: ro.postedAt,
      taxInclusive,
      deliveryDistanceKm: 0,
      takeawayServiceFee: 0,
      takeawayServiceTaxPercentage: 0,
      takeawayServiceTaxAmount: 0,
      totalAmount: ro.totalAmount,
      deliveryFee: 0,
      taxAmount: ro.taxAmount,
      itemTaxAmount: ro.itemTaxAmount,
      addonTaxAmount: ro.addonTaxAmount,
      deliveryTaxAmount: 0,
      currency: ro.currency,
      payment: ro.payment,
      orderItems: (ro.items || []).map((it: any) => ({
        itemType: "MEAL",
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        totalPrice: it.totalPrice,
        taxAmount: it.taxAmount,
        taxPercentage: it.taxPercentage,
        meal: it.meal,
        orderItemAddOns: it.addons || [],
      })),
    }));

    const allSales = ([] as any[]).concat(orders as any, normalizedReservationOrders as any);

    const currency = (allSales[0]?.currency || "usd").toString();

    const paidLike = new Set(["PAID", "REFUNDED", "PARTIALLY_REFUNDED"]);

    const deliveredAndPaid = allSales.filter(
      (o: any) =>
        (o.status === "DELIVERED" || o.status === "PICKED_UP") &&
        o.paymentStatus === "PAID"
    );

    const paidOrders = allSales.filter((o: any) => paidLike.has(String(o.paymentStatus)));

    const revenueOrders = paidOrders.filter((o: any) => String(o.status) !== "CANCELLED");
    // Exclude cancelled COD/COP orders from cancelledPaidOrders
    const cancelledPaidOrders = paidOrders.filter((o: any) => {
      if (String(o.status) !== "CANCELLED") return false;
      const paymentMethod = String(o.paymentMethod || "");
      // Exclude CASH_ON_DELIVERY (COD) and CASH_ON_PICKUP (COP)
      return paymentMethod !== "CASH_ON_DELIVERY" && paymentMethod !== "CASH_ON_PICKUP";
    });

    const paypalGross = deliveredAndPaid
      .filter((o: any) => String(o?.payment?.paymentProvider) === "PAYPAL")
      .reduce((sum: number, o: any) => sum + Number(o.totalAmount || 0), 0);

    const cancelled = allSales.filter((o: any) => o.status === "CANCELLED");

    const paymentGroupFromMethod = (pm: any): "BAR" | "ONLINE" | "EC" | "OTHER" => {
      const m = String(pm);
      if (m === "CASH_ON_DELIVERY") return "BAR";
      if (m === "ONLINE_PAYMENT") return "ONLINE";
      if (m === "CARD_ON_DELIVERY") return "EC";
      return "OTHER";
    };

    const orderTypeGroup = (ot: any): "DELIVERY" | "PICKUP" | "OTHER" => {
      const t = String(ot);
      if (t === "DELIVERY") return "DELIVERY";
      if (t === "PICKUP") return "PICKUP";
      return "OTHER";
    };

    type ProviderKey = "STRIPE" | "PAYPAL" | "CASH" | "CARD" | "OTHER";
    const providerKeyFromOrder = (o: any): ProviderKey => {
      const pm = String(o?.paymentMethod);
      if (pm === "CASH_ON_DELIVERY") return "CASH";
      if (pm === "CARD_ON_DELIVERY") return "CARD";

      const provider = String(o?.payment?.paymentProvider || "").toUpperCase();
      if (provider === "PAYPAL") return "PAYPAL";
      if (provider === "STRIPE") {
        return "STRIPE";
      }

      if (pm === "ONLINE_PAYMENT") return "OTHER";
      return "OTHER";
    };

    const add = (a: number, b: any) => a + Number(b || 0);

    const totalsByPaymentMethod: Record<string, number> = {};
    for (const o of revenueOrders) {
      const key = String(o.paymentMethod);
      totalsByPaymentMethod[key] = (totalsByPaymentMethod[key] || 0) +
        Number(o.totalAmount);
    }

    const totalsByPaymentGroup: Record<string, number> = {};
    const totalsByPaymentGroupAndOrderType: Record<string, Record<string, number>> = {};
    for (const o of revenueOrders) {
      const pg = paymentGroupFromMethod(o.paymentMethod);
      totalsByPaymentGroup[pg] = add(totalsByPaymentGroup[pg] || 0, o.totalAmount);

      const ot = orderTypeGroup(o.orderType);
      totalsByPaymentGroupAndOrderType[pg] = totalsByPaymentGroupAndOrderType[pg] || {};
      totalsByPaymentGroupAndOrderType[pg][ot] = add(
        totalsByPaymentGroupAndOrderType[pg][ot] || 0,
        o.totalAmount
      );
    }

    const totalsByPaymentProvider: Record<ProviderKey, number> = {
      STRIPE: 0,
      PAYPAL: 0,
      CASH: 0,
      CARD: 0,
      OTHER: 0,
    };

    const totalsByPaymentProviderAndOrderType: Record<
      ProviderKey,
      Record<string, number>
    > = {
      STRIPE: {},
      PAYPAL: {},
      CASH: {},
      CARD: {},
      OTHER: {},
    };

    for (const o of revenueOrders) {
      const pk = providerKeyFromOrder(o);
      totalsByPaymentProvider[pk] = add(totalsByPaymentProvider[pk] || 0, o.totalAmount);

      const ot = orderTypeGroup(o.orderType);
      totalsByPaymentProviderAndOrderType[pk] =
        totalsByPaymentProviderAndOrderType[pk] || {};
      totalsByPaymentProviderAndOrderType[pk][ot] = add(
        totalsByPaymentProviderAndOrderType[pk][ot] || 0,
        o.totalAmount
      );
    }

    function round2(v: number) {
      return Math.round((v + Number.EPSILON) * 100) / 100;
    }

    let drinksGrossTotal = 0;
    for (const o of revenueOrders) {
      for (const it of o.orderItems || []) {
        const isDrink = Boolean((it as any)?.meal?.isDrink);
        if (!isDrink) continue;
        drinksGrossTotal += Number(it.unitPrice || 0) * Number(it.quantity || 1);
      }
    }
    drinksGrossTotal = round2(drinksGrossTotal);

    const totals = revenueOrders.reduce(
      (acc: any, o: any) => {
        acc.gross += Number(o.totalAmount);
        acc.tax += Number(o.taxAmount);
        acc.itemTax += Number(o.itemTaxAmount || 0);
        acc.addonTax += Number(o.addonTaxAmount || 0);
        acc.deliveryTax += Number(o.deliveryTaxAmount || 0);
        acc.deliveryFee += Number(o.deliveryFee);
        return acc;
      },
      { gross: 0, tax: 0, itemTax: 0, addonTax: 0, deliveryTax: 0, deliveryFee: 0 }
    );

    const takeawayServiceTotalsByPaymentGroup: Record<
      string,
      { gross: number; net: number; tax: number }
    > = {};
    let takeawayServiceFeeGrossTotal = 0;
    let takeawayServiceFeeNetTotal = 0;
    let takeawayServiceTaxTotal = 0;

    for (const o of revenueOrders) {
      if (orderTypeGroup(o.orderType) !== "PICKUP") continue;

      const feeBase = Number((o as any).takeawayServiceFee || 0);
      const taxAmt = Number((o as any).takeawayServiceTaxAmount || 0);
      if (!feeBase && !taxAmt) continue;

      const oTaxInclusive =
        (o as any).taxInclusive !== null && (o as any).taxInclusive !== undefined
          ? Boolean((o as any).taxInclusive)
          : taxInclusive;

      const net = oTaxInclusive ? feeBase - taxAmt : feeBase;
      const gross = oTaxInclusive ? feeBase : feeBase + taxAmt;

      takeawayServiceFeeGrossTotal += gross;
      takeawayServiceFeeNetTotal += net;
      takeawayServiceTaxTotal += taxAmt;

      const pg = paymentGroupFromMethod(o.paymentMethod);
      if (!takeawayServiceTotalsByPaymentGroup[pg]) {
        takeawayServiceTotalsByPaymentGroup[pg] = { gross: 0, net: 0, tax: 0 };
      }
      takeawayServiceTotalsByPaymentGroup[pg].gross += gross;
      takeawayServiceTotalsByPaymentGroup[pg].net += net;
      takeawayServiceTotalsByPaymentGroup[pg].tax += taxAmt;
    }

    takeawayServiceFeeGrossTotal = round2(takeawayServiceFeeGrossTotal);
    takeawayServiceFeeNetTotal = round2(takeawayServiceFeeNetTotal);
    takeawayServiceTaxTotal = round2(takeawayServiceTaxTotal);
    for (const b of Object.values(takeawayServiceTotalsByPaymentGroup)) {
      b.gross = round2(Number(b.gross || 0));
      b.net = round2(Number(b.net || 0));
      b.tax = round2(Number(b.tax || 0));
    }

    type VatBucket = { rate: number; gross: number; tax: number; net: number };
    const vatByRateAll: Record<string, VatBucket> = {};
    const vatByRateByPaymentGroup: Record<string, Record<string, VatBucket>> = {};

    const ensureVatBucket = (
      target: Record<string, VatBucket>,
      rate: number
    ): VatBucket => {
      const key = rate.toFixed(2);
      if (!target[key]) target[key] = { rate, gross: 0, tax: 0, net: 0 };
      return target[key];
    };

    const addVat = (
      pg: string,
      rate: number,
      gross: any,
      tax: any
    ) => {
      const g = Number(gross || 0);
      const t = Number(tax || 0);

      // IMPORTANT:
      // - If taxInclusive=false, our stored unit prices / addon prices are NET (see orderController tax calc),
      //   so VAT gross = net + tax and VAT net = net.
      // - If taxInclusive=true, stored prices are GROSS, so VAT net = gross - tax.
      const net = taxInclusive ? g - t : g;
      const grossOut = taxInclusive ? g : g + t;

      const bucketAll = ensureVatBucket(vatByRateAll, rate);
      bucketAll.gross += grossOut;
      bucketAll.tax += t;
      bucketAll.net += net;

      vatByRateByPaymentGroup[pg] = vatByRateByPaymentGroup[pg] || {};
      const bucketPg = ensureVatBucket(vatByRateByPaymentGroup[pg], rate);
      bucketPg.gross += grossOut;
      bucketPg.tax += t;
      bucketPg.net += net;
    };

    for (const o of revenueOrders) {
      const pg = paymentGroupFromMethod(o.paymentMethod);
      for (const it of o.orderItems || []) {
        const itemType = String((it as any)?.itemType || "");
        const rate = Number(it.taxPercentage || 0);
        // IMPORTANT: For deals we store both a DEAL parent row and DEAL_COMPONENT rows.
        // The DEAL parent row may carry aggregated tax but uses taxPercentage=0, which breaks VAT buckets
        // and can double-count alongside the DEAL_COMPONENT rows.
        // Therefore:
        // - Include VAT for MEAL + DEAL_COMPONENT rows only
        // - Still include add-ons VAT (they can be attached to DEAL parent rows)
        const shouldIncludeItemVat = itemType !== "DEAL";

        if (shouldIncludeItemVat) {
          // IMPORTANT: orderItem.totalPrice already includes addon totals in our order creation flows.
          // To avoid double counting (since addons are also listed separately), use meal gross only.
          const mealGross = Number(it.unitPrice || 0) * Number(it.quantity || 1);
          addVat(pg, rate, mealGross, it.taxAmount);
        }

        for (const ao of it.orderItemAddOns || []) {
          const aoRate = Number(ao.taxPercentage || 0);
          const qty = Number(ao.quantity || 1);
          addVat(pg, aoRate, Number(ao.addOnPrice || 0) * qty, ao.taxAmount);
        }
      }
    }

    // Normalize VAT buckets for output only (rounding).
    // IMPORTANT: VAT buckets are derived from stored line-item tax amounts (orderItem.taxAmount / addOn.taxAmount).
    // We avoid recomputing tax from formulas here because per-line rounding and stored tax may differ by 0.01.
    for (const b of Object.values(vatByRateAll)) {
      b.gross = round2(Number(b.gross || 0));
      b.tax = round2(Number(b.tax || 0));
      b.net = round2(Number(b.net || 0));
    }

    for (const buckets of Object.values(vatByRateByPaymentGroup)) {
      for (const b of Object.values(buckets)) {
        b.gross = round2(Number(b.gross || 0));
        b.tax = round2(Number(b.tax || 0));
        b.net = round2(Number(b.net || 0));
      }
    }

    const deliveryFeeGross = revenueOrders.reduce(
      (sum: number, o: any) => sum + Number(o.deliveryFee || 0),
      0
    );

    const deliveryVatRate =
      session?.branch?.deliveryTaxPercentage !== null &&
      session?.branch?.deliveryTaxPercentage !== undefined
        ? Number(session.branch.deliveryTaxPercentage)
        : 0;

    const deliveryVatByPaymentGroup: Record<
      string,
      { rate: number; gross: number; tax: number; net: number }
    > = {};

    const ensureDeliveryVatBucket = (pg: string) => {
      if (!deliveryVatByPaymentGroup[pg]) {
        deliveryVatByPaymentGroup[pg] = {
          rate: deliveryVatRate,
          gross: 0,
          tax: 0,
          net: 0,
        };
      }
      return deliveryVatByPaymentGroup[pg];
    };

    for (const o of revenueOrders) {
      const feeBase = Number(o.deliveryFee || 0);
      const tax = Number(o.deliveryTaxAmount || 0);
      if (!feeBase && !tax) continue;

      const pg = paymentGroupFromMethod(o.paymentMethod);

      const net = taxInclusive ? feeBase - tax : feeBase;
      const gross = taxInclusive ? feeBase : feeBase + tax;

      const bucket = ensureDeliveryVatBucket(pg);
      bucket.gross += gross;
      bucket.tax += tax;
      bucket.net += net;
    }

    for (const b of Object.values(deliveryVatByPaymentGroup)) {
      b.gross = round2(Number(b.gross || 0));
      b.tax = round2(Number(b.tax || 0));
      b.net = round2(Number(b.net || 0));
    }

    const deliveryVatTotals = Object.values(deliveryVatByPaymentGroup).reduce(
      (acc, b) => {
        acc.gross += Number(b.gross || 0);
        acc.tax += Number(b.tax || 0);
        acc.net += Number(b.net || 0);
        return acc;
      },
      { rate: deliveryVatRate, gross: 0, tax: 0, net: 0 }
    );

    const refunds = await prisma.refund.findMany({
      where: {
        orderId: { in: orders.map((o: any) => o.id) },
        status: RefundStatus.SUCCEEDED,
      },
      select: { orderId: true, amount: true, createdAt: true },
    });

    // Refunds should reduce revenue only for non-cancelled orders.
    // Cancelled orders are excluded from revenue/VAT entirely and shown separately in Sum Cancelled.
    const refundedByOrderId: Record<string, number> = {};
    for (const r of refunds) {
      const oid = String((r as any).orderId);
      const o = (orders as any[]).find((x) => String(x.id) === oid);
      if (!o) continue;
      if (String(o.status) === "CANCELLED") continue;
      refundedByOrderId[oid] = (refundedByOrderId[oid] || 0) + Number((r as any).amount || 0);
    }

    const totalRefunded = Object.values(refundedByOrderId).reduce(
      (sum: number, a: any) => sum + Number(a || 0),
      0
    );

    // Convert gross payment totals into net payment totals by deducting succeeded refunds (non-cancelled only).
    // We attribute refunds back to the original order's payment method / group.
    const orderById: Record<string, any> = {};
    for (const o of orders as any[]) {
      orderById[String(o.id)] = o;
    }

    for (const [oid, amtRaw] of Object.entries(refundedByOrderId)) {
      const o = orderById[oid];
      if (!o) continue;

      const amt = Number(amtRaw || 0);
      if (!amt) continue;

      const pm = String(o.paymentMethod);
      const pg = paymentGroupFromMethod(o.paymentMethod);
      const ot = orderTypeGroup(o.orderType);

      totalsByPaymentMethod[pm] = add(totalsByPaymentMethod[pm] || 0, -amt);
      totalsByPaymentGroup[pg] = add(totalsByPaymentGroup[pg] || 0, -amt);

      totalsByPaymentGroupAndOrderType[pg] = totalsByPaymentGroupAndOrderType[pg] || {};
      totalsByPaymentGroupAndOrderType[pg][ot] = add(
        totalsByPaymentGroupAndOrderType[pg][ot] || 0,
        -amt
      );

      const pk = providerKeyFromOrder(o);
      totalsByPaymentProvider[pk] = add(totalsByPaymentProvider[pk] || 0, -amt);
      totalsByPaymentProviderAndOrderType[pk] =
        totalsByPaymentProviderAndOrderType[pk] || {};
      totalsByPaymentProviderAndOrderType[pk][ot] = add(
        totalsByPaymentProviderAndOrderType[pk][ot] || 0,
        -amt
      );
    }

    const cancelledGross = cancelledPaidOrders.reduce(
      (sum: number, o: any) => sum + Number(o.totalAmount || 0),
      0
    );

    const paidOrdersGross = paidOrders.reduce(
      (sum: number, o: any) => sum + Number(o.totalAmount || 0),
      0
    );

    const sumOrdersTotal = revenueOrders.reduce(
      (sum: number, o: any) => sum + Number(o.totalAmount || 0),
      0
    );

    const distanceKmTotal = (orders as any[])
      .filter(
        (o: any) =>
          orderTypeGroup(o.orderType) === "DELIVERY" && String(o.status) !== "CANCELLED"
      )
      .reduce(
        (sum: number, o: any) => sum + Number((o as any).deliveryDistanceKm || 0),
        0
      );

    const takeawayServiceFeeGross = (orders as any[])
      .filter(
        (o: any) =>
          orderTypeGroup(o.orderType) === "PICKUP" && String(o.status) !== "CANCELLED"
      )
      .reduce(
        (sum: number, o: any) => sum + Number((o as any).takeawayServiceFee || 0),
        0
      );

    const netRevenueGross = sumOrdersTotal - totalRefunded;

    return {
      reportVersion: BusinessDayReportService.REPORT_VERSION,
      session: {
        id: session.id,
        sequenceNumber: session.sequenceNumber,
        branchId: session.branchId,
        branchName: session.branch?.name || null,
        branch: session.branch
          ? {
              id: session.branch.id,
              name: session.branch.name,
              address: (session.branch as any).address || null,
              zipCode: (session.branch as any).zipCode || null,
              city: (session.branch as any).city || null,
              businessPhone: (session.branch as any).businessPhone || null,
              businessAddress: (session.branch as any).businessAddress || null,
              taxInclusive: (session.branch as any).taxInclusive ?? null,
            }
          : null,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
      currency,
      orders: (orders as any[]).map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        postedAt: o.postedAt,
        createdAt: o.createdAt,
        totalAmount: o.totalAmount,
        deliveryFee: o.deliveryFee,
        taxAmount: o.taxAmount,
        itemTaxAmount: o.itemTaxAmount,
        addonTaxAmount: o.addonTaxAmount,
        deliveryTaxAmount: o.deliveryTaxAmount,
        currency: o.currency,
        orderItems: o.orderItems || [],
      })),
      counts: {
        totalOrders: orders.length,
        deliveredPaidOrders: deliveredAndPaid.length,
      },
      totals: {
        grossSales: sumOrdersTotal,
        deliveryFee: deliveryFeeGross,
        drinksGross: drinksGrossTotal,
        taxTotal: totals.tax,
        itemTax: totals.itemTax,
        addonTax: totals.addonTax,
        deliveryTax: totals.deliveryTax,
        takeawayServiceFee: takeawayServiceFeeGrossTotal ? takeawayServiceFeeGrossTotal : 0,
        takeawayServiceTax: takeawayServiceTaxTotal ? takeawayServiceTaxTotal : 0,
        refunded: totalRefunded,
        netSales: netRevenueGross,
      },
      totalsByPaymentMethod,
      // Structured Z-Report payload (German receipt-style) for UI printing.
      // Some fields are placeholders (null) where the schema does not yet store that data.
      zReport: {
        counts: {
          totalOrders: orders.length,
          cancelledOrders: cancelled.length,
          deliveredPaidOrders: deliveredAndPaid.length,
        },
        sales: {
          // Receipt-style lines.
          // NOTE: We do not yet store discounts/drinks/service-fees/distance, so those are placeholders.
          lines: {
            foodsGross: null,
            articlesGross: sumOrdersTotal,
            discountGross: null,
            drinksGross: drinksGrossTotal,
            deliveryFeeGross,
            takeawayServiceFeeGross: takeawayServiceFeeGrossTotal ? round2(takeawayServiceFeeGrossTotal) : null,
            distanceKm: distanceKmTotal ? round2(distanceKmTotal) : null,
          },
          sums: {
            sumOrdersGross: paidOrdersGross,
            sumCancelledGross: cancelledGross ? -cancelledGross : null,
            totalRevenueGross: paidOrdersGross - cancelledGross - totalRefunded,
            refundedGross: totalRefunded,
          },
          channels: {
            // We can split by delivery/pickup, but we cannot split by external channels
            // like Lieferando/WebShop without a salesChannel field.
            pickupGross: revenueOrders
              .filter((o: any) => orderTypeGroup(o.orderType) === "PICKUP")
              .reduce((sum: number, o: any) => sum + Number(o.totalAmount), 0),
            deliveryGross: revenueOrders
              .filter((o: any) => orderTypeGroup(o.orderType) === "DELIVERY")
              .reduce((sum: number, o: any) => sum + Number(o.totalAmount), 0),
            webShopGross: null,
            takeawayGross: null,
            houseSaleGross: null,
          },
        },
        payments: {
          byGroup: totalsByPaymentGroup,
          byGroupAndOrderType: totalsByPaymentGroupAndOrderType,
          byProvider: totalsByPaymentProvider,
          byProviderAndOrderType: totalsByPaymentProviderAndOrderType,
          breakdownPlaceholders: {
            giftCardGross: null,
            invoiceGross: null,
            paypalGross,
          },
        },
        vat: {
          byRate: Object.values(vatByRateAll).sort((a, b) => a.rate - b.rate),
          byPaymentGroup: Object.fromEntries(
            Object.entries(vatByRateByPaymentGroup).map(([pg, buckets]) => [
              pg,
              Object.values(buckets).sort((a, b) => a.rate - b.rate),
            ])
          ),
          deliveryVatRate,
          takeawayService: {
            totals: {
              gross: takeawayServiceFeeGrossTotal,
              net: takeawayServiceFeeNetTotal,
              tax: takeawayServiceTaxTotal,
            },
            byPaymentGroup: takeawayServiceTotalsByPaymentGroup,
          },
          delivery: {
            totals: deliveryVatTotals,
            byPaymentGroup: deliveryVatByPaymentGroup,
          },
        },
      },
    };
  }

  public async getSessionReport(sessionId: string) {
    const prisma = this.db.getPrisma() as any;
    const dsfinvkRow = await prisma.businessDayDsfinvkSubmission.findUnique({
      where: { sessionId },
      select: { payload: true },
    });
    const dsfinvkPayload = dsfinvkRow?.payload || null;

    const report = await prisma.businessDayReport.findUnique({
      where: { sessionId },
      select: { id: true, sessionId: true, data: true, createdAt: true },
    });

    // If a previously generated report is missing endedAt in its snapshot (race during close),
    // or missing newer computed sections (e.g. zReport), or missing branch header fields
    // needed for printing (address/phone), re-compute and update it.
    if (report) {
      const endedAtInReport = (report as any)?.data?.session?.endedAt;
      const hasZReport = Boolean((report as any)?.data?.zReport);
      const version = Number((report as any)?.data?.reportVersion || 0);
      const hasBranchHeader = Boolean(
        (report as any)?.data?.session?.branch?.address ||
        (report as any)?.data?.session?.branch?.businessPhone ||
        (report as any)?.data?.session?.branch?.businessAddress
      );
      if (endedAtInReport && hasZReport && hasBranchHeader && version >= BusinessDayReportService.REPORT_VERSION) {
        if (dsfinvkPayload && !(report as any)?.data?.dsfinvk) {
          return {
            ...(report as any),
            data: {
              ...((report as any).data || {}),
              dsfinvk: dsfinvkPayload,
            },
          };
        }
        return report;
      }

      const reportData = await this.computeReportData(sessionId);
      return prisma.businessDayReport.update({
        where: { sessionId },
        data: { data: { ...(reportData as any), dsfinvk: dsfinvkPayload } as any },
        select: { id: true, sessionId: true, data: true, createdAt: true },
      });
    }

    const reportData = await this.computeReportData(sessionId);
    return prisma.businessDayReport.create({
      data: { sessionId, data: { ...(reportData as any), dsfinvk: dsfinvkPayload } as any },
      select: { id: true, sessionId: true, data: true, createdAt: true },
    });
  }
}

export default BusinessDayReportService;
