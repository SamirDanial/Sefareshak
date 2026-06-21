// Import socket.io-client using the proper package exports
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import Constants from "expo-constants";

type EventCallback = (...args: any[]) => void;

interface QueuedListener {
  event: string;
  callback: EventCallback;
}

class SocketService {
  private static instance: SocketService;
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private queuedListeners: QueuedListener[] = [];
  private currentToken: string | undefined = undefined;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /**
   * Connects to the WebSocket server if not already connected.
   * Uses a promise to prevent race conditions from multiple components.
   */
  public async connect(token?: string): Promise<void> {
    // If already connected and using same token, return immediately
    if (this.socket?.connected && this.currentToken === token) {
      return;
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // If connected but token changed, need to reconnect
    if (this.socket?.connected && this.currentToken !== token) {
      this.disconnect();
    }

    // Start new connection
    this.connectionPromise = this._establishConnection(token);
    this.currentToken = token;

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private _establishConnection(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up existing socket if any
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      // Get API URL from environment or app.json config
      // Try expo-constants first (from app.json extra), then fallback to process.env
      // In development, default to localhost if nothing is set
      const apiUrl =
        Constants.expoConfig?.extra?.apiBaseUrl ||
        process.env.EXPO_PUBLIC_API_BASE_URL ||
        (__DEV__ ? "http://localhost:3001" : "https://nextfoody.com");

      // Determine if we're in production (HTTPS)
      const isProduction = apiUrl.startsWith("https://");

      // Socket.IO configuration optimized for production HTTPS
      // In production, try polling first (more reliable), then upgrade to websocket
      // If upgrade causes issues, you can disable it by setting upgrade: false
      this.socket = io(apiUrl, {
        path: "/socket.io/", // Explicit path for Socket.IO
        transports: isProduction
          ? ["polling", "websocket"]
          : ["websocket", "polling"], // Try polling first in production (more reliable)
        upgrade: true, // Allow upgrade from polling to websocket
        rememberUpgrade: false, // Don't remember upgrade preference (can cause issues)
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000, // 20 second connection timeout
        auth: token ? { token } : undefined,
        query: token ? { token } : undefined, // Also send token in query for compatibility
        forceNew: true, // Force new connection to avoid reusing stale connections
        // For mobile apps, don't send origin header
        withCredentials: false,
      });

      // Socket.IO automatically handles HTTPS/WSS in React Native, no need for secure option

      if (!this.socket) {
        reject(new Error("Failed to create socket connection"));
        return;
      }

      let connectionResolved = false;
      let connectTimeout: ReturnType<typeof setTimeout>;
      let checkConnectionInterval: ReturnType<typeof setInterval>;

      // Set up timeout first
      connectTimeout = setTimeout(() => {
        if (!connectionResolved) {
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          const isActuallyConnected = this.socket?.connected || false;
          console.error(
            `❌ WebSocket connection timeout after 20 seconds to ${apiUrl}`,
            `Socket connected state: ${isActuallyConnected}`
          );
          if (!isActuallyConnected) {
            reject(
              new Error(`Connection timeout: Unable to connect to ${apiUrl}`)
            );
          } else {
            // Socket is actually connected, resolve instead
            this.isConnected = true;
            this.socket?.emit("join-user-room");
            this._registerQueuedListeners();
            resolve();
          }
        }
      }, 20000); // 20 second timeout

      // Check connection state periodically and resolve if connected
      // This helps catch cases where connect event doesn't fire but socket is actually connected
      checkConnectionInterval = setInterval(() => {
        if (this.socket?.connected && !connectionResolved) {
          clearTimeout(connectTimeout);
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          this.isConnected = true;
          const transportName =
            this.socket?.io?.engine?.transport?.name || "unknown";

          // Join admin room (for admins to receive admin notifications)
          this.socket?.emit("join-admin-room");

          // Join user room (for all authenticated users)
          this.socket?.emit("join-user-room");

          // Register all queued listeners
          this._registerQueuedListeners();

          resolve();
        }
      }, 500); // Check every 500ms

      this.socket.on("connect", () => {
        if (!connectionResolved) {
          clearTimeout(connectTimeout);
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          this.isConnected = true;
          const transportName =
            this.socket?.io?.engine?.transport?.name || "unknown";

          // Join admin room (for admins to receive admin notifications)
          this.socket?.emit("join-admin-room");

          // Join user room (for all authenticated users)
          this.socket?.emit("join-user-room");

          // Register all queued listeners
          this._registerQueuedListeners();

          resolve();
        }
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;

        // Auto-reconnect handled by socket.io
        if (reason === "io server disconnect" && this.socket) {
          // Server disconnected, need to reconnect manually
          this.socket.connect();
        }
      });

      this.socket.on("connect_error", (error) => {
        if (!connectionResolved) {
          clearTimeout(connectTimeout);
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          this.isConnected = false;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            "❌ WebSocket connection error:",
            errorMessage,
            "URL:",
            apiUrl
          );
          reject(new Error(`Connection failed: ${errorMessage}`));
        }
      });

      this.socket.on("reconnect", () => {
        this.isConnected = true;
        // Rejoin admin room on reconnect (for admins to receive admin notifications)
        this.socket?.emit("join-admin-room");
        // Rejoin user room on reconnect
        this.socket?.emit("join-user-room");
      });

      // Log transport upgrades
      this.socket.io?.engine?.on("upgrade", () => {
        const transportName =
          this.socket?.io?.engine?.transport?.name || "unknown";
      });
    });
  }

  private _registerQueuedListeners(): void {
    if (this.queuedListeners.length === 0 || !this.socket) return;

    this.queuedListeners.forEach(({ event, callback }) => {
      this.socket!.on(event, callback);
    });
    this.queuedListeners = [];
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentToken = undefined;
      this.connectionPromise = null;
    }
  }

  /**
   * Registers an event listener.
   * If socket is not ready, queues the listener to be registered when connected.
   */
  public on(event: string, callback: EventCallback): void {
    if (this.socket && this.socket.connected) {
      this.socket.on(event, callback);
    } else {
      // Queue listener if socket not ready
      this.queuedListeners.push({ event, callback });
    }
  }

  /**
   * Removes an event listener.
   * Also removes from queue if it was queued.
   * If no callback is provided, removes ALL listeners for that event.
   */
  public off(event: string, callback?: EventCallback): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.removeAllListeners(event);
      }
    }

    // Remove from queue if it exists
    if (callback) {
      this.queuedListeners = this.queuedListeners.filter(
        (listener) =>
          !(listener.event === event && listener.callback === callback)
      );
    } else {
      this.queuedListeners = this.queuedListeners.filter(
        (listener) => listener.event !== event
      );
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getIsConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Waits for the socket to be connected before resolving.
   * Useful for ensuring connection before emitting events.
   */
  public async waitForConnection(): Promise<void> {
    if (this.getIsConnected()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 10000);

      const checkConnection = () => {
        if (this.getIsConnected()) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  /**
   * Emits an event to the server.
   */
  public emit(event: string, ...args: any[]): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, ...args);
    } else {
      console.warn(`⚠️ Cannot emit "${event}": Socket not connected`);
    }
  }
}

export default SocketService;
