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
    lines.push(rest.slice(0, max));
    rest = rest.slice(max);
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
    const d = new Date(iso);
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

    // ASCII-only output to avoid printers rendering locale spaces/symbols as black blocks.
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
    };
    fiskalySignaturePayload?: any;
  const receiptCurrency = (() => {
    const opt = typeof options?.currency === "string" ? options.currency.trim() : "";
    if (opt) return opt;
    const fromOrder = typeof (order as any)?.currency === "string" ? String((order as any).currency).trim() : "";
    return fromOrder || "USD";
  })();

  const lines: string[] = [];

  const headerBusinessName = String(options?.header?.businessName || "").trim();
  const businessName = headerBusinessName || order.branch?.name || "MISSED";
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
  lines.push("RECEIPT");
  lines.push("-");
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
      if (normalized.street && normalized.house)
        return `${normalized.street} ${normalized.house}`;
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

      // For deals, the deal parent is a container. The actual items/tax are represented by DEAL_COMPONENT children.
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
      const maxLeft = Math.max(0, lineWidth - price.length - 1);
      const leftTrimmed = left.length > maxLeft ? left.slice(0, maxLeft) : left;
      lines.push(`${padRight(leftTrimmed, maxLeft)} ${price}`);
    }
    const subtotalLabel = "Subtotal";
    const subtotalValue = formatMoney(Number(group.subtotal || 0), receiptCurrency);
    const maxLeft = Math.max(0, l tax);

  // Use snapshot totals if available (immutable), otherwise use current order data
  constisnapshonTotal = options?.billSnapshot?.totalAmount ? Number(options.billSnapshot.totalAmount) : null;
  const snapshotTax = options?.billSnapshot?.taxAmount ? Number(options.billSnapshot.taxAmount) : null;
  const displayTotal = snapshotTotal || total;
  const displayTax = snapshotTax || tax;
  const displayNet = Math.max(0, displayTotal - displayTeWidth - subtotalValue.length - 1);
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
    totals.push(["VAT", formatMoney(tax, receiptCurrency)]);
  }

  totals.push(["VAT total", formatMoney(tax, receiptCurrency)]);

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
oney(subtotal, receiptCurrency)]);
  totals.push(["TOTAL", formatMoney(displayTotal, receiptCurrency)]);

  // Hide refund section when viewing original bill (has snapshot)
  // The snapshot already contains the original immutable totals
  if (!options?.billSnapshot) {
    cnst succeededRefunds = ((order as any).refunds || []).filter(
      (r: any) => String(r.status || "").toUpperCase() === "SUCCEEDED"
    );
    const totalRefunded = succeededRefunds.reduce(
      (sum: umbr, r: an) => sum + Number(r.amount || 0),
      0
    );
    if totalRefunded > 0) {
      ucceededRefnds.forEach((r: any, i: numer) => {
        const typeLabel =
          r.refundType === "ITEM_SPECIFIC"
            ? " (By Item)"
            : r.refundType === "PARTIAL"
            ? " (Partial)"
            : "";
        s.push([`Refund #${i + 1}${typeLabel}``-${fomatMony(Number(r.amount || 0), re}`
      });
      const ne T if  = Math.max(0, displayTotal - totalRefunded);
      total(NET neT
    }
  }
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
  totals.push(["TOTAL", formatMoney(total, receiptCurrency)]);

  for (const [label, value] of totals) {
    const left = label;
    const right = value;
    const maxLeft = Math.max(0, lineWidth - right.length - 1);
    lines.push(`${padRight(left, maxLeft)} ${right}`);
  }

  lines.push("-");

  lines.push(`Items count: ${itemCount}`);
  if (order.orderType === "PICKUP" && order.pickupNotes) {
    for (const l of safeLine(`Note: ${order.pickupNotes}`, lineWidth)) lines.push(l);
  }
  if (order.orderType === "DELIVERY" && order.deliveryNotes) {
    for (const l of safeLine(`Note: ${order.deliveryNotes}`, lineWidth)) lines.push(l);
  }

  lines.push("-");

  // When billSnapshot exists, use snapshot.fiscalTransaction to show original transaction data
  const fiscalTransaction = options?.billSnapshot?.fiscalTransaction;
  const fiskalySignaturePayload = fiscalTransaction || options?.fiskalySignaturePayload;

  lines.push(options?.translations?.technicalSecurity || "Technical security");
  if (fiskalySignaturePayload) {
    const sig = fiskalySignaturePayload as any;
    const response = sig?.response;

    const signatureCandidates = [
      response?.signature?.value,
      response?.signature_value,
      sig?.signature?.value,
      sig?.signatureValue,
      response?.data?.signature?.value,
      response?.result?.signature?.value,
    ];
    const signatureValue =
      signatureCandidates.find((s) => s && typeof s === "string" && s.trim() !== "") || "";

    const signatureCounter =
      response?.signature?.counter ||
      response?.latest_revision ||
      sig?.signature?.counter ||
      sig?.signatureCounter;

    const tssSerial =
      response?.tss_serial_number ||
      response?.tssSerialNumber ||
      sig?.tssSerialNumber ||
      sig?.tss_serial_number;

    lines.push(
      `${options?.translations?.tssId || "TSS ID"}: ${String(sig?.tssId || "-")}`
    );
    lines.push(
      `${options?.translations?.clientId || "Client ID"}: ${String(sig?.clientId || "-")}`
    );
    lines.push(
      `${options?.translations?.transactionId || "Transaction ID"}: ${String(sig?.txId || "-")}`
    );
    if (String(tssSerial || "").trim()) {
      lines.push(
        `${options?.translations?.tssSerial || "TSS Serial Number"}: ${String(tssSerial)}`
      );
    }
    lines.push(
      `${options?.translations?.signatureCounter || "Signature Counter"}: ${String(
        signatureCounter ?? "-"
      )}`
    );
    lines.push(
      `${options?.translations?.start || "Start"}: ${formatDateTime(
        String(response?.start_time || order.createdAt || "")
      )}`
    );
    lines.push(
      `${options?.translations?.stop || "Stop"}: ${formatDateTime(
        String(response?.end_time || order.updatedAt || order.createdAt || "")
      )}`
    );
    if (signatureValue) {
      for (const l of safeLine(
        `${options?.translations?.signature || "Signature"}: ${signatureValue}`,
        lineWidth
      ))
        lines.push(l);
    }

    lines.push("-");
    lines.push(options?.translations?.fiskalyVerification || "Fiskaly Verification (QR)");
    lines.push("__QR_FISKALY__");
    if (options?.translations?.fiskalyQrInstructions) {
      for (const l of safeLine(options.translations.fiskalyQrInstructions, lineWidth)) lines.push(l);
    }
  } else {
    if (order.createdAt) {
      lines.push(
        `${options?.translations?.start || "Start"}: ${formatDateTime(order.createdAt)}`
      );
    }
    lines.push(
      `${options?.translations?.stop || "Stop"}: ${formatDateTime(
        order.updatedAt || order.createdAt
      )}`
    );
    lines.push(
      `${options?.translations?.transaction || "Transaction"}: ${String(order.orderNumber || "")}`
    );
  }

  lines.push("-");
  lines.push("Powered by: GMS pro");

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
  }
) => {
  const init = Uint8Array.from([0x1b, 0x40]);
  const alignLeft = Uint8Array.from([0x1b, 0x61, 0x00]);
  const alignCenter = Uint8Array.from([0x1b, 0x61, 0x01]);

  const selectCodePage858 = Uint8Array.from([0x1b, 0x74, 0x13]);

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

    const qrBytes = encodeCp858(data);

    // QR model 2
    push(alignCenter);
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
    // size (1..16)
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, qrSize]));
    // error correction
    const eccByte =
      qrErrorCorrection === "L"
        ? 48
        : qrErrorCorrection === "M"
          ? 49
          : qrErrorCorrection === "Q"
            ? 50
            : 51;
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, eccByte]));

    // store data: pL pH 31 50 30 + data
    const storeLen = qrBytes.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;
    push(Uint8Array.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]));
    push(qrBytes);

    // print symbol
    push(Uint8Array.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
    push(encodeCp858("\n\n"));
    push(alignLeft);
  };

  push(init);
  push(selectCodePage858);
  push(alignLeft);

  // Multi-placeholder support (order + address QR) with backward-compatible single placeholder.
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
