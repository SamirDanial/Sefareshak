import type { Order } from "@/src/services/orderService";

const padRight = (value: string, width: number) => {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
};

const formatMoney = (amount: number, currency: string | null | undefined) => {
  const cur = typeof currency === "string" && currency.trim().length > 0 ? currency.trim() : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    const fixed = Number(amount || 0).toFixed(2);
    return cur ? `${fixed} ${cur}` : fixed;
  }
};

const safeLine = (s: string, max: number) => {
  if (s.length <= max) return [s];
  const lines: string[] = [];
  let rest = s;
  while (rest.length > max) {
    // Try to split at the last space before max to avoid cutting words
    let splitIndex = max;
    for (let i = max - 1; i > 0; i--) {
      if (rest[i] === ' ') {
        splitIndex = i;
        break;
      }
    }
    lines.push(rest.slice(0, splitIndex).trim());
    rest = rest.slice(splitIndex).trim();
  }
  if (rest) lines.push(rest);
  return lines;
};

const safeText = (v: any) => {
  if (v === null || v === undefined) return "";
  return String(v);
};

const formatDateTime = (iso: string) => {
  try {
    const raw = String(iso ?? "").trim();
    if (!raw) return "";

    const asNum = Number(raw);
    const d = Number.isFinite(asNum)
      ? new Date(asNum < 1e12 ? asNum * 1000 : asNum)
      : new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const yyyy = d.getFullYear();

    let hh = d.getHours();
    const mins = pad2(d.getMinutes());
    const ampm = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    const hh12 = pad2(hh);

    return `${mm}/${dd}/${yyyy}, ${hh12}:${mins} ${ampm}`;
  } catch {
    return iso;
  }
};

const toNum = (v: any) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

type ReceiptHeaderOverrides = {
  businessName?: string;
  businessAddressLines?: string[];
  businessPhone?: string;
};

