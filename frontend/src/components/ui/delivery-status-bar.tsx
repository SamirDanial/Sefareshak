import React, { useMemo } from "react";
import Icon from "@mdi/react";
import { mdiCheckCircle, mdiTruck, mdiCloseCircle, mdiClock, mdiPackageVariant } from "@mdi/js";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface DeliveryStatusBarProps {
  status: string;
  className?: string;
}

const DeliveryStatusBar: React.FC<DeliveryStatusBarProps> = ({
  status,
  className,
}) => {
  const { t } = useTranslation();

  // Helper function to get translated status label
  const getStatusLabel = useMemo(() => {
    return (statusKey: string) => {
      const statusTranslationKey = `orders.statuses.${statusKey
        .toLowerCase()
        .replace(/_/g, "")}`;
      return t(statusTranslationKey, {
        defaultValue: statusKey.replace("_", " "),
      });
    };
  }, [t]);

  // All 7 order status stages - memoized to update when language changes
  const statuses = useMemo(
    () => [
      {
        key: "PENDING",
        label: getStatusLabel("PENDING"),
        iconPath: mdiClock,
      },
      {
        key: "CONFIRMED",
        label: getStatusLabel("CONFIRMED"),
        iconPath: mdiCheckCircle,
      },
      {
        key: "PREPARING",
        label: getStatusLabel("PREPARING"),
        iconPath: mdiPackageVariant,
      },
      {
        key: "READY_FOR_DELIVERY",
        label: getStatusLabel("READY_FOR_DELIVERY"),
        iconPath: mdiCheckCircle,
      },
      {
        key: "OUT_FOR_DELIVERY",
        label: getStatusLabel("OUT_FOR_DELIVERY"),
        iconPath: mdiTruck,
      },
      {
        key: "DELIVERED",
        label: getStatusLabel("DELIVERED"),
        iconPath: mdiCheckCircle,
      },
    ],
    [getStatusLabel]
  );

  const getCurrentStepIndex = () => {
    // Normalize status to uppercase for comparison
    const normalizedStatus = status.toUpperCase().trim();

    switch (normalizedStatus) {
      case "PENDING":
        return 0;
      case "CONFIRMED":
        return 1;
      case "PREPARING":
        return 2;
      case "READY_FOR_DELIVERY":
        return 3;
      case "OUT_FOR_DELIVERY":
        return 4;
      case "DELIVERED":
        return 5;
      case "CANCELLED":
        // Cancelled orders are terminal - show at beginning but with special styling
        return -1; // Special value for cancelled
      default:
        // Debug: log unexpected status values
        if (normalizedStatus && normalizedStatus !== "") {
          console.warn(
            "⚠️ DeliveryStatusBar: Unexpected status value:",
            normalizedStatus,
            "Original:",
            status
          );
        }
        return 0;
    }
  };

  const currentStepIndex = getCurrentStepIndex();
  const normalizedStatus = status.toUpperCase().trim();
  const isCancelled = normalizedStatus === "CANCELLED";

  // Calculate progress: if we're at step index X out of N steps (0 to N-1),
  // the progress should be X / (N-1) * 100
  // With 6 steps (0-5):
  // PENDING (0) = 0%, CONFIRMED (1) = 20%, PREPARING (2) = 40%,
  // READY_FOR_DELIVERY (3) = 60%, OUT_FOR_DELIVERY (4) = 80%, DELIVERED (5) = 100%
  const progressPercentage = isCancelled
    ? 0 // Cancelled orders show 0% progress
    : statuses.length > 1 && currentStepIndex >= 0
    ? (currentStepIndex / (statuses.length - 1)) * 100
    : 0;

  return (
    <div className={cn("w-full", className)}>
      {/* Progress Bar */}
      <div className="relative mb-4">
        {/* Background Bar */}
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          {/* Progress Fill */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isCancelled
                ? "bg-gradient-to-r from-red-400 to-red-600"
                : "bg-gradient-to-r from-pink-400 to-pink-600"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Status Indicators */}
        <div className="absolute top-0 left-0 w-full h-3 flex justify-between items-center">
          {statuses.map((statusItem, index) => {
            const isCompleted = !isCancelled && index <= currentStepIndex;
            const isCurrent = !isCancelled && index === currentStepIndex;

            return (
              <div
                key={statusItem.key}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  isCancelled
                    ? "bg-gray-400 border-gray-400 text-white opacity-50"
                    : isCompleted
                    ? "bg-pink-500 border-pink-500 text-white"
                    : cn(
                        "bg-background border-muted-foreground text-muted-foreground",
                        isCurrent && "border-pink-400"
                      )
                )}
              >
                <Icon path={statusItem.iconPath} size={0.5} />
              </div>
            );
          })}
          {/* Show cancelled indicator if order is cancelled */}
          {isCancelled && (
            <div className="absolute top-0 left-0 w-6 h-6 rounded-full flex items-center justify-center border-2 bg-red-500 border-red-500 text-white z-10">
              <Icon path={mdiCloseCircle} size={0.5} />
            </div>
          )}
        </div>
      </div>

      {/* Status Labels */}
      <div className="flex justify-between">
        {statuses.map((statusItem, index) => {
          const isCompleted = !isCancelled && index <= currentStepIndex;
          const isCurrent = !isCancelled && index === currentStepIndex;

          return (
            <div
              key={statusItem.key}
              className="flex flex-col items-center space-y-1"
            >
              <span
                className={cn(
                  "text-xs font-medium text-center",
                  isCancelled
                    ? "text-gray-400 dark:text-gray-500"
                    : isCompleted
                    ? "text-pink-600 dark:text-pink-400"
                    : "text-muted-foreground",
                  isCurrent && !isCancelled && "font-bold"
                )}
              >
                {statusItem.label}
              </span>
            </div>
          );
        })}
        {isCancelled && (
          <div className="absolute left-0 top-0 flex flex-col items-center space-y-1">
            <span className="text-xs font-bold text-center text-red-600 dark:text-red-400">
              {getStatusLabel("CANCELLED")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryStatusBar;
