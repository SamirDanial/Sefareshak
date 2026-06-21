import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@mdi/react";
import { mdiCheckCircle, mdiCalendar, mdiClock, mdiAccountGroup, mdiArrowLeft, mdiHome, mdiCreditCard } from "@mdi/js";
import { reservationService, type Reservation } from "@/services/reservationService";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";
import { useSettings } from "@/contexts/SettingsContext";

const ReservationConfirmation: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const { currency } = useSettings();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadReservation();
    }
  }, [id]);

  const loadReservation = async () => {
    try {
      setLoading(true);
      const token = (await getToken()) || undefined;
      const data = await reservationService.getReservationById(id!, token);
      setReservation(data);
    } catch (error: any) {
      console.error("Error loading reservation:", error);
      toast.error(t("reservations.confirmation.loadError"));
      navigate("/reservations/my-reservations");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-2xl">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
          <span className="ml-4 text-muted-foreground">{t("reservations.confirmation.loading")}</span>
        </div>
      </div>
    );
  }

  if (!reservation) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-2xl">
      <Card className="border-2 border-green-500/20 shadow-lg">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <Icon path={mdiCheckCircle} size={1.67} className="text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{t("reservations.confirmation.title")}</h1>
            <p className="text-muted-foreground">
              {t("reservations.confirmation.description")}
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{t("reservations.confirmation.reservationNumber")}</span>
                <Badge variant="outline" className="font-mono">
                  {reservation.reservationNumber}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Icon path={mdiCalendar} size={0.83} className="text-pink-500" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("reservations.confirmation.date")}</p>
                  <p className="font-semibold">{formatDate(reservation.reservationDate)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Icon path={mdiClock} size={0.83} className="text-pink-500" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("reservations.confirmation.time")}</p>
                  <p className="font-semibold">{formatTime(reservation.reservationDate)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Icon path={mdiAccountGroup} size={0.83} className="text-pink-500" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("reservations.confirmation.numberOfGuests")}</p>
                  <p className="font-semibold">{reservation.numberOfGuests}</p>
                </div>
              </div>

              {reservation.table && (
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <Icon path={mdiCalendar} size={0.83} className="text-pink-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reservations.confirmation.table")}</p>
                    <p className="font-semibold">
                      {reservation.table.tableNumber}
                      {reservation.table.zone && ` - ${reservation.table.zone}`}
                    </p>
                  </div>
                </div>
              )}

              {reservation.type === "PRE_ORDER" && reservation.reservationOrder && (
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <Icon path={mdiCreditCard} size={0.83} className="text-pink-500" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">{t("reservations.confirmation.preOrder")}</p>
                    <p className="font-semibold">
                      {t("reservations.myReservations.order")}{" "}
                      {reservation.reservationOrder.orderNumber} -{" "}
                      {formatPrice(reservation.reservationOrder.totalAmount, currency)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {reservation.specialRequests && (
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">{t("reservations.confirmation.specialRequests")}</p>
                <p className="text-sm">{reservation.specialRequests}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/reservations/my-reservations")}
              className="flex-1"
            >
              <Icon path={mdiArrowLeft} size={0.67} className="mr-2" />
              {t("reservations.confirmation.viewMyReservations")}
            </Button>
            <Button
              onClick={() => navigate("/")}
              className="flex-1 bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50"
            >
              <Icon path={mdiHome} size={0.67} className="mr-2" />
              {t("reservations.confirmation.backToHome")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReservationConfirmation;