export const buildReceiptText = (
  order: Order,
  options?: {
    lineWidth?: number;
    header?: ReceiptHeaderOverrides;
    currency?: string | null;
    translations?: {
      orderQr?: string;
      deliveryQr?: string;
      technicalSecurity?: string;
      tssId?: string;
      clientId?: string;
      transactionId?: string;
      signatureCounter?: string;
      start?: string;
      stop?: string;
      tssSerial?: string;
      signature?: string;
      fiskalyVerification?: string;
      fiskalyQrInstructions?: string;
      transaction?: string;
      voucherPayment?: string;
      voucherCode?: string;
      remainingAmount?: string;
      refundReceipt?: string;
      originalTransaction?: string;
      originalTssId?: string;
      refundTransaction?: string;
    };
    fiskalySignaturePayload?: any;
    isTssOutage?: boolean;
    offlineSequenceNumber?: number;
    skipFiskalyQr?: boolean;
    billSnapshot?: any; // Immutable bill snapshot
    isRefund?: boolean;
    refundData?: {
      refundType?: string;
      amount?: number;
      reason?: string;
      status?: string;
      originalOrderNumber?: string;
      originalTssId?: string;
      originalClientTransactionId?: string;
      originalTssTransactionId?: string;
      refundClientTransactionId?: string;
      refundTssTransactionId?: string;
    };
    fiskalyCorrection?: any;
  }
) => {
  const lineWidth = options?.lineWidth ?? 30;

  const receiptCurrency = (() => {
    const opt = typeof options?.currency === "string" ? options.currency.trim() : "";
    if (opt) return opt;
    const fromOrder = typeof (order as any)?.currency === "string" ? String((order as any).currency).trim() : "";
    return fromOrder || "USD";
  })();

  const lines: string[] = [];

  const headerBusinessName = String(options?.header?.businessName || "").trim();
  const businessName = headerBusinessName || order.branch?.name || "";
  const businessPhone = String(options?.header?.businessPhone || "").trim();

  const normalizeStreetLine = (value: string) => {
    const v = String(value || "").trim();
    const m = v.match(/^\s*(\d+[a-zA-Z]?)\s+(.+)$/);
    if (m) {
      const num = String(m[1] || "").trim();
      const name = String(m[2] || "").trim();
      if (name && num) return `${name} ${num}`;
    }
    return v;
  };

  const headerAddressLines = Array.isArray(options?.header?.businessAddressLines)
    ? options?.header?.businessAddressLines || []
    : [];
  const normalizedHeaderAddressLines = headerAddressLines
    .map((l) => String(l || "").trim())
    .filter(Boolean)
    .map((l, idx) => (idx === 0 ? normalizeStreetLine(l) : l));

  const fallbackBusinessAddress = [
    order.branch?.address,
    order.branch?.city,
    order.branch?.state,
    order.branch?.country,
  ]
    .filter(Boolean)
    .join(", ");

  const customerName =
    [order.user?.firstName, order.user?.lastName].filter(Boolean).join(" ") ||
    order.guestName ||
    order.user?.email ||
    order.guestEmail ||
    "Customer";
  const customerPhone = order.deliveryPhone || order.pickupPhone || order.guestPhone || order.user?.phone;
  const createdAt = order.createdAt ? formatDateTime(order.createdAt) : "";

  lines.push(String(businessName).toUpperCase());
  
  // Show refund header if this is a refund receipt
  if (options?.isRefund) {
    lines.push(options?.translations?.refundReceipt || "REFUND RECEIPT / ERSTATTUNGSBELEG");
  } else {
    lines.push("RECEIPT");
  }
  lines.push("-");
  
  // Show original transaction reference for refunds
  if (options?.isRefund && options?.refundData?.originalOrderNumber) {
    lines.push(`${options?.translations?.originalTransaction || "Original Transaction"}: #${options.refundData.originalOrderNumber}`);
  }
  
  lines.push(`Order No: ${order.orderNumber}`);
  if (createdAt) lines.push(`Date: ${createdAt}`);
  lines.push(`Type: ${order.orderType}`);

  // Use snapshot data if available (immutable), otherwise use current order data
  const displayStatus = options?.billSnapshot?.status || order.status;
  lines.push(`Status: ${displayStatus}`);

  if (displayStatus === "CANCELLED" && options?.billSnapshot?.cancellationReason) {
    lines.push(`Cancellation Reason: ${options.billSnapshot.cancellationReason}`);
  } else if (order.status === "CANCELLED" && order.cancellationReason && !options?.billSnapshot) {
    // Fallback to current order data if no snapshot
    lines.push(`Cancellation Reason: ${order.cancellationReason}`);
  }

  lines.push(`Payment: ${order.paymentMethod}`);
  lines.push("-");

  const addressToPrint =
    normalizedHeaderAddressLines.length > 0
      ? normalizedHeaderAddressLines
      : fallbackBusinessAddress
        ? [fallbackBusinessAddress]
        : [];

  if (addressToPrint.length > 0) {
    for (const line of addressToPrint) {
      for (const l of safeLine(line, lineWidth)) lines.push(l);
    }
    if (businessPhone) {
      for (const l of safeLine(`Tel. ${businessPhone}`, lineWidth)) lines.push(l);
    }
    lines.push("-");
  }

  lines.push("Customer:");
  for (const l of safeLine(customerName, lineWidth)) lines.push(l);
  if (customerPhone) lines.push(`Phone: ${customerPhone}`);
  lines.push("-");

  if (order.deliveryLinkToken) {
    lines.push(options?.translations?.orderQr || "Order (QR):");
    lines.push("__QR_ORDER__");
    lines.push("-");
  }

  if (order.orderType === "DELIVERY") {
    const parsedCity = (() => {
      const addr = String(order.deliveryAddress || "");
      if (!addr) return undefined;
      const m = addr.match(/\b(\d{5})\s+([^,\n]+)/);
      if (!m) return undefined;
      const cityPart = String(m[2] || "").trim();
      return cityPart || undefined;
    })();

    const normalized = (() => {
      const rawStreet = (order as any).deliveryStreetAddress as string | undefined;
      const rawHouse = (order as any).deliveryHouseNumber as string | undefined;
      const looksLikeHouseNo = (v?: string) => !!v && /^\d+[a-zA-Z]?$/.test(v.trim());
      const looksLikeStreet = (v?: string) => !!v && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v);
      const s = rawStreet?.trim();
      const h = rawHouse?.trim();
      if (looksLikeHouseNo(s) && looksLikeStreet(h) && !looksLikeHouseNo(h)) {
        return { street: h, house: s };
      }
      return { street: s, house: h };
    })();

    const streetLine = (() => {
      if (normalized.street && normalized.house) return `${normalized.street} ${normalized.house}`;
      if (normalized.street) return normalized.street;
      return "";
    })();
    const postalLine = (() => {
      const postal = (order as any).deliveryPostalCode as string | undefined;
      if (postal && parsedCity) return `${postal} ${parsedCity}`;
      if (postal) return postal;
      return "";
    })();
    const fallbackAddr = [order.deliveryAddress].filter(Boolean).join(", ");

    const addrLines = [streetLine, postalLine, !streetLine && !postalLine ? fallbackAddr : ""]
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (addrLines.length > 0) {
      lines.push("Delivery address:");
      for (const line of addrLines) {
        for (const l of safeLine(line, lineWidth)) lines.push(l);
      }
    }
    const phone = order.deliveryPhone || order.guestPhone || order.user?.phone;
    if (phone) lines.push(`Phone: ${phone}`);
    if (order.deliveryNotes) {
      lines.push("Delivery Note:");
      for (const l of safeLine(order.deliveryNotes, lineWidth)) lines.push(l);
    }

    if (order.deliveryLinkToken) {
      lines.push(options?.translations?.deliveryQr || "Address (QR):");
      lines.push("__QR_ADDRESS__");
    }
    lines.push("-");
  }

  const items = order.orderItems || [];
  const itemCount = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  const vatGroups = (() => {
    const map = new Map<number, Array<{ label: string; amount: number }>>();
    for (const it of items) {
      const baseRateForAddons = toNum((it as any).taxPercentage) ?? 0;

      if ((it as any).itemType !== "DEAL") {
        const rate = toNum((it as any).taxPercentage) ?? 0;
        const lineTotal = Number((it as any).totalPrice ?? (it as any).unitPrice * (it as any).quantity);
        const baseName =
          (it as any).itemType === "DEAL_COMPONENT"
            ? ((it as any).dealComponent?.name || (it as any).dealComponentName)
            : it.meal?.name || (it as any)?.deal?.name;
        const label = `${Number(it.quantity || 0)}x ${baseName || "Item"}${it.selectedSize ? ` (${it.selectedSize})` : ""}`;
        map.set(rate, [...(map.get(rate) || []), { label, amount: lineTotal }]);
      }

      for (const a of it.orderItemAddOns || []) {
        const addonRate = toNum((a as any).taxPercentage) ?? baseRateForAddons;
        const addonQty = Number(a.quantity || 1);
        const addonTotal = Number(a.addOnPrice || 0) * addonQty;
        const addonLabel = `+ ${a.addOnName}${addonQty > 1 ? ` x${addonQty}` : ""}`;
        map.set(addonRate, [...(map.get(addonRate) || []), { label: addonLabel, amount: addonTotal }]);
      }
    }

    return Array.from(map.entries())
      .map(([rate, groupLines]) => ({
        rate,
        lines: groupLines,
        subtotal: groupLines.reduce((s, l) => s + Number(l.amount || 0), 0),
      }))
      .filter((g) => g.lines.length > 0)
      .sort((a, b) => a.rate - b.rate);
  })();

  lines.push("Items:");
  for (const group of vatGroups) {
    lines.push(`VAT ${Number(group.rate).toFixed(0)}%`);
    for (const l of group.lines) {
      const price = formatMoney(Number(l.amount || 0), receiptCurrency);
      const left = l.label;
      const maxLeft = Math.max(0, lineWidth - price.length - 2);

      // If item name fits on one line with price, use original format
      if (left.length <= maxLeft) {
        lines.push(`${padRight(left, maxLeft)} ${price}`);
      } else {
        // Item name is too long, wrap it and put price on its own line
        const wrappedLines = safeLine(left, lineWidth);
        for (const line of wrappedLines) {
          lines.push(line);
        }
        lines.push(price);
      }
    }
    const subtotalLabel = "Subtotal";
    const subtotalValue = formatMoney(Number(group.subtotal || 0), receiptCurrency);
    const maxLeft = Math.max(0, lineWidth - subtotalValue.length - 2);
    lines.push(`${padRight(subtotalLabel, maxLeft)} ${subtotalValue}`);
    lines.push("-");
  }

  const total = Number(order.totalAmount || 0);
  const tax = Number(order.taxAmount || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const subtotal = total - deliveryFee - tax;
  const net = Math.max(0, total - tax);

  const vatLines = (() => {
    const map = new Map<number, number>();
    for (const it of items) {
      if ((it as any).itemType !== "DEAL") {
        const rate = toNum((it as any).taxPercentage);
        const amt = toNum((it as any).taxAmount) || 0;
        if (rate !== null && amt) map.set(rate, (map.get(rate) || 0) + amt);
      }
      for (const a of it.orderItemAddOns || []) {
        const ar = toNum((a as any).taxPercentage);
        const aa = toNum((a as any).taxAmount) || 0;
        if (ar !== null && aa) map.set(ar, (map.get(ar) || 0) + aa);
      }
    }
    return Array.from(map.entries())
      .map(([rate, amount]) => ({ rate, amount }))
      .filter((l) => l.amount !== 0)
      .sort((a, b) => a.rate - b.rate);
  })();

  // Use snapshot totals if available (immutable), otherwise use current order data
  const snapshotTotal = options?.billSnapshot?.totalAmount ? Number(options.billSnapshot.totalAmount) : null;
  const snapshotTax = options?.billSnapshot?.taxAmount ? Number(options.billSnapshot.taxAmount) : null;
  const displayTotal = snapshotTotal || total;
  const displayTax = snapshotTax || tax;
  const displayNet = Math.max(0, displayTotal - displayTax);

  const totals: Array<[string, string]> = [
    ["Payment", safeText(order.paymentMethod)],
    ["Gross total", formatMoney(displayTotal, receiptCurrency)],
    ["Net amount", formatMoney(displayNet, receiptCurrency)],
  ];

  if (vatLines.length > 0) {
    for (const l of vatLines) {
      totals.push([`VAT ${l.rate.toFixed(1)}%`, formatMoney(l.amount, receiptCurrency)]);
    }
  } else {
    totals.push(["VAT", formatMoney(displayTax, receiptCurrency)]);
  }

  totals.push(["VAT total", formatMoney(displayTax, receiptCurrency)]);

  if (deliveryFee) {
    totals.push(["Delivery fee", formatMoney(deliveryFee, receiptCurrency)]);
  }

  const isTaxInclusiveReceipt = (() => {
    const ti = (order as any)?.taxInclusive;
    return ti !== null && ti !== undefined ? Boolean(ti) : false;
  })();

  if (
    order.orderType === "PICKUP" &&
    (order as any).takeawayServiceFee !== undefined &&
    (order as any).takeawayServiceFee !== null &&
    Number((order as any).takeawayServiceFee) > 0
  ) {
    totals.push([
      "Takeaway service fee",
      formatMoney(Number((order as any).takeawayServiceFee), receiptCurrency),
    ]);

    if (
      !isTaxInclusiveReceipt &&
      (order as any).takeawayServiceTaxAmount !== undefined &&
      (order as any).takeawayServiceTaxAmount !== null &&
      Number((order as any).takeawayServiceTaxAmount) > 0
    ) {
      totals.push([
        "  Takeaway service tax",
        formatMoney(Number((order as any).takeawayServiceTaxAmount), receiptCurrency),
      ]);
    }
  }

  totals.push(["Subtotal", formatMoney(subtotal, receiptCurrency)]);

  const discountAmount = Number((order as any).discountAmount || 0);
  const discountType = (order as any).discountType as string | null | undefined;
  const discountValue = Number((order as any).discountValue || 0);
  if (discountAmount > 0) {
    totals.push(["Total before discount", formatMoney(total + discountAmount, receiptCurrency)]);
    const discountLabel =
      discountType === "PERCENTAGE"
        ? `Discount (${discountValue}%)`
        : "Discount (Fixed)";
    totals.push([discountLabel, `-${formatMoney(discountAmount, receiptCurrency)}`]);
  }

  totals.push(["TOTAL", formatMoney(displayTotal, receiptCurrency)]);

  // Hide refund section when viewing original bill (has snapshot)
  // The snapshot already contains the original immutable totals
  if (!options?.billSnapshot) {
    const succeededRefunds = ((order as any).refunds || []).filter(
      (r: any) => String(r.status || "").toUpperCase() === "SUCCEEDED"
    );
    const totalRefunded = succeededRefunds.reduce(
      (sum: number, r: any) => sum + Number(r.amount || 0),
      0
    );
    if (totalRefunded > 0) {
      succeededRefunds.forEach((r: any, i: number) => {
        const typeLabel =
          r.refundType === "ITEM_SPECIFIC"
            ? " (By Item)"
            : r.refundType === "PARTIAL"
            ? " (Partial)"
            : "";
        totals.push([`Refund #${i + 1}${typeLabel}`, `-${formatMoney(Number(r.amount || 0), receiptCurrency)}`]);
      });
      const netTotal = Math.max(0, displayTotal - totalRefunded);
      totals.push(["NET TOTAL", formatMoney(netTotal, receiptCurrency)]);
    }
  }

  for (const [label, value] of totals) {
    const left = label;
    const right = value;
    const maxLeft = Math.max(0, lineWidth - right.length - 2);
    lines.push(`${padRight(left, maxLeft)} ${right}`);
  }

  lines.push("-");

  // Voucher payment details
  const voucherPaymentAmount = Number((order as any)?.voucherPaymentAmount || 0);
  if (voucherPaymentAmount > 0) {
    lines.push(options?.translations?.voucherPayment || "Voucher Payment");
    lines.push(formatMoney(voucherPaymentAmount, receiptCurrency));
    
    const voucherCodes = (order as any)?.voucherCodes || [];
    const voucherRemainingBalances = (order as any)?.voucherRemainingBalances || {};
    
    if (voucherCodes.length > 0) {
      for (const code of voucherCodes) {
        lines.push(`${options?.translations?.voucherCode || "Voucher Code"}: ${code}`);
        const remaining = voucherRemainingBalances[code];
        if (remaining !== undefined) {
          lines.push(`${options?.translations?.remainingAmount || "Remaining Amount"}: ${formatMoney(Number(remaining), receiptCurrency)}`);
        } 
      }
    } 
    lines.push("-");
  }

  lines.push(`Items count: ${itemCount}`);
  if (order.orderType === "PICKUP" && order.pickupNotes) {
    for (const l of safeLine(`Note: ${order.pickupNotes}`, lineWidth)) lines.push(l);
  }
  if (order.orderType === "DELIVERY" && order.deliveryNotes) {
    for (const l of safeLine(`Note: ${order.deliveryNotes}`, lineWidth)) lines.push(l);
  }

  // Show refund details if this is a refund receipt
  if (options?.isRefund && options?.refundData) {
    lines.push("-");
    lines.push("REFUND DETAILS");
    if (options.refundData.refundType) {
      lines.push(`Type: ${options.refundData.refundType}`);
    }
    if (options.refundData.amount !== undefined) {
      lines.push(`Amount: ${formatMoney(Number(options.refundData.amount), receiptCurrency)}`);
    }
    if (options.refundData.status) {
      lines.push(`Status: ${options.refundData.status}`);
    }
    if (options.refundData.reason) {
      for (const l of safeLine(`Reason: ${options.refundData.reason}`, lineWidth)) lines.push(l);
    }
  }

  // Enhanced Fiskaly Technical Security System (when available)
  // When billSnapshot exists, use snapshot.fiscalTransaction to show original transaction data
  const fiscalTransaction = options?.billSnapshot?.fiscalTransaction;
  
  // For refunds, use the fiskalyCorrection data if available, otherwise fall back to regular signature
  const sig = options?.isRefund && options?.fiskalyCorrection 
    ? options.fiskalyCorrection 
    : (fiscalTransaction || options?.fiskalySignaturePayload);

  if (sig && typeof sig === "object") {

    lines.push("-");
    lines.push(options?.translations?.technicalSecurity || "Technical Security System (TSS)");

    const tssId = String(sig?.tssId || sig?.tss_id || "").trim();
    const clientId = String(sig?.clientId || sig?.client_id || "").trim();
    const txId = String(sig?.txId || sig?.tssTransactionId || sig?.transaction_id || "").trim();

    // For refunds, show both original and refund transaction IDs
    if (options?.isRefund && options?.refundData) {
      // Show original transaction IDs
      if (options.refundData.originalClientTransactionId) {
        lines.push(`${options?.translations?.originalClientTransactionId || "Original Client Transaction ID"}: ${options.refundData.originalClientTransactionId}`);
      }
      if (options.refundData.originalTssTransactionId) {
        lines.push(`${options?.translations?.originalTssTransactionId || "Original TSS Transaction ID"}: ${options.refundData.originalTssTransactionId}`);
      }
      // Show refund transaction IDs
      if (options.refundData.refundClientTransactionId) {
        lines.push(`${options?.translations?.refundClientTransactionId || "Refund Client Transaction ID"}: ${options.refundData.refundClientTransactionId}`);
      }
      if (options.refundData.refundTssTransactionId) {
        lines.push(`${options?.translations?.refundTssTransactionId || "Refund TSS Transaction ID"}: ${options.refundData.refundTssTransactionId}`);
      }
    } else {
      // Normal transaction: show single transaction ID
      lines.push(`${options?.translations?.tssId || "TSS ID"}: ${tssId || "-"}`);
      lines.push(`${options?.translations?.clientId || "Client ID"}: ${clientId || "-"}`);
      lines.push(`${options?.translations?.transactionId || "Transaction ID"}: ${txId || "-"}`);
    }

    const signatureCounter = sig?.response?.signature?.counter || 
                            sig?.response?.latest_revision ||
                            sig?.signature?.counter ||
                            sig?.signatureCounter ||
                            sig?.signature_counter;

    lines.push(
      `${options?.translations?.signatureCounter || "Signature Counter"}: ${
        signatureCounter !== undefined && signatureCounter !== null ? String(signatureCounter) : "-"
      }`
    );

    const startIso = (sig as any)?.response?.start_time || (sig as any)?.response?.time_start || (sig as any)?.startedAt || order.createdAt;
    const stopIso =
      (sig as any)?.response?.end_time || (sig as any)?.response?.time_end || (sig as any)?.finishedAt || order.updatedAt || order.createdAt;
    if (startIso) lines.push(`${options?.translations?.start || "Start"}: ${formatDateTime(String(startIso))}`);
    if (stopIso) lines.push(`${options?.translations?.stop || "Stop"}: ${formatDateTime(String(stopIso))}`);

    const tssSerial = String((sig as any)?.response?.tss_serial_number || "").trim();
    if (tssSerial) {
      lines.push(`${options?.translations?.tssSerial || "TSS Serial Number"}: ${tssSerial}`);
    }

    const signatureCandidates = [
      (sig as any)?.response?.signature?.value,
      (sig as any)?.response?.signature_value,
      (sig as any)?.signature?.value,
      (sig as any)?.signatureValue,
      (sig as any)?.response?.data?.signature?.value,
      (sig as any)?.response?.result?.signature?.value,
      (sig as any)?.signaturePayload?.response?.signature?.value,
    ];

    const signatureValue = signatureCandidates.find(s => 
      s && typeof s === 'string' && s.trim() !== ''
    );

    if (signatureValue) {
      const displaySig = signatureValue.length > 50 ? signatureValue.substring(0, 50) + "..." : signatureValue;
      for (const l of safeLine(`${options?.translations?.signature || "Signature"}: ${displaySig}`, lineWidth)) {
        lines.push(l);
      }
    }

    if (!options?.skipFiskalyQr) {
      lines.push(options?.translations?.fiskalyVerification || "Fiskaly Verification QR");
      lines.push("__QR_FISKALY__");
    }
  } else {
    // Basic Technical Security System (when no Fiskaly data)
    lines.push("-");
    lines.push(options?.translations?.technicalSecurity || "Technical Security System (TSS)");
    
    // Legal TSS Outage Fallback Text (German KassenSichV compliance)
    const isOutage = options?.isTssOutage || String(receiptCurrency).toUpperCase() === "EUR";
    if (isOutage) {
      lines.push("Sicherheitseinrichtung ausgefallen");
      lines.push("TSS-Ausfall (TSS Outage)");
      if (options?.offlineSequenceNumber) {
        lines.push(`Offline-Nr: ${options.offlineSequenceNumber}`);
      }
    }
    
    if (order.createdAt) lines.push(`${options?.translations?.start || "Start"}: ${formatDateTime(order.createdAt)}`);
    lines.push(`${options?.translations?.stop || "Stop"}: ${formatDateTime(order.updatedAt || order.createdAt)}`);
    lines.push(`${options?.translations?.transaction || "Transaction"}: ${order.orderNumber}`);
  }

  lines.push("-");
  lines.push("Powered by: Next Foody");

  return lines.join("\n");
};

