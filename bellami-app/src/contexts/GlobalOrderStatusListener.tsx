import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import SocketService from "@/src/services/socketService";
import { useGlobalToast } from "./GlobalToastContext";
import { useUnseenStatusChanges } from "./UnseenStatusChangesContext";
import { notificationService } from "@/src/services/notificationService";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface GlobalOrderStatusListenerProps {
  socketService: SocketService;
}

export const GlobalOrderStatusListener: React.FC<
  GlobalOrderStatusListenerProps
> = ({ socketService }) => {
  const { isSignedIn } = useAuth();
  const { showToast } = useGlobalToast();
  const { refreshCount } = useUnseenStatusChanges();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setIsConnected(socketService.getIsConnected());

    const checkConnection = () => {
      setIsConnected(socketService.getIsConnected());
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, [socketService]);

  // Global listener for order status changes - shows toast notifications
  useEffect(() => {
    if (!isSignedIn || !isConnected) return;

    const handleOrderStatusChange = (data: {
      orderId: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      updatedAt: string;
    }) => {
      // Format status for display
      const formatStatus = (status: string): string => {
        return status
          .replace(/_/g, " ")
          .toLowerCase()
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      };

      const formattedStatus = formatStatus(data.status);
      const message = `Order #${data.orderNumber} status updated to ${formattedStatus}`;

      // Play sound and vibrate
      notificationService.notifyStatusChange().catch((error) => {
        console.error("Failed to play notification:", error);
      });

      // Update unseen status changes in AsyncStorage (for badge count)
      AsyncStorage.getItem("unseenStatusChanges")
        .then((stored) => {
          try {
            const existingIds = stored ? (JSON.parse(stored) as string[]) : [];

            if (!existingIds.includes(data.orderId)) {
              const newIds = [...existingIds, data.orderId];
              return AsyncStorage.setItem(
                "unseenStatusChanges",
                JSON.stringify(newIds)
              ).then(() => {
                // Refresh the global count for tab badge
                refreshCount();
              });
            }
          } catch (error) {
            console.error("Error updating unseen status changes:", error);
          }
        })
        .catch((error) => {
          console.error("Error reading unseen status changes:", error);
        });

      // Show toast notification
      showToast(message, "success");
    };

    // Register global listener
    socketService.on("order-status-changed", handleOrderStatusChange);

    return () => {
      socketService.off("order-status-changed", handleOrderStatusChange);
    };
  }, [isSignedIn, isConnected, socketService, showToast, refreshCount]);

  return null;
};
