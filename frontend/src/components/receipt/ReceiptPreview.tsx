import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiDownload, mdiPrinter } from "@mdi/js";
import { formatPrice } from "@/utils/currency";
import { getLocalizedName } from "@/utils/localization";

type Props = {
  order: any;
  settings: any | null;
  branchDetails: any | null;
  fiskalySignaturePayload?: any | null;
  fiskalyCorrections?: any[];
  showPrint?: boolean;
  onClose?: () => void;
};

export const ReceiptPreview: React.FC<Props> = ({
  order,
  settings,
  branchDetails,
  fiskalySignaturePayload,
  fiskalyCorrections,
  showPrint = false,
  onClose,
}) => {
  const { t, i18n } = useTranslation();

  const receiptCurrency = String(order?.currency || settings?.currency || "USD");

  const formatReceiptDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const dd = d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const tt = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dd} ${tt}`;
  };

  const headerName = useMemo(() => {
    const orgNameFromOrder = String((order as any)?.branch?.organization?.name || "").trim();
    const orgNameFa = (order as any)?.branch?.organization?.nameFa as string | null | undefined;
    const settingsBusinessName = String(settings?.businessName || "").trim() || orgNameFromOrder;
    const localizedBusinessName = getLocalizedName(settingsBusinessName, orgNameFa, i18n.language);
    const branchName = String(branchDetails?.name || order?.branch?.name || "").trim();
    if (localizedBusinessName && branchName && localizedBusinessName !== branchName) {
      return `${localizedBusinessName} - ${branchName}`;
    }
    return branchName || localizedBusinessName || "MISSED";
  }, [branchDetails?.name, order?.branch?.name, settings?.businessName, order?.branch?.organization?.nameFa, i18n.language]);

  const businessPhone = String(settings?.businessPhone || "").trim();

  const customerName = useMemo(() => {
    const u = order?.user;
    if (u) {
      const full = `${u.firstName || ""} ${u.lastName || ""}`.trim();
      return full || u.email || "";
    }
    return order?.guestName || t("receipt.guest", { defaultValue: "Guest" });
  }, [order?.guestName, order?.user, t]);

  const customerPhone =
    order?.user?.phone ||
    order?.guestPhone ||
    order?.deliveryPhone ||
    order?.pickupPhone ||
    "";

  const createdAtLabel = formatReceiptDateTime(order?.createdAt);

  const getQrUrl = (value: string, size: number = 140) => {
    const data = encodeURIComponent(value);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
  };

  const orderQrPayload = useMemo(() => {
    const token = (order as any)?.deliveryLinkToken as string | undefined;
    if (!token) return null;

    const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
    const origin = base.replace(/\/+$/, "");
    return `${origin}/order/${order.id}?token=${encodeURIComponent(token)}`;
  }, [order?.id, settings]);

  const deliveryAddressQrPayload = useMemo(() => {
    if (order?.orderType !== "DELIVERY") return null;
    const token = (order as any)?.deliveryLinkToken as string | undefined;
    if (!token) return null;

    const base = String((settings as any)?.publicAppUrl || "https://nextfoody.com").trim() || "https://nextfoody.com";
    const origin = base.replace(/\/+$/, "");
    return `${origin}/delivery/${order.id}?token=${encodeURIComponent(token)}`;
  }, [order?.id, order?.orderType, settings]);

  const items = Array.isArray(order?.orderItems) ? order.orderItems : [];

  const toNum = (v: any) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const itemsGroupedByVat = useMemo(() => {
    const map = new Map<number, Array<{ key: string; label: string; amount: number }>>();

    for (const it of items) {
      const baseRateForAddons = toNum((it as any).taxPercentage) ?? 0;

      if ((it as any).itemType !== "DEAL") {
        const rate = toNum((it as any).taxPercentage) ?? 0;
        const lineTotal = Number((it as any).totalPrice ?? (it as any).unitPrice * (it as any).quantity);
        const baseName =
          (it as any).itemType === "DEAL_COMPONENT"
            ? ((it as any).dealComponent?.name || (it as any).dealComponentName)
            : (it as any).meal?.name || (it as any).deal?.name;
        const label = `${Number((it as any).quantity || 0)}x ${baseName || "Item"}${(it as any).selectedSize ? ` (${(it as any).selectedSize})` : ""}`;
        map.set(rate, [...(map.get(rate) || []), { key: (it as any).id || label, label, amount: lineTotal }]);
      }

      for (const a of (it as any).orderItemAddOns || []) {
        const addonRate = toNum((a as any).taxPercentage) ?? baseRateForAddons;
        const addonTotal = Number((a as any).addOnPrice || 0) * Number((a as any).quantity || 1);
        const addonLabel = `+ ${(a as any).addOnName || "Add-on"}${(a as any).quantity && Number((a as any).quantity) > 1 ? ` x${Number((a as any).quantity)}` : ""}`;
        map.set(addonRate, [...(map.get(addonRate) || []), { key: `${(it as any).id || "item"}:${(a as any).id || addonLabel}`, label: addonLabel, amount: addonTotal }]);
      }
    }

    return Array.from(map.entries())
      .map(([rate, lines]) => ({
        rate,
        lines,
        subtotal: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
      }))
      .filter((g) => g.lines.length > 0)
      .sort((a, b) => a.rate - b.rate);
  }, [items]);

  const total = Number(order?.totalAmount || 0);
  const tax = Number(order?.taxAmount || 0);
  const deliveryFee = Number(order?.deliveryFee || 0);
  const net = Math.max(0, total - tax);

  const isTaxInclusiveReceipt =
    (order as any)?.taxInclusive !== null && (order as any)?.taxInclusive !== undefined
      ? Boolean((order as any).taxInclusive)
      : (branchDetails?.taxInclusive ?? settings?.taxInclusive ?? false) === true;

  const vatLines = useMemo(() => {
    const map = new Map<number, number>();

    for (const it of items) {
      if ((it as any).itemType !== "DEAL") {
        const rate = toNum((it as any).taxPercentage);
        const amt = toNum((it as any).taxAmount) || 0;
        if (rate !== null && amt) map.set(rate, (map.get(rate) || 0) + amt);
      }
      for (const a of (it as any).orderItemAddOns || []) {
        const ar = toNum((a as any).taxPercentage);
        const aa = toNum((a as any).taxAmount) || 0;
        if (ar !== null && aa) map.set(ar, (map.get(ar) || 0) + aa);
      }
    }

    return Array.from(map.entries())
      .map(([rate, amount]) => ({ rate, amount }))
      .filter((l) => l.amount !== 0)
      .sort((a, b) => a.rate - b.rate);
  }, [items]);

  const paymentMethodShort = (() => {
    const m = String(order?.paymentMethod || "");
    if (m === "CASH_ON_DELIVERY") return t("receipt.paymentMethodShort.cash", { defaultValue: "CASH" });
    if (m === "CARD_ON_DELIVERY") return t("receipt.paymentMethodShort.card", { defaultValue: "CARD" });
    if (m === "ONLINE_PAYMENT") return t("receipt.paymentMethodShort.online", { defaultValue: "ONLINE" });
    return m;
  })();

  const getFiskalyQrData = (payload?: any) => {
    const sig = (payload ?? fiskalySignaturePayload) as any;
    if (!sig) return "";

    const officialQr =
      String(sig?.qrCodeData || sig?.qr_code_data || "").trim() ||
      String(sig?.response?.qr_code_data || sig?.response?.qrCodeData || "").trim() ||
      String(sig?.response?.schema?.standard_v1?.receipt?.qr_code_data || "").trim();
    if (officialQr) return officialQr;

    const tssId = String(sig?.tssId || "").trim();
    const txId = String(sig?.txId || "").trim();
    const clientId = String(sig?.clientId || "").trim();

    const signatureCounter =
      sig?.response?.signature?.counter ||
      sig?.response?.latest_revision ||
      sig?.signature?.counter ||
      sig?.signatureCounter;

    const signatureCandidates = [
      sig?.response?.signature?.value,
      sig?.response?.signature_value,
      sig?.signature?.value,
      sig?.signatureValue,
      sig?.response?.data?.signature?.value,
      sig?.response?.result?.signature?.value,
    ];

    const signatureValue =
      signatureCandidates.find((s) => s && typeof s === "string" && s.trim() !== "") || "";

    const receiptNumber = String(sig?.receiptNumber || "").trim();
    const receiptDate = sig?.receiptDate;
    const amount = sig?.amount;
    const currency = sig?.currency;

    const qrData = {
      provider: "fiskaly",
      tss_id: tssId,
      client_id: clientId,
      tx_id: txId,
      signature_counter: signatureCounter,
      signature: signatureValue,
      receipt_number: receiptNumber,
      receipt_date: receiptDate,
      amount,
      currency,
      verification_url: "https://verify.fiskaly.com/",
    };

    return JSON.stringify(qrData);
  };

  const fiskalyQrSignaturePayload = useMemo(() => {
    const isCancelledOrder = String((order as any)?.status || "") === "CANCELLED";
    if (!isCancelledOrder || !Array.isArray(fiskalyCorrections)) return fiskalySignaturePayload;

    const cancellationCorrection = (fiskalyCorrections as any[]).find(
      (c) => String((c as any)?.type || "") === "CANCELLATION" && Boolean((c as any)?.signaturePayload)
    );
    return (cancellationCorrection as any)?.signaturePayload || fiskalySignaturePayload;
  }, [order, fiskalySignaturePayload, fiskalyCorrections]);

  const fiskalyQrData = useMemo(
    () => getFiskalyQrData(fiskalyQrSignaturePayload),
    [fiskalyQrSignaturePayload]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    try {
      const receipt = document.querySelector(".receipt") as HTMLElement | null;
      if (!receipt) {
        handlePrint();
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.justifyContent = "center";
      wrapper.style.padding = "24px";
      wrapper.style.background = "#ffffff";
      wrapper.appendChild(receipt.cloneNode(true));

      const doc = `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${String(order?.orderNumber || "").trim()}</title>
