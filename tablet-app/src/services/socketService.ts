import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { API_BASE_URL } from "@/src/services/apiService";

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

  public async connect(token?: string): Promise<void> {
    if (this.socket?.connected && this.currentToken === token) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.socket?.connected && this.currentToken !== token) {
      this.disconnect();
    }

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
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      const apiUrl = API_BASE_URL;

      const isProduction = apiUrl.startsWith("https://");

      this.socket = io(apiUrl, {
        path: "/socket.io/",
        transports: isProduction ? ["polling", "websocket"] : ["websocket", "polling"],
        upgrade: true,
        rememberUpgrade: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
        auth: token ? { token } : undefined,
        query: token ? { token } : undefined,
        forceNew: true,
        withCredentials: false,
      });

      if (!this.socket) {
        reject(new Error("Failed to create socket connection"));
        return;
      }

      const onConnected = () => {
        this.isConnected = true;
        this.socket?.emit("join-admin-room");
        this.socket?.emit("join-user-room");
        this._registerQueuedListeners();
      };

      let connectionResolved = false;
      let connectTimeout: ReturnType<typeof setTimeout>;
      let checkConnectionInterval: ReturnType<typeof setInterval>;

      connectTimeout = setTimeout(() => {
        if (!connectionResolved) {
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          const isActuallyConnected = this.socket?.connected || false;
          if (!isActuallyConnected) {
            reject(new Error(`Connection timeout: Unable to connect to ${apiUrl}`));
          } else {
            onConnected();
            resolve();
          }
        }
      }, 20000);

      checkConnectionInterval = setInterval(() => {
        if (this.socket?.connected && !connectionResolved) {
          clearTimeout(connectTimeout);
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          onConnected();
          resolve();
        }
      }, 500);

      this.socket.on("connect", () => {
        onConnected();

        if (!connectionResolved) {
          clearTimeout(connectTimeout);
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          resolve();
        }
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;
        if (reason === "io server disconnect" && this.socket) {
          this.socket.connect();
        }
      });

      this.socket.on("connect_error", (error) => {
        if (!connectionResolved) {
          clearTimeout(connectTimeout);
          clearInterval(checkConnectionInterval);
          connectionResolved = true;
          this.isConnected = false;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`WebSocket connection warning: ${errorMessage}`);
          // Resolve instead of reject to treat as warning, not error
          resolve();
        }
      });

      this.socket.on("reconnect", () => {
        onConnected();
      });

      this.socket.io?.engine?.on("upgrade", () => {
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

  public on(event: string, callback: EventCallback): void {
    if (this.socket && this.socket.connected) {
      this.socket.on(event, callback);
    } else {
      this.queuedListeners.push({ event, callback });
    }
  }

  public off(event: string, callback?: EventCallback): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.removeAllListeners(event);
      }
    }

    if (callback) {
      this.queuedListeners = this.queuedListeners.filter(
        (listener) => !(listener.event === event && listener.callback === callback)
      );
    } else {
      this.queuedListeners = this.queuedListeners.filter((listener) => listener.event !== event);
    }
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getIsConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

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

  public emit(event: string, ...args: any[]): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, ...args);
    }
  }
}

export default SocketService;
