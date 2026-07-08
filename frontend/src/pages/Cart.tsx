import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiMinus, mdiPlus, mdiDelete, mdiArrowLeft, mdiPencil, mdiCalendar } from "@mdi/js";
import { useCartStore } from "@/store/cartStore";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useBranch } from "@/contexts/BranchContext";
import { ServingHoursService, type ServingHoursStatus } from "@/services/servingHoursService";
import { toast } from "sonner";
import { formatPrice } from "@/utils/currency";
import { useTranslation } from "react-i18next";
import { getLocalizedName } from "@/utils/localization";

export default function Cart() {
  const { items, updateQuantity, removeItem, getTotalPrice, clearCart } =
    useCartStore();
  const navigate = useNavigate();
  const { isSignedIn, signIn } = useAuth();
  const { t, i18n } = useTranslation();
  const { branch, branches } = useBranch();
  const [servingHoursStatus, setServingHoursStatus] = useState<ServingHoursStatus | null>(null);
  const [allowOrdersOutsideHours, setAllowOrdersOutsideHours] = useState(false);

  const { maxOrderQuantity, settings, currency } = useSettings();

  const getAddonName = (addOn: { name: string; nameFa?: string | null }): string => {
    return getLocalizedName(addOn.name, addOn.nameFa, i18n.language);
  };

  // Check if this is a pre-order reservation (new or modifying)
  const isPreOrderReservation = React.useMemo(() => {
    try {
      const pendingReservation = sessionStorage.getItem("pendingReservation");
      const modifyingReservationId = sessionStorage.getItem("modifyingReservationId");
      return !!pendingReservation || !!modifyingReservationId;
    } catch {
      return false;
    }
  }, []);

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    try {
      updateQuantity(itemId, newQuantity, maxOrderQuantity);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("cart.failedToUpdateQuantity"),
        {
          duration: 4000,
          style: {
            background: "rgba(239, 68, 68, 0.9)",
            color: "#ffffff",
            border: "1px solid rgba(239, 68, 68, 0.5)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
          },
        }
      );
    }
  };

  // Load serving hours from branch
  useEffect(() => {
    const loadServingHours = async () => {
      try {
        const response = await ServingHoursService.getServingHours(branch?.id);
        if (response.success) {
          setServingHoursStatus(response.data.currentStatus);
          setAllowOrdersOutsideHours(response.data.allowOrdersOutsideHours);
        }
      } catch (error) {
        console.error("Error fetching serving hours:", error);
      }
    };

    loadServingHours();
  }, [branch?.id]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = getTotalPrice();

  const selectedBranch = React.useMemo(() => {
    if (!branch?.id) return null;
    return branches.find((b) => b.id === branch.id) ?? null;
  }, [branch?.id, branches]);

  const enableMinimumOrder =
    selectedBranch?.enableMinimumOrder !== null &&
    selectedBranch?.enableMinimumOrder !== undefined
      ? selectedBranch.enableMinimumOrder
      : settings?.enableMinimumOrder || false;

  const minimumOrderAmount = Number(
    selectedBranch?.minimumOrderAmount !== null &&
      selectedBranch?.minimumOrderAmount !== undefined
      ? selectedBranch.minimumOrderAmount
      : settings?.minimumOrderAmount || 15.0
  );
  const isMinimumOrderMet =
    !enableMinimumOrder || totalPrice >= minimumOrderAmount;
  
  // Check if branch is completely closed for the day (isOff = true)
  // This should disable checkout regardless of allowOrdersOutsideHours
  const isDayCompletelyClosed = servingHoursStatus?.isOff || false;
  
  // Check if branch is currently closed (but not completely closed for the day)
  // If allowOrdersOutsideHours is true, we still allow checkout
  const isCurrentlyClosed = servingHoursStatus !== null && !servingHoursStatus.isOpen && !servingHoursStatus.isOff;
  
  // Disable button only if:
  // 1. Day is completely closed (isOff), OR
  // 2. Currently closed AND allowOrdersOutsideHours is false
  // 3. Branch is urgently closed
  // For reservations, skip branch status validation (same as mobile app)
  const isBranchUrgentlyClosed = selectedBranch?.isUrgentlyClosed === true;
  const shouldDisableCheckout = isPreOrderReservation 
    ? false 
    : (isDayCompletelyClosed || (isCurrentlyClosed && !allowOrdersOutsideHours) || isBranchUrgentlyClosed);

  if (items.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
            {t("cart.title")}
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-xl font-semibold mb-2">{t("cart.empty")}</h2>
          <p className="text-muted-foreground mb-6">
            {t("cart.emptyDescription")}
          </p>
          <Link to="/">
            <Button className="bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50">
              {t("cart.browseMenu")}
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 shadow-lg shadow-rose-500/30 hover:scale-105 transition-transform"
          >
            <Icon path={mdiArrowLeft} size={0.67} className="text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
              {t("cart.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("cart.itemsCount", {
                current: totalItems,
                max: maxOrderQuantity,
              })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearCart}
          className="text-red-500 hover:text-red-600"
        >
          {t("cart.clearCart")}
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-4 relative">
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      (item.itemType || "MEAL") === "DEAL"
                        ? `/deal/${item.dealId}?edit=1&cartItemId=${encodeURIComponent(item.id)}`
                        : `/meal/${item.mealId}?edit=1&cartItemId=${encodeURIComponent(item.id)}`
                    )
                  }
                  className="h-8 w-8 p-0 text-pink-500 hover:text-pink-600"
                >
                  <Icon path={mdiPencil} size={0.67} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeItem(item.id)}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                >
                  <Icon path={mdiDelete} size={0.67} />
                </Button>
              </div>
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    {(item.itemType || "MEAL") === "MEAL" && item.size && (
                      <p className="text-sm text-muted-foreground capitalize">
                        {t("cart.size")}: {item.size}
                      </p>
                    )}
                    {item.addOns.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t("cart.addons")}:{" "}
                        {item.addOns
                          .map((addOn) => {
                            const quantity = addOn.quantity || 1;
                            return quantity > 1
                              ? `${getAddonName(addOn)} ×${quantity}`
                              : getAddonName(addOn);
                          })
                          .join(", ")}
                      </p>
                    )}
                    {item.optionalIngredients &&
                      item.optionalIngredients.length > 0 && (
                        <div className="space-y-1">
                          {(() => {
                            const included = item.optionalIngredients.filter(
                              (ing) => ing.isIncluded
                            );
                            const excluded = item.optionalIngredients.filter(
                              (ing) => !ing.isIncluded
                            );

                            return (
                              <>
                                {included.length > 0 && (
                                  <p className="text-sm text-muted-foreground">
                                    <span className="font-medium">
                                      {t(
                                        "mealCustomization.includedIngredients"
                                      )}
                                      :
                                    </span>{" "}
                                    {included.map((ing) => ing.name).join(", ")}
                                  </p>
                                )}
                                {excluded.length > 0 && (
                                  <p className="text-sm text-muted-foreground">
                                    <span className="font-medium">
                                      {t(
                                        "mealCustomization.excludedIngredients"
                                      )}
                                      :
                                    </span>{" "}
                                    {excluded.map((ing) => ing.name).join(", ")}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    {item.specialInstructions && (
                      <p className="text-sm text-muted-foreground">
                        {t("cart.note")}: {item.specialInstructions}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleQuantityChange(item.id, item.quantity - 1)
                        }
                        className="h-8 w-8 p-0"
                      >
                        <Icon path={mdiMinus} size={0.67} />
                      </Button>
                      <span className="w-8 text-center font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleQuantityChange(item.id, item.quantity + 1)
                        }
                        className="h-8 w-8 p-0"
                      >
                        <Icon path={mdiPlus} size={0.67} />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {formatPrice(
                          (item.basePrice +
                            item.addOns.reduce((sum, addOn) => {
                              const addOnQuantity = addOn.quantity || 1;
                              return sum + addOn.price * addOnQuantity;
                            }, 0)) *
                            item.quantity,
                          currency
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cart Summary */}
      <Card className="sticky bottom-0 bg-background border-t">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold">{t("cart.total")}</span>
            <span className="text-2xl font-bold">
              {formatPrice(getTotalPrice(), currency)}
            </span>
          </div>

          {/* Minimum Order Warning */}
          {enableMinimumOrder && !isMinimumOrderMet && (
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
              <div className="flex items-center space-x-2 text-orange-800 dark:text-orange-200">
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium">
                  {t("cart.addMoreForMinimumOrder", {
                    amount: formatPrice(
                      minimumOrderAmount - totalPrice,
                      currency
                    ),
                  })}
                </span>
              </div>
            </div>
          )}
          {shouldDisableCheckout && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg mb-3">
              <p className="text-xs text-red-900 dark:text-red-100 text-center">
                <strong>
                  {isBranchUrgentlyClosed
                    ? t("cart.branchUrgentlyClosed") || "This branch is temporarily closed."
                    : isDayCompletelyClosed
                      ? t("cart.closedToday")
                      : t("checkout.servingHours.currentlyClosed") || "We are currently closed."}
                </strong>
                {isBranchUrgentlyClosed && selectedBranch?.urgentCloseMessage && (
                  <span className="block mt-1">
                    {selectedBranch.urgentCloseMessage}
                  </span>
                )}
                {!isBranchUrgentlyClosed && servingHoursStatus?.nextOpenDay && servingHoursStatus?.nextOpenTimeString && (
                  <span className="block mt-1">
                    {t("cart.nextOpen", {
                      day: servingHoursStatus.nextOpenDay,
                      time: servingHoursStatus.nextOpenTimeString,
                    })}
                  </span>
                )}
              </p>
            </div>
          )}
          {isCurrentlyClosed && allowOrdersOutsideHours && !isDayCompletelyClosed && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg mb-3">
              <p className="text-xs text-orange-900 dark:text-orange-100 text-center">
                <strong>{t("checkout.servingHours.warningTitle") || "Note:"}</strong>
                <span className="block mt-1">
                  {servingHoursStatus?.nextOpenTimeString 
                    ? t("checkout.servingHours.orderWillBeServed", {
                        time: servingHoursStatus.nextOpenTimeString,
                      })
                    : t("checkout.servingHours.currentlyClosed") || "We are currently closed. Your order will be served when we open."}
                </span>
              </p>
            </div>
          )}
          {isSignedIn ? (
            <Button
              className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isPreOrderReservation ? !isMinimumOrderMet : (!isMinimumOrderMet || shouldDisableCheckout)}
              onClick={() => {
                // For reservations, only check minimum order (skip branch status validation)
                if (isPreOrderReservation) {
                  if (!isMinimumOrderMet) return;
                } else {
                  if (!isMinimumOrderMet || shouldDisableCheckout) return;
                }
                navigate(isPreOrderReservation ? "/reservations/checkout" : "/checkout");
              }}
            >
                {isPreOrderReservation ? (
                  <>
                    <Icon path={mdiCalendar} size={0.67} className="mr-2" />
                    Complete Reservation
                  </>
                ) : (
                  t("cart.proceedToCheckout")
                )}
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={() => signIn()}
                className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/30 hover:scale-[1.02] hover:shadow-rose-500/50 py-3 text-lg font-semibold"
              >
                {t("cart.signInToCheckout")}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {t("cart.signInToComplete")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