<style>
  body { margin:0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .receipt { width:320px; }
</style>
</head><body>${wrapper.innerHTML}</body></html>`;

      const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${String(order?.orderNumber || "order").trim()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      handlePrint();
    }
  };

  if (!order) return null;

  return (
    <div className="receipt-print-wrapper space-y-4">
      <style>{`
@media print {
  @page { margin: 12mm; }
  html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
}
      `}</style>

      {(showPrint || onClose) && (
        <div className="no-print flex justify-end gap-3">
          {onClose ? (
            <Button variant="outline" onClick={onClose} className="bg-transparent hover:bg-transparent">
              {t("common.close", { defaultValue: "Close" })}
            </Button>
          ) : null}
          {showPrint ? (
            <>
              <Button
                variant="outline"
                onClick={handleDownload}
                className="bg-transparent hover:bg-transparent"
              >
                <Icon path={mdiDownload} size={0.67} className="mr-2" />
                {t("common.download", { defaultValue: "Download" })}
              </Button>
              <Button onClick={handlePrint} className="bg-pink-500 hover:bg-pink-600 text-white">
                <Icon path={mdiPrinter} size={0.67} className="mr-2" />
                {t("common.print", { defaultValue: "Print" })}
              </Button>
            </>
          ) : null}
        </div>
      )}

      <div className="receipt-print-root flex justify-center">
        <div className="receipt w-[320px] bg-white text-black rounded-md border border-gray-200 p-4 font-mono text-[12px] leading-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 max-w-[58%]">
              <div className="text-[14px] font-bold leading-4">{headerName}</div>
              {(() => {
                const rawAddr =
                  String((branchDetails as any)?.address || "").trim() ||
                  String((settings as any)?.addressLineOne || "").trim() ||
                  String((settings as any)?.businessAddress || "").trim();

                const zip =
                  String((branchDetails as any)?.zipCode || "").trim() ||
                  String((settings as any)?.zipCode || "").trim();

                const city =
                  String((branchDetails as any)?.city || "").trim() ||
                  String((settings as any)?.city || "").trim();

                if (!rawAddr && !zip && !city) return null;

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

                const line1 = rawAddr ? normalizeStreetLine(rawAddr) : "";
                const line2 = [zip, city].filter(Boolean).join(" ");

                return (
                  <div className="mt-1 text-[10px] leading-4 space-y-1">
                    {line1 ? <div>{line1}</div> : null}
                    {line2 ? <div>{line2}</div> : null}
                  </div>
                );
              })()}
              {businessPhone ? (
                <div className="mt-1 text-[10px] leading-4">Tel. {businessPhone}</div>
              ) : null}
            </div>

            <div className="text-right max-w-[42%] min-w-[120px]">
              <div className="text-[16px] font-extrabold tracking-wide">
                {t("receipt.documentTitle", { defaultValue: "Invoice" })}
              </div>
              {String(order?.status || "") === "CANCELLED" ? (
                <>
                  <div className="mt-1 text-[10px] font-bold text-red-600">
                    {t("receipt.cancelledDocumentLabel", {
                      defaultValue: "STORNO / Cancelled",
                    })}
                  </div>
                  <div className="mt-1 text-[10px] break-words">
                    {t("receipt.cancellationReasonLabel", {
                      defaultValue: "Cancellation reason",
                    })}
                    : {String((order as any)?.cancellationReason || "").trim() ||
                      t("receipt.cancellationReasonNotProvided", {
                        defaultValue: "Not provided",
                      })}
                  </div>
                </>
              ) : null}
              <div className="mt-1 text-[10px] break-all">
                {t("receipt.orderNumber", { defaultValue: "Order No" })}: #{String(order?.orderNumber || "").trim()}
              </div>
              <div className="mt-1 text-[10px]">
                {t("receipt.date", { defaultValue: "Date" })}: {createdAtLabel}
              </div>
            </div>
          </div>

          <div className="mt-3 text-[11px] leading-4">
            <div className="flex justify-between gap-3">
              <div className="text-muted-foreground">{t("receipt.orderType", { defaultValue: "Order type" })}</div>
              <div className="font-bold">{String(order?.orderType || "").toUpperCase()}</div>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-gray-400" />

          <div className="space-y-2 text-[11px] leading-4">
            <div>
              <div className="font-bold">{t("receipt.customer", { defaultValue: "Customer" })}</div>
              <div className="mt-1">{customerName}</div>
              {customerPhone ? (
                <div className="mt-1">
                  {t("receipt.phone", { defaultValue: "Phone" })}: {customerPhone}
                </div>
              ) : null}
            </div>

            {order?.orderType === "DELIVERY" && (order?.deliveryAddress || (order as any)?.deliveryStreetAddress) ? (
              <div>
                <div className="font-bold">{t("receipt.deliveryAddress", { defaultValue: "Delivery address" })}</div>
                <div className="mt-1">
                  {String((order as any)?.deliveryStreetAddress || order?.deliveryAddress || "").trim()}
                </div>
              </div>
            ) : null}

            {orderQrPayload ? (
              <div className="pt-1">
                <div className="font-bold">{t("receipt.orderQr", { defaultValue: "Order (QR)" })}</div>
                <div className="mt-1 flex justify-center">
                  <img
                    src={getQrUrl(orderQrPayload, 140)}
                    width={140}
                    height={140}
                    alt="Order details QR"
                    className="bg-white"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : null}

            {deliveryAddressQrPayload ? (
              <div className="pt-1">
                <div className="font-bold">{t("receipt.addressQr", { defaultValue: "Address (QR)" })}</div>
                <div className="mt-1 flex justify-center">
                  <img
                    src={getQrUrl(deliveryAddressQrPayload, 140)}
                    width={140}
                    height={140}
                    alt="Delivery address QR"
                    className="bg-white"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="my-3 border-t border-dashed border-gray-400" />

          <div className="space-y-2">
            {itemsGroupedByVat.map((group) => (
              <div key={`vat-group-${group.rate}`}>
                <div className="font-bold text-[12px]">
                  {t("receipt.vat", { defaultValue: "VAT" })}: {Number(group.rate).toFixed(0)}
                </div>
                <div className="mt-1 space-y-1">
                  {group.lines.map((l) => (
                    <div key={l.key} className="flex justify-between gap-3">
                      <div className="flex-1 wrap-break-word">{l.label}</div>
                      <div className="shrink-0">{formatPrice(l.amount, receiptCurrency)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between font-bold">
                  <div>{t("receipt.subtotal", { defaultValue: "Subtotal" })}:</div>
                  <div>{formatPrice(group.subtotal, receiptCurrency)}</div>
                </div>
                <div className="my-2 border-t border-dashed border-gray-300" />
              </div>
            ))}
          </div>

          <div className="my-3 border-t border-dashed border-gray-400" />

          <div className="space-y-1 text-[11px] leading-4">
            <div className="flex justify-between font-bold">
              <div>{t("receipt.payment", { defaultValue: "Payment" })}</div>
              <div>{paymentMethodShort}</div>
            </div>

            <div className="flex justify-between font-bold">
              <div>{t("receipt.grossTotal", { defaultValue: "Gross total" })}:</div>
              <div>{formatPrice(total, receiptCurrency)}</div>
            </div>

            <div className="flex justify-between">
              <div>{t("receipt.netAmount", { defaultValue: "Net amount" })}</div>
              <div>{formatPrice(net, receiptCurrency)}</div>
            </div>

            {vatLines.length > 0
              ? vatLines.map((l) => (
                  <div key={l.rate} className="flex justify-between">
                    <div>
                      {isTaxInclusiveReceipt
                        ? `${t("receipt.includedVat", { defaultValue: "Included VAT" })} ${l.rate.toFixed(1)}%`
                        : `${t("receipt.vat", { defaultValue: "VAT" })} ${l.rate.toFixed(1)}%`}
                    </div>
                    <div>{formatPrice(l.amount, receiptCurrency)}</div>
                  </div>
                ))
              : (
                <div className="flex justify-between">
                  <div>
                    {isTaxInclusiveReceipt
                      ? t("receipt.includedVat", { defaultValue: "Included VAT" })
                      : t("receipt.vat", { defaultValue: "VAT" })}
                  </div>
                  <div>{formatPrice(tax, receiptCurrency)}</div>
                </div>
              )}

            <div className="flex justify-between">
              <div>{t("receipt.vatTotal", { defaultValue: "VAT total" })}:</div>
              <div>{formatPrice(tax, receiptCurrency)}</div>
            </div>

            {deliveryFee ? (
              <div className="flex justify-between">
                <div>{t("receipt.deliveryFee", { defaultValue: "Delivery fee" })}</div>
                <div>{formatPrice(deliveryFee, receiptCurrency)}</div>
              </div>
            ) : null}
          </div>

          {fiskalySignaturePayload ? (
            <>
              <div className="my-3 border-t border-dashed border-gray-400" />

              <div className="space-y-1 text-[10px] leading-4">
                <div className="font-bold">
                  {t("receipt.technicalSecurity", { defaultValue: "Technical security" })}
                </div>

                {(() => {
                  const isCancelledOrder = String((order as any)?.status || "") === "CANCELLED";
                  const cancellationCorrection = isCancelledOrder
                    ? (Array.isArray(fiskalyCorrections)
                        ? (fiskalyCorrections as any[]).find(
                            (c) => String((c as any)?.type || "") === "CANCELLATION"
                          )
                        : null)
                    : null;

                  const cancellationSig = (cancellationCorrection as any)?.signaturePayload || null;
                  const originalSig = fiskalySignaturePayload as any;

                  if (!isCancelledOrder || !cancellationSig) {
                    return (
                      <>
                        <div className="flex gap-1">
                          <span className="shrink-0">{t("receipt.tssId", { defaultValue: "TSS ID" })}:</span>
                          <span className="min-w-0 break-all whitespace-normal">
                            {String((originalSig as any)?.tssId || "-")}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <span className="shrink-0">{t("receipt.clientId", { defaultValue: "Client ID" })}:</span>
                          <span className="min-w-0 break-all whitespace-normal">
                            {String((originalSig as any)?.clientId || "-")}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <span className="shrink-0">{t("receipt.transactionId", { defaultValue: "Transaction ID" })}:</span>
                          <span className="min-w-0 break-all whitespace-normal">
                            {String((originalSig as any)?.txId || "-")}
                          </span>
                        </div>

                        <div className="flex gap-1">
                          <span className="shrink-0">{t("receipt.tssSerial", { defaultValue: "TSS Serial Number" })}:</span>
                          <span className="min-w-0 break-all whitespace-normal">
                            {String(
                              (originalSig as any)?.response?.tss_serial_number ||
                                (originalSig as any)?.response?.tssSerialNumber ||
                                (originalSig as any)?.tssSerialNumber ||
                                (originalSig as any)?.tss_serial_number ||
                                "-"
                            )}
                          </span>
                        </div>

                        <div>
                          {t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: {String(
                            ((originalSig as any)?.response?.signature?.counter ||
                              (originalSig as any)?.response?.latest_revision ||
                              (originalSig as any)?.signature?.counter ||
                              (originalSig as any)?.signatureCounter) ?? "-"
                          )}
                        </div>

                        <div>
                          {t("receipt.start", { defaultValue: "Start" })}: {formatReceiptDateTime(
                            String((originalSig as any)?.response?.start_time || order?.createdAt || "")
                          )}
                        </div>
                        <div>
                          {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(
                            String((originalSig as any)?.response?.end_time || order?.updatedAt || order?.createdAt || "")
                          )}
                        </div>
                      </>
                    );
                  }

                  const cancellationTxId = String(
                    (cancellationSig as any)?.txId || (cancellationSig as any)?.response?.tx_id || "-"
                  );
                  const cancellationCounter =
                    (cancellationSig as any)?.response?.signature?.counter ||
                    (cancellationSig as any)?.response?.latest_revision ||
                    (cancellationSig as any)?.signature?.counter ||
                    (cancellationSig as any)?.signatureCounter;
                  const cancellationStop =
                    (cancellationSig as any)?.response?.end_time ||
                    (cancellationSig as any)?.response?.time_end;

                  return (
                    <>
                      <div className="flex gap-1">
                        <span className="shrink-0">{t("receipt.tssId", { defaultValue: "TSS ID" })}:</span>
                        <span className="min-w-0 break-all whitespace-normal">
                          {String((originalSig as any)?.tssId || "-")}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <span className="shrink-0">{t("receipt.clientId", { defaultValue: "Client ID" })}:</span>
                        <span className="min-w-0 break-all whitespace-normal">
                          {String((originalSig as any)?.clientId || "-")}
                        </span>
                      </div>
                      <div>
                        {t("receipt.fiskalyOriginalTransaction", {
                          defaultValue: "Original transaction",
                        })}: {String((originalSig as any)?.txId || "-")}
                      </div>
                      <div>
                        {t("receipt.fiskalyCancellationTransaction", {
                          defaultValue: "Cancellation transaction",
                        })}: {cancellationTxId}
                      </div>
                      <div>
                        {t("receipt.signatureCounter", { defaultValue: "Signature Counter" })}: {String(
                          cancellationCounter ?? "-"
                        )}
                      </div>
                      {cancellationStop ? (
                        <div>
                          {t("receipt.stop", { defaultValue: "Stop" })}: {formatReceiptDateTime(
                            String(cancellationStop)
                          )}
                        </div>
                      ) : null}
                    </>
                  );
                })()}

                {(() => {
                  return fiskalyQrData ? (
                    <div className="pt-2">
                      <div className="font-bold">
                        {t("receipt.fiskalyVerification", {
                          defaultValue: "Fiskaly Verification (QR)",
                        })}
                      </div>
                      <div className="mt-1 flex justify-center">
                        <img
                          src={getQrUrl(fiskalyQrData, 160)}
                          width={160}
                          height={160}
                          alt="Fiskaly verification QR"
                          className="bg-white"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="mt-1 text-center">
                        {t("receipt.fiskalyQrInstructions", {
                          defaultValue: "Scan to verify transaction authenticity",
                        })}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