export const buildEscPosBytes = (
  text: string,
  options?: {
    qrData?: string | null;
    qrDataByPlaceholder?: Record<string, string | null | undefined>;
    qrSize?: number;
    qrErrorCorrection?: "L" | "M" | "Q" | "H";
    qrPlaceholder?: string;
    printWidthChars?: number; // Number of characters per line (default: 32)
  }
) => {
  const init = Uint8Array.from([0x1b, 0x40]);
  const alignLeft = Uint8Array.from([0x1b, 0x61, 0x00]);
  const alignCenter = Uint8Array.from([0x1b, 0x61, 0x01]);

  const selectCodePage858 = Uint8Array.from([0x1b, 0x74, 0x13]);

  // Set print area width (GS W nL nH) - sets printable area width in dots
  // Typical 58mm printer: 384 dots, 80mm printer: 576 dots
  // For 32 characters at 12 dots/char: 384 dots
  const printWidthChars = options?.printWidthChars ?? 32;
  const printWidthDots = printWidthChars * 12; // Assume 12 dots per character
  const setPrintWidth = Uint8Array.from([0x1d, 0x57, printWidthDots & 0xff, (printWidthDots >> 8) & 0xff]);

  // Set left margin to 0 (GS L nL nH)
  const setLeftMargin = Uint8Array.from([0x1d, 0x4c, 0x00, 0x00]);

  const cp858Map: Record<string, number> = {
    "€": 0xd5,
    "Ä": 0x8e,
    "Ö": 0x99,
    "Ü": 0x9a,
    "ä": 0x84,
    "ö": 0x94,
    "ü": 0x81,
    "ß": 0xe1,
    "é": 0x82,
    "è": 0x8a,
    "à": 0x85,
    "á": 0xa0,
    "ç": 0x87,
    "Ç": 0x80,
    "ñ": 0xa4,
    "Ñ": 0xa5,
    "í": 0xa1,
    "ó": 0xa2,
    "ú": 0xa3,
    "É": 0x90,
  };

  const encodeCp858 = (input: string): Uint8Array => {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const ch = input[i] as string;
      const code = input.charCodeAt(i);

      if (code <= 0x7f) {
        out[i] = code;
        continue;
      }

      const mapped = cp858Map[ch];
      out[i] = typeof mapped === "number" ? mapped : 0x3f;
    }
    return out;
  };

  const qrData = options?.qrData ? String(options.qrData) : "";
  const qrSize = Math.max(1, Math.min(16, Number(options?.qrSize ?? 6)));
  const qrErrorCorrection = options?.qrErrorCorrection ?? "M";
  const qrPlaceholder = options?.qrPlaceholder ?? "__QR__";
  const qrDataByPlaceholder = options?.qrDataByPlaceholder || {};

  const bytesParts: Uint8Array[] = [];
  const push = (p: Uint8Array) => bytesParts.push(p);

  const pushQr = (data: string) => {
    if (!data) return;

    // ESC/POS printers have QR data length limits (typically 200-300 bytes)
    // If data is too long, truncate it to avoid "QR CREAT ERR" from printer
    const maxQrDataLength = 250;
    let truncatedData = data;
    if (data.length > maxQrDataLength) {
      // Try to parse as JSON and keep only essential fields
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed === 'object' && parsed !== null) {
          // Keep only essential verification fields, remove long signature
          const compact = {
            p: parsed.provider || parsed.p || 'fiskaly',
            t: parsed.tss_id || parsed.t || '',
            c: parsed.client_id || parsed.c || '',
            x: parsed.tx_id || parsed.x || '',
            s: parsed.signature_counter || parsed.s || '',
            v: parsed.verification_url || parsed.v || 'https://verify.fiskaly.com/'
          };
          truncatedData = JSON.stringify(compact);
        }
      } catch {
        // If not JSON, just truncate
        truncatedData = data.substring(0, maxQrDataLength);
      }
    }

    const qrBytes = encodeCp858(truncatedData);

    push(alignCenter);
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, qrSize]));

    const eccByte =
      qrErrorCorrection === "L"
        ? 48
        : qrErrorCorrection === "M"
          ? 49
          : qrErrorCorrection === "Q"
            ? 50
            : 51;
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, eccByte]));

    const storeLen = qrBytes.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;
    push(Uint8Array.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]));
    push(qrBytes);

    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
    push(encodeCp858("\n\n"));
    push(alignLeft);
  };

  push(init);
  push(selectCodePage858);
  push(setLeftMargin); // Set left margin to 0 before setting print width
  push(setPrintWidth); // Set print area width
  push(alignLeft);

  // Multi-placeholder support (order + address QR + Fiskaly QR) with backward-compatible single placeholder.
  const placeholders = ["__QR_ORDER__", "__QR_ADDRESS__", "__QR_FISKALY__", qrPlaceholder].filter(
    (p, idx, arr) => arr.indexOf(p) === idx
  );

  let remaining = text;
  while (true) {
    let nextIdx = -1;
    let nextPh: string | null = null;
    for (const ph of placeholders) {
      const idx = remaining.indexOf(ph);
      if (idx === -1) continue;
      if (nextIdx === -1 || idx < nextIdx) {
        nextIdx = idx;
        nextPh = ph;
      }
    }

    if (nextIdx === -1 || !nextPh) {
      push(encodeCp858(remaining));
      break;
    }

    const before = remaining.slice(0, nextIdx);
    push(encodeCp858(before));
    if (before.length > 0 && before[before.length - 1] !== "\n") {
      push(encodeCp858("\n"));
    }

    const data =
      typeof qrDataByPlaceholder[nextPh] === "string"
        ? String(qrDataByPlaceholder[nextPh])
        : nextPh === qrPlaceholder
          ? qrData
          : "";
    if (data) pushQr(data);

    remaining = remaining.slice(nextIdx + nextPh.length);
    if (remaining.startsWith("\r\n")) {
      remaining = remaining.slice(2);
    } else if (remaining.startsWith("\n")) {
      remaining = remaining.slice(1);
    }
  }

  push(encodeCp858("\n\n"));
  push(encodeCp858("\n"));
  const cut = Uint8Array.from([0x1d, 0x56, 0x00]);
  push(cut);

  const totalLen = bytesParts.reduce((sum, p) => sum + p.length, 0);
  const all = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of bytesParts) {
    all.set(p, offset);
    offset += p.length;
  }
  return all;
};
