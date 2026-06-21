import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "@mdi/react";
import { mdiHome, mdiCart, mdiShopping, mdiCloseCircle, mdiSilverwareForkKnife, mdiHeart } from "@mdi/js";
import { useCartStore } from "@/store/cartStore";
import LoginButton from "@/components/LoginButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useBranch } from "@/contexts/BranchContext";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { audioService } from "@/services/audioService";
import { useState, useEffect, useRef, useMemo } from "react";

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}
import { useAuth } from "@clerk/clerk-react";
import SocketService from "@/services/socketService";
import PushNotificationService from "@/services/pushNotificationService";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/contexts/SettingsContext";
import AppStatusNotice from "@/components/AppStatusNotice";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { AppStatus } from "@/services/settingsService";
import { Button } from "@/components/ui/button";
import FloatingCartActions from "@/components/FloatingCartActions";
import { getOptimizedImageUrl, isExternalImage } from "@/utils/imageUtils";
import { BranchSwitcher } from "@/components/BranchSwitcher";

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { getItemCount, clearCart } = useCartStore();
  const itemCount = getItemCount();
  const [unseenStatusChangesCount, setUnseenStatusChangesCount] = useState(0);
  const [isModifying, setIsModifying] = useState(false);
  const [isPreOrderLocked, setIsPreOrderLocked] = useState(false);
  const { t } = useTranslation();
  const { isSignedIn, getToken } = useAuth();
  const { clearReservationLock, branch, branches, setBranch, customerOrganizationSlug, setCustomerOrganizationSlug } = useBranch();
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const appStatus = (settings?.appStatus || "LIVE") as AppStatus;
  const isAppUnavailable = !isSettingsLoading && appStatus !== "LIVE";
  const isMobile = useIsMobile();

  const ignoreUrlOrgRef = useRef(false);

  const handleExitOrgScope = () => {
    try {
      ignoreUrlOrgRef.current = true;
      let cleanedUrlForReload = "";
      try {
        const params = new URLSearchParams(location.search);
        params.delete("org");
        params.delete("organizationSlug");
        params.delete("organization");
        const nextSearch = params.toString();

        // IMPORTANT: update the URL synchronously so the URL->state org effect can't re-apply the old org
        // before react-router finishes navigation.
        try {
          const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash || ""}`;
          cleanedUrlForReload = nextUrl;
          window.history.replaceState(window.history.state, "", nextUrl);

          // Fallback: if react-router doesn't update location.search immediately and the URL still
          // contains org params after this click, force a navigation to the cleaned URL.
          setTimeout(() => {
            try {
              const p = new URLSearchParams(window.location.search);
              const stillHasOrg = p.has("org") || p.has("organizationSlug") || p.has("organization");
              if (stillHasOrg) window.location.assign(nextUrl);
            } catch {
              // ignore
            }
          }, 50);
        } catch {
          // ignore
        }

        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : "",
            hash: location.hash,
          },
          { replace: true }
        );
      } catch {
        // ignore
      }

      try {
        localStorage.removeItem("bellami:customerOrgScope");
      } catch {
        // ignore
      }
      setCustomerOrganizationSlug(null);

      // Hard reload to guarantee scoped mode is cleared (URL + localStorage + state)
      // even if react-router state is temporarily stale.
      if (cleanedUrlForReload) {
        setTimeout(() => {
          try {
            window.location.assign(cleanedUrlForReload);
          } catch {
            // ignore
          }
        }, 10);
      } else {
        toast.success(
          t("customerScope.organizationMode.exited", {
            defaultValue: "Organization mode cleared",
          })
        );
      }
    } catch {
      // ignore
    }
  };

  // Organization scope from URL (for QR / org-specific deep links)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const hasOrgParam =
        params.has("org") || params.has("organizationSlug") || params.has("organization");

      // If the user just exited org mode, don't let a stale location.search re-apply the old org.
      if (ignoreUrlOrgRef.current) {
        if (hasOrgParam) return;
        ignoreUrlOrgRef.current = false;
      }
      if (!hasOrgParam) return;

      const rawOrg = params.get("org") || params.get("organizationSlug") || params.get("organization") || "";
      const nextOrg = rawOrg.trim() || null;
      if (nextOrg !== customerOrganizationSlug) setCustomerOrganizationSlug(nextOrg);
    } catch {
      // ignore
    }
  }, [customerOrganizationSlug, location.search, setCustomerOrganizationSlug]);

  // Keep org scope in URL for shareability (without overriding explicit incoming org links)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const urlOrg = params.get("org") || params.get("organizationSlug") || params.get("organization");

      // If URL explicitly specifies an org (and it differs), URL has priority.
      if (!ignoreUrlOrgRef.current) {
        if (
          (params.has("org") || params.has("organizationSlug") || params.has("organization")) &&
          (urlOrg || "").trim() !== (customerOrganizationSlug || "")
        ) {
          return;
        }
      }

      if (customerOrganizationSlug) {
        if ((urlOrg || "").trim() !== customerOrganizationSlug) {
          params.delete("organizationSlug");
          params.delete("organization");
          params.set("org", customerOrganizationSlug);
          navigate(
            {
              pathname: location.pathname,
              search: `?${params.toString()}`,
              hash: location.hash,
            },
            { replace: true }
          );
        }
      } else if (params.has("org") || params.has("organizationSlug") || params.has("organization")) {
        params.delete("org");
        params.delete("organizationSlug");
        params.delete("organization");
        const nextSearch = params.toString();
        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : "",
            hash: location.hash,
          },
          { replace: true }
        );
      }
    } catch {
      // ignore
    }
  }, [customerOrganizationSlug, location.hash, location.pathname, location.search, navigate]);

  const appliedUrlBranchIdRef = useRef<string | null>(null);

  // 1) Apply branchId from URL only when the URL changes.
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const urlBranchId = params.get("branchId");
      if (!urlBranchId) {
        appliedUrlBranchIdRef.current = null;
        return;
      }

      // Avoid re-applying the same URL branchId on every branch change.
      if (appliedUrlBranchIdRef.current === urlBranchId) return;

      const match = branches.find((b) => b.id === urlBranchId);
      if (!match) return;

      appliedUrlBranchIdRef.current = urlBranchId;
      if (branch?.id !== urlBranchId) {
        setBranch({ id: match.id, name: match.name || null, distanceKm: null }, "MANUAL");
      }
    } catch {
      // ignore
    }
  }, [branches, branch?.id, location.search, setBranch]);

  // 2) Reflect current branch selection into the URL.
  useEffect(() => {
    if (location.pathname === "/" || location.pathname === "/scope") return;

    try {
      const params = new URLSearchParams(location.search);
      const urlBranchId = params.get("branchId");
      const currentBranchId = branch?.id || null;

      // URL has priority: if a link contains branchId and it differs from the current selection,
      // don't overwrite it with the stored/current branch before the URL->state effect applies.
      if (urlBranchId && urlBranchId !== currentBranchId) {
        return;
      }

      if (currentBranchId) {
        if (urlBranchId !== currentBranchId) {
          params.set("branchId", currentBranchId);
          navigate(
            {
              pathname: location.pathname,
              search: `?${params.toString()}`,
              hash: location.hash,
            },
            { replace: true }
          );
        }
      } else if (urlBranchId) {
        params.delete("branchId");
        const nextSearch = params.toString();
        navigate(
          {
            pathname: location.pathname,
            search: nextSearch ? `?${nextSearch}` : "",
            hash: location.hash,
          },
          { replace: true }
        );
      }
    } catch {
      // ignore
    }
  }, [branch?.id, location.hash, location.pathname, location.search, navigate]);

  const selectedBranch = useMemo(() => {
    // First check if we have stored branch data from Favorites page via sessionStorage
    try {
      const stored = sessionStorage.getItem("selectedBranchData");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("[App] Failed to parse stored branch data:", e);
    }
    // Otherwise, look up in branches array using context branch
    return branch?.id ? branches.find((b) => b.id === branch.id) : null;
  }, [branch?.id, branches]);

  // Clear sessionStorage when navigating away from menu or when branch changes normally
  useEffect(() => {
    const isOnMenuPage = location.pathname === "/menu";
    const hasStoredData = sessionStorage.getItem("selectedBranchData");

    // Only clear if we're NOT on menu page AND have stored data
    // Don't clear if we're on menu page (even with query params)
    if (!isOnMenuPage && hasStoredData) {
      sessionStorage.removeItem("selectedBranchData");
      sessionStorage.removeItem("selectedBranchId");
      sessionStorage.removeItem("skipAutoBranchSelect");
    }
  }, [location.pathname]);
  const businessName =
    selectedBranch?.organization?.settings?.businessName ||
    selectedBranch?.organization?.settings?.businessName === ""
      ? selectedBranch?.organization?.settings?.businessName
      : null;
  const businessLogo = selectedBranch?.organization?.settings?.businessLogo || null;

  const fallbackOrgName = (() => {
    if (!customerOrganizationSlug) return "";

    const candidate =
      ((branches || []).find((b: any) => (b as any)?.organization?.settings?.businessName) as any)
        ?.organization?.settings?.businessName ||
      ((branches || []).find((b: any) => (b as any)?.organization?.name) as any)?.organization?.name ||
      "";
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    if (trimmed) return trimmed;

    // Last resort: prettify slug
    const slug = String(customerOrganizationSlug || "").trim();
    if (!slug) return "";
    return slug
      .replace(/[-_]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  })();

  const headerTitleParts = (() => {
    const raw = (businessName && businessName.trim()) || "";
    const orgLabelRaw = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
    const branchLabelRaw = (selectedBranch?.name || "").trim();

    // Truncate to 7 chars + "..." if longer than 7 chars (only on mobile)
    const truncate7 = (s: string) => {
      if (!s) return "";
      if (s.length <= 7) return s;
      return s.slice(0, 7) + "...";
    };

    const orgLabel = isMobile ? truncate7(orgLabelRaw) : orgLabelRaw;
    const branchLabel = isMobile ? truncate7(branchLabelRaw) : branchLabelRaw;

    if (orgLabel && branchLabel) {
      return {
        orgLabel,
        branchLabel,
        title: `${orgLabel}/${branchLabel}`,
      };
    }

    const scopedOrgLabelRaw = (fallbackOrgName || "").trim();
    const scopedOrgLabel = isMobile ? truncate7(scopedOrgLabelRaw) : scopedOrgLabelRaw;

    return {
      orgLabel: orgLabel || scopedOrgLabel || "",
      branchLabel: (orgLabel || scopedOrgLabel) ? "" : branchLabel,
      title: orgLabel || scopedOrgLabel || branchLabel || "",
    };
  })();

  const headerTitle = headerTitleParts.title;
  const placeholderLogoSrc = (() => {
    const letter = (headerTitle || "B").trim().charAt(0).toUpperCase() || "B";
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#374151"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <rect x="10" y="10" width="44" height="44" rx="12" fill="#0b1220" opacity="0.35"/>
  <text x="32" y="40" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="26" font-weight="700" fill="#ffffff">${letter}</text>
</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  })();

  const headerLogoSrc = businessLogo
    ? isExternalImage(businessLogo)
      ? businessLogo
      : getOptimizedImageUrl(businessLogo, "thumbnail")
    : placeholderLogoSrc;

  const isScopePage = location.pathname === "/" || location.pathname === "/scope";
  const isHomePage = location.pathname === "/home";
  const headerLinkTo = isScopePage ? "/scope" : "/home";
  const headerDisplayTitle = isScopePage ? "Next Foody" : headerTitle;
  const headerDisplayLogoSrc = isScopePage ? "/NextFoody.png" : headerLogoSrc;

  useEffect(() => {
    const rawHref = headerDisplayLogoSrc || "/NextFoody.png";
    const cacheBustedHref = rawHref.startsWith("data:")
      ? rawHref
      : `${rawHref}${rawHref.includes("?") ? "&" : "?"}v=${encodeURIComponent(
          selectedBranch?.id || "default"
        )}`;

    try {
      // Remove existing icons to avoid the browser continuing to use a previous <link rel="icon" ...>
      // (some browsers pick the first matching tag and ignore subsequent updates).
      document
        .querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
        )
        .forEach((n) => n.parentNode?.removeChild(n));

      const create = (rel: string) => {
        const el = document.createElement("link");
        el.rel = rel;
        el.href = cacheBustedHref;
        document.head.appendChild(el);
      };

      create("icon");
      create("shortcut icon");
      create("apple-touch-icon");
    } catch {
      // ignore
    }
  }, [headerDisplayLogoSrc, selectedBranch?.id]);

  // Initialize audio service on mount and unlock on user interaction
  useEffect(() => {
    audioService.init();

    // Also unlock audio when page becomes visible (user might have interacted elsewhere)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Try to unlock when page becomes visible
        audioService.init();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Listen for localStorage changes to update badge count
  useEffect(() => {
    const updateCount = () => {
      try {
        const stored = localStorage.getItem("unseenStatusChanges");
        if (stored) {
          const ids = JSON.parse(stored) as string[];
          setUnseenStatusChangesCount(ids.length);
        } else {
          setUnseenStatusChangesCount(0);
        }
      } catch (error) {
        setUnseenStatusChangesCount(0);
      }
    };

    // Initial load
    updateCount();

    // Listen for storage events (when localStorage changes in other tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "unseenStatusChanges") {
        updateCount();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Poll for changes (since storage event only works across tabs)
    const interval = setInterval(updateCount, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Connect to WebSocket and set up global order status change notifications when user is signed in
  useEffect(() => {
    if (!isSignedIn) return;

    const socketService = SocketService.getInstance();
    let isMounted = true;

    // Play notification sound using audio service
    const playNotificationSound = async () => {
      try {
        await audioService.playNotificationSound("statusChange");
      } catch (error) {
        // Failed to play notification sound
      }
    };

    // Show OS notification
    const showOSNotification = (orderNumber: string, status: string) => {
      if ("Notification" in window && Notification.permission === "granted") {
        const statusKey = `orders.statuses.${status
          .toLowerCase()
          .replace(/_/g, "")}`;
        const translatedStatus = t(statusKey, {
          defaultValue: status.replace("_", " "),
        });
        new Notification(t("orders.statusUpdatedTitle"), {
          body: t("orders.statusUpdatedMessage", {
            orderNumber,
            status: translatedStatus,
          }),
          icon: "/NextFoody.png",
          requireInteraction: false,
        });
      }
    };

    // Handle order status change globally (works from any page)
    const handleOrderStatusChange = (data: {
      orderId: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      updatedAt: string;
    }) => {
      if (!isMounted) return;

      // Play sound notification (fire and forget, but with error handling)
      playNotificationSound().catch(() => {
        // Error playing notification sound
      });

      // Show OS notification
      showOSNotification(data.orderNumber, data.status);

      // Update unseen status changes count (for badge)
      try {
        const stored = localStorage.getItem("unseenStatusChanges");
        const existingIds = stored ? (JSON.parse(stored) as string[]) : [];

        if (!existingIds.includes(data.orderId)) {
          const newIds = [...existingIds, data.orderId];
          localStorage.setItem("unseenStatusChanges", JSON.stringify(newIds));
          setUnseenStatusChangesCount(newIds.length);
        }
      } catch (error) {
        // Error updating unseen status changes
      }

      // Show toast notification
      const statusKey = `orders.statuses.${data.status
        .toLowerCase()
        .replace(/_/g, "")}`;
      const translatedStatus = t(statusKey, {
        defaultValue: data.status.replace("_", " "),
      });
      toast.success(
        t("orders.statusUpdatedToast", {
          orderNumber: data.orderNumber,
          status: translatedStatus,
        })
      );
    };

    // Handle reservation status change globally (works from any page)
    const handleReservationStatusChange = (data: {
      reservationId: string;
      reservationNumber: string;
      status: string;
      updatedAt: string;
    }) => {
      if (!isMounted) return;

      // Play sound notification (fire and forget, but with error handling)
      playNotificationSound().catch(() => {
        // Error playing notification sound
      });

      // Show OS notification for reservation
      if ("Notification" in window && Notification.permission === "granted") {
        const statusKey = `reservations.statuses.${data.status
          .toLowerCase()
          .replace(/_/g, "")}`;
        const translatedStatus = t(statusKey, {
          defaultValue: data.status.replace("_", " "),
        });
        new Notification(t("reservations.statusUpdatedTitle"), {
          body: t("reservations.statusUpdatedMessage", {
            reservationNumber: data.reservationNumber,
            status: translatedStatus,
          }),
          icon: "/NextFoody.png",
          requireInteraction: false,
        });
      }

      // Update unseen status changes count (for badge)
      try {
        const stored = localStorage.getItem("unseenReservationStatusChanges");
        const existingIds = stored ? (JSON.parse(stored) as string[]) : [];

        if (!existingIds.includes(data.reservationId)) {
          const newIds = [...existingIds, data.reservationId];
          localStorage.setItem("unseenReservationStatusChanges", JSON.stringify(newIds));
        }
      } catch (error) {
        // Error updating unseen status changes
      }

      // Show toast notification
      const statusKey = `reservations.statuses.${data.status
        .toLowerCase()
        .replace(/_/g, "")}`;
      const translatedStatus = t(statusKey, {
        defaultValue: data.status.replace("_", " "),
      });
      toast.success(
        t("reservations.statusUpdatedToast", {
          reservationNumber: data.reservationNumber,
          status: translatedStatus,
        })
      );
    };

    // Connect and register listener
    const setupWebSocket = async () => {
      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        await socketService.connect(token);

        // Wait for room join to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Register global listener for order status changes
        socketService.on("order-status-changed", handleOrderStatusChange);
        
        // Register global listener for reservation status changes
        socketService.on("reservation-status-changed", handleReservationStatusChange);
      } catch (error) {
        // Error setting up WebSocket
      }
    };

    setupWebSocket();

    // Request notification permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Cleanup
    return () => {
      isMounted = false;
      socketService.off("order-status-changed", handleOrderStatusChange);
      socketService.off("reservation-status-changed", handleReservationStatusChange);
    };
  }, [isSignedIn, getToken]);

  // Initialize push notifications on app load
  useEffect(() => {
    const initPushNotifications = async () => {
      const pushService = PushNotificationService.getInstance();

      if (!pushService.isSupported()) {
        return;
      }

      try {
        // Register service worker (this happens automatically, but we ensure it's done)
        await pushService.registerServiceWorker();

        // If user is signed in and permission is granted, subscribe
        if (isSignedIn) {
          const token = await getToken();
          if (token && Notification.permission === "granted") {
            // Check if already subscribed
            const isSubscribed = await pushService.isSubscribed();
            if (!isSubscribed) {
              try {
                await pushService.subscribe(token);
              } catch (error) {
              }
            }
          }
        }
      } catch (error) {
      }
    };

    initPushNotifications();
  }, [isSignedIn, getToken]);

  // Check if we're in modification mode
  useEffect(() => {
    const checkModificationMode = () => {
      const modifyingReservationId = sessionStorage.getItem("modifyingReservationId");
      const modifyingReservationBranchId = sessionStorage.getItem("modifyingReservationBranchId");
      const modifyingOrderId = sessionStorage.getItem("modifyingOrderId");
      const modifyingOrderBranchId = sessionStorage.getItem("modifyingOrderBranchId");
      // Consider in modification mode if either ID exists
      setIsModifying(
        !!modifyingReservationId ||
          !!modifyingReservationBranchId ||
          !!modifyingOrderId ||
          !!modifyingOrderBranchId
      );
    };
    
    checkModificationMode();
    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === "modifyingReservationId" ||
        e.key === "modifyingReservationBranchId" ||
        e.key === "modifyingOrderId" ||
        e.key === "modifyingOrderBranchId" ||
        e.key === "modifyingOrderPrefill"
      ) {
        checkModificationMode();
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    // Also check periodically in case of same-tab changes
    const interval = setInterval(checkModificationMode, 500);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Check if branch is locked for pre-order reservation
  useEffect(() => {
    const checkPreOrderLock = () => {
      const preOrderBranchLock = sessionStorage.getItem("preOrderBranchLock");
      setIsPreOrderLocked(!!preOrderBranchLock);
    };
    
    checkPreOrderLock();
    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "preOrderBranchLock") {
        checkPreOrderLock();
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    
    // Also check periodically in case of same-tab changes
    const interval = setInterval(checkPreOrderLock, 500);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleExitPreOrder = () => {
    clearReservationLock();
    setIsPreOrderLocked(false);
    navigate("/");
  };

  // Handle exit modification mode
  const handleExitModification = () => {
    const modifyingOrderId = sessionStorage.getItem("modifyingOrderId");

    // Clear modification mode - reservation
    sessionStorage.removeItem("modifyingReservationId");
    sessionStorage.removeItem("modifyingReservationBranchId");

    // Clear modification mode - orders
    sessionStorage.removeItem("modifyingOrderId");
    sessionStorage.removeItem("modifyingOrderBranchId");
    sessionStorage.removeItem("modifyingOrderPrefill");
    // Clear cart
    clearCart();
    // Show toast
    if (modifyingOrderId) {
      toast.success(
        t("orders.modification.exited", {
          defaultValue: "Order editing cancelled. Cart cleared.",
        })
      );
      navigate("/");
    } else {
      toast.success(
        t("reservations.myReservations.modification.exited") ||
          "Reservation editing cancelled. Cart cleared."
      );
      // Navigate to reservations page
      navigate("/reservations/my-reservations");
    }
    // Update state immediately
    setIsModifying(false);
    // Trigger storage event to update other components
    window.dispatchEvent(new StorageEvent("storage", { key: "modifyingReservationId" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "modifyingReservationBranchId" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderId" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderBranchId" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "modifyingOrderPrefill" }));
  };

  // Scroll to top on route change
  useScrollToTop();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-neutral-900/90 text-white backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-sm items-center justify-between px-4">
          <Link
            to={headerLinkTo}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src={headerDisplayLogoSrc} alt={`${headerDisplayTitle} Logo`} className="h-6 w-6" />
            {isScopePage ? (
              <span className="text-sm font-semibold">{headerDisplayTitle}</span>
            ) : headerTitleParts.orgLabel && headerTitleParts.branchLabel ? (
              <span className="text-sm font-semibold">
                <span>{headerTitleParts.orgLabel}</span>
                <span className="opacity-80">/</span>
                <span className="text-[12px] font-semibold text-gray-300">{headerTitleParts.branchLabel}</span>
              </span>
            ) : (
              <span className="text-sm font-semibold">{headerDisplayTitle}</span>
            )}
          </Link>
          <nav className="flex gap-4 text-sm">
            {/* Cart icon and login button */}
            <div className="flex items-center gap-2">
              {customerOrganizationSlug && !isModifying && !isPreOrderLocked && (
                <Button
                  onClick={handleExitOrgScope}
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs border-white/20 text-white hover:bg-white/10"
                  title={t("customerScope.organizationMode.exit", {
                    defaultValue: "Exit organization mode",
                  })}
                >
                  <Icon path={mdiCloseCircle} size={0.5} className="mr-1" />
                  {t("customerScope.organizationMode.exit", { defaultValue: "Exit" })}
                </Button>
              )}
              {/* Exit Modification Mode Button - Only show when modifying */}
              {isModifying && (
                <Button
                  onClick={handleExitModification}
                  variant="destructive"
                  size="sm"
                  className="h-8 px-3 text-xs bg-red-600 hover:bg-red-700 text-white"
                  title={
                    sessionStorage.getItem("modifyingOrderId")
                      ? t("orders.modification.exit", {
                          defaultValue: "Exit order editing and clear cart",
                        })
                      : t("reservations.myReservations.modification.exit") ||
                        "Exit modification mode and clear cart"
                  }
                >
                  <Icon path={mdiCloseCircle} size={0.50} className="mr-1" />
                  {sessionStorage.getItem("modifyingOrderId")
                    ? t("orders.modification.exit", { defaultValue: "Cancel Editing" })
                    : t("reservations.myReservations.modification.exit") || "Cancel Editing"}
                </Button>
              )}
              {/* Exit Pre-order Lock Button - Only show when pre-order is locked */}
              {isPreOrderLocked && (
                <Button
                  onClick={handleExitPreOrder}
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs border-pink-500/50 text-pink-400 hover:bg-pink-500/10 hover:text-pink-300"
                  title={t("reservations.booking.cancelReservationHint") || "Cancel reservation and unlock branch"}
                >
                  <Icon path={mdiCloseCircle} size={0.50} className="mr-1" />
                  {t("common.cancel") || "Cancel"}
                </Button>
              )}
              {/* Cart icon */}
              <Link
                to="/cart"
                className="relative rounded-full bg-gradient-to-r from-pink-500 to-rose-500 p-2 text-white shadow-lg shadow-rose-500/30 hover:from-pink-400 hover:to-rose-400 transition-all duration-200 hover:scale-105"
                title="Shopping Cart"
              >
                <Icon path={mdiCart} size={0.67} />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white text-xs font-bold text-pink-500 flex items-center justify-center animate-pulse">
                    {itemCount}
                  </span>
                )}
              </Link>
              {/* Language Switcher */}
              <LanguageSwitcher />
              {/* Login button */}
              <LoginButton />
            </div>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main
        className={
          isScopePage && isMobile
            ? "w-full max-w-none flex-1 px-0 pt-0 pb-20"
            : "mx-auto w-full max-w-screen-sm flex-1 px-4 pb-20 pt-4"
        }
      >
        {isSettingsLoading ? (
          <div className="flex h-full items-center justify-center py-16">
            <LoadingSpinner message={t("appStatus.loading")} />
          </div>
        ) : isAppUnavailable && !isScopePage && !isHomePage ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 py-10">
            <div className="w-full max-w-xl space-y-3">
              <Button
                variant="outline"
                className="w-full justify-center border-emerald-400/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 hover:border-emerald-300/70"
                onClick={() => navigate("/scope")}
              >
                {t("home.changeServiceOrAddress", { defaultValue: "Change service / address" })}
              </Button>

              <div className="w-full">
                <BranchSwitcher variant="carousel" showCarouselHeader={false} />
              </div>
            </div>

            <div className="w-full max-w-xl">
              <AppStatusNotice status={appStatus} className="w-full" />
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <FloatingCartActions />

      {/* Bottom Nav - mobile and desktop */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-neutral-900/95 text-white backdrop-blur">
        <div className="mx-auto grid max-w-screen-sm grid-cols-4">
          <Link
            to="/scope"
            className={`flex flex-col items-center py-2 text-xs transition-colors ${
              location.pathname === "/" || location.pathname === "/scope"
                ? "bg-pink-500/20 text-white rounded-lg mx-1"
                : "text-neutral-200 hover:text-white"
            }`}
          >
            <Icon
              path={mdiHome}
              size={0.83}
              className={`mb-1 ${
                location.pathname === "/" || location.pathname === "/scope" ? "text-pink-400" : "text-pink-500"
              }`}
            />
            {t("common.home", { defaultValue: "Home" })}
          </Link>
          {isSignedIn && (
            <Link
              to="/favorites"
              className={`flex flex-col items-center py-2 text-xs transition-colors ${
                location.pathname === "/favorites"
                  ? "bg-pink-500/20 text-white rounded-lg mx-1"
                  : "text-neutral-200 hover:text-white"
              }`}
            >
              <Icon
                path={mdiHeart}
                size={0.83}
                className={`mb-1 ${
                  location.pathname === "/favorites"
                    ? "text-pink-400"
                    : "text-pink-500"
                }`}
              />
              {t("common.favorites", { defaultValue: "Favorites" })}
            </Link>
          )}
          <Link
            to="/menu"
            onClick={(e) => {
              if (location.pathname === "/" || location.pathname === "/scope" || isAppUnavailable) e.preventDefault();
            }}
            className={`flex flex-col items-center py-2 text-xs transition-colors ${
              location.pathname === "/" || location.pathname === "/scope" || isAppUnavailable
                ? "pointer-events-none opacity-40"
                : location.pathname === "/menu"
                ? "bg-pink-500/20 text-white rounded-lg mx-1"
                : "text-neutral-200 hover:text-white"
            }`}
          >
            <Icon
              path={mdiSilverwareForkKnife}
              size={0.83}
              className={`mb-1 ${
                location.pathname === "/menu"
                  ? "text-pink-400"
                  : "text-pink-500"
              }`}
            />
            {t("common.menu", { defaultValue: "Menu" })}
          </Link>
          <Link
            to="/orders"
            onClick={(e) => {
              if (location.pathname === "/" || location.pathname === "/scope") e.preventDefault();
            }}
            className={`relative flex flex-col items-center py-2 text-xs transition-colors ${
              location.pathname === "/" || location.pathname === "/scope"
                ? "pointer-events-none opacity-40"
                : location.pathname === "/orders"
                ? "bg-pink-500/20 text-white rounded-lg mx-1"
                : "text-neutral-200 hover:text-white"
            }`}
          >
            <Icon
              path={mdiShopping}
              size={0.83}
              className={`mb-1 ${
                location.pathname === "/orders"
                  ? "text-pink-400"
                  : "text-pink-500"
              }`}
            />
            {t("common.myOrders", { defaultValue: "My Orders" })}
            {unseenStatusChangesCount > 0 && (
              <span className="absolute top-0 right-2 h-4 w-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unseenStatusChangesCount > 9 ? "9+" : unseenStatusChangesCount}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "linear-gradient(135deg, #1a1a1a 0%, #262626 100%)",
            color: "#ffffff",
            border: "1px solid #404040",
            borderRadius: "12px",
            boxShadow:
              "0 10px 25px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(236, 72, 153, 0.1)",
            backdropFilter: "blur(10px)",
          },
          className: "toast-notification",
        }}
        richColors
        closeButton
        expand
        duration={4000}
      />

      {/* Push Notification Prompt */}
      <PushNotificationPrompt />
    </div>
  );
}

export default App;
