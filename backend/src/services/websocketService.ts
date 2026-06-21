import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import { verifyToken } from "@clerk/clerk-sdk-node";
import DatabaseSingleton from "../config/database";

class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }

    return WebSocketService.instance;
  }

  // Emit kitchen ticket created to admin room
  public emitKitchenTicketCreated(ticket: any): void {
    if (!this.io) return;

    (async () => {
      const organizationId = await this.resolveOrganizationIdFromBranchId(ticket?.branchId);
      this.io?.to("admin-room").emit("kitchen-ticket-created", {
        ticket,
        organizationId: organizationId || undefined,
      });
    })();
  }

  // Emit kitchen ticket updated to admin room
  public emitKitchenTicketUpdated(ticket: any): void {
    if (!this.io) return;

    (async () => {
      const organizationId = await this.resolveOrganizationIdFromBranchId(ticket?.branchId);
      this.io?.to("admin-room").emit("kitchen-ticket-updated", {
        ticket,
        organizationId: organizationId || undefined,
      });
    })();
  }

  public initialize(server: HTTPServer): void {
    // Socket.IO CORS configuration
    // When frontend is served from backend (same origin), allow all origins or use current origin
    // Otherwise, use configured FRONTEND_URL
    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

    // CORS origin configuration
    // For production: Allow all origins (including mobile apps which don't send Origin header)
    // For development: Use specific frontend URL or allow localhost
    let corsOrigin:
      | string
      | boolean
      | ((
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void
        ) => void);

    // Allow all origins: mobile apps don't send an Origin header, and auth
    // is enforced by the token middleware below. NODE_ENV is intentionally
    // NOT used here so the same config works on staging/production servers
    // that may not have NODE_ENV=production set.
    corsOrigin = (
      _origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      callback(null, true);
    };

    void frontendUrl;
    void backendUrl;

    this.io = new SocketIOServer(server, {
      cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
        credentials: false, // Set to false for mobile apps compatibility
        allowedHeaders: ["Authorization", "Content-Type"],
      },
      transports: ["websocket", "polling"], // Support both transports
      allowEIO3: true, // Allow Engine.IO v3 clients for compatibility
      // Add path if needed (default is /socket.io/)
      path: "/socket.io/",
      // Add connection state recovery for better reliability
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: true,
      },
    });

    // Authentication middleware for Socket.IO
    this.io.use(async (socket: Socket, next) => {
      try {
        const origin = socket.handshake.headers.origin || "no origin";

        const token = socket.handshake.auth?.token;
        if (!token) {
          // Allow connection without token, but user won't be able to join user rooms
          return next();
        }

        const issuer = process.env.CLERK_ISSUER_URL;
        if (!issuer) {
          return next();
        }

        try {
          const payload = await verifyToken(token, { issuer });
          // Attach userId to socket for later use
          (socket as any).userId = payload.sub;
        } catch (verifyError) {
          // Allow connection even if token verification fails (for backwards compatibility)
        }

        next();
      } catch (error) {
        console.error("WebSocket auth middleware error:", error);
        next(); // Allow connection anyway
      }
    });

    this.io.on("connection", (socket: Socket) => {
      const origin =
        socket.handshake.headers.origin || "no origin (mobile app?)";
      const userAgent = socket.handshake.headers["user-agent"] || "unknown";


      // Join admin room for real-time notifications (admin only, verified in client)
      socket.on("join-admin-room", () => {
        socket.join("admin-room");
        console.log("Admin joined admin-room:", socket.id);
      });

      // Join user-specific room for order status updates
      socket.on("join-user-room", async () => {
        const userId = (socket as any).userId;
        if (userId) {
          // Get database user ID from Clerk ID
          try {
            const db = DatabaseSingleton.getInstance();
            const user = await db.getPrisma().user.findUnique({
              where: { clerkId: userId },
              select: { id: true },
            });

            if (user) {
              const userRoom = `user-${user.id}`;
              socket.join(userRoom);
              console.log(
                `✅ User ${user.id} (Clerk: ${userId}) joined user room: ${userRoom}`
              );
            }
          } catch (error) {
            console.error("Error joining user room:", error);
          }
        }
      });

      socket.on("disconnect", (reason) => {
        console.log("❌ Client disconnected:", {
          socketId: socket.id,
          reason: reason,
        });
      });

      socket.on("error", (error) => {
        console.error("❌ Socket error:", {
          socketId: socket.id,
          error: error.message || error,
        });
      });
    });
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  private async resolveOrganizationIdFromBranchId(
    branchId: string | null | undefined
  ): Promise<string | null> {
    try {
      if (!branchId) return null;
      const db = DatabaseSingleton.getInstance();
      const branch = await db
        .getPrisma()
        .branch.findUnique({ where: { id: branchId }, select: { organizationId: true } });
      return branch?.organizationId || null;
    } catch {
      return null;
    }
  }

  private async resolveOrganizationIdFromOrder(order: any): Promise<string | null> {
    try {
      const direct =
        order?.organizationId ||
        order?.branch?.organizationId ||
        order?.notification?.order?.branch?.organizationId ||
        order?.order?.branch?.organizationId;
      if (direct) return String(direct);
      return await this.resolveOrganizationIdFromBranchId(order?.branchId);
    } catch {
      return null;
    }
  }

  private async resolveOrganizationIdFromReservation(
    reservation: any
  ): Promise<string | null> {
    try {
      const direct =
        reservation?.organizationId ||
        reservation?.branch?.organizationId ||
        reservation?.notification?.reservation?.branch?.organizationId ||
        reservation?.reservation?.branch?.organizationId;
      if (direct) return String(direct);
      return await this.resolveOrganizationIdFromBranchId(reservation?.branchId);
    } catch {
      return null;
    }
  }

  // Emit new order notification to admin room
  public emitNewOrder(notification: any, order: any): void {
    if (this.io) {
      (async () => {
        const organizationId =
          (notification as any)?.order?.branch?.organizationId ||
          (notification as any)?.order?.organizationId ||
          (order as any)?.branch?.organizationId ||
          (order as any)?.organizationId ||
          (await this.resolveOrganizationIdFromOrder(order));

        this.io?.to("admin-room").emit("new-order", {
          notification,
          order,
          organizationId: organizationId || undefined,
        });
      })();
    }
  }

  // Emit order update notification to admin room (when order is merged/updated)
  public emitOrderUpdate(
    notification: any,
    order: any,
    newItems?: any[]
  ): void {
    if (this.io) {
      (async () => {
        const organizationId =
          (notification as any)?.order?.branch?.organizationId ||
          (notification as any)?.order?.organizationId ||
          (order as any)?.branch?.organizationId ||
          (order as any)?.organizationId ||
          (await this.resolveOrganizationIdFromOrder(order));

        this.io?.to("admin-room").emit("order-updated", {
          notification,
          order,
          newItems: newItems || [],
          isMergeRequest: !!newItems && newItems.length > 0,
          organizationId: organizationId || undefined,
        });
      })();
    }
  }

  // Emit new reservation notification to admin room
  public emitNewReservation(notification: any, reservation: any): void {
    if (this.io) {
      (async () => {
        const organizationId =
          (notification as any)?.reservation?.branch?.organizationId ||
          (notification as any)?.reservation?.organizationId ||
          (reservation as any)?.branch?.organizationId ||
          (reservation as any)?.organizationId ||
          (await this.resolveOrganizationIdFromReservation(reservation));

        this.io?.to("admin-room").emit("new-reservation", {
          notification,
          reservation,
          organizationId: organizationId || undefined,
        });
      })();
    }
  }

  // Emit reservation modification notification to admin room
  public emitReservationModified(notification: any, reservation: any): void {
    if (!this.io) {
      const errorMsg = "[WebSocketService] WebSocket server not initialized - cannot emit reservation-modified";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    try {
      (async () => {
        const organizationId =
          (notification as any)?.reservation?.branch?.organizationId ||
          (notification as any)?.reservation?.organizationId ||
          (reservation as any)?.branch?.organizationId ||
          (reservation as any)?.organizationId ||
          (await this.resolveOrganizationIdFromReservation(reservation));

        const eventData = {
          notification,
          reservation,
          organizationId: organizationId || undefined,
        };
        this.io?.to("admin-room").emit("reservation-modified", eventData);
      })();
    } catch (error) {
      console.error(`[WebSocketService] Error emitting reservation-modified:`, error);
      throw error;
    }
  }

  // Emit notification update (when notification is seen)
  public emitNotificationUpdate(notification: any): void {
    if (this.io) {
      this.io.to("admin-room").emit("notification-updated", notification);
    }
  }

  // Emit when a notification is marked as seen
  public emitNotificationSeen(data: {
    orderId?: string;
    reservationId?: string;
    notificationId: string;
    isSeen: boolean;
    seenAt: Date | null;
  }): void {
    if (this.io) {
      this.io.to("admin-room").emit("notification-seen", data);
    }
  }

  // Emit when all notifications are marked as seen
  public emitAllNotificationsSeen(data: { count: number; seenAt: Date }): void {
    if (this.io) {
      this.io.to("admin-room").emit("all-notifications-seen", data);
    }
  }

  // Emit order status change to specific user (order owner)
  public emitOrderStatusChange(userId: string, order: any): void {
    if (this.io) {
      const userRoom = `user-${userId}`;
      const eventData = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        updatedAt: order.updatedAt,
      };

      // Get sockets in the room to verify
      const room = this.io.sockets.adapter.rooms.get(userRoom);
      const socketCount = room ? room.size : 0;

      this.io.to(userRoom).emit("order-status-changed", eventData);

      if (socketCount === 0) {
        console.warn(
          `⚠️ No sockets in room ${userRoom} - user may not be connected or room join failed`
        );
      }
    } else {
      console.error("❌ WebSocket server not initialized");
    }
  }

  // Emit reservation status change to specific user (reservation owner)
  public emitReservationStatusChange(userId: string, reservation: any): void {
    if (this.io) {
      const userRoom = `user-${userId}`;
      const eventData = {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        status: reservation.status,
        updatedAt: reservation.updatedAt,
      };

      // Get sockets in the room to verify
      const room = this.io.sockets.adapter.rooms.get(userRoom);
      const socketCount = room ? room.size : 0;

      this.io.to(userRoom).emit("reservation-status-changed", eventData);

      if (socketCount === 0) {
        console.warn(
          `⚠️ No sockets in room ${userRoom} - user may not be connected or room join failed`
        );
      }
    } else {
      console.error("❌ WebSocket server not initialized");
    }
  }

  // Emit reservation update to admin room (for real-time updates in admin panel)
  public emitReservationUpdate(reservation: any): void {
    if (this.io) {
      this.io.to("admin-room").emit("reservation-updated", {
        reservation,
      });
    }
  }
}

export default WebSocketService;
