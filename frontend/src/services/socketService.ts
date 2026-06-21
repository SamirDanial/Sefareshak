import { io, Socket } from "socket.io-client";

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

      // Multi-domain safe default:
      // - In the browser, connect to the same origin as the currently loaded site.
      // - Allow explicit override via VITE_SOCKET_URL (if you ever need a dedicated WS host).
      // - Fallback to VITE_API_URL only for non-browser environments.
      const socketUrl =
        typeof window !== "undefined"
          ? (import.meta.env.VITE_SOCKET_URL || window.location.origin)
          : (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "http://localhost:3001");

      this.socket = io(socketUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        auth: token ? { token } : undefined,
        query: token ? { token } : undefined, // Also send token in query for compatibility
      });

      const connectTimeout = setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error("Connection timeout"));
        }
      }, 10000); // 10 second timeout

      this.socket.on("connect", () => {
        clearTimeout(connectTimeout);
        this.isConnected = true;

        // Join admin room (for admins)
        this.socket?.emit("join-admin-room");

        // Join user room (for all authenticated users)
        this.socket?.emit("join-user-room");

        // Register all queued listeners
        this._registerQueuedListeners();

        resolve();
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;

        // Auto-reconnect handled by socket.io
        if (reason === "io server disconnect") {
          // Server disconnected, need to reconnect manually
          this.socket?.connect();
        }
      });

      this.socket.on("connect_error", (error) => {
        clearTimeout(connectTimeout);
        this.isConnected = false;
        reject(error);
      });

      this.socket.on("reconnect", () => {
        this.isConnected = true;
        this.socket?.emit("join-admin-room");
        this.socket?.emit("join-user-room");
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
}

export default SocketService;
