import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@mdi/react";
import { mdiClose, mdiBell } from "@mdi/js";
import PushNotificationService from "@/services/pushNotificationService";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PushNotificationPromptProps {
  onDismiss?: () => void;
  onEnable?: () => void;
}

const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({
  onDismiss,
  onEnable,
}) => {
  const { isSignedIn, getToken } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pushService = PushNotificationService.getInstance();

    if (!pushService.isSupported()) {
      return;
    }

    // Check if user has already dismissed the prompt (stored in localStorage)
    const dismissed = localStorage.getItem("pushNotificationPromptDismissed");

    if (dismissed) {
      return;
    }

    // Check permission status
    const permission = pushService.getPermissionStatus();

    // Only show if permission is "default" (not granted or denied)
    // Wait 3 seconds after page load before showing prompt
    if (permission === "default") {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000); // Show after 3 seconds

      return () => clearTimeout(timer);
    }
  }, [isSignedIn]);

  const handleEnable = async () => {
    try {
      setLoading(true);

      // Check if user is signed in
      if (!isSignedIn) {
        toast.info("Please sign in first to enable push notifications");
        setIsVisible(false);
        return;
      }

      const token = await getToken();

      if (!token) {
        toast.error("Please sign in to enable push notifications");
        setIsVisible(false);
        return;
      }

      const pushService = PushNotificationService.getInstance();
      const permission = await pushService.requestPermission();

      if (permission === "granted") {
        await pushService.subscribe(token);
        toast.success("Push notifications enabled!");
        setIsVisible(false);
        onEnable?.();
      } else {
        toast.error(
          "Notification permission denied. Please enable it in your browser settings."
        );
      }
    } catch (error: any) {
      console.error("Error enabling push notifications:", error);
      toast.error(error.message || "Failed to enable push notifications");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pushNotificationPromptDismissed", "true");
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg shadow-lg p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Icon path={mdiBell} size={1} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Enable Push Notifications</h3>
            <p className="text-sm text-white/90 mb-3">
              {isSignedIn
                ? "Stay updated with order status changes, new menu items, and special offers even when you're not on the site."
                : "Sign in to receive push notifications about your orders, new menu items, and special offers."}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={loading}
                className="bg-white text-pink-500 hover:bg-white/90"
              >
                {loading ? "Enabling..." : "Enable Notifications"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-white hover:bg-white/20"
              >
                <Icon path={mdiClose} size={0.67} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;
