// Service Worker for Push Notifications
const API_BASE_URL = self.location.origin.includes("localhost")
  ? "http://localhost:3001"
  : self.location.origin.replace(/\/$/, "");

// Listen for push events
self.addEventListener("push", (event) => {
  let notificationData = {
    title: "New Notification",
    body: "You have a new notification",
    icon: "/NextFoody.png",
    badge: "/NextFoody.png",
  };

  if (event.data) {
    try {
      const data = event.data.json();
      // Ensure body is set correctly - use only the provided body, don't combine with title
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body, // Use body directly, no prepending
        icon: data.icon || notificationData.icon,
        image: data.image || undefined,
        badge: data.badge || notificationData.badge,
        tag: data.tag || undefined,
        data: data.data || {},
        actions: data.actions || [],
      };
    } catch (e) {
      console.error("Error parsing push data:", e);
      // If parsing fails, use the text directly as body (not combined with anything)
      notificationData.body = event.data.text();
    }
  }

  const notificationOptions = {
    ...notificationData,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title,
      notificationOptions
    )
  );
});

// Listen for notification click events
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const notificationId = notificationData.notificationId;
  const actionUrl = notificationData.actionUrl || notificationData.url;

  // Track click if we have notificationId
  if (notificationId) {
    // Try to get subscription to track click
    self.registration.pushManager
      .getSubscription()
      .then((subscription) => {
        if (subscription) {
          // Send endpoint to backend, which will find the subscription
          fetch(`${API_BASE_URL}/api/push-notifications/track-click`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              notificationId,
              endpoint: subscription.endpoint,
            }),
          }).catch((err) => {
            console.error("Error tracking click:", err);
          });
        }
      })
      .catch((err) => {
        console.error("Error getting subscription:", err);
      });
  }

  // Handle action button clicks
  if (event.action === "view" || (!event.action && actionUrl)) {
    // Open or focus the app window
    event.waitUntil(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          // Check if there's already a window open with the action URL
          const urlToOpen = actionUrl.startsWith("http")
            ? actionUrl
            : `${self.location.origin}${actionUrl}`;

          for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            if (client.url === urlToOpen && "focus" in client) {
              return client.focus();
            }
          }
          // If no window found, open a new one
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  } else {
    // Default: open the app
    event.waitUntil(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            if ("focus" in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(self.location.origin);
          }
        })
    );
  }
});

// Listen for notification close events (optional)
self.addEventListener("notificationclose", (event) => {
  // Can track when user dismisses notification without clicking
});

// Skip waiting and activate immediately (optional)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
