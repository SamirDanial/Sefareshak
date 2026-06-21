import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import SocketService from "../services/socketService";

interface WebSocketEventHandlers {
  [event: string]: Set<(...args: any[]) => void>;
}

interface AdminWebSocketContextType {
  isConnected: boolean;
  subscribe: (event: string, handler: (...args: any[]) => void) => () => void;
  emit: (event: string, data?: any) => void;
}

const AdminWebSocketContext = createContext<AdminWebSocketContextType | null>(
  null
);

// Debounce helper
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export const AdminWebSocketProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { getToken } = useAuth();
  const socketService = SocketService.getInstance();
  const [isConnected, setIsConnected] = useState(false);
  const eventHandlersRef = useRef<WebSocketEventHandlers>({});
  const connectionInitializedRef = useRef(false);

  // Initialize connection once
  useEffect(() => {
    if (connectionInitializedRef.current) return;
    connectionInitializedRef.current = true;

    const initializeConnection = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
        setIsConnected(true);
      } catch (error) {
        console.error("❌ AdminWebSocket: Connection error:", error);
        setIsConnected(false);
      }
    };

    initializeConnection();

    // Monitor connection status periodically
    const checkConnection = () => {
      setIsConnected(socketService.getIsConnected());
    };

    const interval = setInterval(checkConnection, 1000);

    // Setup socket event listeners after initial connection
    const setupSocketListeners = () => {
      const socket = socketService.getSocket();
      if (socket) {
        // Remove old listeners to prevent duplicates
        socket.off("connect");
        socket.off("disconnect");
        socket.off("reconnect");

        socket.on("connect", () => {
          setIsConnected(true);
          // Re-register all handlers on reconnect
          Object.entries(eventHandlersRef.current).forEach(
            ([event, handlers]) => {
              handlers.forEach((handler) => {
                socketService.off(event, handler);
                socketService.on(event, handler);
              });
            }
          );
        });

        socket.on("disconnect", () => {
          setIsConnected(false);
        });

        socket.on("reconnect", () => {
          setIsConnected(true);
          // Re-register all handlers on reconnect
          Object.entries(eventHandlersRef.current).forEach(
            ([event, handlers]) => {
              handlers.forEach((handler) => {
                socketService.off(event, handler);
                socketService.on(event, handler);
              });
            }
          );
        });
      }
    };

    // Setup listeners after a short delay to ensure socket is ready
    const setupTimeout = setTimeout(setupSocketListeners, 500);

    // Also try to setup immediately if socket is already available
    setupSocketListeners();

    return () => {
      clearInterval(interval);
      clearTimeout(setupTimeout);
      const socket = socketService.getSocket();
      if (socket) {
        socket.off("connect");
        socket.off("disconnect");
        socket.off("reconnect");
      }
    };
  }, [getToken, socketService]);

  // Optimized subscribe function with automatic cleanup
  const subscribe = useCallback(
    (event: string, handler: (...args: any[]) => void): (() => void) => {
      // Create debounced handler for data-heavy events to prevent excessive updates
      const debouncedHandler =
        event === "new-order" || event.includes("update")
          ? debounce(handler, 300) // 300ms debounce for update events
          : handler;

      // Initialize handlers set for this event if it doesn't exist
      if (!eventHandlersRef.current[event]) {
        eventHandlersRef.current[event] = new Set();
      }

      // Add handler to set
      eventHandlersRef.current[event].add(debouncedHandler);

      // Register with socket service
      socketService.on(event, debouncedHandler);

      // Return unsubscribe function
      return () => {
        // Remove from handlers set
        eventHandlersRef.current[event]?.delete(debouncedHandler);

        // If no more handlers for this event, remove from socket
        if (eventHandlersRef.current[event]?.size === 0) {
          delete eventHandlersRef.current[event];
          socketService.off(event, debouncedHandler);
        } else {
          socketService.off(event, debouncedHandler);
        }
      };
    },
    [socketService]
  );

  // Emit function for sending events
  const emit = useCallback(
    (event: string, data?: any) => {
      if (isConnected) {
        socketService.getSocket()?.emit(event, data);
      } else {
        console.warn(`⚠️ AdminWebSocket: Cannot emit ${event} - not connected`);
      }
    },
    [isConnected, socketService]
  );

  const value: AdminWebSocketContextType = {
    isConnected,
    subscribe,
    emit,
  };

  return (
    <AdminWebSocketContext.Provider value={value}>
      {children}
    </AdminWebSocketContext.Provider>
  );
};

export const useAdminWebSocket = (): AdminWebSocketContextType => {
  const context = useContext(AdminWebSocketContext);
  if (!context) {
    throw new Error(
      "useAdminWebSocket must be used within AdminWebSocketProvider"
    );
  }
  return context;
};

