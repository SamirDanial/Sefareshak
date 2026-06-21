import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/SettingsContext";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";

interface LocationState {
  paymentIntentId: string;
  orderTotal: number;
  paymentMethod?: string;
}

const OrderConfirmation: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;
  const { currency } = useSettings();

  const handleBackToMenu = () => {
    navigate("/menu");
  };

  const handleViewOrders = () => {
    navigate("/orders");
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-foreground">
              {state?.paymentMethod === "COD"
                ? t("orderConfirmation.orderPlaced")
                : t("orderConfirmation.orderConfirmed")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-green-500 text-6xl mb-4">✓</div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {t("orderConfirmation.thankYou")}
              </h3>
              <p className="text-muted-foreground">
                {state?.paymentMethod === "COD"
                  ? t("orderConfirmation.orderPlacedMessage")
                  : t("orderConfirmation.paymentProcessed")}
              </p>
              {state?.paymentIntentId && (
                <p className="text-sm text-muted-foreground">
                  {state?.paymentMethod === "COD"
                    ? t("orderConfirmation.orderId")
                    : t("orderConfirmation.paymentId")}
                  : {state.paymentIntentId}
                </p>
              )}
            </div>

            {state?.orderTotal && (
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  {t("orderConfirmation.totalAmount")}
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {formatPrice(state.orderTotal, currency)}
                </p>
                {state?.paymentMethod === "COD" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("orderConfirmation.payCashOnDelivery")}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-muted-foreground">
                {t("orderConfirmation.orderUpdates")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("orderConfirmation.estimatedDeliveryTime")}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                onClick={handleBackToMenu}
                variant="outline"
                className="flex-1 bg-transparent border-border text-foreground hover:bg-muted/50"
              >
                {t("orderConfirmation.continueShopping")}
              </Button>
              <Button
                onClick={handleViewOrders}
                className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400"
              >
                {t("orderConfirmation.viewMyOrders")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OrderConfirmation;
