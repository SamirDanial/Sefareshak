import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import {
  mdiMapMarker,
  mdiNavigation,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiLoading,
} from "@mdi/js";
import { toast } from "sonner";
import { isWithinDeliveryRadius } from "@/utils/distanceCalculator";
import { formatPrice } from "@/utils/currency";
import type { Settings } from "@/services/settingsService";
import { useTranslation } from "react-i18next";
import { useBranch } from "@/contexts/BranchContext";

interface DeliveryAvailabilityCheckProps {
  settings: Settings;
  onAvailabilityConfirmed: () => void;
}

const DeliveryAvailabilityCheck: React.FC<DeliveryAvailabilityCheckProps> = ({
  settings,
  onAvailabilityConfirmed,
}) => {
  const { t } = useTranslation();
  const { branch: branchSummary, branches } = useBranch();
  const [checking, setChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Find the full branch object from branches array using the branch ID
  const fullBranch = branchSummary?.id 
    ? branches.find((b) => b.id === branchSummary.id)
    : null;

  // Use branch location if available, otherwise fall back to settings
  // Handle latitude - can be number, string, or Decimal from Prisma
  const branchLat = fullBranch?.latitude !== undefined && fullBranch?.latitude !== null
    ? typeof fullBranch.latitude === "string"
      ? parseFloat(fullBranch.latitude)
      : typeof fullBranch.latitude === "number"
      ? fullBranch.latitude
      : parseFloat(String(fullBranch.latitude))
    : null;

  const settingsLat =
    settings.latitude !== undefined && settings.latitude !== null
      ? typeof settings.latitude === "string"
        ? parseFloat(settings.latitude)
        : typeof settings.latitude === "number"
        ? settings.latitude
        : parseFloat(String(settings.latitude))
      : null;

  const restaurantLat = branchLat ?? settingsLat;

  // Handle longitude - can be number, string, or Decimal from Prisma
  const branchLon = fullBranch?.longitude !== undefined && fullBranch?.longitude !== null
    ? typeof fullBranch.longitude === "string"
      ? parseFloat(fullBranch.longitude)
      : typeof fullBranch.longitude === "number"
      ? fullBranch.longitude
      : parseFloat(String(fullBranch.longitude))
    : null;

  const settingsLon =
    settings.longitude !== undefined && settings.longitude !== null
      ? typeof settings.longitude === "string"
        ? parseFloat(settings.longitude)
        : typeof settings.longitude === "number"
        ? settings.longitude
        : parseFloat(String(settings.longitude))
      : null;

  const restaurantLon = branchLon ?? settingsLon;

  const hasRestaurantLocation =
    restaurantLat !== null &&
    restaurantLon !== null &&
    !isNaN(restaurantLat) &&
    !isNaN(restaurantLon);

  // Use branch delivery radius if available, otherwise fall back to settings
  const deliveryRadius = fullBranch?.deliveryRadius ?? settings.deliveryRadius ?? 5;
  const deliveryRatePerKm = settings.deliveryRatePerKilometer || 0;
  const currency = settings.currency || "USD";

  const checkDeliveryAvailability = async () => {
    if (!hasRestaurantLocation) {
      toast.error(t("checkout.step1.deliveryInfo.restaurantLocationNotSet"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return;
    }

    if (!navigator.geolocation) {
      toast.error(t("checkout.step1.deliveryInfo.geolocationNotSupported"), {
        duration: 4000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return;
    }

    setChecking(true);
    setIsAvailable(null);
    setDistance(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;

        // Calculate distance
        const R = 6371; // Earth radius in km
        const dLat = ((userLat - restaurantLat!) * Math.PI) / 180;
        const dLon = ((userLon - restaurantLon!) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((restaurantLat! * Math.PI) / 180) *
            Math.cos((userLat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const calculatedDistance = R * c;

        setDistance(calculatedDistance);

        const withinRadius = isWithinDeliveryRadius(
          userLat,
          userLon,
          restaurantLat!,
          restaurantLon!,
          deliveryRadius
        );

        setIsAvailable(withinRadius);
        setChecking(false);

        if (withinRadius) {
          toast.success(
            t("checkout.step1.deliveryInfo.deliveryAvailable", {
              distance: calculatedDistance.toFixed(2),
            }),
            {
              duration: 4000,
              style: {
                background: "rgba(34, 197, 94, 0.9)",
                color: "#ffffff",
                border: "1px solid rgba(34, 197, 94, 0.5)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px rgba(34, 197, 94, 0.3)",
              },
            }
          );
        } else {
          toast.error(
            t("checkout.step1.deliveryInfo.deliveryNotAvailable", {
              distance: calculatedDistance.toFixed(2),
              radius: deliveryRadius,
            }),
            {
              duration: 5000,
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
      },
      (error) => {
        setChecking(false);
        toast.error(
          t("checkout.step1.deliveryInfo.failedToGetLocation", {
            error: error.message,
          }),
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
    );
  };

  const handleContinue = () => {
    if (isAvailable === null || !isAvailable) {
      toast.error(t("checkout.step1.deliveryInfo.confirmAvailabilityFirst"), {
        duration: 3000,
        style: {
          background: "rgba(239, 68, 68, 0.9)",
          color: "#ffffff",
          border: "1px solid rgba(239, 68, 68, 0.5)",
          borderRadius: "12px",
          boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)",
        },
      });
      return;
    }
    onAvailabilityConfirmed();
  };

  // Use branch address if available, otherwise fall back to settings
  const restaurantAddress = fullBranch?.address ?? settings.businessAddress ?? "Not set";
  const restaurantCity = fullBranch?.city ?? settings.city ?? "Not set";
  const restaurantCountry = fullBranch?.country ?? settings.country ?? "Not set";
  const branchName = branchSummary?.name ? ` (${branchSummary.name})` : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon path={mdiMapMarker} size={0.83} className="text-pink-500" />
          {t("checkout.step1.deliveryInfo.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Restaurant Location Info */}
        <div className="bg-muted/30 p-4 rounded-lg border border-border">
          <h3 className="font-semibold text-foreground mb-2">
            {t("checkout.step1.deliveryInfo.restaurantLocation")}
            {branchName}
          </h3>
          <p className="text-sm text-muted-foreground mb-1">
            <span className="font-medium text-foreground">
              {t("checkout.step1.deliveryInfo.address")}:
            </span>{" "}
            {restaurantAddress}
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            <span className="font-medium text-foreground">
              {t("checkout.step1.deliveryInfo.city")}:
            </span>{" "}
            {restaurantCity}
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            <span className="font-medium text-foreground">
              {t("checkout.step1.deliveryInfo.country")}:
            </span>{" "}
            {restaurantCountry}
          </p>
          <div className="border-t border-border pt-2 space-y-1">
            <p className="text-sm text-foreground">
              <span className="font-medium">
                {t("checkout.step1.deliveryInfo.deliveryRadius")}:
              </span>{" "}
              {deliveryRadius} km
            </p>
            <p className="text-sm text-foreground">
              <span className="font-medium">
                {t("checkout.step1.deliveryInfo.deliveryRate")}:
              </span>{" "}
              {formatPrice(deliveryRatePerKm, currency)}{" "}
              {t("checkout.step1.deliveryInfo.perKilometer")}
            </p>
          </div>
        </div>

        {/* Check Availability Section */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("checkout.step1.deliveryInfo.checkLocationQuestion")}
          </p>

          <Button
            onClick={checkDeliveryAvailability}
            disabled={checking}
            className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? (
              <>
                <Icon path={mdiLoading} size={0.67} className="mr-2 animate-spin" />
                {t("checkout.step1.deliveryInfo.checkingLocation")}
              </>
            ) : (
              <>
                <Icon path={mdiNavigation} size={0.67} className="mr-2" />
                {t("checkout.step1.deliveryInfo.checkAvailability")}
              </>
            )}
          </Button>

          {/* Results */}
          {!checking && isAvailable !== null && (
            <div
              className={`p-4 rounded-lg border ${
                isAvailable
                  ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
              }`}
            >
              <div className="flex items-start gap-3">
                {isAvailable ? (
                  <Icon path={mdiCheckCircle} size={0.83} className="text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <Icon path={mdiCloseCircle} size={0.83} className="text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      isAvailable
                        ? "text-green-800 dark:text-green-200"
                        : "text-red-800 dark:text-red-200"
                    }`}
                  >
                    {isAvailable
                      ? t("checkout.step1.deliveryInfo.deliveryAvailableTitle")
                      : t(
                          "checkout.step1.deliveryInfo.deliveryNotAvailableTitle"
                        )}
                  </p>
                  {distance !== null && (
                    <p
                      className={`text-sm mt-1 ${
                        isAvailable
                          ? "text-green-700 dark:text-green-300"
                          : "text-red-700 dark:text-red-300"
                      }`}
                    >
                      {t("checkout.step1.deliveryInfo.locationDistance", {
                        distance: distance.toFixed(2),
                      })}
                      {!isAvailable && (
                        <span className="block mt-1">
                          {t(
                            "checkout.step1.deliveryInfo.deliveryRadiusLimit",
                            {
                              radius: deliveryRadius,
                            }
                          )}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Continue Buttons */}
          {isAvailable === true ? (
            <Button
              onClick={handleContinue}
              className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400"
            >
              {t("checkout.step1.deliveryInfo.continueToAddressEntry")}
            </Button>
          ) : isAvailable === false ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                {t(
                  "checkout.step1.deliveryInfo.deliveryNotAvailableAtLocation"
                )}
              </p>
              <Button
                onClick={() => onAvailabilityConfirmed()}
                variant="outline"
                className="w-full border-border hover:bg-muted"
              >
                {t("checkout.step1.deliveryInfo.proceedAnyway")}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => onAvailabilityConfirmed()}
              variant="outline"
              className="w-full border-border hover:bg-muted bg-transparent"
            >
              {t("checkout.step1.deliveryInfo.skipCheck")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DeliveryAvailabilityCheck;
