import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import ApiService from "@/services/apiService";

type DeliveryDetailsResponse = {
  success: boolean;
  data?: {
    orderId: string;
    orderNumber?: string;
    orderType: "DELIVERY";
    customerName?: string | null;
    phone?: string | null;
    notes?: string | null;
    address: {
      line?: string | null;
      building?: string | null;
      floor?: string | null;
      apartment?: string | null;
      extra?: string | null;
    };
  };
  error?: string;
};

const DeliveryAddress: React.FC = () => {
  const { t } = useTranslation();
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DeliveryDetailsResponse["data"] | null>(null);

  const api = useMemo(() => ApiService.getInstance(), []);

  const addressText = useMemo(() => {
    if (!data) return "";
    const parts = [
      data.address.line,
      data.address.building,
      data.address.floor,
      data.address.apartment,
      data.address.extra,
    ].filter(Boolean);
    return parts.join(", ");
  }, [data]);

  const mapsUrl = useMemo(() => {
    if (!addressText) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
  }, [addressText]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!orderId) {
          setError(t("common.error", { defaultValue: "Error" }));
          return;
        }

        if (!token) {
          setError(
            t("deliveryLink.missingToken", {
              defaultValue: "Missing token. Please scan the QR code again.",
            })
          );
          return;
        }

        const res = (await api.get(
          `/api/user/delivery/${orderId}?token=${encodeURIComponent(token)}`
        )) as DeliveryDetailsResponse;

        if (!res?.success || !res.data) {
          setError(res?.error || t("common.error", { defaultValue: "Error" }));
          return;
        }

        setData(res.data);
      } catch (e: any) {
        setError(e?.message || t("common.error", { defaultValue: "Error" }));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [api, orderId, token, t]);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="mb-4">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            {t("common.back", { defaultValue: "Back" })}
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {t("deliveryLink.title", { defaultValue: "Delivery Details" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                {t("common.loading", { defaultValue: "Loading..." })}
              </div>
            ) : error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <div className="font-semibold">
                  {t("common.error", { defaultValue: "Error" })}
                </div>
                <div className="mt-1">{error}</div>
              </div>
            ) : data ? (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <div className="text-sm text-muted-foreground">
                    {t("deliveryLink.order", { defaultValue: "Order" })}
                  </div>
                  <div className="font-semibold">
                    {data.orderNumber || data.orderId}
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-sm text-muted-foreground">
                    {t("deliveryLink.address", { defaultValue: "Address" })}
                  </div>
                  <div className="font-medium leading-6">{addressText || "-"}</div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => copyToClipboard(addressText)}
                      disabled={!addressText}
                    >
                      {t("deliveryLink.copyAddress", { defaultValue: "Copy" })}
                    </Button>
                    {mapsUrl ? (
                      <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                        <a href={mapsUrl} target="_blank" rel="noreferrer">
                          {t("deliveryLink.openMaps", { defaultValue: "Open in Maps" })}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {data.phone ? (
                  <div className="grid gap-2">
                    <div className="text-sm text-muted-foreground">
                      {t("deliveryLink.phone", { defaultValue: "Phone" })}
                    </div>
                    <div className="font-medium">{data.phone}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <a href={`tel:${data.phone}`}>{t("deliveryLink.call", { defaultValue: "Call" })}</a>
                      </Button>
                      <Button variant="outline" onClick={() => copyToClipboard(data.phone || "")}>
                        {t("deliveryLink.copy", { defaultValue: "Copy" })}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {data.notes ? (
                  <div className="grid gap-2">
                    <div className="text-sm text-muted-foreground">
                      {t("deliveryLink.notes", { defaultValue: "Notes" })}
                    </div>
                    <div className="rounded-md bg-muted p-3 text-sm leading-6">{data.notes}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DeliveryAddress;
