import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-expo";
import SocketService from "@/src/services/socketService";

interface WebSocketContextType {
  isConnected: boolean;
  socketService: SocketService;
  subscribe: (event: string, callback: (...args: any[]) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined
);

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return context;
};

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const { isSignedIn, getToken } = useAuth();
  const socketService = SocketService.getInstance();
  const [isConnected, setIsConnected] = useState(false);
  const eventHandlersRef = useRef<Map<string, Set<(...args: any[]) => void>>>(
    new Map()
  );
  const connectionInitializedRef = useRef(false);

  // Initialize connection when user signs in
  useEffect(() => {
    if (!isSignedIn) {
      // Disconnect if user signs out
      socketService.disconnect();
      setIsConnected(false);
      connectionInitializedRef.current = false;
      return;
    }

    if (connectionInitializedRef.current) return;
    connectionInitializedRef.current = true;

    const initializeConnection = async () => {
      try {
        const token = await getToken();
        await socketService.connect(token || undefined);
        setIsConnected(true);
      } catch (error) {
        console.error("❌ WebSocket: Connection error:", error);
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
          eventHandlersRef.current.forEach((handlers, event) => {
            handlers.forEach((handler) => {
              socketService.off(event, handler);
              socketService.on(event, handler);
            });
          });
        });

        socket.on("disconnect", () => {
          setIsConnected(false);
        });

        socket.on("reconnect", () => {
          setIsConnected(true);
          // Re-register all handlers on reconnect
          eventHandlersRef.current.forEach((handlers, event) => {
            handlers.forEach((handler) => {
              socketService.off(event, handler);
              socketService.on(event, handler);
            });
          });
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
  }, [isSignedIn, getToken]);

  // Global listener for order status changes - shows toast notifications
  // This is handled by GlobalOrderStatusListener component to avoid circular dependency

  // Subscribe function with automatic cleanup
  const subscribe = (
    event: string,
    callback: (...args: any[]) => void
  ): (() => void) => {
    // Add to handlers map
    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, new Set());
    }
    eventHandlersRef.current.get(event)!.add(callback);

    // Register with socket service
    socketService.on(event, callback);

    // Return unsubscribe function
    return () => {
      // Remove from handlers map
      const handlers = eventHandlersRef.current.get(event);
      if (handlers) {
        handlers.delete(callback);
        if (handlers.size === 0) {
          eventHandlersRef.current.delete(event);
        }
      }

      // Remove from socket service
      socketService.off(event, callback);
    };
  };

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        socketService,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};
